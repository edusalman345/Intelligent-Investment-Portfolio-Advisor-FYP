# IFMS P1 Mid final pre-release audit

Audit date: 28 October 2026 (America/Los_Angeles).
Audited branch: `feature/p1-auth-portfolio-market`.
Audited commit: `00226af1e0a77cffe7c4c21de35884f290968dac`.
Accepted M1-M3 baseline: `5eb83b6`; Subscription Plans is a separate enhancement.

Status: COMPLETE. All requested current local checks have completed; the
initial database cleanup failure and successful unchanged rerun are both recorded. No code, existing documentation, commits,
remote refs, secrets or cloud settings were changed by this audit. The only
requested repository write is this uncommitted audit report; test/build outputs
and temporary verification probes remain ignored. Production resources were not
queried or modified.

## 1. Decisions

| Target | Decision | Reason |
|---|---|---|
| Local P1 Mid university demo | GO | All 15 approved features plus the catalog pass the current local checks and existing browser workflows, within accepted prototype limits. |
| GitHub PR update / push / merge | NO-GO | Owner push hold; Vercel auto-deployment settings unverified; remote PR is stale, current local commit has no returned remote validation/review evidence. |
| AWS deployment | NO-GO | Hosting/routing, production OAuth/mail/database/backups/TLS/DNS, migration job and operational controls are not verified/prepared. |

Local-demo success is not production approval. Offline PR preparation is
technically possible; creating/updating remote work or merging is not approved.

## 2. Scope and changes since accepted P1

Proposal pages 5/11, PRD 6.1-6.3, TRD 9/19/20 and database design remain the
requirements baseline. There are 15 approved features, five per module. Google
OAuth is part of registration/login, not a replacement or new approved module.

`git diff --name-status 5eb83b6..00226af` contains exactly 19 expected enhancement
files: subscription UI/navigation/styles/tests, read-only API/router/contract,
additive migration 002, three intentionally updated/versioned DOCX references,
README, implementation/validation documentation, changelog and two UI images.
No changes to auth/Google/portfolio/market-provider business source or migration
001 were found. No Modules 4-12, payments or access restrictions were introduced.

The three DOCX appendices preserve original content and all other ZIP parts.
Their prior render QA covers PRD 31 pages, TRD 14 and schema 29; this audit checked
current content and found one separately scoped enhancement appendix in each.
Historical audit evidence is preserved, not rewritten to imply production success.

## 3. Approved feature completion matrix

All PASS entries apply to the accepted local prototype scope. API paths below
are relative to `/api/v1`. Source locations are repository-relative.

| ID / approved feature | Status | Evidence |
|---|---|---|
| AUTH-01 Registration/login including Google | PASS | `services/api/src/auth.ts:95,111,215-295`, `google.ts:13`; `/auth/register`, `/auth/login`, Google start/link/callback; auth integration and Google unit tests; current password browser journey; historical owner real Google acceptance. |
| AUTH-02 Password management | PASS | `auth.ts:24,160-211`; `/auth/password/change`, `/forgot`, `/reset`; salted scrypt, reauthentication, expiring one-use reset tokens, session invalidation; reset/link lock-race coverage. Local outbox is accepted. |
| AUTH-03 Role access | PASS | `auth-context.ts:46-57`; strict investor registration, backend admin guards, Origin/CSRF and cross-user ownership integration coverage. |
| AUTH-04 Profile management | PASS | `auth.ts:129-143`, `apps/web/src/pages/Settings.tsx`; GET/PATCH `/me`; supported validated settings; profile and REAUTH_REQUIRED regression tests. |
| AUTH-05 Sessions | PASS | `auth-context.ts:27-44`, `auth.ts:61,124,146,152`; persistent hashed sessions, expiry/revocation/disablement, logout/list/revoke, protected workspace; current auth and browser tests. |
| PORT-01 Portfolio creation | PASS | `portfolio.ts:101-140`; `/portfolios` CRUD/archive; unique active names, status and owner tests. |
| PORT-02 Holdings management | PASS | `portfolio.ts:70-81`, `ledger.ts`; transaction-derived fractional holdings, exact weighted cost, concurrent sales; real browser retained TSLA/AVGO positions. |
| PORT-03 Transactions | PASS | `portfolio.ts:157-195`; BUY/SELL/DEPOSIT/WITHDRAWAL/DIVIDEND/FEE/REVERSAL; idempotency, immutable reversal, validation and atomic rollback tests. |
| PORT-04 Valuation | PASS | `valuation.ts:18-48`, `portfolio.ts:198-208`; exact Alpha source and latest eligible cached quote; stale/missing indicators and event-driven snapshot persistence. |
| PORT-05 Watchlists | PASS | `portfolio.ts:211-263`; owner-scoped CRUD/items, duplicates/invalid assets and dynamic-stock membership tests. |
| MDAT-01 Collection/discovery | PASS | `market.ts:46,174,197`, `market-provider.ts`; SYMBOL_SEARCH, validated US/USD equity registration, identity reuse, TSLA/AVGO and partial-match/concurrency tests. Actual ingestion provenance and stored records verified read-only. |
| MDAT-02 Current price updates | PASS | Real-source quote endpoint and ingestion; EOD timestamps/provenance/freshness, no synthetic fallback; authorized manual refresh. |
| MDAT-03 Historical market data | PASS | Compact daily OHLCV adapter, chronological normalization, unique observations and bounded date queries/charts. |
| MDAT-04 Trading volume | PASS | Exact normalized quote/bar volume, null-versus-zero storage tests and latest-volume UI. |
| MDAT-05 Data validation | PASS | Invalid/future/duplicate/malformed/identity checks, quarantine, safe errors, quotas, outages and cache-preservation tests. |

