# IIPA application branding

## Owner decision dated 28 October 2026

The official application brand is **IIPA**, expanded as **Intelligent Investment
Portfolio Advisor**. The owner explicitly authorized this name after inspection
confirmed that Proposal.pdf page 1 uses Intelligent Financial Management System.
The repository name and README already used Intelligent Investment Portfolio
Advisor. This document records the owner decision; it does not claim that the
supplied proposal originally used IIPA.

## Current presentation

Login/registration show the full name on desktop and mobile. The existing chart
mark, green palette, layout, form behavior and functionality remain unchanged.
Workspace sidebar, header/footer, Subscription Plans copy, password-reset email
subject and service presentation titles use IIPA. Browser title, application
metadata and the matching SVG chart favicon use the new name. The optional
analytics service's human-readable OpenAPI title is updated as well.

Current PRD, TRD and database documentation titles/headers use the new name with
a dated owner-decision addendum. Original copies are backed up under ignored
`.tmp/iipa-branding-originals/`. Proposal.pdf is unchanged. Prior audit reports,
validation logs, screenshots and historical changelog entries remain as dated
evidence, including the uncommitted final pre-release audit.

## Compatibility and retained references

This is presentation only. No database schema/migration, API endpoint, cookie,
environment variable, dependency package name, runtime service identifier,
analytics module path, authorization, billing or business logic is renamed.
Retained IFMS references fall into these categories:

- `@ifms/*`, `ifms-p1`, `ifms-analytics`, `ifms_analytics`, `ifms_session`,
  `ifms_*_test` and the existing local database name are internal identifiers.
- `IFMS_PRD_v1.0.docx`, `IFMS_TRD_v1.0.docx` and
  `IFMS_Database_Backend_Schema_v1.0.docx` remain stable filenames.
- Prior audit/validation/progress documents and screenshots preserve their
  original observations. They describe the branding at the time of each audit.
- This decision record and the DOCX addenda explicitly mention the earlier
  IFMS title so the source-versus-owner decision is traceable.
- Tests intentionally mention IFMS when asserting its absence from current UI.
- Technical package metadata/comments may retain IFMS where they describe an
  unchanged internal package rather than user-visible application branding.

No current frontend UI, browser metadata or password-reset subject is intended
to present IFMS as the current application brand. No new migration, credential,
paid service, entitlement or feature is introduced.

## Verification

Focused unit/browser assertions cover the full auth-screen name, tab metadata,
favicon, sidebar/header/footer, desktop/mobile layout and Subscription Plans.
Existing authentication, portfolio and market workflows remain regression gates.
Actual results and changed files are recorded in the current CHANGELOG entry.
No push, merge, deployment or Vercel change is authorized by the branding decision.

## Remaining reference inventory

Case-insensitive scan of current repository text and decompressed DOCX XML,
excluding ignored runtime files and binary historical screenshots. Counts are
occurrences, not user-visible brand labels. Proposal.pdf separately retains its
original title. This inventory intentionally includes history and compatibility
references; those records are not rewritten.

