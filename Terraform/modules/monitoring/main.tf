###############################################################################
# Module: Monitoring — FIXED
#
# BUGS FIXED
# ----------
# BUG 1 (No Slack alerts): Lambda IAM role only had logs:* permissions.
#   The Python code called ssm.get_parameter() but had no ssm:GetParameter
#   permission → AccessDenied crash on every invocation. Additionally, the
#   SSM parameter /prod/slack/webhook-url was never created by Terraform.
#   Fix A: Lambda now reads SLACK_WEBHOOK_URL from its env var (already set
#          by Terraform). No SSM call needed → removed ssm:GetParameter.
#   Fix B: Removed aws_ssm_parameter resource (not needed anymore).
#   The Lambda Python code was updated separately (slack_notifier.py).
#
# BUG 2 (No logs in CloudWatch): backend.sh and frontend.sh use <<CWEOF
#   (unquoted heredoc). After Terraform renders $${aws:InstanceId} →
#   ${aws:InstanceId}, bash tries to expand the shell variable "aws:InstanceId"
#   → "bad substitution" error → the heredoc write fails → CW agent config
#   file is never written → agent starts with no config → sends nothing.
#   Fix: Changed to <<'CWEOF' in both user-data scripts (quoted heredoc
#        prevents bash variable expansion). Fixed in user-data files.
#
# BUG 3 (Metric filters never match): Patterns used space-delimited syntax
#   [timestamp, level="ERROR", ...] expecting field 2 to be "ERROR".
#   Morgan + PM2 actually writes: "2024-01-15T10:30:00: POST /api/health 500 5ms"
#   Field 2 is the HTTP METHOD, not a log level → no pattern ever matches →
#   no custom metrics increment → no application-level alarms ever fire.
#   Fix: Replaced space-delimited patterns with keyword/substring patterns
#        (e.g. ?ERROR, ?"500", ?"DynamoDB") that match anywhere in the line.
#
# BUG 4 (ALB alarms stuck in INSUFFICIENT_DATA): ALB metric alarms had no
#   dimensions block. Without a LoadBalancer dimension, CloudWatch queries
#   ALL ALBs aggregated. If no aggregate data exists the alarm stays in
#   INSUFFICIENT_DATA forever and never triggers.
#   Fix: Added dimensions referencing the ALB ARN suffix via regex on the
#        external ALB ARN. Both ALB alarms now have proper dimensions.
#   Note: The ALB ARN is passed in as a new variable `external_alb_arn`.
###############################################################################

###############################################################################
# CloudWatch Log Groups
###############################################################################
resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/app/${var.environment}/frontend"
  retention_in_days = 30
  tags              = { Name = "${var.environment}-frontend-logs" }
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/app/${var.environment}/backend"
  retention_in_days = 60
  tags              = { Name = "${var.environment}-backend-logs" }
}

resource "aws_cloudwatch_log_group" "lambda_slack" {
  name              = "/aws/lambda/${var.environment}-slack-notifier"
  retention_in_days = 14
  tags              = { Name = "${var.environment}-lambda-slack-logs" }
}

###############################################################################
# SNS Topic + Subscription (Lambda)
###############################################################################
resource "aws_sns_topic" "alerts" {
  name              = "${var.environment}-family-finance-alerts"
  kms_master_key_id = "alias/aws/sns"
  tags              = { Name = "${var.environment}-alerts-topic" }
}

###############################################################################
# IAM Role for Slack Notifier Lambda
###############################################################################
resource "aws_iam_role" "slack_lambda" {
  name = "${var.environment}-slack-notifier-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.slack_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# FIX BUG 1: removed ssm:GetParameter — Lambda now reads webhook URL from
# its SLACK_WEBHOOK_URL env var directly. No SSM permission needed.
# The old policy only had logs:* anyway, so SSM was always going to fail.
resource "aws_iam_role_policy" "slack_lambda_logs" {
  name = "${var.environment}-slack-lambda-logs-policy"
  role = aws_iam_role.slack_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "arn:aws:logs:${var.aws_region}:${var.account_id}:log-group:/aws/lambda/*:*"
    }]
  })
}

