# Project changelog

## 11 November 2026 localhost demonstration and GitHub backup

Owner confirmed Vercel suspension before pushing. Baseline backup commit
`72289282a40a23b26d355be3cab8ea7ae071f4b5` was pushed and verified on
`demo/localhost-setup` before any localhost code changes. Current PC work was
preserved; main and the original feature branch were not changed.

Added `LOCAL_DEMO_SETUP.md`, guarded local demo commands/configuration and four
regressions. The wrapper accepts only the approved development database on
loopback5432, reuses normal migrations001/002, builds the API and starts compiled
Express plus Vite. Production/remote targets, query overrides and synthetic
fallback are rejected. Existing dev commands, authentication/OAuth, module logic,
AWS deployment files and private environment credentials are preserved.
P1 CI now validates demo/** branches without deployment commands.

Patched the newly reported development-only minimatch advisory
GHSA-g3hv-75wg-m249 through a tested11.0.1 override and minimal lockfile update;
no force downgrade or runtime-module change. Final lint/typecheck, frontend35,
API33, disposablePG16integration56, migration replay, real recorded-data
import/persistence and production builds passed; audit reports0vulnerabilities.
Actual local migrations/23tables/53indexes/247constraints, Free/Pro seeds,
five-stock real cache, APIhealth/readiness and same-origin session proxy verified.
Owner confirmed fresh Google login/protectedpage/logout PASS on localhost.
Ctrl+C stopped both owned listeners and the demo restarted successfully.
The final combined real-data browser run passed3tests with the synthetic-only
fourth intentionally skipped; 21desktop/mobile screenshots remain ignored.
Redundant test-page reloads were replaced with application navigation after the
initial run hit the unchanged authentication limit; all assertions remain intact.

Independent code/security review PASS(round1). Browser and final validation
details are recorded in LOCAL_DEMO_SETUP.md. No AWS connection, deployment,
production restart, main push or merge is part of this task. Personal VS Code
settings, Proposal and ignored local configuration/artifacts remain on the PC.

## 28 October 2026 AWS deployment preparation recovery

Status: LOCAL PREPARATION VALIDATED; deployment awaiting explicit owner approval.
No commit, push, SSH/AWS connection, resource or production-credential change.

Replaced the unfinished PostgreSQL18 installer with reuse of existing Ubuntu
16/main and loopback peer authentication. Added versioned release activation,
private configuration/database backup, explicit existing-DB migration opt-in and
application/configuration rollback; no destructive database restore or down migration.
Added deterministic Windows packaging, per-file manifest/checksum verification,
unsafe/duplicate archive rejection, environment validation and the exact EC2 runbook.
Preserved the public market export/import helpers and original observation times.
Readiness now checks both immutable migrations 001 and 002; regression covers an
interrupted subscription migration. Loopback-only proxy trust remains opt-in.

Files: root README/changelog/.env.example; API app/config and proxy/health tests;
deploy/ec2 bootstrap, rollback, archive/package, PostgreSQL16 validator, private-env
validator, Nginx/systemd/templates, market/smoke helpers, runbook/validation and tests.
Historical audits and the approved 15 features plus separate subscription catalog
remain preserved. No existing migration was changed.

Latest checks: lint/typecheck PASS; frontend35/API29 unit tests PASS; PostgreSQL16
integrations56 PASS; fresh/repeated migrations and five-stock snapshot import/
reimport PASS; production builds PASS; dependency audit0 vulnerabilities; deployment
Python13/smoke2/secret-policy2 regressions PASS; shell/PowerShell syntax PASS;
archive reproducibility/checksum/extraction PASS. Independent review findings were
fixed; final code/security review PASS. See deploy/ec2/validation.md for limitations.

Deferred: live Ubuntu deployment, TLS issuance/renewal, public Google OAuth UAT,
restore/off-instance backup verification and production password-reset delivery.

## 28 October 2026 IIPA branding alignment

Status: COMPLETE; validated locally, with independent review PASS (round 1).

Owner decision: use Intelligent Investment Portfolio Advisor (IIPA) for current
application presentation despite the supplied proposal's earlier IFMS title.
The proposal and historical audit records are preserved. No feature scope or
business logic changes are included.

Changed areas: frontend auth/workspace/subscription copy, browser metadata and
SVG favicon, password-reset subject, API startup label, optional analytics title,
current README/PRD/TRD/database titles and branding/UI documentation. Legacy
package names, routes, database schemas/migrations, cookies and environment
variables remain unchanged. New branding regression assertions and UI evidence
verify desktop/mobile presentation. See docs/branding.md for retained references.

Validation PASS: lint, TypeScript, 35 frontend tests, 27 API unit tests, 56 serial
PostgreSQL integrations, frontend/API builds, five analytics tests and Ruff.
Browser checks: three fixture workflows PASS (branding, existing P1 and
subscriptions); real-only case skipped in fixture mode, then the separate
five-stock real-data/reset-email workflow PASS. DOCX rendering, semantic checks,
independent review and secret scan PASS. New UI evidence is under
`docs/ui-evidence/iipa-branding-2026-10-28/`.
All changes stay local; no push, merge or deployment.

## 27 October 2026 Subscription Plans prototype enhancement

Status: COMPLETE for the separately scoped local prototype enhancement.
Independent code/security review, application validation and authored-document
layout QA PASS. Detailed enhancement acceptance is recorded separately in
[P1 validation](docs/p1-validation.md).

Local checkpoint finalized on 28 October 2026 after recovery confirmed the same
reviewed implementation and staged files. Final whitespace and secret-policy
checks passed; no application code was regenerated and no remote action occurred.

Objective: add an authenticated, responsive informational plan comparison while
preserving the completed P1 Mid baseline at `5eb83b6` and its original 15 features.
Free remains USD 0/month and Current Plan for all users. Pro is Coming Soon with
no published price or purchase action; all listed Pro capabilities are future work.

Changed areas and files:

- `apps/web/src/App.tsx`, `pages/Subscription.tsx`, `pages/Subscription.test.tsx`
  and `styles.css`: protected route, navigation, plan cards and regression tests.
- `services/api/src/subscriptions.ts`, `app.ts` and
  `test/integration/subscriptions.test.ts`: authenticated read-only catalog.
- `packages/contracts/src/index.ts`: typed catalog response.
- `database/migrations/002_subscription_plans.sql`: additive catalog schema and
  Free/Pro reference seeds; prior foundation migration is unchanged.
- `tests/e2e/subscription.spec.ts`: protected routing and responsive browser checks.
- Existing `IFMS_PRD_v1.0.docx`, `IFMS_TRD_v1.0.docx`, and
  `IFMS_Database_Backend_Schema_v1.0.docx`: appended enhancement requirements,
  architecture/API, table constraints/indexes/seeds/counts and isolated relationship.
- `docs/p1-implementation-plan.md`, `docs/p1-validation.md` and this changelog:
  separately scoped enhancement and acceptance tracking.

Validation scope: lint, TypeScript, frontend/backend unit tests, serial PostgreSQL
integrations, new/fresh/repeated migration and seed checks, builds, browser routing
and desktop/mobile inspection, independent code/security review and secret policy.
Latest actual results: lint and TypeScript PASS; 33 frontend tests and 27 API
unit tests PASS; all 56 serial PostgreSQL integrations PASS, including a fresh
disposable database and repeat migration/seed checks; frontend/API builds PASS.
Fixture browser acceptance passed both existing P1 and Subscription Plans tests;
the five-stock real-data browser regression also passed separately. Desktop and
mobile card bounds, page overflow, Current Plan visibility, protected routing and
unavailable Pro purchase were checked. Independent code/security review passed
round 1 with no findings. Normal local development migration 002 applied and the
Free 0.00 active / Pro NULL coming_soon records were verified with unchanged user
count. No previously applied migration was modified.

DOCX QA uses a checksum-verified, project-local LibreOffice extraction and the
packaged document renderer with isolated PDFium rasterization. Original DOCX
parts and original document content are preserved; all documents were rendered
and newly authored appendix pages were visually inspected before handoff.
Original documents remain privately backed up under ignored `.tmp`.
See the validation document for the final acceptance record.

Deferred: payments, invoices, billing, checkout, user subscriptions, entitlement
enforcement, paid services and all Pro features. No deployment or Vercel setting
change is included. All changes remain local; no push, merge or deployment.
The earlier P1 completion audit, accepted limitations and evidence are preserved.
