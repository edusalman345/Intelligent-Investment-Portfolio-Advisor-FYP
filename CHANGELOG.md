# Project changelog

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
