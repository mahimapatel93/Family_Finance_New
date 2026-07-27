# family-finance-smart-money-management-for-your-family

Our application is an AI-powered Family Finance Management System designed to help families manage their complete financial life in one platform. The application allows multiple family members to track daily expenses, manage monthly bills, and monitor investments such as SIPs, LIC, and fixed deposits. It also provides real-time gold and silver price tracking to help users make better investment decisions. The most important feature of the application is the AI financial assistant, which analyzes user spending patterns and provides smart suggestions on how to reduce expenses, increase savings, and plan investments. The dashboard and reports section provide visual insights such as category-wise expenses, monthly spending trends, and financial summaries. This application helps users avoid late bill payments, control overspending, improve savings habits, and make smarter financial decisions, ultimately improving the financial stability and planning of the entire family.

![Multi-Tire-Architecture](https://github.com/user-attachments/assets/0ed37d98-6739-4994-9626-b3096a92015d)


# 🏠 Family Finance App

**AI-Powered Family Finance Management System**

An intelligent, comprehensive platform for families to manage finances collaboratively. Track expenses, manage bills, monitor investments, and get AI-driven financial insights—all in one place.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-Production%20Ready-success)

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Why We Created This Project](#why-we-created-this-project)
3. [Key Features](#key-features)
4. [Architecture](#architecture)
5. [Tech Stack](#tech-stack)
6. [System Flow](#system-flow)
7. [Prerequisites](#prerequisites)
8. [Quick Start](#quick-start)
9. [Installation & Setup](#installation--setup)
10. [Configuration](#configuration)
11. [API Endpoints](#api-endpoints)
12. [Project Structure](#project-structure)
13. [Deployment](#deployment)
14. [Monitoring & Observability](#monitoring--observability)
15. [Security](#security)
16. [Troubleshooting](#troubleshooting)
17. [Contributing](#contributing)
18. [License](#license)

---

## 🎯 Project Overview

**Family Finance App** is a modern, cloud-native solution designed to simplify how families manage their finances together. With integrated AI capabilities powered by Groq, real-time market insights, and comprehensive analytics, families can make smarter financial decisions collaboratively.

### Key Highlights:
- ✅ **Multi-user Support** - Manage finances as a family with role-based access
- ✅ **Real-time Analytics** - Interactive dashboards with Recharts visualizations
- ✅ **AI-Powered Insights** - Get financial recommendations using Groq AI
- ✅ **Bill Management** - Never miss a bill with smart reminders and tracking
- ✅ **Investment Tracking** - Monitor your investment portfolio in real-time
- ✅ **Market Intelligence** - Stay updated with financial news and market trends
- ✅ **Enterprise-Grade Security** - JWT authentication, encryption, WAF protection
- ✅ **Scalable Infrastructure** - Auto-scaling on AWS with multi-AZ deployment
- ✅ **Complete Monitoring** - Prometheus + Grafana stack for full observability

---

## 💡 Why We Created This Project

### The Problem:
Family finances are often fragmented—money scattered across different accounts, bills tracked in spreadsheets, no unified view of spending patterns, and lack of financial collaboration. Traditional budgeting apps focus on individuals, not families.

### The Solution:
**Family Finance App** provides a unified platform where:
- **Transparency**: Every family member sees the complete financial picture
- **Collaboration**: Shared expense tracking and bill management
- **Intelligence**: AI-powered insights help families understand spending and plan better
- **Control**: Granular permissions ensure appropriate access levels
- **Growth**: Investment tracking and market insights for wealth building

### Why It Matters:
- Families need to work together on financial goals
- Real-time insights drive better financial decisions
- AI assistance removes complexity from personal finance management
- Cloud-native architecture ensures reliability and scalability

---

## 🌟 Key Features

### 1. **Dashboard & Overview**
- Real-time financial summary
- Spending trends and patterns
- Budget vs. actual comparison
- Family member activity feed

### 2. **Expense Management**
- Quick expense entry with categories
- Receipt uploads and attachments
- Expense splitting between family members
- Recurring expense templates
- Expense analytics and reports

### 3. **Bill Management**
- Bill scheduling and tracking
- Due date reminders
- Payment history
- Bill categorization
- Duplicate bill detection

### 4. **Investment Tracking**
- Portfolio overview
- Individual investment tracking
- Performance metrics
- Historical data analysis
- Risk assessment

### 5. **AI-Powered Insights**
- Smart financial recommendations
- Spending analysis
- Budget optimization suggestions
- Anomaly detection
- Predictive analytics

### 6. **Market Intelligence**
- Real-time financial news
- Market trends and analysis
- Stock/crypto market updates
- Infinite scroll news feed
- Personalized financial news

### 7. **Family Management**
- Add/remove family members
- Role-based access control
- Permission management
- Activity logging
- Invitation system

### 8. **Security & Authentication**
- Secure JWT-based authentication
- Two-step signup with onboarding
- Password encryption (bcryptjs)
- Rate limiting
- CORS protection

---

## 🏗️ Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          INTERNET (HTTPS)                           │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       │ (Route 53)
                       │
┌──────────────────────▼──────────────────────────────────────────────┐
│                    AWS WAF (Web Application Firewall)               │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       │
┌──────────────────────▼──────────────────────────────────────────────┐
│              Application Load Balancer (ALB) - Multi-AZ             │
│  ┌─────────────────────────┬──────────────────────────────────┐   │
│  │ HTTPS Listener (443)    │   HTTP Listener (80 → HTTPS)    │   │
│  └──────────┬──────────────┴──────────────────┬───────────────┘   │
└─────────────┼──────────────────────────────────┼──────────────────┘
              │                                  │
      ┌───────▼──────────────┐         ┌────────▼──────────────┐
      │  Frontend Target     │         │  Backend Target       │
      │  Group (Port 3000)   │         │  Group (Port 5000)    │
      └───────┬──────────────┘         └────────┬──────────────┘
              │                                  │
    ┌─────────▼──────────────────┐    ┌────────▼──────────────────┐
    │  Frontend Auto Scaling     │    │  Backend Auto Scaling     │
    │  Group (EC2 Instances)     │    │  Group (EC2 Instances)    │
    │  ┌──────────────────────┐  │    │  ┌──────────────────────┐ │
    │  │ Frontend Instance 1  │  │    │  │ Backend Instance 1   │ │
    │  │ (React + Node)       │  │    │  │ (Express.js API)     │ │
    │  └──────────────────────┘  │    │  └──────────────────────┘ │
    │  ┌──────────────────────┐  │    │  ┌──────────────────────┐ │
    │  │ Frontend Instance 2  │  │    │  │ Backend Instance 2   │ │
    │  │ (React + Node)       │  │    │  │ (Express.js API)     │ │
    │  └──────────────────────┘  │    │  └──────────────────────┘ │
    │  ┌──────────────────────┐  │    │  ┌──────────────────────┐ │
    │  │ Frontend Instance N  │  │    │  │ Backend Instance N   │ │
    │  │ (React + Node)       │  │    │  │ (Express.js API)     │ │
    │  └──────────────────────┘  │    │  └──────────────────────┘ │
    └────────┬───────────────────┘    └────────┬──────────────────┘
             │                                  │
             │                    ┌─────────────▼──────────────┐
             │                    │  AWS DynamoDB             │
             │                    │  (NoSQL Database)         │
             │                    │  - Users                  │
             │                    │  - Transactions           │
             │                    │  - Bills & Expenses       │
             │                    │  - Investments            │
             │                    │  - Family Data            │
             │                    └──────────────────────────┘
             │
             │ ┌──────────────────────────────────────────┐
             │ │  AWS Services (Backend Tier)             │
             │ │  - CloudWatch Logs                       │
             │ │  - CloudWatch Metrics                    │
             │ │  - SSM Parameter Store                   │
             │ │  - S3 (State Management)                 │
             │ └──────────────────────────────────────────┘
             │
             └──────────────────┬──────────────────────────┐
                                │                          │
                ┌───────────────▼────────────┐ ┌──────────▼───────────┐
                │ Monitoring Stack           │ │ External Services    │
                │ ┌─────────────────────┐   │ │ ┌──────────────────┐ │
                │ │ Prometheus          │   │ │ │ Groq AI API      │ │
                │ │ (Metrics Scraping)  │   │ │ │ (AI Insights)    │ │
                │ └──────────┬──────────┘   │ │ └──────────────────┘ │
                │            │              │ │ ┌──────────────────┐ │
                │ ┌──────────▼──────────┐   │ │ │ News API         │ │
                │ │ Grafana             │   │ │ │ (Market Data)    │ │
                │ │ (Visualization)     │   │ │ └──────────────────┘ │
                │ │ Port: 3001          │   │ └──────────────────────┘
                │ └─────────────────────┘   │
                └────────────────────────────┘
```

### 3-Tier Architecture

```
┌─────────────────────────────────────┐
│    Presentation Layer (Frontend)    │
│  - React 18 with Vite              │
│  - Responsive UI (Tailwind CSS)    │
│  - Charts & Analytics (Recharts)   │
│  - Real-time Updates               │
└────────────────┬────────────────────┘
                 │ (REST APIs)
┌────────────────▼────────────────────┐
│    Business Logic Layer (Backend)   │
│  - Express.js REST API             │
│  - JWT Authentication              │
│  - Input Validation                │
│  - Business Rules Engine           │
│  - Groq AI Integration             │
│  - Market Data Aggregation         │
└────────────────┬────────────────────┘
                 │ (Database Queries)
┌────────────────▼────────────────────┐
│    Data Access Layer                │
│  - AWS DynamoDB                    │
│  - Multi-AZ Replication            │
│  - Auto Scaling                    │
│  - Point-in-time Recovery          │
└─────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose | Version |
|-----------|---------|---------|
| **React** | UI Framework | 18.3.1 |
| **Vite** | Build Tool & Dev Server | 5.3.1 |
| **Tailwind CSS** | Styling | 3.4.4 |
| **React Router** | Client-side Routing | 6.23.1 |
| **Recharts** | Data Visualization | 2.12.7 |
| **Axios** | HTTP Client | 1.7.2 |
| **React Joyride** | Product Tours | 3.0.0 |
| **Lucide React** | Icon Library | 0.383.0 |
| **Date-fns** | Date Manipulation | 3.6.0 |

### Backend
| Technology | Purpose | Version |
|-----------|---------|---------|
| **Express.js** | Web Framework | 4.19.2 |
| **Node.js** | Runtime | 18+ |
| **AWS SDK v3** | AWS Integration | 3.600.0 |
| **DynamoDB** | NoSQL Database | - |
| **JWT** | Authentication | 9.0.2 |
| **Bcryptjs** | Password Hashing | 2.4.3 |
| **Groq SDK** | AI Integration | 0.5.0 |
| **Express Validator** | Input Validation | 7.1.0 |
| **Helmet** | Security Headers | 7.1.0 |
| **Morgan** | HTTP Logging | 1.10.0 |
| **Rate Limiter** | DDoS Protection | 7.3.1 |

### Infrastructure & DevOps
| Technology | Purpose |
|-----------|---------|
| **AWS EC2** | Compute Instances |
| **AWS Auto Scaling Group** | Horizontal Scaling |
| **AWS Application Load Balancer** | Load Balancing |
| **AWS DynamoDB** | NoSQL Database |
| **AWS VPC** | Network Isolation |
| **AWS CloudWatch** | Logging & Monitoring |
| **AWS WAF** | Web Application Firewall |
| **AWS SSM Parameter Store** | Secrets Management |
| **Terraform** | Infrastructure as Code |
| **GitHub Actions** | CI/CD Pipeline |

### Monitoring & Observability
| Technology | Purpose |
|-----------|---------|
| **Prometheus** | Metrics Collection |
| **Grafana** | Metrics Visualization |
| **CloudWatch** | AWS Native Monitoring |

---

## 📊 System Flow

### User Authentication Flow

```
┌──────────────┐
│   User       │
│  (Browser)   │
└──────┬───────┘
       │
       │ 1. Enter Email & Password
       │
       ▼
┌──────────────────────────────────┐
│   Signup/Login Form              │
│   (Frontend - SignupPage.jsx)    │
└──────┬───────────────────────────┘
       │
       │ 2. Validate & Submit
       │
       ▼
┌──────────────────────────────────┐
│   Backend Auth Controller        │
│   - Input Validation             │
│   - Hash Password (bcryptjs)     │
│   - Check User in DynamoDB       │
└──────┬───────────────────────────┘
       │
       │ 3. Generate JWT Token
       │
       ▼
┌──────────────────────────────────┐
│   JWT Token Generation           │
│   - User ID                      │
│   - Expiration                   │
│   - Signature                    │
└──────┬───────────────────────────┘
       │
       │ 4. Return Token
       │
       ▼
┌──────────────────────────────────┐
│   Frontend Auth Context          │
│   - Store Token (localStorage)   │
│   - Update User State            │
│   - Redirect to Dashboard        │
└──────────────────────────────────┘
```

### Expense Entry & Processing Flow

```
┌─────────────────────────┐
│  User Enters Expense    │
│  - Amount              │
│  - Category            │
│  - Date                │
│  - Description         │
└────────┬────────────────┘
         │
         │ Submit Form
         │
         ▼
┌─────────────────────────┐
│  Frontend Validation    │
│  - Check Required       │
│  - Validate Amount      │
│  - Validate Date        │
└────────┬────────────────┘
         │
         │ Valid ✓
         │
         ▼
┌─────────────────────────┐
│  Send to Backend        │
│  (POST /api/expenses)   │
│  + JWT Token            │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Backend Processing             │
│  - Verify JWT Token             │
│  - Validate Input               │
│  - Check User Permission        │
│  - Generate Transaction ID      │
└────────┬────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  Save to DynamoDB                │
│  - expenses_table                │
│  - Transaction Log               │
│  - Family Ledger Update          │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  Trigger AI Analysis             │
│  - Pattern Detection             │
│  - Anomaly Check                 │
│  - Budget Impact                 │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  Return Success Response         │
│  - Transaction ID                │
│  - Timestamp                     │
│  - Updated Balance               │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  Frontend Update                 │
│  - Refresh Dashboard             │
│  - Update Charts                 │
│  - Show Confirmation             │
└──────────────────────────────────┘
```

### AI Insights Generation Flow

```
┌─────────────────────────────────┐
│  User Requests AI Insights      │
│  (Dashboard Action)             │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Frontend sends request          │
│  POST /api/ai/insights           │
│  + User ID & Time Period         │
└────────┬────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Backend AI Controller              │
│  - Fetch User Data from DynamoDB    │
│  - Aggregate Transactions           │
│  - Calculate Metrics                │
│    * Total Spending                 │
│    * Category Distribution          │
│    * Trends                         │
│    * Anomalies                      │
└────────┬─────────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Groq AI API Call                   │
│  - Send aggregated data             │
│  - Request recommendations          │
│  - Ask for budget optimization      │
└────────┬─────────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Parse AI Response                  │
│  - Extract insights                 │
│  - Format recommendations           │
│  - Prioritize actions               │
└────────┬─────────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Cache Results (Optional)           │
│  - Store in DynamoDB               │
│  - Set TTL (24 hours)              │
└────────┬─────────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Return to Frontend                 │
│  - Display Insights                │
│  - Show Recommendations            │
│  - Highlight Action Items          │
└────────────────────────────────────┘
```

### Real-time Monitoring Flow

```
┌──────────────────────────────────┐
│  Application Instances            │
│  (Frontend & Backend ASGs)        │
└──────┬─────────────────────────────┘
       │ Emit Metrics
       │ - CPU, Memory
       │ - Request Rate
       │ - Error Rate
       │ - Response Time
       │
       ▼
┌──────────────────────────────────┐
│  CloudWatch                       │
│  - Collect Metrics                │
│  - Store Logs                     │
│  - Generate Alarms                │
└──────┬─────────────────────────────┘
       │ Scrape Endpoints
       │
       ▼
┌──────────────────────────────────┐
│  Prometheus                       │
│  - Scrape Metrics                 │
│  - Time-series Storage            │
│  - Data Aggregation               │
└──────┬─────────────────────────────┘
       │ Query Metrics
       │
       ▼
┌──────────────────────────────────┐
│  Grafana Dashboards               │
│  - System Health                  │
│  - Application Performance        │
│  - Business Metrics               │
│  - Alert Visualization            │
└──────────────────────────────────┘
```

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed on your system:

### Local Development
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Git** >= 2.30.0
- **Docker** (optional, for containerized development)
- **AWS CLI v2** (for infrastructure management)
- **Terraform** >= 1.6.0 (for IaC)

### AWS Account Requirements
- Active AWS Account with appropriate IAM permissions
- Access to EC2, DynamoDB, ALB, VPC, CloudWatch, WAF
- IAM user with programmatic access (Access Key ID & Secret)

### API Keys & Credentials
- **Groq API Key** (for AI-powered insights)
- **News API Key** (for market intelligence features)
- **AWS Credentials** (IAM Access Key & Secret)

### Verification
```bash
# Verify Node.js
node --version  # Should be >= 18.0.0

# Verify npm
npm --version   # Should be >= 9.0.0

# Verify Terraform (if using IaC)
terraform --version  # Should be >= 1.6.0

# Verify AWS CLI
aws --version   # Should be >= 2.x
```

---

## 🚀 Quick Start

### Option 1: Local Development (Fastest Way to Get Started)

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/FamilyFinanceApp.git
cd FamilyFinanceApp

# 2. Setup Backend
cd backend
npm install
# Configure .env (see Configuration section)
npm run dev

# 3. In another terminal, Setup Frontend
cd frontend
npm install
# Configure .env (see Configuration section)
npm run dev

# 4. Open in browser
# Frontend: http://localhost:5173
# Backend: http://localhost:5000
# API Docs: http://localhost:5000/health
```

### Option 2: Docker (If you prefer containerization)

```bash
# Build containers
docker-compose build

# Run all services
docker-compose up

# Services available at:
# - Frontend: http://localhost:5173
# - Backend: http://localhost:5000
# - Grafana: http://localhost:3001
```

### Option 3: AWS Deployment (Production)

```bash
# See Deployment section below for detailed instructions
cd Terraform
terraform init
terraform plan
terraform apply
```

---

## 💾 Installation & Setup

### Backend Setup

```bash
cd backend

# 1. Install dependencies
npm install

# 2. Create .env file
cat > .env << EOF
# Server Configuration
PORT=5000
NODE_ENV=development
AWS_REGION=us-east-1

# Database
DYNAMODB_TABLE_NAME=family-finance-table

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# CORS
FRONTEND_URL=http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# AI & APIs
GROQ_API_KEY=your-groq-api-key-here
NEWS_API_KEY=your-news-api-key-here

# AWS Configuration
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
EOF

# 3. Setup DynamoDB (if using local/AWS)
npm run setup-db

# 4. Seed sample data (optional)
npm run seed

# 5. Start development server
npm run dev
```

### Frontend Setup

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Create .env file
cat > .env << EOF
VITE_API_URL=http://localhost:5000/api
VITE_APP_NAME=Family Finance
EOF

# 3. Start development server
npm run dev

# 4. Build for production
npm run build
```

### Environment Variables Reference

#### Backend (.env)
```
PORT                        # Server port (default: 5000)
NODE_ENV                    # Environment (development/production)
AWS_REGION                  # AWS region (us-east-1, etc.)
DYNAMODB_TABLE_NAME         # DynamoDB table name
JWT_SECRET                  # Secret key for JWT signing
FRONTEND_URL                # Frontend URL for CORS
RATE_LIMIT_WINDOW_MS        # Rate limit window in milliseconds
RATE_LIMIT_MAX              # Maximum requests per window
GROQ_API_KEY                # API key for Groq AI
NEWS_API_KEY                # API key for news/market data
AWS_ACCESS_KEY_ID           # AWS access key
AWS_SECRET_ACCESS_KEY       # AWS secret key
```

#### Frontend (.env)
```
VITE_API_URL                # Backend API endpoint
VITE_APP_NAME               # Application name
VITE_API_TIMEOUT            # Request timeout in ms
```

---

## ⚙️ Configuration

### AWS DynamoDB Setup

```bash
# 1. Install AWS CLI
# Follow: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html

# 2. Configure AWS credentials
aws configure
# Enter: Access Key ID
# Enter: Secret Access Key
# Enter: Default region (us-east-1)
# Enter: Default output format (json)

# 3. Create DynamoDB table
aws dynamodb create-table \
  --table-name family-finance-table \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# 4. Verify table creation
aws dynamodb describe-table --table-name family-finance-table
```

### API Keys Configuration

#### Groq AI API
1. Visit https://console.groq.com
2. Sign up for free account
3. Generate API key
4. Add to backend .env: `GROQ_API_KEY=your-key`

#### News API
1. Visit https://newsapi.org
2. Sign up for API key
3. Choose plan (free plan available)
4. Add to backend .env: `NEWS_API_KEY=your-key`

---

## 📡 API Endpoints

### Authentication
```
POST   /api/auth/signup           - Register new user
POST   /api/auth/login            - Login user
POST   /api/auth/refresh           - Refresh JWT token
POST   /api/auth/logout            - Logout user
```

### Family Management
```
GET    /api/families              - Get all families
POST   /api/families              - Create new family
GET    /api/families/:id          - Get family details
PUT    /api/families/:id          - Update family
DELETE /api/families/:id          - Delete family
POST   /api/families/:id/members  - Add family member
DELETE /api/families/:id/members/:memberId - Remove member
```

### Expenses
```
GET    /api/expenses              - Get all expenses
POST   /api/expenses              - Create new expense
GET    /api/expenses/:id          - Get expense details
PUT    /api/expenses/:id          - Update expense
DELETE /api/expenses/:id          - Delete expense
GET    /api/expenses/analytics    - Get expense analytics
```

### Bills
```
GET    /api/bills                 - Get all bills
POST   /api/bills                 - Create new bill
GET    /api/bills/:id             - Get bill details
PUT    /api/bills/:id             - Update bill
DELETE /api/bills/:id             - Delete bill
POST   /api/bills/:id/pay         - Mark bill as paid
```

### Investments
```
GET    /api/investments           - Get all investments
POST   /api/investments           - Add new investment
GET    /api/investments/:id       - Get investment details
PUT    /api/investments/:id       - Update investment
DELETE /api/investments/:id       - Delete investment
```

### AI & Insights
```
POST   /api/ai/insights           - Get AI-powered insights
POST   /api/ai/recommendations    - Get financial recommendations
POST   /api/ai/analyze-spending   - Analyze spending patterns
```

### Market & News
```
GET    /api/market/quotes         - Get market quotes
GET    /api/market/trends         - Get market trends
GET    /api/news                  - Get financial news
GET    /api/news/search           - Search news by keyword
```

### Health & Status
```
GET    /health                    - Health check endpoint
```

---

## 📁 Project Structure

```
FamilyFinanceApp/
│
├── 📂 backend/                          # Node.js/Express Backend
│   ├── 📂 config/                       # Configuration files
│   │   ├── database.js                  # DynamoDB config
│   │   └── constants.js                 # App constants
│   │
│   ├── 📂 controllers/                  # Business logic
│   │   ├── auth.controller.js           # Authentication logic
│   │   ├── family.controller.js         # Family management
│   │   ├── expense.controller.js        # Expense operations
│   │   ├── bill.controller.js           # Bill operations
│   │   ├── investment.controller.js     # Investment tracking
│   │   ├── ai.controller.js             # AI insights
│   │   ├── market.controller.js         # Market data
│   │   └── news.controller.js           # News/market intelligence
│   │
│   ├── 📂 routes/                       # API route definitions
│   │   ├── auth.routes.js
│   │   ├── family.routes.js
│   │   ├── expense.routes.js
│   │   ├── bill.routes.js
│   │   ├── investment.routes.js
│   │   ├── ai.routes.js
│   │   ├── market.routes.js
│   │   └── news.routes.js
│   │
│   ├── 📂 middleware/                   # Express middleware
│   │   ├── auth.middleware.js           # JWT validation
│   │   ├── validation.middleware.js     # Input validation
│   │   └── errorHandler.middleware.js   # Error handling
│   │
│   ├── 📂 scripts/                      # Utility scripts
│   │   ├── setupDynamoDB.js             # Database setup
│   │   └── seedData.js                  # Sample data
│   │
│   ├── server.js                        # Main server entry
│   ├── package.json                     # Dependencies
│   └── .env.example                     # Environment template
│
├── 📂 frontend/                         # React Frontend
│   ├── 📂 src/
│   │   ├── 📂 components/               # Reusable components
│   │   │   ├── 📂 layout/
│   │   │   │   ├── AppLayout.jsx        # Main layout
│   │   │   │   └── Navbar.jsx           # Navigation
│   │   │   ├── 📂 dashboard/
│   │   │   │   ├── Dashboard.jsx        # Main dashboard
│   │   │   │   ├── StatsCard.jsx        # Stat cards
│   │   │   │   └── Charts.jsx           # Chart components
│   │   │   ├── 📂 ui/
│   │   │   │   ├── Modal.jsx
│   │   │   │   ├── Form.jsx
│   │   │   │   ├── Button.jsx
│   │   │   │   ├── Card.jsx
│   │   │   │   └── OnboardingTour.jsx   # Product tour
│   │   │   └── 📂 features/
│   │   │       ├── ExpenseForm.jsx
│   │   │       ├── BillManager.jsx
│   │   │       └── InvestmentTracker.jsx
│   │   │
│   │   ├── 📂 pages/                    # Page components
│   │   │   ├── HomePage.jsx
│   │   │   ├── SignupPage.jsx           # Auth pages
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── ExpensesPage.jsx
│   │   │   ├── BillsPage.jsx
│   │   │   ├── InvestmentsPage.jsx
│   │   │   ├── InsightsPage.jsx
│   │   │   ├── MarketInsightsPage.jsx   # News/market
│   │   │   └── FamilyPage.jsx
│   │   │
│   │   ├── 📂 context/                  # React Context
│   │   │   └── AuthContext.jsx          # Auth state management
│   │   │
│   │   ├── 📂 services/                 # API services
│   │   │   ├── api.js                   # API client
│   │   │   ├── authService.js
│   │   │   ├── expenseService.js
│   │   │   └── aiService.js
│   │   │
│   │   ├── 📂 hooks/                    # Custom React hooks
│   │   │   ├── useAuth.js
│   │   │   ├── useExpenses.js
│   │   │   └── useFetch.js
│   │   │
│   │   ├── App.jsx                      # Root component
│   │   └── index.css                    # Global styles
│   │
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js               # Tailwind configuration
│   ├── vite.config.js                   # Vite configuration
│   └── .env.example
│
├── 📂 Terraform/                        # Infrastructure as Code
│   ├── main.tf                          # Root configuration
│   ├── variables.tf                     # Variable definitions
│   ├── outputs.tf                       # Output definitions
│   ├── terraform.tfvars                 # Variable values
│   │
│   └── 📂 modules/                      # Terraform modules
│       ├── 📂 vpc/                      # VPC configuration
│       ├── 📂 security-groups/          # Security groups
│       ├── 📂 alb/                      # Load balancer
│       ├── 📂 asg/                      # Auto-scaling groups
│       ├── 📂 dynamodb/                 # Database
│       ├── 📂 monitoring/               # CloudWatch setup
│       ├── 📂 waf/                      # Web application firewall
│       └── 📂 grafana/                  # Grafana stack
│
├── 📂 .github/
│   └── 📂 workflows/                    # CI/CD Pipelines
│       ├── terraform.yml                # Infrastructure deployment
│       ├── deploy-backend.yml           # Backend deployment
│       └── deploy-frontend.yml          # Frontend deployment
│
├── DEPLOYMENT_GUIDE.md                  # Detailed deployment guide
├── README.md                            # This file
└── .gitignore
```

---

## 🚢 Deployment

### Prerequisites for Deployment
- AWS Account with appropriate IAM permissions
- GitHub repository with Secrets configured
- Terraform installed locally
- AWS CLI configured

### Step-by-Step Deployment

**See `DEPLOYMENT_GUIDE.md` for comprehensive deployment instructions including:**
- AWS setup
- Terraform initialization and validation
- GitHub Actions configuration
- CI/CD pipeline setup
- Environment variables and secrets
- Rollback procedures
- Troubleshooting

**Quick Summary:**
```bash
# 1. Configure AWS credentials
aws configure

# 2. Setup Terraform
cd Terraform
terraform init
terraform plan
terraform apply

# 3. Configure GitHub Secrets
# Add in GitHub repo: Settings > Secrets
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY
# - GROQ_API_KEY
# - NEWS_API_KEY

# 4. Push to GitHub to trigger CI/CD
git push origin main
```

---

## 📊 Monitoring & Observability

### Grafana Dashboard Access
```
URL: https://your-domain/grafana
Default Username: admin
Default Password: [from terraform.tfvars]
Port: 3001 (internal)
```

### Key Metrics Monitored
- **System Health**
  - CPU Utilization
  - Memory Usage
  - Disk I/O
  - Network Traffic

- **Application Performance**
  - Request Rate (RPS)
  - Response Time (p50, p95, p99)
  - Error Rate (4xx, 5xx)
  - Throughput

- **Business Metrics**
  - Active Users
  - Transactions per Hour
  - Average Transaction Value
  - Feature Usage

- **Database Metrics**
  - DynamoDB Read/Write Capacity
  - Query Latency
  - Item Count
  - Throttled Requests

### CloudWatch Logs
```bash
# View backend logs
aws logs tail /aws/ec2/family-finance-backend --follow

# View frontend logs
aws logs tail /aws/ec2/family-finance-frontend --follow

# Search for errors
aws logs filter-log-events \
  --log-group-name /aws/ec2/family-finance-backend \
  --filter-pattern "ERROR"
```

### Setting Up Custom Alarms
```bash
# Create CloudWatch alarm for high error rate
aws cloudwatch put-metric-alarm \
  --alarm-name high-error-rate \
  --alarm-description "Alert when error rate exceeds 5%" \
  --metric-name ErrorRate \
  --namespace FamilyFinance \
  --statistic Average \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold
```

---

## 🔒 Security

### Security Features Implemented

1. **Authentication & Authorization**
   - JWT-based token authentication
   - Bcrypt password hashing
   - Role-based access control (RBAC)
   - Session management

2. **Data Protection**
   - HTTPS/TLS encryption in transit
   - Data encrypted at rest in DynamoDB
   - Input validation & sanitization
   - SQL injection prevention

3. **API Security**
   - Rate limiting (100 requests/15 min)
   - CORS restrictions
   - Helmet.js security headers
   - Request size limits (10MB)

4. **Infrastructure Security**
   - AWS WAF (Web Application Firewall)
   - VPC isolation
   - Security groups with minimal permissions
   - Private subnets for database tier

5. **Best Practices**
   - Environment variables for secrets
   - AWS SSM Parameter Store for API keys
   - No secrets in code/version control
   - Regular security audits recommended

### Security Checklist

```bash
# Before production deployment:
- [ ] Change JWT_SECRET
- [ ] Configure strong CORS policies
- [ ] Enable AWS WAF
- [ ] Setup SSL/TLS certificate
- [ ] Configure VPC security groups
- [ ] Enable DynamoDB encryption
- [ ] Setup CloudWatch alarms
- [ ] Configure backup/recovery
- [ ] Review IAM permissions
- [ ] Enable CloudTrail logging
```

---

## 🐛 Troubleshooting

### Common Issues & Solutions

#### Issue: DynamoDB Table Not Found
```bash
# Solution: Create the table
cd backend
npm run setup-db

# Or manually:
aws dynamodb create-table \
  --table-name family-finance-table \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

#### Issue: CORS Errors
```bash
# Check backend .env:
FRONTEND_URL=http://localhost:5173

# Ensure frontend makes requests to correct backend URL
# In frontend .env:
VITE_API_URL=http://localhost:5000/api
```

#### Issue: JWT Token Expired
```bash
# Solution: The token refresh is automatic via refresh endpoint
# If manual refresh needed:
curl -X POST http://localhost:5000/api/auth/refresh \
  -H "Authorization: Bearer <old-token>"
```

#### Issue: Groq API Rate Limit
```bash
# Solution: Check API key validity
echo $GROQ_API_KEY
# Verify at: https://console.groq.com/keys
```

#### Issue: High Memory Usage
```bash
# Solution: Check Node.js heap
node --max-old-space-size=4096 server.js

# Monitor with:
npm install -g clinic
clinic doctor -- node server.js
```

#### Issue: Database Connection Timeout
```bash
# Check AWS credentials:
aws sts get-caller-identity

# Check DynamoDB table status:
aws dynamodb describe-table --table-name family-finance-table
```

### Debug Mode

```bash
# Enable verbose logging
NODE_DEBUG=* npm run dev

# Check environment variables
printenv | grep FAMILY_FINANCE

# Test API connectivity
curl http://localhost:5000/health
```

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Development Workflow

1. **Fork the repository**
   ```bash
   git clone https://github.com/yourusername/FamilyFinanceApp.git
   cd FamilyFinanceApp
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Make your changes**
   - Write clean, readable code
   - Add comments for complex logic
   - Follow existing code style

4. **Test your changes**
   ```bash
   # Backend
   cd backend && npm test
   
   # Frontend
   cd frontend && npm test
   ```

5. **Commit with clear messages**
   ```bash
   git commit -m "feat: Add amazing feature"
   ```

6. **Push to your fork**
   ```bash
   git push origin feature/amazing-feature
   ```

7. **Create a Pull Request**
   - Describe your changes
   - Link related issues
   - Include screenshots for UI changes

### Code Style Guidelines
- Use meaningful variable names
- Keep functions focused and small
- Comment complex business logic
- Write tests for new features
- Follow existing patterns

### Commit Message Format
```
type: subject

- type: feat, fix, docs, style, refactor, test, chore
- subject: brief description (50 chars)
- body: detailed explanation (wrap at 72 chars)
```

---

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 📞 Support & Contact

### Getting Help
- **Documentation**: Check `/docs` folder
- **Issues**: GitHub Issues for bug reports
- **Discussions**: GitHub Discussions for questions
- **Email**: support@familyfinance.local

### Resources
- [Express.js Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [AWS DynamoDB Guide](https://docs.aws.amazon.com/dynamodb/)
- [Terraform Documentation](https://www.terraform.io/docs/)
- [Groq API Documentation](https://console.groq.com/docs/)

---

## 🎉 Acknowledgments

- Built with modern web technologies
- Powered by AWS cloud infrastructure
- AI capabilities from Groq
- Market data from News API
- Thanks to all contributors

---

## 📈 Roadmap

### v1.1 (Coming Soon)
- [ ] Mobile app (React Native)
- [ ] Multi-currency support
- [ ] Advanced reporting
- [ ] Budget forecasting

### v1.2
- [ ] Bank account integration
- [ ] Automated bill payments
- [ ] Machine learning insights
- [ ] Family goals management

### v2.0 (Future)
- [ ] Blockchain transaction security
- [ ] Advanced investment analytics
- [ ] Tax optimization features
- [ ] API for third-party integrations

---

**Last Updated**: March 2026  
**Version**: 1.0.0  
**Status**: Production Ready ✅

---

Made with ❤️ by the Family Finance Team
