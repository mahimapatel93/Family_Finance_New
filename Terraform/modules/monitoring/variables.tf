###############################################################################
# Module: Monitoring – Variables
# UPDATED: Added external_alb_arn (required for ALB alarm dimensions fix)
###############################################################################

variable "environment" {
  type = string
}

variable "slack_webhook_url" {
  type      = string
  sensitive = true
}

variable "dynamodb_table_name" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "account_id" {
  type = string
}

# NEW — required for ALB alarm dimensions (BUG 4 fix)
# Pass the full ARN of the external ALB:
#   external_alb_arn = module.alb.external_alb_arn
variable "external_alb_arn" {
  description = "Full ARN of the external ALB — used to scope CloudWatch alarms to this specific load balancer"
  type        = string
}
