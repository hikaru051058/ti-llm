#!/usr/bin/env bash
set -euo pipefail

# Creates or updates the factory secret in AWS Secrets Manager.
# Usage: ./scripts/set-factory-secret.sh [aws-profile] [secret-string] [region]
# Reads defaults from .env if present.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."
ENV_FILE="${ROOT_DIR}/.env"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "${ENV_FILE}" | xargs)
fi

PROFILE="${1:-${AWS_PROFILE:-}}"
SECRET_VAL="${2:-${FACTORY_SECRET:-}}"
REGION="${3:-${AWS_REGION:-us-west-2}}"

if [[ -z "${PROFILE}" || -z "${SECRET_VAL}" ]]; then
  echo "Usage: $0 [aws-profile] [secret-string] [region]" >&2
  echo "Either pass secret or set FACTORY_SECRET in .env" >&2
  exit 1
fi

set +e
AWS_PROFILE="${PROFILE}" aws secretsmanager describe-secret \
  --secret-id ti-llm/factory-secret \
  --region "${REGION}" >/dev/null 2>&1
status=$?
set -e

if [[ $status -eq 0 ]]; then
  echo "Updating existing ti-llm/factory-secret..."
  AWS_PROFILE="${PROFILE}" aws secretsmanager put-secret-value \
    --secret-id ti-llm/factory-secret \
    --secret-string "${SECRET_VAL}" \
    --region "${REGION}"
else
  echo "Creating ti-llm/factory-secret..."
  AWS_PROFILE="${PROFILE}" aws secretsmanager create-secret \
    --name ti-llm/factory-secret \
    --secret-string "${SECRET_VAL}" \
    --region "${REGION}"
fi

echo "Done."
