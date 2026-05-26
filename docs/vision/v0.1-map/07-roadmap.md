# 07 — Roadmap

Phased plan, ordered for **value delivery + risk reduction**. Each phase ends
with a shippable, sellable artifact.

## Phase 0 — Current state (done)

✅ L1 components (button family, inputs, cards, etc.) with full variant matrix
✅ Token system (colors, spacing, type, motion) with DTCG-style structure
✅ Figma plugin with bidirectional sync
✅ Project-scoped theming (`projects/*`)
✅ Onboard flow (brand → palette → ladder)
✅ Demo pages for every L1

## Phase 1 — Installable *(in flight)*

**Goal:** Anyone can `pnpm add @dtf/core` and get a working system.

- [ ] CSS bundling (Vite/PostCSS) for `packages/components`
- [ ] npm packaging for `tokens`, `components`, `figma-plugin`
- [ ] Semantic versioning + CHANGELOG automation
- [ ] CI/CD for npm publish
- [ ] Public README + getting-started doc

**Exit:** `npm install` works. DTF is a real package.

## Phase 2 — Usable *(next)*

**Goal:** A new team can onboard in under a day.

- [ ] Theme generator CLI (`dtf init <brand-color>`)
- [ ] Getting-started doc with copy-paste examples
- [ ] A11y + RTL pass on all L1 (focus-visible, logical props, layers)
- [ ] DTCG token export
- [ ] Tailwind preset, Style Dictionary config

**Exit:** A designer + engineer can ship a themed product in 1 day.

## Phase 2.5 — Archetype Kits (NEW, between 2 and 3)

**Goal:** Bridge the L1→product gap. Pick one archetype, build it fully.

- [ ] Define 6 archetypes (Dashboard, Marketplace, Editorial, Social, Editor, Workflow)
- [ ] Build **Dashboard kit** end-to-end: 11 L2 scaffolds + 3 example L3 pages + 24 recipes
- [ ] Recipe template + recipe library structure
- [ ] Kit picker in onboard flow
- [ ] One real product built using the kit as case study

**Exit:** Onboard a real product start-to-finish using the Dashboard kit.

## Phase 3 — Complete

**Goal:** Component coverage broad enough for any real product.

- [ ] L1 inventory completion (full audit of `inventory.md`)
- [ ] Framework wrappers (React, Vue, Svelte)
- [ ] 2 more archetype kits (Marketplace, Editorial)
- [ ] Cross-component consistency audit (uses existing `dtf-component-qc` skill)

**Exit:** DTF is a credible alternative to Supernova/Knapsack for definition.

## Phase 4 — Archaeology MVP

**Goal:** Crawl ONE live product, produce a real catalog + drift report.

- [ ] `packages/archaeologist/`: Playwright crawler + auth + state injection
- [ ] DOM + computed style extractor
- [ ] Screenshot capture (per-route, per-state, per-viewport)
- [ ] Segmentation (a11y tree + DOM landmarks + visual)
- [ ] Drift mapper (computed styles → DTF tokens)
- [ ] Static HTML gallery output (browsable catalog)
- [ ] First design partner case study

**Exit:** Show the catalog + drift report from a real product. The wedge demo.

## Phase 5 — Archaeology Production

**Goal:** Repeatable across multiple products + continuous.

- [ ] Fingerprinting (structural + visual + semantic)
- [ ] Clustering (HDBSCAN + CLIP + LLM tagging)
- [ ] LLM-drafted L2 specs from clusters
- [ ] Continuous crawl scheduling (nightly / per-deploy)
- [ ] Diff between crawl runs (drift over time)
- [ ] PR drift check (GitHub app)
- [ ] 3 design partner case studies

**Exit:** Drift Audit as a productized $25k engagement, sold to 3 customers.

## Phase 6 — SaaS V1

**Goal:** Hosted product, recurring revenue.

- [ ] Hosted drift dashboard
- [ ] Multi-product rollups
- [ ] Team / org accounts, SSO
- [ ] Billing (Stripe)
- [ ] Public launch, pricing page

**Exit:** First $10k MRR.

## Phase 7 — AI Generation

**Goal:** Catalog → training data for AI composition.

- [ ] Figma plugin: compose from intent
- [ ] Recipe-aware suggestions
- [ ] Per-project AI fine-tuning on the project's own catalog
- [ ] L2 promotion workflow (Figma → catalog → DTF core)

**Exit:** AI is composing on-system L3 pages that designers approve.

## Phase 8 — Platform

**Goal:** DTF is the measurement layer the industry standardizes on.

- [ ] Open archaeology spec (DTCG-aligned drift schema)
- [ ] Third-party integrations (Penpot, Framer, Storybook)
- [ ] DS team certification / partner program
- [ ] Vertical-specific packages (fintech, healthcare)

## What's deliberately NOT on the roadmap

- ❌ Hand-built L2 library for "every common pattern" (recipe model instead)
- ❌ Page builder / WYSIWYG (designer's job, not the system's)
- ❌ Direct competition with Storybook on component docs (we generate component docs from catalog)
- ❌ Generic AI design generation (only L1-grounded composition)

## Critical path

```
Phase 1 → 2 → 2.5 → 4 → 5
                            └──> Drift Audit revenue funds Phase 6
                                                                    └──> SaaS revenue funds Phase 7+
```

Phase 3 can happen in parallel with Phase 4. Phase 2.5 is essential — without
archetype kits, definition layer is incomplete.

---

**Review:** `[ ]` keep · `[ ]` rework · `[ ]` expand · `[ ]` cut
