#!/usr/bin/env bash
set -uo pipefail

LOG="${1:?path to the Metro log}"
PLATFORM="${2:?ios or android}"
DEVICE="${3:?device udid or adb serial}"
APP_ID=com.asafrose.grist

launch() {
  case "$PLATFORM" in
    ios) xcrun simctl launch "$DEVICE" "$APP_ID" ;;
    android) adb -s "$DEVICE" shell am start -n "$APP_ID/.MainActivity" ;;
    *) echo "Unknown platform: $PLATFORM" >&2; exit 1 ;;
  esac
}

stop() {
  case "$PLATFORM" in
    ios) xcrun simctl terminate "$DEVICE" "$APP_ID" ;;
    android) adb -s "$DEVICE" shell am force-stop "$APP_ID" ;;
  esac
}

launch || exit 1

for _ in $(seq 1 120); do
  if grep -qE 'Bundled [0-9]+ms node_modules/expo-router/entry\.js \([0-9]{4} modules\)' "$LOG"; then
    echo "Bundle is warm"
    stop
    exit 0
  fi
  sleep 5
done

cat "$LOG"
echo "The app never finished bundling" >&2
exit 1
