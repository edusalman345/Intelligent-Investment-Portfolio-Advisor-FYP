# IIPA single-instance demo deployment

Prepared locally on 28 October 2026. **These commands are a runbook, not evidence
of an AWS deployment. Execute remote commands only after separate owner approval.**
The release preserves the 15-feature P1 Mid baseline, IIPA branding and separate
Subscription Plans enhancement. No payments, entitlements or later modules.

## Design and prerequisites

- Dedicated Ubuntu 24.04 amd64 instance; intended region ap-south-1, t3.small.
- Existing Node 24 (validated locally with 24.22.1), Nginx, PostgreSQL **16/main**
  online on 5432. Bootstrap installs none of these and never edits PostgreSQL
  configuration, installs 18, restarts a cluster, drops a database or seeds fixtures.
- PostgreSQL listens on loopback. Existing local peer authentication must permit
  OS user `iipa` to connect as DB role `iipa`; Ubuntu's default local peer rule
  normally suffices. A mismatch stops deployment for private operator review.
- Immutable source/build archive verified before system changes; fresh release
  directories under `/opt/iipa/releases/`; atomic `/opt/iipa/current` symlink switch.
- Root-owned release files, restricted `iipa` service, localhost API on 3001.
  Nginx serves only `apps/web/dist` and preserves `/api/v1/...` through the proxy.
- Runtime configuration lives outside releases in `/etc/iipa/runtime.env`.
  Existing bytes/credentials are never rewritten. Use root ownership and either
  0600, or root:iipa 0640. Private backups are under `/var/backups/iipa/`.
- First obtain a valid hostname certificate. Bootstrap never falls back to HTTP
  cookies, self-signed TLS or disabled OAuth verification.

The historical IP `15.252.238.37` is not a current-state guarantee. Confirm the
instance IP, SSH username, security group, hostname and disk space before acting.
No AWS connection, resource change, commit or push was performed during preparation.

## 1. Local Windows validation and package

Run in the repository root. All commands below remain local:

```powershell
$env:Path = "$(Join-Path (Get-Location) '.tmp\node-runtime\node-v24.22.1-win-x64');$env:Path"
$python = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313\python.exe'
$env:npm_config_cache = Join-Path (Get-Location) '.tmp\npm-cache'
node --version
npm.cmd ci --no-audit --no-fund
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit --audit-level=moderate
& $python -m unittest discover -s deploy/ec2/tests -v
node --test deploy/ec2/tests/smoke.test.mjs
& $python scripts/check_secret_files.py
& $python -m unittest discover -s scripts -p test_secret_files.py
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/ec2/test-pg16.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/ec2/package.ps1 -Python $python -IncludeMarketSnapshot
Get-FileHash .tmp/iipa-release.tar.gz -Algorithm SHA256
& $python deploy/ec2/archive.py verify .tmp/iipa-release.tar.gz --sha256-file .tmp/iipa-release.tar.gz.sha256
```

`test-pg16.ps1` requires PostgreSQL 16 portable binaries (default
`.tmp/postgres16-runtime/pgsql/bin`, or supply `-PostgresBin`). It creates a unique
ignored cluster on loopback port 55436, uses only guarded `_test` databases,
checks fresh/repeated migrations and public-market import, runs serial integrations,
then stops that cluster and restores the caller's environment. It never resets
the installed development or production database. Do not point it at EC2.

Packaging builds by default. `-SkipBuild` is only for a just-validated build of
the exact current sources. The sorted archive has fixed metadata and per-file
SHA-256 manifest hashes; repeated packaging of unchanged inputs is byte-identical.
It includes allowlisted application source/build files, workspaces/lockfile,
migrations and current deployment helpers, including uncommitted local fixes.
It excludes `.git`, `node_modules`, private environment files, SSH keys, Proposal,
tests, unrelated temporary files and source maps. Snapshot inclusion is explicit
and restricted to the existing public five-stock schema. Local credential values
are compared privately to package content; matching values reject packaging.
Verification rejects traversal, aliases, duplicate members, links, excluded files,
unexpected content and missing/hash-mismatched required files. Never append files
to a Git tar archive. A checksum protects transfer integrity; SSH host verification
and a trusted local source are still required for authenticity.

