#!/usr/bin/env bash
set -uo pipefail

DEVICE="${MAESTRO_DEVICE:-emulator-5554}"

adb kill-server >/dev/null 2>&1
adb start-server >/dev/null 2>&1
adb -s "$DEVICE" wait-for-device
adb -s "$DEVICE" reverse tcp:8081 tcp:8081 >/dev/null 2>&1
