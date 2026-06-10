#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export COREPACK_ENABLE_PROJECT_SPEC=0
export COREPACK_ENABLE_STRICT=0
export pnpm_config_manage_package_manager_versions=false
export pnpm_config_package_manager_strict=false
export pnpm_config_pm_on_fail=ignore

API_PORT="${API_PORT:-3000}"
MOBILE_PORT="${MOBILE_PORT:-8081}"

cleanup() {
  if [[ -n "${api_pid:-}" ]] && kill -0 "$api_pid" 2>/dev/null; then
    kill "$api_pid" 2>/dev/null || true
  fi
  if [[ -n "${mobile_pid:-}" ]] && kill -0 "$mobile_pid" 2>/dev/null; then
    kill "$mobile_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting Earn Daily backend on port ${API_PORT}..."
PORT="$API_PORT" pnpm --filter @workspace/api-server dev &
api_pid=$!

echo "Starting Earn Daily mobile preview on port ${MOBILE_PORT}..."
(
  cd artifacts/mobile
  PORT="$MOBILE_PORT" pnpm dev
) &
mobile_pid=$!

wait -n "$api_pid" "$mobile_pid"
exit_code=$?
cleanup
exit "$exit_code"
