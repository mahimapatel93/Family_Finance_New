# Manual Deployment Guide

## Project

**GharKhata - AI Powered Family Finance Management System**

---

# Objective

This document explains how to manually deploy the GharKhata application on an AWS EC2 instance without using Docker, Kubernetes, or CI/CD tools.

The purpose of this deployment is to understand the complete deployment process before moving towards DevOps automation.

---

# Deployment Architecture

```text
                         Internet
                             │
                             ▼
                      AWS EC2 Instance
                             │
                       ┌─────┴─────┐
                       │   Nginx   │
                       └─────┬─────┘
                             │
                             ▼
                    Node.js Backend (PM2)
                             │
          ┌──────────────────┴──────────────────┐
          ▼                                     ▼
   Amazon DynamoDB                    External APIs
                                (Groq AI & Alpha Vantage)
```

---

# Prerequisites

- AWS Account
- Amazon Linux 2023 EC2 Instance
- GitHub Repository
- SSH Key Pair
- Security Group
- Public IP / Elastic IP
- IAM Role (Recommended)
- DynamoDB Tables Created

---

# Server Configuration

| Component | Version |
|------------|----------|
| OS | Amazon Linux 2023 |
| Node.js | v20+ |
| NPM | Latest |
| PM2 | Latest |
| Nginx | Latest |
| Git | Latest |

---

# Security Group Rules

| Port | Protocol | Purpose |
|------|----------|----------|
|22|TCP|SSH|
|80|TCP|HTTP|
|443|TCP|HTTPS (Future)|

> **Note:** The backend runs internally on **Port 5000** and is accessed through **Nginx Reverse Proxy**. Therefore, Port **5000** does not need to be opened in the Security Group.

---

# Step 1 - Connect to EC2

```bash
ssh -i key.pem ec2-user@<EC2-PUBLIC-IP>
```

---

# Step 2 - Update Server

```bash
sudo dnf update -y
```

---

# Step 3 - Install Git

```bash
sudo dnf install git -y
```

Verify

```bash
git --version
```

---

# Step 4 - Install Node.js

```bash
sudo dnf install nodejs npm -y
```

Verify

```bash
node -v

npm -v
```

---

# Step 5 - Install PM2

```bash
sudo npm install -g pm2
```

Verify

```bash
pm2 -v
```

---

# Step 6 - Install Nginx

```bash
sudo dnf install nginx -y
```

Enable & Start

```bash
sudo systemctl enable nginx

sudo systemctl start nginx
```

Verify

```bash
sudo systemctl status nginx
```

---

# Step 7 - Clone Repository

```bash
git clone https://github.com/<username>/<repository>.git

cd <repository>
```

---

# Step 8 - Backend Deployment

Move to the backend directory.

```bash
cd backend
```

Install project dependencies.

```bash
npm install
```

Create the environment file by copying the example file.

```bash
cp .env.example .env
```

Open the file for editing.

```bash
nano .env
```

Update the required environment variables.

```env
# ============================================================
# Server
# ============================================================
PORT=5000
NODE_ENV=production

# ============================================================
# JWT
# ============================================================
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

# ============================================================
# AWS Configuration
# ============================================================
AWS_REGION=us-east-1

# Leave these blank if you are using an EC2 IAM Role
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# ============================================================
# DynamoDB Table Names
# ============================================================
DYNAMODB_USERS_TABLE=finance_users
DYNAMODB_FAMILIES_TABLE=finance_families
DYNAMODB_EXPENSES_TABLE=finance_expenses
DYNAMODB_BILLS_TABLE=finance_bills
DYNAMODB_INVESTMENTS_TABLE=finance_investments

# ============================================================
# Groq AI
# ============================================================
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile

# ============================================================
# Alpha Vantage
# ============================================================
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key

# ============================================================
# Frontend URL
# ============================================================
FRONTEND_URL=http://<EC2-PUBLIC-IP>

# ============================================================
# Rate Limiting
# ============================================================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

> **Note**
>
> If your EC2 instance has an **IAM Role** attached, keep
> `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` empty.
> AWS SDK will automatically obtain temporary credentials from the IAM Role.

Save and exit (`Ctrl + O`, `Enter`, `Ctrl + X`).

---

## Create DynamoDB Tables

Before starting the backend, the required DynamoDB tables must exist. Run the setup script (defined in `package.json` as `setup-db`):

```bash
npm run setup-db
```

This creates the following tables (with their indexes) if they don't already exist:

- `finance_users`
- `finance_families`
- `finance_expenses`
- `finance_bills`
- `finance_investments`

Verify creation:

```bash
aws dynamodb list-tables --region us-east-1
```

> **Optional** — to load sample/demo data for testing, run:
> ```bash
> npm run seed
> ```

---

## Verify Backend Locally

Before running PM2, verify that the backend starts successfully.

```bash
npm start
```

If the application starts without errors, stop it using:

```bash
Ctrl + C
```

---

## Start Backend with PM2

```bash
pm2 start npm --name gharkhata-backend -- start
```

Check the application status.

```bash
pm2 status
```

View logs.

```bash
pm2 logs
```

Save the PM2 process.

```bash
pm2 save
```

Enable PM2 to start automatically after a reboot.

```bash
pm2 startup
```

Run the command displayed by `pm2 startup`.

Example:

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
```

Save again.

```bash
pm2 save
```

---

## Verify Backend

Check whether the backend is listening on Port **5000**.

```bash
sudo ss -tulpn | grep 5000
```

If everything is configured correctly, the backend should be running successfully under PM2.

---

# Step 9 - Frontend Deployment

Move to the frontend directory.

```bash
cd ../frontend
```

Install project dependencies.

```bash
npm install
```

Create the production build.

```bash
npm run build
```

