#!/usr/bin/env bash
# One-time creation of the two ECS services after the foundation stack exists.
# Later deploys only register new task-definition revisions and update services
# (see .github/workflows/deploy.yml).
#
# Required env: AWS_REGION AWS_ACCOUNT_ID APP_ORIGIN APP_SECRET_ARN BACKEND_IMAGE FRONTEND_IMAGE PRIVATE_SUBNET_IDS [STACK_NAME]
set -euo pipefail
cd "$(dirname "$0")"
: "${STACK_NAME:=memed-foundation}"

out() { aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

CLUSTER=$(out ClusterName)
SG=$(out ServiceSecurityGroupId)
FRONT_TG=$(out FrontendTargetGroupArn)
BACK_TG=$(out BackendTargetGroupArn)
SUBNETS="${PRIVATE_SUBNET_IDS:?set PRIVATE_SUBNET_IDS as subnet-a,subnet-b}"

./render-task-def.sh ../ecs/backend-task-def.json "$BACKEND_IMAGE" > /tmp/memed-backend-td.json
./render-task-def.sh ../ecs/frontend-task-def.json "$FRONTEND_IMAGE" > /tmp/memed-frontend-td.json
BACK_TD=$(aws ecs register-task-definition --region "$AWS_REGION" --cli-input-json file:///tmp/memed-backend-td.json --query taskDefinition.taskDefinitionArn --output text)
FRONT_TD=$(aws ecs register-task-definition --region "$AWS_REGION" --cli-input-json file:///tmp/memed-frontend-td.json --query taskDefinition.taskDefinitionArn --output text)

NET="awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}"
DEPLOY="deploymentCircuitBreaker={enable=true,rollback=true},minimumHealthyPercent=100,maximumPercent=200"

echo "Initialising database indexes (non-destructive)…"
TASK=$(aws ecs run-task --region "$AWS_REGION" --cluster "$CLUSTER" --launch-type FARGATE \
  --task-definition "$BACK_TD" --network-configuration "$NET" \
  --overrides '{"containerOverrides":[{"name":"backend","command":["node","dist/scripts/init-db.js"]}]}' \
  --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --region "$AWS_REGION" --cluster "$CLUSTER" --tasks "$TASK"

aws ecs create-service --region "$AWS_REGION" --cluster "$CLUSTER" --service-name memed-backend \
  --task-definition "$BACK_TD" --desired-count 2 --launch-type FARGATE \
  --network-configuration "$NET" --deployment-configuration "$DEPLOY" \
  --health-check-grace-period-seconds 30 \
  --load-balancers "targetGroupArn=$BACK_TG,containerName=backend,containerPort=4000"

aws ecs create-service --region "$AWS_REGION" --cluster "$CLUSTER" --service-name memed-frontend \
  --task-definition "$FRONT_TD" --desired-count 2 --launch-type FARGATE \
  --network-configuration "$NET" --deployment-configuration "$DEPLOY" \
  --health-check-grace-period-seconds 30 \
  --load-balancers "targetGroupArn=$FRONT_TG,containerName=frontend,containerPort=3000"

echo "Services created. Waiting for them to become stable…"
aws ecs wait services-stable --region "$AWS_REGION" --cluster "$CLUSTER" --services memed-backend memed-frontend
echo "Done. ALB: $(out LoadBalancerDns)"
