# Variant Axes

A variant axis is a **dimension along which a component changes**. Every axis
becomes a Figma variant property AND a CSS data-attribute (or CSS custom
property override).

## The five canonical axes

| Axis | Examples | Figma type | CSS hook |
|---|---|---|---|
| **Family** | Neutral, Brand, Status | One Component Set per family | T3 mode lock + role tokens |
| **Type** | Filled, Outlined, Ghost, Fill & Outline | Variant property | `data-variant` |
| **State** | Default, Hover, Pressed, Selected, Focus, Disabled | Variant property | `:hover`, `:active`, `[data-selected]`, `:focus-visible`, `[disabled]` |
| **Size** | micro, tiny, small, base, medium, large, big, huge, mega, ultra | Variant property | `data-size` |
| **Boolean** | Rounded, Loading, Indeterminate | Boolean variant property | `data-{name}` (presence, not value) |

A component picks the subset that applies. Button uses all five. Badge uses
Type + Size + Family. Toast uses Type + State (no size).

## Family vs Type — the structural/semantic split

This was the rename that took 7 phases to complete. The rule:

- **Family = palette context** (which color tokens resolve from)
- **Type = surface treatment** (filled, outlined, ghost — orthogonal to color)

A "Brand Filled" button is `Family=Brand × Type=Filled`. The brand palette
fills it. A "Neutral Outlined" button is `Family=Neutral × Type=Outlined`. Same
component, different family, different palette.

**Never name a Type "primary" or "danger".** That's a Family role. Types are
structural. Names you can give Types: filled, outlined, ghost, soft, fill &
outline. Names you cannot: primary, secondary, danger, success.

Why: roles change per project. A user override might map "primary" → red. If
"primary" is also a Type name, it stops meaning anything.

## State axis — what each state means

| State | Meaning | When applied |
|---|---|---|
| **Default** | Resting, no interaction | Initial render |
| **Hover** | Pointer over | `:hover` |
| **Pressed** | Mouse/finger down | `:active` |
| **Selected** | Toggled-on / current | `[data-selected]` or `[aria-pressed=true]` |
| **Focus** | Keyboard focus indicator | `:focus-visible` ONLY (not `:focus`) |
| **Disabled** | Non-interactive | `[disabled]` or `[data-disabled]` |

**Selected ≠ Pressed.** Selected is persistent (toggle on); Pressed is
transient (mouse-down). Many components don't have a Selected state — only
toggleable ones do (toggle button, segmented, tab, checkbox, radio).

## Size axis — progressive scale

Sizes are not arbitrary. They follow a **progressive scale** where:

- Each step's height, radius, padding, gap, and font-size move together
- The scale is wide enough that ANY designer demand fits without a custom size
- Names are abstract (small/base/large) not pixel-based (32px/40px/48px) so
  rebranding can shift the actual values

Button uses 10 sizes. Most components use 5–7. The rule:
**give designers more granularity than they ask for** — they always end up
needing the in-between value.

See [slot-padding-model.md](./slot-padding-model.md) for the
"tiered gap" lesson on how progressive sizing affects spacing.

## Boolean axes — the per-instance toggle

Boolean axes are different from regular variants:
- Only two values (true/false) → Figma renders as a checkbox in the inspector
- CSS uses **attribute presence**, not value: `[data-rounded]`, not
  `[data-rounded="true"]`
- Empty-string variants need special handling — strip the attribute entirely

Use a boolean axis when:
- The toggle is per-instance (not per-frame)
- It mirrors a user-facing checkbox or runtime prop
- The two states are mutually exclusive

Examples: Rounded (pill), Loading (spinner overlay), Indeterminate (checkbox
mid-state), Compact (denser variant).

The Rounded boolean was added to button via:
1. New comp-size variable `button/radius-rounded` (= 9999)
2. New variant axis `Rounded = True/False`
3. On `Rounded=True` variants, the four corner-radius bindings rebind from
   `button/default/radius` → `button/radius-rounded`

## When to add a new axis vs a new component

Rule of thumb:
- If 70%+ of states/sizes/etc. apply to both modes → **new axis**
- If the structure or interaction model changes → **new component**

Example: a "Loading" state could be a Boolean axis on Button (most things
still apply, just a spinner overlays the text). But "Split Button" is a new
component because it has two click targets.

## Axis interaction with Family

Family is **horizontal** (one Component Set per family per master).
Type/State/Size/Boolean are **vertical** within each set.

So a button generates:
```
Button / Neutral / Icon Button       (Type × State × Size × Rounded)
Button / Neutral / Text Button       (Type × State × Size × Rounded)
Button / Neutral / Icon + Text       (Type × State × Size × Rounded)
Button / Brand   / Icon Button       (Type × State × Size × Rounded)
Button / Brand   / Text Button       (Type × State × Size × Rounded)
Button / Brand   / Icon + Text       (Type × State × Size × Rounded)
```

Six Component Sets, each with hundreds of variants. Don't try to merge
families into one set — Figma's variant system can't switch a T3 mode lock
per-variant; the lock is per Component Set.

## Variant explosion — when to push back

Variant count grows multiplicatively. A naive "add Loading + Selected +
Compact axes" can blow up from 384 → 6,144 variants. Figma slows down. The
file gets unmanageable.

Tactics:
- **Strip impossible combinations.** Disabled + Hover doesn't exist.
- **Use boolean axes only for orthogonal toggles** that genuinely apply to
  every other variant.
- **Move per-instance state out of variants** when it can live in a component
  property (text, icon swap, boolean) instead.
- **Skip rare states in Figma** — production CSS handles them (e.g., we don't
  wire per-zone hover on split-button into Figma; designers assemble it).
