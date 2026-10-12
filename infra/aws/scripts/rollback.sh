#!/usr/bin/env bash
# Roll a service back to a previous task-definition revision (i.e. the previous image).
# Usage: AWS_REGION=… ./rollback.sh memed-backend 41
set -euo pipefail
service="$1"; revision="$2"
family="$service"
aws ecs update-service --region "$AWS_REGION" --cluster memed --service "$service" \
  --task-definition "$family:$revision"
aws ecs wait services-stable --region "$AWS_REGION" --cluster memed --services "$service"
echo "$service is now running $family:$revision"
