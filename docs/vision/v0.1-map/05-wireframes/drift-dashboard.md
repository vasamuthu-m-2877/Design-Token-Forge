# Wireframe — Drift Dashboard

**Goal:** Exec / DS-Lead view. Single screen they show to CEO or board.
Aggregates archaeology data across N products into trends + actions.

## Top-level rollup

```
┌──────────────────────────────────────────────────────────────────────┐
│  Acme — Design Fidelity Dashboard               last update: 2h ago  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Org-wide Fidelity:    ████████████░░░░░░░░  62%   ↑ +8% this Q    │
│                                                                      │
│   ┌──────────────┬──────────────┬──────────────┬─────────────────┐  │
│   │ Checkout     │ Dashboard    │ Admin        │ Marketing       │  │
│   │ ████████░░   │ ██████░░░░   │ █████████░   │ ████░░░░░░      │  │
│   │ 81% on-sys   │ 64% on-sys   │ 92% on-sys   │ 43% on-sys      │  │
│   │ ↑ +12        │ ↑ +5         │ ↑ +2         │ ↓ -4            │  │
│   └──────────────┴──────────────┴──────────────┴─────────────────┘  │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  Fidelity over time                                                  │
│    100% ┤                                                            │
│         │                                          ●─●               │
│     75% ┤                                  ●──●──●                   │
│         │                          ●──●──●                           │
│     50% ┤                  ●──●──●                                   │
│         │          ●──●──●                                           │
│     25% ┤  ●──●──●                                                   │
│         │                                                            │
│       0 └─────────────────────────────────────────────────────       │
│         Q1   Q2   Q3   Q4   Q1   Q2   Q3   (current)                 │
└──────────────────────────────────────────────────────────────────────┘
```

## Top drift sources (the action list)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Top Drift Causes — Org-wide                                         │
├──────────────────────────────────────────────────────────────────────┤
│  #  Pattern                          Instances    Products  Action   │
│  ─────────────────────────────────────────────────────────────       │
│  1  Hardcoded #FAFAFA                  412        4         [Fix]    │
│  2  padding: 14px (off-system)         287        3         [Fix]    │
│  3  Custom shadow (no token)           198        2         [Add]    │
│  4  Custom button hover color          156        4         [Fix]    │
│  5  Off-grid font-size: 15px           134        3         [Fix]    │
│  6  Detached UserRow components         87        2         [Swap]   │
│  ...                                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

## Per-PR drift (engineering view)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Recent PRs — Drift Impact                                           │
├──────────────────────────────────────────────────────────────────────┤
│  PR  Title                          Δ Fidelity   Off-token   Status  │
│  ─────────────────────────────────────────────────────────────       │
│  #421 Redesign of pricing page       -2.1%       +14         🔴      │
│  #420 Onboard new user flow          +0.3%       +0          🟢      │
│  #419 Bug fix: button alignment      0.0%        +0          🟢      │
│  #418 Add team settings              +1.4%       -8          🟢      │
│                                                                      │
│  ▶ Open PR #421 drift report                                         │
└──────────────────────────────────────────────────────────────────────┘
```

## The exec-slide composition

```
┌──────────────────────────────────────────────────────────────────────┐
│  Q3 Review — Design Platform                          slide 7 of 12  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Design fidelity across product suite:                               │
│                                                                      │
│             Q3 start    Q3 end    Change                             │
│  Checkout      69%        81%      +12%   ↑                          │
│  Dashboard     59%        64%      +5%    ↑                          │
│  Admin         90%        92%      +2%    ↑                          │
│  Marketing     47%        43%      -4%    ↓  ← attention             │
│                                                                      │
│  Org weighted:  66% → 70%   (+4%)                                    │
│                                                                      │
│  Drivers:                                                            │
│   • Onboarded 3 new L2 patterns to system (-127 detached components) │
│   • Migrated Checkout to v2 tokens (-89 hardcoded colors)            │
│   • Marketing regression: new agency landing pages, off-system       │
│                                                                      │
│  Plan: bring Marketing pages under DS governance in Q4               │
└──────────────────────────────────────────────────────────────────────┘
```

## Why this matters

This is the **screen that gets DTF funded**. Every VP Design wants this slide.
No tool today gives it to them. DTF does, and the catalog is what makes it
possible.

---

**Review:** `[ ]` keep · `[ ]` rework · `[ ]` expand · `[ ]` cut
