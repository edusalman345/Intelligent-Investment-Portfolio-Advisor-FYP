# Intelligent Investment Portfolio Advisor (IIPA) — P1 Mid

Application branding is **IIPA - Intelligent Investment Portfolio Advisor**, as
explicitly approved by the owner on 28 October 2026. The supplied proposal uses
the earlier title Intelligent Financial Management System. That source and all
historical audit findings remain preserved; this is an authorized branding
decision, not a change to the 15 approved features. Internal `@ifms` packages,
service/cookie identifiers and legacy document filenames remain compatible.
See the [branding decision and reference inventory](docs/branding.md).

P1 implements the three modules selected in the approved Proposal, PRD and TRD:
User Authentication, Portfolio Management and Market Data Management. The React
application, Express API and PostgreSQL database run natively on Windows. The
FastAPI service is a separate health foundation; it is optional for these screens.

The default market source is **synthetic demo data**, including generated prices
for AAPL, MSFT and NVDA and a synthetic CPI series. These are not historical market
observations or an economic dataset. The UI and API expose demo provenance,
observation dates and freshness. No external credentials are needed for this demo.

## Additional Subscription Plans prototype

The authenticated `/subscription` page compares the current Free workspace
($0/month) with Pro (Coming Soon, no price or checkout). It reads the PostgreSQL
catalog through `GET /api/v1/subscription-plans`. Apply normal migrations to add
`002_subscription_plans.sql` and its two reference records. All existing users
retain access; there are no user subscriptions, payments or entitlement checks.
This enhancement is separate from the original 15 approved P1 Mid features.
See [validation](docs/p1-validation.md) and [changelog](CHANGELOG.md).

## Native Windows setup

Use Git, Node **24.x** with its bundled npm, Python **3.13** for analytics/checks,
and PostgreSQL **18** (development validated with 18.6). Install these tools yourself
if absent. Docker, AWS and deployment setup are deferred.

The root package and lockfile require Node 24, and application CI uses Node 24 on
Windows and Linux. Check `node --version` before installing dependencies; use a
current Node 24 release rather than relying on another major version already on
your PATH.

From this repository root:

```powershell
npm ci
Copy-Item .env.example .env
```

Create a dedicated local development database and database role using your local
PostgreSQL administration tools. Edit the ignored root `.env` privately and set
`DATABASE_URL` to that database's connection URL. It must be a development
database. Keep passwords, OAuth secrets and API keys out of chat, source control,
terminal output and screenshots. `.env.example` deliberately contains variable
names with empty values only. Process environment values take precedence over
the root `.env` loaded by the API.

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to the API at
**http://127.0.0.1:3001**. Register your own account; the seed creates no user,
password or administrator. Use the same `localhost` frontend origin consistently
for sessions, allowed Origin checks and OAuth redirects.

To exercise administrator-only ingestion, register a local account first, then
grant it the development role through the audited CLI:

```powershell
npm run db:admin -- investor@example.test
```

Replace that example email with your registered local account's email. This CLI
does not create accounts and refuses `NODE_ENV=production`.

## Configuration

Only `DATABASE_URL` is mandatory for the local application. Configure additional
names privately when needed:

| Variable | Behavior/default when empty |
|---|---|
| `DATABASE_URL` | Required development PostgreSQL connection |
| `TEST_DATABASE_URL` | Separate disposable integration database; name must end in `_test` |
| `FRONTEND_ORIGIN` | `http://localhost:5173`; an exact HTTP(S) origin without a path |
| `HOST`, `PORT` | API `127.0.0.1`, `3001` |
| `NODE_ENV` | `development`; production enables Secure cookies and disables local reset delivery |
| `SESSION_HOURS` | `24`, supported range 1–168 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Required for Google Login; keep private; see the [Google setup guide](docs/google-oauth-setup.md) |
| `MARKET_PROVIDER` | `fixture`; optional `alpha-vantage` adapter |
| `ALPHA_VANTAGE_API_KEY` | Needed only for the optional free daily-data adapter |
| `QUOTE_MAX_AGE_HOURS` | `72`, supported range 1–720 |
| `MAIL_OUTPUT_DIR` | `.tmp/mail`, relative to the API process working directory |
| `ANALYTICS_HOST`, `ANALYTICS_PORT` | Reserved names; the health service is started with explicit Uvicorn CLI options |

In normal npm workspace startup, password-recovery messages are written privately
to `services/api/.tmp/mail/`; open a reset URL locally rather than posting it. Each
link is short-lived and single-use. There is no SMTP integration in P1. Local
outbox delivery is disabled in production, where recovery requires an explicitly
configured delivery implementation. Never publish outbox files or browser traces
containing active reset links.

The optional Alpha Vantage adapter uses `GLOBAL_QUOTE` and compact
`TIME_SERIES_DAILY`. It does not promise real-time, premium, adjusted or unlimited
data. Refresh is administrator-only, one asset per request, with a cooldown and a
conservative local request budget. Provider failure preserves cached records.
Real mode reads only the configured real source; unavailable real observations
remain missing rather than falling back to synthetic prices. Quote dates are
daily observation dates, not intraday trade timestamps.

Privately configure `ALPHA_VANTAGE_API_KEY` and set `MARKET_PROVIDER` to
`alpha-vantage` before starting the real-data demo. Import each supported asset
through the guarded local operator command (wait at least 65 seconds between
commands; provider limits still apply):

```powershell
npm run db:market:refresh -w @ifms/api -- AAPL
# After the cooldown:
npm run db:market:refresh -w @ifms/api -- MSFT
# After the cooldown:
npm run db:market:refresh -w @ifms/api -- NVDA
```

