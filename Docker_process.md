# Docker Deployment Guide

This guide describes how to deploy the **Family Finance** application using **Docker and Docker Compose** on an existing private AWS EC2 instance.

The AWS infrastructure is already created using Terraform. This guide does **not** recreate or modify the existing AWS infrastructure.

---

## 1. Existing Architecture

The application uses the following existing AWS infrastructure:

```text
                    Internet
                       |
                       v
              Existing ALB
                       |
                       v
             Private EC2 Instance
              (SSM Session Manager)
                       |
                 Docker Compose
                  /          \
                 /            \
                v              v
        Frontend Container   Backend Container
        Nginx :80            Node.js :5000
                |              |
                +------->------+
                       |
                       v
                Amazon DynamoDB
```

### Important

The following AWS resources are already created and are **not created again** in this deployment:

- VPC
- Subnets
- Security Groups
- Application Load Balancer
- Target Groups
- EC2
- IAM Role
- DynamoDB
- CloudWatch
- Other Terraform-managed resources

The deployment only installs Docker-related software and runs the application containers on the existing EC2 instance.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React / Vite |
| Frontend Server | Nginx |
| Backend | Node.js / Express |
| Database | Amazon DynamoDB |
| AI | Groq API |
| Container Runtime | Docker |
| Container Orchestration | Docker Compose |
| Hosting | Existing AWS Private EC2 |
| Access to EC2 | AWS Systems Manager Session Manager |
| Infrastructure | Existing Terraform infrastructure |

---

## 3. Project Structure

```text
family-finance-smart-money-management-for-your-family/
│
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env                 # created only on the server
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
│
├── frontend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── nginx.conf
│   ├── package.json
│   ├── package-lock.json
│   └── src/
│
├── Terraform/
├── .github/
│   └── workflows/
│
└── docker-compose.yml
```

---

# 4. Docker Configuration

## 4.1 Backend Dockerfile

File:

```text
backend/Dockerfile
```

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 5000

USER node

CMD ["node", "server.js"]
```

---

## 4.2 Backend `.dockerignore`

File:

```text
backend/.dockerignore
```

```text
node_modules
.git
.env
.env.local
npm-debug.log
*.log
```

The `.env` file is excluded from the Docker image because application secrets should not be copied into the image.

---

## 4.3 Frontend Dockerfile

File:

```text
frontend/Dockerfile
```

```dockerfile
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

The frontend is built using Node.js and then served using Nginx.

---

## 4.4 Frontend `.dockerignore`

File:

```text
frontend/.dockerignore
```

```text
node_modules
.git
.env
.env.local
dist
npm-debug.log
*.log
```

---

## 4.5 Nginx Configuration

File:

```text
frontend/nginx.conf
```

