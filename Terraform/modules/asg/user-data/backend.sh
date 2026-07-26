#!/bin/bash
exec > /var/log/user-data.log 2>&1
set -euo pipefail

echo "=== Backend user-data started at $(date) ==="

ENVIRONMENT="${environment}"
AWS_REGION="${aws_region}"
LOG_GROUP="${log_group_name}"
GITHUB_REPO="${github_repo}"
DOMAIN_NAME="${domain_name}"
REPO_DIR="/opt/family-finance-repo"
APP_DIR="/opt/family-finance-backend"
APP_USER="appuser"

IMDS_TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" || echo "")
if [[ -n "$IMDS_TOKEN" ]]; then
  INSTANCE_ID=$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
    http://169.254.169.254/latest/meta-data/instance-id || echo "unknown")
else
  INSTANCE_ID=$(curl -sf http://169.254.169.254/latest/meta-data/instance-id || echo "unknown")
fi
echo "Instance ID: $INSTANCE_ID"

ASG_NAME=$(aws autoscaling describe-auto-scaling-instances \
  --instance-ids "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'AutoScalingInstances[0].AutoScalingGroupName' \
  --output text 2>/dev/null || echo "")
LIFECYCLE_HOOK="${environment}-backend-scale-out-hook"
echo "ASG Name: $ASG_NAME"

echo "=== Installing system packages ==="
dnf update -y
dnf install -y git unzip amazon-cloudwatch-agent --allowerasing
dnf install -y curl --allowerasing

echo "=== Installing Node.js 20 ==="
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
npm install -g pm2
echo "Node: $(node --version), NPM: $(npm --version)"

id -u "$APP_USER" &>/dev/null || useradd -r -m -s /bin/bash "$APP_USER"

echo "=== Setting up SSH deploy key ==="
mkdir -p /root/.ssh
chmod 700 /root/.ssh

aws ssm get-parameter \
  --name "/prod/github/deploy_key" \
  --with-decryption \
  --query Parameter.Value \
  --output text \
  --region "$AWS_REGION" > /root/.ssh/id_ed25519

chmod 600 /root/.ssh/id_ed25519
ssh-keyscan -H github.com >> /root/.ssh/known_hosts 2>/dev/null
echo "=== SSH key configured ==="

echo "=== Cloning $GITHUB_REPO ==="
rm -rf "$REPO_DIR"
git clone "$GITHUB_REPO" "$REPO_DIR"

rm -rf "$APP_DIR"
cp -r "$REPO_DIR/backend" "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo "=== Fetching secrets from SSM ==="

JWT_SECRET=$(aws ssm get-parameter \
  --name "/prod/app/jwt-secret" \
  --with-decryption \
  --query Parameter.Value \
  --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "CHANGE_THIS_IN_SSM_MIN_32_CHARS_LONG")

GROQ_API_KEY=$(aws ssm get-parameter \
  --name "/prod/app/groq-api-key" \
  --with-decryption \
  --query Parameter.Value \
  --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "")

ALPHA_VANTAGE_KEY=$(aws ssm get-parameter \
  --name "/prod/app/alpha-vantage-key" \
  --with-decryption \
  --query Parameter.Value \
  --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "")

# NEW: NewsAPI key (free tier — 500 req/day)
NEWS_API_KEY=$(aws ssm get-parameter \
  --name "/prod/app/news-api-key" \
  --with-decryption \
  --query Parameter.Value \
  --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "")

echo "=== Secrets fetched ==="

cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=5000
AWS_REGION=$AWS_REGION

# DynamoDB table names
DYNAMODB_USERS_TABLE=finance_users
DYNAMODB_FAMILIES_TABLE=finance_families
DYNAMODB_EXPENSES_TABLE=finance_expenses
DYNAMODB_BILLS_TABLE=finance_bills
DYNAMODB_INVESTMENTS_TABLE=finance_investments

# JWT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

# Groq AI
GROQ_API_KEY=$GROQ_API_KEY
GROQ_MODEL=llama-3.3-70b-versatile

# Alpha Vantage
ALPHA_VANTAGE_API_KEY=$ALPHA_VANTAGE_KEY

# News API (free: https://newsapi.org) — NEW
NEWS_API_KEY=$NEWS_API_KEY

# CORS
FRONTEND_URL=https://$DOMAIN_NAME

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
EOF
chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
echo "=== .env written ==="

echo "=== Running npm install ==="
cd "$APP_DIR"
sudo -u "$APP_USER" npm install --omit=dev
echo "=== npm install complete ==="

echo "=== Running DynamoDB table setup ==="
node "$APP_DIR/scripts/setupDynamoDB.js"
echo "=== DynamoDB setup complete ==="

mkdir -p /var/log/app
chown -R "$APP_USER":"$APP_USER" /var/log/app

cat > "$APP_DIR/ecosystem.config.js" <<'PMEOF'
module.exports = {
  apps: [{
    name: 'family-finance-backend',
    script: 'server.js',
    cwd: '/opt/family-finance-backend',
    instances: 'max',
    exec_mode: 'cluster',
    env: { NODE_ENV: 'production', PORT: 5000 },
    out_file: '/var/log/app/backend-out.log',
    error_file: '/var/log/app/backend-error.log',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 10000,
    wait_ready: true,
    listen_timeout: 30000,
  }],
};
PMEOF

echo "=== Starting PM2 ==="
sudo -u "$APP_USER" pm2 start "$APP_DIR/ecosystem.config.js"
sudo -u "$APP_USER" pm2 save
pm2 startup systemd -u "$APP_USER" --hp /home/"$APP_USER"
systemctl enable "pm2-$APP_USER"
echo "=== PM2 started ==="

echo "=== Waiting for backend health ==="
for i in $(seq 1 30); do
  STATUS=$(curl -s -o /dev/null -w "%%{http_code}" http://localhost:5000/health || echo "000")
  echo "Attempt $i/30: HTTP $STATUS"
  if [ "$STATUS" = "200" ]; then
    echo "=== Backend healthy ==="
    break
  fi
  sleep 5
done

cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<CWEOF
{
  "agent": { "metrics_collection_interval": 60, "run_as_user": "cwagent" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          { "file_path": "/var/log/app/backend-out.log",   "log_group_name": "$LOG_GROUP", "log_stream_name": "{instance_id}/backend-app",   "timezone": "UTC" },
          { "file_path": "/var/log/app/backend-error.log", "log_group_name": "$LOG_GROUP", "log_stream_name": "{instance_id}/backend-error", "timezone": "UTC" },
          { "file_path": "/var/log/user-data.log",         "log_group_name": "$LOG_GROUP", "log_stream_name": "{instance_id}/user-data",     "timezone": "UTC" }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "FamilyFinance/Backend",
    "metrics_collected": {
      "cpu": { "measurement": ["cpu_usage_idle","cpu_usage_user","cpu_usage_system"], "metrics_collection_interval": 60, "resources": ["*"] },
      "mem": { "measurement": ["mem_used_percent"], "metrics_collection_interval": 60 },
      "disk": { "measurement": ["used_percent"], "metrics_collection_interval": 60, "resources": ["/"] }
    },
    "append_dimensions": {
      "InstanceId": "$${aws:InstanceId}",
      "AutoScalingGroupName": "$${aws:AutoScalingGroupName}"
    }
  }
}
CWEOF
systemctl enable amazon-cloudwatch-agent
systemctl start amazon-cloudwatch-agent

if [[ -n "$ASG_NAME" && "$ASG_NAME" != "None" ]]; then
  aws autoscaling complete-lifecycle-action \
    --lifecycle-hook-name "$LIFECYCLE_HOOK" \
    --auto-scaling-group-name "$ASG_NAME" \
    --lifecycle-action-result CONTINUE \
    --instance-id "$INSTANCE_ID" \
    --region "$AWS_REGION" || true
fi

echo "=== Backend bootstrap complete at $(date) ==="
