# Anchor Desk Runbook

Operational procedures for Anchor Desk — the AI-assisted customer service dashboard for KarEve Beauty Group.

## Timeline

| Milestone | Target | Actual | Notes |
|-----------|--------|--------|-------|
| Original launch | 2026-08-31 | Missed | Rebaselined; new date tracked in ops calendar, not in code |
| Days 1–5 | Graph ingest + replies | Complete | Webhook + delta reconciliation live |
| Days 6–21 | Product features | Not started | AD-102 through AD-108 pending |
| Pilot hardening | 2026-09-02 | In progress | AD-109 — drills, docs, UI frames |

## Health Monitoring

### Ingest Health

Point your monitoring system at:

```
GET /api/health/ingest
```

Page on any non-200 response. The response includes per-mailbox status:

- `subscription-expired` — subscription has lapsed
- `no-subscription` — no active subscription
- `sync-stale` — no sync in 45+ minutes
- `last-run-errored` — last ingest attempt failed

### Renewal Drill

Run the dry-run to verify subscription renewal logic without calling Graph:

```bash
npm run ops:renewal-drill
```

Or via HTTP:

```
POST /api/health/renewal-drill
Authorization: Bearer <API_AUTH_TOKEN>
```

The drill evaluates all enabled mailboxes and reports what ensureSubscriptions WOULD do. Zero Graph HTTP calls. Always inserts one `cs_ops_drills` row.

## Subscription Lifecycle

- Subscriptions last 10,080 minutes (under 7 days)
- We request 6 days and renew with 24-hour lead
- A full day of renewal failures cannot drop a subscription
- Lifecycle events handled at `POST /api/graph/lifecycle`

## Common Issues

### Subscription Expired

1. Check `/api/health/ingest` for affected mailbox
2. Run `npm run ops:renewal-drill` to verify renewal logic
3. Check logs for renewal failures
4. If Graph token expired, re-authenticate app registration

### Delta Reconciliation Stale

1. Check scheduler is running (`ENABLE_SCHEDULER=true`)
2. Check for Graph throttling (429s)
3. Verify delta links are valid in `cs_mailboxes`

### Webhook Not Firing

1. Verify `PUBLIC_BASE_URL` is reachable from Graph
2. Check subscription is active in Graph
3. Run delta reconciliation manually
