# GitHub Repository Management, Testing and Production Deployment Protocol

## 1. Purpose

This protocol defines how this repository must be managed to prevent:

- Accidental pushes to production.
- Untested code reaching production.
- Unauthorized merges.
- Broken builds being merged.
- Developers accidentally overwriting other developers' work.
- Secrets being committed to Git.
- Unsafe database changes.
- Accidental deletion or force-pushing of important branches.
- Production deployments without testing.
- Releases without rollback capability.
- Untraceable changes.
- Emergency fixes bypassing normal controls without documentation.

The repository manager must enforce these rules technically wherever GitHub provides an enforcement mechanism.

Human instructions alone must not be relied upon when GitHub can enforce the restriction automatically.

---

# 2. Core Repository Principle

The `main` branch represents production-ready code.

No developer should use `main` as their normal development workspace.

The normal flow is:

```text
Task
↓
Issue / Requirement
↓
Feature or Fix Branch
↓
Development
↓
Local Testing
↓
Push Branch
↓
Pull Request
↓
Automated CI Checks
↓
Code Review
↓
Preview / Development Testing
↓
Staging
↓
QA / Acceptance Testing
↓
Approval
↓
Merge / Release
↓
Production Deployment
↓
Smoke Test
↓
Monitoring
```

A failure at any stage stops progression to the next stage.

---

# 3. Recommended Branch Structure

## Protected permanent branches

### `main`

Purpose:

Production-ready source code.

Rules:

- Never develop directly on `main`.
- Never push directly to `main`.
- Never force-push to `main`.
- Never delete `main`.
- Every normal change must arrive through a Pull Request.
- Required CI checks must pass before merging.
- Required reviewers must approve before merging.
- Unresolved review conversations block merging.
- Production releases must originate from approved code.

---

### `develop` — optional

Use `develop` when the project benefits from combining several features before a release.

Purpose:

Integration branch for the next release.

Possible flow:

```text
feature/*
   ↓
develop
   ↓
staging
   ↓
main
```

For a small team, `develop` may be unnecessary.

A simpler workflow is preferred when practical:

```text
feature/*
↓
PR
↓
CI
↓
Preview / Staging
↓
Approval
↓
main
```

Do not create unnecessary permanent branches.

---

# 4. Working Branch Naming Convention

Every task must use a separate branch.

Approved patterns:

```text
feature/<issue>-<description>
fix/<issue>-<description>
bugfix/<issue>-<description>
hotfix/<issue>-<description>
refactor/<issue>-<description>
docs/<issue>-<description>
test/<issue>-<description>
chore/<issue>-<description>
```

Examples:

```text
feature/142-user-login
fix/211-payment-timeout
bugfix/245-profile-image
refactor/301-auth-service
hotfix/405-login-production-error
```

Avoid names such as:

```text
test
new
working
changes
final
final-final
mybranch
abc
```

Branches should clearly identify their purpose.

---

# 5. Developer Starting Procedure

Before beginning work:

1. Confirm the task or issue.
2. Confirm acceptance requirements.
3. Update the local copy of the base branch.
4. Create a new task-specific branch.
5. Never reuse an old feature branch for unrelated work.

Typical procedure:

```bash
git checkout main
git pull origin main
git checkout -b feature/142-user-login
```

If the repository uses `develop`, create feature branches from the approved development base instead.

---

# 6. Developer Commit Rules

Commits should be small and understandable.

Recommended examples:

```text
feat: add user login endpoint
fix: prevent duplicate registration
test: add authentication integration tests
refactor: extract token validation service
docs: update authentication API documentation
```

Do not use meaningless messages such as:

```text
update
done
final
changes
fix
working now
asdf
```

Each commit should represent a logical change whenever reasonably possible.

---

# 7. Developer Pre-Push Checklist

Before pushing code, the developer should confirm:

- Code builds locally.
- Relevant tests pass.
- No debug-only code remains.
- No temporary credentials are present.
- `.env` files are not committed.
- No private keys are committed.
- No passwords are committed.
- No API secrets are committed.
- No unnecessary generated files are committed.
- No unrelated files were accidentally changed.
- Database changes are intentional.
- New functionality has tests where appropriate.
- Existing behavior has not obviously been broken.

Then push only the working branch.

Example:

```bash
git push origin feature/142-user-login
```

---

# 8. Direct Push Policy

