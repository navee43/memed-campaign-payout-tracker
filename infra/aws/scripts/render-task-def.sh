#!/usr/bin/env bash
# Fills the ${...} placeholders in an ECS task-definition template.
# Usage: AWS_ACCOUNT_ID=… AWS_REGION=… APP_ORIGIN=https://app.example.com \
#        APP_SECRET_ARN=arn:aws:secretsmanager:<region>:<account>:secret:memed/production-AbCdEf \
#        ./render-task-def.sh ../ecs/backend-task-def.json <image-uri> > backend.json
# APP_SECRET_ARN is the FULL ARN (with its 6-character suffix) of the JSON secret
# holding MONGODB_URI, JWT_ACCESS_SECRET, VIEW_UPDATE_SERVICE_KEY and REDIS_URL.
set -euo pipefail
template="$1"
image="$2"
: "${AWS_ACCOUNT_ID:?set AWS_ACCOUNT_ID}" "${AWS_REGION:?set AWS_REGION}"
export APP_ORIGIN="${APP_ORIGIN:-https://example.invalid}"
export APP_SECRET_ARN="${APP_SECRET_ARN:-}"
# Only substitute our own variables; never touch anything else in the JSON.
if grep -q 'APP_SECRET_ARN' "$template" && [ -z "$APP_SECRET_ARN" ]; then
  echo "APP_SECRET_ARN is required for $template" >&2
  exit 1
fi
envsubst '${AWS_ACCOUNT_ID} ${AWS_REGION} ${APP_ORIGIN} ${APP_SECRET_ARN}' < "$template" \
  | jq --arg image "$image" '.containerDefinitions[0].image = $image'
