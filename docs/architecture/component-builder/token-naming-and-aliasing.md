# Token Naming and Aliasing

The naming rules below are non-negotiable. Drift here causes the silent-fill
class of bug we saw on button (Default-state variants with empty fills).

## Naming structure

```
{layer}/{category}/{property}-{state?}
```

| Part | Allowed | Examples |
|---|---|---|
| **layer** | `default`, `container`, `component`, … (per surface) | `default/`, `component/` |
| **category** | `bg`, `outline`, `content`, `surfaces`, `separator` | `/bg`, `/outline` |
| **property** | optional sub-key | `/oncomponent-content` |
| **state** | `-default`, `-hover`, `-pressed`, … | `-default`, `-hover` |

## The `-default` suffix rule

**State suffixes are mandatory and symmetric.** If you have `-hover` and
`-pressed`, you also need `-default`. Bare names without a suffix are forbidden.

```
✅ default/component/bg-default
✅ default/component/bg-hover
✅ default/component/bg-pressed
✅ default/component/outline-default

❌ default/component/bg          (missing -default)
❌ default/component/outline     (missing -default)
```

**Why:** the BLUEPRINT in `code.js` references `bg-default` for the Default
state. If the variable is named `bg` (no suffix), `resolveColorSpec` returns
null and the variant binds nothing. The result: invisible filled buttons.

The plugin self-heals legacy names on every run (Step 2a in `code.js`). Add
new aliases to that list when extending the rule to new variables.

## Component-level token names

```
--{prefix}-{property}                   public override surface
--{prefix}-{variant}-{property}         per-variant override
--{prefix}-{role}-{property}-{state?}   per-role per-state override
--_{prefix}-{property}                  internal switching variable
```

Examples (button):
```
--btn-radius-base               size scale
--btn-radius-rounded            boolean toggle target
--btn-primary-bg-default        role × state
--btn-focus-outline-color       a11y token
--_btn-radius                   internal — switched by [data-rounded] etc
--_btn-bg                       internal — switched by [data-variant]
```

The `--_xx` underscore prefix marks internal-only. **State selectors never
reference public tokens directly** — they update the internal switch and the
internal switch reads the public token.

```css
/* GOOD — state selector updates the internal switch */
.btn[data-variant="primary"] { --_btn-bg: var(--btn-primary-bg-default); }
.btn[data-variant="primary"]:hover { --_btn-bg: var(--btn-primary-bg-hover); }
.btn { background: var(--_btn-bg); }

/* BAD — state selector hardcodes the public token */
.btn[data-variant="primary"] { background: var(--btn-primary-bg-default); }
.btn[data-variant="primary"]:hover { background: var(--btn-primary-bg-hover); }
```

The bad pattern means `:hover` overrides the `background:` rule, which means
`background:` can't be customized via internal switching for any other axis
(loading, selected, etc.).

## Aliasing across files

Different project files use different naming conventions:
- Older: `button/height` (2 segments)
- Newer: `button/default/height` (3 segments)

The plugin runs an aliasing pass (Step 2b in `code.js`) that registers both
forms in the lookup map. **Use the 3-segment form in BLUEPRINT** — the alias
covers the 2-segment case.

## When you change a primitive

A change in `--blue-500` cascades through:
- T1 → all brand-* tokens
- T2 → all surface tokens that reference brand
- Component tokens that resolve to `--brand-*`
- Surfaces files (deterministic generation from palette steps)

**Always re-run** `scripts/orphan-analysis.cjs` after primitive changes to
verify no token is left as a hardcoded hex value. A 2-file deploy that skips
surfaces leaves orphans.

## Color tokens — common pitfalls

- **Never hardcode `white`.** Use `--color-fixed-white` (theme-immune).
- **`cm-bg` tokens are nearly invisible** on many backgrounds. For visible
  neutral fills, use outline-level tokens.
- **`on-component` tokens** (e.g., `--primary-on-component`) are for content
  on filled surfaces — white in both themes, except warning (dark text for
  amber contrast).

## Spacing and dimension tokens

- Use `calc()` to derive values, not extra tokens.
  `padding-block: calc(var(--btn-height) - var(--btn-text-height) / 2)`
- **Never use unitless `0`** in custom properties feeding `calc()` —
  `calc(18px - 0)` is invalid because `0` is `<number>`, not `<length>`.
  Always write `0px`.
- For spacing scales, prefer **tiered gaps mapped to size ranges** (2px small,
  3px medium, 4px large) over a fixed pixel gap that doesn't scale.

## Renames

See [figma-binding-rules.md](./figma-binding-rules.md) for the
**update-in-place vs delete-and-recreate** rule. TL;DR: rename a variable in
place; never delete and recreate or you sever every component binding.
