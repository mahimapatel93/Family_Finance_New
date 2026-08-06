# Family Finance – Docker Setup & Deployment Guide

## Part 1 – Local Docker Setup

This guide explains how to set up and run the Family Finance application locally using Docker, Docker Compose, AWS CLI, and Amazon DynamoDB.

---

# 1. Prerequisites

Before starting, install the following:

* Git
* Docker Desktop
* AWS CLI
* Node.js (optional for local development outside Docker)
* VS Code (optional)

The application uses:

```text
Frontend  → React
Backend   → Node.js + Express
Database  → Amazon DynamoDB
Container → Docker
Cloud     → AWS
```

AWS Region used by the application:

```text
us-east-1
```

---

# 2. Install Git

Check whether Git is already installed:

```bash
git --version
```

If Git is not installed, download and install Git from the official Git website.

After installation, verify:

```bash
git --version
```

Example:

```text
git version 2.x.x
```

---

# 3. Install Docker Desktop

Install Docker Desktop for Windows.

After installation:

1. Start Docker Desktop.
2. Wait until Docker shows that it is running.
3. Open Git Bash or PowerShell.

Check Docker:

```bash
docker --version
```

Example:

```text
Docker version 28.x.x
```

Check Docker Compose:

```bash
docker-compose --version
```

or:

```bash
docker compose version
```

Example:

```text
Docker Compose version v2.x.x
```

---

# 4. Verify Docker Installation

Run:

```bash
docker run hello-world
```

If Docker is installed correctly, Docker will download and run the `hello-world` image.

This confirms that Docker is working correctly.

---

# 5. Install AWS CLI

The application uses Amazon DynamoDB, so AWS CLI is required to configure and verify AWS resources.

Check whether AWS CLI is already installed:

```bash
aws --version
```

If AWS CLI is not installed, install AWS CLI for Windows.

After installation, verify:

```bash
aws --version
```

Example:

```text
aws-cli/2.x.x Python/3.x Windows/...
```

---

# 6. Configure AWS CLI

Configure AWS credentials:

```bash
aws configure
```

Enter the following when prompted:

```text
AWS Access Key ID:
AWS Secret Access Key:
Default region name:
Default output format:
```

For this project:

```text
Default region name: us-east-1
Default output format: json
```

Example:

```text
AWS Access Key ID: ********
AWS Secret Access Key: ********
Default region name: us-east-1
Default output format: json
```

> Never commit AWS access keys or secret keys to GitHub.

---

# 7. Verify AWS Credentials

Check the AWS identity:

```bash
aws sts get-caller-identity
```

Example:

```json
{
    "UserId": "XXXXXXXX",
    "Account": "XXXXXXXXXXXX",
    "Arn": "arn:aws:iam::XXXXXXXXXXXX:user/username"
}
```

This confirms that AWS CLI is authenticated.

---

# 8. Verify AWS Region

Run:

```bash
aws configure get region
```

Expected:

```text
us-east-1
```

If it is not `us-east-1`, configure it:

```bash
aws configure set region us-east-1
```

Verify again:

```bash
aws configure get region
```

---

# 9. Clone the Project

Clone the project repository:

```bash
git clone <YOUR_REPOSITORY_URL>
```

Example:

```bash
git clone https://github.com/<username>/<repository>.git
```

Move into the project:

```bash
cd family-finance-smart-money-management-for-your-family
```

Check files:

```bash
ls
```

You should see files/folders similar to:

```text
backend/
frontend/
docker-compose.yml
README.md
...
```

---

# 10. Check Docker Compose File

Verify that the project contains:

```text
docker-compose.yml
```

Open it:

```bash
cat docker-compose.yml
```

The Docker Compose configuration should define the required application services.

---

# 11. Check Backend Configuration

Go to the backend:

```bash
cd backend
```

Check files:

```bash
ls
```

Important files include:

```text
package.json
server.js
config/
controllers/
middleware/
scripts/
```

Go back to the project root:

```bash
cd ..
```

---

# 12. Check DynamoDB Configuration

The DynamoDB configuration is located at:

```text
backend/config/dynamodb.js
```

The application uses these tables:

```text
finance_users
finance_families
finance_expenses
finance_bills
finance_investments
```

The AWS region is:

```text
us-east-1
```

---

# 13. Check Existing DynamoDB Tables

Before creating tables, check what already exists:

```bash
aws dynamodb list-tables --region us-east-1
```

Example:

```json
{
    "TableNames": [
        "prod-family-finance"
    ]
}
```

If the required application tables are missing, create them using the project's setup script.

---

# 14. Start Docker Containers

From the project root:

```bash
docker-compose up -d
```

This builds/starts the required containers.

Check container status:

```bash
docker-compose ps
```

Example:

```text
NAME              STATUS
finance-backend   Up
finance-frontend  Up
```

---

# 15. Build Containers

If the Docker images have not been built yet, run:

```bash
docker-compose build
```

Then start:

