# Local deployment preparation validation — 28 October 2026

Base: `feature/p1-auth-portfolio-market`,
`b2eb1f4da851233160d719d1296642699ebca2f1`, plus uncommitted local deployment fixes.
No commit, push, merge, AWS connection, deployment or production secret change.
The original P1 audit, approved 15-feature results and branding remain preserved.

## Current results

| Command/check | Result |
|---|---|
| Node 24.22.1/npm 11.19.1, `npm.cmd ci --no-audit --no-fund` | PASS; 439 locked packages; ignored local npm cache; lock unchanged |
| `npm.cmd run lint` | PASS on latest source |
| `npm.cmd run typecheck` | PASS web/API/contracts |
| `npm.cmd test` | PASS: frontend 35/35, API unit 29/29 |
| `npm.cmd run build` | PASS React production output and compiled API |
| `npm.cmd audit --audit-level=moderate` | PASS; zero vulnerabilities |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/ec2/test-pg16.ps1` | PASS on actual isolated PostgreSQL 16.15 |
| Fresh migration and unchanged replay | PASS; 001/002 ledger, 23 total tables, correct two plan records |
| Public snapshot import and repeat | PASS; 505 new observations then zero; 5 assets/5 quotes/500 bars/0 users; original quote/bar timestamps retained |
| Serial `npm.cmd run test:db` against isolated PG16 | PASS 56/56, including auth/OAuth, ownership, discovery, market, portfolio, health/readiness and subscription |
| Disposable PostgreSQL stop/environment restoration | PASS; no installed service/owner database changed |
| `python -m unittest discover -s deploy/ec2/tests -v` | PASS 13/13 archive and environment regressions |
| `node --test deploy/ec2/tests/smoke.test.mjs` | PASS 2/2; read-only mock-server journey and safe API/SPA-routing failure |
| `bash -n deploy/ec2/bootstrap.sh`, `bash -n deploy/ec2/rollback.sh` | PASS using Git Bash |
| `node --check` export/import/smoke helpers | PASS |
| PowerShell parser: package/test-pg16 helpers | PASS |
| `python scripts/check_secret_files.py` | PASS for Git-index filename/template policy |
| `python -m unittest discover -s scripts -p test_secret_files.py` | PASS 2/2 |
| Clean package with snapshot; manifest/SHA-256 verification and extraction | PASS |
| Repeated actual package builds | PASS; byte-identical for unchanged inputs |
| `git diff --check` | PASS |

Portable PostgreSQL source: publisher EDB
`https://get.enterprisedb.com/postgresql/postgresql-16.15-5-windows-x64-binaries.zip`,
verified against its `.sha256` before extraction under ignored `.tmp`.
No system-wide PostgreSQL or Node installation was performed.

Some initial sandbox-restricted attempts failed with process/user-info restrictions;
unchanged tests passed with approved local execution. The new smoke regression
initially found a lint-only missing explicit URL import; fixed, tests/lint rerun.
No failed test or security check was suppressed.

## Review

Independent deployment code/security review round 1 required strict existing-env
ownership/modes and crash-safe temporary symlink names. Both findings were fixed.
Round 2 returned PASS. Final review round 3 found that the runbook must execute
the smoke helper as `iipa` to respect restricted release-directory permissions;
the command was corrected without relaxing those permissions. No unresolved
HIGH/CRITICAL/MEDIUM finding remains after targeted verification. Packaging received a
separate review of allowlists, known-private-value suppression, duplicate/traversal/
link rejection, manifest completeness and bounded decompression/extraction.

The source checklist retains Secure/HttpOnly/Lax cookies, strict Origin/CORS/CSRF,
loopback-only proxy opt-in and overwritten X-Forwarded-For, state/nonce/PKCE,
Google-library ID-token validation, explicit linking and database ownership.
The `/ready` regression proves missing 002 produces 503 despite 001 existing.

Archive security checks are defense in depth, not a guarantee about unknown secret
formats or all historical Git objects. Secrets are excluded by path/allowlist,
names-only examples, private-key/provider patterns and private local-value checks.
The release contains no Git database or real private environment file.

## Readiness boundary

**Local preparation: PASS / waiting for owner deployment approval.**
The PostgreSQL16 SQL/API compatibility result applies to real PostgreSQL16 on
Windows. Actual Ubuntu peer sockets, permissions, systemd, Nginx, restart/rollback,
TLS certificate issuance/renewal and public routing have NOT been executed here.
Shell syntax and static review do not establish their operational success.

AWS instance state/IP, Name.com DNS, security-group rules and billing/credits remain
unverified. The single-instance architecture has a maintenance window and is not
high availability. Retained release/DB/config backups need private off-instance
storage, retention scheduling and a separately approved restore drill.

Google public HTTPS OAuth is ACTION_REQUIRED until owner-approved deployment,
production Web-client callback/origin configuration and real browser acceptance.
Production reset email delivery remains unavailable (503) without an adapter;
local-outbox acceptance cannot be presented as production mail readiness.
Fresh provider ingestion requires the privately configured Alpha Vantage key and
quota. The included recorded five-stock data is actual historical EOD data,
explicitly NOT a fresh provider fetch or real-time quote feed.

See [runbook](README.md) for exact local/remote commands. Stop here; remote execution
is a separate owner-authorized task.

## Bootstrap PATH correction follow-up

Confirmed defect: the Node-selection PATH reset discarded administrative command
directories after prerequisite checks, so later `runuser` lookup failed. Bootstrap
now retains `/usr/local/sbin`, `/usr/sbin` and `/sbin` alongside the Node directory
and standard binary paths. Standalone rollback sets the complete standard PATH
as well, so it does not depend on the caller supplying administrative directories.

The executable regression uses harmless temporary command fixtures and the real
PATH assignments. It proves the original reset loses an already-discovered
`runuser`, the fixed reset retains all three administrative directories, and
rollback works from a minimal caller PATH. No deployment commands are executed.

Follow-up validation: deployment Python tests 16/16 PASS, smoke regressions 2/2
PASS, bootstrap/rollback shell syntax PASS. The release archive and SHA-256 sidecar
are regenerated and verified after these changes. Application build outputs,
PostgreSQL configuration, credentials and historical test evidence are unchanged.
No AWS access, commit, push, merge or deployment occurred.
