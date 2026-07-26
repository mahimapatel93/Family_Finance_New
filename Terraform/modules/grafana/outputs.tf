output "monitoring_instance_id" {
  description = "EC2 instance ID of the monitoring server"
  value       = aws_instance.monitoring.id
}

output "monitoring_private_ip" {
  description = "Private IP of monitoring server (use for SSH tunnel)"
  value       = aws_instance.monitoring.private_ip
}

output "monitoring_sg_id" {
  description = "Security group ID of monitoring server"
  value       = aws_security_group.monitoring.id
}

output "grafana_url_internal" {
  description = "Grafana URL via internal network"
  value       = "http://${aws_instance.monitoring.private_ip}:3001"
}

output "prometheus_url_internal" {
  description = "Prometheus URL via internal network"
  value       = "http://${aws_instance.monitoring.private_ip}:9090"
}
