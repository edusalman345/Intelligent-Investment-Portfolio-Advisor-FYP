# P1 validation and release checkpoint

## Subscription Plans enhancement - 27 October 2026

This is an additional informational prototype feature on top of the completed
P1 Mid baseline at `5eb83b6`. The original 15 approved M1 to M3 features and their
PASS evidence below remain unchanged. No new approved module is introduced.

- Authenticated `/subscription` route and workspace navigation use existing UI
  and session protection. Free is Current Plan at USD 0/month for every user.
- Pro is Coming Soon with no published price, purchase control or available Pro
  functionality. Its AI insights, risk, forecasting and alerts are planned only.
- `GET /api/v1/subscription-plans` is an authenticated read-only catalog.
- Additive `002_subscription_plans.sql` creates and seeds `subscription_plans`.
  The normal migration ledger handles repeat runs; seeds use `ON CONFLICT`.
  `001_p1_foundation.sql` is unchanged. Schema: 22 domain tables, 23 including
  `schema_migrations`; the catalog has primary-key and unique-code indexes.
- No user subscriptions, billing, checkout, payments or entitlement checks.
  Existing users require no new record and retain all previous functionality.

| Acceptance/check | Result and evidence |
|---|---|
| Protected page and navigation | PASS - frontend tests and `tests/e2e/subscription.spec.ts` |
| Free price/current plan/features | PASS - USD 0.00 catalog; UI $0/month and Current Plan |
| Pro availability | PASS - NULL price, Coming Soon, no purchase link/button |
| Existing access retained | PASS - catalog user can access portfolios/assets/watchlists; full previous integration suite passes |
| Database values and constraints | PASS - three new catalog integrations; correct two plans, invalid prices/status/currency rejected |
| Fresh and repeated migration | PASS - generated disposable database, normal migrate twice, stable IDs/two plans/22 domain tables |
| Whole-repository lint / TypeScript | PASS |
| Frontend / backend unit tests | PASS - 33 frontend, 27 API unit tests |
| Complete serial PostgreSQL suite | PASS - 56 tests, including all 53 previous integrations |
| Frontend/API production builds | PASS - existing bundle-size advisory remains nonblocking |
| Browser fixture regression + subscription | PASS - two workflows; real-only test intentionally skipped in fixture mode |
| Existing five-stock real-data browser regression | PASS - recorded actual provider data, no external requests |
| Desktop/mobile | PASS - 1280x720 and 390x844, no page overflow; settled screenshots inspected |
| Independent review | PASS - code/security round 1 and final documentation round 2; no unresolved findings |
| Native local development migration | PASS - normal workflow on approved loopback DB; both plan values verified and user count unchanged |
| Secret policy and dependency audit | PASS - policy plus two regressions; zero private-value matches including decompressed DOCX XML; npm audit zero vulnerabilities |
| DOCX structure and preserved baseline | PASS - original content/ZIP parts preserved, additive appendices only |
| DOCX rendered layout | PASS - PRD 31 pages, TRD 14, schema 29; authored appendices inspected, baseline XML/parts preserved |

Screenshots are stored under `docs/ui-evidence/subscription-2026-10-27/`.
The PRD, TRD and schema document appendices record this enhancement separately;
`CHANGELOG.md` records its objective, changed areas and deferred functionality.
No application credentials or paid services were added. No push, merge,
deployment or Vercel setting change is authorized by this enhancement.

## Current increment — 27 October 2026

The original checkpoint below is retained as dated evidence. The current
feature-by-feature matrix, actual Alpha Vantage access/persistence timestamps,
Node 24 checks, security patches, accepted snapshot-history limitation and
deployment investigation are in [p1-real-world-acceptance.md](p1-real-world-acceptance.md).
Real AAPL/MSFT/NVDA/TSLA/AVGO quotes and 100 daily OHLCV bars each have been
verified in local PostgreSQL. Dynamic provider discovery is implemented in this
same working tree. The five-stock real-data browser journey, 53 serial database
integrations, 28 frontend tests, 27 API unit tests and focused independent review
pass. Real mode excludes synthetic prices. The owner confirmed TSLA/AVGO search and selection work on 27 October, closing
the remaining market-search UAT item. P1 Mid is ready for the local demo under
the explicitly accepted prototype limitations.
The owner has instructed **no pushes or deployments** pending Vercel settings
verification. No claim of current remote CI or deployment readiness is made.