After a successful build, the generated static files will be available inside the:

```text
dist/
```

---

# Step 10 - Configure Nginx

Create a new Nginx configuration file.

```bash
sudo nano /etc/nginx/conf.d/gharkhata.conf
```

Add the following configuration.

```nginx
server {
    listen 80;

    server_name _;

    root /home/ec2-user/Family_Finance_New/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:5000;

        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Test Nginx Configuration

```bash
sudo nginx -t
```

Expected Output

```text
syntax is ok
test is successful
```

---

## Restart Nginx

```bash
sudo systemctl restart nginx
```

Enable Nginx to start automatically after every reboot.

```bash
sudo systemctl enable nginx
```

Verify Nginx status.

```bash
sudo systemctl status nginx
```

---

# Step 11 - Verify Deployment

Open your browser and visit:

```text
http://<EC2-PUBLIC-IP>
```

### Expected Result

- ✅ Frontend loads successfully.
- ✅ Backend APIs respond correctly.
- ✅ Amazon DynamoDB connection works.
- ✅ User authentication works.
- ✅ AI features (Groq API) work correctly.
- ✅ Investment/Market data APIs (Alpha Vantage) work correctly.

---

# Useful Commands

## PM2 Commands

Restart Backend

```bash
pm2 restart gharkhata-backend
```

Stop Backend

```bash
pm2 stop gharkhata-backend
```

Delete Backend

```bash
pm2 delete gharkhata-backend
```

View Logs

```bash
pm2 logs
```

Check Status

```bash
pm2 status
```

Monitor Application

```bash
pm2 monit
```

---

## Nginx Commands

Restart Nginx

```bash
sudo systemctl restart nginx
```

Reload Configuration

```bash
sudo systemctl reload nginx
```

Check Status

```bash
sudo systemctl status nginx
```

Check Configuration

```bash
sudo nginx -t
```

---

# Troubleshooting

## Backend is Not Starting

Check the PM2 logs.

```bash
pm2 logs
```

Check the backend process.

```bash
pm2 status
```

Restart the backend.

```bash
pm2 restart gharkhata-backend
```

---

## Check Backend Port

Verify that the backend is running on port **5000**.

```bash
sudo ss -tulpn | grep 5000
```

---

## Verify AWS IAM Role

If your application accesses Amazon DynamoDB without AWS Access Keys, verify that the EC2 instance has an IAM Role attached.

```bash
aws sts get-caller-identity
```

If this command returns your account information, the IAM Role is configured correctly.

---

## Verify DynamoDB Access

List the available DynamoDB tables.

```bash
aws dynamodb list-tables --region us-east-1
```

If your tables are displayed, the backend has access to DynamoDB.

---

## Check Nginx Logs

```bash
sudo tail -f /var/log/nginx/error.log
```

Access logs.

```bash
sudo tail -f /var/log/nginx/access.log
```

---

## Restart Services

Restart Nginx.

```bash
sudo systemctl restart nginx
```

Restart Backend.

```bash
pm2 restart gharkhata-backend
```

---

## Check Running Services

```bash
sudo systemctl status nginx
```

```bash
pm2 status
```

---

## Verify Application

Backend Health Check

```bash
curl http://localhost:5000/health
```

Expected response: `{"status":"healthy", ...}`

Frontend

Open your browser.

```text
http://<EC2-PUBLIC-IP>
```

---

# Redeploying After Code Changes

Whenever you push new changes to GitHub, use this flow on the EC2 server to update the live app.

Go to the project folder.

```bash
cd ~/Family_Finance_New
```

Pull the latest code.

```bash
git pull origin main
```

## If Backend Changed

```bash
cd backend
npm install
pm2 restart gharkhata-backend
```

## If Frontend Changed

```bash
cd frontend
npm install
npm run build
sudo systemctl reload nginx
```

> Nginx serves the `dist/` folder directly, so a fresh `npm run build` is enough — no restart of Nginx is strictly required, but a `reload` clears any cache safely.

---

# Deployment Checklist

Before considering the deployment complete, verify the following:

- EC2 instance is running.
- Security Group allows ports **22** and **80**.
- Git is installed.
- Node.js and npm are installed.
- PM2 is installed.
- Nginx is installed and running.
- Repository is cloned successfully.
- Backend dependencies are installed.
- Frontend build is generated.
- `.env` file is configured correctly.
- `npm run setup-db` executed successfully (DynamoDB tables created).
- Amazon DynamoDB tables are accessible.
- EC2 IAM Role is attached (recommended).
- Backend is running on PM2.
- Nginx Reverse Proxy is configured.
- Frontend is accessible through the EC2 Public IP.

---

# Future Improvements

The next deployment phases will include:

- Docker
- Docker Compose
- GitHub Actions
- Jenkins
- Terraform
- AWS Infrastructure Automation
- Amazon ECR
- Kubernetes (Amazon EKS)
- Helm
- ArgoCD (GitOps)
- Prometheus
- Grafana
- Amazon CloudWatch
- SSL using Let's Encrypt
- Custom Domain with Route 53
- CI/CD Pipeline Automation

---

# Conclusion

This deployment demonstrates a complete manual deployment of the **GharKhata – AI Powered Family Finance Management System** on an **Amazon Linux 2023 EC2 instance**.

The application uses:

- **Node.js** for the backend.
- **PM2** for process management.
- **Nginx** as a reverse proxy.
- **Amazon DynamoDB** as the NoSQL database.
- **Groq AI** for AI-powered financial insights.
- **Alpha Vantage API** for investment and market data.

This manual deployment serves as the foundation for future DevOps automation using **Docker, Terraform, GitHub Actions, Jenkins, Kubernetes (Amazon EKS), ArgoCD, Monitoring, and Infrastructure as Code (IaC).**