Direct pushes to these branches must be prevented where possible:

```text
main
develop
release/*
```

Normal developers should not be able to bypass this process.

Even repository administrators should avoid bypassing protections except during a documented emergency.

---

# 9. Main Branch Protection Requirements

Configure GitHub Rulesets or Branch Protection for `main`.

At minimum enable:

- Require a Pull Request before merging.
- Require approvals.
- Require status checks before merging.
- Require conversation resolution before merging.
- Block force pushes.
- Block branch deletion.
- Restrict direct pushes where supported.
- Apply protections to administrators where practical.
- Prevent normal bypass of required rules.

Recommended additional protections:

- Dismiss stale approvals when new code is pushed.
- Require approval after the latest reviewable push.
- Require CODEOWNER reviews for sensitive files.
- Require the branch to be current with the target branch before merging, when appropriate.
- Require successful staging deployment for projects where that workflow is configured.

---

# 10. Pull Request Requirement

Every production code change should use a Pull Request.

A PR should contain:

## Description

What changed?

## Reason

Why is the change necessary?

## Related task

Reference the issue, ticket, or requirement.

## Testing

Explain how the change was tested.

## Risk

State anything that might affect:

- Authentication.
- Payments.
- Database.
- Permissions.
- Security.
- APIs.
- Infrastructure.
- Existing users.
- Production data.

## Screenshots

Required for relevant UI changes.

## Database changes

Explicitly state whether migrations are included.

## Deployment notes

Mention unusual deployment requirements.

## Rollback notes

Explain special rollback considerations when relevant.

---

# 11. Pull Request Template

Use a repository PR template similar to:

```text
## Summary

Describe the change.

## Related Issue

Closes #

## Type of Change

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Documentation
- [ ] Test
- [ ] Infrastructure
- [ ] Database change
- [ ] Security-related change

## Testing

Describe tests performed.

## Automated Checks

- [ ] Build passes
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Linting passes

## Manual Testing

Describe manual verification.

## Database Impact

- [ ] No database changes
- [ ] Database migration included

Migration details:

## Security Impact

- [ ] No security impact
- [ ] Security-sensitive change

Details:

## UI Evidence

Screenshots/videos where applicable.

## Deployment Notes

Anything deployment must know.

## Rollback Plan

Describe how this change can be reversed.

## Final Checklist

- [ ] No secrets committed
- [ ] No debug code
- [ ] Documentation updated if necessary
- [ ] Tests added/updated
- [ ] Ready for review
```

---

# 12. Automated CI Pipeline

Every Pull Request should trigger automated CI.

Recommended sequence:

```text
PR Created / Updated
        ↓
Install Dependencies
        ↓
Lint
        ↓
Formatting Check
        ↓
Type Check
        ↓
Unit Tests
        ↓
Integration Tests
        ↓
Build
        ↓
Security / Dependency Checks
        ↓
PASS or FAIL
```

A failed required check means:

```text
MERGE BLOCKED
```

The developer fixes the problem and pushes another commit.

CI runs again.

Only the latest approved code should be considered valid.

---

# 13. Required CI Checks

Configure checks appropriate to the project.

Potential required checks include:

```text
lint
format-check
typecheck
unit-tests
integration-tests
build
database-tests
security-scan
dependency-check
```

Do not require tests that do not exist merely to satisfy this document.

The exact checks should match the project's technology.

---

# 14. Testing Layers

Testing should happen in multiple layers.

## Layer 1 — Developer testing

Performed locally by the developer.

Examples:

- Feature works.
- Obvious error cases handled.
- Relevant existing functionality still works.

---

## Layer 2 — Automated testing

Performed by CI.

Examples:

- Unit tests.
- Integration tests.
- Type checking.
- Build verification.
- Linting.

---

## Layer 3 — Preview or Development Environment

Deploy the branch or PR to a non-production environment when supported.

Used for:

- Developer verification.
- UI checking.
- Product review.

---

## Layer 4 — Staging

Staging should imitate production as closely as reasonably possible.

Test:

- Authentication.
- Authorization.
- Major APIs.
- Database behavior.
- User workflows.
- Integrations.
- UI.
- Mobile/responsive behavior.
- Error handling.
- Regression-prone areas.

---

## Layer 5 — Production Smoke Test

Immediately after release verify critical functionality.

Examples:

