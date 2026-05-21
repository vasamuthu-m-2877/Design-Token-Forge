    # UI Consistency — Editor v2 + Demo Pages

A **living checklist** of the canonical UI vocabulary, chrome, microcopy, and class-naming
patterns used across Design Token Forge. The goal is to keep T0/T1/T2/T3 (and the wider
editor + demo surface) speaking the same language so users learn it once.

> **How to use this doc**
> 1. Before adding a new label, button, badge, or chrome element, scan §2–§6 for the
>    canonical term/pattern. Reuse it.
> 2. When you ship a new pattern that isn't covered here, **add a row to the relevant
>    section in the same PR**. Don't let drift accumulate.
> 3. Treat `[ ]` rows as work-in-progress; `[x]` rows are settled and shouldn't be
>    revisited without a decision record.
> 4. Audit cadence: run §10 *Audit commands* before every release.

---

## 1. Tier vocabulary (canonical)

| Internal id | Display name | UI label                  | Description                          |
|-------------|--------------|---------------------------|--------------------------------------|
| `t0`        | Palette      | "Palette" / "T0 Palette"  | 22-step neutral + role ladders       |
| `t1`        | Roles        | "Roles" / "T1 Roles"      | Per-role fill / content / container  |
| `t2`        | Surfaces     | "Surfaces" / "T2 Surfaces"| 8 surface presets × 16 tokens        |
| `t3`        | Components   | "Components" / "T3 …"     | (Not yet shipped — Step 7)           |

- Code uses **lowercase shorthand** (`t0`, `t1`, …). Display strings use **Title Case**.
- Don't introduce synonyms ("Palette" not "Colors", "Roles" not "Brand Roles", "Surfaces"
  not "Backgrounds").

### 1a. T0 sub-views (canonical)

The T0 Palette tier has two pivots on the same underlying data — name them for the
end-user task, not the data shape.

| Internal id | UI label          | Purpose                                                                |
|-------------|-------------------|------------------------------------------------------------------------|
| `roles`     | **Key colors**    | Pick the seed hex for each role (brand, danger, success, warning, info)|
| `palettes`  | **Palette library** | Inventory + CRUD for all palettes that T2 surfaces can map to        |

- Don't use "By role" / "By palette" — too abstract for first-time users.
- Don't say just "Palettes" — collides with the parent tier name "Palette".

## 2. Role + mode vocabulary

- **Roles** (canonical id / display label):
  `brand` / `Brand`, `danger` / `Danger`, `warning` / `Warning`,
  `info` / `Info`, `success` / `Success`, `neutral` / `Neutral`.
- **Modes**: `light` / `dark` in code, **Light** / **Dark** in UI.
- Never mix `L`/`D`, `lite`, "Day/Night", etc.
- **Levers** (T1): `fill`, `content`, `container` (lowercase ids; Title Case labels).
- **Derived T1 tokens**: `border`, `separator`, `onComponent`, `onContainer`.
- **Surfaces** (T2, ordered): `bright`, `base`, `dim`, `deep`, `accent`, `container`,
  `float`, `inverse`. Display labels are Title Case.
- **Surface → source palette** is **user-overridable** via a custom popover picker
  (grouped sections, not a native `<select>` — needed for labeled groups + separators
  + an empty-state slot for the Custom group). Two groups, both surfaced for every
  project:
  - **Default palettes** (system-level, ship with every project):
    - `greyscale` — brand-coupled, chroma 0 (true achromatic). Hue tracks brand but
      is invisible at C=0. Default for `bright`, `base`, `dim`, `deep`, `container`,
      `float`, `inverse`.
    - `desaturated` — brand-coupled, low chroma (≈0.04 OKLCH C, close to Tailwind
      `slate`). Hue tracks brand. Reads as branded gray.
    - `brand` — the project's primary hue. Default for `accent`.
  - **Custom palettes** (project-level, discovered): any `--prim-<name>-*` ladder
    in the project's `primitives.css` that isn't a system palette id (brand,
    danger, success, warning, info, greyscale, desaturated) is auto-registered
    and shown here. Writer Handhelds' "Neutral" palette surfaces this way — no
    rename, no migration. New projects with no custom palettes see an empty-state
    row explaining how to add one.

  **Status palettes are intentionally NOT offered as surface options.** `danger`,
  `success`, `info`, `warning` exist to color alerts, toasts, and status badges — not
  page backgrounds. A "Danger" page surface has no real use case and would mislead
  designers. Keep this restriction unless the use case changes.

  **The "lighting legacy" stays untouched.** Greyscale + desaturated share the
  same L* tone curve as brand (via PaletteEngine `anchor:'normalized'`). Only
  chroma differs between the three. The `--prim-{greyscale,desaturated}-*`
  ladders therefore step identically in luminance, so swapping a surface between
  them shifts only color temperature, never elevation.

  When a surface is on a non-default palette its header is marked `CUSTOM` and a Reset
  button restores the default. CUSTOM step picks on the surface **survive** a palette
  swap — the step name stays, it just resolves against the new ladder.