## Original 8–9 October checkpoint

Validated on 2026-10-08 on `feature/p1-auth-portfolio-market`, continuing the
saved implementation rather than recreating it. The approved modules are User
Authentication, Portfolio Management and Market Data Management. The source
selection, acceptance criteria, tables and API inventory are in
[p1-implementation-plan.md](p1-implementation-plan.md).

## Orchestration decision

Focused preflight: **READY** for native local P1 development and isolated tests.
Owner configuration is not a blocker to the credential-free implementation.
Plan and implementation: complete for the approved three modules. Independent
code review: **PASS**. Security review: **PASS** for the implemented local scope.
Release-readiness: **READY_FOR_PR**; the staged secret-file policy passed.
Real Google login, account creation, protected-page access and logout:
**PASS on 2026-10-09**, with owner browser interaction and backend corroboration.
Replacement-secret login, existing-identity account reuse, live explicit
password-account linking and same-email takeover prevention: **PASS on
2026-10-09**. Owner browser confirmations are corroborated by non-secret database
relationships and sanitized real-provider observations. This is not a production
or staging approval; full P1 UAT has not started.

Three total review/fix rounds were used. Round 1 corrected session-preserving
`REAUTH_REQUIRED`, names-only environment policy, disposable database guards,
decimal validation and OAuth linking/session revocation races. Round 2 found
four MEDIUM issues: stale selected market details after refresh, rounded chart
money labels/tooltips, missing provider symbol validation and reset-token expiry
while awaiting a user lock. All four have fixes and regressions. Round 3 verified
them independently. Browser verification then supplied two focused responsive
corrections, verified within the final round: contain an absolutely positioned
screen-reader table header inside its scroller, and allow the market chart grid
to shrink. No unresolved CRITICAL/HIGH findings remain in committed source.

During final review, populated Google assignments were found in the local
`.env.example` and exposed by a tool read. They were preserved privately in an
ignored backup, removed from the template, and never committed. They were not
used during the initial mocked validation. Candidate source was checked for the
original values without printing them. The later real verification and secret
rotation are recorded below.

## Real Google callback verification, 2026-10-09

The owner corrected the exact authorized redirect URI to
`http://localhost:3001/api/v1/auth/google/callback`. The API was restarted with
the private development configuration. Equality/presence checks confirmed the
configured callback and authorization request without displaying values. A
successful Google code exchange confirms that the running client ID and secret
authenticate together. The first real run used the previously exposed secret.
The owner subsequently reported rotation and privately saved a replacement;
comparison confirms that it differs from the exposed value. The normal API was
restarted again; replacement-secret browser verification subsequently passed,
including protected-page access and application logout.

A fresh owner browser login from `http://localhost:5173/login` completed Google
sign-in, returned to the app, opened a protected page and logged out. Fixed-label
development observations corroborated matching state/browser binding, an
unexpired transaction consumed once, a PKCE verifier, code exchange, Google
ID-token validation, matching nonce, verified email, account/preferences/identity
creation, session creation and transaction commit. Database evidence was one
Google identity, `GOOGLE_REGISTER` and `GOOGLE_LOGIN` audit records, one revoked
session and no active sessions after logout. No account identifiers are recorded.

The earlier generic callback failure did not recur after restart and consistent
`localhost` use; its exact historical cause is unconfirmed. A cookie created for
`127.0.0.1` cannot bind a callback at `localhost`, so use the documented hostname
consistently. No application defect or weakening of validation was required.
The temporary observer was removed and the normal API restarted. Its two review
findings concerned observer overload/startup handling; removal resolves them
without retaining diagnostic code. During this diagnostic flow, no raw
exceptions, credentials, codes, cookies or tokens were emitted or committed.
Replay, expiry and revoked linking-session rejection retain injected-provider
integration coverage; those negative protocol cases are not claimed as newly
completed live Google scenarios.