M1: COMPLETE. M2: COMPLETE. M3: COMPLETE within accepted local scope.
Real Google consent, replacement-secret verification, stable identity reuse,
explicit password-account linking, same-email refusal and logout were previously
owner-confirmed. They were NOT freshly performed during this read-only audit.
Current protocol/unit/integration tests do not substitute for production OAuth UAT.

## 4. Subscription Plans enhancement

| Requirement | Result | Evidence |
|---|---|---|
| Protected `/subscription` and navigation | PASS | `App.tsx`, `pages/Subscription.tsx`; frontend and browser auth/redirect checks. |
| Free USD 0/month and Current Plan | PASS | Database decimal `0.00`; current page/API assertions. |
| Pro Coming Soon, no active price or checkout | PASS | Database NULL price; coming_soon; no purchase action or Pro functionality. |
| Authenticated read-only API | PASS | `services/api/src/subscriptions.ts`; GET `/subscription-plans`; unauthenticated 401, fixed SELECT, no write endpoint. |
| Additive migration/seed | PASS | `002_subscription_plans.sql`; ledger/checksum handling, Free/Pro seeds, constraints and fresh/repeated migration test. 001 unchanged. |
| No entitlement/billing enforcement | PASS | No user-plan relation or authorization claim; existing portfolio/assets/watchlist access remains permitted. |

## 5. Fresh automated and browser checks

Node 24.22.1/npm 11.19.1 from the local verified runtime were used. No dependency
manifest or source changes were needed. PostgreSQL tests target only guarded
`_test` databases on loopback port 55432; the owner development DB is never reset.

| Command / check | Result |
|---|---|
| `npm run lint` | PASS; generated/dependency/cache exclusions only, no new suppression. |
| `npm run typecheck` | PASS: web, API, contracts. |
| `npm test` | PASS: 33 frontend and 27 API unit tests. |
| `npm run test:db` | PASS on unchanged rerun: 56/56. Initial run 55/56 due DROP DATABASE cleanup timeout; see reliability note. |
| `npm run build` | PASS: frontend production bundle and API TypeScript build. Existing main-bundle advisory approximately 686 kB. |
| `npm audit --audit-level=moderate` | PASS: zero reported vulnerabilities. |
| Analytics pytest `-W error` with writable cache | PASS: five tests. |
| Analytics Ruff lint/format and pip check | PASS. |
| Analytics `pip_audit --skip-editable --progress-spinner off` | PASS: no known vulnerabilities reported; unpublished editable local package excluded; cache-read permission warning affected caching only. |
| Secret-file policy and two policy unit tests | PASS. |
| Complete committed/private-value scan | PASS: 136 committed files, decompressed DOCX XML, two built frontend JS bundles; zero matches for privately configured current/rotated values; no values printed. |
| Fixture browser suite | PASS: existing P1 workflow and subscription workflow, two passed; real-only test intentionally skipped. |
| Existing five-stock real-data browser workflow | PASS: one workflow, about 1.2 minutes for the test (1.6 minutes including services). |
| Local health/readiness | PASS: `/health`, `/ready` HTTP 200. |
| Local direct and proxied session endpoint | PASS: API `/api/v1/auth/session` and Vite-proxied equivalent both HTTP 200. |
| Current development migration/schema verification | PASS: both checksums, objects and constraints verified read-only; details below. |
| Real production Google/browser/TLS/backup restore | UNVERIFIED / not run; no production environment was changed or tested. |
| Latest remote CI | UNVERIFIED: available GitHub responses return no statuses/PR workflow runs for unpublished local commit. |

