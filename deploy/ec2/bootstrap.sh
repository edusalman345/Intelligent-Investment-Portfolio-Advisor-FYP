#!/usr/bin/env bash
# Execute on EC2 ONLY after separate owner deployment approval. No OS/runtime installs.
set -Eeuo pipefail
umask 077
archive='' checksum='' hostname='' existing_db=0 import_market=0
while (($#)); do
  case "$1" in
    --archive) archive=${2:?}; shift 2;;
    --sha256-file) checksum=${2:?}; shift 2;;
    --host) hostname=${2:?}; shift 2;;
    --approve-existing-db-migrations) existing_db=1; shift;;
    --import-market-snapshot) import_market=1; shift;;
    *) echo 'Usage: sudo bash bootstrap.sh --archive RELEASE.tar.gz --sha256-file RELEASE.tar.gz.sha256 --host HOST [--approve-existing-db-migrations] [--import-market-snapshot]' >&2; exit 2;;
  esac
done
fail() { echo "$1" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail 'Run with sudo on the separately approved demo instance.'
[[ -f "$archive" && -f "$checksum" && "$hostname" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || fail 'A release, checksum and plain hostname are required.'
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 && "$(dpkg --print-architecture)" == amd64 ]] || fail 'Requires Ubuntu 24.04 amd64.'
for command in python3 node npm nginx psql pg_dump pg_restore pg_lsclusters runuser curl systemd-run flock; do command -v "$command" >/dev/null || fail "Missing prerequisite: $command"; done
[[ $(node --version) == v24.* ]] || fail 'Install the approved Node.js 24 runtime first.'
node_bin=$(readlink -f "$(command -v node)")
[[ "$node_bin" == /usr/* || "$node_bin" == /opt/* ]] || fail 'Node must be installed outside a private home directory.'
# Keep administrative tools (runuser, nginx, useradd) available after selecting Node.
export PATH="$(dirname "$node_bin"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
[[ -f "$script_dir/archive.py" && -f "$script_dir/rollback.sh" && -f "$script_dir/validate-env.py" ]] || fail 'Copy the trusted deployment helpers alongside bootstrap.sh.'
work=$(mktemp -d /tmp/iipa-bootstrap.XXXXXX)
activated=0 backup=''
cleanup() {
  result=$?
  trap - EXIT
  if (( result != 0 && activated == 1 )); then
    echo 'Activation failed; restoring previous application/configuration. Database preserved.' >&2
    IIPA_ROLLBACK_LOCK_HELD=1 bash "$script_dir/rollback.sh" --backup "$backup" || echo 'Automatic application rollback failed; use saved backup and runbook.' >&2
  fi
  rm -rf -- "$work"
  exit "$result"
}
trap cleanup EXIT
# Validate before any database, package or application changes.
python3 "$script_dir/archive.py" verify "$archive" --sha256-file "$checksum" --extract "$work/source"
digest=$(sha256sum "$archive" | cut -d ' ' -f 1)
[[ $(pg_lsclusters --no-header | awk '$1=="16" && $2=="main" && $3=="5432" && $4=="online" {print "ok"}') == ok ]] || fail 'Existing PostgreSQL 16/main must be online on port 5432; no clusters will be changed.'
pg=(runuser -u postgres -- /usr/lib/postgresql/16/bin/psql -X -h /var/run/postgresql -p 5432 -v ON_ERROR_STOP=1)
[[ $("${pg[@]}" -Atqc 'SHOW server_version_num') == 16???? ]] || fail 'Connected server must be PostgreSQL 16.'
listen=$("${pg[@]}" -Atqc 'SHOW listen_addresses')
[[ "$listen" == localhost || "$listen" == 127.0.0.1 || "$listen" == '::1' ]] || fail 'PostgreSQL must already be loopback-bound; review configuration manually.'
certdir="/etc/letsencrypt/live/$hostname"
[[ -r "$certdir/fullchain.pem" && -r "$certdir/privkey.pem" ]] || fail 'Obtain the hostname HTTPS certificate using the runbook before activation.'
nginx -t
exec 9>/run/lock/iipa-deploy.lock
flock -n 9 || fail 'Another IIPA deployment or rollback is running.'
[[ ! -e /opt/iipa/current || -L /opt/iipa/current ]] || fail 'Current release path must be a symlink.'
[[ ! -e /etc/nginx/sites-enabled/iipa || -L /etc/nginx/sites-enabled/iipa ]] || fail 'Existing IIPA enabled site must be a symlink.'
db_exists=$("${pg[@]}" -Atqc "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname='iipa_demo')")
if [[ "$db_exists" == t ]]; then
  ((existing_db)) || fail 'Existing database preserved. Pass --approve-existing-db-migrations only after reviewing backup/recovery procedure.'
  [[ $("${pg[@]}" -Atqc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='iipa_demo'") == iipa ]] || fail 'Unexpected existing database owner.'
fi
id iipa >/dev/null 2>&1 || useradd --system --home-dir /var/lib/iipa --shell /usr/sbin/nologin iipa
install -d -o root -g root -m 0755 /opt/iipa /opt/iipa/releases
install -d -o root -g iipa -m 0750 /etc/iipa
install -d -o iipa -g iipa -m 0700 /var/lib/iipa
install -d -o root -g root -m 0700 /var/backups/iipa
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=$(mktemp -d "/var/backups/iipa/deploy-$stamp-${digest:0:12}.XXXXXX")
if [[ -L /opt/iipa/current ]]; then
  previous=$(readlink -f /opt/iipa/current)
  [[ "$previous" == /opt/iipa/releases/* && -d "$previous" ]] || fail 'Previous release must remain inside /opt/iipa/releases.'
  printf '%s\n' "$previous" > "$backup/previous-release"
fi
for spec in 'runtime.env:/etc/iipa/runtime.env' 'iipa-api.service:/etc/systemd/system/iipa-api.service' 'nginx-site:/etc/nginx/sites-available/iipa'; do
  name=${spec%%:*}; target=${spec#*:}
  [[ ! -L "$target" ]] || fail 'Managed configuration must be regular files.'
  if [[ -f "$target" ]]; then cp -p -- "$target" "$backup/$name"; fi
done
if [[ -L /etc/nginx/sites-enabled/iipa ]]; then readlink /etc/nginx/sites-enabled/iipa > "$backup/nginx-link"; fi
systemctl is-active --quiet iipa-api && touch "$backup/api-was-active"
systemctl is-enabled --quiet iipa-api 2>/dev/null && touch "$backup/api-was-enabled"
if [[ $("${pg[@]}" -Atqc "SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='iipa')") == f ]]; then
  "${pg[@]}" -qc 'CREATE ROLE iipa LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
fi
[[ $("${pg[@]}" -Atqc "SELECT rolcanlogin AND NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication) FROM pg_roles WHERE rolname='iipa'") == t ]] || fail 'Unexpected application database-role privileges.'
if [[ "$db_exists" == f ]]; then runuser -u postgres -- /usr/lib/postgresql/16/bin/createdb -h /var/run/postgresql -p 5432 --owner=iipa iipa_demo; fi
# Existing local peer authentication must work; never edit HBA or restart PostgreSQL.
db=(runuser -u iipa -- /usr/lib/postgresql/16/bin/psql -X -h /var/run/postgresql -p 5432 -d iipa_demo -v ON_ERROR_STOP=1)
[[ $("${db[@]}" -Atqc 'SELECT current_user') == iipa ]] || fail 'Peer authentication unavailable; review HBA manually.'
envfile=/etc/iipa/runtime.env
if [[ ! -f "$envfile" ]]; then
  cat > "$envfile" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
TRUST_PROXY_LOOPBACK=1
DATABASE_URL=postgresql://iipa@localhost/iipa_demo?host=/var/run/postgresql
FRONTEND_ORIGIN=https://$hostname
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://$hostname/api/v1/auth/google/callback
MARKET_PROVIDER=alpha-vantage
ALPHA_VANTAGE_API_KEY=
SESSION_HOURS=24
QUOTE_MAX_AGE_HOURS=72
MAIL_OUTPUT_DIR=/var/lib/iipa/mail
EOF
  chown root:iipa "$envfile"; chmod 0640 "$envfile"
fi
# Never rewrite existing environment bytes or credentials.
[[ $(stat -c %u "$envfile") == 0 ]] || fail 'Runtime configuration must be root-owned; fix permissions privately.'
mode=$(stat -c %a "$envfile")
[[ "$mode" == 600 || ( "$mode" == 640 && $(stat -c %G "$envfile") == iipa ) ]] || fail 'Runtime permissions must be 0600 or root:iipa 0640; fix privately.'
python3 "$script_dir/validate-env.py" "$envfile" "$hostname"
release=$(mktemp -d "/opt/iipa/releases/$stamp-${digest:0:12}.XXXXXX")
cp -a "$work/source/." "$release/"
chown -R iipa:iipa "$release"
chmod 0755 "$release"
runuser -u iipa -- bash -c 'cd "$1" && npm ci --omit=dev --no-audit --no-fund' -- "$release"
"$node_bin" --check "$release/services/api/dist/server.js"
"$node_bin" --check "$release/services/api/dist/db/migrate.js"
run_release() {
  systemd-run --quiet --wait --pipe --collect --unit="iipa-$1-$stamp-$$" --uid=iipa --gid=iipa --property="WorkingDirectory=$release" --property=EnvironmentFile=/etc/iipa/runtime.env "$node_bin" "$release/$2" "${@:3}"
}
# Enter a maintenance window only after candidate dependency/syntax checks.
# Backups now include every write acknowledged before the old API stopped.
activated=1
if [[ -f "$backup/api-was-active" ]]; then systemctl stop iipa-api; fi
if [[ "$db_exists" == t ]]; then
  runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_dump -h /var/run/postgresql -p 5432 -Fc iipa_demo > "$backup/database.dump"
  [[ -s "$backup/database.dump" ]] || fail 'Database backup is empty.'
  /usr/lib/postgresql/16/bin/pg_restore --list "$backup/database.dump" >/dev/null
fi
run_release migrate services/api/dist/db/migrate.js
[[ $("${db[@]}" -Atqc "SELECT count(*) FROM schema_migrations WHERE name IN ('001_p1_foundation.sql','002_subscription_plans.sql')") == 2 ]] || fail 'Both migrations must be recorded.'
[[ $("${db[@]}" -Atqc "SELECT count(*) FROM subscription_plans WHERE (code='free' AND price_monthly=0 AND status='active') OR (code='pro' AND price_monthly IS NULL AND status='coming_soon')") == 2 ]] || fail 'Catalog verification failed.'
if ((import_market)); then
  [[ -f "$release/deploy/ec2/market-data.json" ]] || fail 'Package lacks public market snapshot.'
  run_release market-import deploy/ec2/import-market.mjs "$release/deploy/ec2/market-data.json"
fi
chown -R root:iipa "$release"
chmod -R u=rwX,g=rX,o= "$release"
chmod 0755 "$release" "$release/apps" "$release/apps/web"
chmod -R a+rX "$release/apps/web/dist"
sed "s|__NODE__|$node_bin|g" "$release/deploy/ec2/iipa-api.service" > "$work/iipa-api.service"
sed -e "s/__HOST__/$hostname/g" -e "s|__CERT_DIR__|$certdir|g" "$release/deploy/ec2/nginx-https.conf.template" > "$work/nginx-site"
next_link="/opt/iipa/current.$(basename "$release").next"
ln -s "$release" "$next_link"
mv -Tf "$next_link" /opt/iipa/current
install -o root -g root -m 0644 "$work/iipa-api.service" /etc/systemd/system/iipa-api.service
install -o root -g root -m 0644 "$work/nginx-site" /etc/nginx/sites-available/iipa
ln -sfn /etc/nginx/sites-available/iipa /etc/nginx/sites-enabled/iipa
nginx -t
systemctl daemon-reload
systemctl enable iipa-api
systemctl restart iipa-api
ready=0
for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:3001/ready >/dev/null; then ready=1; break; fi
  sleep 1
done
((ready)) || fail 'Candidate API did not become ready.'
systemctl reload nginx
curl --fail --silent --resolve "$hostname:443:127.0.0.1" "https://$hostname/ready" >/dev/null
curl --fail --silent --resolve "$hostname:443:127.0.0.1" "https://$hostname/api/v1/auth/session" | python3 -c 'import json,sys; assert "user" in json.load(sys.stdin)["data"]'
activated=0
echo "Deployment checks passed. Release: $release"
echo "Rollback: sudo bash $release/deploy/ec2/rollback.sh --backup $backup"
echo 'Database preserved. Public browser/Google OAuth acceptance is still required.'