```nginx
server {
    listen 80;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://backend:5000/;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The hostname `backend` refers to the backend service inside the Docker Compose network.

---

# 5. Docker Compose

File:

```text
docker-compose.yml
```

Use:

```yaml
services:
  backend:
    build: ./backend
    container_name: finance-backend
    env_file:
      - ./backend/.env
    restart: unless-stopped
    ports:
      - "5000:5000"

  frontend:
    build: ./frontend
    container_name: finance-frontend
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "3000:80"
```

### Note

The old:

```yaml
version: "3.9"
```

line is intentionally removed because current Docker Compose versions no longer require it.

---

# 6. Backend Environment Variables

The `.env` file must be created **only on the EC2 server**.

File:

```text
backend/.env
```

Create it using:

```bash
nano backend/.env
```

Add:

```env
PORT=5000
NODE_ENV=production
AWS_REGION=us-east-1
JWT_SECRET=YOUR_STRONG_SECRET
GROQ_API_KEY=YOUR_GROQ_API_KEY
```

### Security

Do **not** commit `backend/.env` to GitHub.

Do **not** put AWS access keys in this file.

The backend should use the **IAM Role attached to the EC2 instance** to access DynamoDB.

---

# 7. Deployment Using SSM

The EC2 instance is private, so do not use SSH or a public IP.

## Step 1 — Connect to the EC2 instance

Go to:

```text
AWS Console
→ EC2
→ Instances
→ Select the private EC2 instance
→ Connect
→ Session Manager
→ Connect
```

You will get a shell similar to:

```text
sh-5.2$
```

---

# 8. Install Docker

Run:

```bash
sudo dnf update -y
```

Install Docker:

```bash
sudo dnf install -y docker
```

Start Docker:

```bash
sudo systemctl enable --now docker
```

Check Docker:

```bash
docker --version
```

Check Docker service:

```bash
sudo systemctl status docker --no-pager
```

It should show:

```text
Active: active (running)
```

---

# 9. Give the Current User Docker Permission

Run:

```bash
sudo usermod -aG docker $(whoami)
```

Exit the SSM session:

```bash
exit
```

Then reconnect using:

```text
AWS Console
→ EC2
→ Connect
→ Session Manager
→ Connect
```

Check:

```bash
docker ps
```

If there are no containers yet, an empty container list is normal.

---

# 10. Install Docker Compose

Install Docker Compose:

```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
-o /usr/local/bin/docker-compose
```

Make it executable:

```bash
sudo chmod +x /usr/local/bin/docker-compose
```

Check:

```bash
docker-compose version
```

Expected output will look similar to:

```text
Docker Compose version v5.x.x
```

---

# 11. Clone the Application

Move to the home directory:

```bash
cd ~
```

Clone the repository:

```bash
git clone https://github.com/mahimapatel93/family-finance-smart-money-management-for-your-family.git
```

Enter the project:

```bash
cd family-finance-smart-money-management-for-your-family
```

Check the files:

```bash
ls -la
```

You should see:

```text
backend
frontend
Terraform
docker-compose.yml
```

---

# 12. Create Backend Environment File

Run:

```bash
nano backend/.env
```

Add:

```env
PORT=5000
NODE_ENV=production
AWS_REGION=us-east-1
JWT_SECRET=YOUR_STRONG_SECRET
GROQ_API_KEY=YOUR_GROQ_API_KEY
```

Save the file.

Verify:

```bash
ls -la backend/.env
```

Do not display the contents of `.env` in terminal output if it contains real secrets.

---

# 13. Verify the EC2 IAM Role

The existing private EC2 instance should already have an IAM Role.

The role must allow the application to access the required DynamoDB tables.

The application does not need:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

inside `.env`.

The AWS SDK can obtain credentials from the EC2 Instance Role.

---

# 14. Check Docker Before Building

Run:

```bash
docker --version
```

```bash
docker-compose version
```

```bash
docker ps
```

All three commands should work.

---

# 15. Build the Docker Images

From the project root:

```bash
docker-compose build
```

This builds:

```text
finance-backend
finance-frontend
```

The frontend image contains the React production build and Nginx.

The backend image contains the Node.js application.

---

# 16. Start the Application

Run:

```bash
docker-compose up -d
```

Check containers:

```bash
docker ps
```

Expected containers:

```text
finance-backend
finance-frontend
```

Both should show a running status such as:

```text
Up
```

---

# 17. Check Backend Logs

Run:

```bash
docker logs finance-backend --tail 50
```

Look for successful application startup and any DynamoDB or environment-variable errors.

---

# 18. Check Frontend Logs

Run:

```bash
docker logs finance-frontend --tail 50
```

Nginx should start without errors.

---

# 19. Check the Application Locally on EC2

Because the EC2 instance is private, testing from the EC2 shell is useful.

Check frontend:

```bash
curl http://localhost:3000
```

Check backend:

```bash
curl http://localhost:5000
```

The exact backend response depends on the application's available routes.

---

# 20. Access Through the Existing ALB

Do **not** access the application using:

```text
http://<EC2_PUBLIC_IP>:3000
```

The EC2 instance is private.

The expected traffic path is:

```text
Browser
   ↓
Existing ALB
   ↓
Private EC2
   ↓
Frontend Container :3000 → Nginx :80
   ↓
Backend Container :5000
   ↓
DynamoDB
```

Use the existing ALB DNS name or existing application domain.

For example:

```text
http://<EXISTING-ALB-DNS>
```

or, if HTTPS/domain is already configured:

```text
https://<YOUR-DOMAIN>
```

---

# 21. Important ALB Configuration

The existing ALB target group must point to the correct application port.

With the current Compose configuration:

```yaml
ports:
  - "3000:80"
