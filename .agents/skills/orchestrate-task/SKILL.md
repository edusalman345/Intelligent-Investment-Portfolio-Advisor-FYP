---
name: orchestrate-task
description: Coordinate substantial FYP development tasks through preflight, implementation, independent review, testing, security checks, and release readiness. Use for features, fixes, refactors, and deployment-sensitive changes.
---

# FYP task orchestration

Use this workflow for substantial repository changes.

## 1. Preflight
Run the `preflight` skill first.

Do not start implementation while preflight is `ACTION_REQUIRED` or `BLOCKED`.

## 2. Plan
Create a focused task plan with:
- requested outcome
- acceptance criteria
- affected areas
- risks
- implementation owner/role
- validation required

Do not expand scope without owner approval.

## 3. Role assignment
Use only roles needed by the task:
- frontend
- backend
- database
- integration/research
- reviewer
- tester
- security
- devops

When the Codex runtime exposes independent subagent/task delegation, delegate bounded independent work. Do not let two writers modify the same files concurrently.

When independent subagents are unavailable, execute the same roles as separate, explicit passes and keep reviewer/testing passes independent from the implementation pass.

## 4. Implementation
Use the `implementation` skill. Work only on the task branch. Add or update tests when behavior changes.

## 5. Independent review
Use the `code-review` skill after implementation.

Reviewer output must be one of:
- PASS
- CHANGES_REQUIRED
- BLOCKED

A reviewer should report findings rather than silently editing implementation code.

## 6. Fix loop
For `CHANGES_REQUIRED`, send actionable findings back to implementation and repeat review.

Maximum review/fix rounds: 3.

If a blocking issue remains after 3 rounds, stop and report it to the owner.

## 7. Verification
Use the `testing` skill. Never claim unavailable tests passed.

If authentication, authorization, uploads, secrets, user data, external callbacks, database permissions, or infrastructure are touched, also use `security-review`.

## 8. Release readiness
Use `release-readiness` before merge/deployment.

Staging may be automated only after required checks pass.
Production requires explicit owner approval.

## Final report
Report:
- preflight status
- changed files
- review rounds
- tests/checks and results
- unresolved risks
- configuration or owner actions still required
- deployment impact
