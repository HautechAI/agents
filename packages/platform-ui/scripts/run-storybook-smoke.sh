#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${VITE_API_BASE_URL:-}" ]]; then
  export VITE_API_BASE_URL="http://localhost:4173/api"
fi

PORT="${STORYBOOK_SMOKE_PORT:-7080}"
HOST="127.0.0.1"
URL="http://${HOST}:${PORT}"
LOG_FILE="${TMPDIR:-/tmp}/storybook-smoke.log"

cleanup() {
  if [[ -n "${SB_PID:-}" ]]; then
    if kill -0 "$SB_PID" >/dev/null 2>&1; then
      kill "$SB_PID" >/dev/null 2>&1 || true
    fi
  fi
}

trap cleanup EXIT

: >"${LOG_FILE}"

storybook dev --ci --host "$HOST" --port "$PORT" --no-open >"${LOG_FILE}" 2>&1 &
SB_PID=$!

SERVER_READY=0
for _ in {1..60}; do
  if curl --silent --fail "$URL" >/dev/null 2>&1; then
    SERVER_READY=1
    break
  fi
  if ! kill -0 "$SB_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [[ "$SERVER_READY" -ne 1 ]]; then
  echo 'Storybook dev server did not become ready in time.' >&2
  cat "${LOG_FILE}" >&2 || true
  exit 1
fi

test-storybook --ci --maxWorkers=2 --testTimeout=60000 --url "$URL"
