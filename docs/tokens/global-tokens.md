# Global Token Specification

> **Sourced from Tokn** — our validated 4-tier color architecture with 607 tokens across 8 collections,
> plus spacing, typography, and component size primitives. Verified in Figma ("Desktop Color Tokens - Dec 2025").

---

## Token Architecture: 4 Tiers

```
T0  PRIMITIVES         Raw, untyped values. Foundation layer.
 │                     8 color palettes × 21 steps = 148 colors
 │                     39 spacing values, 13 font sizes, 5 weights
 ▼
T1  SEMANTIC COLORS    Typed aliases to primitives. 108 definitions × light/dark.
 │                     6 roles: primary, brand, success, warning, danger, info
 │                     Each role has: content (4), component (7), container (5),
 │                     on-component (1), on-container (1) = 18 tokens per role
 ▼
T2  SURFACE CONTEXTS   Adaptive surface tokens. 34 variables × 9 surfaces × light/dark.
 │                     Surfaces: base, bright, deep, accent, dim,
 │                     container, over-container, float, inverse
 │                     Each surface has: bg/hover/pressed, outline, separator,
 │                     content (4 levels), component (7), semantic (18)
 ▼
T3  COMPONENT SIZES    Size + density tokens for 13 component groups.
                       93 definitions × 10 density modes (micro → ultra).
```

> **FUTURE — Color Generation Engine**: The generator will accept a single key color per
> palette and algorithmically produce the full 21-step scale (white → key → black) using
> perceptual lightness distribution. This will allow any product to define their brand with
> one hex value per palette and get a complete, contrast-safe color system. See ADR-006.

---

## T0: Primitives

### Color Palettes (148 tokens)

8 families, 21 steps each (white → Color25 → Color50 → ... → Color900 → black).

```
Palettes:
  brand           → Product brand identity (e.g., #E53F28)
  brand   → Primary UI actions (e.g., #286CE5)
  desaturated     → Neutral-cool tones for structure
  greyscale       → Pure neutrals for text, borders, backgrounds
  danger          → Error / destructive (red family)
  warning         → Caution (amber/yellow family)
  info            → Informational (blue family)
  success         → Positive (green family)

Steps per palette (21):
  white, Color25, Color50, Color75, Color100, Color150, Color175,
  Color200, Color250, Color300, Color400, Color450, Color500,
  Color550, Color600, Color700, Color750, Color800, Color850,
  Color900, black
```

Naming convention:
```css
--prim-{palette}-{step}

/* Examples: */
--prim-brand-500: #E53F28;
--prim-brand-500: #286CE5;
--prim-greyscale-Color400: #5C5C5C;
--prim-danger-Color600: #BA181C;
```

### Spacing (39 tokens)

Dense in the small range (1–15px) where real UI needs fine control.

```
Name → Value (px):
  none→0, 1→1, 2→2, 3→3, 4→4, 5→5, 6→6, 8→8, 10→10, 11→11,
  12→12, 13→13, 14→14, 15→15, 16→16, 18→18, 20→20, 24→24,
  25→25, 26→26, 28→28, 30→30, 32→32, 36→36, 40→40, 45→45,
  48→48, 50→50, 54→54, 60→60, 64→64, 70→70, 72→72, 80→80,
  90→90, 96→96, 100→100, 112→112, 120→120
```

Naming: `--spacing-{name}` (e.g., `--spacing-4: 4px;`, `--spacing-none: 0px;`)

### Typography (32 tokens)

Picked via the Tt tier of the editor (`demo/editor-v2/`) and persisted
to each project's `config.json` under `typographyConfig`. See
[typography.md](typography.md) for the full contract.

**Font families** (3 roles):
```
--font-family-headline   (h1–h3, titles)
--font-family-body       (paragraphs, UI)
--font-family-code       (<code>, <pre>, tabular numerics)
```
Resolved from one of five presets (`neutral-system`,
`modern-geometric`, `editorial-serif`, `friendly-humanist`,
`code-first-mono`) or `"custom"` + designer-supplied family names.

**Font sizes** (13 steps, density-scaled):
```
10, 11, 12, 13, 14, 16, 18, 20, 24, 26, 28, 32, 40  (base px)
```
Multiplied by ×0.92 (compact) / ×1.0 (base) / ×1.08 (comfortable).

**Font weights** (5):
```
regular→400, medium→500, semibold→600, bold→700, extrabold→900
```

**Line heights** (5):
```
tight 1.25, snug 1.375, normal 1.5, relaxed 1.625, loose 2.0
```
Only `normal` retunes with density (1.375 / 1.5 / 1.625). The others
are explicit designer choices and stay fixed.

**Letter spacings** (6, em → percent at the Figma boundary):
```
tighter -0.05em, tight -0.025em, normal 0em, wide 0.025em,
wider 0.05em, widest 0.1em
```

Naming: `--font-family-{role}`, `--font-size-{value}`, `--font-weight-{name}`,
`--line-height-{name}`, `--letter-spacing-{name}`.

---

## T1: Semantic Roles (6 × 18 tokens × light/dark)

6 roles: **primary**, **brand**, **success**, **warning**, **danger**, **info**

Each role → 3 groups + 2 on-colors = 18 tokens:

