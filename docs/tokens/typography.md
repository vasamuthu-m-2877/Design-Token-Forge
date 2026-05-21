# Typography Token System

The Tt (Type) tier of Design Token Forge. Lets a product team pick a
font pairing, scale density, and push the result to both web (CSS
custom properties) and Figma (variables in the `font/` collection) from
a single source of truth: each project's `config.json`.

This document is the contract between the editor (`demo/editor-v2/`),
the sync server (`packages/sync-server/`), and any DTF consumer
reading published projects.

---

## 1. Token surface

All typography tokens are T0 primitives. There are no T1 typography
roles today — components reference primitives directly. The shipped
token set per project:

| Token                          | Type    | Example value                          | Notes                                                       |
| ------------------------------ | ------- | -------------------------------------- | ----------------------------------------------------------- |
| `--font-family-headline`       | STRING  | `Inter, system-ui, sans-serif`         | Full CSS stack with fallbacks. Used for h1–h3, page titles. |
| `--font-family-body`           | STRING  | `Inter, system-ui, sans-serif`         | Paragraphs and UI labels.                                   |
| `--font-family-code`           | STRING  | `"JetBrains Mono", "SF Mono", monospace` | `<code>`, `<pre>`, numeric tabular data.                  |
| `--font-size-{N}`              | LENGTH  | `14px`                                 | 13 rungs: 10, 11, 12, 13, 14, 16, 18, 20, 24, 26, 28, 32, 40. Density-scaled. |
| `--font-weight-{name}`         | NUMBER  | `400`                                  | 5 rungs: regular, medium, semibold, bold, extrabold.        |
| `--line-height-{name}`         | NUMBER  | `1.5`                                  | 5 rungs: tight, snug, normal, relaxed, loose. Only `normal` is density-scaled. |
| `--letter-spacing-{name}`      | em → %  | `-0.025em`                             | 6 rungs: tighter, tight, normal, wide, wider, widest. Sync server converts em → percent at the Figma boundary. |

> **Total:** 3 family + 13 size + 5 weight + 5 line-height + 6 letter-spacing = **32 tokens** per project (light mode only — typography does not mode-split).

---

## 2. The `typographyConfig` shape in `config.json`

```jsonc
{
  "typographyConfig": {
    "preset": "editorial-serif",          // required: one of the 5 preset ids, or "custom"
    "density": "compact",                 // optional: "compact" | "base" | "comfortable" (default "base")
    "overrides": {                        // optional: per-role family overrides on TOP of preset
      "code": "Roboto Mono"
    },
    "custom": {                           // optional: only meaningful when preset === "custom"
      "headline": "Playfair Display",
      "body":     "Inter"
      // code intentionally omitted → no font-family-code token shipped
    }
  }
}
```

### Field precedence (per role)

For each of `headline`, `body`, `code`:

1. `overrides[role]`  — strongest
2. `custom[role]`     — only when `preset === "custom"`
3. `preset.fonts[role]` — fallback for non-custom presets

If all three are empty for a role, **no `--font-family-{role}` token is
emitted**. Components fall back through their own CSS chain. This is
intentional for the `custom` preset — it lets a designer ship two
roles without forcing a placeholder on the third.

### Density

`density` scales:
- **All font-size rungs** by a fixed multiplier:
  - `compact`     → ×0.92
  - `base`        → ×1.00  (no change)
  - `comfortable` → ×1.08
- **Only `--line-height-normal`** retunes to:
  - `compact`     → 1.375
  - `base`        → 1.5
  - `comfortable` → 1.625

The other line-height rungs (tight/snug/relaxed/loose) keep their
absolute values because they are explicit designer choices, not
density-derived.

> Token **names** never change — `--font-size-14` is always called
> `font-size-14`, even when its value drops to 12.9px under compact.
> This keeps existing component aliases (`var(--font-size-14)`) valid.

---

## 3. The five presets

Defined in `packages/sync-server/typography-presets.js`. The editor
mirrors the same data in `demo/editor-v2/editor-v2.js` (`TYPO_PRESETS`).
If you add a preset, update **both** files.

