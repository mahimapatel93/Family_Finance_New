# My Deployment Journey: Deploying My Family Finance App

I deployed my **Family Finance App** to AWS using Terraform and GitHub Actions. It was not easy. I faced many real problems on the way. Here I am sharing what went wrong, why it happened, and how I fixed each one.

If you are also deploying a project with Terraform + GitHub Actions + AWS, this might help you.

**Tech used:** React (frontend), Express.js (backend), DynamoDB, EC2 servers, Load Balancer, Route53 for domain, GitHub Actions for auto-deploy.

---

## 1. S3 Bucket Name Was Already Taken

The first step was to create an S3 bucket for storing Terraform's state file. I ran:

```bash
aws s3api create-bucket --bucket tf-state-family-finance-381061952788 --region us-east-1
```

I got this error:

```
BucketAlreadyExists: The requested bucket name is not available.
```

I was confused because I never made this bucket. Then I learned something important — **S3 bucket names must be unique across the whole world**, not just in your own AWS account. The name in the code had someone else's AWS account number in it.

**How I fixed it:**

```bash
aws sts get-caller-identity --query Account --output text
aws s3api create-bucket --bucket tf-state-family-finance-<my-account-id> --region us-east-1
```

Then I updated the bucket name in `main.tf`.

**What I learned:** Never copy someone else's S3 bucket name. It will clash.

---

## 2. Git Bash Was Changing My Commands Without Telling Me

I was trying to save my SSH key in AWS SSM:

```bash
aws ssm put-parameter --name "/prod/github/deploy_key" --type SecureString --value "$(cat deploy_key)" --region us-east-1
```

Error came:

```
ValidationException: Parameter name must be a fully qualified name.
```

The problem was Git Bash on Windows. It thinks any word starting with `/` is a file path on my computer, so it was silently changing my command before AWS even saw it.

**Fix:**

```bash
MSYS_NO_PATHCONV=1 aws ssm put-parameter --name "/prod/github/deploy_key" ...
```

**What I learned:** On Windows Git Bash, if your AWS command has a `/` in it (like `/prod/app/key`), add `MSYS_NO_PATHCONV=1` before the command.

---

## 3. DNS Was Not Working and I Checked the Wrong Thing

After changing my domain's nameservers to point to AWS, I checked:

```bash
nslookup -type=NS mahima-patel.shop
```

It just timed out. I tried Google's DNS:

```bash
nslookup -type=NS mahima-patel.shop 8.8.8.8
```

This gave `SERVFAIL`. This meant something was really wrong, not just slow.

I found the real problem — there were 2 hosted zones in Route53, and I had copied the nameservers from the wrong one.

**Fix:**

```bash
aws route53 list-hosted-zones --query "HostedZones[].{Name:Name,Id:Id}" --output table
```

I found the correct zone, copied the right nameservers, and updated GoDaddy again.

**What I learned:** Always check DNS using a public DNS server like `8.8.8.8`, not your own network's DNS. And if you have more than one hosted zone, double check you are using the right one.

---

## 4. GitHub Actions Failed Because a File Was Missing

My backend deploy failed with this error:

```
Error: Some specified paths were not resolved, unable to cache dependencies.
```

The reason was simple — `backend/package-lock.json` did not exist in my repo.

**Fix:**

```bash
cd backend
npm install
git add package-lock.json
git commit -m "fix: add missing package-lock.json"
git push origin main
```

**What I learned:** Always commit your `package-lock.json` file. GitHub Actions needs it.

---

## 5. My Test Step Crashed Because of a Missing API Key

Next error:

```
GroqError: The GROQ_API_KEY environment variable is missing or empty
Health check returned HTTP 000000
```

My workflow has a step that starts the server for a moment, just to test if it works, before real deployment. But I forgot to add `GROQ_API_KEY` in that test step. My code tries to connect to Groq AI as soon as the server starts, so without the key, it crashed immediately.

**Fix:** I added a fake key just for testing:

```yaml
GROQ_API_KEY: test-dummy-key-for-ci-only
```

The real key is already stored safely in AWS SSM for the actual production server.

