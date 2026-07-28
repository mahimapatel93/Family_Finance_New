# My Deployment Journey: Deploying My Family Finance App

I deployed my Family Finance App to AWS with Terraform and GitHub Actions, and it was nowhere close to a smooth first try. Here's a rundown of everything that broke, why, and how I got past it. Sharing this mostly for my future self, but if you're setting up something similar, hopefully it saves you a few hours.

**Stack:** React frontend, Express backend, DynamoDB, EC2 behind a Load Balancer, Route53 for the domain, GitHub Actions handling deploys.

---

## 1. My S3 bucket name was already taken

First step, create a bucket for Terraform's state file:

```bash
aws s3api create-bucket --bucket tf-state-family-finance-381061952788 --region us-east-1
```

```
BucketAlreadyExists: The requested bucket name is not available.
```

I hadn't created this bucket, so I was stuck for a bit until I realized S3 bucket names are unique across *all* of AWS, not just my account. The name in the repo had someone else's account number baked into it.

```bash
aws sts get-caller-identity --query Account --output text
aws s3api create-bucket --bucket tf-state-family-finance-<my-account-id> --region us-east-1
```

Updated `main.tf` with the new name and moved on. Lesson: never reuse someone else's bucket name, it will always collide.

---

## 2. Git Bash kept silently rewriting my commands

Trying to save an SSH key to SSM:

```bash
aws ssm put-parameter --name "/prod/github/deploy_key" --type SecureString --value "$(cat deploy_key)" --region us-east-1
```

```
ValidationException: Parameter name must be a fully qualified name.
```

Turns out Git Bash on Windows treats anything starting with `/` as a file path and quietly rewrites it before AWS even sees the command. Took me way too long to figure out. The fix is just prefixing the command:

```bash
MSYS_NO_PATHCONV=1 aws ssm put-parameter --name "/prod/github/deploy_key" ...
```

Now it's muscle memory whenever I'm running AWS CLI stuff with `/`-prefixed names on Windows.

---

## 3. Wrong DNS zone, wasted an hour

After pointing my domain to Route53, I checked propagation and just got a timeout. Switched to Google's DNS directly:

```bash
nslookup -type=NS mahima-patel.shop 8.8.8.8
```

Got `SERVFAIL` — a real error, not just "still propagating." Turned out I had two hosted zones in Route53 and had copied the nameservers from the wrong one.

```bash
aws route53 list-hosted-zones --query "HostedZones[].{Name:Name,Id:Id}" --output table
```

Grabbed the right ones, updated GoDaddy again, done. Now I always verify DNS against a public resolver instead of trusting my own network, and double check which zone I'm actually reading from if there's more than one.

---

## 4. GitHub Actions choked on a missing lockfile

```
Error: Some specified paths were not resolved, unable to cache dependencies.
```

`backend/package-lock.json` simply didn't exist in the repo.

```bash
cd backend && npm install
git add package-lock.json
git commit -m "fix: add missing package-lock.json"
git push origin main
```

Obvious in hindsight — always commit the lockfile, CI depends on it.

---

## 5. A crash inside my own "safety check" step

```
GroqError: The GROQ_API_KEY environment variable is missing or empty
Health check returned HTTP 000000
```

My workflow briefly boots the server on the CI runner just to sanity-check it before real deployment. I'd forgotten to give that test step a `GROQ_API_KEY`, and my code initializes the Groq client the instant the server starts — no key, instant crash, no server, no health check.

```yaml
GROQ_API_KEY: test-dummy-key-for-ci-only
```

The real key comes from SSM in production, this was purely a CI blind spot. Good reminder: any external client your app touches on startup needs a dummy value in test environments too.

---

## 6. Servers stuck "unhealthy" with no obvious reason

This one took the longest. GitHub Actions sat there for 15+ minutes with the instance refresh stuck at 100%. New EC2 instances were up but marked unhealthy. The EC2 console's system log only showed:

```
Failed to run module scripts-user
[FAILED] Failed to start cloud-final… Execute cloud user/final scripts.
```

Not useful on its own. I connected via Session Manager (no SSH key needed) and pulled the real log:

```bash
sudo cat /var/log/cloud-init-output.log
```

That's where the actual error was. The basic console log is basically useless for anything your own boot script does — always go straight to `cloud-init-output.log`.

---

## 7. Browser SSL warning that looked scarier than it was

Opened the load balancer's own AWS link with `https://` and got:

```
Your connection is not private
net::ERR_CERT_COMMON_NAME_INVALID
```

Normal, actually — my cert was issued for `mahima-patel.shop`, not the load balancer's auto-generated domain, so the names never matched. For quick tests I just used `http://` or `curl -k`. For anything real, I used the actual domain.

---

