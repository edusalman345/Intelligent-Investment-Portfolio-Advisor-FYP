# IIPA localhost FYP demonstration

Prepared 11 November 2026. Repository branch: `demo/localhost-setup`.
The original PC state was backed up and verified on GitHub at
`72289282a40a23b26d355be3cab8ea7ae071f4b5` before localhost changes.
AWS deployment configuration remains in `deploy/ec2/`. No AWS production resource
is read, restarted or changed by the local commands below. Vercel was suspended
by the owner before the backup push.

## Software and dependencies

- Git and **Node.js 24.x** (validated with 24.22.1/npm 11.19.1).
- Local PostgreSQL **16 or 18**, running on port 5432.
- Python 3.13 only for policy/deployment tests or the optional analytics foundation.
- Docker and AWS credentials are unnecessary for M1-M3 and Subscription Plans.

From the repository root in PowerShell:

```powershell
# If the system default is another Node major, use the existing project runtime:
$env:Path = "$(Join-Path (Get-Location) '.tmp\node-runtime\node-v24.22.1-win-x64');$env:Path"
node --version
npm.cmd ci
```

Use a normally installed Node24 if that ignored portable runtime is absent.
Do not upgrade the global runtime or reinstall PostgreSQL to run this project.

## Local database

The approved application database is `fyp_portfolio_dev` on localhost:5432.
Keep the existing database, credentials and stored accounts/market observations.
The guarded demo commands reject remote hosts, alternate database names/ports,
connection-query overrides and production application settings before connecting.

Only if the database does not already exist, create it using your local PostgreSQL
administration account. The following is an interactive local `psql` example;
do not paste passwords into commands, source control or chat:

```powershell
psql -h localhost -p 5432 -U postgres -d postgres
```

```sql
-- New local setup only; do not recreate an existing role/database.
CREATE ROLE iipa_local LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
\password iipa_local
CREATE DATABASE fyp_portfolio_dev OWNER iipa_local;
\q
```

Privately configure the ignored root `.env` with your authorized local connection.
Do not reuse the AWS production database or environment. No database dump or
runtime credential file belongs in the GitHub backup.

## Private environment

Preserve an existing `.env`. For a fresh checkout only:

```powershell
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
```

`.env.example` intentionally contains **variable names only**. Set these public
development values privately in `.env`:

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback
TRUST_PROXY_LOOPBACK=0
MARKET_PROVIDER=alpha-vantage
SESSION_HOURS=24
QUOTE_MAX_AGE_HOURS=72
```

Required private names: `DATABASE_URL`, `ALPHA_VANTAGE_API_KEY` and, for Google
Login, `GOOGLE_CLIENT_ID` plus `GOOGLE_CLIENT_SECRET` from the same Web OAuth client.
Both Google fields may be blank to use email/password while owner setup is pending;
a half-configured pair is rejected. Existing configured credentials are preserved.
Do not send values to the frontend through `VITE_*` or print them in a terminal.

The API loads the root `.env`; process environment variables take precedence.
If an IDE terminal still holds production values, open a fresh development terminal
or privately remove only the stale process variables before starting. The demo
guard refuses production mode instead of overriding it silently.

## Migrations and startup

```powershell
npm.cmd run demo:migrate
npm.cmd run demo:check
npm.cmd run demo
```

`demo:migrate` invokes the existing migration implementation, retaining its
advisory lock, transactions and checksum ledger. It applies/replays 001/002 without
truncating accounts, portfolios or market data. `demo:check` verifies the connected
database and both migration ledger entries; it prints no credential values.
`demo` checks first, builds the existing Express API, then starts that compiled API
and the Vite frontend directly. It retains development configuration/cookies and
avoids reliance on the host's TypeScript watch-mode child process behavior.

Open **http://localhost:5173**. The API is **http://localhost:3001** and Google
returns through **http://localhost:3001/api/v1/auth/google/callback**. The API binds
IPv4 loopback `127.0.0.1` so it matches Vite's upstream. Use `localhost` consistently
in the browser; switching to `127.0.0.1` changes cookie/origin behavior.

For separate terminals after `demo:check`:

```powershell
# Terminal 1, predictable compiled demo API (development NODE_ENV still applies)
npm.cmd run build -w @ifms/api
npm.cmd run start -w @ifms/api
# Terminal 2
npm.cmd run dev -w @ifms/web
```

The original `npm run dev` watch workflow remains available for source editing.
API changes during the compiled demo need a rebuild/restart; frontend Vite changes
still reload normally. Frontend requests remain relative `/api/v1/...`; Vite proxies them to the local
Express backend. No cloud frontend/API URL is used. Ctrl+C stops a foreground demo.
If a port is occupied, identify the existing local process before stopping it;
do not kill unrelated Node or PostgreSQL processes.

**Do not run `db:seed` for this real-data demo.** That development command seeds
synthetic fixtures. Existing actual Alpha Vantage records are retained; missing
data requires authorized normal ingestion. Cache freshness/as-of indicators remain
visible; recorded or delayed EOD data is not described as live real-time data.
New stock discovery/refresh depends on internet access and provider quotas.

## Google Cloud owner setup

In the same Web OAuth client used by the private local configuration:

1. Add authorized redirect URI exactly
   `http://localhost:3001/api/v1/auth/google/callback`.
