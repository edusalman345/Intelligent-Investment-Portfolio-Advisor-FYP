---
name: release-readiness
description: Decide whether an FYP change is ready for pull request, staging, or production promotion. Use after review and required validation pass.
---

# Release readiness

Verify:
- preflight is READY
- acceptance criteria are satisfied
- required review is PASS
- required tests/checks passed on the latest revision
- unresolved CRITICAL/HIGH security findings are absent
- configuration changes are documented
- database changes include migration/rollback notes when applicable
- deployment impact is known
- no secrets are committed

## Pull request
Prepare a PR summary with:
- what changed and why
- changed areas
- testing evidence
- security/database/configuration impact
- known limitations
- rollback notes

## Staging
Staging deployment may proceed automatically only through the approved GitHub workflow after required checks pass.

## Production
Production deployment always requires explicit owner approval.

Do not:
- bypass checks
- self-approve protected production deployment
- expose production credentials to coding/reviewer agents
- rebuild a different artifact for production when the deployment design supports promoting the staging-tested artifact

Return:
- READY_FOR_PR
- READY_FOR_STAGING
- WAITING_FOR_OWNER_APPROVAL
- BLOCKED
