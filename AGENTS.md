# Coding Rules — Anchor Desk

**Anchor Desk** is an AI-assisted customer service dashboard for KarEve Beauty Group.  
React 19 · TypeScript · Vite · Express · Drizzle ORM · PostgreSQL.  
A Bridge Systems product.

---

## Workflow

Every coding task follows **PREP → BUILD → VERIFY**.

1. **PREP** — Read relevant code. Understand the problem. Plan the fix before typing.
2. **BUILD** — Implement. Match existing patterns. Small, focused commits.
3. **VERIFY** — Run `npm run typecheck` and `npm test`. Confirm the change works.

---

## Code Quality

- **Root-cause fixes.** Trace bugs to their source. Patch the cause, not the symptom.
- **No silent catches.** Every `catch` must log, rethrow, or handle meaningfully.
- **Match existing patterns.** Follow the conventions already in the file and codebase.
- **No dead code.** Remove unused imports, variables, and functions.

---

## UI Design System

**LIGHT-FIRST.** Apple + SpaceX aesthetic. Clean, precise, professional.

### Colors

| Role        | Value     |
|-------------|-----------|
| Canvas      | `#F5F5F7` |
| Text        | `#1D1D1F` |
| Primary     | `#0071E3` |
| Chrome      | `#111111` |
| Live / Destructive | `#E82127` |

### Typography

- **Body:** SF Pro / `-apple-system` fallback
- **Headlines:** Space Grotesk
- **Data / Code:** JetBrains Mono

### Retired

Dark-first and Electric Indigo `#7C3AED` are retired unless a spec explicitly names them.

---

## Boundaries

- **Do not merge.** PRs are opened for review, not merged by agents.
- **Do not deploy.** No production deployments.
- **No secrets.** Never commit API keys, tokens, or credentials.
- **No real customer data.** Use synthetic data for development and tests.