2. Add authorized JavaScript origin `http://localhost:5173` where applicable.
3. Keep the AWS HTTPS callback/origin and existing production credentials intact.
4. If the consent screen is in Testing, add the intended demo Google account as
   a test user. Do not share its identifier here.

Do not weaken state, nonce, PKCE, ID-token verification, explicit account linking,
CSRF, Origin/CORS, ownership or sessions. Development uses HttpOnly/Lax cookies
over loopback HTTP; production still uses Secure cookies over HTTPS.

Real Google acceptance needs a human account: fresh login -> callback -> protected
page -> logout -> protected route returns to login. Repeat identity/login and
explicit linking checks require the owner. Configuration presence and automated
provider-validation tests are not a current real Google E2E PASS.

On 11 November 2026 the owner confirmed **PASS** for actual localhost Google login,
protected-page access, logout and subsequent protected-route redirection. No new
Google Console setting was required on this PC. Preserve both local and AWS client
configuration; a fresh checkout still needs private credentials/Console setup.

## Demo and validation

Check API process/database and frontend routing:

```powershell
Invoke-RestMethod http://localhost:3001/health
Invoke-RestMethod http://localhost:3001/ready
# Anonymous session endpoint is safe; never print an authenticated session/token.
Invoke-RestMethod http://localhost:5173/api/v1/auth/session
```