```bash
docker-compose up -d
```

For a fresh rebuild:

```bash
docker-compose build --no-cache
```

Then:

```bash
docker-compose up -d
```

---

# 16. Check Backend Logs

Check the last 100 backend log lines:

```bash
docker-compose logs backend --tail 100
```

For live logs:

```bash
docker-compose logs -f backend
```

The backend should show something similar to:

```text
Family Finance API Server Running
Port    : 5000
Env     : production
Region  : us-east-1
```

---

# 17. Verify AWS Region Inside Docker

Check the AWS region used by the backend container:

```bash
docker-compose exec backend printenv | grep -E "AWS_REGION|AWS_DEFAULT_REGION|DYNAMODB"
```

Expected:

```text
AWS_REGION=us-east-1
```

---

# 18. Verify DynamoDB Table Names Inside Docker

Run:

```bash
docker-compose exec backend node -e "const {TABLES}=require('./config/dynamodb'); console.log(TABLES)"
```

Expected:

```text
{
  USERS: 'finance_users',
  FAMILIES: 'finance_families',
  EXPENSES: 'finance_expenses',
  BILLS: 'finance_bills',
  INVESTMENTS: 'finance_investments'
}
```

---

# 19. Check DynamoDB Access From Docker

Run:

```bash
docker-compose exec backend node -e "const {DynamoDBClient,ListTablesCommand}=require('@aws-sdk/client-dynamodb'); const c=new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}); c.send(new ListTablesCommand({})).then(x=>console.log(x.TableNames)).catch(e=>console.error(e.name,e.message))"
```

This checks whether the backend container can access DynamoDB.

Expected after setup:

```text
[
  'finance_bills',
  'finance_expenses',
  'finance_families',
  'finance_investments',
  'finance_users'
]
```

---

# 20. Create DynamoDB Tables

The project already contains:

```text
backend/scripts/setupDynamoDB.js
```

Run the setup script inside the backend container:

```bash
docker-compose exec backend node scripts/setupDynamoDB.js
```

This creates:

```text
finance_users
finance_families
finance_expenses
finance_bills
finance_investments
```

---

# 21. Verify DynamoDB Tables Again

Run:

```bash
aws dynamodb list-tables --region us-east-1
```

Expected:

```text
finance_bills
finance_expenses
finance_families
finance_investments
finance_users
```

If another table such as:

```text
prod-family-finance
```

exists, do not delete it unless its purpose is confirmed.

---

# 22. Verify Individual Tables

Check the users table:

```bash
aws dynamodb describe-table \
  --table-name finance_users \
  --region us-east-1
```

Check the families table:

```bash
aws dynamodb describe-table \
  --table-name finance_families \
  --region us-east-1
```

Check expenses:

```bash
aws dynamodb describe-table \
  --table-name finance_expenses \
  --region us-east-1
```

Check bills:

```bash
aws dynamodb describe-table \
  --table-name finance_bills \
  --region us-east-1
```

Check investments:

```bash
aws dynamodb describe-table \
  --table-name finance_investments \
  --region us-east-1
```

---

# 23. Check Frontend

The frontend runs locally on:

```text
http://localhost:3000
```

Open it in a browser:

```text
http://localhost:3000
```

---

# 24. Check Backend API

The backend runs on:

```text
http://localhost:5000
```

If the project has a health endpoint, test:

```text
http://localhost:5000/health
```

or use the API endpoint defined by the project.

---

# 25. Test Signup

Open:

```text
http://localhost:3000/signup
```

Create a test account.

The request should reach:

```text
POST /api/auth/signup
```

The user should be stored in:

```text
finance_users
```

---

# 26. Verify User in DynamoDB

Run:

```bash
aws dynamodb scan \
  --table-name finance_users \
  --region us-east-1
```

If signup was successful, the created user should appear in the response.

---

# 27. Test Login

After successful signup:

1. Open the login page.
2. Enter the same email/username.
3. Enter the password.
4. Click Login.

Check backend logs if login fails:

```bash
docker-compose logs backend --tail 100
```

---

# 28. Useful Docker Commands

## Start application

```bash
docker-compose up -d
```

## Stop application

```bash
docker-compose down
```

## Restart all services

```bash
docker-compose restart
```

## Restart backend

```bash
docker-compose restart backend
```

## Restart frontend

```bash
docker-compose restart frontend
```

## Check containers

```bash
docker-compose ps
```

## View backend logs

```bash
docker-compose logs backend --tail 100
```

## View frontend logs

```bash
docker-compose logs frontend --tail 100
```

## Follow backend logs

```bash
docker-compose logs -f backend
```

## Follow all logs

```bash
docker-compose logs -f
```

## Enter backend container

```bash
docker-compose exec backend sh
```

## Enter frontend container

```bash
docker-compose exec frontend sh
```

---

# 29. Rebuild After Code Changes

If backend code is changed:

```bash
docker-compose build backend
```

Then:

