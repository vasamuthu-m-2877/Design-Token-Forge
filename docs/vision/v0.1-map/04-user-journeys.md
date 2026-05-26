# 04 — User Journeys

Four primary personas. Each has a distinct entry point and "aha" moment.

## Persona 1 — The Designer (Maya, Product Designer)

**Situation:** New project, has a brand color, needs to design 12 screens by EOQ.

```
Day 0  → opens DTF onboard, enters brand color
       → picks "Dashboard" archetype
       → gets Figma file: themed tokens + L2 starter kit + 3 example pages

Day 1  → remixes example pages for actual product screens
       → uses L1 atoms freely, composes new L2 as needed
       → for unknown patterns, searches recipes
       → for missing patterns, uses "compose from intent" → AI drafts → tweaks

Week 2 → designs 12 screens, all on-system by construction
       → tags 3 recurring patterns #promote
```

**Aha:** "I shipped a real product in 2 weeks and didn't paint a single
off-brand pixel."

## Persona 2 — The Engineer (Raj, Frontend Engineer)

**Situation:** Designer just handed off 12 screens, needs to ship them in React.

```
Day 0  → pnpm add @dtf/react @dtf/tokens-projectX
       → tokens auto-apply via single CSS import
       → L1 components match Figma 1:1 (same names, same variants)

Day 1  → composes pages using L1 + project L2 kit
       → for designer's bespoke L2s, copies from "code mode" in Figma plugin
       → CI runs DTF drift check on PR → reports any off-token CSS

Week 1 → ships all 12 screens
       → zero pixel-pushing arguments with designer
```

**Aha:** "What I shipped matches what the designer designed, automatically."

## Persona 3 — The Design System Lead (Priya, DS Team Lead)

**Situation:** Manages DS across 4 products. Quarterly board review next month.

```
Week -4  → runs `dtf archaeology` against all 4 products in staging
         → gets per-product catalogs + drift scores
         → identifies top 10 drift patterns shared across products

Week -2  → reviews mined patterns
         → promotes 3 to canonical L2 components (added to DTF core)
         → leaves 7 as recipes (cheaper)
         → CI now alerts on regressions

Week 0   → board slide: "Fidelity Q1: 47% → 81%. Time to onboard new product:
            6 months → 3 weeks. Detached components: 412 → 64."
```

**Aha:** "I have a number. I have a trend. I have a strategy. The DS team has
visible ROI."

## Persona 4 — The Executive (Anita, VP Design)

**Situation:** Three products, three different looks, CEO asking why.

```
Month 0 → asks DS team for a "design audit"
        → team runs DTF archaeology across all three products

Month 1 → gets a single dashboard:
           Product A: 81% on-brand
           Product B: 43% on-brand
           Product C: 62% on-brand
           Top drift causes: ad-hoc colors, off-grid spacing, custom shadows

Month 3 → with continuous monitoring, scores trend upward
        → reports to CEO with real numbers
        → secures budget for next year's design platform team
```

**Aha:** "Design is no longer a vibes-based budget conversation."

## Journey crossings

| When | Persona handoff |
|---|---|
| Designer ships → Engineer builds | Figma plugin "code mode" |
| Designer composes L2 3x → DS Lead reviews | Promotion workflow |
| Engineer PR has drift → DS Lead reviews | CI/PR drift check |
| DS Lead sees trend → Exec reports | Drift dashboard rollup |
| Exec wants new product → Designer onboards | Archetype kit + theme CLI |

Every persona feeds the next. The system gets stronger with each loop.

---

**Review:** `[ ]` keep · `[ ]` rework · `[ ]` expand · `[ ]` cut
