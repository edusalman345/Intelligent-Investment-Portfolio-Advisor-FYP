---
name: code-review
description: Independently review FYP code changes for correctness, requirement compliance, regressions, maintainability, and security. Use after implementation and after each correction round.
---

# Independent code review

Review the latest diff against:
- acceptance criteria
- PRD/TRD and project documentation
- existing architecture
- API/database contracts
- security rules
- tests

Do not approve simply because code builds or tests pass.

Check:
- incorrect behavior
- missing edge cases
- broken authorization
- missing validation
- error handling
- unsafe secret handling
- API/database incompatibility
- unnecessary complexity
- unintended file changes
- regression risk
- missing meaningful tests

Do not modify implementation code during the reviewer pass unless the owner explicitly changes the workflow.

## Finding format

For each finding include:
- severity: CRITICAL / HIGH / MEDIUM / LOW
- file/location
- problem
- impact
- required correction
- verification method

## Decision
Return exactly one:
- PASS
- CHANGES_REQUIRED
- BLOCKED

CRITICAL or HIGH findings are blocking.
Clearly state review limitations and checks not performed.
