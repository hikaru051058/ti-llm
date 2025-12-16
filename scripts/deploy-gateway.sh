#!/usr/bin/env bash
set -euo pipefail

# Deploys the gateway CDK stack.
# Usage: ./scripts/deploy-gateway.sh [aws-profile] [region]
# If not provided, uses env (AWS_PROFILE/AWS_REGION) or .env values.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."
ENV_FILE="${ROOT_DIR}/.env"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "${ENV_FILE}" | xargs)
fi

PROFILE="${1:-${AWS_PROFILE:-}}"
REGION="${2:-${AWS_REGION:-us-west-2}}"

if [[ -z "${PROFILE}" ]]; then
  echo "Usage: $0 [aws-profile] [region]" >&2
  exit 1
fi

GATEWAY_DIR="${ROOT_DIR}/gateway"

echo "==> Using profile: ${PROFILE}, region: ${REGION}"
cd "${GATEWAY_DIR}"

if [[ ! -d node_modules ]]; then
  echo "==> Installing npm dependencies..."
  npm install
fi

echo "==> Building..."
npm run build

echo "==> Deploying CDK stack..."
npx cdk deploy --profile "${PROFILE}" --region "${REGION}"

echo "==> Done."