Browser journey: register/login, profile and session controls; create a portfolio,
buy/sell with derived holdings and real cached valuation; search TSLA/AVGO, inspect
history/volume/source/freshness; manage a watchlist; visit `/subscription` for Free
$0 Current Plan and Pro Coming Soon; logout and check protected-route redirection.
Never paste account details, cookies, reset URLs or tokens into reports.

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit --audit-level=moderate
# Separate disposable PostgreSQL16 cluster and guarded *_test database:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/ec2/test-pg16.ps1
```

The disposable validator does not reset `fyp_portfolio_dev`; it stops its own
loopback cluster on completion. Tests must never use the owner's development DB
or AWS DB. `npm run test:e2e` also needs a separate `_test` browser database and
free ports; do not point it at the normal demo database. Run browser automation
on isolated ports when the owner demo is already running.

Local password reset uses the existing private outbox: `.tmp/mail/` under the
repository-root `demo` launcher, or `services/api/.tmp/mail/` under separate workspace
API startup, unless a private `MAIL_OUTPUT_DIR` overrides it. Open the short-lived reset link
only locally. This is not production email delivery. Analytics is optional for
these modules and does not require an external AI API or paid services.

P1 CI now includes pushes to `demo/**`; these workflows validate code and do not
deploy AWS. Vercel suspension remains an external owner setting, not a code switch.

## Validation performed on this PC

| Check | Result |
|---|---|
| Node24 dependency installation | PASS; locked dependencies restored |
| Whole-repository lint / TypeScript including demo scripts | PASS |
| Frontend / API unit tests | PASS: 35/35 and 33/33 |
| Disposable PostgreSQL16 serial integrations | PASS: 56/56 |
| Fresh and repeated migrations / public market import replay | PASS; no duplicate observations |
| Frontend and API production builds | PASS |
| Dependency audit after development-tool patch | PASS: zero vulnerabilities |
| Actual local migrations and schema | PASS: 23 tables, 53 indexes, 247 constraints; both migration records and Free/Pro seeds |
| Owner local cache persistence | PASS: AAPL/MSFT/NVDA/TSLA/AVGO, one real quote and 100 bars each |
| API health/readiness and frontend session proxy | PASS: HTTP200 JSON |
| Guarded launcher startup / Ctrl+C / restart | PASS: only owned local listeners stopped |
| Combined real-data browser workflow | PASS: 3 tests; synthetic-only fourth intentionally SKIPPED |
| Desktop/mobile inspection | PASS: branding, real market, portfolio and subscription |
| Owner real Google login/protected page/logout | PASS; owner-confirmed |
| Independent code/security review | PASS; launcher/config round1 and narrow browser-harness round2 |

Browser tests use isolated ports3002/5174 and a fresh PostgreSQL16 `_test` database
on55437. The temporary services/cluster were stopped afterward. Screenshots (21)
remain ignored in `.tmp/localhost-browser-final/`; these use synthetic test accounts
and recorded actual market observations, not owner account details.

Initial restricted automation attempts hit the known Windows `uv_os_get_passwd`
sandbox issue; unchanged commands passed with normal local permissions. TypeScript
watch startup did not expose the API listener on this host; the guarded demo now
uses the validated compiled API. The first combined browser run hit the unchanged
authentication limit from redundant full-page navigation. The test now uses the
actual Markets navigation and omits a duplicate detail reload; all assertions and
security limits remain intact. The final complete combined run passed.

The audit initially reported minimatch's development-tool advisory
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
A tested override to patched11.0.1 updates only lint-tool dependencies; no force
downgrade or production application change. Lint, types, tests and builds pass.
Fresh provider egress/quotas were not exercised: cached actual observations retain
their original dates and staleness indicators. Historical data is not relabelled
as a fresh fetch. No AWS production or deployment check was performed.

## Switching to AWS and troubleshooting

Local `.env` stays on this PC. AWS uses `/etc/iipa/runtime.env`, Node production
mode, Secure cookies, same-origin Nginx HTTPS and its existing deployment runbook
in [deploy/ec2/README.md](deploy/ec2/README.md). Nothing in the demo scripts calls
SSH, AWS, Nginx, systemd or the deployment bootstrap. Changing localhost files
does not authorize deploying/restarting production.

- `LOCAL_NODE_24_REQUIRED`: select Node24 before running npm.
- `LOCAL_DATABASE_TARGET_REJECTED`: privately check loopback:5432 and approved
  `fyp_portfolio_dev`; connection overrides/production targets are rejected.
- `LOCAL_SERVER_CONFIGURATION_REQUIRED`: check development mode, IPv4 bind,
  frontend origin, ports and disabled local reverse-proxy trust.
- `LOCAL_DEMO_FAILED`: check local PostgreSQL availability/credentials privately;
  raw database errors are intentionally suppressed.
- `LOCAL_MIGRATIONS_REQUIRED`: run `demo:migrate` against the approved local target.
- Google redirect mismatch: check the exact Console URI and restart the local API
  after privately changing configuration. A localhost callback cannot verify AWS OAuth.
- Generic Google failure: keep provider exceptions private; do not log raw codes,
  cookies or tokens. Investigate sanitized stages and current client configuration.
- API 404/HTML response: use the Vite URL and verify its `/api` proxy; the API session
  URL must return JSON. No frontend API base URL replacement is needed.
- Provider quota/outage: preserve stored valid data and report freshness; do not
  substitute synthetic prices or bypass provider limits.
- Node `uv_os_get_passwd` under restricted automation: use a normal local terminal;
  this host sandbox issue is not fixed by changing application authentication.

The baseline backup and final localhost commit are separate. Original personal
VS Code settings and Proposal stay local and unchanged; private configuration,
dependencies, builds and temporary evidence are not committed.
