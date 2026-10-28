# P1 Mid implementation plan

The 27 October real-data completion increment and its acceptance matrix are
recorded in [p1-real-world-acceptance.md](p1-real-world-acceptance.md).

This plan records the approved scope and concrete implementation choices. Source
documents are `Proposal.pdf` (Table 1, page 5), `IFMS_PRD_v1.0.docx` (section 10),
`IFMS_TRD_v1.0.docx` (section 19) and
`IFMS_Database_Backend_Schema_v1.0.docx`. Owner-supplied originals are preserved;
the approved baseline is retained. The separately authorized Subscription Plans
enhancement is appended to the existing PRD, TRD and database document, with
untouched originals backed up under ignored `.tmp/subscription-docs-originals/`.

## Selected modules and acceptance criteria

The Proposal explicitly assigns **User Authentication, Portfolio Management and
Market Data Management** to P1 Mid. The PRD/TRD milestone sections agree. These
provide identity, investor records and market observations for the demo. The P1
Final ML intelligence, financial news processing and event detection modules are
deferred rather than substituted into this milestone.

| Module | Acceptance criteria |
|---|---|
| User Authentication | Email/password registration and login; hashed passwords; profile/preferences; logout and revocable server sessions; password change and single-use recovery; investor/admin permissions; Google login and explicit linking; input validation; safe errors and rate limits. Google protocol behavior is tested with injected providers until real credentials are configured. |
| Portfolio Management | Owner-scoped portfolios and watchlists; create/edit/archive portfolio; fractional trade and cash records; idempotent retries; append-only reversal; replayed holdings/weighted average cost; atomic rejection of oversells, invalid history/reversal and unsupported bounds; current cached-price valuation and mutation snapshots with missing/stale/demo provenance. |
| Market Data Management | Asset search/detail; latest quote and bounded daily OHLCV history; selected economic observations; provider abstraction; normalized record validation; duplicate/out-of-order/stale/invalid issue tracking; administrator refresh and ingestion diagnostics; failure preserves good cached data; demo provenance and timestamps visible. |

The detailed database schema supports these modules. Google identities,
short-lived OAuth transactions, hashed sessions/reset tokens, idempotency
fingerprints and migration bookkeeping implement the necessary security and
consistency controls.

## Architecture and implementation ownership

| Area | Responsibility |
|---|---|
| `apps/web` | React/TypeScript, Tailwind, Chart.js; cookies and CSRF-aware API client; public authentication screens and protected investment workspace |
| `services/api` | Node/Express/TypeScript; validation, authorization, authentication, decimal ledger/valuation, parameterized PostgreSQL queries and market ingestion |
| `database/migrations` | PostgreSQL schema, constraints and indexes; immutable applied SQL checksums |
| `packages/contracts` | Shared domain/API types; no credentials |
| `services/analytics` | Minimal FastAPI process-health foundation required by the documented service architecture; no financial/ML endpoints or database dependency |
| Tests/CI | Unit, frontend, real disposable PostgreSQL and Chromium workflows; isolated analytics checks; independent review and security review |

Native Windows development and local PostgreSQL follow the owner decision.
Docker/AWS are deferred. The backend owns portfolio calculations; duplicating
them in Python would add unnecessary architecture for these three modules.

## Database tables

| Area | Required tables |
|---|---|
| Authentication/security | `users`, `user_preferences`, `auth_sessions`, `password_reset_tokens`, `auth_identities`, `oauth_transactions`, `audit_logs` |
| Portfolio/watchlist | `portfolios`, `transactions`, `holdings`, `portfolio_valuation_snapshots`, `watchlists`, `watchlist_items` |
| Market/economic | `assets`, `data_sources`, `market_quotes`, `market_price_bars`, `economic_indicators`, `economic_observations`, `ingestion_runs`, `data_quality_issues` |
| Migration tracking | `schema_migrations`, created by the migration runner |
| Additional prototype catalog | `subscription_plans`; informational only, no user associations or access restrictions |