## 2. Transfer after owner approval

Use the existing key file privately; never copy it to EC2 or put it in this repo.
Confirm the SSH username in EC2 Console > Connect. Confirm the server's SSH host
fingerprint through a trusted channel; do not disable StrictHostKeyChecking.

```powershell
$key = 'C:\PRIVATE\YOUR-EXISTING-KEY.pem'
$sshUser = 'ubuntu' # Confirm in the EC2 Connect tab first.
$serverIp = '15.252.238.37' # Reconfirm current IP first.
$remote = "${sshUser}@${serverIp}"
ssh -i $key $remote
```

Exit that shell before running the following local transfer:

```powershell
scp -i $key .tmp/iipa-release.tar.gz .tmp/iipa-release.tar.gz.sha256 deploy/ec2/bootstrap.sh deploy/ec2/rollback.sh deploy/ec2/archive.py deploy/ec2/validate-env.py deploy/ec2/nginx-http.conf.template "${remote}:"
```

Copy the verification/bootstrap helpers from the trusted working tree, not by
extracting and executing scripts from an unverified archive.

## 3. DNS, firewall and server prerequisites

In Name.com, set `iipa.ahsal.systems` A record to the confirmed public IPv4 (last
observed 15.252.238.37), TTL 300. Remove/correct a stale AAAA record if present.
Check DNS before certificate issuance. Do not change unrelated DNS records.

Security group: allow TCP 80/443 publicly; SSH only from the owner's current IP
or the explicitly configured EC2 Instance Connect path. Do not expose 3001/5432.
Verify AWS account credits, EC2/EBS/IPv4/traffic and T3 Unlimited costs separately.
No resource is assumed free and no cost control is automatically changed.

On the approved server, inspect first (do not print private environment files):

```bash
node --version
npm --version
pg_lsclusters
sudo -u postgres psql -X -Atc 'SHOW server_version'
sudo -u postgres psql -X -Atc 'SHOW listen_addresses'
sudo systemctl is-active postgresql@16-main nginx
df -h /opt /var
getent ahostsv4 iipa.ahsal.systems
```

Node must report 24.x; retain the existing approved runtime. If prerequisites
are missing, stop and obtain package-install approval. A typical approved Ubuntu
prerequisite command is below; it does not install a PostgreSQL server or Node:

```bash
sudo apt-get update
sudo apt-get install --no-install-recommends nginx postgresql-client-16 python3 curl ca-certificates certbot
```

## 4. First hostname HTTPS setup only

Skip this section if a working HTTPS site/certificate already exists. Do not
replace an existing site with the initial HTTP configuration. Back up any existing
configuration and investigate conflicts first. The commands below intentionally
stop if the managed site already exists.

