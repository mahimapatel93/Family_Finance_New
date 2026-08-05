
resource "aws_iam_role" "ec2" {
  name = "${var.environment}-ec2-instance-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "cloudwatch" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_role_policy" "ec2_custom" {
  name = "${var.environment}-ec2-custom-policy"
  role = aws_iam_role.ec2.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem",
          "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
          "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem",
          "dynamodb:CreateTable", "dynamodb:DescribeTable",
          "dynamodb:ListTables", "dynamodb:UpdateTable"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:*:table/finance_*",
          "arn:aws:dynamodb:${var.aws_region}:*:table/finance_*/index/*"
        ]
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup", "logs:CreateLogStream",
          "logs:PutLogEvents", "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:*"
      },
      {
        Sid    = "ASGLifecycle"
        Effect = "Allow"
        Action = ["autoscaling:CompleteLifecycleAction",
        "autoscaling:DescribeAutoScalingInstances"]
        Resource = "*"
      },
      {
        # UPDATED: added news-api-key alongside existing secrets
        Sid    = "SSMSecrets"
        Effect = "Allow"
        Action = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:*:parameter/prod/app/jwt-secret",
          "arn:aws:ssm:${var.aws_region}:*:parameter/prod/app/groq-api-key",
          "arn:aws:ssm:${var.aws_region}:*:parameter/prod/app/alpha-vantage-key",
          "arn:aws:ssm:${var.aws_region}:*:parameter/prod/app/news-api-key",
          "arn:aws:ssm:${var.aws_region}:*:parameter/prod/github/deploy_key"
        ]
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.environment}-ec2-instance-profile"
  role = aws_iam_role.ec2.name
}

resource "aws_iam_role" "asg_lifecycle" {
  name = "${var.environment}-asg-lifecycle-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "autoscaling.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

locals {
  frontend_user_data = base64encode(templatefile("${path.module}/user-data/frontend.sh", {
    github_repo     = var.github_repo_frontend
    aws_region      = var.aws_region
    log_group_name  = var.frontend_log_group_name
    internal_lb_dns = var.internal_lb_dns
    environment     = var.environment
  }))

  backend_user_data = base64encode(templatefile("${path.module}/user-data/backend.sh", {
    github_repo         = var.github_repo_backend
    aws_region          = var.aws_region
    log_group_name      = var.backend_log_group_name
    dynamodb_table_name = var.dynamodb_table_name
    environment         = var.environment
    domain_name         = var.domain_name
  }))
}

resource "aws_launch_template" "frontend" {
  name_prefix            = "${var.environment}-frontend-lt-"
  update_default_version = true
  image_id               = var.frontend_ami
  instance_type          = var.frontend_instance_type
  key_name               = var.key_name

  iam_instance_profile { arn = aws_iam_instance_profile.ec2.arn }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [var.frontend_sg_id]
    delete_on_termination       = true
  }

  user_data = local.frontend_user_data

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  monitoring { enabled = true }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 20
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "${var.environment}-frontend"
      Tier        = "frontend"
      Environment = var.environment
    }
  }

  lifecycle { create_before_destroy = true }
}

resource "aws_launch_template" "backend" {
  name_prefix            = "${var.environment}-backend-lt-"
  update_default_version = true
  image_id               = var.backend_ami
  instance_type          = var.backend_instance_type
  key_name               = var.key_name

  iam_instance_profile { arn = aws_iam_instance_profile.ec2.arn }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [var.backend_sg_id]
    delete_on_termination       = true
  }

  user_data = local.backend_user_data

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  monitoring { enabled = true }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "${var.environment}-backend"
      Tier        = "backend"
      Environment = var.environment
    }
  }

  lifecycle { create_before_destroy = true }
}

resource "aws_autoscaling_group" "frontend" {
  name                      = "${var.environment}-frontend-asg"
  min_size                  = 2
  max_size                  = 6
  desired_capacity          = 2
  vpc_zone_identifier       = var.frontend_subnet_ids
  target_group_arns         = [var.frontend_tg_arn]
  health_check_type         = "ELB"
  health_check_grace_period = 300
  default_cooldown          = 180
  termination_policies      = ["OldestLaunchTemplate", "OldestInstance"]

  launch_template {
    id      = aws_launch_template.frontend.id
    version = "$Latest"
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
      instance_warmup        = 300
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.environment}-frontend"
    propagate_at_launch = true
  }
  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }

  lifecycle { create_before_destroy = true }
}

resource "aws_autoscaling_group" "backend" {
  name                      = "${var.environment}-backend-asg"
  min_size                  = 2
  max_size                  = 8
  desired_capacity          = 2
  vpc_zone_identifier       = var.backend_subnet_ids
  target_group_arns         = [var.backend_tg_arn]
  health_check_type         = "ELB"
  health_check_grace_period = 300
  default_cooldown          = 180
  termination_policies      = ["OldestLaunchTemplate", "OldestInstance"]

  launch_template {
    id      = aws_launch_template.backend.id
    version = "$Latest"
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
      instance_warmup        = 300
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.environment}-backend"
    propagate_at_launch = true
  }
  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }

  lifecycle { create_before_destroy = true }
}

resource "aws_autoscaling_policy" "frontend_cpu" {
  name                   = "${var.environment}-frontend-cpu-scaling"
  autoscaling_group_name = aws_autoscaling_group.frontend.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 60.0
  }
}

resource "aws_autoscaling_policy" "backend_cpu" {
  name                   = "${var.environment}-backend-cpu-scaling"
  autoscaling_group_name = aws_autoscaling_group.backend.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

