# Multi-Zone Model — Split / Menu / Segmented / Breadcrumb

This is the contract for components with **two or more independently
addressable zones** sharing one outer wrapper:

- **Split button** — primary action zone + chevron menu zone
- **Menu button** — label zone + chevron zone (no division of action; whole
  thing opens menu)
- **Segmented control** — N equal zones, one selected at a time
- **Breadcrumb item** — link zone + separator + next link zone (chained)
- **Input with addon** — input zone + button zone

Read [slot-padding-model.md](./slot-padding-model.md) **first**. Multi-zone
components are made of single-zone children plus the rules below.

## Decision contract (Q1–Q7)

These are the user-confirmed answers, codified. Don't relitigate without
explicit re-discussion.

### Q1 — Slot model: **Option B (nested zones)**

A multi-zone component is **two or more single-zone children** inside a
neutral wrapper, with sibling **divider nodes** between them.

```
WRAPPER (auto-layout, horizontal, gap=0, padding=0, overflow:hidden)
├── ZONE-1 (full single-zone component, e.g., a button-master instance)
├── DIVIDER (sibling node — see Q3)
└── ZONE-2 (full single-zone component)
```

NOT chosen: Option A (single component with internal slots).
Why Option B won: zones get all single-zone behavior for free (states,
variants, focus, padding rules). Plugin code stays composable.

### Q2 — Padding tokens

Multi-zone introduces **structural-only** tokens that don't exist on
single-zone components:

| Token | Owns | Example value |
|---|---|---|
| `{prefix}/zone-padding-outer` | Wrapper's padding around zones (usually 0) | `0` |
| `{prefix}/zone-padding-divider` | Distance from each zone's inner edge to the divider | `0` (zones butt up to divider) or small (e.g., 4) |
| `{prefix}/divider-padding-x` | Divider's own inline padding | `0` |
| `{prefix}/divider-thickness` | Divider node width (vertical divider) | `1` |
| `{prefix}/divider-color` | Divider fill | T2 separator token |

Inheritance rules (see Q6):
- Each ZONE inherits all `--btn-*` tokens by default
  (`--split-btn-zone-bg-default: var(--btn-bg-default)`)
