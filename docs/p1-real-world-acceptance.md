# P1 Mid real-world functional acceptance — 27 October 2026

This increment continues `feature/p1-auth-portfolio-market` from `39db23f`.
The original Proposal (module table, page 5; feature list, page 11), PRD
sections 6.1–6.3/10, TRD and database document remain the requirements baseline.
No Modules 4–12, production deployment or replacement architecture are included.

## Acceptance matrix

PASS identifies exercised behavior, not merely an existing screen or endpoint.
Google's real owner-interactive acceptance was completed on 9 October; the
27 October owner UAT confirmed the real market screen and post-logout
`/dashboard` -> `/login` redirect. Database tests use a
disposable `_test` database, never the owner's development account data.

| ID | Approved feature | Implementation and acceptance evidence | Result |
|---|---|---|---|
| AUTH-01 | Registration and login | Browser registration/login and invalid credentials; API validation, disabled accounts; real Google login and explicit linking accepted previously | PASS |
| AUTH-02 | Password management | Scrypt; browser password change, actual private-outbox recovery UI, single-use rejection and subsequent login; integration expiry/session invalidation/lock-expiry regression | PASS |
| AUTH-03 | Role-based access | Investor/admin checks, CSRF/Origin/CORS, nested portfolio/watchlist cross-user isolation and protected browser routes | PASS |
| AUTH-04 | Profile management | Browser profile update after failed password reauthentication; validated timezone/base currency; current-user API | PASS |
| AUTH-05 | Session management | Browser logout, revocation and protected redirects; integration expiry, disablement, password reset/change and linking revocation races | PASS |
| PORT-01 | Portfolio creation | Browser create/edit; integration owner isolation, unique active names, archive/status validation | PASS |
| PORT-02 | Holdings management | Real-data browser buy 2/sell 0.5 -> 1.5 shares; exact decimal cost/holdings; atomic oversell rejection and concurrent sales | PASS |
| PORT-03 | Transaction management | Validated fractional buy/sell and explicit cash records; immutable reversals, idempotency, invalid backdating and rollback coverage | PASS |
| PORT-04 | Portfolio valuation | Real provider quote powers exact current valuation and event-driven snapshots; source-mode isolation including legacy history; owner accepts snapshot-only history | PASS |
| PORT-05 | Watchlist management | Browser create/add/rename/remove and real-source asset navigation; integration owner isolation, duplicates and invalid assets | PASS |
| MDAT-01 | Market data collection | Authorized SYMBOL_SEARCH dynamically discovers US/USD equities; actual AAPL/MSFT/NVDA/TSLA/AVGO ingestion and persistent registration pass; concurrency/cache/quota coverage | PASS |
| MDAT-02 | Current price updates | Actual latest available daily quotes, timestamps and source/freshness; no real-time promise; provider-mode isolation and cache-preservation tests | PASS |
| MDAT-03 | Historical market data | 100 actual compact daily OHLCV bars per symbol; bounded date-range API and browser charts; chronological normalization and unique records | PASS |
| MDAT-04 | Trading volume | Actual quote/bar volumes persisted; UI latest volume; null-versus-zero validation and exact numeric storage | PASS |
| MDAT-05 | Data validation | Invalid/duplicate/stale/future/order/identity cases; failure preserves good cache; quotas, frequency, outages and bounded retries covered | PASS |

### Dynamic stock discovery correction

The owner's three-stock-only search finding was reproduced and fixed in this
same working tree. It was not assigned to another branch or left to another task.
The frontend first searches the catalog, then uses authenticated/CSRF-protected
`POST /assets/discover` for missing real-mode matches. Alpha Vantage
`SYMBOL_SEARCH` validates US/USD Equity metadata before registration. Discovery
stores region `US` as the exchange marker with `exchangeUnknown: true`; it does
not invent an exchange venue. Existing mapped listings retain their identities.

Selecting a result calls `POST /assets/:id/market-data`: complete real caches
are reused, otherwise existing validated ingestion loads quote and compact daily
history. Direct routes offer an explicit load control. Safe quota/outage/quality
errors retain cached observations and offer retry, without synthetic substitution.
Provider search and ingestion share durable request budgets, advisory locking and
pacing. Bounded positive/negative search caches and concurrent request coalescing
avoid duplicate requests; provider failures are not negative-cached.

