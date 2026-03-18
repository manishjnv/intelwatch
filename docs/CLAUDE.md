# Documentation Directory

All project documentation lives here. Updated after every implementation.

## Key Files
- PROJECT_STATE.md — LIVE project state (read FIRST every session, update via /session-end)
- DECISIONS_LOG.md — Architectural decisions (check before proposing alternatives)
- DEPLOYMENT_RCA.md — Deployment failure patterns (check before every push)
- CHANGELOG.md — Version history
- ARCHITECTURE.md — System architecture overview

## Subdirectories
- features/{module}/ — Per-module implementation docs
- api/{module}/ — API endpoint documentation

## Update Rules
After EVERY implementation session:
1. Update PROJECT_STATE.md via /session-end (mandatory)
2. Update DECISIONS_LOG.md if decisions were made
3. Update features/{module}/IMPLEMENTATION.md with what was built
4. Update api/{module}/API.md with new endpoints
5. Update CHANGELOG.md with version entry
6. Update ARCHITECTURE.md if any structural change

## Writing Style
- Concise. No filler text.
- Code examples for non-obvious patterns.
- Link to source files rather than duplicating code.
- Keep each doc under 400 lines (same as code).
