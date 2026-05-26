# 09 — Open Questions (v0.2)

> **Delta from [v0.1](../v0.1-map/09-open-questions.md):** 3 questions
> resolved or sharpened by the probes (Q6, Q7, Q12). 5 new questions surfaced
> by the Foundation tier (Q21–Q25). All other v0.1 questions still open and
> inherit unchanged.

## Resolved or sharpened in v0.2

- **Q6.** ~~"How many archetypes do we initially commit to? (Suggested: 6)"~~
  **RESOLVED.** Reframed: not N archetypes, but N Foundations × M shape-kits.
  Initial commit: **1 Foundation (Mobile) × 2 shapes (Writing, Commerce)**.
  Desktop + Marketing Foundations follow in Phase 3.

- **Q7.** "Recipes vs L2 components — what's the exact threshold for promotion?"
  **SHARPENED.** Two-condition rule: promote to L2 when (a) used **3+ times
  across products** AND (b) the underlying intent is **shape-stable across
  consumers**. If intent varies meaningfully by consumer (e.g. "user list"
  means different things in dashboard vs marketplace), stays as recipe.

- **Q12.** "How do we handle non-web products (native iOS/Android, desktop)?"
  **PARTIALLY RESOLVED.** Foundation tier accepts platform forks; native
  introspection pipeline (iOS view hierarchy + Android equivalent) deferred to
  Phase 5+. Web first.

## Still open from v0.1

These inherit unchanged. See [v0.1 §09](../v0.1-map/09-open-questions.md) for
full prompts.

### Strategy (unchanged)
- **Q1.** Company or platform/OSS+services?
- **Q2.** Open core vs source-available vs proprietary?
- **Q3.** Solo bootstrapped or raise + hire?
- **Q4.** Vertical or horizontal?

### Product (unchanged except Q6, Q7)
- **Q5.** Archetype kits in core (OSS) or premium?
  *Reframed under v0.2 as: Are **Foundations** in core and **shape-kits** premium? Or all in core?*
- **Q8.** Catalog format — public spec or proprietary?
- **Q9.** AI fine-tune per project, or shared model with runtime context?

### Technical (unchanged except Q12)
- **Q10.** Self-hosted vs cloud-only for archaeology?
- **Q11.** Smallest viable archaeology MVP?
- **Q13.** Token spec — pure DTCG, DTCG-extended, or DTF-native?

### Go-to-market (unchanged)
- **Q14.** First design partner profile?
- **Q15.** Drift Audit initial pricing — $25k or higher?
- **Q16.** Channel — direct, partnerships, or community-led?
- **Q17.** Naming — is "DTF" the brand?

### Operations (unchanged)
- **Q18.** Who owns catalog data?
- **Q19.** Security posture for crawling?
- **Q20.** OSS license — MIT, Apache, or AGPL?

## New in v0.2 — surfaced by the Foundation tier

- **Q21.** Are Desktop and Marketing Foundations real, or is Mobile a special
  case? We've only tested two mobile shape-kits. If desktop product-shapes
  share less than mobile shapes do (because desktop is more variable in
  shell/chrome/layout conventions), the tier may not generalize. Validated in
  Phase 3 by spec'ing Desktop Foundation + Dashboard before committing more.

- **Q22.** Foundation LTS — how long do shape-kits get to migrate after a
  major Foundation bump? Affects governance, package versioning, and the cost
  of evolving the Foundation. Suggested starting point: **6 months for
  majors, no constraint for minors**. Probably needs revisiting once we have
  3+ shape-kits in production.

- **Q23.** Cross-platform Foundations — do some primitives (Toast, Tooltip,
  Spinner) belong in a "universal Foundation" above all platforms? Or does
  every platform fork them? Forking is safer (no leaky abstractions). Sharing
  is cheaper. Probe needed before deciding.

- **Q24.** Authoring discipline — do we tell teams "**build shape-specific
  first, generalize on second use**" (lazy, validates demand) or "spec
  Foundations upfront" (eager, risks premature abstraction)? v0.2 leans
  lazy/discovered. Needs explicit testing in 2.5b/2.5c.

- **Q25.** Are L3 "screen recipes" first-class artifacts in the kit, or just
  examples in docs? Both probes shipped L3 mockups (NoteList, ProductDetail)
  and both felt valuable as concrete examples. Question: do they belong
  **in the kit package** (canonical, versioned, importable) or **in the docs**
  (illustrative only, not maintained as code)? Affects package contents and
  governance.

## Things to actively NOT decide yet · *unchanged*

- Series A / seed sizing
- Exit strategy
- International expansion
- Specific integration partners

---

**Review:** `[ ]` keep · `[ ]` rework · `[ ]` expand · `[ ]` cut · add Q
