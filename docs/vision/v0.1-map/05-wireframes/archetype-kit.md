# Wireframe — Archetype Kit (Dashboard example)

**Goal:** Show what a designer gets when they pick "Dashboard" — the missing
middle between L1 atoms and a real product.

## Structure of a kit

```
dashboard-kit/
├── tokens/                          (themed for this project)
├── l1/                              (re-exported from DTF core)
├── l2-scaffold/
│   ├── app-shell/                   sidebar + topbar + content slot
│   ├── stat-tile/                   metric card with trend + icon
│   ├── data-table/                  with header, sort, pagination
│   ├── filter-bar/                  pills + dropdowns + search
│   ├── empty-state/                 illustration + headline + CTA
│   ├── form-drawer/                 right-side overlay for create/edit
│   ├── user-row/                    avatar + name + role + actions
│   ├── activity-feed/               timeline of events
│   ├── confirmation-dialog/         modal with destructive variant
│   ├── command-palette/             cmd+k overlay
│   └── settings-form-row/           label + control + help
├── l3-examples/
│   ├── overview.html                landing dashboard
│   ├── users.html                   list + filters + drawer
│   └── settings.html                form-heavy page
├── recipes/                         (24 documented compositions)
└── README.md                        how to remix
```

## Figma view (designer sees this)

```
┌─────────────────────────────────────────────────────────────────┐
│  Acme Dashboard Kit — Figma                                     │
├─────────────────────────────────────────────────────────────────┤
│  Pages:                                                         │
│  📁 Tokens          ← color, spacing, type swatches             │
│  📁 L1 Atoms        ← Button, Input, Card (linked from core)    │
│  📁 L2 Kit          ← the 11 dashboard scaffolds                │
│  📁 L3 Examples     ← 3 worked example pages                    │
│  📁 Recipes         ← documented compositions                   │
│  📁 ⭐ My Work       ← blank, ready for designer to use         │
└─────────────────────────────────────────────────────────────────┘

L2 Kit page:
┌─────────────────────────────────────────────────────────────────┐
│  AppShell        StatTile      DataTable     FilterBar          │
│  ┌────────────┐  ┌───────┐    ┌───────────┐  ┌─────────────┐    │
│  │ ▒ │        │  │  124  │    │ ▓▓▓ │ ▓▓ │  │ [▼] [▼] [🔍]│    │
│  │ ▒ │        │  │ Users │    │─────┼────│  └─────────────┘    │
│  │ ▒ │        │  │ ↑12%  │    │ ▒▒▒ │ ▒▒ │                     │
│  └────────────┘  └───────┘    └───────────┘                     │
│                                                                 │
│  EmptyState      FormDrawer    UserRow       ActivityFeed       │
│  …               …             …             …                  │
└─────────────────────────────────────────────────────────────────┘
```

## L3 example page (annotated)

```
┌─────────────────────────────────────────────────────────────────┐
│  example: Users (built from kit)                                │
├──┬──────────────────────────────────────────────────────────────┤
│▒▒│ Users                              [+ New user]              │
│▒▒│ ┌─────────────────────────────────────────────────────────┐  │
│▒▒│ │ FilterBar: [Role ▼] [Status ▼] [Search…]                │  │
│▒▒│ ├─────────────────────────────────────────────────────────┤  │
│▒▒│ │ UserRow:  ◯ Maya       Designer     Active   …  │   │  │  │
│▒▒│ │ UserRow:  ◯ Raj        Engineer     Active   …  │   │  │  │
│▒▒│ │ UserRow:  ◯ Priya      DS Lead      Active   …  │   │  │  │
│▒▒│ └─────────────────────────────────────────────────────────┘  │
│▒▒│                                                              │
│▒▒│ Annotations:                                                 │
│▒▒│  • AppShell wraps everything (sidebar + content)             │
│▒▒│  • FilterBar = L2 kit component, slots filled with selects   │
│▒▒│  • UserRow = L2 kit component, repeated in DataTable layout  │
└──┴──────────────────────────────────────────────────────────────┘
```

## What's NOT in the kit (deliberately)

- Marketing pages (different archetype)
- Auth flows (cross-cutting, separate recipe pack)
- Specific business logic (subjective, designer's job)
- "How your product should look" prescriptions (kit is a scaffold)

## Remix contract

The kit **promises**:
- Every L2 uses only DTF L1 + tokens (no hardcoded values)
- Every L2 has all states (default/hover/loading/empty/error)
- Every L2 is fully responsive
- Every L2 has a code equivalent (React/Vue/Svelte)

The kit **does not promise**:
- That you'll use every L2
- That you can't replace any of them
- That your product will look like the examples

---

**Review:** `[ ]` keep · `[ ]` rework · `[ ]` expand · `[ ]` cut
