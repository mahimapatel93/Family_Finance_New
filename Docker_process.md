# Docker Deployment Guide

This document describes how the **Family Finance** application is containerized and deployed to a production EC2 instance using Docker and Docker Compose.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite), served via Nginx |
| Backend | Node.js / Express |
| Database | Amazon DynamoDB |
| AI Integration | Groq API |
| Container Runtime | Docker / Docker Compose |
| Hosting | AWS EC2 |
| Infrastructure | Terraform (VPC, SG, ASG, ALB, CloudWatch) |

## Architecture

```
                        EC2 Instance
                        ────────────
   Browser ──▶ frontend container (Nginx, port 3000)
                        │
                proxies /api → backend container (Node/Express, port 5000)
                        │
                Amazon DynamoDB (accessed via EC2 IAM Role)
```

The backend authenticates to DynamoDB using the IAM Role attached to the EC2 instance — no AWS access keys are stored in the application or its containers.

## Project Structure

```
family-finance-smart-money-management-for-your-family/
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env                # not committed — created on the server
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── nginx.conf
│   ├── package.json
│   └── src/
├── Terraform/
├── .github/workflows/
└── docker-compose.yml
```

---

## Docker Files

### `backend/Dockerfile`

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

### `backend/.dockerignore`

```
node_modules
.git
.env
.env.local
npm-debug.log
*.log
```

### `frontend/Dockerfile`

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

### `frontend/.dockerignore`

```
node_modules
.git
.env
.env.local
dist
npm-debug.log
*.log
```

### `frontend/nginx.conf`

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
    }
}
```

### `docker-compose.yml`

```yaml
version: "3.9"

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

### `backend/.env` (server-side only, not committed)

```
PORT=5000
NODE_ENV=production
AWS_REGION=us-east-1
JWT_SECRET=<strong-random-secret>
GROQ_API_KEY=<groq-api-key>
```

---

## Deployment Steps

### 1. Connect to the EC2 instance

```bash
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>
```

### 2. Install Docker and Docker Compose

```bash
sudo yum update -y
sudo yum install docker -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user
exit
```

Reconnect via SSH, then install Compose:

```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 3. Clone the repository

```bash
git clone https://github.com/mahimapatel93/family-finance-smart-money-management-for-your-family.git
cd family-finance-smart-money-management-for-your-family
```

### 4. Create the environment file

```bash
nano backend/.env
```

Populate it with the values shown above.

### 5. Verify the EC2 IAM Role

The instance must have an IAM Role with DynamoDB permissions attached (**EC2 → Security tab → IAM Role**). If none is attached:

1. Create a role with the `AmazonDynamoDBFullAccess` policy (or a scoped equivalent)
2. Attach it via **EC2 → Actions → Security → Modify IAM Role**

### 6. Build and start the containers

```bash
docker-compose up --build -d
```

### 7. Verify the deployment

```bash
docker ps
docker logs finance-backend --tail 50
docker logs finance-frontend --tail 50
```

### 8. Open the required port

In the EC2 Security Group, allow inbound traffic on port `3000` (or restrict it to the Application Load Balancer's security group if traffic is routed through the ALB).

### 9. Access the application

```
http://<EC2_PUBLIC_IP>:3000
```

---

## Operations

| Command | Purpose |
|---|---|
| `docker-compose up --build -d` | Build and start all services in the background |
| `docker-compose down` | Stop and remove all containers |
| `docker-compose logs backend` | View backend logs |
| `docker ps` | List running containers |
| `docker exec -it finance-backend sh` | Open a shell inside the backend container |

### Redeploying after a code update

```bash
git pull
docker-compose down
docker-compose up --build -d
```

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| Application not reachable on port 3000 | Confirm the Security Group allows inbound traffic on that port |
| Backend container exits immediately | Check `docker logs finance-backend` — usually a missing environment variable |
| Backend cannot reach DynamoDB | Verify the IAM Role is attached to the EC2 instance |
| `npm ci` fails during build | Ensure `package-lock.json` is present in `backend/` and `frontend/` |
| `docker` commands return "permission denied" | Reconnect via SSH after running `usermod -a -G docker` |