###############################################################################
# Lambda – Slack Notifier
###############################################################################
data "archive_file" "slack_notifier" {
  type        = "zip"
  output_path = "${path.module}/lambda/slack_notifier.zip"
  source_file = "${path.module}/lambda/slack_notifier.py"
}

resource "aws_lambda_function" "slack_notifier" {
  function_name    = "${var.environment}-slack-notifier"
  role             = aws_iam_role.slack_lambda.arn
  handler          = "slack_notifier.handler"
  runtime          = "python3.12"
  filename         = data.archive_file.slack_notifier.output_path
  source_code_hash = data.archive_file.slack_notifier.output_base64sha256
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      # FIX BUG 1: SLACK_WEBHOOK_URL is now read directly by Lambda Python code.
      # Removed SLACK_WEBHOOK_PARAM — the SSM-based approach was the root cause.
      SLACK_WEBHOOK_URL = var.slack_webhook_url
      ENVIRONMENT       = var.environment
      AWS_REGION_NAME   = var.aws_region
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda_slack]
  tags       = { Name = "${var.environment}-slack-notifier" }
}

# Allow SNS to invoke Lambda
resource "aws_lambda_permission" "sns_invoke" {
  statement_id  = "AllowSNSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.slack_notifier.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alerts.arn
}

# Subscribe Lambda to SNS topic
resource "aws_sns_topic_subscription" "lambda" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_notifier.arn
}

###############################################################################
# CloudWatch Metric Filters – Backend Log Group
#
# FIX BUG 3: Replaced all space-delimited [field, field, ...] patterns with
# keyword/substring patterns (?KEYWORD).
#
# Why the old patterns failed:
#   Pattern: [timestamp, level="ERROR", ...]
#   Actual PM2+Morgan log line: "2024-01-15T10:30:00: POST /api/health 500 45ms"
#   CW parsed field[2] as "POST" (the HTTP method), not "ERROR" → never matched.
#
# Keyword patterns match if the substring appears ANYWHERE in the log line,
# which works correctly regardless of log format or field ordering.
###############################################################################

