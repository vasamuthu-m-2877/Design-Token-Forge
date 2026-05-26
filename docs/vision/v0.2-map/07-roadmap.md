# 07 — Roadmap (v0.2)

> **Delta from [v0.1](../v0.1-map/07-roadmap.md):** Phase 2.5 restructured
> around Foundation + shape-kits. Dashboard moved to Phase 3 as the Desktop
> pilot. Concrete build budgets added. Phases 0, 1, 2, 4–8 unchanged.

## Phase 0 — Current state (done) · *unchanged*

✅ L1 components with full variant matrix
✅ Token system (DTCG-style)
✅ Figma plugin with bidirectional sync
✅ Project-scoped theming
✅ Onboard flow (brand → palette → ladder)
✅ Demo pages for every L1

## Phase 1 — Installable *(in flight)* · *unchanged*

See [v0.1 §Phase 1](../v0.1-map/07-roadmap.md#phase-1--installable-in-flight).

## Phase 2 — Usable *(next)* · *unchanged scope, expanded onboard*

Same as v0.1, plus:

- [ ] Onboard step expansion: **brand color → role mapping (8 roles) → theme pair (light + dark with independent step indices)**
  *(closes WT findings T1, T2)*
- [ ] Surface ladder declared first-class in onboard
  *(closes WT finding T3)*

**Exit:** A designer + engineer can ship a themed product (light + dark, full
8-role palette, 8 surface levels) in 1 day.

## Phase 2.5 — Mobile Foundation + first shape-kit · **RESTRUCTURED in v0.2**

**Goal:** Prove the Foundation tier with a real, end-to-end deliverable.
Replaces v0.1's "build the Dashboard kit" with a tighter, smaller-blast-radius
deliverable that **validates the architecture**.

### 2.5a — Mobile Foundation (10 L2s)

- [ ] Spec + build 10 mobile foundation L2 patterns:
      `AppShell.mobile`, `TopBar`, `BottomTabBar`, `SearchHeader`,
      `SwipeRow`, `ActionSheet`, `ConfirmSheet`, `SettingsRow.mobile`,
      `Toast.mobile`, `EmptyState.mobile`
- [ ] Foundation versioning + LTS policy doc *(closes A7 partial)*
- [ ] Foundation governance doc — ownership, promotion path, RFC template *(closes R5)*
- [ ] 4 new L1 atoms identified by P1: `SwipeContainer`, `BottomSheet`,
      `SafeAreaInset`, `TabBarItem`
- [ ] Platform-fork policy: iOS NavigationBar vs Android AppBar *(closes A6)*

**Budget:** ~40 component-states + 4 new L1s + 3 governance docs.

**Exit:** `@dtf/mobile-foundation` shippable as its own package.

### 2.5b — Mobile Writing kit (first shape-kit)

- [ ] 4 writing-specific L2s on top of Foundation:
      `NoteCard`, `EditorCanvas`, `EditorToolbar`, `FormatSheet`
- [ ] L3 screen recipes: NoteList, NoteEditor, Settings
- [ ] **Real product case study using writer-handhelds as the test subject** *(closes R4)*

**Budget:** ~16 component-states.

**Exit:** writer-handhelds rebuilt on top of `@dtf/mobile-foundation` +
`@dtf/mobile-writing`. Public case study published.

### 2.5c — Mobile Commerce kit (proves Foundation tier)

- [ ] 6 commerce-specific L2s on top of Foundation:
      `ProductCard`, `ProductDetailHero`, `VariantPicker`, `CartLineItem`,
      `PriceBreakdown`, `CheckoutStepper`
- [ ] L3 screen recipes: ProductList, ProductDetail, Cart, Checkout
- [ ] **Cost-economics measurement**: actual vs predicted state count, build hours per L2, Foundation-reuse-rate

**Budget:** ~24 component-states.

**Exit:** Foundation tier validated empirically. Decision point: continue with
Reading + Chat kits (cheap, ~28 states) OR pivot to Desktop Foundation.

## Phase 3 — Complete · **REWORKED**

**Goal:** Component coverage broad across all three platform Foundations.

- [ ] L1 inventory completion
- [ ] Framework wrappers (React, Vue, Svelte, **React Native, SwiftUI**)
- [ ] **Desktop Foundation** + Dashboard kit (was v0.1's Phase 2.5)
- [ ] **Marketing Foundation** + Landing kit (smallest, tests tier symmetry)
- [ ] Cross-component consistency audit (`dtf-component-qc`)
- [ ] **Resolve Q21**: do all three platform Foundations work the way Mobile did?

**Exit:** DTF is a credible alternative to Supernova / Knapsack for definition,
with empirical proof that the Foundation tier generalizes across platforms.

## Phase 4 — Archaeology MVP · *unchanged scope, expanded surface*

Same as v0.1, plus:

- [ ] Catalog keys drift on `(archetype, state, viewport, theme)` *(closes T4)*
- [ ] First design partner case study includes light + dark theme drift

## Phase 5 — Archaeology Production · *unchanged scope, native pipeline added*

Same as v0.1, plus:

- [ ] **Native introspection pipeline**: iOS view-hierarchy + screenshot diffing,
      Android equivalent. Web-only is insufficient for mobile-app design partners. *(closes A4)*

## Phase 6 — SaaS V1 · *unchanged*

See [v0.1 §Phase 6](../v0.1-map/07-roadmap.md#phase-6--saas-v1).

## Phase 7 — AI Generation · *unchanged*

See [v0.1 §Phase 7](../v0.1-map/07-roadmap.md#phase-7--ai-generation).

## Phase 8 — Platform · *unchanged*

See [v0.1 §Phase 8](../v0.1-map/07-roadmap.md#phase-8--platform).

## Critical path (revised)

```
Phase 1 → 2 → 2.5a (Mobile Foundation)
                  ├──> 2.5b (Writing) ──> 2.5c (Commerce) ──> Foundation validated
                  │                                                    │
                  │                                                    ▼
                  └──> Phase 3 (Desktop + Marketing Foundations) ──> Phase 4 (Archaeology MVP)
                                                                       │
                                                                       ▼
                                                              Drift Audit revenue funds Phase 6+
```

Key change: **2.5a is a gating deliverable.** Without Foundation tier proof,
2.5b and 2.5c risk re-shipping the same patterns. With it, every subsequent
kit is cheaper.

## Build budgets (new in v0.2)

| Phase | New component-states | New L1 atoms | New L2 patterns |
|---|---|---|---|
| 2.5a Mobile Foundation | 40 | 4 | 10 |
| 2.5b Mobile Writing | 16 | 0 | 4 |
| 2.5c Mobile Commerce | 24 | 0 | 6 |
| 3 Desktop Foundation | ~60 (est.) | ~2 (est.) | ~15 (est.) |
| 3 Desktop Dashboard kit | ~30 (est.) | 0 | ~8 (est.) |
| 3 Marketing Foundation | ~20 (est.) | 0 | ~6 (est.) |
| **Phase 2.5 + 3 total** | **~190** | **~6** | **~49** |

Compare to v0.1's implicit math (6 archetype kits × ~11 L2s × ~4 states = 264
states with no Foundation). v0.2 ships **more capability** (3 Foundations + 4
shape-kits) in **fewer states**.

## What's deliberately NOT on the roadmap · *unchanged*

See [v0.1 §What's deliberately NOT on the roadmap](../v0.1-map/07-roadmap.md#whats-deliberately-not-on-the-roadmap).

---

**Review:** `[ ]` keep · `[ ]` rework · `[ ]` expand · `[ ]` cut
