---
name: security-review
description: Review FYP changes that affect authentication, authorization, APIs, uploads, secrets, databases, webhooks, user data, or deployment security. Use only when security-sensitive areas are touched.
---

# Security review

Apply checks relevant to the change; do not add unnecessary enterprise complexity to a student FYP.

Review as applicable:
- SQL injection / parameterized queries
- cross-site scripting and output encoding
- CSRF protection for cookie-authenticated state changes
- file upload validation
- broken object-level authorization / IDOR
- rate limiting on abuse-prone endpoints
- server-side permission enforcement
- password hashing with an appropriate password hashing library
- secure session/JWT handling and secret storage
- API secrets kept server-side
- CORS restricted to intended origins
- sensitive data kept out of logs
- vulnerable/deprecated dependencies
- SSRF for server-side URL fetching
- webhook signature verification
- production source maps/exposed debug information where applicable
- default credentials
- database row-level controls when the chosen database/security model requires them

## Google login / OAuth
When Google login is used, verify:
- OAuth credentials are stored outside source control
- allowed redirect URIs are intentional
- state/nonce protections are used as appropriate
- ID/access tokens are validated by the backend where required
- account linking does not allow account takeover
- authorization remains server-side after login
- session cookies/tokens use appropriate security settings

MFA is not automatically required for every FYP feature. Recommend it only when project requirements/risk justify it.

Return:
- PASS
- CHANGES_REQUIRED
- BLOCKED

Include only findings supported by the inspected change.