Browser commands used `node node_modules/@playwright/test/cli.js test --config
.tmp/playwright-real-isolated.config.ts`, once with `E2E_REAL_MARKET=0`, once with
`E2E_REAL_MARKET=1 --grep 'real stored OHLCV'`. These derive from the committed
Playwright config and isolate API/frontend on 3002/5174 while leaving owner
services on 3001/5173. Trace capture is disabled. Fixture evidence is preserved
under `.tmp/pre-release-evidence/fixture/`; real-run evidence remains in ignored
test outputs and is copied to the corresponding real evidence directory.

Actual browser market observations are schema-validated recorded provider data,
not fabricated prices. The current five-stock journey verifies retained 1.5 AAPL shares plus one TSLA
and one AVGO share, valued at 1,270.44 USD from the cached real prices, along
with buy/sell, snapshots, watchlists, password lifecycle and protected logout.
No fresh Alpha ingestion was triggered because this is a
read-only audit. Unknown-symbol discovery uses mocked provider integration tests,
plus prior real TSLA/AVGO provider evidence and owner search acceptance. Real
Google credentials are not given to automated browser tests.

The initial disposable PostgreSQL startup waited longer than pg_ctl's timeout
while recovering after interruption; PostgreSQL subsequently became ready. The
initial full suite passed functional assertions but its fresh-database test hit
the configured 10-second statement timeout in cleanup at
`services/api/test/integration/subscriptions.test.ts:89` (`DROP DATABASE`).
An unchanged serial rerun without competing browser work passed all 56 tests.
No test timeout, implementation, assertion or security control was modified.
Both attempts remain part of this audit; the failure is not relabelled PASS.
One generated subscription-test database remains in the disposable cluster after
the failed cleanup. It was not manually deleted during this read-only audit; the
cluster is stopped after verification. This is isolated test data, not owner or
production data.

## 6. Database, persistence and migrations

Development database was checked in read-only transactions against the approved
loopback target, with no URL/password printed. Both applied migration checksums
match repository SQL: `001_p1_foundation.sql`, `002_subscription_plans.sql`.

- 22 domain tables plus `schema_migrations`: 23 total.
- All 15 explicitly named foundation indexes exist; the catalog additionally has
  its implicit primary-key and unique-code indexes.
- No unvalidated constraints. All 247 public constraints match the normally
  migrated disposable reference schema.
- Catalog: free/Free/0.00/USD/active/order0; pro/Pro/NULL/USD/coming_soon/order1.
- Portfolio/auth/market durability, ownership relationships and fresh/repeated
  migrations are covered by the current PostgreSQL suite. The earlier targeted
  browser audit explicitly verified three holdings, six transactions, seven
  snapshots and watchlist membership after logout/relogin; relevant business
  source is unchanged since that evidence.

| Symbol | Real quote rows | Daily bars | Quote as-of (UTC) | Recorded ingestion (UTC) | Volume |
|---|---:|---:|---|---|---|
| AAPL | 1 | 100 | 2026-10-27 00:00 | 2026-10-27 20:18:08.382 | present |
| MSFT | 1 | 100 | 2026-10-27 00:00 | 2026-10-27 20:19:16.548 | present |
| NVDA | 1 | 100 | 2026-10-27 00:00 | 2026-10-27 20:20:38.516 | present |
| TSLA | 1 | 100 | 2026-10-27 00:00 | 2026-10-28 01:05:04.949 | present |
| AVGO | 1 | 100 | 2026-10-27 00:00 | 2026-10-28 01:06:47.208 | present |

