# Slot & Padding Model — Single-Zone Components

This is the model for components with **one click target / one content area**:
button, input, textarea, badge, chip, tag, avatar, icon-button.

For components with multiple addressable zones (split-button, menu-button,
segmented), see [multi-zone-model.md](./multi-zone-model.md). Read this doc
first — multi-zone builds on these rules.

## The three slot rules

A single-zone component has a structure like:

```
ROOT (auto-layout, horizontal, gap=0, padding=0)
├── leading-pad   (auto-layout wrapper)
├── icon-leading  (slot)
├── inner-gap-1   (auto-layout wrapper)
├── label         (slot)
├── inner-gap-2   (auto-layout wrapper)
├── icon-trailing (slot)
└── trailing-pad  (auto-layout wrapper)
```

The three rules that make this work:

### Rule 1 — Root has gap=0 and padding=0

The root container uses `itemSpacing: 0` and `padding: 0` on all sides.
**All space comes from explicit padder children**, never from the root.

Why: the root must work for every combination of slots present/absent. If
the root has padding-inline=12, an icon-only button with no leading-pad child
gets 12px of dead space before its icon — which doesn't match design.

### Rule 2 — Wrappers own outer-edge padding only

Each slot wrapper handles **only one edge** of padding:
- `leading-pad`: padding-inline-start
- `trailing-pad`: padding-inline-end
- `inner-gap-N`: gap between adjacent content slots
- Content slots themselves: padding=0, just the icon/text node

Single-edge ownership means hiding a slot (component property) hides its
padder too, and the layout collapses cleanly.

### Rule 3 — Padding bindings auto-derive from slot position

The plugin computes which variable to bind to each padder based on its slot
position:
```js
leadingPad.paddingInlineStart  = bind('button/default/padding-inline-start');
trailingPad.paddingInlineEnd   = bind('button/default/padding-inline-end');
innerGap.paddingInlineStart    = bind('button/default/gap');
```

Designers don't manually wire each padder. The slot position implies the
binding, and the master generator does it deterministically. **This is what
prevents the "I changed gap and only some buttons updated" bug.**

## Icon-only — the symmetric padding pattern

When a component variant has only an icon and no text (icon-button, close
button on a tag), the leading and trailing padding usually need to be
**equal AND smaller** than the text-button padding — so the icon sits
visually centered.

Solution: a separate variable.
```
button/icon-only/padding-inline   = 12   // both sides
button/default/padding-inline-start = 16
button/default/padding-inline-end   = 16
```

The icon-only variant rebinds both leading-pad and trailing-pad to the
icon-only token.

## Centering and vertical rhythm

For elements that must be vertically centered inside an absolute or
relative-positioned container (focus rings, loading overlays):

```css
/* GOOD */
position: absolute;
inset: 0;
margin-block: auto;

/* BAD — conflicts with hover/active scale transforms */
top: 50%;
transform: translateY(-50%);
```

The `margin-block: auto` pattern composes with `transform: scale(0.95)` on
:active without layout jumps.

## Min tap target

WCAG requires 44×44px minimum interactive area. For small variants where the
visual size is smaller (e.g., 28px chip), **add invisible padding** rather
than enforcing visual height:

```css
.chip {
  padding-block: max(0px, calc((44px - var(--chip-height)) / 2));
}
```

The visual height stays at 28px; the hit area is 44px.

## Progressive spacing — tiered gaps

Fixed pixel gaps look wrong across a 10-step size scale:
- 2px gap at 16px height = 12.5% of height ✅
- 2px gap at 52px height = 3.8% of height ❌ (cramped)

Use **tiered gaps mapped to size ranges**:
```
sizes micro–small   → gap = 2px
sizes base–large    → gap = 3px
sizes big–ultra     → gap = 4px
```

Or compute via calc against the size scale. Don't ship a single hardcoded
value across all sizes.

## Focus ring placement

For single-zone components, `:focus-visible` directly on the root works
because the root IS the focus target.

```css
.btn:focus-visible {
  outline: 2px solid var(--btn-focus-outline-color);
  outline-offset: 2px;
}
```

For multi-zone, the focus target is an inner zone but the visual ring may
need to wrap the outer wrapper. See
[multi-zone-model.md](./multi-zone-model.md) for the
`:has(:focus-visible)` pattern.

## Surface tokens — visibility checklist

- `cm-bg` tokens are nearly invisible against many page backgrounds. For
  visible neutral fills (e.g., outlined button on a neutral page), use
  outline-level tokens or step up to a stronger neutral.
- Filled variants need `--{prefix}-on-component-content` for foreground —
  white in both themes, except warning (dark text against amber).
- Shadow `xs` (5% opacity) is invisible. Use `sm` minimum for actual depth
  separation (toggle thumbs, switches, dropdown panels).

## Demo page checklist

A demo page must show each axis explicitly:
- One row per Type per Family for visual scan
- A state matrix (Default/Hover/Pressed/Focus/Disabled) per Type
- A size scale strip
- A boolean axis comparison (Rounded on/off side-by-side)

Wrap all matrix sections in a row with explicit padding (24/32) and a
border. The shared `.sub-label` class brings its own padding — override when
nested in a padded row.

## Pre-flight checklist before saying "done"

- [ ] Root has gap=0, padding=0
- [ ] Every padder owns exactly one edge
- [ ] All padders bind to a variable, not a literal
- [ ] Icon-only variant has its own symmetric padding token
- [ ] All 7 axes considered (Shape, Dimension, Surface, Typography, Slots,
      Motion, A11y)
- [ ] Focus uses `:focus-visible` (not `:focus`)
- [ ] Min tap target ≥ 44×44 (visual or invisible padding)
- [ ] No unitless `0` in any custom property
- [ ] No hardcoded `white` — use `--color-fixed-white`
- [ ] Public token override surface documented in tokens.css
- [ ] Internal `--_xx-*` switches used; state selectors don't reference
      public tokens directly