### Completed owner-interactive acceptance

The replacement credentials authenticated real Google identities successfully.
Repeat logins reused existing identity associations. For the explicit-linking
scenario, a password account was created first using the exact email of a Google
identity not yet used in the app, then signed in normally. A Google login attempt
while signed out verified the real identity but was rejected: the password
account stayed unlinked, no session was created, and user/identity/Google-audit
counts stayed unchanged. This exercises the explicit-link requirement rather
than merely observing an unrelated provider failure.

The owner then signed in with the password, initiated Link Google from Account &
security, confirmed the current password and completed real Google OAuth. The
callback retained the initiating authenticated user; the identity and
`GOOGLE_LINK` audit belong to that same password account. Logout followed by
Google login returned to that account, opened a protected page and logged out.
The owner additionally confirmed that `/portfolios` redirected to login after
application sign-out. Database correlation confirms that the latest Google
session is revoked; all development sessions are inactive at this checkpoint.

| Non-secret evidence | Users | Google identities | Google registrations | Google logins | Google links |
|---|---:|---:|---:|---:|---:|
| Password account prepared before collision check | 4 | 2 | 2 | 4 | 0 |
| Rejected same-email Google login | 4 | 2 | 2 | 4 | 0 |
| Explicit linking completed | 4 | 3 | 2 | 4 | 1 |
| Subsequent Google login and logout | 4 | 3 | 2 | 5 | 1 |

The user count did not change during rejection, linking or subsequent Google
login. The new identity belongs to the original password user; no duplicate user
was created and no implicit email-only takeover occurred. Expected audit types
include `AUTH_REGISTER`, `AUTH_LOGIN`, `GOOGLE_REGISTER`, `GOOGLE_LOGIN` and
`GOOGLE_LINK`; logout is corroborated by session revocation, not an invented
logout audit event. An earlier Google-first signup followed by password setup
also worked, but did not qualify as the explicit-linking scenario.

The local acceptance observer emitted only fixed categories and relationship
booleans, delegated the unchanged real Google provider and application, and was
removed after verification. The normal API was restored. No application code,
migration or security control changed. Temporary observations and private
correlation data remain ignored; no emails, subjects, account identifiers, codes,
cookies, tokens or credential values are included in this evidence.

## Local checks at the 8–9 October checkpoint

On 2026-10-09, the OAuth investigation reran `npm run lint`,
`npm run typecheck`, `npm test` (22 frontend and 15 API unit tests), and
`npm run test:db` (39 serial integration tests) successfully. Secret-policy tests
and source checks passed; normal API `/health` and `/ready` returned HTTP 200
after removing the observer. No application source changed. Builds, analytics
and the synthetic Playwright workflow below are the earlier 2026-10-08 results;
they were not rerun locally for this documentation-only update.

Commands ran from the repository root unless a working directory is stated.
These are fresh results after the saved corrections, not inherited old results.
The final responsive changes were followed by another whole-repository lint,
frontend TypeScript/build and the complete browser workflow. They do not change
backend/Python behavior. Full command output remains in the task transcript;
latest commit IDs and remote GitHub checks are recorded in the PR.