| File | Occurrences | Classification |
|---|---:|---|
| `.github/workflows/p1-ci.yml` | 4 | Internal package/module/service/cookie/database identifier or technical metadata |
| `CHANGELOG.md` | 4 | Owner decision, stable filenames or historical progress context |
| `IFMS_Database_Backend_Schema_v1.0.docx` | 2 | Explicit original-title / compatibility explanation; legacy filename retained |
| `IFMS_PRD_v1.0.docx` | 2 | Explicit original-title / compatibility explanation; legacy filename retained |
| `IFMS_TRD_v1.0.docx` | 3 | Explicit original-title / compatibility explanation; legacy filename retained |
| `README.md` | 12 | Owner decision, stable filenames or historical progress context |
| `apps/web/package.json` | 2 | Internal package/module/service/cookie/database identifier or technical metadata |
| `apps/web/src/api.ts` | 1 | Internal imports/test identifiers or negative branding assertions |
| `apps/web/src/auth.tsx` | 1 | Internal imports/test identifiers or negative branding assertions |
| `apps/web/src/charts.test.tsx` | 1 | Internal imports/test identifiers or negative branding assertions |
| `apps/web/src/charts.tsx` | 1 | Internal imports/test identifiers or negative branding assertions |
| `apps/web/src/pages/AuthPages.test.tsx` | 3 | Internal imports/test identifiers or negative branding assertions |
| `apps/web/src/pages/AuthPages.tsx` | 1 | Internal imports/test identifiers or negative branding assertions |
| `apps/web/src/pages/Dashboard.tsx` | 1 | Internal imports/test identifiers or negative branding assertions |
| `apps/web/src/pages/Markets.test.tsx` | 1 | Internal imports/test identifiers or negative branding assertions |
| `apps/web/src/pages/Markets.tsx` | 1 | Internal imports/test identifiers or negative branding assertions |
| `apps/web/src/pages/Portfolios.tsx` | 1 | Internal imports/test identifiers or negative branding assertions |
| `apps/web/src/pages/Settings.tsx` | 1 | Internal imports/test identifiers or negative branding assertions |
| `apps/web/src/pages/Subscription.tsx` | 1 | Internal imports/test identifiers or negative branding assertions |
| `apps/web/src/pages/Watchlists.tsx` | 1 | Internal imports/test identifiers or negative branding assertions |
| `docs/p1-file-inventory.md` | 2 | Preserved historical audit/setup/validation record |
| `docs/p1-implementation-plan.md` | 4 | Owner decision, stable filenames or historical progress context |
| `docs/p1-pre-release-audit-2026-10-28.md` | 1 | Preserved historical audit/setup/validation record |
| `docs/p1-validation.md` | 5 | Preserved historical audit/setup/validation record |
| `package-lock.json` | 9 | Internal package/module/service/cookie/database identifier or technical metadata |
| `package.json` | 7 | Internal package/module/service/cookie/database identifier or technical metadata |
| `packages/contracts/package.json` | 1 | Internal package/module/service/cookie/database identifier or technical metadata |
| `playwright.config.ts` | 1 | Internal package/module/service/cookie/database identifier or technical metadata |
| `scripts/start-test-db.ps1` | 7 | Internal package/module/service/cookie/database identifier or technical metadata |
| `services/analytics/README.md` | 1 | Internal package/module/service/cookie/database identifier or technical metadata |
| `services/analytics/pyproject.toml` | 3 | Internal package/module/service/cookie/database identifier or technical metadata |
| `services/analytics/src/ifms_analytics/__init__.py` | 1 | Internal package/module/service/cookie/database identifier or technical metadata |
| `services/analytics/src/ifms_analytics/app.py` | 2 | Internal package/module/service/cookie/database identifier or technical metadata |
| `services/analytics/tests/test_health.py` | 2 | Internal imports/test identifiers or negative branding assertions |
| `services/api/package.json` | 1 | Internal package/module/service/cookie/database identifier or technical metadata |
| `services/api/src/app.ts` | 1 | Internal package/module/service/cookie/database identifier or technical metadata |
| `services/api/src/auth-context.ts` | 2 | Internal package/module/service/cookie/database identifier or technical metadata |
| `services/api/src/auth.ts` | 1 | Internal package/module/service/cookie/database identifier or technical metadata |
| `services/api/src/subscriptions.ts` | 1 | Internal package/module/service/cookie/database identifier or technical metadata |
| `services/api/src/valuation.ts` | 1 | Internal package/module/service/cookie/database identifier or technical metadata |
| `services/api/test/auth.test.ts` | 9 | Internal imports/test identifiers or negative branding assertions |
| `services/api/test/integration/auth-link-race.test.ts` | 2 | Internal imports/test identifiers or negative branding assertions |
| `services/api/test/integration/auth.test.ts` | 2 | Internal imports/test identifiers or negative branding assertions |
| `services/api/test/integration/discovery.test.ts` | 1 | Internal imports/test identifiers or negative branding assertions |
| `services/api/test/integration/health.test.ts` | 2 | Internal imports/test identifiers or negative branding assertions |
| `services/api/test/integration/market.test.ts` | 1 | Internal imports/test identifiers or negative branding assertions |
| `services/api/test/integration/portfolio.test.ts` | 1 | Internal imports/test identifiers or negative branding assertions |
| `services/api/test/integration/subscriptions.test.ts` | 3 | Internal imports/test identifiers or negative branding assertions |
| `tests/e2e/branding.spec.ts` | 2 | Internal imports/test identifiers or negative branding assertions |

## Completed validation

- PASS: whole-repository lint and TypeScript checks.
- PASS: 35 frontend tests, 27 API unit tests and 56 serial PostgreSQL integrations.
- PASS: frontend/API production builds; existing bundle-size advisory retained.
- PASS: five analytics tests, Ruff lint and format checks.
- PASS: three fixture browser workflows; real-data workflow separately passes,
  including the IIPA reset-email subject. No real Google credentials or provider
  requests are used by automated browser tests.
- PASS: independent branding review round 1; no unresolved supported finding.
- PASS: PRD/TRD/schema rendered (32/15/30 pages), titles/headers and owner-decision
  pages inspected. Semantic comparison confirms branding substitutions and one
  addendum only; technical identifiers and unrelated parts are preserved.
- PASS: secret policy/private-value scan (including DOCX XML), no secret values
  exposed. No schema, API, environment or package-name change.

Screenshots: `docs/ui-evidence/iipa-branding-2026-10-28/` records login desktop/
mobile, registration, dashboard and Subscription Plans desktop/mobile. Historical
screenshots and audit files remain unchanged.

## Changed file inventory

- `CHANGELOG.md`
- `IFMS_Database_Backend_Schema_v1.0.docx`
- `IFMS_PRD_v1.0.docx`
- `IFMS_TRD_v1.0.docx`
- `README.md`
- `apps/web/index.html`
- `apps/web/public/favicon.svg`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/AuthPages.test.tsx`
- `apps/web/src/pages/AuthPages.tsx`
- `apps/web/src/pages/Subscription.test.tsx`
- `apps/web/src/pages/Subscription.tsx`
- `apps/web/src/styles.css`
- `docs/branding.md`
- `docs/p1-implementation-plan.md`
- `docs/ui-evidence/iipa-branding-2026-10-28/iipa-dashboard-desktop.png`
- `docs/ui-evidence/iipa-branding-2026-10-28/iipa-login-desktop.png`
- `docs/ui-evidence/iipa-branding-2026-10-28/iipa-login-mobile.png`
- `docs/ui-evidence/iipa-branding-2026-10-28/iipa-register-desktop.png`
- `docs/ui-evidence/iipa-branding-2026-10-28/iipa-subscription-desktop.png`
- `docs/ui-evidence/iipa-branding-2026-10-28/iipa-subscription-mobile.png`
- `services/analytics/README.md`
- `services/analytics/src/ifms_analytics/app.py`
- `services/api/src/auth.ts`
- `services/api/src/server.ts`
- `tests/e2e/branding.spec.ts`
- `tests/e2e/p1-real.spec.ts`