| Group | Tokens | Purpose |
|-------|--------|---------|
| content | default, strong, subtle, faint | Text colors in this role's context |
| component | bg-default, bg-hover, bg-pressed, outline-default, outline-hover, outline-pressed, separator | Filled/outline button, chip, interactive element |
| container | bg, hover, pressed, outline, separator | Subtle background (alert, tag, card tint) |
| on-component | (1) | Text on filled component (usually white) |
| on-container | (1) | Text on container background |

Naming: `--{role}-{group}-{property}` (e.g., `--primary-component-bg-default`, `--danger-on-container`)

---

## T2: Surface Contexts (9 × 34 tokens × light/dark)

| Surface | Purpose |
|---------|---------|
| surface-base | Default canvas / page background |
| surface-bright | Brightest / strong |
| surface-deep | Deeply layered — sidebars, wells |
| surface-accent | Primary-tinted accent |
| surface-dim | Receded / dimmed |
| container | Card / container |
| over-container | Elements on top of containers |
| float | Floating — tooltips, popovers |
| inverse | Opposite of current theme — dark in light, light in dark |

### Per-surface token structure (34):

```
Background (3):   bg, hover, pressed
Borders (2):      outline, separator
Content (4):      ct/default, ct/strong, ct/subtle, ct/faint
Component (7):    cm/bg, cm/bg-hover, cm/bg-pressed,
                  cm/outline, cm/outline-hover, cm/outline-pressed, cm/separator
Semantic (18):    sm/bg, sm/bg-hover, sm/bg-pressed,
                  sm/outline, sm/outline-hover, sm/outline-pressed, sm/separator,
                  sm/container-bg, sm/container-hover, sm/container-pressed,
                  sm/container-outline, sm/container-separator,
                  sm/on-component, sm/on-container,
                  sm/content-default, sm/content-strong, sm/content-subtle, sm/content-faint
Shadow (1):       boolean flag (float gets shadow, base doesn't)
```

Naming: `--{surface}-{group}-{property}` (e.g., `--surface-base-ct-default`, `--float-sm-bg`)

---

## T3: Component Size Tokens (93 × 10 density modes)

### 10 Density Modes

```
micro → tiny → small → base → medium → large → big → huge → mega → ultra
```

`base` = default density.

### Components covered (13 groups):

| Component | Properties | Active modes |
|-----------|------------|-------------|
| button | height, radius, font-size, padding L/R, icon wrapper padding, icon container | all 10 |
| split button | height, radius, font-size, padding L/R | all 10 |
| menu button | height, radius, font-size, padding L/R, chevron padding, icon container | all 10 |
| input | height, radius, font-size, padding T/B/L/R | all 10 |
| menu item | height, radius, font-size, padding T/B, icon container, text padding L/R, tag font-size | all 10 |
| tag | height, radius, font-size, icon container, padding L/R | micro→large (6) |
| badge | height, radius, font-size, padding L/R, dot size | micro→medium (5) |
| checkbox | size, radius, label gap, font-size | all 10 |
| radio | size, icon container, label gap, font-size | all 10 |
| toggle | track width/height/radius, thumb size/radius | all 10 |
| avatar | size, radius, font-size, border width | all 10 |
| divider | weight, spacing above | all 10 |
| scrollbar | width, thumb min height | all 10 |

Naming: `--{component}-{property}` resolved per active density mode.

---

## Utility Tokens (5)

| Token | Light | Dark |
|-------|-------|------|
| white | #FFFFFF | #000000 |
| black | #000000 | #FFFFFF |
| fixed-white | #FFFFFF | #FFFFFF |
| fixed-black | #000000 | #000000 |
| fixed-primary | #1852BA | #1852BA |

---

## Non-Tokn Global Tokens (DTF additions)

### Border Radius
```
--radius-none: 0     --radius-xs: 2px     --radius-sm: 4px
--radius-md: 6px     --radius-DEFAULT: 8px --radius-lg: 12px
--radius-xl: 16px    --radius-2xl: 24px   --radius-3xl: 32px   --radius-full: 9999px
```

### Shadows
```
--shadow-none, --shadow-xs, --shadow-sm, --shadow-md, --shadow-lg, --shadow-xl, --shadow-2xl, --shadow-inner
```

### Motion
```
Duration: --duration-instant(0ms), --duration-fastest(50ms), --duration-fast(100ms),
          --duration-normal(200ms), --duration-slow(300ms), --duration-slower(400ms), --duration-slowest(500ms)
Easing:   --easing-linear, --easing-in, --easing-out, --easing-in-out, --easing-bounce, --easing-spring
```

### Z-Index
```
--z-base(0), --z-raised(1), --z-dropdown(1000), --z-sticky(1100), --z-overlay(1300),
--z-modal(1400), --z-popover(1500), --z-toast(1600), --z-tooltip(1700), --z-max(9999)
```

### Opacity (16 steps)
```
--opacity-0 through --opacity-100 (0, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100)
```

---

## Total Summary

| Source | Category | Definitions |
|--------|----------|-------------|
| Tokn T0 | Color primitives | 148 |
| Tokn T0 | Spacing | 39 |
| Tokn T0 | Typography | 32 |
| Tokn T1 | Semantic roles | 108 |
| Tokn T2 | Surface contexts | 306 |
| Tokn T3 | Component sizes | 93 |
| Tokn | Utility | 5 |
| DTF | Radius, shadows, motion, z-index, opacity | 57 |
| **Total** | | **~775 definitions** |

Resolved (with light/dark): ~1,400+