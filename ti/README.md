# TI-84 CE serial stub

Minimal TI‑BASIC program to talk to the ESP gateway over UART. Intentional design: trivial to retype after a reset, no dependencies, no secrets on TI.

## Canonical program
```
PROGRAM:CHAT
ClrHome
Send("INIT")
Receive(Str1)
If Str1≠"OK":Stop

Repeat K=45          ; ESC quits (K=45 is [Clear])
 Input "Q:",Str2
 If Str2="":Stop
 Send(Str2)
 Receive(Str3)
 ClrHome
 Disp Str3
 Pause
End
```

Ultra-minimal (easier to retype):
```
PROGRAM:CHAT
ClrHome
Send("INIT")
Receive(Str1)
If Str1≠"OK":Stop
Repeat
 Input "Q:",Str2
 If Str2="":Stop
 Send(Str2)
 Receive(Str3)
 ClrHome:Disp Str3:Pause
End
```

Protocol (matches ESP firmware):
- `INIT` → provisions if needed, returns `OK`
- `<text>` → forwards to `/ask`, returns reply text
- `EXIT` → disconnects Wi‑Fi (`Send("EXIT")` optional)
- `PING` → `PONG` (optional health check)

## Wiring assumptions
- TI UART TX ↔ ESP RX, TI UART RX ↔ ESP TX, common GND
- 115200 8N1, no flow control

## Tips
- If `Receive(` hangs, press [Clear] to break (K=45 in the loop).
- If Wi‑Fi/secret wrong on ESP, you’ll see `ERR ...` back; fix on ESP, no TI changes needed.

## Step-by-step (hardware)
1) Load CHAT onto the calculator  
   - Easiest: TI Connect CE → new program `CHAT` → paste code above → send to calc.  
   - Alternative: use CEmu to create `CHAT.8xp`, then send via TI Connect CE. (CEmu can’t talk to ESP; use it only to check UI flow.)
2) Wire TI ↔ ESP  
   - TI TX → ESP RX, TI RX → ESP TX, common GND, 115200 8N1, no flow control (3.3V levels).  
3) Prepare ESP  
   - Ensure `WIFI_SSID`, `WIFI_PASS`, `FACTORY_SECRET`, URLs set in `esp/src/main.cpp` and flashed.  
   - Open serial monitor (e.g., `pio device monitor --baud 115200 --eol LF --echo`), reset ESP; see “ESP gateway ready”.  
4) Run CHAT on TI  
   - Start `CHAT`, type `INIT` → expect `OK` (first run may provision; `ERR ...` means fix Wi‑Fi/secret).  
   - Type a question (e.g., `Hello`) → should get reply text.  
   - Type `EXIT` to disconnect (optional).  
5) If issues  
   - [Clear] exits the loop on TI.  
   - Check ESP log for `ERR ...` codes; fix Wi‑Fi/secret on ESP, reflash, retry `INIT`.
