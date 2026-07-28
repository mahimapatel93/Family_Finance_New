# Family Finance AI – Complete AWS Deployment Guide
## End-to-End Infrastructure Setup | us-east-1 | Multi-AZ | 3-Tier

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Step 1 – AWS Account Preparation](#step-1--aws-account-preparation)
4. [Step 2 – Domain & DNS (Registrar → Route 53)](#step-2--domain--dns-registrar--route-53)
5. [Step 3 – GitHub Repo Preparation](#step-3--github-repo-preparation)
6. [Step 4 – Terraform Deployment](#step-4--terraform-deployment)
7. [Step 5 – Verify Security Groups](#step-5--verify-security-groups)
8. [Step 6 – Verify WAF](#step-6--verify-waf)
9. [Step 7 – Verify ALB & ACM](#step-7--verify-alb--acm)
10. [Step 8 – Verify ASG & EC2](#step-8--verify-asg--ec2)
11. [Step 9 – Verify DynamoDB](#step-9--verify-dynamodb)
12. [Step 10 – Verify CloudWatch & Alarms](#step-10--verify-cloudwatch--alarms)
13. [Step 11 – Verify SNS → Lambda → Slack](#step-11--verify-sns--lambda--slack)
14. [Step 12 – Smoke Test End-to-End](#step-12--smoke-test-end-to-end)
15. [Step 13 – Grafana Setup](#step-13--grafana-setup)
16. [Security Hardening Checklist](#security-hardening-checklist)
17. [Cost Estimation](#cost-estimation)
18. [Troubleshooting](#troubleshooting)
19. [Rollback Procedures](#rollback-procedures)

---

## 1. Architecture Overview

```
Internet
    │
    ▼
Domain Registrar (NS records → Route 53)
    │
    ▼
Route 53  (A alias → External ALB)
    │
    ▼
WAF v2 WebACL  (Managed Rules + Rate Limit + Bot Control)
    │
    ▼
External ALB  ← ACM TLS Certificate
  us-east-1a | us-east-1b | us-east-1c  [public subnets]
    │  port 443 → TG → port 3000
    ▼
Frontend ASG  [private-frontend subnets]
  React (Vite build)  •  PM2  •  Node.js 20  •  runs as OS user "appuser"
    │  HTTP :80 → Internal ALB
    ▼
Internal ALB  [private-frontend subnets, internal=true]
    │  port 80 → TG → port 5000
    ▼
Backend ASG  [private-backend subnets]
  Express API  •  PM2  •  Node.js 20  •  runs as OS user "appuser"
    │  AWS SDK  •  IAM Role
    ▼
DynamoDB
    │  Streams
    ▼
Lambda (stream_logger) ──► CW Logs /aws/dynamodb/prod/streams

EC2 CloudWatch Agent ──────► CW Logs /aws/ec2/prod/backend
                                    │  Metric Filters
                                    ▼
                             CloudWatch Alarms
                                    │ ALARM state
                                    ▼
                              SNS Topic
                                    │
                                    ▼
                        Lambda (slack_notifier)
                                    │
                                    ▼
                          Slack  #prod-alerts
```

> **Note on DynamoDB:** This project actually uses DynamoDB in two separate ways. The app's real data — users, families, expenses, bills, investments — lives in five tables (`finance_users`, `finance_families`, `finance_expenses`, `finance_bills`, `finance_investments`) that are **not** created by Terraform. They're created automatically by `backend/scripts/setupDynamoDB.js`, which runs as part of the backend's boot script on every instance startup (it checks if each table exists and creates any that are missing). The single Terraform-managed table shown in the diagram above (with Streams enabled, feeding the `stream_logger` Lambda) is separate — it's used for the CloudWatch logging/monitoring pipeline, not for the app's core data. See the updated Step 9 below for how to verify both.

**Subnet Layout (10.0.0.0/16):**

| Subnet | AZ-a | AZ-b | AZ-c |
|--------|------|------|------|
| Public (ALB + NAT) | 10.0.0.0/24 | 10.0.1.0/24 | 10.0.2.0/24 |
| Private Frontend | 10.0.10.0/24 | 10.0.11.0/24 | 10.0.12.0/24 |
| Private Backend | 10.0.20.0/24 | 10.0.21.0/24 | 10.0.22.0/24 |
| Private Data | 10.0.30.0/24 | 10.0.31.0/24 | 10.0.32.0/24 |

**Security Group Chain:**
```
Internet (0.0.0.0/0) → ALB SG → Frontend SG → Internal LB SG → Backend SG → DynamoDB (VPC Endpoint)
```

**Deployment model:** This project deploys through 3 GitHub Actions workflows rather than only manual local `terraform apply` — see the note in Step 4 below.

---

## 2. Prerequisites

### Tools Required

**Terraform >= 1.6.0**
```bash
# macOS
brew tap hashicorp/tap && brew install hashicorp/tap/terraform

# Linux (Ubuntu/Debian)
wget -O- https://apt.releases.hashicorp.com/gpg | \
  sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
  https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
  sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform

terraform version   # must show >= 1.6.0
```

**AWS CLI v2**
```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

aws --version
```

**Configure AWS CLI**
```bash
aws configure
# AWS Access Key ID:     <your-access-key>
# AWS Secret Access Key: <your-secret-key>
# Default region:        us-east-1
# Default output format: json

# Verify
aws sts get-caller-identity
```

> **Windows / Git Bash note:** Git Bash (MSYS2-based) silently rewrites any argument starting with `/` into a Windows-style file path. This breaks AWS CLI commands that take path-like names (SSM parameter names, IAM paths, etc.) — for example `aws ssm put-parameter --name "/prod/..."` can fail with a confusing "must be a fully qualified name" error even though the command is correct. If this happens, prefix the command with:
> ```bash
> MSYS_NO_PATHCONV=1 aws ssm put-parameter --name "/prod/github/deploy_key" ...
> ```

### Required AWS IAM Permissions
Attach these to your IAM user before running Terraform:
- `AmazonVPCFullAccess`
- `AmazonEC2FullAccess`
- `ElasticLoadBalancingFullAccess`
- `AutoScalingFullAccess`
- `AmazonDynamoDBFullAccess`
- `AWSWAFv2FullAccess`
- `CloudWatchFullAccess`
- `AmazonSNSFullAccess`
- `AWSLambda_FullAccess`
- `AmazonRoute53FullAccess`
- `AWSCertificateManagerFullAccess`
- `IAMFullAccess`
- `AmazonS3FullAccess`
- `AmazonSSMFullAccess`

> For a clean start, `AdministratorAccess` is acceptable in a dedicated deployment account.

---

## Step 1 – AWS Account Preparation

### 1.1 Create EC2 Key Pair
```bash
aws ec2 delete-key-pair --key-name family-finance-keypair --region us-east-1

rm -f family-finance-keypair.pem

aws ec2 create-key-pair \
  --key-name family-finance-keypair \
  --region us-east-1 \
  --query 'KeyMaterial' \
  --output text > family-finance-keypair.pem

chmod 400 family-finance-keypair.pem   # Linux/macOS only
```

Verify it exists:
```bash
aws ec2 describe-key-pairs --key-names family-finance-keypair --region us-east-1
```

### 1.2 Create Terraform State Backend

> **S3 bucket names must be globally unique across every AWS account in the world**, not just your own account. Always build the bucket name from your own AWS Account ID rather than reusing one from an example or another deployment.

**S3 bucket for state:**
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET_NAME="tf-state-family-finance-${ACCOUNT_ID}"

aws s3api create-bucket \
  --bucket "$BUCKET_NAME" \
  --region us-east-1

aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$BUCKET_NAME" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "State bucket: $BUCKET_NAME"
```

> **No separate DynamoDB lock table needed.** This project's `main.tf` uses S3-native state locking (`use_lockfile = true`) instead of the older DynamoDB-lock-table pattern, so there's no `terraform-lock` table to create — see the corrected backend block in 1.3 below.

### 1.3 Enable S3 Backend in main.tf
Open `main.tf` and set the backend block with your bucket name:
```hcl
backend "s3" {
  bucket       = "tf-state-family-finance-<your-account-id>"
  key          = "family-finance/prod/terraform.tfstate"
  region       = "us-east-1"
  use_lockfile = true
  encrypt      = true
}
```

### 1.4 Store Sensitive Values in SSM Parameter Store

> In this project's actual GitHub Actions setup, the Slack webhook URL is passed to Terraform as the `TF_VAR_SLACK_WEBHOOK_URL` GitHub Secret at apply time (not read from SSM by Terraform itself). If you prefer to also keep a copy in SSM for reference/manual use, you can still do so:
```bash
aws ssm put-parameter \
  --name "/prod/slack/webhook-url" \
  --type "SecureString" \
  --value "<your slack webhook url>" \
  --region us-east-1

echo "Slack webhook stored in SSM"
```

---

## Step 2 – Domain & DNS (Registrar → Route 53)

### 2.1 Create Route 53 Hosted Zone
```bash
aws route53 create-hosted-zone \
  --name mahima-patel.shop \
  --caller-reference $(date +%s) \
  --region us-east-1

# Save the output — you need the 4 NS records and the Hosted Zone ID
# Example NS records:
#   ns-123.awsdns-45.com.
#   ns-456.awsdns-67.net.
#   ns-789.awsdns-01.co.uk.
#   ns-012.awsdns-34.org.
```

Get NS records programmatically — use the **same domain name** as above:
```bash
ZONE_ID=$(aws route53 list-hosted-zones \
  --query "HostedZones[?Name=='mahima-patel.shop.'].Id" \
  --output text | sed 's|/hostedzone/||')

echo "Zone ID: $ZONE_ID"

aws route53 get-hosted-zone \
  --id "$ZONE_ID" \
  --query 'DelegationSet.NameServers' \
  --output table
```

> If more than one hosted zone shows up in `list-hosted-zones` (e.g. an unrelated internal AWS zone), double-check you're reading the Zone ID for your actual domain before continuing.

### 2.2 Point Your Registrar to Route 53

1. Log in to your domain registrar (e.g. GoDaddy.com → My Products → Domains)
2. Click **DNS** next to your domain
3. Scroll to **Nameservers** → Click **Change**
4. Select **"Enter my own nameservers (advanced)"**
5. Replace the existing nameservers with your 4 AWS NS records (without trailing dots)
6. Click **Save**

> ⚠️ **DNS propagation takes 15 minutes to 48 hours.** Terraform's ACM certificate validation will time out if DNS is not delegated. Verify before running `terraform apply`.

### 2.3 Verify DNS Delegation
```bash
# Wait 15-30 minutes after the registrar change, then run:
nslookup -type=NS mahima-patel.shop 8.8.8.8

# Must return awsdns records like:
# ns-123.awsdns-45.com
# ns-456.awsdns-67.net

# If still showing the registrar's nameservers, wait and try again.
# Always check against a public DNS server (8.8.8.8) rather than your local
# network's DNS — local resolvers can time out or give misleading results.
```

---

## Step 3 – GitHub Repo Preparation

### 3.1 Add Health Check Endpoints to Your Apps

**Backend — Express.js** (`backend/server.js`):
```javascript
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'Family Finance API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});
```

**Frontend** exposes its own `/health` route as well, served by the frontend Node process.

These paths are configured in the ALB target group health checks — the instances will show **unhealthy** if these don't return HTTP 200.

> Note: `/health` returns a static response and does not touch DynamoDB. A passing health check confirms the server process is up, not that the database is reachable — keep that in mind when debugging signup/login issues that don't show up as unhealthy targets.

### 3.2 Verify package.json Scripts

**Frontend (Vite):**
```json
{
  "scripts": {
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

**Backend** — the entry point is `backend/server.js` (not `src/index.js`). If you ever restructure the backend, update the PM2 start command in `Terraform/modules/asg/user-data/backend.sh` to match your actual entry point.

### 3.3 For Private Repos — Setup Deploy Key

```bash
# Generate deploy key
ssh-keygen -t ed25519 -C "aws-ec2-deploy" -f deploy_key -N ""

# Add public key to GitHub:
# Go to: github.com/YOUR_ORG/REPO → Settings → Deploy Keys → Add deploy key
# Paste: cat deploy_key.pub
# Check: Allow write access = NO (read-only is fine)

# Store private key in SSM — use this exact name everywhere (underscore, not hyphen)
aws ssm put-parameter \
  --name "/prod/github/deploy_key" \
  --value "$(cat deploy_key)" \
  --type "SecureString" \
  --region us-east-1

# Or store manually in SSM via the console:
# AWS Console → Systems Manager → Parameter Store → Create Parameter
# Field       Value
# Name        /prod/github/deploy_key
# Type        SecureString
# KMS Key     Default (aws/ssm)
# Value       Paste full private key
# Tier        Standard
```

> **Important — parameter name consistency:** Make sure the name you store the key under (`/prod/github/deploy_key`, with an underscore) exactly matches the name your `backend.sh` / `frontend.sh` user-data scripts fetch it under. A common mistake is storing it as `deploy_key` but having the fetch script look for `deploy-key` (hyphen) — these are two different SSM parameters and the fetch will fail with `ParameterNotFound` if they don't match exactly.

Also make sure `GITHUB_REPO` in `terraform.tfvars` uses the SSH format so the deploy key can actually be used:
```hcl
github_repo_frontend = "git@github.com:YOUR_ORG/family-finance.git"
github_repo_backend  = "git@github.com:YOUR_ORG/family-finance.git"
```

Add the key files to `.gitignore` **before** you generate them:
```gitignore
deploy_key
deploy_key.pub
family-finance-keypair.pem
*.pem
*.key
```

---

## Step 4 – Terraform Deployment

> **This project actually deploys through GitHub Actions**, not only by running `terraform apply` manually from your laptop. There's a `.github/workflows/terraform.yml` workflow that runs `terraform plan`/`apply` — go to **Actions tab → "Terraform Infrastructure" → Run workflow**, choose `action: plan` first to review, then `action: apply`. The manual CLI steps below are still useful for local testing/debugging, but for the actual deployment, prefer the workflow.
>
> Also note: the `terraform.yml` workflow's automatic push-trigger currently watches the lowercase path `terraform/**`, but the real folder in this repo is `Terraform/` (capital T). Since GitHub Actions path filters are case-sensitive, pushing changes into `Terraform/` will **not** auto-trigger the workflow yet — use the manual "Run workflow" button until that path is corrected.

### 4.1 Prepare Configuration
```bash
cd Terraform
```

Edit `terraform.tfvars`:
```hcl
aws_region         = "us-east-1"
environment        = "prod"
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

domain_name       = "mahima-patel.shop"
slack_webhook_url = ""   # optional — leave blank if not using Slack alerts

frontend_ami           = "<latest AL2023 AMI ID>"
backend_ami            = "<latest AL2023 AMI ID>"
frontend_instance_type = "t3.medium"
backend_instance_type  = "t3.medium"

github_repo_frontend = "git@github.com:YOUR_ORG/family-finance.git"
github_repo_backend  = "git@github.com:YOUR_ORG/family-finance.git"

key_name = "family-finance-keypair"
```

**Security:** Keep `terraform.tfvars` out of git if it contains anything sensitive:
```bash
cat >> .gitignore << 'EOF'
terraform.tfvars
.terraform/
*.tfstate
*.tfstate.backup
*.tfplan
infrastructure-outputs.json
EOF
```

Alternatively, set sensitive values as env vars:
```bash
export TF_VAR_slack_webhook_url="https://hooks.slack.com/services/..."
```

### 4.2 Verify Latest AMI ID
The hardcoded AMI may become outdated. Always verify the latest AL2023 AMI:
```bash
aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value \
  --output text \
  --region us-east-1
# Use this value for both frontend_ami and backend_ami in terraform.tfvars
```

### 4.3 Initialize Terraform
```bash
terraform init

# Expected output:
# Initializing modules...
# - module.vpc
# - module.security_groups
# - module.alb
# - module.asg
# - module.dynamodb
# - module.waf
# - module.monitoring
# Terraform has been successfully initialized!
```

### 4.4 Validate
```bash
terraform validate
# Success! The configuration is valid.
```

### 4.5 Plan
```bash
terraform plan -out=tfplan 2>&1 | tee plan-output.log

# Review key sections:
grep -E "will be created|must be replaced|will be destroyed" plan-output.log | head -50
```

Key items to confirm in the plan:
- `aws_vpc.main` — 1 VPC
- `aws_subnet.*` — subnets across 3 AZs
- `aws_nat_gateway.nat[...]` — NAT Gateway(s)
- `aws_security_group.alb/frontend/internal_lb/backend` — 4 SGs
- `aws_lb.external` + `aws_lb.internal` — 2 ALBs
- `aws_acm_certificate.main` — 1 wildcard cert
- `aws_dynamodb_table.main` — 1 table (the Streams/monitoring table — see the note in Step 1)
- `aws_autoscaling_group.frontend` + `aws_autoscaling_group.backend` — 2 ASGs
- `aws_wafv2_web_acl.main` — 1 WAF
- `aws_cloudwatch_metric_alarm.*` — multiple alarms
- `aws_lambda_function.slack_notifier` — 1 Lambda
- `aws_sns_topic.alerts` — 1 SNS topic

### 4.6 Apply

If applying manually (rather than via the GitHub Actions workflow described above), you can apply everything in one pass:
```bash
terraform apply
```

If you want to isolate issues by applying module-by-module, that also works:
```bash
terraform apply -target=module.vpc -target=module.security_groups
terraform apply -target=module.waf
terraform apply -target=module.alb        # requires DNS to be delegated first (Step 2)!
terraform apply -target=module.dynamodb -target=module.monitoring
terraform apply -target=module.asg
terraform apply                            # final pass, catches any remaining dependencies
```

### 4.7 Save Outputs
```bash
terraform output -json | tee infrastructure-outputs.json

# Quick view of key outputs:
echo "External ALB DNS: $(terraform output -raw external_alb_dns)"
echo "Internal ALB DNS: $(terraform output -raw internal_alb_dns)"
echo "DynamoDB Table:   $(terraform output -raw dynamodb_table_name)"
echo "SNS Topic ARN:    $(terraform output -raw sns_topic_arn)"
```

---

## Step 5 – Verify Security Groups

### 5.1 List All Project Security Groups
```bash
aws ec2 describe-security-groups \
  --filters "Name=tag:Environment,Values=prod" \
  --region us-east-1 \
  --query 'SecurityGroups[*].{Name:GroupName,ID:GroupId}' \
  --output table
```

### 5.2 Verify ALB SG — Source Must Be 0.0.0.0/0
```bash
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=prod-alb-sg" \
  --region us-east-1 \
  --query 'SecurityGroups[0].IpPermissions[*].{Port:FromPort,CIDR:IpRanges[0].CidrIp}' \
  --output table

# Expected:
# Port 80  → 0.0.0.0/0
# Port 443 → 0.0.0.0/0
```

### 5.3 Verify Frontend SG — Source Must Be ALB SG
```bash
ALB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=prod-alb-sg" \
  --query 'SecurityGroups[0].GroupId' --output text --region us-east-1)

FE_SOURCE=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=prod-frontend-sg" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`3000`].UserIdGroupPairs[0].GroupId' \
  --output text --region us-east-1)

echo "ALB SG:              $ALB_SG"
echo "Frontend source SG:  $FE_SOURCE"
[ "$ALB_SG" = "$FE_SOURCE" ] && echo "✅ CORRECT" || echo "❌ MISMATCH"
```

### 5.4 Verify Backend SG — Source Must Be Internal LB SG
```bash
ILB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=prod-internal-lb-sg" \
  --query 'SecurityGroups[0].GroupId' --output text --region us-east-1)

BE_SOURCE=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=prod-backend-sg" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`5000`].UserIdGroupPairs[0].GroupId' \
  --output text --region us-east-1)

echo "Internal LB SG:     $ILB_SG"
echo "Backend source SG:  $BE_SOURCE"
[ "$ILB_SG" = "$BE_SOURCE" ] && echo "✅ CORRECT" || echo "❌ MISMATCH"
```

---

## Step 6 – Verify WAF

### 6.1 Check WebACL Exists and Is Active
```bash
aws wafv2 list-web-acls \
  --scope REGIONAL \
  --region us-east-1 \
  --query 'WebACLs[*].{Name:Name,ID:Id}' \
  --output table
```

### 6.2 Verify WAF is Attached to External ALB
```bash
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names prod-external-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text --region us-east-1)

aws wafv2 get-web-acl-for-resource \
  --resource-arn "$ALB_ARN" \
  --region us-east-1 \
  --query 'WebACL.{Name:Name,DefaultAction:DefaultAction}' \
  --output table

# Should return your WAF ACL name. If "ResourceNotFoundException" — WAF not attached.
```

### 6.3 Test WAF Is Blocking Attacks
```bash
# SQL injection — must return 403
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://mahima-patel.shop/?id=1'+OR+'1'%3D'1")
echo "SQL injection test:  HTTP $HTTP_CODE  (expected: 403)"

# XSS — must return 403
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://mahima-patel.shop/?search=%3Cscript%3Ealert(1)%3C/script%3E")
echo "XSS test:            HTTP $HTTP_CODE  (expected: 403)"

# Normal request — must pass (200 or 30x)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://mahima-patel.shop/")
echo "Normal request:      HTTP $HTTP_CODE  (expected: 200)"
```

---

## Step 7 – Verify ALB & ACM

### 7.1 Confirm ACM Certificate Is ISSUED
```bash
CERT_ARN=$(terraform output -raw acm_certificate_arn)

aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region us-east-1 \
  --query 'Certificate.{Domain:DomainName,Status:Status,AltNames:SubjectAlternativeNames}' \
  --output table

# Status must be ISSUED
# If PENDING_VALIDATION: DNS hasn't propagated yet; wait longer
```

### 7.2 Verify External ALB Is Active
```bash
aws elbv2 describe-load-balancers \
  --names prod-external-alb \
  --region us-east-1 \
  --query 'LoadBalancers[0].{DNS:DNSName,State:State.Code,Scheme:Scheme}' \
  --output table

# State: active
# Scheme: internet-facing
```

### 7.3 Verify Internal ALB Is Active
```bash
aws elbv2 describe-load-balancers \
  --names prod-internal-alb \
  --region us-east-1 \
  --query 'LoadBalancers[0].{DNS:DNSName,State:State.Code,Scheme:Scheme}' \
  --output table

# Scheme: internal
```

> **Testing tip:** The ALB's own auto-generated DNS name (e.g. `prod-external-alb-xxxx.us-east-1.elb.amazonaws.com`) will not match your ACM certificate, since the cert was issued for `mahima-patel.shop`. Browsers will show `ERR_CERT_COMMON_NAME_INVALID` if you open the raw ALB DNS name with `https://` — this is expected. For quick testing use `http://` on the raw ALB name, or `curl -Lk` (follow redirects, ignore cert mismatch). Use your real domain over HTTPS for final verification.

### 7.4 Check Target Group Health
```bash
# Frontend target group
FE_TG=$(aws elbv2 describe-target-groups \
  --names prod-frontend-tg \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text --region us-east-1)

echo "=== Frontend Target Group Health ==="
aws elbv2 describe-target-health \
  --target-group-arn "$FE_TG" --region us-east-1 \
  --query 'TargetHealthDescriptions[*].{ID:Target.Id,State:TargetHealth.State,Reason:TargetHealth.Reason}' \
  --output table

# Backend target group
BE_TG=$(aws elbv2 describe-target-groups \
  --names prod-backend-tg \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text --region us-east-1)

echo "=== Backend Target Group Health ==="
aws elbv2 describe-target-health \
  --target-group-arn "$BE_TG" --region us-east-1 \
  --query 'TargetHealthDescriptions[*].{ID:Target.Id,State:TargetHealth.State,Reason:TargetHealth.Reason}' \
  --output table

# All states should be: healthy
# Common issue if unhealthy:
#   - App not listening on expected port (3000 frontend / 5000 backend)
#   - /health endpoint not returning 200
#   - User data script failed — check /var/log/cloud-init-output.log via SSM (see Step 8)
```

---

## Step 8 – Verify ASG & EC2

### 8.1 Check ASG Status
```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names prod-frontend-asg prod-backend-asg \
  --region us-east-1 \
  --query 'AutoScalingGroups[*].{
    Name:AutoScalingGroupName,
    Min:MinSize,
    Max:MaxSize,
    Desired:DesiredCapacity,
    Running:length(Instances[?LifecycleState==`InService`])
  }' \
  --output table
```

### 8.2 Connect to Instance via SSM (No SSH Needed)
```bash
# Get a backend instance ID
BE_INSTANCE=$(aws autoscaling describe-auto-scaling-instances \
  --region us-east-1 \
  --query 'AutoScalingInstances[?AutoScalingGroupName==`prod-backend-asg`].InstanceId' \
  --output text | awk '{print $1}')

echo "Connecting to: $BE_INSTANCE"

# Open SSM session
aws ssm start-session --target "$BE_INSTANCE" --region us-east-1
```

Once connected, run these checks. **The app runs as a non-root OS user called `appuser`**, so PM2 commands need `sudo -u appuser`, not just `sudo`:
```bash
# Check PM2 processes (must run as appuser, not root)
sudo -u appuser pm2 status

# Check app logs
sudo -u appuser pm2 logs --lines 30

# Check app is listening on the expected port
sudo ss -tlnp | grep 5000    # backend
sudo ss -tlnp | grep 3000    # frontend

# Test health endpoint locally
curl -s localhost:5000/health

# Check CloudWatch agent
sudo systemctl status amazon-cloudwatch-agent

# Check the FULL boot script log — this is where the real error shows up
# if an instance fails to become healthy. The EC2 console's "Get system log"
# only shows kernel/boot-level output, not what the user-data script itself did.
sudo cat /var/log/cloud-init-output.log
```

### 8.3 Check Scaling Policies Are Active
```bash
aws autoscaling describe-policies \
  --auto-scaling-group-name prod-frontend-asg \
  --region us-east-1 \
  --query 'ScalingPolicies[*].{Name:PolicyName,Type:PolicyType,Adjustment:TargetTrackingConfiguration.TargetValue}' \
  --output table
```

---

## Step 9 – Verify DynamoDB

As noted in the Architecture Overview, this project uses DynamoDB in two distinct ways — check both.

### 9.1 Verify the App's Actual Data Tables (created automatically at boot)

These are the tables the backend really reads/writes for signup, login, expenses, bills, and investments. They are created by `backend/scripts/setupDynamoDB.js`, run automatically by `backend.sh` on every instance boot (it's idempotent — checks if each table exists before creating):

```bash
aws dynamodb list-tables --region us-east-1
```

You should see:
```
finance_users
finance_families
finance_expenses
finance_bills
finance_investments
```

If any are missing, connect to a backend instance via SSM (Step 8.2) and check `sudo cat /var/log/cloud-init-output.log` for errors during the `setupDynamoDB.js` step, or re-run it manually:
```bash
sudo -u appuser node /path/to/backend/scripts/setupDynamoDB.js
```

### 9.2 Check Table Status (Terraform-managed monitoring table)
```bash
aws dynamodb describe-table \
  --table-name prod-family-finance \
  --region us-east-1 \
  --query 'Table.{
    Status:TableStatus,
    BillingMode:BillingModeSummary.BillingMode,
    StreamEnabled:StreamSpecification.StreamEnabled,
    StreamType:StreamSpecification.StreamViewType,
    PITR:PointInTimeRecoveryDescription.PointInTimeRecoveryStatus,
    Encryption:SSEDescription.Status
  }' \
  --output table

# Expected:
# Status:       ACTIVE
# StreamEnabled: true
# StreamType:   NEW_AND_OLD_IMAGES
```

### 9.3 Confirm DynamoDB Stream → Lambda → CloudWatch Logging Is Flowing

This is the monitoring/audit pipeline, separate from the app's real data. Write a test item to the Terraform-managed table to confirm it's flowing:
```bash
aws dynamodb put-item \
  --table-name prod-family-finance \
  --region us-east-1 \
  --item '{"PK":{"S":"USER#verify001"},"SK":{"S":"PROFILE#verify001"},"name":{"S":"Verification User"}}'

sleep 30

STREAM=$(aws logs describe-log-streams \
  --log-group-name /aws/dynamodb/prod/streams \
  --order-by LastEventTime --descending \
  --query 'logStreams[0].logStreamName' --output text --region us-east-1)

aws logs get-log-events \
  --log-group-name /aws/dynamodb/prod/streams \
  --log-stream-name "$STREAM" \
  --region us-east-1 --limit 5 \
  --query 'events[*].message' --output text

# Cleanup
aws dynamodb delete-item \
  --table-name prod-family-finance \
  --region us-east-1 \
  --key '{"PK":{"S":"USER#verify001"},"SK":{"S":"PROFILE#verify001"}}'
```

---

## Step 10 – Verify CloudWatch & Alarms

### 10.1 Confirm All Log Groups Exist
```bash
aws logs describe-log-groups \
  --region us-east-1 \
  --query 'logGroups[*].{Name:logGroupName,RetentionDays:retentionInDays}' \
  --output table | grep -E "family-finance|dynamodb/prod|lambda/prod"
```

Expected log groups:
```
/aws/ec2/prod/backend                    ← backend app + error logs
/aws/ec2/prod/frontend                   ← frontend app logs
/aws/dynamodb/prod/streams               ← DynamoDB Streams audit trail
/aws/lambda/prod-slack-notifier          ← Slack notifier Lambda logs
/aws/lambda/prod-dynamodb-stream-logger  ← Stream logger Lambda logs
```

### 10.2 Check Metric Filters Are Created
```bash
aws logs describe-metric-filters \
  --log-group-name /aws/ec2/prod/backend \
  --region us-east-1 \
  --query 'metricFilters[*].{Name:filterName,Pattern:filterPattern,Metric:metricTransformations[0].metricName}' \
  --output table
```

### 10.3 Check All Alarms Status
```bash
aws cloudwatch describe-alarms \
  --alarm-name-prefix prod- \
  --region us-east-1 \
  --query 'MetricAlarms[*].{Alarm:AlarmName,State:StateValue}' \
  --output table

# All should be OK or INSUFFICIENT_DATA (not ALARM) at initial deployment
```

### 10.4 Open CloudWatch Dashboard in Browser
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=prod-family-finance"
```

---

## Step 11 – Verify SNS → Lambda → Slack

### 11.1 Confirm SNS Topic and Lambda Subscription
```bash
SNS_ARN=$(terraform output -raw sns_topic_arn)

aws sns list-subscriptions-by-topic \
  --topic-arn "$SNS_ARN" \
  --region us-east-1 \
  --query 'Subscriptions[*].{Protocol:Protocol,Endpoint:Endpoint,Status:SubscriptionArn}' \
  --output table
```

### 11.2 Verify Lambda Is Active
```bash
aws lambda get-function \
  --function-name prod-slack-notifier \
  --region us-east-1 \
  --query 'Configuration.{State:State,Runtime:Runtime,Handler:Handler}' \
  --output table
```

### 11.3 Verify Slack Webhook Is Set
```bash
aws lambda get-function-configuration \
  --function-name prod-slack-notifier \
  --region us-east-1 \
  --query 'Environment.Variables' \
  --output json

# Note: if you left slack_webhook_url empty in terraform.tfvars / TF_VAR_SLACK_WEBHOOK_URL,
# this will show an empty value — the Lambda will run fine but won't actually post to Slack.
```

### 11.4 Test Lambda Directly
```bash
aws lambda invoke \
  --function-name prod-slack-notifier \
  --region us-east-1 \
  --cli-binary-format raw-in-base64-out \
  --payload '{
    "Records": [{
      "Sns": {
        "Message": "{\"AlarmName\":\"prod-TEST-alarm\",\"AlarmDescription\":\"Infrastructure verification test\",\"NewStateValue\":\"ALARM\",\"OldStateValue\":\"OK\",\"NewStateReason\":\"Manual test\",\"StateChangeTime\":\"2024-01-01T12:00:00.000Z\",\"Trigger\":{\"Namespace\":\"FamilyFinance/Test\",\"MetricName\":\"TestMetric\"}}"
      }
    }]
  }' \
  /tmp/lambda-test-response.json

cat /tmp/lambda-test-response.json
```

### 11.5 View Lambda Execution Logs
```bash
aws logs tail /aws/lambda/prod-slack-notifier \
  --region us-east-1 \
  --since 1h \
  --format short
```

---

## Step 12 – Smoke Test End-to-End

### 12.1 DNS Resolution
```bash
nslookup mahima-patel.shop 8.8.8.8
```

### 12.2 Full Traffic Flow Test
```bash
echo "=== HTTP → HTTPS Redirect ==="
curl -sI http://mahima-patel.shop | grep -E "HTTP/|Location:"
# Expected: 301 → Location: https://mahima-patel.shop/

echo "=== HTTPS Response ==="
curl -s -o /dev/null -w "Status: %{http_code} | Time: %{time_total}s\n" https://mahima-patel.shop/

echo "=== Health Check ==="
curl -Lk https://mahima-patel.shop/health

echo "=== TLS Certificate Details ==="
echo | openssl s_client -connect mahima-patel.shop:443 -servername mahima-patel.shop 2>/dev/null \
  | openssl x509 -noout -subject -issuer -enddate
```

Also test real functionality in the browser — sign up, log in, add an expense — since `/health` alone doesn't confirm the database layer works.

### 12.3 Multi-AZ Verification
```bash
for i in {1..10}; do
  curl -s -o /dev/null -w "Request $i: HTTP %{http_code} | Time: %{time_total}s\n" \
    https://mahima-patel.shop/health
done
```

---

## Step 13 – Grafana Setup

### Option A – Grafana Cloud (Quickest)

1. Go to **grafana.com** → Sign up → New Stack
2. **Connections → Data Sources → Add → CloudWatch**
3. Create a read-only IAM user for Grafana:

```bash
aws iam create-user --user-name grafana-cloudwatch-reader --region us-east-1

aws iam attach-user-policy \
  --user-name grafana-cloudwatch-reader \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess

aws iam create-access-key \
  --user-name grafana-cloudwatch-reader \
  --query 'AccessKey.{ID:AccessKeyId,Secret:SecretAccessKey}' \
  --output table
```

4. In Grafana Data Source config, use the access key/secret, region `us-east-1`, and **Save & Test**.

### Option B – Self-Hosted Grafana on EC2
```bash
sudo dnf install -y grafana
sudo sed -i 's/;domain = localhost/domain = grafana.mahima-patel.shop/' \
  /etc/grafana/grafana.ini
sudo systemctl enable grafana-server
sudo systemctl start grafana-server
```

### Key Dashboard Panels to Create

| Panel Title | Data Source | Namespace | Metric | Dimension |
|-------------|-------------|-----------|--------|-----------|
| Frontend CPU % | CloudWatch | FamilyFinance/Frontend | cpu_usage_user | AutoScalingGroupName=prod-frontend-asg |
| Backend CPU % | CloudWatch | FamilyFinance/Backend | cpu_usage_user | AutoScalingGroupName=prod-backend-asg |
| ALB Request Count | CloudWatch | AWS/ApplicationELB | RequestCount | LoadBalancer |
| ALB 5XX Errors | CloudWatch | AWS/ApplicationELB | HTTPCode_Target_5XX_Count | LoadBalancer |
| DynamoDB Errors | CloudWatch | AWS/DynamoDB | SystemErrors | TableName |
| ASG Instance Count | CloudWatch | AWS/AutoScaling | GroupInServiceInstances | AutoScalingGroupName |

---

## Security Hardening Checklist

### Network Security
- [ ] No EC2 instances have public IPs (all in private subnets)
- [ ] Backend EC2s only reachable from Internal LB SG
- [ ] SSM Session Manager used for access — no open port 22 to the internet
- [ ] Sensitive local files (`deploy_key`, `*.pem`) are in `.gitignore`

### TLS / Certificate
- [ ] HTTP → HTTPS redirect verified
- [ ] ACM certificate shows `ISSUED`, auto-renews

### EC2 Hardening
- [ ] No hardcoded AWS credentials in code or environment files
- [ ] App secrets pulled from SSM Parameter Store as `SecureString`, never hardcoded

### WAF Rules Active
- [ ] Managed rule groups attached to external ALB
- [ ] Rate limiting configured

### DynamoDB
- [ ] App tables (`finance_*`) confirmed present via `aws dynamodb list-tables`
- [ ] Access only via EC2 IAM instance role

### Monitoring & Alerting
- [ ] CloudWatch alarms tested
- [ ] Slack webhook set (or intentionally left blank if not used)

### Repo Hygiene
- [ ] Repo kept private except when briefly needed for review/debugging
- [ ] Confirmed sensitive files never made it into git history:
  ```bash
  git log --all --full-history -- deploy_key deploy_key.pub family-finance-keypair.pem
  ```

---

## Cost Estimation

Approximate monthly cost (us-east-1, minimum capacity):

| Resource | Qty | Est. Monthly |
|----------|-----|-------------|
| t3.medium EC2 (frontend) | 2 | ~$60 |
| t3.medium EC2 (backend) | 2 | ~$60 |
| NAT Gateway(s) | 1–3 | $32–97 |
| External ALB | 1 | $20 |
| Internal ALB | 1 | $18 |
| DynamoDB on-demand (6 tables total) | — | $5–50 |
| WAF WebACL + rules | 1 | $10 |
| CloudWatch Logs | — | $10–25 |
| Lambda invocations | — | $1 |
| Route 53 Hosted Zone | 1 | $1 |
| ACM Certificate | 1 | Free |
| **Total estimate** | | **~$220–310/mo** |

**Top cost reduction lever:** NAT Gateways are usually the biggest cost. Using a single shared NAT Gateway instead of one per AZ significantly reduces this, at the cost of losing per-AZ NAT redundancy.

---

## Troubleshooting

### Instance Shows Unhealthy in Target Group

```bash
INSTANCE=$(aws autoscaling describe-auto-scaling-instances \
  --query 'AutoScalingInstances[?AutoScalingGroupName==`prod-backend-asg`].InstanceId' \
  --output text --region us-east-1 | awk '{print $1}')

aws ssm start-session --target "$INSTANCE" --region us-east-1

# Inside the session:
sudo -u appuser pm2 status                 # Is PM2 running? (must be appuser, not root)
sudo -u appuser pm2 logs --lines 50        # Any startup errors?
sudo ss -tlnp | grep 5000                  # Is the port open?
curl -v localhost:5000/health              # Does health check pass locally?
sudo cat /var/log/cloud-init-output.log    # Full boot log — the real place to find failures
```

### ACM Certificate Stuck in PENDING_VALIDATION

```bash
ZONE_ID=$(aws route53 list-hosted-zones \
  --query "HostedZones[?Name=='mahima-patel.shop.'].Id" \
  --output text | sed 's|/hostedzone/||')

aws route53 list-resource-record-sets \
  --hosted-zone-id "$ZONE_ID" \
  --query 'ResourceRecordSets[?Type==`CNAME`].{Name:Name,Value:ResourceRecords[0].Value}' \
  --output table

# Verify DNS delegation from a public resolver
nslookup -type=NS mahima-patel.shop 8.8.8.8
# If still showing the registrar's nameservers: delegation hasn't propagated yet. Wait 30-60 min.
```

### Backend Logs Not in CloudWatch

```bash
sudo systemctl status amazon-cloudwatch-agent
cat /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log | tail -20
```

### Slack Alerts Not Arriving

```bash
aws lambda get-function-configuration \
  --function-name prod-slack-notifier --region us-east-1 \
  --query 'Environment.Variables'
# If SLACK_WEBHOOK_URL is empty, that's expected if you left it blank in tfvars —
# set TF_VAR_SLACK_WEBHOOK_URL and re-apply if you want alerts.

aws logs tail /aws/lambda/prod-slack-notifier --region us-east-1 --since 5m
```

### GitHub Actions: `package-lock.json` Cache Error
```
Error: Some specified paths were not resolved, unable to cache dependencies.
```
This means `backend/package-lock.json` (or the frontend equivalent) is missing from the repo. Run `npm install` locally in that folder and commit the generated lockfile.

### GitHub Actions: CI Dry-Run Health Check Crashes on a Missing Key
If the backend's CI dry-run step fails with something like `GroqError: ... environment variable is missing`, the workflow's test `env:` block needs a dummy value for that key (e.g. `GROQ_API_KEY: test-dummy-key-for-ci-only`). Production still pulls the real key from SSM — this only affects the CI test step.

### SSM Commands Fail with "must be a fully qualified name" (Windows / Git Bash)
This is the Git Bash path-conversion issue from the Prerequisites section — prefix the command with `MSYS_NO_PATHCONV=1`.

### Terraform Apply Fails on Module Dependency

```bash
terraform apply -target=module.vpc
terraform apply -target=module.security_groups
terraform apply -target=module.waf
terraform apply -target=module.alb
terraform apply -target=module.dynamodb
terraform apply -target=module.monitoring
terraform apply -target=module.asg
terraform apply     # final pass
```

---

## Rollback Procedures

### Roll Back a Single Module (e.g., after a bad WAF rule)
```bash
git checkout HEAD~1 -- Terraform/modules/waf/
terraform apply -target=module.waf
```

### Roll Back EC2 Instances (Instance Refresh)
```bash
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name prod-frontend-asg \
  --strategy Rolling \
  --preferences '{"MinHealthyPercentage":50,"InstanceWarmup":300}' \
  --region us-east-1

aws autoscaling describe-instance-refreshes \
  --auto-scaling-group-name prod-frontend-asg \
  --region us-east-1 \
  --query 'InstanceRefreshes[0].{Status:Status,Percentage:PercentageComplete}' \
  --output table
```

### Roll Back a Code Deploy (re-trigger via Git)
```bash
git revert HEAD
git push origin main
# Re-triggers the relevant GitHub Actions deploy workflow with the reverted code
```

### Restore DynamoDB to Point-in-Time
```bash
RESTORE_TIME=$(date -d '-1 hour' -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
               date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)

# For the app data tables:
aws dynamodb restore-table-to-point-in-time \
  --source-table-name finance_users \
  --target-table-name finance_users-restored \
  --restore-date-time "$RESTORE_TIME" \
  --region us-east-1
```
(Only works if Point-in-Time Recovery is enabled on the table.)

### Full Infrastructure Destroy
```bash
# WARNING: Destroys all infrastructure. Back up DynamoDB first if needed.
aws dynamodb create-backup \
  --table-name prod-family-finance \
  --backup-name "pre-destroy-backup-$(date +%Y%m%d)" \
  --region us-east-1

terraform destroy
# Or trigger via Actions tab → "Terraform Infrastructure" → Run workflow → action: destroy
```

---

*Infrastructure managed by Terraform, deployed via GitHub Actions | AWS us-east-1 | Multi-AZ HA*
*Live domain: mahima-patel.shop*
*Estimated cost: ~$220–310/month at minimum capacity*