Each symbol resolves to one registered asset in the query. Source is the exact
Alpha Vantage source with isDemo=false. Source-mode isolation excludes newer
fixtures/unrelated sources. Observation dates are daily dates, not intraday
trade timestamps. Provenance: [provider evidence](evidence/p1-real-provider.json).
First AAPL ingestion retains historical ordering warnings; normalization has
regression coverage and existing valid records were not erased.

## 7. Frontend/API security findings

Independent read-only source/security review found no supported CRITICAL/HIGH
local application flaw or unexpected authorization bypass. This is not an
exhaustive penetration test or a production security certification.

- OAuth state/binding hashes, expiring one-use database transactions, PKCE S256,
  Google-library signature/issuer/audience/expiry validation, nonce and verified
  email checks remain intact. Linking requires current password/original active
  session and locked rechecks; implicit same-email linking remains refused.
- Salted scrypt password hashes and hashed opaque session/reset tokens persist.
  Cookies are HttpOnly/SameSite=Lax and become Secure under NODE_ENV=production.
- Backend ownership/RBAC, exact Origin/CORS and CSRF enforcement remain server-side.
  No subscription entitlement claim was introduced.
- SQL is parameterized; React encodes catalog text; provider host/response size,
  timeout/retries, quotas and failure messages are constrained/sanitized.
- Secrets remain backend-only. Current local presence was checked as booleans;
  no credentials, identifiers, cookies, codes or tokens enter this report.
- Helmet/API security tests pass. Hosting-layer frontend headers, TLS and proxy
  behavior are production requirements that have not been verified.

## 8. Deployment-readiness findings

### Vercel and GitHub

Vercel Production Branch, automatic Production deployment state, feature-branch
Preview behavior, deploy hooks, branch rules, monorepo project root, build/output
settings, API/SPA rewrites and environment assignments: **UNVERIFIED**. No
connected Vercel settings surface/project link was available. No `vercel.json`
or `.vercel/project.json` or deployment commands/hooks were found in repository
configuration. This does NOT prove a push is safe: Git integration can deploy
independently of GitHub Actions. Keep the owner's push hold.

Fresh read-only GitHub metadata confirms:

