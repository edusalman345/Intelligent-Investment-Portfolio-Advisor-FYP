#!/usr/bin/env bash
# Application/configuration rollback only. Never restores or downgrades a database.
set -Eeuo pipefail
umask 077
# Standalone recovery must also work when the invoking shell has a minimal PATH.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
[[ $EUID -eq 0 && ${1:-} == --backup && $# -eq 2 ]] || { echo 'Usage: sudo bash rollback.sh --backup /var/backups/iipa/deploy-ID' >&2; exit 2; }
backup=$(readlink -f -- "$2")
[[ "$backup" == /var/backups/iipa/deploy-* && -d "$backup" && ! -L "$2" && $(stat -c %u "$backup") == 0 && $(stat -c %a "$backup") == 700 ]] || { echo 'A private root-owned deployment backup is required.' >&2; exit 1; }
if [[ ${IIPA_ROLLBACK_LOCK_HELD:-0} != 1 ]]; then exec 9>/run/lock/iipa-deploy.lock; flock -n 9 || { echo 'Deployment/rollback already running.' >&2; exit 1; }; fi
previous=''
if [[ -f "$backup/previous-release" ]]; then
  previous=$(cat "$backup/previous-release")
  [[ "$previous" == /opt/iipa/releases/* && -d "$previous" && $(readlink -f "$previous") == "$previous" ]] || { echo 'Invalid previous release.' >&2; exit 1; }
fi
systemctl stop iipa-api 2>/dev/null || true
if [[ -n "$previous" ]]; then
  next_link="/opt/iipa/rollback.$(date +%s%N).$$.next"
  ln -s "$previous" "$next_link"
  mv -Tf "$next_link" /opt/iipa/current
else
  [[ ! -L /opt/iipa/current ]] || unlink /opt/iipa/current
fi
for spec in 'runtime.env:/etc/iipa/runtime.env' 'iipa-api.service:/etc/systemd/system/iipa-api.service' 'nginx-site:/etc/nginx/sites-available/iipa'; do
  name=${spec%%:*}; target=${spec#*:}
  if [[ -f "$backup/$name" ]]; then cp -p -- "$backup/$name" "$target"; else rm -f -- "$target"; fi
done
if [[ -L /etc/nginx/sites-enabled/iipa ]]; then unlink /etc/nginx/sites-enabled/iipa; fi
if [[ -f "$backup/nginx-link" ]]; then ln -s "$(cat "$backup/nginx-link")" /etc/nginx/sites-enabled/iipa; fi
systemctl daemon-reload
if [[ -f "$backup/iipa-api.service" ]]; then
  if [[ -f "$backup/api-was-enabled" ]]; then systemctl enable iipa-api; else systemctl disable iipa-api; fi
  if [[ -f "$backup/api-was-active" ]]; then systemctl restart iipa-api; fi
else
  rm -f /etc/systemd/system/multi-user.target.wants/iipa-api.service
fi
nginx -t
systemctl reload nginx
if [[ -f "$backup/api-was-active" ]]; then curl --fail --silent --retry 10 --retry-delay 1 --retry-connrefused http://127.0.0.1:3001/ready >/dev/null; fi
echo 'Previous application/configuration restored. Database was NOT restored or downgraded.'
echo 'Schema/data recovery requires the separately approved database recovery procedure.'
