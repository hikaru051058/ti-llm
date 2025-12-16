#!/usr/bin/env bash
set -euo pipefail

# Generates the CHAT program (TI-BASIC) and optionally sends it to a connected TI-84 CE.
# Requirements for send: tilp/ticonv installed (not in Homebrew; use TI Connect CE as an alternative).
# Usage: ./scripts/push-ti-chat.sh [--no-send]

PROGRAM_NAME="CHAT"
TMP_DIR="$(mktemp -d)"
TXT_FILE="$TMP_DIR/${PROGRAM_NAME}.txt"
PRG_FILE="$TMP_DIR/${PROGRAM_NAME}.8xp"
SEND=1

if [[ "${1:-}" == "--no-send" ]]; then
  SEND=0
fi

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cat > "$TXT_FILE" <<'EOF'
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
EOF

echo "Building $PROGRAM_NAME.8xp..."
ticonv -n "$PROGRAM_NAME" -o "$PRG_FILE" "$TXT_FILE"

if [[ $SEND -eq 1 ]]; then
  echo "Pushing to calculator..."
  tilp -n "$PRG_FILE"
else
  echo "Built ${PRG_FILE}. Use TI Connect CE or CEmu to import."
  cp "$PRG_FILE" "${PROGRAM_NAME}.8xp"
fi

echo "Done."