- Structural tokens above are **owned by the multi-zone component**
  (no inheritance — they don't exist on button)

### Q3 — Divider as sibling node, not border

The divider is a **separate Figma node** between zones, not a `border-right`
on the left zone. Reasons:
- Clean color binding (divider gets its own variable)
- Visible regardless of which zone is hovered/pressed
- Consistent thickness across states (border collapse rules don't apply)
- Easier to toggle on/off via boolean axis

CSS uses an actual `<span class="split-btn__divider">` element (or `::after`
pseudo on the wrapper). NOT `border-inline-end` on the left zone.

### Q4 — Outer corners rounded; inner corners always 0; wrapper clips

The four **outer corners** of the wrapper bind to the rounded radius
(`button/default/radius` or `button/radius-rounded` per the Rounded boolean).

The **inner corners** where zones meet are **always 0**. Zones may visually
have radius (because they're button instances), but the wrapper has
`overflow: hidden` which clips the protruding corners cleanly.

Implementation:
```css
.split-btn { overflow: hidden; border-radius: var(--_split-btn-radius); }
.split-btn__zone:first-child { border-end-end-radius: 0; border-start-end-radius: 0; }
.split-btn__zone:last-child  { border-end-start-radius: 0; border-start-start-radius: 0; }
```

Plugin: on the wrapper, set the four corner-radius bindings; on each zone
instance, override only the inner corners to `0`.

### Q5 — Boolean axes: start with Rounded only

Don't preemptively add Divider on/off, Compact, etc. Add Rounded (it's
universal across button family). Add others ONLY when a real demand appears.

This keeps variant count manageable. A split-button with 4 Types × 6 States
× 10 Sizes × 2 Rounded = 480 variants per family. Adding one more boolean
doubles that.

### Q6 — Inheritance for design tokens, duplication for structural

```css
:root {
  /* Design tokens — inherit from base */
  --split-btn-bg-default:        var(--btn-bg-default);
  --split-btn-content-default:   var(--btn-content-default);
  --split-btn-outline-default:   var(--btn-outline-default);
  --split-btn-height:            var(--btn-height);
  --split-btn-radius:            var(--btn-radius-base);
  --split-btn-radius-rounded:    var(--btn-radius-rounded);

  /* Structural tokens — owned, no inheritance */
  --split-btn-divider-thickness: 1px;
  --split-btn-divider-color:     var(--default-component-separator);
  --split-btn-zone-padding-x:    var(--btn-padding-inline-end);
  --split-btn-divider-padding-x: 0px;
}
```

**Why split:** customizing `--btn-bg-default` should propagate to
split-button automatically (single source of truth for color). But the
divider doesn't exist on plain button — it's a property only of multi-zone,
so it lives in `--split-btn-*` only.

### Q7 — Reactions stay at ~6 representative states

Don't multiply Figma reactions by per-zone hover. The split-button doesn't
need 36 states (6 × 6) for "primary-zone-hover × chevron-zone-default" etc.

Reactions in Figma are **sketch-level**. Real per-zone hover is a runtime
concern; production CSS handles it via `:hover` on each zone independently.

Wire the same 6 states (Default, Hover, Pressed, Selected, Focus, Disabled)
where Hover/Pressed apply to the **whole component**.

## Focus ring — the `:has(:focus-visible)` pattern

Because the wrapper has `overflow: hidden`, a focus ring on an inner zone
gets clipped. Solution: the wrapper renders the ring when **any** inner
zone is focused.

```css
.split-btn:has(:focus-visible) {
  outline: 2px solid var(--split-btn-focus-outline-color);
  outline-offset: 2px;
}
.split-btn__zone:focus-visible {
  outline: none;  /* delegated to wrapper */
}
```

Each zone is still independently focusable by keyboard (Tab moves
zone-to-zone), but the visual ring is on the outer wrapper.

This requires `:has()` support — fine for our target browsers (2023+).

## Disabled state

Disabled is **per-zone OR whole-component**, depending on use case:
- Split button — primary zone may be disabled (no permission) while chevron
  stays enabled (still show menu of context options)
- Menu button — single concept, disable the whole thing

Implement at the zone level. The wrapper inherits the disabled visual when
`:has(:disabled)` matches all interactive zones, OR each zone shows its own
disabled state.

## Variant generation pattern

```js
// Per family per master
for (const Type   of types)
for (const State  of states)
for (const Size   of sizes)
for (const Rounded of [false, true]) {
  const wrapper = createSplitButtonWrapper(Type, State, Size, Rounded);
  wrapper.appendChild(makeButtonZone({ kind: 'primary',  Type, State, Size, Rounded, innerCorners: 'right-zero' }));
  wrapper.appendChild(makeDivider({ Type, State }));
  wrapper.appendChild(makeButtonZone({ kind: 'chevron',  Type, State, Size, Rounded, innerCorners: 'left-zero' }));
}
```

Each zone is a button **master instance** with overrides — not a duplicated
master. This keeps maintenance to one place.

## Testing checklist

- [ ] Outer wrapper has 4 corner-radius bindings (square + rounded variants)
- [ ] Inner corners on each zone explicitly set to 0
- [ ] Wrapper has `overflow: hidden`
- [ ] Divider is a sibling node, not a border
- [ ] Divider color binds to a T2 separator token
- [ ] Focus ring uses `:has(:focus-visible)` on wrapper
- [ ] Each zone is independently keyboard-focusable
- [ ] Inheritance for design tokens (`--split-btn-bg: var(--btn-bg-…)`)
- [ ] Structural tokens duplicated, not inherited
- [ ] Reactions wired for ~6 component-level states only
- [ ] Variant count sanity-checked before generating (kill axes if >2k)

## Anti-patterns

❌ **Internal slots in one component** (Option A) — produces unmaintainable
master with conditional padding rules per "is divider visible?".

❌ **Border on left zone as divider** — fights state changes; thickness
flickers across hover; no clean color binding.

❌ **Rounded inner corners** — looks like puzzle pieces. Always inner = 0.

❌ **Per-zone variants in Figma** (4 Types per zone × 4 per other zone = 16
combos) — variant explosion. Zones are instances; their overrides happen at
runtime, not in the variant matrix.

❌ **Hardcoding `--split-btn-bg-default: #fff`** — always inherit from
`--btn-bg-default` so theme overrides propagate.