- **Step names** (T0 ladder, 22 entries): `white`, `25`, `50`, `100`, `200`, `300`, `400`,
  `450`, `500`, `550`, `600`, `650`, `700`, `750`, `800`, `850`, `900`, `black` (numeric steps shown as `step N`, e.g. *"step 500"*).

## 3. Action verbs (canonical)

| Intent                              | Canonical verb         | Where used                          |
|-------------------------------------|------------------------|-------------------------------------|
| Roll a single value back to default | **Reset**              | Property Card reset, tier-level     |
| Throw away the entire draft         | **Discard all**        | Save bar                            |
| Send to Figma                       | **Deploy to Figma**    | Deploy button + dialog              |
| Save to local draft                 | **Save** (auto)        | Draft autosave                      |
| Open a project                      | **Open**               | Projects panel                      |
| Confirm a destructive action        | **Discard & {action}** | Project switch modal                |
| Apply a WCAG suggestion             | **Apply**              | Inside WCAG popover                 |

- Always use **"Reset to default"** (not "Revert", "Clear", "Undo") for single-token rollback.
- Always use **"Discard"** (not "Cancel changes") for whole-draft rollback.

## 4. WCAG / contrast vocabulary

- **Grade names** (used as `data-grade` values + display text):
  - Pass — `aaa` → "✓ AAA", `aa` → "✓ AA", `aa-large` → "✓ AA-large"
  - Fail (text intent, ≥4.5:1 expected) — `fail` → "⚠ Fail"
  - Edge below 3:1 but tolerable when paired with shadow — `edge-soft` → "ⓘ" amber chip
- **Ratio format**: `X.XX:1` (two decimals, colon, no spaces) everywhere visible.
  - **Exception**: `aria-label` uses *"X.XX to 1"* for screen-reader clarity (colon is read
    as "colon"). Documented at editor-v2.js line 1768.
- **Sentinel string format** (named baseline):
  - In tooltips: `"step N • #HHHHHH · X.XX:1 (Pass|Fail)"`
  - In popover header: just `"✓ X.XX:1"`
  - When citing the token being measured against: `"vs --<role>-<token>"` (kebab-case,
    full token name, no `var()` wrapper in user-facing strings).

## 5. CSS class & data-attribute naming

- **Prefix**: every editor-chrome class starts with `.ev2-`. No exceptions in
  `editor-v2.{css,js}`.
- **Property Card primitive**: `.ev2-pc-*`. All Property Card data attributes are `data-pc-*`
  (`data-pc-tier`, `data-pc-role`, `data-pc-lever`, `data-pc-derived`,
  `data-pc-ladder-pick`, `data-pc-step`, `data-pc-reset`, `data-pc-wcag-open`, etc.).
