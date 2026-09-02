# Code Freeze Process

Procedures for entering and exiting code freeze on Anchor Desk.

## What is Code Freeze?

A code freeze is a period where no new features are merged to `main`. Only the following are allowed:

- Critical bug fixes (P0/P1)
- Security patches
- Documentation updates
- Test improvements

## Entering Code Freeze

1. **Announce** — Notify all contributors via Teams/Slack
2. **Document** — Record freeze start date in this file
3. **Label** — Mark all pending PRs with `freeze-blocked`
4. **Verify** — Run full test suite passes on `main`

No `ENABLE_FREEZE` flag. This is a process, not a runtime switch.

## During Code Freeze

### Allowed

- Bug fixes for production issues
- Security patches (expedited review)
- Documentation improvements
- Test coverage additions
- Dependency security updates

### Not Allowed

- New features
- Refactoring
- Performance optimizations (unless critical)
- UI polish work

### Emergency Fixes

For critical production issues:

1. Create fix branch from `main`
2. Minimal change to address issue
3. Two reviewer approvals required
4. Deploy with explicit freeze exception noted

## Exiting Code Freeze

1. **Verify** — All production issues resolved
2. **Test** — Full regression pass
3. **Announce** — Notify contributors freeze is lifted
4. **Unblock** — Remove `freeze-blocked` labels
5. **Document** — Record freeze end date below

## Freeze History

| Start | End | Reason |
|-------|-----|--------|
| _None yet_ | — | — |

## Related

- See `docs/runbook.md` for operational procedures
- See `docs/pilot-issues.md` for known issues
