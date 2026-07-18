# Manual Deployment Guide

## Project

**GharKhata - AI Powered Family Finance Management System**

---

# Objective

This document explains how to manually deploy the GharKhata application on an AWS EC2 instance without using Docker, Kubernetes, or CI/CD tools.

The purpose of this deployment is to understand the complete deployment process before moving towards DevOps automation.
+
---

# Deployment Architecture

```
                    Internet
                        │
                        ▼
                 AWS EC2 Instance
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
     Nginx                       Node.js Backend
        │                               │
        └───────────────┬───────────────┘
                        │
                        ▼
                    MySQL Database
```

---

# Prerequisites

- AWS Account
- EC2 Ubuntu Instance
- GitHub Repository
- SSH Key Pair
- Security Group
- Public IP

---

# Server Configuration

| Component | Version |
|------------|----------|
| OS | Ubuntu 22.04 |
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
|3000|TCP|Backend Testing|

---

# Step 1 - Connect to EC2

```bash
ssh -i key.pem ubuntu@<EC2-PUBLIC-IP>
```

---

# Step 2 - Update Server

```bash
sudo apt update
sudo apt upgrade -y
```

---

# Step 3 - Install Git

```bash
sudo apt install git -y
```

Verify

```bash
git --version
```

---

# Step 4 - Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

sudo apt install nodejs -y
```

Verify

```bash
node -v

npm -v
```

---

# Step 5 - Install PM2

```bash
sudo npm install pm2 -g
```

Verify

```bash
pm2 -v
```

---

# Step 6 - Install Nginx

```bash
sudo apt install nginx -y
```

Enable

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

Go to backend directory

```bash
cd backend
```

Install dependencies

```bash
npm install
```

Create environment file

```
.env
```

Example

```env
PORT=3000

DB_HOST=

DB_PORT=

DB_NAME=

DB_USER=

DB_PASSWORD=

JWT_SECRET=
```

Start backend

```bash
pm2 start server.js --name gharkhata-backend
```

Check

```bash
pm2 status
```

View Logs

```bash
pm2 logs
```

---

# Step 9 - Frontend Deployment

Move to frontend

```bash
cd frontend
```

Install packages

```bash
npm install
```

Generate production build

```bash
npm run build
```

Output

```
dist/
```

---

# Step 10 - Configure Nginx

Create new configuration

```bash
sudo nano /etc/nginx/sites-available/gharkhata
```

Example

```nginx
server {

    listen 80;

    server_name YOUR_PUBLIC_IP;

    root /home/ubuntu/<repository>/frontend/dist;

    index index.html;

    location / {

        try_files $uri /index.html;

    }

    location /api/ {

        proxy_pass http://localhost:3000;

        proxy_http_version 1.1;

        proxy_set_header Host $host;

        proxy_set_header X-Real-IP $remote_addr;

        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    }

}
```

Enable site

```bash
sudo ln -s /etc/nginx/sites-available/gharkhata /etc/nginx/sites-enabled/
```

Check configuration

```bash
sudo nginx -t
```

Restart Nginx

```bash
sudo systemctl restart nginx
```

---

# Step 11 - Verify Deployment

Open browser

```
http://<EC2-PUBLIC-IP>
```

Expected Result

- Frontend loads successfully
- Backend APIs respond correctly
- Database connection works
- Login functionality works

---

# Useful Commands

Restart Backend

```bash
pm2 restart gharkhata-backend
```

Stop Backend

```bash
pm2 stop gharkhata-backend
```

Delete Process

```bash
pm2 delete gharkhata-backend
```

View Logs

```bash
pm2 logs
```

Restart Nginx

```bash
sudo systemctl restart nginx
```

Reload Nginx

```bash
sudo systemctl reload nginx
```

Check Nginx Status

```bash
sudo systemctl status nginx
```

---

# Troubleshooting

### Port Already in Use

```bash
sudo lsof -i :3000
```

Kill Process

```bash
kill -9 <PID>
```

---

### Check Backend Logs

```bash
pm2 logs
```

---

### Check Nginx Logs

```bash
sudo tail -f /var/log/nginx/error.log
```

---

### Check Running Services

```bash
sudo systemctl status nginx

pm2 status
```

---

# Future Improvements

The next deployment phases will include:

- Docker
- Docker Compose
- GitHub Actions
- Jenkins
- Terraform
- AWS Infrastructure Automation
- Kubernetes (Amazon EKS)
- ArgoCD
- Prometheus
- Grafana
- SSL (Let's Encrypt)
- Domain Configuration

---

# Conclusion

This deployment demonstrates a complete manual deployment of the GharKhata application on AWS EC2. It serves as the foundation for future DevOps automation using containerization, Infrastructure as Code (IaC), CI/CD pipelines, Kubernetes, and GitOps.