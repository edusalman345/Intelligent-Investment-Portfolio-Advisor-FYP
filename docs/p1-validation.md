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
Real Google end-to-end verification: **ACTION_REQUIRED**. This is not a production
or staging deployment approval.

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
ignored backup, removed from the template, and never committed or used for
authentication. Candidate source was checked for the original values without
printing them. **Owner must rotate that client secret before real OAuth use.**

## Latest local checks

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
| Real Google sign-in/linking against Cloud Console | ACTION_REQUIRED | Rotate exposed secret, privately configure client and exact callback, then verify |
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

This verifies source and local mocked/integration behavior. It does not verify
real Google console settings, live financial data, production database-role
permissions, mail delivery, hosting, backups or deployment. The test cluster's
loopback trust configuration is disposable and must not become a production
database configuration. Production work needs its own preflight and approval.

## Owner actions and Git handling

1. Rotate the exposed Google client secret. Configure the development Web OAuth
   client, identity scopes/test audience and exact callback
   `http://localhost:3001/api/v1/auth/google/callback`. Privately set
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_CALLBACK_URL`; perform
   real sign-in, creation, repeat login, linking and cancellation/replay checks.
   Follow [google-oauth-setup.md](google-oauth-setup.md).
2. For normal development outside the disposable tests, set a dedicated local
   PostgreSQL role/database in ignored `DATABASE_URL`, then migrate/seed/start
   using the [README](../README.md). No paid provider, OpenAI, AWS or Docker setup
   is needed for the current demo.
3. Human PR review/merge authorization remains outstanding. Agents have not
   self-approved a GitHub review or merged any PR.

P1 is stacked on `chore/ai-orchestration`, whose existing PR targets
`chore/repository-management`; that branch's existing PR targets `main`. Prepare
the P1 PR into **`chore/ai-orchestration`**, preserving that stack. Push only
`feature/p1-auth-portfolio-market` with its own upstream. Use a HIGH RISK draft PR
while real Google verification and human approval remain outstanding.

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
