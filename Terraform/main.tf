terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  backend "s3" {
    bucket       = "tf-state-family-finance-399605429130"
    key          = "family-finance/prod/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "FamilyFinanceAI"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

module "vpc" {
  source      = "./modules/vpc"
  environment = var.environment
  vpc_cidr    = var.vpc_cidr
  azs         = var.availability_zones
}

module "security_groups" {
  source      = "./modules/security-groups"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id
}

module "waf" {
  source      = "./modules/waf"
  environment = var.environment
}

module "alb" {
  source      = "./modules/alb"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id

  public_subnet_ids  = module.vpc.public_subnet_ids
  private_subnet_ids = module.vpc.private_frontend_ids
  backend_subnet_ids = module.vpc.private_backend_ids

  alb_sg_id         = module.security_groups.alb_sg_id
  internal_lb_sg_id = module.security_groups.internal_lb_sg_id
  domain_name       = var.domain_name
  waf_acl_arn       = module.waf.waf_acl_arn
}

module "dynamodb" {
  source      = "./modules/dynamodb"
  environment = var.environment
}

module "monitoring" {
  source              = "./modules/monitoring"
  environment         = var.environment
  slack_webhook_url   = var.slack_webhook_url
  dynamodb_table_name = module.dynamodb.table_name
  aws_region          = var.aws_region
  account_id          = data.aws_caller_identity.current.account_id
  external_alb_arn    = module.alb.external_alb_arn # NEW — fixes ALB alarm dimensions
}

module "asg" {
  source      = "./modules/asg"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id

  public_subnet_ids   = module.vpc.public_subnet_ids
  private_subnet_ids  = module.vpc.private_frontend_ids
  frontend_subnet_ids = module.vpc.private_frontend_ids
  backend_subnet_ids  = module.vpc.private_backend_ids

  frontend_sg_id          = module.security_groups.frontend_sg_id
  backend_sg_id           = module.security_groups.backend_sg_id
  frontend_tg_arn         = module.alb.frontend_tg_arn
  backend_tg_arn          = module.alb.backend_tg_arn
  frontend_ami            = var.frontend_ami
  backend_ami             = var.backend_ami
  frontend_instance_type  = var.frontend_instance_type
  backend_instance_type   = var.backend_instance_type
  github_repo_frontend    = var.github_repo_frontend
  github_repo_backend     = var.github_repo_backend
  dynamodb_table_name     = module.dynamodb.table_name
  dynamodb_table_arn      = module.dynamodb.table_arn
  aws_region              = var.aws_region
  backend_log_group_name  = module.monitoring.backend_log_group_name
  frontend_log_group_name = module.monitoring.frontend_log_group_name
  key_name                = var.key_name
  internal_lb_dns         = module.alb.internal_lb_dns
  domain_name             = var.domain_name
  external_alb_arn        = module.alb.external_alb_arn
}

data "aws_caller_identity" "current" {}