| Exact command/check | Result | Evidence |
|---|---|---|
| `npm run lint` | PASS | Entire repository; zero warnings |
| `npm run typecheck` | PASS | Web, API and shared contracts |
| `npm test` | PASS | 22 frontend tests and 15 API unit tests |
| API unit subcommand: `tsx --test test/*.test.ts` in `services/api` | PASS | 3 Google adapter, 3 auth, 3 ledger, 3 provider and 3 database-safety tests |
| Frontend subcommand: `vitest run` in `apps/web` | PASS | 22 tests across 5 files; session preservation, reset, market refresh and exact financial labels |
| `npm run test:db` | PASS | All 39 real PostgreSQL integration tests, serial |
| Integration subcommand: `tsx --test --test-concurrency=1 test/integration/*.test.ts` in `services/api` | PASS | Auth 10; OAuth link race 1; reset-expiry lock race 1; health/readiness 5; market 10; portfolio/watchlists 12 |
| `npm run build` | PASS | Frontend production build and API TypeScript output |
| `npm run build -w @ifms/web` | PASS | Rebuilt after final responsive corrections; includes `tsc --noEmit` |
| `npm audit --audit-level=moderate` | PASS | Zero reported vulnerabilities |
| `npm run test:e2e` | PASS | One complete multi-screen Chromium workflow; no page errors |
| `npm run db:migrate` (twice) | PASS | Applied schema remains unchanged; replay is accepted |
| `npm run db:seed` (twice) | PASS | Repeatable synthetic seed; no account/password created |
| `npm run start -w @ifms/api` | PASS | Built API on loopback port 3002; `/health` and `/ready` HTTP 200; owned process stopped |
| `services/analytics/.venv/Scripts/python.exe -m pytest -W error services/analytics/tests` | PASS | 5 tests |
| `services/analytics/.venv/Scripts/python.exe -m ruff check --no-cache services/analytics` | PASS | Analytics lint |
| `services/analytics/.venv/Scripts/python.exe -m ruff format --no-cache --check services/analytics` | PASS | 4 files formatted |
| `services/analytics/.venv/Scripts/python.exe -m pip check` | PASS | No broken requirements |
| `services/analytics/.venv/Scripts/python.exe -m pip_audit --skip-editable --progress-spinner off` | PASS | No known vulnerabilities; unpublished local editable package excluded, installed dependencies audited |
| `.venv/Scripts/python.exe -m pip wheel --no-cache-dir --no-deps --wheel-dir dist .` in `services/analytics` | PASS | Analytics wheel built |
| `.venv/Scripts/python.exe -m uvicorn ifms_analytics.app:app --host 127.0.0.1 --port 8002` in `services/analytics` | PASS | `/health` and `/ready` HTTP 200; owned process stopped |
| `python -m unittest discover -s scripts -p 'test_secret_files.py'` | PASS | 2 tests; real env files rejected, exact names-only template allowed |
| Candidate filename/content scan, original Google-value comparison and package BOM/JSON checks | PASS | No credential values printed; original credentials absent from intended files |
| `git diff --check` | PASS | No whitespace errors |
| `python scripts/check_secret_files.py` against final staged index | PASS | Exact proposed template contains names only; real environment/credential files rejected |
| Real Google login/account creation/protected page/logout | PASS | Owner browser confirmation and sanitized callback/database evidence on 2026-10-09 |
| Replacement-secret login and existing-identity reuse | PASS | Real Google session, protected page, logout and stable account association |
| Live explicit password-account linking | PASS | Password-authenticated initiation, real callback, same user/identity association, subsequent Google login |
| Same-email implicit-link rejection / duplicate prevention | PASS | Verified identity rejected before linking; no new user or session; explicit link adds only the association |
| Live Alpha Vantage / Yahoo / news / OpenAI / datasets / ML | SKIPPED | Owner-deferred; synthetic market workflow and injected provider tests are sufficient for this checkpoint |
| AWS / Docker local setup / staging / production deployment | SKIPPED | Owner-deferred; no deployment performed |

Integration database: disposable loopback PostgreSQL cluster on port 55432,
database `ifms_p1_test`. Browser database: separate `ifms_browser_test` in that
cluster. Neither is the owner's normal development database. Browser command
used process `E2E_BROWSER_CHANNEL=chrome`; CI installs Chromium. Actual connected
database and different-name guards are exercised before destructive test resets.

Earlier browser attempts failed due to stale test Vite listeners, ambiguous
selectors, and the two mobile overflow defects. Those failures were diagnosed
and corrected; the final complete run passed. Screenshots now wait for the
one-second canvas animation and disable CSS animation while capturing evidence.
No failing assertion was removed or suppressed.

## Browser and visual acceptance