## 8. curl kept giving me a redirect instead of an answer

```bash
curl http://<load-balancer-link>/health
# → 301 Moved Permanently
```

The load balancer forces everything to HTTPS, which is good, but plain `curl` doesn't follow redirects by default.

```bash
curl -Lk http://<load-balancer-link>/health
```

`-L` follows it, `-k` skips the cert mismatch from the last issue.

---

## 9. The "bug" that turned out to not be a bug at all

This is the one that taught me the most, mainly because I got it wrong twice before getting it right.

My backend code expected five separate DynamoDB tables — users, families, expenses, bills, investments — but my Terraform only provisioned one. I flagged it as a critical bug and proposed two different fixes, both wrong, before I actually traced the whole thing end to end.

The real answer was sitting in `backend/scripts/setupDynamoDB.js`, which my server's boot script was already calling every time an instance started:

```bash
node "$APP_DIR/scripts/setupDynamoDB.js"
```

It checks if each table exists and creates whatever's missing. My app had been provisioning its own schema on boot the entire time — there was never a mismatch to fix.

```bash
aws dynamodb list-tables --region us-east-1
```

All five were there. Biggest takeaway from this whole project: trace the full process before calling something broken, and if someone tells you "we didn't touch this, it already worked" — believe them and keep digging instead of doubling down on your first theory.

---

## 10. IAM permissions I didn't know I was missing

```
Error: creating IAM Role: AccessDenied: User is not authorized to perform: iam:CreateRole
```

My AWS user didn't have permission to create IAM roles, which Terraform needs for EC2 instance profiles and Lambda. Added the missing permissions and re-ran. For a real production account I'd scope this down properly, but for a personal project a broader policy was fine.

---

## 11. A perfectly running app the load balancer still couldn't reach

Instance was healthy, `pm2 status` showed the app running fine, but the Target Group still marked it unhealthy. Turned out the backend's Security Group wasn't allowing inbound traffic from the ALB's Security Group on port 5000. Added the rule, fixed instantly.

"The app is running" and "the load balancer can reach the app" are not the same thing — worth checking separately.

---

## 12. Certificate validation that just... sat there

`terraform apply` hung for a long time on the ACM certificate step and eventually timed out. The domain's nameservers hadn't fully switched over to Route53 yet, so AWS couldn't verify ownership. Waited for full DNS propagation, confirmed it with a public resolver, ran `apply` again — issued within minutes. Don't bother running certificate-related Terraform steps until DNS delegation is actually confirmed.

---

## 13. npm ci vs npm install being stricter than I expected

Local `npm install` worked fine, GitHub Actions failed on `npm ci` with version conflicts. `npm ci` is much stricter — it needs `package.json` and the lockfile to be perfectly in sync, and fails otherwise. Regenerated the lockfile locally, committed it, and started testing with `npm ci` locally too before pushing.

---

## 14. Locking down secrets before they became a problem

Generated a couple of key files locally (SSH deploy key, EC2 keypair) and added them to `.gitignore` before they had any chance of being committed:

```gitignore
deploy_key
deploy_key.pub
family-finance-keypair.pem
*.pem
*.key
```

Double-checked they never made it into git history:

```bash
git log --all --full-history -- deploy_key deploy_key.pub family-finance-keypair.pem
```

Empty output, all good. Set this up before generating the keys, not after — cleaning secrets out of git history later is a much bigger headache.

---

## Final setup

| Part | What I used |
|---|---|
| Infrastructure | Terraform — network, load balancer, servers, database, firewall |
| Deploys | GitHub Actions |
| Code delivery | New instances pull the latest code automatically on boot |
| Secrets | AWS SSM Parameter Store |
| Database | DynamoDB, tables provisioned automatically on first boot |
| Domain + SSL | Route53 + ACM, nameservers pointed from GoDaddy |
| Live at | `https://mahima-patel.shop` |

---

## What actually stuck with me

- AWS resource names that need to be globally unique (like S3 buckets) will bite you if you copy them from somewhere else.
- Windows Git Bash silently mangles `/`-prefixed arguments — `MSYS_NO_PATHCONV=1` is now automatic for me.
- Always verify DNS against a public resolver, never your own network.
- Test environments need dummy values for every external service your app touches on startup.
- Basic logs rarely have the real answer — go straight to the deeper log.
- SSL certs only work for the exact domain they were issued for.
- A running app isn't the same as a reachable app — check the network path separately.
- Before calling something a bug, trace the whole process end to end. Something you haven't looked at yet might already handle it.
- Protect secret files before you create them, not after.

This project taught me more about real infrastructure debugging than any course did. If you're stuck on something similar, the short version of my advice is: slow down, verify with an independent source instead of trusting the first error message, and read the whole system before deciding something is broken.
