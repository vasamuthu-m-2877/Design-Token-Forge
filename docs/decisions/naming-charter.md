# Naming Charter — Design Token Forge

**Status:** Locked. Lock date: 2026-05-26.
**Enforcement:** `pnpm audit:naming` fails on any violation. Manifest generator + audit script encode this charter.

This file is the **single source of truth** for vocabulary across all DTF surfaces:

| Surface | Examples |
|---|---|
| Component CSS tokens | `--btn-filled-bg-pressed` |
| Component CSS selectors | `.btn:active`, `[data-variant="filled"]`, `[data-role="brand"]` |
| Semantic CSS tokens | `--brand-component-bg-pressed` |
| Sync server → Figma | `component/bg-pressed`, `button/height` |
| Figma variables | `Button / Filled / bg-pressed` |
| Editor v2 UI | "Pressed" state label, "Filled" variant pill |

Inconsistency between layers breaks the editor handoff, breaks Figma bindings, and breaks designer-developer trust. **Do not introduce new vocabulary without amending this charter.**

---

## 1. State Suffixes (token-name layer)

Used as a trailing suffix on a token name: `--{prefix}-{property}-{state}`. The suffix is **independent** of the CSS pseudo-class that drives it — they may have different names where convention requires.

| Suffix | Driver (pseudo/attr) | Notes |
|---|---|---|
| _(none)_ | _(default)_ | Default state is unsuffixed: `--btn-filled-bg` |
| `-hover` | `:hover` | |
| `-pressed` | `:active` | **Note: pseudo is `:active`, token suffix is `-pressed`.** Mirrors semantic layer, sync server, Figma. |
| `-disabled` | `:disabled` / `[data-disabled]` / `[aria-disabled="true"]` | |
| `-focus` | `:focus-visible` | Always `:focus-visible`, never `:focus`. |
| `-checked` | `:checked` / `[aria-checked="true"]` | |
| `-open` | `[data-open]` / `[aria-expanded="true"]` | |
| `-selected` | `[aria-selected="true"]` | |
| `-readonly` | `:read-only` | |
| `-invalid` | `:invalid` / `[aria-invalid="true"]` | aka error. JS hook: `el.setAttribute('aria-invalid','true')` — **never** `el.dataset.error`. |
| `-loading` | `[data-loading]` | |
| `-strong` | _(tier marker)_ | Elevated/raised variant — NOT a state, but a depth tier. |

### Forbidden state suffixes

- ❌ `-active` (use `-pressed`)
- ❌ `-focus-visible` (use `-focus`)
- ❌ `-error` (use `-invalid`) — system-wide sweep completed 2026-05-26 via `scripts/rename-error-invalid.cjs`. JS hook `el.dataset.error` → `el.setAttribute('aria-invalid', 'true')`. CSS selector `[data-error]` → `[aria-invalid="true"]`.

---

## 2. Size Suffixes (density tier)

Always appears in this order, low → high:

```
micro · tiny · small · base · medium · large · big · huge · mega · ultra
```

Each component declares its own per-size tokens: `--btn-height-base`, `--btn-padding-x-large`, etc. The default density is `base`. **Do not invent new size names** (no `xs`, `sm`, `md`, `lg`, `xl` at the component layer).

---

## 3. Variant Names (structural)

```
filled · outlined · soft · ghost
```

Token form: `--{prefix}-filled-bg`, HTML form: `data-variant="filled"`. The default variant is `filled` (unsuffixed selector should also match `filled`).

### Archetype-specific additions

- **Text-input archetype** (`input`, `textarea`, `select`) may additionally support `underline` as a 5th variant for borderless single-line treatment. Token form `--{prefix}-underline-*`, HTML `data-variant="underline"`.
- **Tooltip** uses its own role-shaped variant vocabulary (`info`, `success`, `warning`, `danger`, `light`) since the surface IS the content. These are NOT to be confused with `data-role`.
- **Slider** ships `soft` only by design (track is always a tinted container surface).

### Forbidden variant names

- ❌ `primary`, `secondary`, `tertiary` (renamed to `filled`, `outlined`, `soft` in the orthogonal API migration)
- ❌ `outline` (use `outlined` — the structural variant is an adjective, not a noun; `outline-*` as a property prefix is reserved for the focus-ring CSS property)

---

## 4. Role Names (semantic)

```
brand · danger · warning · info · success · neutral
```

