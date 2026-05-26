# 09 — Open Questions

Things we haven't decided. Each should resolve in v0.2 or v0.3.

## Strategy

- **Q1.** Is DTF a *company* or a *platform / OSS project with services*?
  Affects fundraising, hiring, governance.
- **Q2.** Open core vs source-available vs fully proprietary? Same playbook
  has produced GitLab, Sentry, also Retool (proprietary). Which fits?
- **Q3.** Solo founder, bootstrapped — or raise + hire? Different velocities,
  different obligations.
- **Q4.** Do we pick a vertical (fintech / healthcare) early, or stay
  horizontal? Vertical = faster $$, narrower market.

## Product

- **Q5.** Do archetype kits ship as part of DTF core (open source) or as
  premium add-ons (paid)?
- **Q6.** How many archetypes do we initially commit to? (Suggested: 6)
- **Q7.** Recipes vs L2 components — what's the exact threshold for promotion?
  (Suggested: used 3+ times across products → review for component-ization.)
- **Q8.** Does the catalog format need to be a public spec (so others can
  consume it), or proprietary?
- **Q9.** AI compose-from-intent: per-project model fine-tune, or shared
  general model with project context injected at runtime?

## Technical

- **Q10.** Self-hosted vs cloud-only for archaeology? Enterprise will demand
  on-prem; cost to support is high.
- **Q11.** What's the smallest viable archaeology MVP that produces a useful
  catalog? (Suggested: crawler + segmenter + drift mapper, no clustering.)
- **Q12.** How do we handle non-web products (native iOS/Android, desktop)?
  Defer? Build parallel pipelines? Partner?
- **Q13.** Token spec: pure DTCG, DTCG-extended, or DTF-native?
  (Suggested: DTCG-compatible + extensions documented separately.)

## Go-to-market

- **Q14.** First design partner profile? (Suggested: B2B SaaS with 3+
  products, design team of 5+, existing-but-struggling DS team.)
- **Q15.** Initial pricing for Drift Audit — $25k or higher? Test in market.
- **Q16.** Channel: direct sales, partnerships with DS consultancies, or
  developer-led / community?
- **Q17.** Naming — is "DTF" the brand, or just internal? "Design Token
  Forge" feels narrow given the broader vision.

## Operations

- **Q18.** Who owns the catalog data — DTF or the customer? Affects trust
  and contracts.
- **Q19.** Security posture for crawling customer products (auth handling,
  data storage, retention).
- **Q20.** OSS license — MIT, Apache, or AGPL? AGPL protects against
  competitor forks but scares enterprise.

## Things to actively NOT decide yet

- Series A / seed sizing — irrelevant until traction
- Exit strategy — premature
- International expansion — premature
- Specific integration partners — premature

---

**Review:** `[ ]` keep · `[ ]` rework · `[ ]` expand · `[ ]` cut · add Q