```text
Application loads.
Health endpoint succeeds.
Login works.
Core API responds.
Critical page loads.
Critical database operation works.
No immediate severe errors appear.
```

Keep smoke tests limited and safe for production.

---

# 15. Code Review Protocol

The author should not be the only person approving their production change.

Reviewer responsibilities:

- Understand the purpose.
- Inspect significant changes.
- Check obvious logic errors.
- Look for security issues.
- Verify test coverage where appropriate.
- Verify unusual database changes.
- Confirm acceptance requirements.
- Request changes if necessary.

A reviewer should not approve solely because CI is green.

CI verifies automated conditions.

Reviewers verify human and architectural concerns.

---

# 16. Required Number of Reviewers

Recommended baseline:

### Normal change

At least:

```text
1 independent reviewer
```

### High-risk change

Prefer:

```text
2 reviewers
```

High-risk areas can include:

- Authentication.
- Authorization.
- Payments.
- Database schema.
- Infrastructure.
- CI/CD.
- Production configuration.
- Secret management.
- Destructive operations.
- Security controls.

The team may adjust reviewer counts according to size and available personnel.

---

# 17. CODEOWNERS Policy

Create:

```text
.github/CODEOWNERS
```

Use it to identify responsible reviewers for important areas.

Example:

```text
/backend/auth/ @backend-team
/database/ @database-team
/.github/workflows/ @tech-lead
/infrastructure/ @devops-team
```

Sensitive files should receive appropriate specialist review.

---

# 18. Review Reset Policy

When significant new code is pushed after approval:

- Previous approval should become stale where possible.
- The changed code should be reviewed again.
- CI must run again.

Do not assume an approval of version A automatically approves version B.

---

# 19. Merge Conflict Policy

Merge conflicts must be intentionally resolved.

Do not randomly accept:

```text
ours
```

or:

```text
theirs
```

without understanding the change.

After resolving conflicts:

- Build again.
- Run relevant tests again.
- Update the PR.
- Obtain renewed review when required.

---

# 20. Merge Strategy

Choose one primary merge strategy and use it consistently.

For many small/medium teams, the recommended default is:

```text
Squash and Merge
```

Benefits include:

- Cleaner `main` history.
- One logical commit per PR.
- Easier reverting.

The repository manager may choose another strategy when the team's workflow requires it.

---

# 21. Delete Merged Branches

After a feature PR has been merged:

```text
feature/142-user-login
```

should normally be deleted.

This keeps the repository clean.

Permanent branches such as `main` are never deleted.

---

# 22. Development Environment

Development should use development credentials and services where practical.

Never intentionally use production credentials for routine local development.

Examples:

```text
Development database
Development API credentials
Development storage
Development email service
```

---

# 23. Staging Environment

Staging is the final verification environment before production.

Recommended environments:

```text
Development
Preview
Staging
Production
```

At minimum:

```text
Staging
Production
```

should be logically separated for production systems where feasible.

---

# 24. Production Environment

Production access must be restricted.

Developers should not automatically receive unrestricted production access merely because they contribute code.

Production credentials should be available only to systems and people that genuinely require them.

---

# 25. GitHub Environment Configuration

Create GitHub environments where appropriate:

```text
development
staging
production
```

Production should have stronger controls than development.

Possible production controls:

- Required reviewers.
- Restricted deployment branches.
- Protected secrets.
- Controlled workflow permissions.

---

# 26. Secret Management Protocol

Never commit:

```text
.env
API keys
database passwords
private keys
JWT signing secrets
cloud credentials
production passwords
access tokens
service-account credentials
```

Use:

- GitHub Secrets.
- GitHub Environment Secrets.
- Cloud secret-management services where appropriate.
- Environment variables supplied during deployment.

---

# 27. `.gitignore` Requirements

The repository should have an appropriate `.gitignore`.

Common exclusions may include:

```text
.env
.env.*
node_modules/
venv/
__pycache__/
dist/
build/
coverage/
*.log
IDE-specific files
OS-generated files
```

Adjust according to the project's technology.

Do not blindly ignore files without understanding whether they should be version controlled.

---

# 28. Secret Leak Procedure

If a secret is accidentally committed:

Do NOT merely delete the file and assume the problem is solved.

Immediately:

1. Revoke or rotate the exposed credential.
2. Replace it with a new credential.
3. Determine exposure scope.
4. Remove the secret from active code/configuration.
5. Review repository history implications.
6. Verify production systems.
7. Document the incident.
8. Improve secret scanning/prevention.

