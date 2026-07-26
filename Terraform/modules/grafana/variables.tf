variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block — used for SG ingress rules"
  type        = string
}

variable "aws_region" {
  type = string
}

variable "monitoring_subnet_id" {
  description = "Single private-data subnet ID for the monitoring EC2"
  type        = string
}

variable "monitoring_ami" {
  description = "Amazon Linux 2023 AMI ID"
  type        = string
}

variable "monitoring_instance_type" {
  description = "Instance type for monitoring server"
  type        = string
  default     = "t3.small"
}

variable "key_name" {
  description = "EC2 Key Pair name"
  type        = string
}

variable "backend_sg_id" {
  description = "Backend EC2 security group ID — Node Exporter ingress rule added here"
  type        = string
}

variable "frontend_sg_id" {
  description = "Frontend EC2 security group ID — Node Exporter + Nginx Exporter ingress rules added here"
  type        = string
}

variable "https_listener_arn" {
  description = "ARN of the external ALB HTTPS listener — used for /grafana path rule"
  type        = string
}

variable "grafana_admin_password" {
  description = "Grafana admin password — store in SSM or tfvars (sensitive)"
  type        = string
  sensitive   = true
  default     = "FamilyFinance@Grafana2025!"
}