Desktop 1280x720 and mobile 390x844: **PASS**. Inspected all thirteen generated
screenshots for layout, readable content, navigation, forms and charts. Tables
scroll within their containers; the page itself has no horizontal overflow.
Long transaction dialogs scroll internally. Evidence uses only synthetic data
and a synthetic test account, with passwords masked. No tokens, credential
values, real account data or browser traces are included in source control.

The workflow exercises protected-route redirects, short-password validation,
registration, disabled/unconfigured Google login, portfolio create/edit,
invalid negative quantities, fractional buy, oversell rejection, explicit cash
deposit, immutable reversal, market search/history/provenance, mobile navigation,
watchlist create/add/rename/remove, rejected password reauthentication followed
by a successful profile mutation, logout, incorrect login, correct login and
current-session revocation followed by another protected-route redirect.

Representative reviewed screenshots:

- [Portfolio desktop](ui-evidence/portfolio-desktop.png) and [mobile](ui-evidence/portfolio-mobile.png)
- [Market desktop](ui-evidence/market-desktop.png) and [mobile](ui-evidence/market-mobile.png)
- [Settings mobile](ui-evidence/settings-mobile.png)
- [Watchlist desktop](ui-evidence/watchlist-desktop.png)
- [Registration mobile](ui-evidence/registration-mobile.png)
- [Overview mobile](ui-evidence/overview-mobile.png)

## Security decision and limits

Independent backend and frontend/market/CI reviewers returned **PASS**. Inspected
controls include scrypt password hashing; hashed opaque server sessions and reset
tokens; revocation and lock races; Google state/nonce/PKCE; Google-library ID-token
verification plus explicit nonce and verified-email checks; stable subject
identities; explicit, authenticated account linking; server-side roles and
object ownership; parameterized SQL; React output encoding; CSRF tokens and exact
Origin checks; restricted credentialed CORS; rate limits; fixed-host bounded
provider requests; sanitized errors/logs; dependency audits; and names-only
environment templates. No implicit email-only Google linking is allowed.

This verifies source, local mocked/integration behavior and the real Google
login and explicit-linking flows described above. It does not verify
live financial data, production database-role permissions, mail delivery,
hosting, backups or deployment. The test cluster's
loopback trust configuration is disposable and must not become a production
database configuration. Production work needs its own preflight and approval.

## Owner actions and Git handling

1. Google owner setup and the requested real acceptance checks are complete.
   The replacement secret, repeat login, explicit linking, same-email rejection,
   protected-page access and logout passed. Keep configuration private; see
   [google-oauth-setup.md](google-oauth-setup.md).
2. Local `fyp_portfolio_dev` now connects and has the existing foundation
   migration and synthetic seed. Its 22 tables, 51 indexes and 229 constraints
   match the validated migration schema. Keep `DATABASE_URL` private; no paid
   provider, OpenAI, AWS or Docker setup is needed for this demo.
3. Human PR review/merge authorization remains outstanding. Agents have not
   self-approved a GitHub review or merged any PR.

P1 is stacked on `chore/ai-orchestration`, whose existing PR targets
`chore/repository-management`; that branch's existing PR targets `main`. Prepare
the P1 PR into **`chore/ai-orchestration`**, preserving that stack. Push only
`feature/p1-auth-portfolio-market` with its own upstream. Use a HIGH RISK draft PR
while human approval remains outstanding. Google acceptance does not replace
full P1 UAT or authorize merge/deployment.

Commit scope: `apps/web`, `services/api`, `services/analytics`, shared contracts,
database migration, scripts/tests, root package/lock/TypeScript/lint/Playwright
configuration, `.env.example`, `.gitignore`, the two CI workflows, README and P1
documentation/UI evidence. `.gitattributes` preserves LF migration checksums on Windows/Linux.
The supplied Proposal and three DOCX files remain
unchanged and untracked. Local environment files, database files, virtualenvs,
build outputs, logs, traces and the private OAuth backup are excluded.

Rollback/migration recovery is documented in the README: stop the app and revert
code while preserving data; migration checksums forbid editing applied SQL.
Use a reviewed forward migration or restore a verified backup when appropriate.
No destructive down migration, merge, staging deployment or production
deployment is performed by this task.
