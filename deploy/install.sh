#!/usr/bin/env bash
# Installs LeeTKOB on a fresh Ubuntu 24.04 VM. Run as root, once:
#
#   sudo bash install.sh <domain> [git ref]      e.g.  sudo bash install.sh 203.0.113.7.sslip.io main
#
# It installs Docker, Node.js 22 and Caddy; creates the users leetkob-api and leetkob-worker (only the
# worker may use Docker); puts the code in /opt/leetkob and the database in /var/lib/leetkob; builds the
# judging image; installs the two services and the Caddyfile; opens only ports 22, 80 and 443.
# It never writes the model key: put it in /etc/leetkob/worker.env yourself (docs/deploy.md).
set -euo pipefail

DOMAIN="${1:?usage: sudo bash install.sh <domain> [git ref]}"
REF="${2:-main}"
REPO="https://github.com/Coofzz/leetkob.git"
APP=/opt/leetkob
DATA=/var/lib/leetkob
ETC=/etc/leetkob

[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }

echo "== packages"
apt-get update -q
apt-get install -y -q ca-certificates curl git docker.io caddy ufw
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' 2>/dev/null; then
  # Node.js 22 from NodeSource (Ubuntu 24.04 ships 18; node:sqlite needs 22.13+).
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
node -v

echo "== Docker: swap must be limited, or the memory attack test would pass (docs/deploy.md)"
systemctl enable --now docker
if docker info 2>&1 | grep -qi "no swap limit support"; then
  echo "WARNING: this kernel does not limit swap; --memory-swap is ignored. See docs/deploy.md." >&2
fi

echo "== users and directories"
getent group leetkob >/dev/null || groupadd --system leetkob
id leetkob-api >/dev/null 2>&1 || useradd --system --gid leetkob --home-dir /nonexistent --shell /usr/sbin/nologin leetkob-api
id leetkob-worker >/dev/null 2>&1 || useradd --system --gid leetkob --home-dir /nonexistent --shell /usr/sbin/nologin leetkob-worker
usermod -aG docker leetkob-worker
install -d -o root -g leetkob -m 2770 "$DATA"
install -d -o root -g root -m 755 "$ETC"

echo "== code ($REF) in $APP"
if [ ! -d "$APP/.git" ]; then git clone "$REPO" "$APP"; fi
git -C "$APP" fetch --tags origin
git -C "$APP" checkout --detach "$REF"
(cd "$APP" && npm ci --no-audit --no-fund)
(cd "$APP" && npm run sandbox:build)

echo "== configuration in $ETC (existing files are kept)"
[ -f "$ETC/api.env" ] || install -o root -g leetkob-api -m 640 "$APP/deploy/api.env.example" "$ETC/api.env"
[ -f "$ETC/worker.env" ] || install -o root -g leetkob-worker -m 640 "$APP/deploy/worker.env.example" "$ETC/worker.env"

echo "== services"
install -m 644 "$APP/deploy/leetkob-api.service" "$APP/deploy/leetkob-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now leetkob-api
if grep -qE '^(LLM_API_KEY=.+|MODEL_OFF=1)' "$ETC/worker.env"; then
  systemctl enable --now leetkob-worker
else
  systemctl enable leetkob-worker
  echo "NOTE: the worker is not started: put LLM_API_KEY (or MODEL_OFF=1) in $ETC/worker.env, then"
  echo "      sudo systemctl start leetkob-worker"
fi

echo "== Caddy for $DOMAIN"
sed "s/LEETKOB_DOMAIN/$DOMAIN/" "$APP/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload-or-restart caddy

echo "== firewall: SSH, HTTP, HTTPS only (the API listens on 127.0.0.1)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== done: https://$DOMAIN — next: create the accounts (docs/deploy.md, step 4)"
