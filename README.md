# ti-llm mono-repo

Gateway + ESP + TI for a minimal LLM link.

## Quick start
1) Copy env template and set values:
   ```bash
   cp .env.example .env
   # edit .env: AWS_PROFILE, AWS_REGION, FACTORY_SECRET, URLs if known
   ```
2) Set factory secret in Secrets Manager:
   ```bash
   ./scripts/set-factory-secret.sh        # uses .env defaults
   ```
3) Deploy gateway:
   ```bash
   ./scripts/deploy-gateway.sh            # uses .env defaults
   ```
4) Flash ESP (set Wi-Fi/secret/URLs in `esp/src/main.cpp`), then:
   ```bash
   cd esp
   pio run -t upload
   pio device monitor --baud 115200 --eol LF --echo
   ```
5) Load TI program:
   - Use `./scripts/push-ti-chat.sh --no-send` to build `CHAT.8xp`, then send with TI Connect CE (or push directly if you have tilp).

## Structure
- `gateway/` — CDK stack + Lambda (`gateway/README.md` for API and secrets).
- `esp/` — ESP32 firmware (provisioning + ask).
- `ti/` — TI chat stub and wiring steps.
- `scripts/` — helper scripts (deploy, set secrets, push TI program).
- `docs/` — protocol/notes.

## Key scripts
- `./scripts/set-factory-secret.sh` — create/update `ti-llm/factory-secret` (reads .env).
- `./scripts/deploy-gateway.sh` — build + deploy CDK (reads .env).
- `./scripts/push-ti-chat.sh [--no-send]` — build CHAT.8xp and optionally send.

## Pointers
- Deploy/API: `gateway/README.md`
- ESP flashing/config: `esp/README.md`
- TI program and wiring: `ti/README.md`