TSLA and AVGO were discovered through the actual authorized provider and each
persisted one real quote plus 100 daily bars, with zero quality findings. The
five-stock browser workflow passed search/selection, charts, real prices,
buy/sell transactions, valuation and watchlist membership. Unit/integration
coverage exercises previously unknown discovery, duplicates, foreign/non-equity
filtering, strict input, CSRF/origin/auth, cache reuse and shared quotas.
The browser uses recorded actual observations without provider egress; it is
separate from the live provider verification. The owner confirmed on 27 October that TSLA/AVGO search and selection work.
This closes the reported market-search UAT failure. Automated acceptance and
the remaining owner search retest are PASS.

Owner-confirmed protected-route logout acceptance is **PASS**: `/dashboard`
redirects to `/login` after sign-out. The route currently reaches the protected
overview through the catch-all redirect; it does not display a blank page or a
404. The fresh Google login was independently corroborated by an increased
`GOOGLE_LOGIN` count with unchanged user count. Do not require all sessions to be
globally inactive if the owner signs in again during ongoing UAT.

## Real provider access and evidence

The private `ALPHA_VANTAGE_API_KEY` was present, matched the ignored local file,
was not `demo`, had no inherited override and had no surrounding whitespace.
No value or fingerprint is included. All three authorized endpoints were exercised:
`SYMBOL_SEARCH`, `GLOBAL_QUOTE` and `TIME_SERIES_DAILY` with `outputsize=compact`.

The actual rejection was a **per-second burst restriction**, not proof of daily
quota exhaustion or a missing subscription. The provider's information response
asked for one request per second and also mentioned its daily free allowance and
premium plans. Earlier classification that treated this as daily exhaustion or
an entitlement failure was insufficiently specific. Single-endpoint requests
succeeded. The two-request sequence needed pacing after complete responses.

The adapter now serializes requests and waits at least 1,100 ms after each prior
response/body/request-reservation finalization. Frequency, daily quota,
credentials, reported entitlement, malformed data and outages have separate safe
categories. Frequency/quota/entitlement/credentials/malformed data are not
automatically retried. Network/5xx failures retry at most once, using the same
pacing and durable request budget. Existing 65-second refresh cooldown and
12-refresh/24-hour cap remain; actual attempts additionally have a 24/24-hour
local cap. Other consumers/probes can consume the provider account's allowance.

| Symbol | Actual ingestion start (UTC) | Quote observation date | Stored real quotes | Stored real daily bars |
|---|---|---|---:|---:|
| AAPL | 2026-10-27 20:18:05.901Z | 2026-10-27 | 1 | 100 |
| MSFT | 2026-10-27 20:19:13.858Z | 2026-10-27 | 1 | 100 |
| NVDA | 2026-10-27 20:20:35.982Z | 2026-10-27 | 1 | 100 |
| TSLA | 2026-10-28 01:05:01.966Z | 2026-10-27 | 1 | 100 |
| AVGO | 2026-10-28 01:06:44.201Z | 2026-10-27 | 1 | 100 |

All five imports completed and included volume. Independent SQL queries
confirmed the stored counts in local `fyp_portfolio_dev`. Source configuration
records real, end-of-day, unadjusted data. Observation dates represent provider
trading dates; ingestion timestamps remain separate. UTC date formatting avoids
shifting daily bars to the preceding local calendar day.

The first AAPL import recorded 99 ordering warnings because the provider returns
newest-first bars. All values passed validation and were stored correctly. The
adapter now normalizes chronological order; regression coverage confirms that
malformed fields are still rejected. Subsequent MSFT, NVDA, TSLA and AVGO imports had zero
quality issues. Historical warning records are preserved, not erased.

Machine-readable, credential-free evidence: [p1-real-provider.json](evidence/p1-real-provider.json).
Full normalized observations remain ignored under `.tmp/real-market/`.