**What I learned:** If your app connects to any external service (like an AI API) right when it starts, your test environment also needs a fake value for it, or your test will fail even if your real app is fine.

---

## 6. Servers Were Not Becoming "Healthy"

This was the hardest one. My GitHub Actions was stuck for 15+ minutes:

```
[900 s] Status: InProgress | Progress: 100%
[930 s] Status: InProgress | Progress: 100%
```

New servers had started, but they were marked "unhealthy" and not working.

I checked the EC2 system log and saw this:

```
Failed to run module scripts-user
[FAILED] Failed to start cloud-final… Execute cloud user/final scripts.
```

This told me the setup script (that installs my app on the server) was failing right at the start. But this log did not show the real reason.

**Fix:** I connected to the server using **AWS Session Manager** (no SSH key needed) and checked the full log:

```bash
sudo cat /var/log/cloud-init-output.log
```

This showed me the exact error and line where it failed.

**What I learned:** The basic system log is not enough. For the real error, always check `/var/log/cloud-init-output.log` inside the server.

---

## 7. Browser Showed a Security Warning

When I opened my load balancer's link directly in the browser with `https://`, I got:

```
Your connection is not private
net::ERR_CERT_COMMON_NAME_INVALID
```

This looked scary but it was normal. My SSL certificate was made for my domain name (`mahima-patel.shop`), not for the load balancer's own AWS link. So the names did not match.

**Fix:** For testing, I used `http://` (without S) on the load balancer's link, or used `curl -k` to ignore this warning. For real use, I used my actual domain, where everything matched fine.

**What I learned:** Don't expect HTTPS to work on a raw AWS link if your certificate is for a different (custom) domain name.

---

## 8. curl Was Giving Me a Redirect Instead of My Answer

```bash
curl http://<load-balancer-link>/health
# → 301 Moved Permanently
```

My load balancer sends all `http` traffic to `https` automatically (this is good for security). But plain `curl` does not follow this redirect by default.

**Fix:**

```bash
curl -Lk http://<load-balancer-link>/health
```

`-L` means follow the redirect, `-k` means ignore the certificate warning.

---

## 9. The Database "Bug" That Was Not Actually a Bug

This is the most important lesson from this whole project, and I got it wrong two times before getting it right.

I noticed my backend code needed 5 separate database tables (`finance_users`, `finance_families`, `finance_expenses`, `finance_bills`, `finance_investments`), but my Terraform code only created **one** table. I thought this was a big bug. I even suggested two wrong fixes before finding the real answer.

The real answer was hiding in a file I had not fully checked: `backend/scripts/setupDynamoDB.js`. My server's setup script was **already** running this file every time a new server started:

```bash
node "$APP_DIR/scripts/setupDynamoDB.js"
```

This script checks if each of the 5 tables exists, and creates them automatically if they don't. So my app was creating its own database tables by itself the whole time. There was no bug at all.

I checked and confirmed:

```bash
aws dynamodb list-tables --region us-east-1
```

All 5 tables were already there.

**What I learned (the biggest lesson):** Before saying something is broken, check the full process from start to end. Don't stop at the first file that looks wrong — there might be another script that already fixes it. And if someone tells you "we did not change this, it was already working" — believe them and look deeper, instead of sticking to your first guess.

---

## 10. IAM Role Did Not Have Enough Permission

While Terraform was creating resources, one `apply` failed halfway with:

```
Error: creating IAM Role: AccessDenied: User is not authorized to perform: iam:CreateRole
```

My AWS user did not have full permission to create IAM roles, which Terraform needs for EC2 instance profiles and Lambda functions.

**Fix:** I checked my IAM user's attached policies in the AWS Console and added the missing permissions (`iam:CreateRole`, `iam:AttachRolePolicy`, `iam:PassRole`). For a personal/learning project, I used a broader policy; for a real production account, I would keep this more restricted.

**What I learned:** Before running `terraform apply` for the first time, check that your AWS user actually has permission to create every type of resource in the plan, not just EC2 and S3.

---

## 11. Security Group Was Blocking My Own Health Checks

