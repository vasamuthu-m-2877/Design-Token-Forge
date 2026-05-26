# 08 — Risks

Honest. No hedging. Each risk has a mitigation, but mitigations don't make
risks vanish.

## Technical risks

### R1 — Cluster quality is asymptotic
**Risk:** Clustering reaches ~90% accuracy easily, last 10% is hard. Bad
clusters poison the catalog (false archetypes, missed merges).
**Mitigation:** Build a curation UI from day 1 ("merge / split / keep"
Tinder-style). Treat catalog as human-in-the-loop, not fully automated.
**Residual:** Will always need human review. Plan staffing for it.

### R2 — Auth + state injection per product
**Risk:** Every customer has unique auth, mock APIs, state triggers. First
crawl is bespoke, expensive engineering.
**Mitigation:** Per-product crawl config + reusable auth plugins (SSO, magic
link, session cookie). First product takes weeks, Nth takes days.
**Residual:** True cost scales sub-linearly but never to zero. Build pricing
to absorb 1–2 weeks setup per Enterprise customer.

### R3 — SPA virtual scrolling, shadow DOM, canvas content
**Risk:** Modern web apps hide UI behind interactions; standard crawl misses it.
**Mitigation:** Scripted interaction recorder + shadow root recursion +
explicit "this is canvas, skip" tagging. Lossy for canvas-heavy apps.
**Residual:** Some products (Figma itself, design tools, charts) are
fundamentally hard. Position as "we cover document-shaped products, not
canvas apps" in marketing.

### R4 — LLM-drafted specs hallucinate
**Risk:** Auto-drafted L2 specs reference nonexistent tokens or wrong L1
components.
**Mitigation:** Strict grounding — LLM gets the actual token catalog + L1
inventory in context, with a validator that rejects any reference to
unknown primitives. Re-prompts until valid.
**Residual:** Validation catches it but means designer sees "draft failed,
review required" sometimes. Acceptable UX.

### R5 — "Minimum complete vocabulary" is subjective at boundaries
**Risk:** Is this a "stat tile" or a "metric card"? Two valid groupings;
your choice affects what gets promoted.
**Mitigation:** Document clustering conventions. Make boundaries
configurable per product. Show evidence so curators can decide.
**Residual:** Catalog has opinions baked in. Some customers will disagree.
Make it editable.

## Product / market risks

### R6 — "Just another design system tool" perception
**Risk:** Buyers lump DTF with Supernova/Knapsack/zeroheight. Sales become
feature comparisons we don't always win.
**Mitigation:** Lead with **fidelity measurement**, not definition. The
catalog + drift score is the demo. Definition is "yes, we do that too."
**Residual:** Education-heavy sale early. Need 3 strong case studies fast.

### R7 — Buyers don't articulate the fidelity problem
**Risk:** VP Designs *feel* the problem but can't name it, so they don't
search for solutions. Pull marketing is hard.
**Mitigation:** Content marketing around the question — "Can you prove your
products are on-brand?" Audit reports as lead magnets.
**Residual:** Slow demand-gen. Push sales (outbound) needed in year 1.

### R8 — Design system teams may not have budget authority
**Risk:** Champions exist (DS leads) but buyer is VP/CTO. Slow procurement.
**Mitigation:** Productize the Drift Audit as a one-shot purchase (sub-$50k,
often under signing authority). Land via that, expand to SaaS.
**Residual:** Long enterprise sales cycles. Plan cash runway accordingly.

### R9 — Figma disappears or pivots
**Risk:** Figma is the dominant onboarding surface. If it pivots (acquired,
killed by Adobe, replaced by Framer) our distribution shrinks.
**Mitigation:** Architecture is surface-agnostic. Penpot + Framer plugins
are weeks of work. The core (tokens + L1 + catalog) doesn't care which canvas
tool sits on top.
**Residual:** Short-term hit if Figma collapses. Long-term, neutral.

### R10 — Competitors copy the archaeology approach
**Risk:** Supernova / Anima / Builder add a "drift dashboard" feature.
**Mitigation:** Lead time + depth. Catalog quality compounds with every
product crawled. Open-source the spec so the *standard* is DTF's, even if
copies appear.
**Residual:** Competition is inevitable if the wedge works. Win on depth +
distribution + community.

## Execution risks

### R11 — Scope sprawl (this entire vision doc)
**Risk:** Trying to build everything → ship nothing. The vision is a
3–5 year arc, not a quarter's work.
**Mitigation:** Strict phase gates. Each phase ends with a sellable artifact.
Resist Phase N+1 work until Phase N has paying users.
**Residual:** Founder discipline. The most likely failure mode.

### R12 — Founder bandwidth
**Risk:** Solo / small team. Archaeology pipeline is months of focused work.
Selling, support, design system maintenance compete for time.
**Mitigation:** Productize early (audits, then SaaS). Hire one DS engineer
+ one infra engineer at first revenue inflection. Use AI heavily to amplify.
**Residual:** Real and large. The single biggest risk.

### R13 — Open source vs SaaS tension
**Risk:** OSS users expect free archaeology, refusing to pay. SaaS users
fork OSS, undercut pricing.
**Mitigation:** Crystal-clear OSS/paid split. Archaeology pipeline OSS as
crawler, hosted run + dashboard + multi-product paid. Same model as Sentry.
**Residual:** Some community friction. Manageable with clear messaging.

## What we're explicitly accepting

- **Asymptotic precision in catalogs** — 90–95% is the realistic ceiling.
- **Per-product setup cost** — won't ever be zero; price accordingly.
- **Long sales cycle for enterprise** — 3–9 months typical.
- **Vertical-specific features** will be demanded; build the verticals carefully.

---

**Review:** `[ ]` keep · `[ ]` rework · `[ ]` expand · `[ ]` cut
