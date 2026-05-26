# DTF Vision — v0.2

**Status:** draft — awaiting review
**Predecessor:** [v0.1-map](../v0.1-map/)
**Date:** May 2026

## What v0.2 is

A **focused delta** on v0.1, not a full rewrite. v0.1's thesis, problem
statement, surfaces, journeys, wireframes, business model, and risks still
hold and remain authoritative. Only three sections materially changed:

| File | Status in v0.2 |
|---|---|
| [00-thesis](../v0.1-map/00-thesis.md) | unchanged — inherit v0.1 |
| [01-problem](../v0.1-map/01-problem.md) | unchanged — inherit v0.1 |
| **[02-architecture](02-architecture.md)** | **revised** — Foundation tier added |
| [03-surfaces](../v0.1-map/03-surfaces.md) | unchanged — inherit v0.1 |
| [04-user-journeys](../v0.1-map/04-user-journeys.md) | unchanged — inherit v0.1 |
| **[05-wireframes](05-wireframes/)** | **revised** — 3 new visual delta files (architecture tiers, onboard, kit picker); other 3 inherit from v0.1 |
| [06-business-model](../v0.1-map/06-business-model.md) | unchanged — inherit v0.1 |
| **[07-roadmap](07-roadmap.md)** | **revised** — Phase 2.5 restructured around Foundation + shape kits |
| [08-risks](../v0.1-map/08-risks.md) | unchanged — inherit v0.1 |
| **[09-open-questions](09-open-questions.md)** | **revised** — 7 closed, 5 new opened |
| **[CHANGES](CHANGES.md)** | **new** — 21 findings → resolutions audit trail |

## Why v0.2 exists

After v0.1 was drafted, three artifacts stress-tested it:

1. **[walkthrough-writer-handhelds.html](../v0.1-map/05-wireframes/walkthrough-writer-handhelds.html)**
   — walked all 5 wireframes against a real mobile writing project. 9 of 18
   verdicts came back `breaks` or `bends`. Produced 10 v0.2 inputs.
2. **[probe-mobile-writing-kit.html](../v0.1-map/05-wireframes/probe-mobile-writing-kit.html)**
   — spec'd a concrete L2 kit for mobile writing. Confirmed "kit per shape"
   thesis. Produced 7 v0.2 inputs.
3. **[probe-mobile-commerce-kit.html](../v0.1-map/05-wireframes/probe-mobile-commerce-kit.html)**
   — spec'd a second mobile kit (commerce) and compared overlap with writing.
   77% pattern reuse → discovered the **Foundation tier**. Produced 4 v0.2
   inputs.

Total: **21 concrete findings** folded into v0.2. See [CHANGES.md](CHANGES.md)
for the resolution table.

## The single most important change

v0.1's layer model was:

```
L0 → L1 → Archetype Kit → L3
```

v0.2's layer model is:

```
L0 → L1 → Foundation (per platform) → Shape Kit → L3
              ▲ NEW TIER ▲
```

The Foundation tier (Mobile, Desktop, Marketing) absorbs the 70–80% of L2
patterns that are platform-shape concerns rather than product-shape concerns.
Without it, the kit-per-shape approach costs ~216 component-states across 4
mobile kits. With it, ~108. Probe 2 showed 77% reuse between the first two
mobile kits — high enough to make the tier mandatory.

## Review process

Same as v0.1: mark each section `[KEEP]` / `[REWORK]` / `[EXPAND]` / `[CUT]` or
add `> COMMENT:` notes inline. Reply with edits applied → v0.3 if needed,
graduate to canonical `docs/` if not.

## Versions

| Version | Status | Summary |
|---|---|---|
| [v0.1-map](../v0.1-map/) | superseded by v0.2 for changed sections | First full map |
| **v0.2-map** | **draft — awaiting review** | Foundation tier; 21 findings folded in |
