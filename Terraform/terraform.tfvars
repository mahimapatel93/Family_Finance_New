
aws_region = "us-east-1"
environment = "prod"
vpc_cidr = "10.0.0.0/16"

availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

domain_name = "global-aws.site"   
slack_webhook_url = "https://hooks.slack.com/services/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"
frontend_ami = "ami-02dfbd4ff395f2a1b"   
backend_ami  = "ami-02dfbd4ff395f2a1b"        


frontend_instance_type = "m7i-flex.large"    
backend_instance_type  = "m7i-flex.large"   



github_repo_frontend = "git@github.com:RudraOps-Hackfest/family-finance-smart-money-management-for-you-family.git"   
github_repo_backend  = "git@github.com:RudraOps-Hackfest/family-finance-smart-money-management-for-you-family.git"    



key_name = "family-finance-keypair"   
