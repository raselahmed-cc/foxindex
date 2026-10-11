#!/usr/bin/env bash
# Deploy the latest commit of $BRANCH from GitHub onto this server.
#
#   Flow: local → git push → GitHub → (CI passes) → this script on the server.
#
# Run by the GitHub Actions deploy job over SSH, or by hand:
#   /opt/foxindex/infrastructure/scripts/deploy.sh
#
# Safe to re-run. Secrets stay in infrastructure/docker/.env.production on the
# server (never in git). Migrations run automatically before the API starts.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/foxindex}"
BRANCH="${BRANCH:-main}"
PROJECT="${COMPOSE_PROJECT:-foxindex}"
cd "$APP_DIR"

# One deploy at a time.
exec 9>/tmp/foxindex-deploy.lock
flock -n 9 || { echo "Another deploy is already running."; exit 1; }

echo "==> Fetching $BRANCH from $(git remote get-url origin)"
before=$(git rev-parse --short HEAD)
git fetch --quiet origin "$BRANCH"
git reset --hard --quiet "origin/$BRANCH"
after=$(git rev-parse --short HEAD)
echo "    $before → $after  ($(git log -1 --format=%s))"

cd infrastructure/docker
ENV_FILE=.env.production
[ -f "$ENV_FILE" ] || { echo "Missing $PWD/$ENV_FILE — copy .env.production.example and fill it in."; exit 1; }

files=(-f docker-compose.prod.yml)
# Servers that already run a reverse proxy publish the app on localhost instead of starting the bundled Caddy.
if grep -q '^HOST_PROXY=true' "$ENV_FILE"; then files+=(-f docker-compose.host-proxy.yml); fi
compose=(docker compose -p "$PROJECT" "${files[@]}" --env-file "$ENV_FILE")

export IMAGE_TAG="$after"
echo "==> Building images ($IMAGE_TAG)"
"${compose[@]}" build --pull

echo "==> Migrating and restarting"
"${compose[@]}" up -d --remove-orphans

api_port=$(grep -E '^API_HOST_PORT=' "$ENV_FILE" | cut -d= -f2 || true)
health_url="http://127.0.0.1:${api_port:-3311}/api/v1/health/ready"
if ! grep -q '^HOST_PROXY=true' "$ENV_FILE"; then health_url="https://$(grep -E '^DOMAIN=' "$ENV_FILE" | cut -d= -f2)/api/v1/health/ready"; fi

echo "==> Waiting for $health_url"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 5 "$health_url" >/dev/null 2>&1; then
    echo "==> Deployed $after — healthy"
    docker image prune -f --filter "until=168h" >/dev/null || true
    exit 0
  fi
  sleep 3
done

echo "!! $after did not become healthy in time. Recent API logs:"
"${compose[@]}" logs --tail 80 api migrate || true
exit 1
