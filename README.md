# Anchor Desk

**AI-assisted customer service dashboard for KarEve Beauty Group.**
A Bridge Systems LLC product. Referred to as "the Desk" in shorthand.

One queue over five brand mailboxes — Carol's Daughter, Dermablend, Baxter of California, Ambi,
AcneFree. The team keeps working; the AI makes them faster. Autonomy stays at L1–L2 permanently:
the Desk drafts, a human sends.

---

## Status

This repository currently holds the **frontend**: the full app shell and every screen from §6 of the
spec, running against a demo dataset shaped exactly like the Postgres model in §5. No Graph, Shopify
or Postgres wiring yet — those are Days 1–7 of the sprint.

| Screen | Route | State |
|---|---|---|
| Login (Microsoft SSO) | `/` | Built · SSO not wired |
| Queue | `/queue` | Built · mock data |
| My Tickets | `/mine` | Built · mock data |
| Ticket view | `/tickets/:id` | Built · mock data |
| Escalate → Teams | modal | Built · Adaptive Card preview, not posting |
| Calls | `/calls` | Built · Path A manual logging |
| Sheets | `/sheets` | Built · native grid stand-in for the SharePoint embed |
| Insights | `/insights` | Built · mock aggregates |
| Settings & Admin | `/settings` | Built · all nine sections |

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # tsc -b && vite build
npm run typecheck
```

Add `?surface=teams` to any URL to preview the chrome-suppressed Teams-tab layout locally.

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
src/
  components/    AppShell · CommandPalette · Modal · EscalateModal · LogCallModal · ui primitives
  screens/       Login · Queue · TicketView · Calls · Sheets · Insights · Settings
  data/          types.ts (mirrors §5 schema) · brands.ts (config-as-data) · mock.ts
  lib/           theme.tsx · surface.ts · utils.ts
  styles/        tokens.css (both themes) · app.css (component layer)
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

Days 1–7 of the sprint, in order: Entra app registration and admin consent → Graph mail ingest with
idempotency on `graph_message_id` → all five mailboxes with subscription auto-renewal → wire the
Queue to real tickets → send replies via Graph `createReply` → Shopify order enrichment.

The subscription renewal job is the highest-severity item in the build. Graph change-notification
subscriptions expire every three days, and without renewal plus a delta-query safety net, this
system stops working silently.
