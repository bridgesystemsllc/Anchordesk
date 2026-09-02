# Anchor Desk

**AI-assisted customer service dashboard for KarEve Beauty Group.**
A Bridge Systems LLC product. Referred to as "the Desk" in shorthand.

One queue over five brand mailboxes — Carol's Daughter, Dermablend, Baxter of California, Ambi,
AcneFree. The team keeps working; the AI makes them faster. Autonomy stays at L1–L2 permanently:
the Desk drafts, a human sends.

---

## Status

For operational procedures, health monitoring, and troubleshooting, see [`docs/runbook.md`](docs/runbook.md).

**Frontend** — every screen from §6, running against a demo dataset shaped like the §5 model.

| Screen | Route | State |
|---|---|---|
| Login (Microsoft SSO) | `/` | Built · SSO not wired |
| Queue | `/queue` | **Live** · server-side filters, 30s refresh |
| My Tickets | `/mine` | **Live** |
| Ticket view | `/tickets/:id` | **Live** · replies send |
| Escalate → Teams | modal | Built · Adaptive Card preview, not posting |
| Calls | `/calls` | Built · Path A manual logging |
| Sheets | `/sheets` | Built · native grid stand-in for the SharePoint embed |
| Insights | `/insights` | Built · mock aggregates |
| Settings & Admin | `/settings` | Built · all nine sections |

**Backend** — Graph email ingest is live (Day 2–3). Webhook + delta reconciliation, threading,
idempotency, subscription auto-renewal.

**Queue and Ticket view read live data** (Day 4). Set `VITE_API_URL` and the app runs on real
tickets; leave it unset and it runs on the bundled demo dataset with no backend at all. Both modes
render the same view models, so the UI never knows which one it is looking at — which keeps the
design reviewable without a database or admin consent.

**Replies send from the dashboard** (Day 5), threaded into the customer's existing conversation and
landing in the shared mailbox's Sent items. At most once, ever — see below.

---

## Running it

### Frontend

```bash
npm install
npm run dev      # http://localhost:5180 — demo dataset, no backend needed
npm run build
npm run typecheck
```

To run against live tickets, set `VITE_API_URL` (and `VITE_API_TOKEN` to match the server's
`API_AUTH_TOKEN`) before `npm run dev`. **`VITE_*` values are compiled into the bundle** — that
token is a development convenience, never a production secret. Real auth is Entra SSO.

Add `?surface=teams` to any URL to preview the chrome-suppressed Teams-tab layout locally.

### Server

```bash
cp .env.example .env         # then fill in Entra credentials + mailboxes
docker compose up -d         # or use a local Postgres
npm run db:migrate
npm run db:seed              # synthetic mail through the real ingest pipeline
npm run server:dev           # http://localhost:4180

npm run ingest:backfill -- 30   # one-time historical pull, once consent lands
npm test                        # 149 tests
```

**Note on pgvector:** The database uses `pgvector/pgvector:pg16` for vector similarity search.
If upgrading from a plain Postgres image, you must recreate the volume to get the pgvector
extension:

```bash
docker compose down
docker volume rm anchor-desk_anchor-pgdata  # WARNING: destroys all data
docker compose up -d
npm run db:migrate
```

`db:seed` pushes synthetic Graph messages through normalization, triage, threading and
idempotency rather than inserting rows — so what lands in the database is exactly what live mail
would produce, and the UI can be driven against real data before admin consent exists. It is safe
to re-run.

Integration tests for the write path need a throwaway database:

```bash
createdb anchor_test
TEST_DATABASE_URL=postgres://localhost/anchor_test npm test
```

Without a public HTTPS callback URL, set `ENABLE_SUBSCRIPTIONS=false` and let delta reconciliation
carry ingest on its own.

---

## Graph email ingest

Two independent paths write the same tickets, because one of them will eventually fail.

**Webhook** — `POST /api/graph/notifications`. Graph validates the endpoint by POSTing a
`validationToken` that must be echoed as `text/plain`; every notification is then checked against a
per-mailbox `clientState` HMAC in constant time, acknowledged with `202` before any work, and
processed on a serial queue.

**Delta reconciliation** — every 15 minutes against each mailbox's stored `deltaLink`. This is the
safety net. Webhooks are best-effort, and without this the system can stop working without anyone
noticing. Inbox *and* Sent Items are both reconciled, so a reply an agent sends from Outlook still
lands on the ticket — the mitigation for two people working the same thread.

**Subscriptions** last 10,080 minutes (under 7 days) for Outlook messages — not the 3 days the spec
assumed. They are created for 6 days and renewed with 24 hours to spare, so a full day of renewal
failures still can't drop one. Lifecycle notifications (`subscriptionRemoved`,
`reauthorizationRequired`, `missed`) are handled at `POST /api/graph/lifecycle`; a `missed` event
triggers an immediate delta pass rather than waiting for the timer.

**Idempotency** is a unique index on `graph_message_id` plus a transaction-scoped advisory lock keyed
on `(mailbox, conversationId)`. The lock serialises ticket creation for a thread so two simultaneous
notifications can't produce two tickets; the index is the last line of defence. A duplicate reply to
a customer is embarrassing; a duplicate refund is worse.

**Threading** is Graph's own `conversationId` — no MIME parsing. A reply on a resolved ticket reopens
it; a reply on one closed more than 14 days ago starts a fresh ticket instead.

Health lives at `GET /api/health/ingest` — per-mailbox subscription expiry, last sync, last error.
Point the monitor at it and page on a non-200.

---

## Outbound send