- **Tier-specific attrs** (rare — only for things that *can't* go through the primitive):
  `data-t1-*`, `data-t2-*`.
- **Preview iframe wiring**: `data-pv-*` on preview-side elements,
  `ev2-pv-*` messages on the parent → preview postMessage channel.
- **State attrs** (canonical values): `data-state="saving|saved|error|idle"`,
  `data-show="1"` for popovers, `data-grade="aaa|aa|aa-large|fail|edge-soft"`,
  `data-pass="true|false"` for ladder steps.

## 6. Chrome tokens & hardcoded colors

- Editor chrome uses `--surface-base-*` for page bg + the **inverse** surface
  (`--surface-inverse-*`) for tooltip / toast popups.
- **Intentionally hardcoded** (editor-chrome fixed colors that must NOT inherit from the
  project's semantic tokens — same principle as `--color-fixed-white`):
  - `#1F6B33` (AAA pass), `#2F8049` (AA pass), `#C2392B` (Fail) — in `.ev2-seg-wcag`.
  - `#C2392B` — the small fail dot on `.ev2-pal-sw[data-pass="false"]::after` and the
    matching `.ev2-pc-ladder-step[data-pass="false"]::before`.
- **Rule**: if you add a new hardcoded hex, document it here with a one-line justification
  for why it can't be a token.

## 7. Microcopy patterns

- **Sentence case** for descriptive prose; **Title Case** for section headings + button
  labels.
- **No trailing period** on tooltips, button text, chip text, or any single-phrase UI
  string. Use periods only in full-sentence prose inside popovers / panels.
- **Em-dash (` — `)** for parenthetical asides.
  **Colon (`:`)** for structured key/value pairs.
- **Empty / loading / error states** — use the same construction site-wide:
  - Saving → *"Saving draft…"* (ellipsis)
  - Saved → *"Draft saved · {HH:MM}"* (middle-dot separator)
  - Error → *"Could not save · retry"*
  - Empty list → *"No {things} yet."* (sentence case, period, plural)
- **Pluralization helper** (already used in editor): `n + ' change' + (n === 1 ? '' : 's')`
  — keep this pattern; never write *"0 changes"* by hand.

## 8. Spacing, sizing, radius

- **Property Card** padding: `10px 12px` (T1 lever block, T2 surface row).
- **Ladder swatch** — context-dependent:
  - T0 main palette strip (`.ev2-pal-sw`): `height:36px` (interactive picker).
  - T0 single-step picker (`.ev2-step-sw`): `height:38px` (legacy, kept for compatibility).
  - Property Card ladder step (`.ev2-pc-ladder-step`): `aspect-ratio:1` in a 22-col grid.
  - Compact onComponent ladder: `56px × 56px` (only 2 swatches).
- **Radii**: use `var(--radius-sm,4px)` (pills, chips), `var(--radius-md,6–8px)` (cards,
  blocks), `999px` (round buttons + pill steppers).
- Micro-spacing (1–6px gaps) may be hardcoded; anything ≥ 8px should use `--spacing-*`
  tokens once a system is decided.

## 8b. Typography vocabulary (canonical)

- **Three font roles**: `headline`, `body`, `code` — same vocabulary in
  onboard cards, `typographyConfig.fonts`, and CSS (`--font-family-headline`,
  `--font-family-body`, `--font-family-code`). Never invent new role names
  per project; always pick one of the three.
- **Three source lanes** for a font: `system` (built-in OS stacks), `google`
  (Google Fonts — designer installs in their app), `custom` (designer-hosted
  file). Used in onboard chips and `font.source` in the preset JSON.
- **Preset ids** are kebab-case slugs: `neutral-system`, `modern-geometric`,
  `editorial-serif`, `friendly-humanist`, `code-first-mono`. Saved verbatim
  in `typographyConfig.preset`.
- **Size primitive naming**: `--font-size-{N}` where `N` is the integer
  pixel value (e.g. `--font-size-14`). Not `-md`, not `-sm` — numeric.
- **Weight / line-height / letter-spacing primitive naming**: descriptive,
  not numeric — `--font-weight-regular|medium|semibold|bold|extrabold`,
  `--line-height-tight|snug|normal|relaxed|loose`,
  `--letter-spacing-tighter|tight|normal|wide|wider|widest`.
- **Letter-spacing is stored in `em`** in CSS (e.g. `-0.05em`). The sync
  server converts em → percent at the Figma boundary (`-5`) so Figma's
  letter-spacing picker accepts it. Never write `%` in primitives.css.
- Designer-facing copy: say **"feel"** for preset (e.g. "Pick a starting
  feel"), **"font"** for family, **"size"** for size — never "typeface",
  "weight number", or "tracking" in UI strings (those are jargon).
- **Density** (Tt tier knob) uses three labels: `compact`, `base`,
  `comfortable` — same vocabulary in `typographyConfig.density`, CSS
  scaling tables, and the editor's segment control. UI strings:
  "Tighter UI" (compact), "Default" (base), "Easier reading"
  (comfortable). Never invent "cozy", "dense", "spacious".
- **Install lanes** in the editor's Designer Install summary use
  plain-English labels per `typoLaneFor()` output:
  - `system` → "No setup needed"
  - `google` → "Install the font in Figma"
  - `custom` → "Bring your own font file"
  Same triplet in the per-card parity badges and the install dialog.

## 9. Brand / version strings

- The product name **"Design Token Forge"** appears **only** in `<title>` and `<h1>` —
  never elsewhere in the editor chrome.
- Editor version surfaces as **"Token Editor v2 · preview"** (index.html `.ev2-title-sub`).
- Cache-bust convention: bump `?v=N` on every editor-v2 asset edit. See
  `/memories/session/editor-v2-resume.md`.

---

## 10. Audit commands (run before release)

```bash
# 1. No straggler classes (anything not .ev2-* in editor-v2.css)
grep -nE '^\.[a-z]' demo/editor-v2/editor-v2.css | grep -v '^.*\.ev2-' | head

# 2. Hardcoded hex outside the documented allow-list
grep -nE '#[0-9A-Fa-f]{3,6}\b' demo/editor-v2/editor-v2.css \
  | grep -vE '#(1F6B33|2F8049|C2392B|FFFFFF|000000|0B8D28|D61D20|fff|000)\b'

# 3. Ratio format outliers (anything other than ":1" — and the one documented "to 1")
grep -nE 'toFixed\(2\)' demo/editor-v2/editor-v2.js

# 4. Forbidden synonyms
grep -nE '\b(Revert|Undo|Clear all|Cancel changes|Backgrounds|Colors|Tints?)\b' \
  demo/editor-v2/*.{js,css,html} 2>/dev/null | grep -v '^[^:]*:[^:]*:[ ]*//'

# 5. Step-walk / step-reset (dead handlers — should be zero)
grep -nE 'data-step-(walk|reset)' demo/editor-v2/*.{js,css,html}

# 6. Tier label drift
grep -nE '\b(Tier ?[0-3]|tier-[0-3])\b' demo/editor-v2/*.{js,css,html}
```

---

## 11. Figma plugin (Design Token Forge)

The plugin at `packages/figma-plugin/` is the bridge between editor output and Figma
variables/components. Drift here is the single most common cause of "tokens look right
in the editor but broken in Figma" incidents — so the rules below are **hard rules**, not
suggestions.

### 11.1 What ships, what doesn't

- **Source of truth for the manifest is** `packages/figma-plugin/manifest.json`.
  `main: "code.js"`, `ui: "ui-full.html"`. The `ui.html` file is a thin remote-loader
  shell — DO NOT add real plugin UI to it.
- The plugin Figma actually loads is the one whose `manifest.json` is registered in
  Figma's "Plugins → Development → Manage plugins in development" list. Always verify
  the path before debugging "my changes aren't showing up". Stale clones at
  `~/Design-Token-Forge/` have bitten us repeatedly.
- The component builder (`#componentBuilderSection` in `ui-full.html`) is now visible
  to **all** plugin users. Never reintroduce a name-based (`indexOf('sridhar')`) or
  hardcoded-userId gate. If a real gate is ever needed, put it server-side in the sync
  server, not in plugin code that ships in the bundle.

### 11.2 Variable & collection naming

- DTF variable names use the same `--{category}-{name}-{scale}` shape as CSS, but with
  **slashes** for Figma's grouping (e.g. `primitives/color/brand/500`,
  `semantic/role/brand/fill`, `component/btn/bg-hover`).
- Collections: `DTF / Primitives`, `DTF / Semantic`, `DTF / Components`, `DTF / Surfaces`.
  The `DTF / ` prefix is **mandatory** — it's how the plugin finds collections to update
  and how Figma users distinguish DTF variables from their own.
- Modes inside a collection: `Light`, `Dark` (Title Case, exactly these two strings).
  Never `light`/`dark`, never additional modes — surfaces are encoded as variables
  inside the modes, not as additional modes.

### 11.3 Update strategy — **never delete + recreate**

> **The single most important plugin rule.** Re-read this whenever editing plugin code.

- Figma tracks variables by **internal ID**, not by name. Deleting and re-creating a
  variable severs every component binding in every Figma file permanently. There is no
  undo across sessions.
- The plugin's update path **must** be: find existing variable by name → `setValueForMode()`.
  Only the user-initiated "Reset & recreate" action is allowed to call
  `variable.remove()` — and only with a confirmation dialog.
- Audit the plugin code before every release:

  ```bash
  # Should return ZERO hits outside the explicit "Reset & recreate" handler.
  grep -nE '\.(remove|delete)\(\)' packages/figma-plugin/*.js \
    | grep -viE 'reset[- ]?and[- ]?recreate|userConfirmed'
  ```

### 11.4 UI vocabulary inside the plugin

Plugin UI strings follow the same rules as the editor (§3, §4, §7), with these
plugin-specific canonical labels:

| Concept                              | Canonical label                |
|--------------------------------------|--------------------------------|
| Manual import of a token JSON        | "Import tokens"                |
| Push current sync-server tokens      | "Update variables"             |
| Wipe + rebuild DTF collections       | "Reset & recreate" (danger)    |
| Build component instances in Figma   | "Generate components"          |
| Connection state — server reachable  | "Connected" / green dot        |
| Connection state — server unreachable| "Waiting for server…"          |
| Connection state — deploying         | "Deploying — please wait"      |

- The component-builder progress chip uses the same `X variants, Y bindings, Z reactions`
  template — don't reorder or rename those nouns.
- Error toasts inside the plugin use the same "Sentence case, no trailing period"
  rule (§7).

## 12. Sync scope (editor → server → plugin → Figma)

The four-hop pipeline is where drift creeps in fastest. Lock its surface area here.

### 12.1 The pipeline

```
   editor-v2  ──(deploy)──►  GitHub Pages (palette JSON + tokens.css)
                                   │
                                   ▼
                       sync-server (packages/sync-server)
                                   │  watches files, serves /tokens
                                   ▼
                          plugin.js  (poll /tokens)
                                   │
                                   ▼
                              Figma file
```

### 12.2 Watcher coverage (server side)

- The sync server **must** watch all four token surfaces:
  1. `packages/tokens/src/primitives*.css`
  2. `packages/tokens/src/semantic*.css`
  3. `packages/tokens/src/surfaces*.css`
  4. `packages/components/src/**/*.tokens.css`
- A watcher scoped to only `packages/tokens/src/*.css` will **silently** ignore component
  edits. Verify before every release:

  ```bash
  # Inspect the watch glob set used at server startup.
  grep -nE "watch|chokidar|glob" packages/sync-server/src/*.js
  # Cross-check the running server actually serves the latest value.
  curl -s http://localhost:9500/tokens | jq '.["--btn-bg-hover"]'
  # Compare with the source file.
  grep -n '\-\-btn-bg-hover' packages/components/src/button/button.tokens.css
  ```

### 12.3 Alias coverage (deploy gate)

- Every component `.tokens.css` value must resolve to a `var(--<primitive>-N)` where the
  primitive actually exists in the current ladder. A broken alias makes the sync server
  **silently drop** the variable from `tokens.json` — designers then run "Update
  variables" and the expected token never appears, with no error anywhere.
- Pre-deploy gate:

  ```bash
  pnpm audit:primitives        # scripts/audit-primitive-aliases.cjs
  pnpm audit:tokens            # scripts/audit-tokens.cjs (orphans + naming)
  ```

- The spacing ladder is **non-uniform** (skips 7, 9, 17, 19, 21, 23, 27, 29, 31, 33–35,
  37–39, 41–44, 46–47, 49, 51–53, 55, 57–59, 61–63, 65–69, 71, 73–79, 81–89, 91–95, 97–99,
  101–111, 113–119, 121+). When picking spacing values for new tokens, **verify the
  primitive exists first** or the audit will fail.

### 12.4 Override semantics (editor live preview ↔ deploy)

- The editor's "Live preview" must emit the **full ladder + semantic mapping for every
  role**, dirty or clean. Emitting only dirty roles makes the page paint with the file's
  hardcoded primitives for clean roles, which can disagree with the editor's labels.
- "Deploy to Figma" must round-trip the same payload. Audit:

  ```bash
  # The deployed JSON should contain every role, not just edited ones.
  curl -s http://localhost:9500/tokens | jq 'keys | length'
  ```

### 12.5 Cache busting

- Editor assets in `demo/editor-v2/` use a `?v=N` query string. **Bump on every change**
  that touches `editor-v2.js`, `editor-v2.css`, or `palette-engine.js`. The audit:

  ```bash
  grep -nE 'editor-v2\.(js|css)\?v=' demo/editor-v2/index.html
  ```

- The Figma plugin loads `ui-full.html` directly from disk (no cache-busting required),
  but the **remote loader** (`ui.html` → GitHub Pages) does cache. Bump the deployed
  version's query string when shipping a plugin-UI change.

### 12.6 Pre-deploy checklist (run all five)

- [ ] `pnpm audit:primitives` — zero broken alias refs
- [ ] `pnpm audit:tokens` — zero orphans, naming clean
- [ ] Sync server running, `curl /tokens` returns latest values for all four surfaces
- [ ] Editor `?v=N` bumped (if any editor-v2 file changed)
- [ ] No `variable.remove()` calls outside the explicit "Reset & recreate" handler
      (run grep from §11.3)

---

## 13. Open follow-ups (drift to fix when convenient)

- [ ] Extract editor-chrome fixed pass/fail colors (`#1F6B33`, `#2F8049`, `#C2392B`) into
  `--ev2-fixed-pass-aaa`, `--ev2-fixed-pass-aa`, `--ev2-fixed-fail` so the editor itself
  can be themed without leaking into project tokens.
- [ ] Drop the `.ev2-step-sw {height:38px}` legacy size once the only consumer is
  identified — align with the `36px` standard.
- [ ] Add a sentinel for the new T1 `[data-pc-derived]` cards so audits can verify all 4
  exist for every role.
- [ ] T3 (Step 7): when component templates land, lock their action verbs to the table in
  §3 before merging.

---

## 14. Decision log

| Date       | Decision                                                       | Why                                    |
|------------|----------------------------------------------------------------|----------------------------------------|
| 2026-05-16 | Initial draft — extracted from post-Step 1.3 consistency audit | Establish baseline before T3 starts    |
| 2026-05-16 | Keep `to 1` in WCAG aria-label, `:1` elsewhere                 | Screen-reader pronunciation > brevity  |
| 2026-05-16 | Fixed pass/fail hexes stay hardcoded for now                   | Editor chrome must not depend on user tokens; will tokenize when more chrome moves through the same pattern |
| 2026-05-16 | Component builder visible to all plugin users                  | Stops being an owner-only tool; gating moves server-side if ever needed |
| 2026-05-16 | Added §11 Figma plugin + §12 Sync scope to consistency doc     | Plugin / sync drift was the most-repeated source of incidents — pulling rules in-doc so they're checked alongside UI strings |
| 2026-05-16 | T2 surface → source-palette mapping is user-overridable        | Architecture spec §3.2 always said "step on source palette" — landing the picker closes the loop. CUSTOM step picks survive a palette swap so designers can audition the same elevation shape against multiple hues without re-tuning. |
| 2026-05-16 | System surface palettes = Greyscale + Desaturated + Brand      | Replaces the single hardcoded `neutral` palette. Greyscale (C=0) and Desaturated (C≈0.04) are brand-coupled — same hue, controlled chroma — so the L* "lighting legacy" stays identical across all three. Status palettes are still NOT surfaceable (alert semantics). Custom project-level palettes (e.g. Writer Handhelds' "Neutral") are auto-discovered from `--prim-<name>-*` and shown under "Custom palettes". Picker became a custom popover because native `<select>` can't render labeled group separators + empty-state slots reliably. |
