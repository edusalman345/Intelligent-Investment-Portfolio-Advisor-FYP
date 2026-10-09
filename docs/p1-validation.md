# P1 validation and release checkpoint

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
Live explicit password-account linking remains **ACTION_REQUIRED**; its local
integration tests pass. The owner has saved a replacement development secret;
verification after that replacement remains **ACTION_REQUIRED**. This is not a
production or staging approval.

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
restarted again; its replacement-secret browser verification is pending.

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
Linking, replay, expiry and revoked
linking-session rejection remain covered by injected-provider integration tests,
not claimed as newly completed live Google scenarios.

## Latest local checks

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
| Live explicit password-account linking / replacement-secret verification | ACTION_REQUIRED | Linking has integration coverage; replacement secret saved, repeat real flow pending |
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
login flow described above. It does not verify live explicit account linking,
live financial data, production database-role permissions, mail delivery,
hosting, backups or deployment. The test cluster's
loopback trust configuration is disposable and must not become a production
database configuration. Production work needs its own preflight and approval.

## Owner actions and Git handling

1. The owner has rotated and privately replaced `GOOGLE_CLIENT_SECRET` and the
   normal API was restarted. Repeat login/logout to verify the replacement. The
   client/callback worked in the initial real sign-in/creation/logout run.
   Live repeat login and explicit linking should still be exercised separately.
   Follow [google-oauth-setup.md](google-oauth-setup.md).
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
while replacement-secret verification, live explicit linking and human approval remain
outstanding.

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
