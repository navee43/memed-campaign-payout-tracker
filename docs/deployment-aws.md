# Deploying Meme'd to AWS

This is the production path: **ECS Fargate** for both containers, one **Application Load Balancer** (HTTPS via ACM) that routes `/api/*` to the backend and everything else to the frontend, **MongoDB Atlas** for data, **ElastiCache Redis** for cache/rate limits, **Secrets Manager** for secrets and **CloudWatch** for logs, metrics and alarms. Images live in **ECR** and are built and deployed by GitHub Actions.

> Status: everything below is written and statically checked (task-definition rendering is tested, the CloudFormation template passes `cfn-lint`), but it has **not** been run against a real AWS account from this repository. Do the first deployment by hand with these steps and watch each one.

```
                 ┌────────────── ALB (443, ACM cert) ──────────────┐
 browser ──HTTPS─▶  /api/*  ──▶ memed-backend  (Fargate, :4000) ──┼──▶ MongoDB Atlas (TLS, replica set)
                 │  /*      ──▶ memed-frontend (Fargate, :3000)   │──▶ ElastiCache Redis (TLS)
                 └──────────────────────────────────────────────────┘
       logs → CloudWatch Logs (/ecs/memed-*)   alarms → SNS
```

## Why one origin

The browser only ever talks to `https://your.domain`. `/api/*` is forwarded by the ALB to the backend, so:

- auth cookies are **first-party** (`HttpOnly`, `Secure`, `SameSite=Lax`), no third-party-cookie problems;
- CORS is effectively unused in production (`CORS_ORIGINS` is still set to the app origin as a guard, and the CSRF middleware checks `Origin` against it);
- the frontend is built with `NEXT_PUBLIC_API_BASE_URL=/api`.

TLS terminates at the ALB. The backend sets `TRUST_PROXY=1` so `req.ip` (used for rate limiting and audit logs) is the client's address from `X-Forwarded-For`, not the ALB's.

## 0. Prerequisites

- AWS CLI v2, `jq`, `envsubst` (gettext), Docker with buildx.
- A VPC with **two public subnets** (ALB) and **two private subnets with a NAT gateway** (tasks, Redis).
- A domain and an **ACM certificate** for it in the deployment region.
- A **MongoDB Atlas** cluster (any tier — all are replica sets, which the payout engine requires).

Placeholders used below: `<region>`, `<account-id>`, `<domain>`.

## 1. MongoDB Atlas

1. Create a cluster and a database user with `readWrite` on database `memed`.
2. **Network access**: allow-list the Elastic IP(s) of your NAT gateway(s) — that is the egress address of the Fargate tasks. (For stricter setups use Atlas PrivateLink.)
3. Copy the `mongodb+srv://` connection string. Atlas enforces TLS; no extra driver options are needed.

## 2. Foundation stack (CloudFormation)

```bash
aws cloudformation deploy \
  --region <region> \
  --stack-name memed-foundation \
  --template-file infra/aws/cloudformation/memed-foundation.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      VpcId=vpc-xxxx \
      PublicSubnetIds=subnet-pub-a,subnet-pub-b \
      PrivateSubnetIds=subnet-priv-a,subnet-priv-b \
      CertificateArn=arn:aws:acm:<region>:<account-id>:certificate/xxxx \
      AlarmEmail=ops@<domain>
```

It creates: ECR repositories (scan on push, immutable tags), the `memed` ECS cluster (Container Insights on), the ALB with HTTP→HTTPS redirect and the `/api/*` rule, two target groups (backend health check = **readiness** `/api/health/ready`), security groups (only the ALB reaches tasks; only tasks reach Redis), IAM roles (`memed-ecs-execution` can read only `memed/production*` secrets; the backend task role has no permissions), CloudWatch log groups (30-day retention), a 2-node Multi-AZ ElastiCache Redis with TLS, and alarms for backend 5xx, zero healthy backends, and payout-transaction contention.

Point `<domain>` at the `LoadBalancerDns` output (Route 53 alias or CNAME).

## 3. Secrets

One JSON secret holds every backend secret:

```bash
aws secretsmanager create-secret --region <region> --name memed/production --secret-string "$(jq -n \
  --arg mongo 'mongodb+srv://USER:PASS@cluster.xxxx.mongodb.net/memed?retryWrites=true&w=majority' \
  --arg jwt "$(openssl rand -base64 48)" \
  --arg svc "$(openssl rand -hex 32)" \
  --arg redis "rediss://$(aws cloudformation describe-stacks --stack-name memed-foundation --region <region> --query "Stacks[0].Outputs[?OutputKey=='RedisPrimaryEndpoint'].OutputValue" --output text):6379" \
  '{MONGODB_URI:$mongo, JWT_ACCESS_SECRET:$jwt, VIEW_UPDATE_SERVICE_KEY:$svc, REDIS_URL:$redis}')"

aws secretsmanager describe-secret --region <region> --secret-id memed/production --query ARN --output text
# → APP_SECRET_ARN (full ARN, including the 6-character suffix)
```

`VIEW_UPDATE_SERVICE_KEY` is the credential your view-ingestion service sends in `X-Service-Key` to `PATCH /api/submissions/:id/views`. Production runs `VIEW_UPDATE_MODE=internal`; the API refuses to start in `simulation` mode in production unless explicitly overridden.

## 4. First image push and services

