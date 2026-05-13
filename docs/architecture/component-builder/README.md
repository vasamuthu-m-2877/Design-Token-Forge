# Component Builder Architecture

Foundational contracts for building DTF components — both the CSS layer and the
Figma plugin generator. Read these **before** building any new component or
extending the plugin.

## Reading order

| # | Doc | Read when… |
|---|---|---|
| 1 | [overview.md](./overview.md) | First-time orientation: what gets built, how it composes |
| 2 | [variant-axes.md](./variant-axes.md) | Designing the variant matrix for any component |
| 3 | [token-naming-and-aliasing.md](./token-naming-and-aliasing.md) | Choosing token names; understanding self-heal |
| 4 | [slot-padding-model.md](./slot-padding-model.md) | Building **single-zone** components (button, input, badge, chip) |
| 5 | [multi-zone-model.md](./multi-zone-model.md) | Building **multi-zone** components (split-button, menu-button, segmented, breadcrumb) |
| 6 | [figma-binding-rules.md](./figma-binding-rules.md) | Touching the Figma plugin or any variable |

## What lives elsewhere

- **Component QC checklist** — `/.github/skills/dtf-component-qc/SKILL.md`
- **Component build skill** — `/.github/skills/dtf-component-build/SKILL.md`
- **Token primitives** — `/docs/tokens/global-tokens.md`
- **Decision records (ADRs)** — `/docs/decisions/adrs.md`
- **Per-component case studies** — `/docs/components/case-studies/` (button is the worked example)

## When in doubt

If a doc here disagrees with code or with a memory note, **the doc is wrong** —
fix the doc, not the code. These docs are descriptive of established practice,
not aspirational. Contradictions mean reality moved on.
