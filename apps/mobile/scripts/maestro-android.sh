#!/usr/bin/env bash
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
export MAESTRO_DEVICE="${MAESTRO_DEVICE:-emulator-5554}"
export MAESTRO_RETRY_HOOK="$here/maestro-android-reset.sh"
exec bash "$here/maestro-suite.sh"
