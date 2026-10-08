---
name: implementation
description: Implement an approved FYP task with minimal scope, project conventions, tests, and safe handling of configuration. Use after preflight is READY.
---

# Implementation

Before editing:
- read AGENTS.md
- read relevant project documentation
- confirm the task branch
- confirm acceptance criteria
- inspect existing implementation before choosing a pattern

During implementation:
- keep changes focused
- follow existing architecture and naming
- avoid unnecessary packages and abstractions
- preserve unrelated behavior
- validate input at trust boundaries
- enforce authorization server-side where applicable
- keep secrets in environment/secret stores, never source
- add or update meaningful tests for changed behavior

Do not:
- commit directly to main
- bypass repository protections
- invent missing APIs or credentials
- weaken security/CI to make a change pass
- silently change infrastructure or production behavior

After implementation:
- list changed files
- list behavior implemented
- list validation still required
- hand the change to independent review