```

the frontend is available on the EC2 host at:

```text
EC2:3000
```

Therefore, the existing ALB target group should send frontend traffic to the EC2 instance on port:

```text
3000
```

The backend does not need to be directly exposed through the ALB because Nginx forwards:

```text
/api/*
```

to:

```text
backend:5000
```

---

# 22. Verify Containers

Run:

```bash
docker ps
```

Example:

```text
CONTAINER ID   IMAGE             STATUS         PORTS
xxxx           finance-backend  Up             0.0.0.0:5000->5000/tcp
xxxx           finance-frontend Up             0.0.0.0:3000->80/tcp
```

---

# 23. Useful Docker Commands

### List running containers

```bash
docker ps
```

### List all containers

```bash
docker ps -a
```

### View backend logs

```bash
docker logs finance-backend --tail 50
```

### View frontend logs

```bash
docker logs finance-frontend --tail 50
```

### Follow backend logs

```bash
docker logs -f finance-backend
```

### Follow frontend logs

```bash
docker logs -f finance-frontend
```

### Stop containers

```bash
docker-compose down
```

### Start containers

```bash
docker-compose up -d
```

### Rebuild and start after code changes

```bash
docker-compose down
docker-compose build
docker-compose up -d
```

### Open a shell inside backend

```bash
docker exec -it finance-backend sh
```

### Open a shell inside frontend

```bash
docker exec -it finance-frontend sh
```

---

# 24. Redeployment After GitHub Changes

When new code is pushed to GitHub:

```bash
cd ~/family-finance-smart-money-management-for-your-family
```

Pull the latest code:

```bash
git pull
```

Rebuild:

```bash
docker-compose build
```

Restart:

```bash
docker-compose down
docker-compose up -d
```

Verify:

```bash
docker ps
```

---

# 25. Troubleshooting

## Docker command not found

Check:

```bash
which docker
```

If Docker is not installed:

```bash
sudo dnf install -y docker
sudo systemctl enable --now docker
```

---

## Docker permission denied

Run:

```bash
sudo usermod -aG docker $(whoami)
```

Then exit the SSM session and reconnect.

Check:

```bash
docker ps
```

---

## Docker Compose command not found

Check:

```bash
docker-compose version
```

If missing:

```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
-o /usr/local/bin/docker-compose

sudo chmod +x /usr/local/bin/docker-compose
```

---

## `.env` not found

Check:

```bash
ls -la backend/.env
```

If missing:

```bash
nano backend/.env
```

Create the file with the required environment variables.

---

## Backend container exits

Check:

```bash
docker logs finance-backend --tail 100
```

Check:

- `JWT_SECRET`
- `GROQ_API_KEY`
- `AWS_REGION`
- DynamoDB permissions
- application startup errors

---

## Backend cannot access DynamoDB

Verify that the EC2 instance has the correct IAM Role.

The application should use the EC2 IAM Role rather than hard-coded AWS credentials.

---

## Frontend is not loading

Check:

```bash
docker logs finance-frontend --tail 100
```

Also check:

```bash
docker ps
```

Then verify the existing ALB target group and security group configuration.

---

## ALB returns 502

Check whether the frontend container is running:

```bash
docker ps
```

Then test from the EC2 instance:

```bash
curl http://localhost:3000
```

If this works but the ALB returns 502, check the existing ALB target group and EC2 security group.

---

# 26. Final Deployment Checklist

Before considering the deployment complete:

```text
[ ] Private EC2 is accessible through SSM
[ ] Docker installed
[ ] Docker service running
[ ] Current user has Docker permission
[ ] Docker Compose installed
[ ] GitHub repository cloned
[ ] backend/.env created
[ ] EC2 IAM Role has required DynamoDB permissions
[ ] Backend Docker image built
[ ] Frontend Docker image built
[ ] Backend container running
[ ] Frontend container running
[ ] Backend logs checked
[ ] Frontend logs checked
[ ] localhost:3000 tested on EC2
[ ] Existing ALB target group points to port 3000
[ ] Existing security groups allow ALB → EC2 traffic
[ ] Application accessible through existing ALB/domain
```

---

## Deployment Summary

The complete deployment process is:

```text
SSM
 ↓
Private EC2
 ↓
Install Docker
 ↓
Install Docker Compose
 ↓
Clone GitHub repository
 ↓
Create backend/.env
 ↓
Build Docker images
 ↓
Start Docker Compose
 ↓
Check containers and logs
 ↓
Existing ALB
 ↓
Application
```

No new AWS infrastructure is created during this process.