Token form: `--{role}-component-bg-default` (semantic layer), or remapped via `data-role="{role}"` at the component layer. The default role is `brand`.

### Forbidden role names

- ❌ `primary` (use `brand`)

---

## 5. Property Vocabulary

| Property | Token form | Used for |
|---|---|---|
| Background fill | `bg` | `--btn-filled-bg`, `--brand-component-bg-default` |
| Foreground / text | `fg` | `--btn-filled-fg` |
| Text on filled surface | `on-component` | `--brand-on-component` (auto-AA derived) |
| Text on tinted container | `on-container` | `--brand-on-container` |
| Border color | `border-color` | `--btn-filled-border-color-hover` |
| Border width | `border-width-{t\|r\|b\|l}` | Per-edge declarations |
| Border style | `border-style` | |
| Outline (focus ring) | `outline-{color\|width\|style\|offset}` | |
| Shadow | `shadow` | `--btn-shadow-strong` |
| Radius | `radius` | `--btn-radius-base` |
| Opacity | `opacity-{state}` | `--btn-filled-opacity-disabled` |
| Height | `height-{size}` | `--btn-height-base` |
| Min/max dim | `min-width-{size}`, `max-width` | |
| Padding axes | `padding-{x\|y\|inline\|block}-{size}` | |
| Gap | `gap-{size}` | |
| Tap target | `min-tap-target` | |
| Icon slot | `icon-{size\|color\|gap\|pad}` | |
| Loader slot | `loader-{color\|speed}` | |

### Forbidden property names

- ❌ `background`, `background-color` (use `bg`)
- ❌ `color`, `foreground`, `text-color` (use `fg`)

---

## 6. Component Prefix

Each component owns a prefix used for ALL its public + private tokens.

| Component | Prefix |
|---|---|
| Button | `btn` |
| Split Button | `split-btn` |
| Icon Button | `icon-btn` |
| Menu Button | `menu-btn` |
| Toggle | `toggle` |
| _(others)_ | full name, hyphenated |

Internal bridge variables use a leading underscore: `--_btn-bg`, `--_split-btn-fg`.

---

## 7. HTML Attribute Vocabulary

| Attribute | Values | Notes |
|---|---|---|
| `data-variant` | `filled`, `outlined`, `soft`, `ghost` | Structural treatment |
| `data-role` | `brand`, `danger`, `warning`, `info`, `success`, `neutral` | Semantic color role |
| `data-size` | size tier name | `base` default; can be omitted |
| `data-rounded` | _(boolean presence)_ | Forces `--{prefix}-radius-rounded` |
| `data-strong` | _(boolean presence)_ | Elevation tier |
| `data-loading` | _(boolean presence)_ | Pulse animation |
| `data-disabled` | _(boolean presence)_ | Wrapper-level disabled |
| `data-open` | _(boolean presence)_ | Disclosure components |
| `data-icon-detail` | `default`, `high` | Icon glyph density |

### Forbidden HTML attribute values

- ❌ `data-variant="primary\|secondary\|tertiary"`
- ❌ `data-variant="outline"` (use `data-variant="outlined"`)
- ❌ `data-role="primary"`

---

## 8. Figma Naming

Sync server emits Figma variables with `/`-separated paths matching this charter. Examples:

```
component/bg-pressed                  ← semantic primitive
button/height                         ← comp-size variable (per-density)
button/radius-rounded                 ← comp-constant variable
brand/component/bg-default            ← semantic role-scoped
```

The Figma plugin **NEVER deletes and recreates variables** — variable IDs are preserved across token-value updates. See `/memories/css-design-system-lessons.md` ("Figma Variable Sync") for the why.

---

## 9. Editor v2 Labels (UI strings)

When the editor displays a state, variant, or role to the user, **the label must match this charter**.

- "Pressed" not "Active"
- "Filled" not "Primary"
- "Brand" not "Primary"
- "Soft" not "Tertiary"

---

## 10. Enforcement

| Check | Tool |
|---|---|
| Forbidden tokens/attrs/labels | `pnpm audit:naming` |
| Token alias resolution | `pnpm audit:primitives` |
| Cross-layer parity | `pnpm gen:manifests` (per-component `gaps` field) |
| 7-axis coverage | `pnpm audit:gold` |

Add a new vocabulary item → update this file → add an audit rule → regenerate manifests.