Credential rotation is the first security priority.

---

# 29. Dependency Management

Dependencies should be controlled.

Avoid casually installing unnecessary packages.

For dependency changes:

- Review package reputation and purpose.
- Use lockfiles.
- Commit the lockfile where appropriate.
- Run tests after dependency upgrades.
- Review major-version upgrades carefully.
- Review automated dependency PRs before merging.

Examples:

```text
package-lock.json
pnpm-lock.yaml
yarn.lock
poetry.lock
composer.lock
```

Use whichever applies to the project.

---

# 30. Database Migration Protocol

Database changes require additional care.

Every migration should consider:

- Is it backward compatible?
- Can old application code temporarily work with the new schema?
- Is data destroyed?
- Can the migration be rolled back?
- How large is the table?
- Could it lock production tables?
- Does data require backup first?

Do not casually perform destructive production database operations.

---

# 31. Destructive Database Changes

Changes such as:

```text
DROP TABLE
DROP COLUMN
mass DELETE
mass UPDATE
data-type conversion
```

require special review.

Prefer staged migration patterns where practical.

Example:

```text
Add new column
↓
Deploy compatible application
↓
Migrate/backfill data
↓
Verify
↓
Remove old field in later release
```

---

# 32. Backup Policy

Production data must have backups appropriate to the application.

The team should define:

- Backup frequency.
- Backup retention.
- Backup location.
- Restore procedure.
- Person responsible.
- Periodic restore verification.

Git history is not a database backup.

---

# 33. Release Procedure

A normal production release should follow:

```text
Approved PR
↓
All Required CI Passed
↓
Staging Deployment
↓
QA Verification
↓
Release Approval
↓
Version Created
↓
Production Deployment
↓
Smoke Tests
↓
Monitoring
```

---

# 34. Release Versioning

Use clear release versions.

Example:

```text
v1.0.0
v1.1.0
v1.1.1
v2.0.0
```

A practical semantic-versioning interpretation:

```text
MAJOR.MINOR.PATCH
```

- MAJOR: incompatible/breaking release.
- MINOR: backward-compatible feature release.
- PATCH: backward-compatible fix.

Follow the project's chosen versioning strategy consistently.

---

# 35. Release Notes

Each release should explain important user/system changes.

Example:

```text
Release v1.6.0

Features
- Added password reset.
- Added account verification.

Fixes
- Fixed profile image upload.

Infrastructure
- Improved API health checks.

Database
- Added verification_status field.
```

---

# 36. Production Deployment Approval

A deployment should not occur merely because code was merged.

For important production systems, configure:

```text
main
↓
Build
↓
Release Candidate
↓
Production Approval
↓
Deployment
```

Production approval should come from an authorized role.

---

# 37. Production Deployment Rules

Before production deployment verify:

```text
[ ] Required PR approved
[ ] Required CI passed
[ ] Staging passed
[ ] QA completed
[ ] Database migration reviewed
[ ] Required backup exists
[ ] Secrets/configuration verified
[ ] Release version identified
[ ] Rollback strategy known
[ ] Authorized deployment approval received
```

---

# 38. Deployment Responsibility

Clearly identify who may deploy.

Example role separation:

```text
Developer
Creates code and PR

Reviewer / Tech Lead
Reviews technical changes

QA
Tests accepted build

Project Manager
Confirms release readiness/process

Release Manager / Authorized Maintainer
Approves or starts production release

CI/CD
Performs automated deployment
```

One person may hold multiple roles in a small team, but the procedure should remain documented.

---

# 39. Rollback Protocol

Every production release must have a known rollback approach.

If deployment causes a serious issue:

```text
Detect
↓
Assess severity
↓
Stop additional rollout/change
↓
Rollback or disable affected feature
↓
Verify system recovery
↓
Investigate
↓
Correct
↓
Retest
↓
Redeploy safely
```

Rollback should return to a known-good release where possible.

Example:

```text
Current: v1.6.0
Known good: v1.5.3
```

---

# 40. Feature Flags

For risky features, use feature flags when appropriate.

Example:

```text
Code deployed
Feature flag OFF
↓
Verify production
↓
Enable internally
↓
Enable gradually
↓
Enable fully
```

This can separate deployment from feature activation.

Do not use feature flags as a replacement for testing.