- Private repository; default branch main.
- PR [#3](https://github.com/edusalman345/Intelligent-Investment-Portfolio-Advisor-FYP/pull/3)
  is open, draft, unmerged, head `39db23f0adc905f750e24b86d4c667c97e39c7ae`.
- PR base is `chore/ai-orchestration`, SHA `0578525b868607cc61e59843070034eebfaa00ba`.
  This is the historical stacked target; confirm it remains correct rather than
  assuming a direct-to-main merge.
- PR body is stale: it predates real Alpha/stock discovery/subscription completion,
  and still describes old UAT/fixture-only state and untracked requirement files.
- No submitted PR reviews returned. No combined statuses or PR-associated workflow
  runs returned for local `00226af`; this is not evidence of current remote CI PASS.
- Current branch protection/ruleset enforcement is **UNVERIFIED**. Available
  repository/branch metadata does not expose enforcement details. Historical
  `docs/repository-management-setup.md` records main ruleset 24410479 and no named
  required CI checks at that time; do not treat that snapshot as a current check.

`p1-ci.yml` runs on pull requests and pushes to main/feature branches.
`orchestration-policy.yml` runs on pull requests and main pushes. Both are
validation workflows with contents:read; no Vercel/AWS deployment commands were
found. Verify current required named checks, up-to-date review requirements,
resolved conversations, target/base and independent approvals before any merge.
No rule, branch, PR or workflow was changed or triggered by this audit.

Node 24 agrees across package, lockfile, README and CI. This audit used24.22.1;
the current host default is Node 26.8.1. Use the documented Node 24 runtime
for this validated stack rather than assuming the shell default matches.
Vercel supports Node 24 and Express entrypoints/listeners; a missing api directory
alone does not prove incompatibility. Actual project routing remains unverified.
Sources: [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions),
[Express hosting](https://vercel.com/docs/frameworks/backend/express),
[Git deployments](https://vercel.com/docs/git).

### Production routing and the session 404

`apps/web/src/api.ts` uses relative `/api/v1/...`; Vite's `/api` proxy is
**development-only**. Production must route API requests to the Express process
and provide SPA fallback for other frontend paths, including subscription deep links.
A static-only deployment without that API route can reproduce a session404;
this is a supported routing risk/inference, not a proved historical root cause.

Local direct/proxied `/api/v1/auth/session` both return200. Production public-host
behavior is **UNVERIFIED**. Require actual-host GET smoke tests for JSON content
and expected anonymous/session envelope, authenticated cookies, redirects and
OAuth callback forwarding. A200 HTML SPA fallback is not a valid API response.

### Production environment and OAuth

Backend variable NAMES: `NODE_ENV`, `DATABASE_URL`, `FRONTEND_ORIGIN`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`,
`MARKET_PROVIDER`, `ALPHA_VANTAGE_API_KEY`, `HOST`, `PORT`; optional
`SESSION_HOURS` and `QUOTE_MAX_AGE_HOURS`. `MAIL_OUTPUT_DIR` is development
outbox configuration, not production delivery. No new subscription variables exist.

Require explicit production configuration. Current verified values are LOCAL:
development mode, approved loopback DB, expected localhost frontend/callback,
Google/provider credentials present, alpha-vantage mode and non-Secure local
cookie setting. Production values are **UNVERIFIED** and must not reuse local
DB/origins/callback blindly. Default market mode remains fixture unless explicitly
set; do not present fixture output as actual provider data in production.

No frontend build secret variables are required. Do not put database/provider/
OAuth secrets into VITE_* or frontend bundles. The current client has no
configurable production API base; same-origin proxying is the most direct fit.
Separate cross-site frontend/API hosting needs a deliberate code/cookie/CORS design.

Production Google Console must register the exact approved HTTPS callback ending
`/api/v1/auth/google/callback` and the server must use that same URI. Where
JavaScript origins are configured, use the exact approved frontend HTTPS origin;
they do not fix a mismatched redirect URI and this implementation uses server-side
OAuth rather than a browser token SDK. Console production settings, consent-screen
access/publishing and actual public-host OAuth login/link/logout are UNVERIFIED.
Source: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

HTTPS/TLS termination, HTTP-to-HTTPS redirect and production Secure cookies must
be tested together. CORS allows only FRONTEND_ORIGIN and mutations require valid
Origin/CSRF. Do not broaden origins or disable cookie/token verification to make
hosting work. `trust proxy=false` and default in-memory HTTP limiters require a
reviewed trusted-proxy/client-IP/multi-instance design behind ALB or other proxies.
Blanket trust of forwarded headers is not acceptable.

### Production database, migrations, backups and operations

No actual production database, network policy, client/server TLS validation,
least-privilege roles, backup retention, RPO/RTO, restore drill or migration
pipeline is verified. Require private database networking, encryption/TLS,
separate app/migration permissions, pre-migration backup and tested restore/PITR.

Apply both immutable migrations in a controlled release job before traffic.
`db:migrate` currently invokes tsx, a development dependency; an omit-dev runtime
artifact cannot assume that script works. Define migration packaging/dependencies
and include the SQL files (or use the correctly packaged compiled migrator).
Do not run `db:seed` in production: it creates synthetic market/economic fixtures.
Reference subscription plans are seeded by migration002 itself.

`/ready` checks database plus **001 only**, not002. An independent all-migrations
release gate and catalog smoke test are required before deployment. `/health`
proves process availability, not OAuth/provider/schema completeness.

Production reset delivery is explicitly503 MAIL_UNAVAILABLE without a delivery
adapter injected/wired into the server (`auth.ts:84,183`). The accepted local
outbox is not a production mail implementation; setting MAIL_OUTPUT_DIR does not
fix this. Production recovery needs separately authorized implementation and tests.

Response correlation IDs and sanitized errors exist. Central logging/retention,
metrics/alerts, process supervision, backup monitoring and staged rollback are
unverified. Redact cookies/authorization/OAuth/provider material; keep safe
categories and correlation IDs rather than logging raw exceptions.

Rollback must preserve durable financial/auth data: retain a known-good artifact,
verify backward-compatible schema handling and use reviewed forward corrections
or an approved tested restore. Do not edit applied migrations or automatically
DROP tables/data to roll back the informational catalog.

### Market provider operations

Existing limits persist: at least 1.1 seconds after the previous provider response,
24 outbound attempts/rolling 24 hours, 12 asset refreshes/rolling 24 hours and 65-second
cooldown, with advisory locking and durable attempts. Complete cached observations
(including stale ones) are reused until admin/operator refresh; no scheduler exists.
Quotas, failures and valid cache preservation are tested. Confirm provider account
allowance/license and refresh ownership for the deployment; no new key/account,
paid API or provider limit bypass is authorized.

### AWS and custom-domain requirements

AWS account/region/resources, IAM, hosting topology, database, domain ownership,
DNS records and certificates: **UNVERIFIED**. No cloud resource or secret was
created/read/modified. Before AWS deployment, approve and validate:

1. A Node 24-compatible API host and process/startup/artifact configuration; static
   frontend hosting plus correct same-origin API/SPA routing; analytics only if
   that optional foundation is actually included in the chosen topology.
2. PostgreSQL version/region support, private security groups/network access,
   production TLS, secrets delivery and least-privilege IAM/database roles.
3. Migration job/backup/restore strategy, staged QA, health checks, observability,
   instance/connection limits, proxy/rate-limit handling and rollback.
4. Domain/registrar ownership, DNS routing to the selected frontend/API entry,
   validated certificate(s), HTTPS listener/termination and HTTP redirects.
5. Exact production OAuth/callback configuration and end-to-end verification,
   working production recovery delivery and explicit deployment authorization.

An ALB topology needs a server certificate and HTTPS listener; Route53 can route
a domain alias to the load balancer. These are requirements/options, not a claim
that such resources exist. Sources: [AWS HTTPS listener](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html),
[Route53 alias](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-elb-load-balancer.html),
[RDS backup/restore](https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/managing-backup-restore.html).

## 9. Outstanding issues by release context

| Priority | Context | Outstanding item |
|---|---|---|
| P0 | Local demo | None identified. |
| P1 | PR/merge | Owner push hold; unverified Vercel auto-deploy behavior; stale PR head/body; no latest remote CI/reviews returned; current protection/base enforcement not confirmed. |
| P1 | AWS/production | Unverified API/SPA routing/public session404 resolution; production HTTPS/origins/callback/secrets; database/TLS/backups/migration packaging; mail delivery; proxy/rate-limit design; staging/monitoring/rollback. |
| P2 | Test reliability | Fresh-test database DROP cleanup exceeded the 10-second timeout once; unchanged full rerun passed. One generated test database remains isolated in the stopped disposable cluster. Investigate Windows resource/contention behavior in a separately authorized fix. |
| P2 | Local/hosting UX | Throttled session checks can show retry errors instead of login redirects; complete cached data needs explicit refresh; open portfolio needs reload for later price changes. |
| P2 | Deployment assurance | Readiness checks 001 only; frontend main bundle advisory; persist stronger after-relogin/refresh transition regressions from prior audit probes. |
| Accepted local limitation | P1 prototype | EOD, 100 compact unadjusted bars, finite quotas, private reset outbox, event-driven snapshots, USD and separate cash. Production mail, daily reconstruction and live economics are deferred locally. |

No supported local P1 feature is missing because of the accepted limitations.
Production requirements above are not retroactively declared missing local features.

## 10. Working-tree and authorization record

- Exact branch/commit are at the top of this report; upstream is
  `origin/feature/p1-auth-portfolio-market`.
- At start: only untracked `Proposal.pdf`; no staged or tracked modifications.
- At finish: this requested report and `Proposal.pdf` remain untracked; no source,
  index or existing-document changes are intended. Final status is verified after writing.
- No commit, push, merge, PR update, workflow dispatch/rerun, deployment, secret
  modification, Vercel setting change or AWS configuration change was performed.
- Disposable test resources and ignored build/browser evidence are audit artifacts.
  Owner development data was inspected read-only; no development migration/seed ran.