```bash
docker-compose up -d backend
```

For both frontend and backend:

```bash
docker-compose build
docker-compose up -d
```

For a completely fresh rebuild:

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

# 30. Troubleshooting

## Problem: Container is not running

Check:

```bash
docker-compose ps
```

Then check logs:

```bash
docker-compose logs backend --tail 100
```

---

## Problem: DynamoDB `ResourceNotFoundException`

If backend logs show:

```text
ResourceNotFoundException: Requested resource not found
```

Check tables:

```bash
aws dynamodb list-tables --region us-east-1
```

If the required tables are missing:

```bash
docker-compose exec backend node scripts/setupDynamoDB.js
```

Then verify again:

```bash
aws dynamodb list-tables --region us-east-1
```

---

## Problem: AWS Region is incorrect

Check:

```bash
aws configure get region
```

Set:

```bash
aws configure set region us-east-1
```

Check Docker:

```bash
docker-compose exec backend printenv | grep AWS_REGION
```

Expected:

```text
AWS_REGION=us-east-1
```

---

## Problem: Docker cannot access AWS

Check AWS CLI:

```bash
aws sts get-caller-identity
```

Then check DynamoDB:

```bash
aws dynamodb list-tables --region us-east-1
```

If AWS CLI works but Docker does not, check how AWS credentials are provided to the Docker container in `docker-compose.yml`.

---

## Problem: Port 5000 already in use

Check which process is using port 5000.

On Windows:

```bash
netstat -ano | findstr :5000
```

Then stop the conflicting process if necessary.

Alternatively, restart the backend:

```bash
docker-compose restart backend
```

---

## Problem: Port 3000 already in use

Check:

```bash
netstat -ano | findstr :3000
```

Stop the conflicting process or change the frontend port in the Docker Compose configuration.

---

# 31. Docker Compose Warning

You may see:

```text
the attribute `version` is obsolete, it will be ignored
```

This is a Docker Compose warning.

The application can still run.

The old `version:` property can be removed from `docker-compose.yml` as a cleanup step.

---

# 32. AWS SDK Node.js Warning

You may see a warning such as:

```text
NodeVersionSupportWarning
```

For example:

```text
You are running node v20.20.2.
```

This is an AWS SDK compatibility warning.

It does not cause the DynamoDB `ResourceNotFoundException`.

The immediate DynamoDB issue is fixed by ensuring the required tables exist.

---

# 33. Complete Setup Flow

```text
Install Git
     ↓
Install Docker Desktop
     ↓
Install AWS CLI
     ↓
Configure AWS CLI
     ↓
Verify AWS credentials
     ↓
Verify AWS region
     ↓
Clone repository
     ↓
Open project directory
     ↓
Check docker-compose.yml
     ↓
Build Docker images
     ↓
Start Docker containers
     ↓
Check container status
     ↓
Check backend logs
     ↓
Verify AWS_REGION inside Docker
     ↓
Verify DynamoDB configuration
     ↓
Check DynamoDB tables
     ↓
Run setupDynamoDB.js
     ↓
Verify DynamoDB tables
     ↓
Open frontend
     ↓
Test Signup
     ↓
Test Login
     ↓
Verify data in DynamoDB
```

---

# 34. Quick Start Commands

Once all prerequisites are installed and AWS CLI is configured, the basic setup is:

```bash
git clone <YOUR_REPOSITORY_URL>

cd family-finance-smart-money-management-for-your-family

docker-compose build

docker-compose up -d

docker-compose ps

docker-compose logs backend --tail 100

docker-compose exec backend node scripts/setupDynamoDB.js

aws dynamodb list-tables --region us-east-1
```

Then open:

```text
http://localhost:3000
```

---

# 35. Final Local Environment

| Component            | Configuration    |
| -------------------- | ---------------- |
| Operating System     | Windows          |
| Container Runtime    | Docker Desktop   |
| Container Management | Docker Compose   |
| Frontend             | localhost:3000   |
| Backend              | localhost:5000   |
| Backend Runtime      | Node.js          |
| Database             | Amazon DynamoDB  |
| AWS Region           | us-east-1        |
| Backend Deployment   | Docker Container |
| DynamoDB Setup       | setupDynamoDB.js |

---

# 36. Important Security Notes

Do not commit AWS credentials to Git.

Never add the following to GitHub:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
.env
.env.local
```

Make sure sensitive files are included in `.gitignore`.

Example:

```text
.env
.env.*
!.env.example
```

Use `.env.example` for documenting required environment variables without exposing secrets.

---

# Local Setup Completed

The Family Finance application is ready to run locally with:

```text
Docker
   ↓
Frontend
   ↓
Backend
   ↓
AWS DynamoDB
```

The backend uses AWS DynamoDB in:

```text
us-east-1
```

and the required application tables are:

```text
finance_users
finance_families
finance_expenses
finance_bills
finance_investments
```


## Part 2 – Docker Deployment on AWS EC2


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
