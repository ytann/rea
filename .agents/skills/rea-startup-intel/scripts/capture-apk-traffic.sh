#!/usr/bin/env bash
# Best-effort dynamic traffic capture for an Android APK.
# Drives the app with monkey while mitmdump records; finalizes .mitm and .har.
# The emulator (when booted with --avd) is left running and not reaped; only
# the mitmdump process this script starts is killed on exit.
set -euo pipefail

APK_PATH=""
PACKAGE_NAME=""
OUTPUT_DIR=""
AVD_NAME=""
EVENT_COUNT=500
PORT=8080
CHECK_ONLY=0
SERIAL=""

ADB_BIN="${ADB_BIN:-adb}"
EMULATOR_BIN="${EMULATOR_BIN:-emulator}"
MITMDUMP_BIN="${MITMDUMP_BIN:-mitmdump}"

PROXY_PID=""

usage() {
  cat <<'EOF'
Usage: capture-apk-traffic.sh --apk PATH --package PKG --output DIR [options]

Required:
  --apk PATH       Absolute path to the APK to install.
  --package PKG    Android package id (e.g. com.acme.app).
  --output DIR     Output directory; receives traffic.mitm, traffic.har, and mitmdump.log.

Options:
  --avd NAME       Boot this AVD; otherwise attach to the running device.
  --events N       Monkey UI event count (default 500).
  --port N         mitmdump listen port (default 8080).
  --check          Dry-run: validate prerequisites and print the plan, then exit.
  --help           Show this message.

Environment overrides:
  ADB_BIN, EMULATOR_BIN, MITMDUMP_BIN (default: resolved from PATH).
EOF
}

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

require_bin() {
  local bin="$1"
  if ! command -v "$bin" >/dev/null 2>&1; then
    die "missing prerequisite '$bin'; install it or set the corresponding *_BIN override"
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --apk) APK_PATH="${2:-}"; shift 2 ;;
      --package) PACKAGE_NAME="${2:-}"; shift 2 ;;
      --output) OUTPUT_DIR="${2:-}"; shift 2 ;;
      --avd) AVD_NAME="${2:-}"; shift 2 ;;
      --events) EVENT_COUNT="${2:-}"; shift 2 ;;
      --port) PORT="${2:-}"; shift 2 ;;
      --check) CHECK_ONLY=1; shift ;;
      --help) usage; exit 0 ;;
      *) die "unknown argument: $1" ;;
    esac
  done

  [[ -n "$APK_PATH" ]] || die "--apk is required"
  [[ -n "$PACKAGE_NAME" ]] || die "--package is required"
  [[ -n "$OUTPUT_DIR" ]] || die "--output is required"
  [[ -f "$APK_PATH" ]] || die "APK not found: $APK_PATH"
  [[ "$EVENT_COUNT" =~ ^[0-9]+$ ]] || die "--events must be a non-negative integer"
  [[ "$PORT" =~ ^[0-9]+$ ]] || die "--port must be an integer"
}

# First connected device wins; with multiple devices, pass --avd to control which.
device_serial() {
  "$ADB_BIN" devices | awk 'NR>1 && $2=="device" {print $1; exit}'
}

start_device() {
  if [[ -n "$AVD_NAME" ]]; then
    "$EMULATOR_BIN" -avd "$AVD_NAME" -no-snapshot-load >/dev/null 2>&1 &
  fi
  local i
  for i in $(seq 1 120); do
    local serial
    serial="$(device_serial)" || true
    if [[ -n "$serial" ]]; then
      "$ADB_BIN" -s "$serial" wait-for-device >/dev/null 2>&1
      return 0
    fi
    sleep 1
  done
  die "no device became available after 120s"
}

wait_port() {
  local i
  for i in $(seq 1 30); do
    if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
      exec 3>&- 3<&- 2>/dev/null || true
      return 0
    fi
    sleep 0.2
  done
  die "mitmdump did not bind port $PORT"
}

start_proxy() {
  mkdir -p "$OUTPUT_DIR"
  "$MITMDUMP_BIN" --listen-host 127.0.0.1 --listen-port "$PORT" \
    -w "$OUTPUT_DIR/traffic.mitm" \
    --set "hardump=$OUTPUT_DIR/traffic.har" \
    >"$OUTPUT_DIR/mitmdump.log" 2>&1 &
  PROXY_PID=$!
  wait_port
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    die "mitmdump exited before binding port $PORT"
  fi
}

route_device() {
  local serial="$1"
  "$ADB_BIN" -s "$serial" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null 2>&1
  "$ADB_BIN" -s "$serial" shell settings put global http_proxy "127.0.0.1:$PORT" >/dev/null 2>&1
}

install_and_drive() {
  local serial="$1"
  "$ADB_BIN" -s "$serial" install -r "$APK_PATH" >/dev/null 2>&1 || die "adb install failed"
  # monkey may exit non-zero on some devices; traffic is already captured, so do not fail.
  timeout 600 "$ADB_BIN" -s "$serial" shell monkey \
    -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER -v "$EVENT_COUNT" \
    || true
}

cleanup() {
  if [[ -n "$SERIAL" ]]; then
    "$ADB_BIN" -s "$SERIAL" shell settings put global http_proxy ":0" >/dev/null 2>&1 || true
    "$ADB_BIN" -s "$SERIAL" reverse --remove "tcp:$PORT" >/dev/null 2>&1 || true
  fi
  if [[ -n "$PROXY_PID" ]] && kill -0 "$PROXY_PID" 2>/dev/null; then
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
    PROXY_PID=""
  fi
}

emit_report() {
  printf 'capture complete\n'
  printf '  package: %s\n' "$PACKAGE_NAME"
  printf '  flow:    %s/traffic.mitm\n' "$OUTPUT_DIR"
  printf '  har:     %s/traffic.har\n' "$OUTPUT_DIR"
  printf '\nNext: inspect_web_network_capture %s/traffic.mitm mitmproxy\n' "$OUTPUT_DIR"
}

main() {
  parse_args "$@"
  require_bin "$ADB_BIN"
  require_bin "$MITMDUMP_BIN"
  require_bin timeout
  [[ -n "$AVD_NAME" ]] && require_bin "$EMULATOR_BIN"

  if [[ "$CHECK_ONLY" -eq 1 ]]; then
    printf 'check passed: prerequisites present\n'
    printf 'would capture APK=%s package=%s to %s with %s events on port %s\n' \
      "$APK_PATH" "$PACKAGE_NAME" "$OUTPUT_DIR" "$EVENT_COUNT" "$PORT"
    exit 0
  fi

  local serial
  start_device
  serial="$(device_serial)"
  [[ -n "$serial" ]] || die "could not resolve device serial"
  SERIAL="$serial"
  trap cleanup EXIT

  start_proxy
  route_device "$serial"
  install_and_drive "$serial"
  cleanup
  trap - EXIT
  emit_report
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
