#!/usr/bin/env bash
set -uo pipefail

LOG="${1:?path to the Metro log}"
PLATFORM="${2:?ios or android}"
DEVICE="${3:?device udid or adb serial}"
here="$(cd "$(dirname "$0")" && pwd)"

case "$PLATFORM" in
  ios) APP_ID=$(node -p "require('$here/../app.json').expo.ios.bundleIdentifier") ;;
  android) APP_ID=$(node -p "require('$here/../app.json').expo.android.package") ;;
  *) echo "Unknown platform: $PLATFORM" >&2; exit 1 ;;
esac

launch() {
  case "$PLATFORM" in
    ios) xcrun simctl launch "$DEVICE" "$APP_ID" ;;
    android) adb -s "$DEVICE" shell am start -n "$APP_ID/.MainActivity" ;;
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
  if grep -qE 'Bundled [0-9]+ms node_modules/expo-router/entry\.js \([0-9]+ modules\)' "$LOG"; then
    echo "Bundle is warm"
    stop
    exit 0
  fi
  sleep 5
done

cat "$LOG"
echo "The app never finished bundling" >&2
exit 1