```bash
export AWS_REGION=<region> AWS_ACCOUNT_ID=<account-id> APP_ORIGIN=https://<domain>
export APP_SECRET_ARN=arn:aws:secretsmanager:<region>:<account-id>:secret:memed/production-AbCdEf
export PRIVATE_SUBNET_IDS=subnet-priv-a,subnet-priv-b
REG=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
TAG=$(git rev-parse --short HEAD)

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $REG
docker buildx build --platform linux/amd64 -f backend/Dockerfile -t $REG/memed-backend:$TAG --push .
docker buildx build --platform linux/amd64 -f frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=/api --build-arg NEXT_PUBLIC_SITE_URL=$APP_ORIGIN \
  -t $REG/memed-frontend:$TAG --push .

BACKEND_IMAGE=$REG/memed-backend:$TAG FRONTEND_IMAGE=$REG/memed-frontend:$TAG \
  infra/aws/scripts/create-services.sh
```

`create-services.sh` renders the task definitions in `infra/aws/ecs/`, runs a one-off **`init-db`** task (creates collections and missing indexes; never drops anything), then creates both services with 2 tasks each, the deployment circuit breaker with automatic rollback, and `minimumHealthyPercent=100` so deployments never reduce capacity.

Optional demo data (never on a real production database): run a one-off task with command `["node","dist/scripts/seed.js"]` and environment `SEED_ALLOW_PRODUCTION=true`.

## 5. Continuous deployment (GitHub Actions)

`.github/workflows/deploy.yml` builds and pushes both images tagged with the commit SHA, runs `init-db`, then rolls out backend and frontend and waits for stability, followed by a smoke test of `/api/health/ready`.

1. Create an IAM role trusted by GitHub's OIDC provider (`token.actions.githubusercontent.com`) for this repository, allowed to push to the two ECR repositories, `ecs:RegisterTaskDefinition`, `ecs:UpdateService`, `ecs:DescribeServices`, `ecs:RunTask`, `ecs:DescribeTasks`, and `iam:PassRole` on `memed-ecs-execution` and `memed-backend-task`.
2. Set repository **variables**: `AWS_DEPLOY_ENABLED=true`, `AWS_REGION`, `AWS_ACCOUNT_ID`, `AWS_DEPLOY_ROLE_ARN`, `APP_ORIGIN`, `APP_SECRET_ARN`, `PRIVATE_SUBNET_IDS`.

No long-lived AWS keys are stored in GitHub.

## 6. Environment variable mapping

| Variable | Where it comes from in AWS |
|---|---|
| `MONGODB_URI`, `JWT_ACCESS_SECRET`, `VIEW_UPDATE_SERVICE_KEY`, `REDIS_URL` | Secrets Manager `memed/production` → task definition `secrets` |
| `NODE_ENV=production`, `PORT`, `TRUST_PROXY=1`, `COOKIE_SECURE=true`, `CORS_ORIGINS=$APP_ORIGIN`, `VIEW_UPDATE_MODE=internal`, `DB_AUTO_INDEX=false`, `SHUTDOWN_GRACE_MS=25000` | Task definition `environment` (`infra/aws/ecs/backend-task-def.json`) |
| `NEXT_PUBLIC_API_BASE_URL=/api`, `NEXT_PUBLIC_SITE_URL` | Docker **build args** of the frontend image (public, inlined at build) |
| `AWS_REGION`, `AWS_ACCOUNT_ID`, … | GitHub repository variables (deployment tooling only) |

## 7. Reliability notes

- **Graceful shutdown.** ECS sends `SIGTERM`; the API marks itself not-ready (readiness returns 503 so the ALB stops sending traffic), stops the reconciliation job, stops accepting connections, finishes in-flight requests, then closes MongoDB and Redis. `SHUTDOWN_GRACE_MS` (25 s) is below the container `stopTimeout` (30 s); target-group deregistration delay is 20 s.
- **Readiness vs liveness.** `/api/health/live` (container health check) only proves the process responds. `/api/health/ready` (ALB) also pings MongoDB; Redis being down reports `degraded` but stays 200, because Redis is not needed for correctness.
- **Multiple instances.** All state is in MongoDB/Redis; any number of tasks can run. Money is protected by MongoDB transactions, not by Redis locks. The periodic reconciliation job takes a Redis lock purely to avoid duplicate work.
- **Persistent data** never lives in containers (Atlas, ElastiCache).
- **No destructive automatic DB changes.** `DB_AUTO_INDEX=false` in production; `init-db` only creates.
- **Keep-alive.** The API's `keepAliveTimeout` (65 s) exceeds the ALB idle timeout (60 s) to avoid sporadic 502s.

## 8. Rollback

Every deploy registers a new task-definition revision pointing at an immutable image tag. To go back:

```bash
aws ecs list-task-definitions --family-prefix memed-backend --sort DESC --max-items 5
AWS_REGION=<region> infra/aws/scripts/rollback.sh memed-backend <previous-revision>
```

The deployment circuit breaker also rolls back automatically when new tasks fail health checks.

## 9. Logs and health

```bash
aws logs tail /ecs/memed-backend --follow --format short --region <region>
aws logs tail /ecs/memed-backend --since 1h --filter-pattern '{ $.msg = "audit:VIEWS_UPDATED" }'
aws logs tail /ecs/memed-backend --since 1h --filter-pattern '{ $.level >= 50 }'      # errors
curl -s https://<domain>/api/health/ready
```

Logs are JSON (pino) with a `requestId` on every line; the same id is returned to clients in `X-Request-Id` and included in error bodies, so a user-reported error can be traced in one query.
