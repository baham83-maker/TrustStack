#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export NVM_DIR="${HOME}/.nvm"
if [ -s "${NVM_DIR}/nvm.sh" ]; then
  . "${NVM_DIR}/nvm.sh"
fi

PORT="${PORT:-54321}"
nohup env PORT="${PORT}" npm run dev:server > /tmp/supplement-server.log 2>&1 &

for i in {1..30}; do
  if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/tmp/supplement-health.json 2>/dev/null; then
    echo "Dashboard API online: http://127.0.0.1:${PORT}"
    cat /tmp/supplement-health.json
    exit 0
  fi
  sleep 1
done

echo "Dashboard API did not start successfully on port ${PORT}" >&2
cat /tmp/supplement-server.log 2>/dev/null || true
exit 1
