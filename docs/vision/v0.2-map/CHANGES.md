# v0.2 — Changes from v0.1

Audit trail. Every v0.2 change traces to a specific finding from one of the
three stress-test artifacts. 21 findings → resolutions.

## Source legend

- **WT** = [walkthrough-writer-handhelds.html](../v0.1-map/05-wireframes/walkthrough-writer-handhelds.html)
- **P1** = [probe-mobile-writing-kit.html](../v0.1-map/05-wireframes/probe-mobile-writing-kit.html)
- **P2** = [probe-mobile-commerce-kit.html](../v0.1-map/05-wireframes/probe-mobile-commerce-kit.html)

## Findings → resolutions

### Architectural (folded into [02-architecture.md](02-architecture.md))

| # | Source | Finding | Resolution in v0.2 |
|---|---|---|---|
| A1 | P2 | 77% L2 overlap between Writing + Commerce mobile kits → shape kits leak | **Foundation tier added.** Mobile / Desktop / Marketing Foundations sit between L1 and shape-kits. Holds the platform-shape patterns; shape-kits hold the product-shape deltas. |
| A2 | P1 | "Kit per shape" thesis — same intents (browse, view, act) compose differently per shape | **Confirmed and made explicit.** Shape kits are platform × product-shape (e.g. `mobile-writing`, `mobile-commerce`, `desktop-dashboard`), not just product-shape. |
| A3 | WT | Archetype grid showed 6 cards (Dashboard, Marketing…) all desktop-shape | **Kit picker reframed:** first pick **platform** (mobile/desktop/marketing), then pick **product shape** within. Removes desktop bias. |
| A4 | WT | "Crawl the live product" assumes web HTML; mobile app has no DOM | Archaeology now has **two evidence sources**: web crawl (Playwright) and native introspection (Xcode/Android view hierarchy + screenshot diffing). Spec'd at architecture level, deferred in implementation to Phase 5+. |
| A5 | WT | "Open in Figma preview" treated as universal output | Reframed: Figma output is the **default surface** for design teams, but on-system rebuild (HTML/React Native/SwiftUI) is the **truth surface**. Figma is a view. |
| A6 | P1 | Platform fork policy unclear (iOS NavigationBar vs Android AppBar) | **Forking rule added:** components fork only when platform conventions differ ≥3 axes. Otherwise one component with platform-conditional tokens. |
| A7 | P2 | Foundation tier creates a new versioning surface | Versioning policy spec'd: Foundation gets independent semver, shape-kits pin to Foundation major. LTS policy deferred to v0.3. |

### Token / theming (folded into [02-architecture.md](02-architecture.md))

| # | Source | Finding | Resolution in v0.2 |
|---|---|---|---|
| T1 | WT | Onboard wireframe showed 1 brand color; real project has 8 roles | **Onboard reframed as 3 sub-steps:** (1) brand color → ladder, (2) role mapping (brand/danger/warning/info/success/neutral + optional grayscale/desaturated), (3) theme pair (light + dark with independent step indices). Wireframe 01 is now incomplete and flagged for refresh in v0.3. |
| T2 | WT | Theme step missing entirely from onboard | Promoted to mandatory onboard step (see T1). |
| T3 | WT | Surfaces config missing — real project ships 8 surface levels | Surface ladder declared a **first-class token group**, not an afterthought. Spec'd alongside color in onboard. |
| T4 | WT | Drift detection missing theme dimension | Drift catalog now keys on `(archetype, state, viewport, theme)` not just `(archetype, state, viewport)`. |

### Roadmap (folded into [07-roadmap.md](07-roadmap.md))

