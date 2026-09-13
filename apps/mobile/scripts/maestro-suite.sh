#!/usr/bin/env bash
set -uo pipefail

DEVICE="${MAESTRO_DEVICE:?MAESTRO_DEVICE is required}"
MAESTRO="${MAESTRO_BIN:-maestro}"
RETRY_HOOK="${MAESTRO_RETRY_HOOK:-}"
cd "$(dirname "$0")/.."

failed=()
for flow in .maestro/*.yaml; do
  if [ "$(basename "$flow")" = "config.yaml" ]; then
    continue
  fi
  out=$("$MAESTRO" --device "$DEVICE" test "$flow" 2>&1)
  status=$?
  if [ $status -ne 0 ]; then
    if [ -n "$RETRY_HOOK" ]; then
      "$RETRY_HOOK"
    fi
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