Transactions retain the original record and its reversal link; holdings are
derived from valid ledger replay. Portfolio row locks serialize mutations.
Foreign keys, uniqueness, positive amounts, currency/role/status checks and OHLC
bounds complement API validation. Read/mutation ownership checks remain
server-side. Applied migration files must not be edited.

## REST API inventory

All paths below have prefix `/api/v1`. Normal responses use `{data: ...}`; errors
use `{error: {code, message, requestId}}`. Decimal quantities/prices/values are
strings. Cookie-authenticated writes require `X-CSRF-Token`; all writes also
require the configured `Origin`. `GET /auth/session` exposes the current user's
session and CSRF token without exposing the bearer cookie.

| Methods and paths | Purpose/access |
|---|---|
| `GET /auth/session` | Session state and Google configuration; public |
| `POST /auth/register`, `/auth/login` | Public email/password authentication |
| `POST /auth/logout` | Revoke current authenticated session |
| `GET /me`, `PATCH /me` | Current profile/preferences |
| `GET /auth/sessions`, `DELETE /auth/sessions/:id` | List/revoke the user's sessions |
| `POST /auth/password/change` | Authenticated password update/reauthentication |
| `POST /auth/password/forgot`, `/auth/password/reset` | Public generic recovery request and single-use reset |
| `GET /auth/google`, `/auth/google/callback` | Server authorization-code redirect/callback |
| `POST /auth/google/link` | Authenticated, password-confirmed explicit linking; returns authorization URL |
| `GET /portfolios`, `POST /portfolios` | Owner list/create; optional list status filter |
| `GET /portfolios/:id`, `PATCH /portfolios/:id`, `DELETE /portfolios/:id` | Owner detail/edit/archive; DELETE archives rather than erases history |
| `GET /portfolios/:id/holdings` | Derived owner holdings |
| `GET /portfolios/:id/transactions`, `POST /portfolios/:id/transactions` | Owner transaction history/recording; UUID idempotency key required for writes |
| `POST /portfolios/:id/transactions/:transactionId/reverse` | Owner append-only controlled reversal |
| `GET /portfolios/:id/valuation`, `/portfolios/:id/valuation/history` | Current owner valuation and persisted mutation snapshots |
| `GET /watchlists`, `POST /watchlists` | Owner watchlist list/create |
| `GET /watchlists/:id`, `PATCH /watchlists/:id`, `DELETE /watchlists/:id` | Owner watchlist detail/rename/delete |
| `POST /watchlists/:id/items`, `DELETE /watchlists/:id/items/:assetId` | Owner watchlist membership |
| `GET /assets?q=...`, `/assets/:id`, `/assets/:id/quote` | Authenticated asset search/detail/latest eligible quote |
| `POST /assets/discover` | Authenticated/CSRF-protected real symbol/company discovery and validated US/USD equity registration; shared provider quotas |
| `POST /assets/:id/market-data` | Authenticated/CSRF-protected real-cache initialization; existing cache reused; admin refresh rights unchanged |
| `GET /assets/:id/history?from=YYYY-MM-DD&to=YYYY-MM-DD` | Authenticated bounded daily OHLCV history |
| `GET /market/economic`, `/market/status` | Authenticated selected observations/provider status |
| `POST /market/refresh` | Administrator refresh of optional selected `assetId`; CSRF required |
| `GET /market/runs`, `/market/issues` | Administrator ingestion/quality diagnostics |
| `GET /subscription-plans` | Authenticated read-only Free/Pro presentation catalog; no billing or entitlement effects |

Health paths are outside the prefix: Express `/health` and `/ready`; FastAPI
`/health` and `/ready`. Analytics readiness is process-only; Express readiness
requires database access and the foundation migration.

## Screens

Public routes: `/login`, `/register`, `/forgot-password`, `/reset-password`.
Protected routes: `/` overview, `/portfolios`, `/portfolios/:id`, `/watchlists`,
`/markets`, `/markets/:id`, `/settings` (also `/profile`) and the additional
prototype `/subscription` page. Portfolio creation,
transactions and reversals use dialogs. Settings contains profile, password,
sessions and Google linking. Market screens include observation charts,
source/freshness/demo labels and administrator-only ingestion controls. Mobile
navigation and responsive tables/forms are part of browser acceptance checking.

