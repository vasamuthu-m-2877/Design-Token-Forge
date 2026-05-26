# Foundation governance

This document defines who owns the `@design-token-forge/foundation-mobile`
package, how patterns get added, and how breaking changes are handled.
Phase 2.5a deliverable per the [v0.2 vision](../../docs/vision/v0.2-map/).

## Ownership

| Tier | Owner |
|---|---|
| L0 + L1 | DTF core |
| **Foundation (this package)** | **DTF core** |
| Shape Kit (`mobile-writing`, `mobile-commerce`, …) | DTF core initially; shape teams long-term |
| L2 / L3 in products | Product designer |

DTF core holds the merge bit on this package. Shape teams contribute via RFC.

## What goes IN a Foundation

A pattern qualifies for Foundation if **both** are true:

1. **Used in ≥2 shape-kits** — empirically reused, not predicted to be reused.
2. **Intent is shape-stable** — the pattern means the same thing across
   consumers. (A "Card" is not a Foundation pattern because it means
   different things in writing vs commerce.)

If only (1) is true: stays as a recipe in each shape-kit, duplicated.
If only (2) is true: stays in one shape-kit until a second use proves demand.

## Promotion path

```
shape-specific L2 → second use in different shape → RFC → review → promoted to Foundation on next minor
```

We do NOT pre-spec Foundations. The 10 initial mobile-Foundation patterns
were *discovered* during the Probe 2 comparison (Writing vs Commerce), not
designed up-front.

### RFC template

```md
# Foundation RFC: <PatternName>

**Proposed by:** <team / person>
**Date:** <yyyy-mm-dd>

## Evidence of reuse
- Shape kit A uses it for: <use case>
- Shape kit B uses it for: <use case>
- (Optional) Shape kit C uses it for: <use case>

## Intent stability check
Does the pattern mean the same thing across all consumers? Yes / No.
If No, explain why it's still a Foundation candidate (it usually isn't).

## Proposed API
- Slot architecture
- Required L1 atoms
- Density modes covered
- Token surface (rough count)

## Migration cost for existing shape-kits
- A: replace local impl with Foundation import. Risk: <low/med/high>
- B: same
```

## Versioning

Foundation gets **independent semver**, decoupled from shape-kits and
from the L1 components package.

| Change | Bump | Shape-kit impact |
|---|---|---|
| New pattern added (additive) | minor | no breakage |
| New token added (additive, default sensible) | minor | no breakage |
| Token rename / removal | major | shape-kits must migrate |
| Slot architecture change | major | shape-kits must migrate |
| L1 dependency major bump propagated | major | shape-kits must migrate |
| Visual default change (no API change) | minor + CHANGELOG note | no breakage but visual review needed |

Shape-kits pin to a Foundation **major** in their `peerDependencies`:

```json
"peerDependencies": {
  "@design-token-forge/foundation-mobile": "^1.0.0"
}
```

This lets the Foundation ship minors freely while protecting shape-kits
from accidental breakage.

## LTS policy

> **Status:** initial proposal, to be revisited after Phase 2.5c ships and
> we have empirical migration data. See Q22 in
> [v0.2 open questions](../../docs/vision/v0.2-map/09-open-questions.md).

| Foundation major | Support window after next major ships |
|---|---|
| Current major | indefinite |
| Previous major (N–1) | **6 months** of patch backports |
| Older majors (N–2+) | no support |

Shape-kits SHOULD migrate within the 6-month window. Patch backports cover
security and a11y fixes only — no new patterns, no token changes.

## Cross-platform Foundations

> **Status:** unresolved. See Q23 in v0.2 open questions.

Some primitives (Toast, Tooltip, Spinner) may belong above all platforms in
a hypothetical `@design-token-forge/foundation-universal`. For v0.2 we are
**not** building this; if the Desktop and Marketing Foundations show the
same patterns appearing identically, we'll revisit.

## What does NOT live in Foundation

- Anything used by only 1 shape-kit → lives IN that shape-kit
- Anything used by all kits but with different intent per kit → recipe
- L1 atoms → live in `@design-token-forge/components`
- Tokens → live in `@design-token-forge/tokens`
- L3 screen recipes → live in the consuming product (Q25 open)

## How to contribute

1. Use a pattern shape-specifically first (in your shape-kit)
2. Find a second shape-kit that needs the same intent
3. Open an RFC issue in the DTF repo using the template above
4. RFC review at the next DTF core sync (weekly)
5. If approved: PR adds the pattern to this package on the next minor

Premature contributions (before second-use evidence) will be closed with a
"come back when you have a second consumer" note.
