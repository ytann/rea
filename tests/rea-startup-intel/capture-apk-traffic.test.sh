#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/../../.agents/skills/rea-startup-intel/scripts/capture-apk-traffic.sh"
source "$SRC"

failures=0

# require_bin rejects a missing binary
if ( require_bin "definitely-not-a-real-bin-xyz" ) 2>/dev/null; then
  echo "FAIL: require_bin accepted a missing binary"; failures=$((failures+1))
else
  echo "PASS: require_bin rejects missing binary"
fi

# parse_args rejects missing required args
APK_PATH=""; PACKAGE_NAME=""; OUTPUT_DIR=""
if ( parse_args --apk /tmp/x.apk ) 2>/dev/null; then
  echo "FAIL: parse_args accepted missing --package/--output"; failures=$((failures+1))
else
  echo "PASS: parse_args rejects missing required args"
fi

# parse_args rejects a non-existent APK path
APK_PATH=""; PACKAGE_NAME=""; OUTPUT_DIR=""
if ( parse_args --apk /tmp/does-not-exist.apk --package a.b --output /tmp/o ) 2>/dev/null; then
  echo "FAIL: parse_args accepted a missing APK file"; failures=$((failures+1))
else
  echo "PASS: parse_args rejects missing APK file"
fi

# usage lists required flags
if ! usage 2>/dev/null | grep -q -- '--apk'; then
  echo "FAIL: usage missing --apk"; failures=$((failures+1))
else
  echo "PASS: usage lists required flags"
fi

exit "$failures"