## Explicit prototype choices and deferred integrations

- USD only; no FX conversion. Buy/sell records track externally funded holdings
  and cost. Explicit deposit/withdrawal/dividend/fee records track cash separately.
- Latest eligible quotes drive valuation; missing/stale positions are disclosed.
  Valuation history is mutation snapshots, not reconstructed daily performance.
  The owner explicitly accepted event-driven snapshots, USD-only holdings and
  separately recorded cash for P1 Mid on 27 October. New snapshots use the
  configured provider's actual available prices; daily reconstruction remains
  a potential future enhancement.
- Seed prices/economic observations are synthetic fixtures. The optional free
  Alpha Vantage daily adapter is directly relevant to the market module, but live
  verification was completed for AAPL/MSFT/NVDA in the 27 October increment.
  No paid endpoint is used; real mode never substitutes seed observations.
- No broker settlement, live order execution, paid provider, news, OpenAI, ML
  integration or external training dataset is introduced.
- Local recovery uses an ignored private outbox; production delivery and
  production operation are outside this development release.

## Validation, risks and owner actions

Authentication, database and CI changes require independent code/security review.
Review/fix rounds are limited to three total. CRITICAL/HIGH findings and required
failing checks block progression. Check commands are documented in the
[README](../README.md); final evidence is recorded in
[p1-validation.md](p1-validation.md), not inferred from this plan.

Real Google end-to-end verification requires owner console configuration and
private credentials; see [google-oauth-setup.md](google-oauth-setup.md). The normal
development database connection also requires owner configuration. Both can be
deferred while isolated PostgreSQL and mocked Google workflows continue. No
external dataset, cloud resource or paid service is a prerequisite for these
checks. Release readiness permits PR preparation only after the latest applicable
checks and reviews pass; merging and production deployment remain unauthorized.


## Additional prototype enhancement Subscription Plans

Authorized on 27 October 2026 after the P1 Mid completion audit at `5eb83b6`.
This informational enhancement is outside the original 15 approved features and
is not a new approved module. The original M1 to M3 completion results and audit
evidence remain unchanged.

The protected `/subscription` page and shared desktop/mobile navigation present
Free as the current plan at USD 0/month, including portfolio management, stock
search, historical market data and watchlists. Pro is Coming Soon with no
published price, checkout or purchase action. AI insights, portfolio risk
analysis, forecasting and intelligent alerts are labelled planned and unavailable.
Every existing account retains existing access without a subscription record.

Data flows from `subscription_plans` through authenticated
`GET /api/v1/subscription-plans`, the shared `SubscriptionPlan` contract and the
existing web API/resource conventions into `SubscriptionPage`. Additive
`002_subscription_plans.sql` creates the catalog and reference seeds, while the
migration ledger skips already-applied SQL and `ON CONFLICT(code) DO NOTHING`
preserves existing seed rows on deliberate replay. The local schema becomes
22 domain tables plus `schema_migrations` (23 total). No foreign key is added to
users or investment records.

No payments, invoices, billing, checkout, user-subscription tables, paid services,
new credentials, subscription authorization or functional Pro implementation is
included. Acceptance checks cover protected routing, both plan presentations,
read-only API authentication, catalog constraints, fresh/repeated migrations and
existing P1 regressions. Enhancement-only results belong in the separate section
of [p1-validation.md](p1-validation.md); the original 15-feature matrix is retained.


## Application branding decision dated 28 October 2026

The owner authorized IIPA (Intelligent Investment Portfolio Advisor) as the
application brand after confirming the supplied proposal's earlier IFMS title.
See [branding.md](branding.md) for source reconciliation and retained identifiers.
The visual palette, original 15 approved features, Subscription Plans scope and
all database/API/internal contracts remain unchanged. Historical audit evidence
retains its original branding and findings.
