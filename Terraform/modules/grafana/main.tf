# Security Group for Grafana/Prometheus EC2

resource "aws_security_group" "monitoring" {
  name        = "${var.environment}-monitoring-sg"
  description = "Grafana and Prometheus server"
  vpc_id      = var.vpc_id

  # Prometheus UI — from within VPC only
  ingress {
    description = "Prometheus from VPC"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # Grafana UI — from within VPC only
  ingress {
    description = "Grafana from VPC"
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # SSH — internal bastion access only
  ingress {
    description = "SSH internal"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Outbound to scrape targets and internet (updates)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.environment}-monitoring-sg" }
}

resource "aws_security_group_rule" "backend_node_exporter" {
  type                     = "ingress"
  description              = "Prometheus scrape Node Exporter"
  from_port                = 9100
  to_port                  = 9100
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.monitoring.id
  security_group_id        = var.backend_sg_id
}

resource "aws_security_group_rule" "frontend_node_exporter" {
  type                     = "ingress"
  description              = "Prometheus scrape Node Exporter"
  from_port                = 9100
  to_port                  = 9100
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.monitoring.id
  security_group_id        = var.frontend_sg_id
}

resource "aws_security_group_rule" "frontend_nginx_exporter" {
  type                     = "ingress"
  description              = "Prometheus scrape Nginx Exporter"
  from_port                = 9113
  to_port                  = 9113
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.monitoring.id
  security_group_id        = var.frontend_sg_id
}

resource "aws_iam_role" "monitoring" {
  name = "${var.environment}-monitoring-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "monitoring_ssm" {
  role       = aws_iam_role.monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "monitoring_ec2_sd" {
  name = "${var.environment}-monitoring-ec2-sd"
  role = aws_iam_role.monitoring.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EC2ServiceDiscovery"
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeTags",
          "ec2:DescribeAvailabilityZones"
        ]
        Resource = "*"
      },
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "monitoring" {
  name = "${var.environment}-monitoring-instance-profile"
  role = aws_iam_role.monitoring.name
}

locals {
  monitoring_user_data = base64encode(templatefile("${path.module}/user-data/monitoring.sh", {
    environment  = var.environment
    aws_region   = var.aws_region
    grafana_pass = var.grafana_admin_password
  }))
}

resource "aws_instance" "monitoring" {
  ami                    = var.monitoring_ami
  instance_type          = var.monitoring_instance_type
  subnet_id              = var.monitoring_subnet_id
  vpc_security_group_ids = [aws_security_group.monitoring.id]
  iam_instance_profile   = aws_iam_instance_profile.monitoring.name
  key_name               = var.key_name

  user_data = local.monitoring_user_data

  # Dedicated 20GB volume for Prometheus TSDB and Grafana data
  root_block_device {
    volume_size           = 20
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  tags = {
    Name        = "${var.environment}-monitoring"
    Role        = "monitoring"
    Environment = var.environment
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_target_group" "grafana" {
  name        = "${var.environment}-grafana-tg"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    path                = "/api/health"
    port                = "3001"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 10
    matcher             = "200"
  }

  tags = { Name = "${var.environment}-grafana-tg" }
}

resource "aws_lb_target_group_attachment" "grafana" {
  target_group_arn = aws_lb_target_group.grafana.arn
  target_id        = aws_instance.monitoring.id
  port             = 3001
}


resource "aws_lb_listener_rule" "grafana" {
  listener_arn = var.https_listener_arn
  priority     = 50

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.grafana.arn
  }

  condition {
    path_pattern {
      values = ["/grafana", "/grafana/*"]
    }
  }

  tags = { Name = "${var.environment}-grafana-rule" }
}