Even after my instance was running fine, the Target Group still showed unhealthy. This time the app was actually up (I could see it in `pm2 status`), but the load balancer still could not reach it.

**Fix:** I checked the backend's Security Group inbound rules and found port `5000` was not open to traffic coming from the ALB's Security Group. I added an inbound rule allowing the ALB security group on the app's port.

**What I learned:** "App is running" and "Load balancer can reach the app" are two different things. Always check that your Security Group allows traffic from the ALB, not just from your own IP.

---

## 12. ACM Certificate Validation Timed Out

While running `terraform apply`, it got stuck for a long time on this step and then failed:

```
Error: waiting for ACM Certificate ... to be issued: timeout while waiting for state to become 'ISSUED'
```

This happened because my domain's nameservers had not fully switched over to Route53 yet, so AWS could not verify that I owned the domain.

**Fix:** I waited for full DNS propagation (confirmed with `nslookup ... 8.8.8.8`) before running `apply` again. Once the nameservers were correctly pointing to AWS, the certificate got issued within a few minutes.

**What I learned:** Never run `terraform apply` for a certificate before your domain's DNS delegation is fully confirmed — it will just sit there and eventually time out.

---

## 13. npm ci Failing Locally But Working in GitHub Actions (or vice versa)

At one point, my local `npm install` worked fine, but the GitHub Actions workflow failed with dependency version conflicts using `npm ci`.

**Fix:** `npm ci` is stricter than `npm install` — it installs the exact versions in `package-lock.json` and fails if `package.json` and the lockfile are out of sync. I regenerated the lockfile locally with a fresh `npm install`, committed it, and made sure both files matched before pushing again.

**What I learned:** `npm ci` is what most CI pipelines use, and it is much stricter than `npm install`. Always test with `npm ci` locally before pushing, not just `npm install`.

---

## 14. Protecting My Secret Files Early

While working, I created some secret files (SSH key, server key) in my project folder. Before anything could go wrong, I added them to `.gitignore`:

```gitignore
deploy_key
deploy_key.pub
family-finance-keypair.pem
*.pem
*.key
```

I also checked they were never committed by mistake:

```bash
git log --all --full-history -- deploy_key deploy_key.pub family-finance-keypair.pem
```

Empty result meant they were safe.

**What I learned:** Add secret files to `.gitignore` before you even create them, not after. Removing secrets from git history later is much harder.

---

## Final Setup

| Part | What I Used |
|---|---|
| Infrastructure | Terraform (network, load balancer, servers, database, firewall) |
| Auto-deploy | GitHub Actions |
| How code reaches servers | New servers pull latest code automatically when they start |
| Secrets | AWS SSM Parameter Store |
| Database | DynamoDB, tables created automatically on first server start |
| Domain + SSL | Route53 + AWS Certificate, nameservers pointed from GoDaddy |
| Live site | `https://mahima-patel.shop` |

---

## What I Learned Overall

1. Some AWS resource names (like S3 buckets) must be unique across the whole world, not just your account.
2. Windows Git Bash can silently change your commands — remember `MSYS_NO_PATHCONV`.
3. Always check DNS using a public DNS server, not your own network.
4. Test environments need fake values for every external key your app uses, or tests will fail even if the real app works fine.
5. Basic logs are often not enough — check the deeper/full logs for the real error.
6. SSL certificates only work for the exact domain they were made for.
7. Always check the full process before calling something a "bug." Something might already be fixed by another part of the system you have not checked yet.
8. Protect your secret files before you even create them.
9. Your AWS user needs permission for every resource type in the plan, not just the obvious ones like EC2 and S3.
10. A running app and a load-balancer-reachable app are not the same thing — always check Security Group rules between them.
11. Don't run certificate/domain-related Terraform steps until your DNS delegation is fully confirmed.
12. Use `npm ci` locally too, not just `npm install`, since that's what most CI pipelines actually run.

This project taught me a lot about real-world debugging — much more than any tutorial. If you are stuck on something similar, my biggest advice is: slow down, check the full picture, and always double-check using an independent source (public DNS, real logs, direct AWS commands) instead of trusting the first error message you see.
