#!/usr/bin/env bash
set -uo pipefail

DEVICE="${MAESTRO_DEVICE:-emulator-5554}"
MAESTRO="${MAESTRO_BIN:-maestro}"
cd "$(dirname "$0")/.."

reset_adb() {
  adb kill-server >/dev/null 2>&1
  adb start-server >/dev/null 2>&1
  adb -s "$DEVICE" wait-for-device
  adb -s "$DEVICE" reverse tcp:8081 tcp:8081 >/dev/null 2>&1
}

failed=()
for flow in .maestro/*.yaml; do
  if [ "$(basename "$flow")" = "config.yaml" ]; then
    continue
  fi
  out=$("$MAESTRO" --device "$DEVICE" test "$flow" 2>&1)
  status=$?
  if [ $status -ne 0 ]; then
    reset_adb
    out=$("$MAESTRO" --device "$DEVICE" test "$flow" 2>&1)
    status=$?
  fi
  if [ $status -eq 0 ]; then
    echo "[Passed] $flow"
  else
    echo "[Failed] $flow"
    printf '%s\n' "$out" | tail -30
    failed+=("$flow")
  fi
done

if [ ${#failed[@]} -gt 0 ]; then
  echo "Failed flows: ${failed[*]}"
  exit 1
fi
echo "All flows passed on $DEVICE"
