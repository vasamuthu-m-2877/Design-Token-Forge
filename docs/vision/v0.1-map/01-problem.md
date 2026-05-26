# 01 — The Problem

## The wound, in one sentence

> **Brands spend millions on design systems and still can't prove their
> products look on-brand.**

## The pattern, in every company above ~100 people

| Capability | State |
|---|---|
| Design system exists | ✅ |
| Components shipped | ✅ |
| Tokens defined | ✅ |
| **Adoption measured?** | *"…we think it's good?"* |
| **Drift detected?** | *"…we audit quarterly with a spreadsheet"* |
| **New product onboarding?** | *"…6 months, still looks different"* |
| **Brand consistency across N products?** | *"…don't ask"* |

The industry spent a decade solving **definition** (Figma libraries, Storybook,
token tools). Nobody solved **fidelity** — the gap between what the system
defines and what actually ships.

## The four sub-problems DTF addresses

### 1. Definition is fragmented
Tokens in one tool, components in another, Figma library in a third, code in a
fourth. Drift between layers is constant. Designers and engineers literally
look at different things.

### 2. Onboarding new products takes forever
Every new product = bespoke theming + bespoke component variants + bespoke
documentation. 3–6 months minimum. By the time it ships, the system has moved
on. Drift is born at launch.

### 3. L2/L3 is subjective and unsystematizable (the apparent contradiction)
Designers compose at L2/L3, but those layers can't be generalized in advance
without over-prescribing. Most systems either ship 200 brittle L2s nobody uses,
or ship just L1 and tell designers "good luck." Both fail.

### 4. Fidelity is invisible
The thing that matters — what users actually see — is the one thing no DS tool
measures. Visual regression tools diff pixels but not *meaning*. Adoption
trackers count Figma library usage but not production reality.

## Who feels this pain (and pays to fix it)

| Buyer | Pain | Budget? |
|---|---|---|
| Head of Design / VP Design | "I can't prove my system is working" | Real |
| Head of Design Platform / Design Eng | "Onboarding takes forever, drift invisible" | Real |
| CTO / VP Eng at multi-product co | "Every product team rebuilds the same things" | Big |
| Brand / Marketing leadership | "Our products don't look like us" | Huge, hard to reach |
| Design system team lead | "I need to justify my team's ROI" | Champion, not owner |

Sweet spot: **companies with 3+ products and a design system team struggling
to prove ROI.**

## Why now

- DTCG token standard is stabilizing → portable definition layer exists
- Cheap embeddings (CLIP) + reliable LLMs → clustering & semantic tagging viable
- Playwright is mature → reliable production crawling
- Figma plugin API + MCP → bidirectional sync is finally doable
- Designer/engineer split is widening → measurement matters more

Five years ago this product couldn't exist. Today the pieces all converged.

---

**Review:** `[ ]` keep · `[ ]` rework · `[ ]` expand · `[ ]` cut
