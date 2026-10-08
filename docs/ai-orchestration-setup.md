# FYP AI orchestration setup

## Goal

Provide a supervised Level-2 development workflow for Codex without requiring an OpenAI API key.

This repository setup gives Codex durable project instructions and repeatable skills for:
- requirements/preflight analysis
- external integration research
- implementation
- independent review
- fix/review loops
- testing
- security review
- release readiness

## Current runtime model

The repository skills can be used from Codex with the repository open locally.

Without an OpenAI API integration, do not assume the VS Code extension can programmatically create a persistent team of independently addressable agents.

Use the orchestration skill to perform explicit role passes. If the installed Codex runtime exposes independent task/subagent delegation, use it only for bounded independent work and avoid concurrent edits to the same files.

The repository is intentionally structured so a future Agents/Responses API orchestration layer can reuse the same policies and skills.

## Workflow

1. Owner requests a feature/fix.
2. Run `orchestrate-task`.
3. Run `preflight`.
4. If ACTION_REQUIRED/BLOCKED, stop and report to the owner.
5. If READY, plan and implement on a task branch.
6. Run independent `code-review`.
7. Return valid findings to implementation.
8. Repeat review/fix at most 3 rounds.
9. Run `testing`.
10. Run `security-review` when security-sensitive areas are touched.
11. Run `release-readiness`.
12. Open/update the pull request.
13. Required GitHub checks run independently.
14. Staging may be automated later.
15. Production remains owner-approved.

## Agent/role map

- Orchestrator: `orchestrate-task`
- Requirements/Environment: `preflight`
- Integration Research: `integration-research`
- Developer: `implementation`
- Reviewer: `code-review`
- Tester: `testing`
- Security Reviewer: `security-review`
- Release/DevOps gate: `release-readiness`

Frontend, backend, and database specialization should be assigned by the orchestrator based on the task and actual application stack once source code is added.

## Preflight status contract

### READY
All blocking requirements are present.

### ACTION_REQUIRED
Owner must install/configure/provide something. Secret values must never be requested in source control or chat.

### BLOCKED
The feature cannot safely/technically proceed in the current state.

## Review policy

- maximum 3 review/fix rounds
- CRITICAL/HIGH findings block progression
- required test failure blocks progression
- unresolved disagreement/blocker is escalated to owner
- no reviewer may treat its own implementation as independent approval

## Current repository limitation

At the time this setup was added, the repository did not contain application source code or a concrete application dependency manifest on the inherited setup branch. Therefore this change does not invent Node/Python/application test commands.

When the application stack is committed, add real stack-specific CI jobs and update this document with exact local and CI commands.

## AWS

AWS staging/production automation is intentionally deferred until:
- application stack is present
- build artifact format is known
- staging resources are defined
- IAM/OIDC policy can be scoped correctly

The intended future design is:
GitHub Actions -> OIDC -> limited staging role -> staging verification -> owner approval -> separate production role.