Official references: [Alpha Vantage endpoint documentation](https://www.alphavantage.co/documentation/)
and [provider allowance/support](https://www.alphavantage.co/support/).
Compact daily history is supported for free/premium keys; full history and
real-time/delayed US quote entitlements are distinct. No premium endpoint or
alternative provider was enabled.

## Integrated UI and database validation

The real-data Playwright journey replays the genuinely fetched, schema-validated
observations into a separate disposable browser database. It does not invent
prices, contact providers during UI tests, reuse development users, or provide
real OAuth credentials to automated tests. Synthetic seed observations coexist
to verify that real mode excludes them. Missing real quotes/history remain
unavailable/unpriced; real mode never silently selects fixture data.

The journey exercises registration, all five real asset screens, daily charts,
provider dates, buy/sell, 1.5 AAPL shares plus one TSLA and one AVGO share,
exact real-price valuation, real-mode
snapshots, watchlist membership, password change, repeat login, logout and
protected-route rejection. The synthetic browser journey separately covers
reversal, validation, profile update after `REAUTH_REQUIRED`, watchlist changes
and explicit session revocation. Default local-outbox recovery was also exercised
through the real UI, followed by reset-token replay rejection and login with the
reset password. The private reset URL/token never enters output or screenshots.
Traces are disabled to avoid capturing tokens;
screenshots contain synthetic test identities only.

Desktop 1280x720 and mobile 390x844 were checked for page overflow and inspected.
Wide tables scroll within their containers. Evidence is under
`docs/ui-evidence/p1-real-2026-10-27/` (13 final captured screenshots).

## Environment and checks

Node is aligned to **24.x** in the manifest, lockfile, CI and README; Node types
are 24.x. Validation used a checksum-verified project-local **24.22.1** runtime
and its bundled **npm 11.19.1**; no system software was installed. Standard ESLint
now excludes generated Python caches without disabling any source rule.

Compatible security updates address current Node and Python audit findings:
Zod 4.6.7, body-parser 2.4.0, ip-address 10.7.5, qs 6.17.0, development certifi
2026.10.19 and filelock 4.2.1. FastAPI's minimal runtime scope is unchanged.

| Check | Result |
|---|---|
| Clean Node 24 `npm ci` | PASS |
| Standard `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 28 frontend and 27 API unit tests at this checkpoint |
| Serial `npm run test:db` | PASS — 53 PostgreSQL integration tests |
| `npm run build` | PASS — React and Express TypeScript |
| `npm audit --audit-level=moderate` | PASS — zero vulnerabilities after fixes |
| Synthetic `npm run test:e2e` | PASS — synthetic workflow; real-specific test intentionally skipped |
| `E2E_REAL_MARKET=1 npm run test:e2e` | PASS — real-data workflow; synthetic-specific test intentionally skipped |
| Analytics pytest `-W error` | PASS — 5 tests; writable cache path used |
| Analytics Ruff lint/format and pip consistency | PASS |
| Analytics dependency audit | PASS — zero known vulnerabilities; only unpublished local editable package excluded |
| Analytics wheel build | PASS |
| Secret policy and policy unit tests | PASS — names-only template and 2 regressions |
| Built development API `/health` and `/ready` | PASS — HTTP 200 |
| Normal `npm run db:migrate` on the approved local development DB | PASS — immutable migration replay accepted; no schema changes |

The original pytest invocation hit a local cache ACL error after its assertions;
it was rerun with a writable `.tmp` cache while retaining warnings-as-errors.
No failing assertion or security advisory was suppressed.

## Accepted boundaries and remaining limitations

| Severity | Item | Disposition |
|---|---|---|
| Accepted P1 boundary | Event-driven valuation snapshots, not reconstructed daily performance | Explicit owner acceptance on 27 October; preserve snapshots and consider daily reconstruction later |
| Accepted P1 boundary | USD holdings; trade records and cash movements recorded separately | Explicit owner acceptance on 27 October |
| Documented data boundary | Latest available daily quotes, 100 compact unadjusted bars, finite provider quota | No real-time/adjusted/unlimited claim; source and freshness visible |
| LOW | Initial AAPL reverse-order warnings | Corrected normalization; valid persisted data and historical diagnostics preserved |
| LOW | Main frontend bundle exceeds Vite's advisory 500 kB threshold | Build succeeds; code splitting is a potential later performance improvement |
| Local-demo boundary | Password reset uses private local outbox; no production mail delivery | Existing documented prototype behavior; real reset security exercised by integration tests |
| Deferred, outside first three modules | Live economic-feed expansion, ML/news/OpenAI, AWS/Docker/staging/production | Not silently added; no paid APIs activated |

The owner explicitly accepted end-of-day data, compact unadjusted history,
provider quotas, the local recovery outbox, snapshots, USD-only holdings and
separate cash on 27 October. Production mail, reconstructed daily performance
and expanded live economic feeds may remain future work. Dynamic stock discovery
was expressly **not** an accepted limitation and has now been implemented and
automatically verified, with the owner confirming TSLA/AVGO search and selection
on 27 October. This limitation is resolved.

## Deployment investigation and readiness

Owner instruction: **no push, merge, Preview or Production deployment**. Changes
and any commits remain local. No Vercel settings have been changed.

Confirmed from the repository: no `vercel.json`, no `.vercel/project.json`, no
Vercel commands or deployment hooks in either GitHub workflow, no installed
Vercel CLI/private CLI auth file found in the checked standard locations. Commit
messages about deployment are not evidence of dashboard settings or success.
No custom Git hook path or active pre-push/post-commit/post-checkout/post-merge
hook was found. Dashboard-side hooks remain unverified.

Still unknown: Vercel's configured Production Branch, automatic Production
deployment state, Preview behavior for this feature branch, dashboard deploy
hooks and branch-specific deployment rules. The Vercel integration is available
but not connected; dashboard inspection remains necessary. Do not infer that
pushes are deployment-safe merely because repository workflows have no deploy step.

The initial real-data increment passed independent code/security review after
three bounded rounds.
The final round's LOW display-separator finding was corrected and the affected
lint/build/browser checks passed. The original
P1 implementation's three historical rounds remain recorded separately.

The owner-added dynamic-discovery extension received a focused independent
code/security review. Round 1 found two MEDIUM frontend initialization gaps;
both were fixed with regressions and round 2 returned PASS. A partial catalog
match edge case (F matching Microsoft) was fixed with a regression; final
focused round 3 returned PASS, with no unresolved
CRITICAL/HIGH/MEDIUM findings. Earlier review counts are preserved, not reset.

The expanded browser run initially hit the unchanged 300-request/minute API
limit. The journey now waits for the next window between market exploration and
portfolio operations, and awaits logout completion. The rerun passed. No
application limit was weakened. On resumption, the first serial integration
attempt failed because disposable PostgreSQL was stopped; it was restarted and
all 53 integrations passed. These failures are not hidden or counted as passes.

Recommendation: **READY for the local P1 Mid demo**. The owner confirmed the
corrected TSLA/AVGO search and selection, closing the remaining UAT item. All 15 automated feature checks
pass and the documented prototype limitations have owner acceptance. Release
readiness is **WAITING_FOR_OWNER_APPROVAL** for push/deployment safety: Vercel
settings remain unknown and pushes/deployments are prohibited. Remote CI for
these local changes is unavailable. No new commit has been pushed.


### Current reproducible validation commands

Run with project-local Node 24.22.1/npm 11.19.1 on PATH:

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
- `TEST_DATABASE_URL=<disposable _test URL> npm run test:db` (serial script)
- `npm audit --audit-level=moderate`
- `E2E_REAL_MARKET=1 npx playwright test --config .tmp/playwright-real-isolated.config.ts`
  (owner app remains on 3001/5173; isolated acceptance uses 3002/5174).
  The ignored local config derives from the committed `playwright.config.ts`;
  the standard config can run when owner ports are free. Recordings are ignored.
- Analytics venv: `python -m pytest services/analytics/tests -W error -o cache_dir=.tmp/pytest-p1-real`,
  `python -m ruff check --no-cache services/analytics`,
  `python -m ruff format --no-cache --check services/analytics`,
  `python -m pip check`, `python -m pip_audit --skip-editable --progress-spinner off`.
- `python scripts/check_secret_files.py` and
  `python -m unittest discover -s scripts -p test_secret_files.py`.
- Native development: `npm run db:migrate`; `/health` and `/ready` both HTTP 200.

No schema migration was added by this increment. Existing immutable migration
replay and disposable integration setup passed; no manual alternate schema was
created. Rollback is a local source revert and restart in the desired source
mode; preserve stored provider observations and owner account data.


### Local checkpoint and PR handling

Implementation validation above applies to `0223b67` (with runtime/dependency
changes in `37f2399`). Documentation and screenshots are committed separately.
The four owner-supplied Proposal/requirements originals remain unchanged and
untracked. No ignored environment files or recorded private mail are included.
PR #3 is not updated remotely because the owner prohibits pushing until Vercel
configuration is verified. Existing remote CI does not validate these local commits.

Owner acceptance update (27 October 2026): documentation-only confirmation; no
application code, credentials or deployment settings changed. Prior code checks
remain applicable. Documentation whitespace and staged secret-policy checks passed.
