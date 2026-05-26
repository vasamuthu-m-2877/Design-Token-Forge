# 03 — Surfaces

DTF core is one thing. **Surfaces** are how humans and tools interact with it.
Surfaces are replaceable; the core is not.

## The four surfaces

```
                  ┌─────────────────────────────────┐
                  │          DTF CORE               │
                  │  Tokens + L1 + Rules + Catalog  │
                  └────────────────┬────────────────┘
                                   │
        ┌──────────────┬───────────┼───────────┬──────────────┐
        ▼              ▼           ▼           ▼              ▼
   ┌─────────┐   ┌─────────┐  ┌─────────┐ ┌──────────┐  ┌──────────┐
   │ Figma   │   │ Code    │  │ CLI /   │ │ Archaeo- │  │ Drift    │
   │ plugin  │   │ packages│  │ MCP     │ │ logy     │  │ dashboard│
   │         │   │ (React, │  │         │ │ pipeline │  │          │
   │         │   │ Vue, …) │  │         │ │          │  │          │
   └─────────┘   └─────────┘  └─────────┘ └──────────┘  └──────────┘
   designers     engineers    automation   measurement    leadership
```

## Surface 1 — Figma plugin

**Audience:** designers composing screens.
**Status:** exists today (`packages/figma-plugin/`).
**Responsibilities:**
- Sync DTF variables → Figma variables (bidirectional, ID-stable)
- Instantiate L1 components from library
- Apply project-themed tokens
- Future: "compose from intent" — generate L2/L3 from L1 + tokens via LLM
- Future: lint design files against DTF rules

## Surface 2 — Code packages

**Audience:** engineers shipping production.
**Status:** exists today (`packages/components/`, `packages/tokens/`).
**Responsibilities:**
- CSS-first L1 components
- Framework wrappers (React, Vue, Svelte) — thin, prop → data-attribute
- DTCG token exports
- Tailwind preset, Style Dictionary config, W3C JSON

## Surface 3 — CLI / MCP

**Audience:** automation, CI/CD, AI agents.
**Status:** partial (`scripts/`, sync server).
**Responsibilities:**
- `dtf init <brand-color>` — generate a themed system
- `dtf archaeology <url>` — crawl + catalog a product
- `dtf drift` — score current state against DTF
- MCP server: expose all of the above to AI agents

## Surface 4 — Archaeology pipeline

**Audience:** design system teams + leadership.
**Status:** future (this is the big build).
**Responsibilities:**
- Crawl live product (Playwright + auth + state injection)
- Extract DOM + computed styles + screenshots per region
- Cluster regions into archetypes
- Map computed styles → DTF tokens, score drift
- Draft L2 specs from clusters (LLM-grounded in DTF L1)
- Emit catalog (the artifact)
- Re-run continuously, track drift over time

## Surface 5 — Drift dashboard

**Audience:** design leadership, exec, design system PMs.
**Status:** future (consumer of archaeology output).
**Responsibilities:**
- Per-product fidelity score
- Per-archetype on-system %
- Per-route drift heatmap
- Per-PR regression alerts
- Trend lines over time
- Drill into evidence (real screenshots) for any drift

## Surface priority order

| Priority | Surface | Why |
|---|---|---|
| 1 (now) | Figma + Code | Existing users, today's revenue path |
| 2 | CLI / MCP | Enables onboarding + automation, unlocks distribution |
| 3 | Archaeology | The category-defining wedge |
| 4 | Drift dashboard | Monetizes archaeology; SaaS layer |

**Surfaces are how DTF gets used. The core is what makes DTF valuable.** A new
surface (Penpot plugin, Framer integration, native macOS app) is days of work
on top of a stable core.

---

**Review:** `[ ]` keep · `[ ]` rework · `[ ]` expand · `[ ]` cut