---

# 41. Hotfix Procedure

Production emergencies may require faster action.

Hotfix workflow:

```text
Production issue
↓
Create hotfix branch from production version
↓
Make smallest safe correction
↓
Run automated tests
↓
Open PR
↓
Urgent review
↓
Test
↓
Approve
↓
Deploy
↓
Smoke test
↓
Monitor
```

Example branch:

```text
hotfix/512-login-failure
```

Emergency does not mean:

```text
push random code directly to main
```

Normal protections should remain whenever practical.

---

# 42. Emergency Bypass Policy

If protections absolutely must be bypassed:

- Only an authorized administrator may do so.
- The reason must be documented.
- The exact change must be documented.
- The incident must be reviewed afterwards.
- Protections must be restored immediately.
- A follow-up PR should reconcile repository history if required.

Emergency bypass must never become normal workflow.

---

# 43. Repository Permission Model

Follow least privilege.

Suggested model:

## Read

People who only need repository visibility.

## Triage

Issue/PR management without normal code write access.

## Write

Developers who actively contribute code.

## Maintain

Trusted repository/project maintainers who manage most repository operations but should not need destructive administrative access.

## Admin

Very limited trusted personnel requiring full repository control.

Do not give every developer Admin access.

---

# 44. Administrator Policy

Admin access can perform destructive operations.

Limit Admin to the smallest practical number of trusted people.

Review access periodically.

Immediately remove unnecessary access when:

- Team member leaves.
- Contractor finishes.
- Responsibilities change.
- Account appears compromised.

---

# 45. CI/CD Workflow Protection

Changes to:

```text
.github/workflows/
```

must receive careful review because these files can control:

- Builds.
- Tests.
- Secrets access.
- Deployment.
- Production infrastructure.

Prefer CODEOWNER approval for CI/CD files.

---

# 46. Infrastructure Changes

Infrastructure changes require additional review.

Examples:

```text
Docker configuration
Kubernetes configuration
Terraform
Cloud configuration
Deployment scripts
GitHub Actions
Database configuration
Reverse proxy configuration
```

Treat infrastructure changes as production-impacting code.

---

# 47. PR Size Policy

Prefer small, focused Pull Requests.

Bad:

```text
Feature + refactor + dependency upgrades + database redesign + unrelated bug fixes
```

Better:

```text
PR 1 — database preparation
PR 2 — API feature
PR 3 — frontend feature
PR 4 — cleanup
```

Smaller PRs are easier to review and roll back.

---

# 48. Issue Tracking

Significant work should have an issue/task before coding.

Issue should contain where practical:

```text
Problem
Expected behavior
Acceptance criteria
Priority
Owner
Technical notes
Dependencies
```

Link PRs to their corresponding issues.

---

# 49. Definition of Done

A task is not complete merely because the developer finished coding.

A feature is done when applicable criteria are met:

```text
[ ] Requirement implemented
[ ] Code reviewed
[ ] CI passing
[ ] Tests added/updated
[ ] Documentation updated
[ ] Staging tested
[ ] Acceptance criteria satisfied
[ ] Security considerations checked
[ ] Database considerations checked
[ ] Ready for release
```

---

# 50. Bug Handling

When a bug is found:

```text
Bug reported
↓
Issue created
↓
Severity assigned
↓
Developer assigned
↓
Fix branch
↓
Tests added where appropriate
↓
PR
↓
Review
↓
CI
↓
QA
↓
Release
```

For regressions, add a regression test where reasonably possible.

---

# 51. Production Incident Procedure

When production has a significant issue:

1. Confirm the incident.
2. Record when it started.
3. Identify the affected service/features.
4. Determine severity.
5. Stop unsafe ongoing deployments if necessary.
6. Roll back or mitigate.
7. Verify service recovery.
8. Preserve relevant logs.
9. Identify root cause.
10. Implement permanent correction.
11. Add tests or controls preventing recurrence.
12. Document lessons learned.

Do not assign blame during incident resolution.

Focus first on restoring safe operation.

---

# 52. Post-Incident Review

After an important incident document:

```text
What happened?
When did it happen?
How was it detected?
What was affected?
What caused it?
Why did existing controls not stop it?
How was it fixed?
How can recurrence be prevented?
What action items remain?
Who owns each action?
```

---

# 53. Production Monitoring

After deployment monitor appropriate indicators such as:

```text
Application errors
HTTP error rates
Health checks
Latency
Database errors
Authentication failures
Background-job failures
Infrastructure health
```

Monitoring depends on the application architecture.

---

# 54. Logging Rules

Logs should help debugging but should not intentionally expose sensitive information.

Avoid logging:

```text
Passwords
Authentication tokens
API secrets
Private keys
Sensitive personal data unnecessarily
```

---

# 55. Repository Audit Routine

The repository manager should periodically inspect:

```text
[ ] Who has Admin access?
[ ] Who has Write access?
[ ] Are former contributors removed?
[ ] Is main still protected?
[ ] Can main be force-pushed?
[ ] Can main be deleted?
[ ] Are PR approvals required?
[ ] Are CI checks required?
[ ] Are CI checks still functioning?
[ ] Are GitHub Actions secure/current?
[ ] Are stale secrets present?
[ ] Are old branches accumulating?
[ ] Are dependency alerts being reviewed?
[ ] Are staging/production protections correct?
```

---

# 56. Project Manager Responsibilities

The Project Manager should ensure:

- Every task has clear requirements.
- Changes follow the agreed workflow.
- QA occurs before production.
- Production releases are deliberate.
- Release status is known.
- High-risk changes receive proper review.
- Emergency exceptions are documented.

The PM should not override technical review simply to meet a deadline.

---

# 57. Tech Lead / Repository Maintainer Responsibilities

The technical repository manager should:

- Maintain rulesets.
- Protect critical branches.
- Configure required CI checks.
- Manage CODEOWNERS.
- Review repository permissions.
- Review high-risk changes.
- Maintain release workflow.
- Prevent unauthorized bypass.
- Maintain CI/CD security.
- Ensure rollback procedures remain functional.

---

# 58. Developer Responsibilities

Developers must:

- Work on task branches.
- Keep changes focused.
- Write understandable commits.
- Add/update tests where appropriate.
- Run relevant local checks.
- Create detailed PRs.
- Respond to review feedback.
- Never bypass repository protections.
- Never commit credentials.
- Never intentionally deploy unapproved code.

---

# 59. QA Responsibilities

QA should:

- Verify acceptance criteria.
- Test core workflows.
- Test relevant edge cases.
- Verify bug fixes.
- Perform regression testing where needed.
- Record reproducible failures.
- Confirm the tested build/version.
- Approve or reject release readiness based on test results.

---

# 60. Repository Setup Checklist

The GitHub Manager must configure or verify the following:

```text
[ ] main exists
[ ] main is default production branch
[ ] main protection/ruleset active
[ ] Direct push to main restricted
[ ] PR required
[ ] Required approvals configured
[ ] Stale approvals dismissed where appropriate
[ ] Latest-push approval protection considered
[ ] Required CI checks configured
[ ] Conversation resolution required
[ ] Force push disabled
[ ] Branch deletion disabled
[ ] CODEOWNERS configured where useful
[ ] GitHub Actions configured
[ ] PR template configured
[ ] Issue templates configured where useful
[ ] .gitignore configured
[ ] Secret handling configured
[ ] Environment separation configured
[ ] staging environment configured where applicable
[ ] production environment configured
[ ] production deployment approval configured where supported
[ ] repository permissions reviewed
[ ] admin access minimized
[ ] backups configured separately
[ ] rollback method documented
```

---

# 61. PR Merge Checklist

Before merging:

```text
[ ] Correct target branch
[ ] Correct issue linked
[ ] Change understood
[ ] CI passes
[ ] Build passes
[ ] Tests pass
[ ] Required review received
[ ] CODEOWNER review received if necessary
[ ] Review comments resolved
[ ] No accidental files included
[ ] No credentials included
[ ] Database migration reviewed
[ ] Security implications reviewed
[ ] Deployment implications reviewed
[ ] Staging/preview verified where necessary
```

If any required item is false:

```text
DO NOT MERGE
```

---

# 62. Production Release Checklist

Before production:

```text
[ ] Correct release candidate
[ ] All PRs approved
[ ] CI successful
[ ] QA completed
[ ] Staging successful
[ ] Database changes verified
[ ] Backup status confirmed when relevant
[ ] Environment variables confirmed
[ ] Release version created
[ ] Release notes prepared
[ ] Rollback version identified
[ ] Production approval obtained
```

---