| # | Source | Finding | Resolution in v0.2 |
|---|---|---|---|
| R1 | P1, P2 | Phase 2.5 said "build Dashboard kit" — too narrow given Foundation discovery | **Phase 2.5 restructured:** 2.5a builds **Mobile Foundation** (10 L2s shared), 2.5b builds first mobile shape-kit (Writing, +4 L2s), 2.5c builds second to prove tier (Commerce, +6 L2s). Dashboard moves to Phase 3 as the Desktop pilot. |
| R2 | P1 | Build math for kits was vague | Concrete budget: Mobile Foundation = 10 L2s × ~4 states = 40 states. Each shape kit = 4–6 L2s × ~4 states = 16–24 states. Total mobile coverage (4 kits) = 108 states vs 216 without Foundation. |
| R3 | P2 | Cost economics of N kits unproven | Math published in [02-architecture.md](02-architecture.md). Foundation pays back after the 2nd shape-kit. |
| R4 | WT | One real product case study scheduled in Phase 2.5 | Upgraded: case study **must use the Foundation tier** (one shape on top of Mobile Foundation). Validates the tier in practice, not just on paper. |
| R5 | P2 | Foundation governance unclear (who owns it? DTF core vs shape teams?) | Phase 2.5a deliverable now includes **Foundation governance doc**: DTF core owns; shape teams contribute via RFC; promotion requires use in ≥2 shape-kits. |

### Open questions (folded into [09-open-questions.md](09-open-questions.md))

| # | Source | Old question status | New status |
|---|---|---|---|
| Q6 | P1, P2 | "How many archetypes do we initially commit to? (Suggested: 6)" | **Resolved:** reframed as N Foundations × M shapes. Initial commit: 1 Foundation (Mobile) × 2 shapes (Writing, Commerce). |
| Q7 | WT, P1 | "Recipes vs L2 — threshold for promotion?" | **Sharpened:** promote to L2 when (a) used 3+ times across products AND (b) the underlying intent is shape-stable across consumers. If intent varies, stays as recipe. |
| Q12 | WT | "How do we handle native iOS/Android?" | **Partially resolved:** Foundation tier accepts platform forks; native pipeline deferred to Phase 5+, web first. |
| — | P2 | NEW | **Q21.** Are Desktop and Marketing Foundations real, or is Mobile a special case? (Tested only on mobile so far.) |
| — | P2 | NEW | **Q22.** Foundation LTS — how long do shape-kits get to migrate after a major Foundation bump? |
| — | P2 | NEW | **Q23.** Cross-platform Foundations (e.g. "all platforms share Toast") — do they exist, or does every platform fork? |
| — | P2 | NEW | **Q24.** Authoring discipline — do we encourage teams to **build shape-specific first, generalize on second use**, or pre-spec Foundations? |
| — | P1 | NEW | **Q25.** Are L3 "screen recipes" first-class artifacts in the kit, or just docs? (P1 shipped a NoteList L3; P2 shipped a Product Detail L3 — both felt valuable.) |

## What did NOT change

Concretely unchanged sections — all still authoritative under v0.1:

- **Thesis** (00) — the gap between definition and live-product fidelity is unchanged.
- **Problem** (01) — the four pains are unchanged.
- **Surfaces** (03) — Figma plugin / web app / CLI / catalog surfaces unchanged.
- **User journeys** (04) — the personas (designer, engineer, DS lead, ops) unchanged.
- **Wireframes** (05) — none of the 5 originals are wrong; some are incomplete (see T1, A3). Refresh deferred to v0.3.
- **Business model** (06) — Drift Audit + SaaS + premium kits unchanged.
- **Risks** (08) — unchanged. (Foundation tier doesn't introduce new top-tier risks; it reshapes risk R3 "kit explosion" into the more manageable "Foundation versioning".)

## Verdict rollup

Of 18 verdicts in the walkthrough:

| Verdict | v0.1 count | v0.2 status |
|---|---|---|
| holds | 9 | all preserved, no v0.2 changes needed |
| bends | 5 | 4 addressed (T1, T2, A5, A4), 1 deferred to v0.3 (recipe library scope) |
| breaks | 2 | both addressed (A2, A3) |
| missing | 2 | both addressed (T3, T4) |

7 of 9 originally-failing verdicts now have v0.2 resolutions. 2 deferred to
v0.3 once Foundation tier is implemented and tested.
