
aws_region  = "us-east-1"
environment = "prod"
vpc_cidr    = "10.0.0.0/16"

availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

domain_name       = "mahima-patel.shop"
slack_webhook_url = ""
frontend_ami      = "ami-02dfbd4ff395f2a1b"
backend_ami       = "ami-02dfbd4ff395f2a1b"


frontend_instance_type = "t3.medium"
backend_instance_type  = "t3.medium"


github_repo_frontend = "git@github.com:mahimapatel93/Family_Finance_New.git"
github_repo_backend  = "git@github.com:mahimapatel93/Family_Finance_New.git"


key_name = "family-finance-keypair"
