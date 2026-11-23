#!/usr/bin/env bash
# Moves the deployment to another commit or tag and restarts it. Run as root:
#
#   sudo bash /opt/leetkob/deploy/update.sh pa3
#
# The worker gets SIGTERM and finishes the job in hand first; a job it could not finish is retried
# after its lease. Migrations run when the API starts (src/db.ts).
set -euo pipefail

REF="${1:?usage: sudo bash update.sh <git ref>}"
APP=/opt/leetkob

git -C "$APP" fetch --tags origin
git -C "$APP" checkout --detach "$REF"
(cd "$APP" && npm ci --no-audit --no-fund)
(cd "$APP" && npm run sandbox:build)
install -m 644 "$APP/deploy/leetkob-api.service" "$APP/deploy/leetkob-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl restart leetkob-api
systemctl restart leetkob-worker || true
git -C "$APP" log --oneline -1
