#!/usr/bin/env bash
# Start the whole dev stack: Postgres + SuperTokens (Docker), the API (:8000) and the web app (:5173).
# Ctrl+C stops the API and web app. The Docker services keep running; `docker compose stop` stops them.
set -euo pipefail
cd "$(dirname "$0")"

API_PORT=8000
WEB_PORT=5173

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

for port in $API_PORT $WEB_PORT; do
  if pid=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1) && [ -n "$pid" ]; then
    die "port $port is already in use by $(ps -o comm= -p "$pid") (pid $pid). Is the app already running?"
  fi
done

if ! docker info >/dev/null 2>&1; then
  say "Starting Docker Desktop…"
  open -a Docker 2>/dev/null || die "Docker isn't running. Start Docker Desktop and try again."
  for _ in $(seq 1 90); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || die "Docker didn't start within 90 seconds."
fi

say "Starting Postgres and SuperTokens…"
docker compose up -d --wait --quiet-pull
for _ in $(seq 1 60); do curl -sf localhost:3567/hello >/dev/null && break; sleep 1; done
curl -sf localhost:3567/hello >/dev/null ||
  die "SuperTokens didn't respond on :3567 (check: docker compose logs supertokens)"

say "Applying database migrations…"
(cd backend && uv run --quiet alembic upgrade head)

if [ ! -d frontend/node_modules ]; then
  say "Installing web dependencies…"
  (cd frontend && npm install)
fi

# Each background job gets its own process group, so cleanup also stops the processes they spawn
# (uvicorn's reload worker, vite under npm). Job control is switched off again straight away so
# Ctrl+C keeps reaching this script. stdin is /dev/null because a background process group that
# reads the terminal (vite's keyboard shortcuts) gets suspended.
set -m
(cd backend && exec uv run uvicorn app.main:app --reload --port "$API_PORT") </dev/null &
API_PID=$!
(cd frontend && exec npm run dev -- --port "$WEB_PORT" --strictPort) </dev/null &
WEB_PID=$!
set +m

cleanup() {
  trap - EXIT INT TERM
  say "Stopping the API and web app…"
  kill -TERM -- -"$API_PID" -"$WEB_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if curl -sf "localhost:$API_PORT/api/health" >/dev/null && curl -sf "localhost:$WEB_PORT" >/dev/null; then
    say "Family Tree is running at http://localhost:$WEB_PORT  (Ctrl+C to stop)"
    break
  fi
  kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null || break
  sleep 1
done

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do sleep 1; done
if kill -0 "$API_PID" 2>/dev/null; then
  die "the web app stopped unexpectedly (see its output above)."
else
  die "the API stopped unexpectedly (see its output above)."
fi