```bash
sudo test ! -e /etc/nginx/sites-available/iipa || { printf 'Existing site: stop and review.\n'; exit 1; }
sudo install -d -m 0755 /var/www/letsencrypt
sed 's/__HOST__/iipa.ahsal.systems/g' nginx-http.conf.template | sudo tee /etc/nginx/sites-available/iipa >/dev/null
sudo ln -s /etc/nginx/sites-available/iipa /etc/nginx/sites-enabled/iipa
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt --cert-name iipa.ahsal.systems -d iipa.ahsal.systems --email YOUR_ACME_CONTACT --agree-tos --no-eff-email
sudo install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
printf '%s\n' '#!/bin/sh' '/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/iipa-nginx >/dev/null
sudo chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/iipa-nginx
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

HTTP redirects to HTTPS except ACME challenges. Normal authentication requires
trusted HTTPS and Secure cookies; do not try to demonstrate production login over
plain HTTP. Bootstrap expects `/etc/letsencrypt/live/iipa.ahsal.systems/`.

## 5. Deploy and migrate, only after explicit deployment approval

```bash
python3 archive.py verify iipa-release.tar.gz --sha256-file iipa-release.tar.gz.sha256
sudo bash bootstrap.sh --archive iipa-release.tar.gz --sha256-file iipa-release.tar.gz.sha256 --host iipa.ahsal.systems --import-market-snapshot
```

If `iipa_demo` already exists, the default command stops without migrating it.
After explicitly approving its backup/recovery procedure, repeat with
`--approve-existing-db-migrations`. This flag authorizes normal additive migrations,
not database replacement. Bootstrap never drops a database or restores over one.
Do not run `db:seed`: that development command seeds synthetic data.

Bootstrap creates a dedicated `iipa` OS account and non-superuser DB role when
absent, then `iipa_demo` only if absent. It requires existing peer authentication,
preserves existing records and uses the normal compiled migrator:
`node services/api/dist/db/migrate.js`. Both immutable migrations 001/002 run
through the checksum ledger, then both ledger entries and Free/Pro values are
checked. An existing DB is backed up with PostgreSQL16 `pg_dump -Fc`, verified
nonempty and inspected with `pg_restore --list` after the old API stops. This is
an archive structure check, not a successful restore test.

Dependencies are installed with `npm ci --omit=dev` in a new release; production
builds were created locally. The previous release remains untouched. A maintenance
window covers backup/migration/activation. Activation failure attempts application/
configuration rollback, keeping database changes and printing recovery guidance.
No destructive migration rollback is attempted. First-install failure preserves
the new database for diagnosis rather than deleting it.

## 6. Private environment and Google configuration

First deployment creates `/etc/iipa/runtime.env` with safe public deployment
settings and blank provider credentials. Subsequent deployments only validate it.
Edit credentials privately on the server after approval:

```bash
sudoedit /etc/iipa/runtime.env
sudo chown root:iipa /etc/iipa/runtime.env
sudo chmod 0640 /etc/iipa/runtime.env
sudo python3 validate-env.py /etc/iipa/runtime.env iipa.ahsal.systems
sudo systemctl restart iipa-api
```

Never use `cat`, shell tracing, `echo` of values, Git, frontend VITE variables or
chat for credentials. Use unquoted `KEY=value` lines without whitespace/backticks/
backslashes and no duplicate keys. Required names appear in `production.env.example`.

Public settings: `NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=3001`,
`TRUST_PROXY_LOOPBACK=1`, `FRONTEND_ORIGIN=https://iipa.ahsal.systems`,
`GOOGLE_CALLBACK_URL=https://iipa.ahsal.systems/api/v1/auth/google/callback`,
`MARKET_PROVIDER=alpha-vantage`, `SESSION_HOURS=24`, `QUOTE_MAX_AGE_HOURS=72`,
`MAIL_OUTPUT_DIR=/var/lib/iipa/mail`. Bootstrap creates the local peer database
configuration privately; do not print its value. No database password is needed.

Privately configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` from the same Web
OAuth client, and `ALPHA_VANTAGE_API_KEY` for authorized fresh discovery/ingestion.
Google ID and secret must both be blank or both configured. With both blank,
Google login remains unavailable; email/password authentication still works.

Owner Google Cloud Console changes: add the exact redirect URI
`https://iipa.ahsal.systems/api/v1/auth/google/callback` to that Web client. Add
`https://iipa.ahsal.systems` to authorized JavaScript origins where applicable.
Configure consent-screen authorized domain `ahsal.systems`, audience/test users
as required by the client's publishing status. Preserve the local callback if
still needed. Do not change provider settings automatically.

Real public OAuth is **UNVERIFIED** until actual Google consent/login -> callback
-> same application account -> protected page -> logout passes. Repeat existing
identity and explicit linking tests without sharing account identifiers or tokens.
State, nonce, PKCE, ID-token verification, explicit linking, CSRF, Origin/CORS,
secure cookies, ownership and rate limits remain enabled.

## 7. Market snapshot and smoke checks

`--import-market-snapshot` imports only the packaged existing public snapshot.
It retains original Alpha Vantage timestamps, marks the ingestion as ARCHIVE_IMPORT,
preserves good cached observations and is safe to repeat without duplicate quotes/
bars. It imports no users, sessions, credentials or portfolio records. These are
recorded end-of-day observations, not real-time prices or a new provider fetch.
Future discovery/refresh needs provider configuration and quota. No synthetic
fallback is used. For a separately approved import after deployment:

