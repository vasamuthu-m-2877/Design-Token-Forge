# 06 — Business Model

## The two-layer market

```
            DEFINITION              FIDELITY
              layer                   layer
                │                       │
                ▼                       ▼
  ┌──────────────────────┐   ┌──────────────────────┐
  │ Supernova            │   │                      │
  │ Knapsack             │   │   (empty category)   │
  │ zeroheight           │   │                      │
  │ Backlight            │   │      ← DTF goes here │
  │ Tokens Studio        │   │                      │
  └──────────────────────┘   └──────────────────────┘
       crowded, hard            wide open, valuable
```

**Strategic move:** enter the left box as a credible baseline, expand
**right** into the empty box where defensibility lives.

## Four paths (not mutually exclusive)

### Path A — Open core + SaaS *(recommended primary)*

**Open source (free, MIT):**
- DTF core: tokens spec, L1 component library
- Theme generator CLI
- Figma plugin
- Code packages (React, Vue, Svelte)
- Archetype kits (initial set)

**Paid SaaS:**
- Hosted sync service
- Archaeology pipeline (the killer feature)
- Drift dashboard with rollups
- Per-PR drift checks (GitHub/GitLab app)
- Continuous monitoring
- AI compose-from-intent (premium quota)

**Pricing tiers:**

| Tier | Price | For | Includes |
|---|---|---|---|
| Open Source | Free | Self-hosters, OSS, indie | All core, self-run sync, manual archaeology |
| Team | $500–2,000 / mo | Single product, small team | Hosted sync, monthly archaeology, basic dashboard |
| Business | $5,000–15,000 / mo | 3–10 products | Continuous archaeology, PR checks, all dashboards |
| Enterprise | $30k–150k / yr | Large orgs | SSO, custom integrations, SLAs, dedicated support, on-prem option |

**Why it works:** open core = adoption + credibility, SaaS = revenue from
teams needing scale + measurement. Playbook proven by GitLab, Sentry, PostHog,
Vercel, Linear.

### Path B — Vertical platform *(highest defensibility)*

Pick a vertical where brand fidelity is existential:

| Vertical | Why |
|---|---|
| Fintech | Trusted look matters; regulated screenshot archives |
| Healthcare | Compliance + brand across patient/provider/admin |
| Enterprise SaaS suites | Atlassian/Salesforce-shaped multi-product cos |
| Retail / D2C multichannel | Web, mobile, in-store, marketing all need parity |

Sell **"design fidelity for [vertical]"** with vertical compliance baked in.
Higher ACV ($150k–500k), less competition, deeply defensible.

### Path C — Audit + advisory *(fastest to revenue, lowest ceiling)*

Productized engagement:

| SKU | Price | Deliverable |
|---|---|---|
| Drift Audit | $25k | Crawl + pattern catalog + drift report + roadmap |
| Drift + Specs | $50k | Above + 20 auto-drafted L2 specs reviewed |
| Drift + Implementation | $100k–250k | Above + DTF-native rebuild of top 10 archetypes |

Run 10 audits → seen the patterns → productize into SaaS. Funds the SaaS build
without VC. Many design tools started this way.

### Path D — OSS + foundation *(legacy play, compatible with A)*

DTF becomes the W3C DTCG reference implementation. Adobe / Google /
foundation sponsorship. Lower revenue, higher legacy. Compatible with A.

## Revenue benchmarks (comparables)

| Company | What they sell | Approx ARR | Notes |
|---|---|---|---|
| Supernova | Design system platform | ~$10M | Definition layer only |
| Chromatic | Visual regression | ~$30M | Diff layer only |
| Knapsack | Design system platform | ~$10M | Enterprise focused |
| zeroheight | DS documentation | ~$15M | Docs layer only |

DTF wedge: **both definition + fidelity**, in the empty category. Plausible
$10M ARR in 3 years, $50M+ in 5–7 if archaeology lands.

## Buyer psychology

> A VP Design walks into a C-suite review with:
> **"Our brand fidelity score went from 47% to 81% this quarter."**

That single sentence justifies a $50k–$200k annual contract. No other tool
gives that sentence today.

## The story arc that sells

1. **The trap:** *"You bought a design system tool. You have a Figma library.
   You have Storybook. You still can't answer: do my products look on-brand?"*
2. **The shift:** *"Definition is solved. Fidelity isn't. The thing that
   matters — what users actually see — is invisible to your tooling."*
3. **The proof:** *"DTF measures it. We crawl your product, map every UI
   region to your tokens, score your drift, monitor continuously."*

## Recommended sequence

1. Finish Phase 1–3 of roadmap. Open-source it. Builds credibility + leads.
2. Land 3 design partners for archaeology MVP (free → case study rights).
3. Productize Drift Audit at $25k. Three deals = $75k + three case studies.
4. Build SaaS V1 around most-requested feature from those audits.
5. Decide: raise or bootstrap, based on traction.

---

**Review:** `[ ]` keep · `[ ]` rework · `[ ]` expand · `[ ]` cut
