# Wireframe — Archetype Gallery (the Catalog UI)

**Goal:** Show what a designer / DS lead sees after archaeology runs on their
product. This is the **artifact** the whole pipeline produces.

## Top-level view

```
┌──────────────────────────────────────────────────────────────────────┐
│  Acme Checkout — Archetype Gallery               crawled 2 hours ago │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Fidelity Score                                              │    │
│  │   ████████████████░░░░░░░░  62% on-system                   │    │
│  │   ↑ +5% since last week                                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  127 archetypes · 4,217 instances · 38 routes · 4 viewports          │
│                                                                      │
│  [Search archetypes…]  Filter: [All ▼] [Drift > 30% ▼] [Sort ▼]      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐            │
│  │ ▓▓▓▓▓▓▓▓ │ ▓▓▓▓▓▓▓▓ │ ▓▓▓▓▓▓▓▓ │ ▓▓▓▓▓▓▓▓ │ ▓▓▓▓▓▓▓▓ │            │
│  │ ▒▒▒▒▒▒▒▒ │ ▒▒▒▒▒▒▒▒ │ ▒▒▒▒▒▒▒▒ │ ▒▒▒▒▒▒▒▒ │ ▒▒▒▒▒▒▒▒ │            │
│  │UserRow   │StatTile  │EmptyState│PricingCrd│ FormRow  │            │
│  │847 inst  │312 inst  │187 inst  │94 inst   │298 inst  │            │
│  │ ✓ 91%    │ ⚠ 64%    │ ✓ 88%    │ ✗ 32%    │ ⚠ 71%    │            │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘            │
│                                                                      │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐            │
│  │  …       │  …       │  …       │  …       │  …       │            │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

## Single archetype detail view

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Gallery   /   UserRow                                             │
├──────────────────────────────────────────────────────────────────────┤
│  847 instances · 12 routes · 4 variants discovered · 71% on-system   │
│                                                                      │
│  Tabs:  [Variants] [States] [Evidence] [Spec] [Drift] [On-system]    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Variants tab:                                                       │
│                                                                      │
│  Variant 1: "default" — 612 instances                                │
│    ┌─────────────────────────────────────────────┐                   │
│    │  ◯  Maya Lin              Designer  •••     │                   │
│    │     maya@acme.com                            │                   │
│    └─────────────────────────────────────────────┘                   │
│                                                                      │
│  Variant 2: "with-status" — 187 instances                            │
│    ┌─────────────────────────────────────────────┐                   │
│    │  ◯  Raj Patel  ● Active   Engineer  •••     │                   │
│    └─────────────────────────────────────────────┘                   │
│                                                                      │
│  Variant 3: "compact" — 38 instances                                 │
│  Variant 4: "with-checkbox" — 10 instances  [merge candidate?]       │
└──────────────────────────────────────────────────────────────────────┘
```

## Drift tab (where the value lands)

```
┌──────────────────────────────────────────────────────────────────────┐
│  UserRow — Drift Analysis                                            │
├──────────────────────────────────────────────────────────────────────┤
│  Property         Measured           DTF Token         Status        │
│  ─────────────────────────────────────────────────────────────       │
│  padding-block    14px               --spacing-3 (12)  ⚠ off (14)    │
│  padding-inline   16px               --spacing-4 (16)  ✓             │
│  gap              12px               --spacing-3 (12)  ✓             │
│  background       #FAFAFA            --color-neutral-50 ✓            │
│  border-radius    8px                --radius-md (8)   ✓             │
│  font-size        15px               --font-size-base  ⚠ off (14/16) │
│  shadow           0 1px 2px …        (no match)        ✗ MISSING     │
│                                                                      │
│  Drift sources:                                                      │
│   • 14px padding-block: 612 instances → propose --spacing-3.5?       │
│   • Custom shadow: 847 instances → propose new --shadow-row token?   │
│                                                                      │
│  ▶ Open token gap proposal                                           │
└──────────────────────────────────────────────────────────────────────┘
```

## Spec tab (the auto-drafted DTF spec)

```
┌──────────────────────────────────────────────────────────────────────┐
│  UserRow — Auto-drafted DTF Spec  (status: draft, awaiting review)   │
├──────────────────────────────────────────────────────────────────────┤
│  name: UserRow                                                       │
│  evidence: 847 instances across [/users, /team, /admin, …]           │
│                                                                      │
│  structure:                                                          │
│    - Avatar (L1)                                                     │
│    - VStack:                                                         │
│        - Text (h6)                                                   │
│        - Text (caption, muted)                                       │
│    - Spacer                                                          │
│    - IconButton (L1, ghost, more)                                    │
│                                                                      │
│  tokens:                                                             │
│    padding: var(--spacing-3) var(--spacing-4)                        │
│    gap: var(--spacing-3)                                             │
│    background: var(--color-surface-default)                          │
│    border-radius: var(--radius-md)                                   │
│                                                                      │
│  variants:                                                           │
│    - default                                                         │
│    - with-status (adds StatusDot before Text)                        │
│    - compact (padding → --spacing-2)                                 │
│                                                                      │
│  ▶ Approve  ▷ Edit  ▷ Reject                                         │
└──────────────────────────────────────────────────────────────────────┘
```

## Evidence tab (real screenshots)

```
┌──────────────────────────────────────────────────────────────────────┐
│  UserRow — Evidence from Production                                  │
├──────────────────────────────────────────────────────────────────────┤
│  Route: /users    [12 screenshots]                                   │
│  Route: /team     [8 screenshots]                                    │
│  Route: /admin    [6 screenshots]                                    │
│  …                                                                   │
│                                                                      │
│  Click any to see DOM + computed styles + crawl context              │
└──────────────────────────────────────────────────────────────────────┘
```

## Why this view matters

This single screen is what makes DTF **buyable**. A VP Design who can:
- See every UI archetype their product contains
- Sort by fidelity
- Drill into evidence
- Read an auto-drafted spec
- Approve → it becomes part of the system

…has just been given something **nobody else in the world is selling**. This
is the wedge UI.

---

**Review:** `[ ]` keep · `[ ]` rework · `[ ]` expand · `[ ]` cut