# 63. Post-Deployment Checklist

Immediately after deployment:

```text
[ ] Deployment succeeded
[ ] Application starts
[ ] Health checks pass
[ ] Core page/API responds
[ ] Authentication works if applicable
[ ] Critical workflow works
[ ] Database migration succeeded
[ ] Error monitoring checked
[ ] Logs checked
[ ] Version confirmed
```

If significant failures appear:

```text
STOP
↓
ASSESS
↓
ROLL BACK / MITIGATE
↓
VERIFY
```

---

# 64. Forbidden Actions

Unless explicitly required by an authorized emergency procedure:

Do not:

```text
Push directly to main.
Force-push main.
Delete main.
Disable protections to make a PR merge.
Merge failing CI.
Merge your own high-risk change without independent review.
Commit secrets.
Share production credentials in Git.
Run experimental migrations directly on production.
Modify production manually without documentation.
Deploy an unknown commit.
Deploy code that has not passed the required process.
Rewrite production history casually.
Ignore failing tests because a deadline is close.
```

---

# 65. Golden Rule

Production safety must depend on multiple independent protections.

Never rely on:

```text
"Developer will remember."
```

Instead build:

```text
Developer branch
+
Pull Request
+
Automated CI
+
Required Review
+
Branch Protection
+
Staging
+
QA
+
Deployment Approval
+
Rollback
+
Monitoring
```

This creates defense in depth.

One human mistake should not automatically become a production disaster.

---

# 66. Default Decision Rule for the GitHub Manager

Whenever uncertain whether a code change should progress:

```text
If required checks have not passed:
DO NOT MERGE.

If required review has not happened:
DO NOT MERGE.

If a critical question remains unresolved:
DO NOT MERGE.

If staging exposes a problem:
DO NOT RELEASE.

If the release cannot be safely identified or rolled back:
DO NOT DEPLOY until the risk is resolved.

If credentials appear in code:
STOP THE RELEASE and rotate affected credentials.

If production fails after deployment:
MITIGATE OR ROLLBACK before adding unrelated changes.
```

Safety and traceability take priority over deployment speed.

---

# 67. Instructions to the GitHub-Connected Manager

When managing this repository:

1. Inspect the existing repository before changing configuration.
2. Do not delete existing branches, workflows, environments, secrets, tags, or configuration without determining why they exist.
3. Compare current repository configuration against this protocol.
4. Identify missing protections.
5. Apply safe repository-level protections where authorized.
6. Do not modify application source code merely to satisfy repository-management requirements unless specifically requested.
7. Preserve functioning CI/CD workflows.
8. Avoid destructive changes.
9. Document important repository-management changes.
10. Report any setting that cannot be enforced because of GitHub plan, repository ownership, organization policy, or permission limitations.
11. Never weaken an existing security control unless explicitly authorized.
12. Prefer GitHub-enforced restrictions over informal rules.
13. Keep production credentials and secret values hidden.
14. Never print secret values into issues, PRs, logs, comments, or reports.
15. Before changing production deployment behavior, explain the impact.
16. If an action is destructive or difficult to reverse, require explicit approval before performing it.
17. Treat `main` as production-critical unless repository evidence clearly establishes another production branch.
18. Do not merge application PRs solely because they appear complete; enforce the configured review and testing requirements.
19. Maintain an auditable path from issue → branch → PR → checks → review → release.
20. Follow this protocol as the repository's default operating procedure.

---

# 68. Target End-State

The repository should eventually enforce a pipeline similar to:

```text
Developer
    │
    ▼
Issue / Task
    │
    ▼
feature/* or fix/*
    │
    ▼
Local Tests
    │
    ▼
Push Branch
    │
    ▼
Pull Request
    │
    ├── Lint
    ├── Type Check
    ├── Unit Tests
    ├── Integration Tests
    ├── Build
    └── Security Checks
    │
    ▼
Required Human Review
    │
    ▼
Preview / Development Environment
    │
    ▼
Staging
    │
    ▼
QA / Acceptance
    │
    ▼
Merge / Release Candidate
    │
    ▼
Production Approval
    │
    ▼
Production
    │
    ▼
Smoke Tests + Monitoring
    │
    ├── Healthy → Release Complete
    │
    └── Failure → Rollback / Mitigation
```

The repository manager's responsibility is to make bypassing this pipeline difficult, visible, and exceptional rather than normal.
