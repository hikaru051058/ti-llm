# ESP firmware

Placeholder for ESP32 firmware that calls the gateway:
- Store `device_id`, `factory_secret`, and the provisioned `api_key`.
- Implement boot-time provisioning call to `/provision` and regular `/ask` pings.

## Layout
- `platformio.ini` — PlatformIO config (Arduino framework).
- `src/main.cpp` — UART protocol + provisioning + ask.

## Quick start
1) Install PlatformIO CLI (`pip install platformio`) or use VSCode with the PlatformIO extension.
2) Set Wi‑Fi + endpoints in `src/main.cpp`:
   - `WIFI_SSID`, `WIFI_PASS`
   - `PROVISION_URL`, `ASK_URL`
   - `FACTORY_SECRET`
3) Flash:
   ```bash
   pio run -t upload
   pio device monitor
   ```
4) UART protocol:
   - `INIT` → provisions if needed, replies `OK`
   - `<text>` → forwards to `/ask`, prints reply
   - `EXIT` → disconnects Wi‑Fi (sleep hook placeholder)

## Serial usage
```bash
platformio device monitor --baud 115200 --eol LF --echo
```
- Press reset (EN) to see `ESP gateway ready`.
- Type `INIT` then Enter to provision (needs Wi‑Fi + factory secret set).
- Type any text to query `/ask`.
- Type `EXIT` to disconnect Wi‑Fi.