| `id`                | Headline      | Body  | Code           | Install lane |
| ------------------- | ------------- | ----- | -------------- | ------------ |
| `neutral-system`    | System UI     | System UI | SF Mono     | All system — designers need nothing extra. |
| `modern-geometric`  | Inter         | Inter | JetBrains Mono | Google — designers must install in Figma. |
| `editorial-serif`   | Fraunces      | Inter | IBM Plex Mono  | Google. |
| `friendly-humanist` | Nunito        | Nunito | Source Code Pro | Google. |
| `code-first-mono`   | SF Mono       | SF Mono | SF Mono       | All system. |

The `custom` preset id is reserved for designer-supplied families
(see `custom` field above).

---

## 4. Editor → sync server → Figma flow

```
demo/editor-v2 (Tt tier UI)
    ↓ user picks preset / density / overrides
    ↓ Live preview: postMessage('typo', cssBundle) → preview.html
    ↓ Persist working state: localStorage 'dtf-typo-overrides-<projectId>'
    ↓ Click "Publish N changes"
    ↓ buildConfigJSON() writes typographyConfig → config.json (committed to repo)
    ↓
packages/sync-server (file watcher)
    ↓ fs.watchFile(projects/<id>/config.json)
    ↓ loadProjectOverrides() → generateTokenOverrides()
    ↓   → generateTypographyTokens(cfg.typographyConfig)
    ↓ rebuildTokens('configchange') → currentData
    ↓
Figma Plugin
    ↓ Hit "Update Variables"
    ↓ POST /tokens → reads currentData
    ↓ Updates font-family-*, font-size-*, … by ID (never delete+recreate)
```

### Key guarantees

- **No restart on publish.** The sync server watches `config.json`, so
  designers see Figma update within ~500ms of the editor publishing.
- **Bindings survive.** Variables are updated in-place by Figma ID, not
  recreated. Existing component bindings never break across edits.
- **Web and Figma stay in lockstep.** The editor's `typoStackFor()` is
  mirrored in the sync server (`generate-from-config.js`). Both
  produce identical font-family stacks for any bare family name.

---

## 5. Density semantics (why only `line-height-normal` retunes)

Density is a *body-text-comfort* knob. It maps to two real-world
designer intents:

| Intent                          | density        | Body 13px → | Body LH      |
| ------------------------------- | -------------- | ----------- | ------------ |
| Data-dense admin / file browser | `compact`      | 11.96px     | 1.375        |
| Default product UI              | `base`         | 13px        | 1.5          |
| Content-heavy reading app       | `comfortable`  | 14.04px     | 1.625        |

The other line-height rungs are explicit overrides a designer
chooses for specific contexts (`--line-height-tight` for headlines,
`--line-height-loose` for hero copy). Re-scaling them under density
would override the designer's intent. Only the default body rung
(`normal`) follows density.

---

## 6. Adding a typography token

If you need a new rung (e.g. `--font-size-44`):

1. Add the rung to `TYPOGRAPHY_LADDER.sizes` in
   `packages/sync-server/typography-presets.js`.
2. Add a comp-size alias only if a component actually consumes it —
   never add primitives nobody uses (see
   `scripts/audit-primitive-aliases.cjs`).
3. The editor reads sizes from the preset config dynamically — no
   editor change required for a new size.
4. Run `pnpm audit:primitives` to confirm no broken `var(--font-size-N)`
   references exist.

For a new font-family role (rare — three roles cover essentially all
products), the change surface is larger: editor `TYPO_ROLES`, sync
server `generateTypographyTokens`, the editor's resolved-fonts +
install-bucket logic, and the install dialog all need the new role
added. Treat this as a Phase 2 feature.

---

## 7. Known limitations (Phase 1)

- **No `.woff2` upload.** The `custom` preset takes a family name
  string but does not yet ship `@font-face` declarations. Designers
  who use a private font must self-host it and ensure the family name
  matches.
- **No per-mode typography.** The system emits light-mode tokens only.
  If a future product needs different fonts in dark mode (very rare),
  the sync server's `dark: {}` is the extension point.
- **No T1 typography roles.** Components reference primitives directly.
  If we add roles (e.g. `display`, `caption`), they go between
  primitives and components, not as new primitives.