`POST /api/tickets/:id/reply` replies to the most recent inbound message via Graph
`createReply` → update body → `send`, so the customer sees it in the thread they started and anyone
in the shared mailbox sees it in Sent items.

**It cannot send twice.** Every reply carries a client-generated idempotency key, held in
`cs_outbound_sends` behind a unique index. Two concurrent requests race to claim it and exactly one
wins; the loser is told the send is already in flight rather than being allowed to start a second.
A key that already succeeded returns `already_sent`. A key whose previous attempt failed *before
reaching Graph* may be retried, which is what the agent pressing send again expects.

The ordering is deliberate: the record is marked `sent` the instant Graph accepts the message and
before anything else is written, because every later step is recoverable and the send itself is not.
A crash in between leaves a ticket briefly missing a timeline entry, which Sent Items reconciliation
repairs.

The client half matters just as much. The key is minted once per composed reply and **reused on
retry** — so a timeout, where the mail may or may not have gone out, resolves to one email. The UI
says so explicitly rather than inviting the agent to rewrite and resend.

**Recognising our own mail.** `send` returns no body, so the sent copy's Graph id is unknown, and
Sent Items reconciliation would later ingest the same mail under a different id. Two defences: the
Internet Message-Id assigned to the draft survives the transition and is unique per ticket, and
after responding we locate the sent copy by that Message-Id and stamp its real id onto the message
we already stored. Either alone prevents the agent seeing their own reply twice.

Sending also stamps an `Anchor Desk` category on the original message in Outlook, so anyone still
working in the shared mailbox can see it has been handled — the mitigation for two people answering
one thread. Best effort by design: failing to label a message never fails a reply that already went out.

---

## Permissions — the spec was wrong here

`Mail.ReadWrite.Shared` and `Mail.Send.Shared` are **delegated-only** and cannot be granted app-only.
App-only access needs:

- `Mail.ReadWrite` (Application)
- `Mail.Send` (Application)
- `User.Read.All` (Application)

Those reach **every mailbox in the tenant**. They must be scoped with an Exchange application access
policy limited to the five brand addresses — see `.env.example` for the `New-ApplicationAccessPolicy`
command. Treat that as part of the consent request, not a follow-up.

---

## Design

Ahmad Design System — Electric Indigo `#7C3AED`, Space Grotesk / JetBrains Mono, dense over airy.
This is a tool people live in eight hours a day.

**Both themes are first-class.** Dark is the default and the app opens in it; light is a deliberate
composition on cool violet-cast paper, not an inversion — its accent is deepened to `#6D28D9` to
hold contrast on white, and its semantic colours are re-picked rather than reused. Preference is
`dark` / `light` / `system`, stored in `localStorage`, applied before first paint (no flash), and
live-tracking the OS while the app is open. Toggle it from the top bar, `⌘K → theme`, or
Settings → Appearance.

Design tokens live in `src/styles/tokens.css`; every component reads CSS variables, so a theme
change is a variable swap, never a component change.

### Details worth knowing about

- **SLA countdown ring** on every queue row — one glance shows how much of the response window is
  spent; amber at 75%, red with a glow on breach.
- **Command palette** (`⌘K`) over tickets, customers, order numbers and navigation.
- **AI draft badge** breathes on rows where a draft is already waiting.
- **Citations are clickable** — every factual claim in a draft opens the KB chunk or order field it
  came from. Uncited claims are blocked upstream.
- **Cursor glow** trails the pointer; disabled on touch and under `prefers-reduced-motion`.
- Motion respects `prefers-reduced-motion` throughout.

---

## Structure

```
src/                     frontend
  components/    AppShell · CommandPalette · Modal · EscalateModal · LogCallModal · ui primitives
  screens/       Login · Queue · TicketView · Calls · Sheets · Insights · Settings
  data/          view.ts (view models) · source.ts (live/demo switch)
                 fromApi.ts · fromMock.ts (adapters) · brands.ts · mock.ts · types.ts
  hooks/         useResource.ts (fetch, abort, poll)
  lib/           api.ts · theme.tsx · surface.ts · utils.ts
  styles/        tokens.css (both themes) · app.css (component layer)

server/                  ingest + API
  db/            schema.ts · migrations/ · migrate.ts
  graph/         auth · client (429 backoff) · subscriptions · mail (send) · types
  ingest/        normalize · triage · html · store · outbound · delta · pipeline · mailboxes
  routes/        notifications (webhook + lifecycle) · health · tickets
  jobs/          scheduler (renewal + reconciliation)
  scripts/       backfill.ts · seed-dev.ts
```

**Config is data, not constants.** Mailboxes, escalation routing and Excel bindings are the three
things that *will* change — they live in `src/data/brands.ts` and the Settings screen, never in
component code. The Carol's Daughter mailbox in particular may move with the L'Oréal separation;
that has to be a settings change, not a deploy.

**One codebase, two surfaces.** `src/lib/surface.ts` detects standalone vs. Teams tab. Everything
below the shell is surface-agnostic and written once. The real
`microsoftTeams.app.initialize()` call lands on Day 18 — deliberately after standalone works, so a
tab problem can never block launch.

---

## Next

Entra app registration and admin consent, with the application access policy above — nothing here
runs until that lands, and it is the one item not in our own hands.

Then: send replies via Graph `createReply` → `send`, with outbound idempotency (Day 5) → Shopify
order enrichment (Days 6–7). Calls, Sheets and Insights still read the demo dataset; they wire up
alongside the features that fill them.

Triage is currently rule-based and lives behind pure, tested functions in `server/ingest/triage.ts`.
The Day 10 Claude triage agent replaces one call site in `normalize.ts`, not the pipeline.
