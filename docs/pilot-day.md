# Pilot Day Guide

Running the Anchor Desk pilot with the KarEve team.

## Prerequisites

- [ ] 30 synthetic tickets in `server/test/fixtures/pilot-day.json`
- [ ] Two skeptics identified (skeptic-a, skeptic-b)
- [ ] All five brands represented (CD, DB, BOC, AMBI, AF)
- [ ] Run `npm run ops:pilot-gate` to validate fixture

## Pilot Fixture

The pilot uses a 30-row synthetic dataset covering:

- All five brands
- Various intents (WISMO, damage, refunds, etc.)
- Two assigned "skeptic" agents for evaluation
- All emails use `@example.com` — no real customer data

Run the validation:

```bash
npm run ops:pilot-gate
```

This checks:
- Exactly 30 rows
- All emails end with `@example.com`
- All required fields present
- Valid agents and brands

## Pilot Checklist

### Before Pilot

1. Run health check: `GET /api/health/ingest`
2. Run renewal drill: `npm run ops:renewal-drill`
3. Verify all mailboxes show healthy in Settings
4. Confirm fixture passes: `npm run ops:pilot-gate`

### During Pilot

1. Skeptics work assigned tickets
2. Track AI draft acceptance rate
3. Note any UI issues or confusion points
4. Document workflow friction

### After Pilot

1. Collect skeptic feedback
2. Review draft acceptance metrics
3. Document issues in `docs/pilot-issues.md`
4. Plan fixes for identified gaps

## Success Criteria

- Skeptics can complete full ticket lifecycle
- AI drafts are useful (>50% light/no edit sends)
- No silent failures (all errors surfaced)
- Health monitoring catches issues proactively