In real mode, Markets supports dynamic symbol/company discovery through Alpha
Vantage `SYMBOL_SEARCH`, limited to validated US/USD equities. Selecting a new
asset loads and caches its actual quote/history; the same asset becomes available
in portfolio and watchlist selectors. Provider limits and failures are displayed
explicitly. The operator command also accepts valid symbols such as TSLA/AVGO,
discovers missing entries, and rejects ambiguous/unsupported assets.

The command requires native development mode and the approved local
`fyp_portfolio_dev` database. It performs no seeding, role changes or schema
changes. Successful normalized observations/evidence are saved under ignored
`.tmp/real-market/` for local acceptance replay. Failure prints only a safe
category and preserves cached records. See the latest P1 acceptance report for
actual observed provider access and validation results.
Yahoo Finance, news providers, OpenAI, external datasets and ML integrations are
outside this P1 phase. The application does not consume `OPENAI_API_KEY`.

## Optional analytics health service

```powershell
Set-Location services/analytics
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip==26.2.1
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn ifms_analytics.app:app --host 127.0.0.1 --port 8001 --reload
```

`GET /health` and `/ready` on port 8001 indicate only process health. This service
does not access the database, calculate portfolios or run models. See its
[service README](services/analytics/README.md).

The API's `GET /health` reports process health; `GET /ready` additionally checks
database access and the foundation migration, returning 503 when unavailable.

## Validation

Run JavaScript checks from the repository root:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
python -m unittest discover -s scripts -p "test_secret_files.py"
python scripts/check_secret_files.py
```

The secret-file policy inspects the Git index; use it after staging intended
changes too. It rejects real environment/credential files and requires the exact
`.env.example` to contain empty variable assignments only.

Integration tests reset data. Use the disposable loopback cluster instead of your
normal development database:

```powershell
.\scripts\start-test-db.ps1
$env:TEST_DATABASE_URL = 'postgresql://ifms_test@127.0.0.1:55432/ifms_p1_test'
npm run test:db
```

Supply `-PostgresBin` if your PostgreSQL tools are elsewhere. The script creates
or reuses `.tmp/postgres-p1-test` and does not modify the installed PostgreSQL
service. Trust authentication is confined to this disposable loopback cluster.
Tests require an `_test` name, verify the actual connected database and reject
the same database name as `DATABASE_URL`, including connection aliases.

Browser tests need a **different** disposable database and free application ports
3001/5173. Create it once in that same disposable cluster:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' -h 127.0.0.1 -p 55432 -U ifms_test ifms_browser_test
$env:DATABASE_URL = 'postgresql://ifms_test@127.0.0.1:55432/ifms_browser_test'
npx playwright install chromium
npm run test:e2e
```

If that database already exists, omit `createdb`. The browser preparation script
**resets its data**, migrates and seeds it. It refuses a non-test name or the same
name as the integration database. Playwright starts its own API/frontend, uses
synthetic data and deliberately disables real Google credentials. An already
installed Chrome/Edge can be selected using process variable
`E2E_BROWSER_CHANNEL=chrome` or `msedge`. Restore your development `DATABASE_URL`
after testing. Stop the isolated cluster when finished:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' stop -D .tmp\postgres-p1-test
```

From `services/analytics`, run:

```powershell
.\.venv\Scripts\python.exe -m pytest -W error
.\.venv\Scripts\python.exe -m ruff check --no-cache .
.\.venv\Scripts\python.exe -m ruff format --no-cache --check .
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m pip_audit --skip-editable --progress-spinner off
.\.venv\Scripts\python.exe -m pip wheel --no-cache-dir --no-deps --wheel-dir dist .
```

The application CI runs JavaScript quality checks on Windows/Linux, PostgreSQL
and Chromium workflows on an ephemeral Linux PostgreSQL service, and analytics
checks independently. CI's disposable service does not require local Docker.
Recorded results and review limitations belong in the
[P1 validation record](docs/p1-validation.md); commands listed here are not claims
that checks passed.

## Database changes and scope

`db:migrate` applies ordered SQL migrations transactionally under an advisory
lock. `schema_migrations` records SHA-256 checksums: a second run skips unchanged
applied files and rejects edited applied migrations. Add a new forward migration
instead. Git keeps migration SQL line endings as LF across Windows/Linux so
checksums remain consistent. The seed is repeatable and does not replace existing market records.

Back up any populated development database before migration. If application code
must be rolled back, stop it, return to the previous validated code and preserve
the database. There is no automated destructive down migration. Recover from a
verified backup or apply a reviewed forward correction; do not drop a populated
database as a rollback shortcut.

The USD-only prototype records trades as externally funded holdings and cost.
**Buy/sell transactions do not settle cash.** Record deposits, withdrawals,
dividends and cash fees separately. Fractional amounts use decimal arithmetic;
invalid oversells and invalid reversals roll back atomically. Current valuations
use eligible cached prices and disclose stale/unpriced positions; stored history
contains snapshots created by portfolio mutations, not a daily backtest.

Read the [P1 implementation plan and API inventory](docs/p1-implementation-plan.md)
for acceptance criteria and tables. The supplied Proposal remains unchanged.
The owner-authorized PRD, TRD and schema updates append the separately scoped
Subscription Plans enhancement; original copies are preserved under ignored
`.tmp/`. Production deployment,
Docker/Compose, AWS, later analytics/news/event modules and automatic merging are
deferred.