```bash
node_bin=$(readlink -f "$(command -v node)")
sudo systemd-run --quiet --wait --pipe --collect --unit=iipa-market-import --uid=iipa --gid=iipa --property=WorkingDirectory=/opt/iipa/current --property=EnvironmentFile=/etc/iipa/runtime.env "$node_bin" /opt/iipa/current/deploy/ec2/import-market.mjs /opt/iipa/current/deploy/ec2/market-data.json
sudo -u iipa psql -X -h /var/run/postgresql -d iipa_demo -c 'SELECT name,applied_at FROM schema_migrations ORDER BY name'
sudo -u iipa psql -X -h /var/run/postgresql -d iipa_demo -c 'SELECT code,price_monthly,currency,status FROM subscription_plans ORDER BY display_order'
sudo -u iipa psql -X -h /var/run/postgresql -d iipa_demo -c 'SELECT (SELECT count(*) FROM assets) AS assets,(SELECT count(*) FROM market_quotes) AS quotes,(SELECT count(*) FROM market_price_bars) AS bars'
curl --fail --silent https://iipa.ahsal.systems/health
curl --fail --silent https://iipa.ahsal.systems/ready
curl --fail --silent https://iipa.ahsal.systems/api/v1/auth/session
sudo -u iipa env PUBLIC_ORIGIN=https://iipa.ahsal.systems "$node_bin" /opt/iipa/current/deploy/ec2/smoke.mjs
```

The default smoke test is read-only. Owner-approved `--allow-write` creates a
persistent nonprivileged smoke account/portfolio/watchlist and exercises login,
buy/sell, real cached valuation, persistence and logout; credentials remain in
memory. `--initialize-market` additionally consumes provider requests and requires
`--allow-write`; it is unnecessary with the imported cache. Full authenticated
smoke currently requires provider credentials configured even when using cache.

Browser checklist: register/login; protected `/portfolios`; buy/sell and valuation;
market history/volume/provenance; TSLA/AVGO search/selection; watchlist; Free $0
Current Plan/Pro Coming Soon on `/subscription`; desktop/mobile; logout followed
by protected-route redirect. Check the session endpoint returns JSON, never SPA
HTML or the previous 404. Do not record browser HAR/traces containing secrets.

Production password reset is intentionally unavailable (`503 MAIL_UNAVAILABLE`)
without a production delivery adapter. Existing password login/change and Google
remain separate. The local-outbox acceptance does not establish production mail.

## 8. Rollback and recovery

Bootstrap prints an exact root-private backup directory. Save that path, never
its contents. The backup includes previous release target, environment, Nginx and
service files/status; an existing DB also has `database.dump`.

```bash
sudo bash /opt/iipa/current/deploy/ec2/rollback.sh --backup /var/backups/iipa/deploy-EXACT_ID
```

This restores application/configuration and prior service enable/running state;
it does not restore/drop/downgrade a database or delete releases/backups. First
install rollback removes the new active link/service configuration and restores
the prior Nginx configuration. Repeated deployment stages a separate release.

Database recovery requires separate explicit approval. Stop writes; preserve
the current failed DB with a fresh backup; restore the selected dump into a **new**
local recovery database; verify counts, indexes, constraints, migrations and
application behavior there before an approved cutover. Never use `pg_restore
--clean` on `iipa_demo` or overwrite it automatically. Copy encrypted backups off
the single instance and schedule backups before longer public operation. Restore
testing and off-instance storage are outstanding operational requirements.

```bash
sudo pg_restore --list /var/backups/iipa/deploy-EXACT_ID/database.dump >/dev/null
# Only after separate recovery approval; the new database must not already exist:
sudo -u postgres createdb --owner=iipa iipa_recovery_REVIEWED_ID
sudo sh -c 'cat /var/backups/iipa/deploy-EXACT_ID/database.dump | runuser -u postgres -- pg_restore --exit-on-error --dbname=iipa_recovery_REVIEWED_ID'
```

Do not dump runtime environments, auth tables, journals with raw exceptions or
provider responses into reports. Nginx access logs omit query strings/bodies/
cookies; request error logs are suppressed because they can include OAuth codes.
Use sanitized API request IDs/statuses. Investigating operational failures may
need a separately reviewed temporary safe diagnostic.

## Validation record

See [local validation](validation.md) for current results and remaining runtime
verification. The prior P1 audit and historical PASS evidence are preserved.
