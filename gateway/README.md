# Gateway (CDK + Lambda)

Provisioning and Bedrock-backed `/ask` gateway for ESP devices.

## Deploy (via script, uses .env)
```bash
cp .env.example .env   # set AWS_PROFILE, AWS_REGION, FACTORY_SECRET if desired
./scripts/deploy-gateway.sh
```

Or manual:
```bash
cd gateway
npm install         # if node_modules missing
npm run build
npx cdk deploy --profile <aws-profile> --region us-west-2
```

Outputs include:
- `GatewayApiUrl` – base URL with `/prod`.
- `GatewayFunctionName` – for tailing logs.

## Secrets
- `ti-llm/factory-secret` (string) – HMAC key for provisioning.
  - Easiest: `./scripts/set-factory-secret.sh` (reads .env)
  - Create if missing:
    ```bash
    AWS_PROFILE=<profile> aws secretsmanager create-secret \
      --name ti-llm/factory-secret \
      --secret-string "<your-factory-secret>" \
      --region us-west-2
    ```
  - Read (to generate SIG for ESP provisioning):
    ```bash
    AWS_PROFILE=<profile> aws secretsmanager get-secret-value \
      --secret-id ti-llm/factory-secret \
      --query SecretString \
      --output text \
      --region us-west-2
    ```
- `ti-llm/device-keys` (JSON map) – device_id -> api_key. Lambda updates it on provisioning.
  - Create empty if missing:
    ```bash
    AWS_PROFILE=<profile> aws secretsmanager create-secret \
      --name ti-llm/device-keys \
      --secret-string "{}" \
      --region us-west-2
    ```

## API
- `POST /provision` with `{device_id, ts, sig}`. Returns API key (text) on 200.
- `POST /ask` with header `X-ESP-KEY: <api-key>` and body text:
  - `INIT` → `200 OK`
  - `EXIT` → `200 BYE`
  - Other text → forwarded to Bedrock (Claude 3 Haiku), returns text.

## Logs
```bash
AWS_PROFILE=<profile> aws logs tail /aws/lambda/<GatewayFunctionName> --follow --region us-west-2
```

## Manual provisioning test (local)
```bash
DEVICE_ID=esp32-test
PROFILE=<profile>
TS=$(date +%s)
FACTORY_SECRET=$(AWS_PROFILE="$PROFILE" aws secretsmanager get-secret-value \
  --secret-id ti-llm/factory-secret \
  --query SecretString \
  --output text \
  --region us-west-2)
SIG=$(printf "%s:%s" "$DEVICE_ID" "$TS" | openssl dgst -sha256 -hmac "$FACTORY_SECRET" | awk '{print $2}')

curl -i -X POST \
  -H "Content-Type: application/json" \
  --data "{\"device_id\":\"$DEVICE_ID\",\"ts\":$TS,\"sig\":\"$SIG\"}" \
  https://<your-api-id>.execute-api.us-west-2.amazonaws.com/prod/provision
```
