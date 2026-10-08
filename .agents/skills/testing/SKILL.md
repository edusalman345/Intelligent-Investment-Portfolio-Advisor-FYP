---
name: testing
description: Determine and run the real validation appropriate to an FYP change, including lint, type checks, unit/integration tests, builds, and smoke checks. Use after implementation and fixes.
---

# Testing

Determine validation commands from actual project configuration. Do not invent commands or claim unavailable checks passed.

Classify every check as:
- PASSED
- FAILED
- SKIPPED
- NOT_APPLICABLE
- UNAVAILABLE

When applicable run:
- formatting/lint
- type checks
- unit tests
- integration tests
- database/migration tests
- build
- targeted regression tests
- staging smoke tests

A failed required check blocks progression.

When a check fails:
- capture the relevant failure
- identify likely cause
- return actionable information to implementation
- re-run the affected checks after correction

Do not hide, suppress, or delete failing tests merely to obtain green CI.

Final output must include exact commands executed and their result.