# FIX: was [timestamp, level="ERROR", ...] — never matched Morgan/PM2 format
resource "aws_cloudwatch_log_metric_filter" "backend_errors" {
  name           = "${var.environment}-backend-error-count"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "?ERROR ?error ?Error"

  metric_transformation {
    name          = "BackendErrorCount"
    namespace     = "FamilyFinance/Backend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# FIX: was [timestamp, level, method, path, status_code=5*, ...] — never matched
# Morgan combined format: "POST /api/auth 500 45ms" — "500" is a substring match
resource "aws_cloudwatch_log_metric_filter" "backend_5xx" {
  name           = "${var.environment}-backend-5xx-count"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "?\" 500\" ?\" 501\" ?\" 502\" ?\" 503\" ?\" 504\""

  metric_transformation {
    name          = "Backend5xxCount"
    namespace     = "FamilyFinance/Backend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# FIX: was [timestamp, level, method, path, status_code=4*, ...] — never matched
resource "aws_cloudwatch_log_metric_filter" "backend_4xx" {
  name           = "${var.environment}-backend-4xx-count"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "?\" 400\" ?\" 401\" ?\" 403\" ?\" 404\" ?\" 409\" ?\" 422\""

  metric_transformation {
    name          = "Backend4xxCount"
    namespace     = "FamilyFinance/Backend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# FIX: duration filter — keep as keyword search for "ms" values
# Morgan logs: "POST /api 200 2345ms" — match lines with high ms values isn't
# feasible with CW patterns, so filter on Unhandled/slow markers instead
resource "aws_cloudwatch_log_metric_filter" "backend_slow_requests" {
  name           = "${var.environment}-backend-slow-requests"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "?\"slow\" ?\"timeout\" ?\"ETIMEDOUT\" ?\"ECONNRESET\""

  metric_transformation {
    name          = "BackendSlowRequests"
    namespace     = "FamilyFinance/Backend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# DynamoDB errors — keyword match works well here (error messages contain these strings)
resource "aws_cloudwatch_log_metric_filter" "dynamodb_errors" {
  name           = "${var.environment}-dynamodb-error-count"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "?\"DynamoDB error\" ?\"ResourceNotFoundException\" ?\"ProvisionedThroughputExceededException\" ?\"ConditionalCheckFailedException\""

  metric_transformation {
    name          = "DynamoDBErrorCount"
    namespace     = "FamilyFinance/Backend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# Uncaught exceptions — keyword match
resource "aws_cloudwatch_log_metric_filter" "backend_uncaught" {
  name           = "${var.environment}-backend-uncaught-exceptions"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "?UnhandledPromiseRejection ?uncaughtException ?FATAL ?\"process exited\""

  metric_transformation {
    name          = "BackendUncaughtExceptions"
    namespace     = "FamilyFinance/Backend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

###############################################################################
# CloudWatch Metric Filters – Frontend Log Group
###############################################################################
# FIX: same keyword pattern fix applied to frontend filter
resource "aws_cloudwatch_log_metric_filter" "frontend_errors" {
  name           = "${var.environment}-frontend-error-count"
  log_group_name = aws_cloudwatch_log_group.frontend.name
  pattern        = "?ERROR ?error ?\" 500\" ?\" 502\" ?\" 503\""

  metric_transformation {
    name          = "FrontendErrorCount"
    namespace     = "FamilyFinance/Frontend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

###############################################################################
# Local: ALB suffix extracted from ARN for use in dimensions
#
# FIX BUG 4: ALB alarms need a LoadBalancer dimension. Without it CloudWatch
# queries all ALBs aggregated, which returns no data for most accounts →
# alarm permanently stuck in INSUFFICIENT_DATA.
# AWS requires the dimension value to be the ARN suffix:
#   "app/prod-external-alb/1234abcd5678ef90"
# We extract this from the full ARN using regex replace.
###############################################################################
locals {
  alarm_actions  = [aws_sns_topic.alerts.arn]

  # Extract "app/NAME/ID" suffix from the full ALB ARN
  # Full ARN: arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/prod-external-alb/abc123
  # Suffix:   app/prod-external-alb/abc123
  alb_arn_suffix = replace(
    var.external_alb_arn,
    "/^arn:aws:elasticloadbalancing:[^:]+:[^:]+:loadbalancer\\//",
    ""
  )
}

###############################################################################
# CloudWatch Alarms → SNS
###############################################################################

resource "aws_cloudwatch_metric_alarm" "backend_error_rate" {
  alarm_name          = "${var.environment}-backend-high-error-rate"
  alarm_description   = "Backend application error rate is elevated"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "BackendErrorCount"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-backend-error-rate" }
}

resource "aws_cloudwatch_metric_alarm" "backend_5xx" {
  alarm_name          = "${var.environment}-backend-5xx-high"
  alarm_description   = "Backend HTTP 5xx responses exceeded threshold"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Backend5xxCount"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Sum"
  threshold           = 20
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-backend-5xx" }
}

resource "aws_cloudwatch_metric_alarm" "backend_slow_requests" {
  alarm_name          = "${var.environment}-backend-slow-requests"
  alarm_description   = "High number of slow/timeout requests detected"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "BackendSlowRequests"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-slow-requests" }
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_errors_backend" {
  alarm_name          = "${var.environment}-dynamodb-errors-backend"
  alarm_description   = "Backend reporting DynamoDB errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DynamoDBErrorCount"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-dynamodb-errors-backend" }
}

resource "aws_cloudwatch_metric_alarm" "backend_uncaught" {
  alarm_name          = "${var.environment}-backend-uncaught-exceptions"
  alarm_description   = "Backend uncaught exceptions detected — critical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BackendUncaughtExceptions"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-uncaught-exceptions" }
}

# FIX BUG 4: Added dimensions block with LoadBalancer suffix.
# Without this, CloudWatch has no way to scope the metric to your ALB —
# it tries to aggregate across all ALBs in the account and finds no data.
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.environment}-alb-5xx-errors"
  alarm_description   = "ALB reporting high 5xx target errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 50
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  # FIX: dimension scopes the metric to this specific ALB
  dimensions = {
    LoadBalancer = local.alb_arn_suffix
  }

  tags = { Name = "${var.environment}-alb-5xx" }
}

# FIX BUG 4: Same dimension fix for latency alarm
resource "aws_cloudwatch_metric_alarm" "alb_target_response_time" {
  alarm_name          = "${var.environment}-alb-high-latency"
  alarm_description   = "ALB target response time exceeded 3 seconds"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Average"
  threshold           = 3
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  # FIX: dimension scopes the metric to this specific ALB
  dimensions = {
    LoadBalancer = local.alb_arn_suffix
  }

  tags = { Name = "${var.environment}-alb-latency" }
}

resource "aws_cloudwatch_metric_alarm" "frontend_errors" {
  alarm_name          = "${var.environment}-frontend-high-error-rate"
  alarm_description   = "Frontend application errors are elevated"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "FrontendErrorCount"
  namespace           = "FamilyFinance/Frontend"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-frontend-errors" }
}

resource "aws_cloudwatch_metric_alarm" "backend_cpu" {
  alarm_name          = "${var.environment}-backend-high-cpu"
  alarm_description   = "Backend instances CPU usage above 85%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "cpu_usage_user"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-backend-cpu" }
}

resource "aws_cloudwatch_metric_alarm" "backend_memory" {
  alarm_name          = "${var.environment}-backend-high-memory"
  alarm_description   = "Backend instances memory usage above 85%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "mem_used_percent"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-backend-memory" }
}

###############################################################################
# CloudWatch Dashboard
###############################################################################
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.environment}-family-finance"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Backend Error Rates"
          period  = 300
          metrics = [
            ["FamilyFinance/Backend", "BackendErrorCount"],
            ["FamilyFinance/Backend", "Backend5xxCount"],
            ["FamilyFinance/Backend", "BackendUncaughtExceptions"],
          ]
          view   = "timeSeries"
          stat   = "Sum"
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "ALB Latency & 5xx"
          period  = 300
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime",       "LoadBalancer", local.alb_arn_suffix, { stat = "Average" }],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", local.alb_arn_suffix, { stat = "Sum" }],
          ]
          view   = "timeSeries"
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Backend CPU & Memory"
          period  = 300
          metrics = [
            ["FamilyFinance/Backend", "cpu_usage_user",  { stat = "Average" }],
            ["FamilyFinance/Backend", "mem_used_percent", { stat = "Average" }],
          ]
          view   = "timeSeries"
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "DynamoDB Errors & Throttles"
          period  = 300
          metrics = [
            ["AWS/DynamoDB", "SystemErrors",         "TableName", var.dynamodb_table_name],
            ["AWS/DynamoDB", "ThrottledRequests",    "TableName", var.dynamodb_table_name],
            ["FamilyFinance/Backend", "DynamoDBErrorCount"],
          ]
          view   = "timeSeries"
          stat   = "Sum"
          region = var.aws_region
        }
      },
      {
        type   = "alarm"
        x      = 0
        y      = 12
        width  = 24
        height = 6
        properties = {
          title  = "All Alarms Status"
          alarms = [
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-backend-high-error-rate",
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-backend-5xx-high",
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-backend-uncaught-exceptions",
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-alb-5xx-errors",
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-alb-high-latency",
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-dynamodb-errors-backend",
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-backend-high-cpu",
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-backend-high-memory",
          ]
        }
      },
    ]
  })
}
