/* ════════════════════════════════════════════════════════════
   Design Token Forge — Editor v2
   Step 2: T0 Palette intent end-to-end.

   Architecture:
   - State.baseline = original palette key colors (read from primitives)
   - State.proposed = currently-edited palette key colors
   - On edit: regenerate the 22-step ladder via PaletteEngine
              -> inject into preview iframe as --prim-{role}-{step}
              -> update topbar change count + Discard / Deploy enable
   - Discard reverts proposed to baseline
   - Deploy is wired in step 8 (commits proposed -> repo)
   ════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var TIER_META = {
    t0: { title: 'Palette',     sub: 'Your foundation colors. Editing here cascades to roles, surfaces, and every component.' },
    t1: { title: 'Roles',       sub: 'Brand, danger, success, warning, info, neutral — the meaning your colors carry.' },
    t2: { title: 'Surfaces',    sub: 'Page and section backgrounds. Each surface defines text, components, and outlines that fit on top of it.' },
    t3: { title: 'Components',  sub: 'Per-component sizes, spacing and structural tokens. Density, padding, radii.' }
  };

  var ROLES = [
    { id: 'brand',   label: 'Brand',   prefix: 'brand'   },
    { id: 'danger',  label: 'Danger',  prefix: 'danger'  },
    { id: 'success', label: 'Success', prefix: 'success' },
    { id: 'warning', label: 'Warning', prefix: 'warning' },
    { id: 'info',    label: 'Info',    prefix: 'info'    }
  ];

  var AFFECTS = {
    brand:   ['Button', 'Badge', 'Toggle', 'Checkbox', 'Radio', 'Input', 'Slider', 'Tabs', '+12 more'],
    danger:  ['Alert', 'Toast', 'Button', 'Input', 'Badge', '+8 more'],
    success: ['Alert', 'Toast', 'Badge', 'Progress', '+6 more'],
    warning: ['Alert', 'Toast', 'Badge', '+5 more'],
    info:    ['Alert', 'Toast', 'Badge', 'Tooltip', '+5 more']
  };

  /* ── T1 Roles intent ──────────────────────────────────
     Each role has 3 levers (fill / content / container). Each lever
     picks a single step from the 20-step palette ladder and that step
     becomes the anchor of a slot family. Other slots in the family
     derive by index-stepping along the ladder.

     Step names are the only identifier the user sees. No "Soft /
     Standard / Bold" preset vocabulary — just the same step numbers
     that ship in the CSS output (`--brand-component-bg-default:
     var(--prim-brand-550)`). One word, one meaning, end-to-end.   */
  // Mirror of DTFSolver.ALL_STEPS — includes the 'white' (L*100) and
  // 'black' (L*0) extremes so designers can pin a surface bg to
  // literal #FFF / #000 from the picker.
  var ALL_STEPS = ['white','25','50','75','100','150','175','200','250','300','350','400','450','500','550','600','700','750','800','850','900','black'];
  function stepRel(name, delta) {
    var i = ALL_STEPS.indexOf(name); if (i < 0) return name;
    i = Math.max(0, Math.min(ALL_STEPS.length - 1, i + delta));
    return ALL_STEPS[i];
  }
  /* In dark mode, the visible "away from container" direction is
     LIGHTER (smaller idx in ALL_STEPS). In light mode, it's DARKER
     (larger idx). Use this multiplier wherever a delta should track
     surface luminance. Without it, a step-850 dark container would
     auto-derive a step-900 border that's INVISIBLE on the container. */
  function tonalDir(mode) { return mode === 'dark' ? -1 : 1; }
  /* Walk `offset` steps from `name` in the mode-default direction,
     but FLIP direction when there isn't enough headroom that way
     — otherwise borders/separators on extreme containers (e.g. a
     pinned-to-black container in light mode) clamp at the ladder
     edge and become invisible against the container itself.
     Strategy:
       1. desiredDir = tonalDir(mode) so light-mode walks darker,
          dark-mode walks lighter (the canonical "away from page").
       2. If `idx + offset*desiredDir` is out of bounds (or fewer
          than `offset` steps fit in that direction), use the
          opposite direction.
       3. As a last resort (offset bigger than the ladder itself)
          fall back to the ladder edge furthest from `name`. */
  function stepRelToward(name, offset, mode) {
    var i = ALL_STEPS.indexOf(name);
    if (i < 0) return name;
    var dir = tonalDir(mode);
    var forwardRoom  = dir > 0 ? (ALL_STEPS.length - 1 - i) : i;
    var backwardRoom = dir > 0 ? i : (ALL_STEPS.length - 1 - i);
    var useDir;
    if (forwardRoom >= offset)      useDir =  dir;
    else if (backwardRoom >= offset) useDir = -dir;
    else useDir = (forwardRoom >= backwardRoom) ? dir : -dir;
    var j = Math.max(0, Math.min(ALL_STEPS.length - 1, i + offset * useDir));
    return ALL_STEPS[j];
  }
  /* Resolve the auto-derived border/separator step for a role+mode.
     Honors a user override stored in State.t1[mode][roleId][key];
     otherwise computes the default offset from the container pick
     in the direction with headroom. */
  function resolveBorderStep(roleId, mode) {
    var t = State.t1[mode][roleId];
    if (t.borderStep && ALL_STEPS.indexOf(t.borderStep) >= 0) return t.borderStep;
    return stepRelToward(t.container, 6, mode);
  }
  function resolveSeparatorStep(roleId, mode) {
    var t = State.t1[mode][roleId];
    if (t.separatorStep && ALL_STEPS.indexOf(t.separatorStep) >= 0) return t.separatorStep;
    return stepRelToward(t.container, 2, mode);
  }

  /* Per-role per-mode default step picks. Hand-tuned so every role
     ships AA-clean out of the box — derived from the prior preset
     system's verified math, then frozen as plain step numbers.

     Light-mode rationale:
       brand / danger:  fill 550 vs white = 5.8+, content 550 vs container 75 = 4.5+
       success:         fill 600 vs white = 6.07, container 50 keeps cohesion w/ Light
       warning:         amber needs darker steps — fill 600, content 750 (9:1+ on white)
       info:            container 50 lifts content/container to 4.5+

     Dark-mode rationale: lift fills to luminous mid-tones (no
     "saturated-on-near-black" bruise look); soften content to cream
     instead of bone white; keep containers at the deep desaturated
     end so alerts read as tinted dark surfaces. */
  var T1_DEFAULT_STEPS = {
    light: {
      brand:   { fill: '550', content: '550', container: '75'  },
      danger:  { fill: '550', content: '550', container: '75'  },
      success: { fill: '600', content: '700', container: '50'  },
      warning: { fill: '600', content: '750', container: '75'  },
      info:    { fill: '550', content: '550', container: '50'  }
    },
    dark: {
      brand:   { fill: '450', content: '200', container: '850' },
      danger:  { fill: '450', content: '200', container: '850' },
      success: { fill: '500', content: '200', container: '850' },
      warning: { fill: '550', content: '200', container: '850' },
      info:    { fill: '450', content: '200', container: '850' }
    }
  };
  function defaultT1ForRole(roleId, mode) {
    var src = (T1_DEFAULT_STEPS[mode] && T1_DEFAULT_STEPS[mode][roleId])
           || T1_DEFAULT_STEPS.light.brand;
    return { fill: src.fill, content: src.content, container: src.container };
  }
  function t1For(roleId, mode) { return State.t1[mode || State.editingMode][roleId]; }

  /* ── T2 Surfaces intent (data layer) ───────────────────
     Build step 3: model + state only. No UI is wired here — T2 still
     renders the placeholder route until step 4. This commit just
     defines the shape downstream code (renderer, bulk ops, preview,
     persistence) can rely on. See docs/editor-v2-tier-architecture.md
     §3.2 (taxonomy) and §11 (build order).

     Each surface has 16 properties grouped into 3 families.
     A T2 cell is EITHER a step on its source palette (default) OR
     a "follows" pointer to a T1 role pick (set in step 4). Defaults
     are derived from per-surface anchor steps + signed offsets that
     pass through tonalDir(mode) — so dark mode mirrors automatically
     and no inline `± constant` ever leaks in (decision D4). */
  var T2_SURFACES = [
    { id:'bright',    label:'Bright',    palette:'greyscale', desc:'Brightest page background' },
    { id:'base',      label:'Base',      palette:'greyscale', desc:'Base page background'      },
    { id:'dim',       label:'Dim',       palette:'greyscale', desc:'Recessed background'       },
    { id:'deep',      label:'Deep',      palette:'greyscale', desc:'Most recessed background'  },
    { id:'accent',    label:'Accent',    palette:'brand',     desc:'Branded panels'            },
    { id:'container', label:'Container', palette:'greyscale', desc:'Card-on-surface'           },
    { id:'float',     label:'Float',     palette:'greyscale', desc:'Popovers, menus'           },
    { id:'inverse',   label:'Inverse',   palette:'greyscale', desc:'Dark on light, light on dark' }
  ];

  /* Anchor step for each surface's `bg` per mode. All other props on
     a surface derive from this via T2_PROP_DEFS[].defaultOffset, in
     the mode-correct direction. Values are the v0 picks accepted in
     Q2 of docs §10 \u2014 step-4 render will paint from these, not from
     the existing surfaces.css output, and the \u00b1 stepper is the
     escape hatch when a surface needs a different anchor. */
  var T2_BASE_STEPS = {
    light: { bright:'white', base:'50',  dim:'100', deep:'200',
             accent:'25',  container:'25', float:'25',  inverse:'900' },
    dark:  { bright:'850', base:'900', dim:'850', deep:'black',
             accent:'900', container:'850', float:'800', inverse:'white' }
  };

  /* The 16 properties per surface. Default offsets are signed in
     "lighter→darker" steps and get multiplied by tonalDir(mode) at
     resolve time — so light/dark mirror automatically. Numbers come
  /* The 16 properties per surface, modeled as a TREE so the renderer
     can show parent-child relationships and the resolver cascades
     overrides correctly. `parent` = prop id of the anchor (null for
     bg). `defaultDelta` = signed offset from parent (in lighter→
     darker steps); multiplied by tonalDir(mode) at resolve time so
     light/dark mirror automatically. `level` controls UI indent.

     Tree (anchored at bg):
       bg                                          — family root
         ├─ subtle      (+1 from bg)
         ├─ strong      (+2 from bg)
         ├─ outline     (+3 from bg)            — edges
         │   └─ separator  ( 0 from outline)
         ├─ ct-default  (+16 from bg)           — content
         │   ├─ ct-strong  (+3 from ct-default)
         │   ├─ ct-subtle  (-6 from ct-default)
         │   └─ ct-faint   (-8 from ct-default)
         └─ cm-bg       (-1 from bg)            — component
             ├─ cm-bg-hover       (+1 from cm-bg)
             ├─ cm-bg-pressed     (+2 from cm-bg)
             ├─ cm-outline        (+4 from cm-bg)
             │   ├─ cm-outline-hover   (+1 from cm-outline)
             │   └─ cm-outline-pressed (+1 from cm-outline)
             └─ cm-separator      (+4 from cm-bg) */
  var T2_PROP_DEFS = [
    { id:'bg',                 family:'surface',   parent:null,         defaultDelta:  0, level:0 },
    { id:'subtle',             family:'surface',   parent:'bg',         defaultDelta:  1, level:1 },
    { id:'strong',             family:'surface',   parent:'bg',         defaultDelta:  2, level:1 },
    { id:'outline',            family:'borders',   parent:'bg',         defaultDelta:  3, level:0 },
    { id:'separator',          family:'borders',   parent:'outline',    defaultDelta:  0, level:1 },
    { id:'ct-default',         family:'content',   parent:'bg',         defaultDelta: 16, level:0 },
    { id:'ct-strong',          family:'content',   parent:'ct-default', defaultDelta:  3, level:1 },
    { id:'ct-subtle',          family:'content',   parent:'ct-default', defaultDelta: -6, level:1 },
    { id:'ct-faint',           family:'content',   parent:'ct-default', defaultDelta: -8, level:1 },
    { id:'cm-bg',              family:'component', parent:'bg',         defaultDelta: -1, level:0 },
    { id:'cm-bg-hover',        family:'component', parent:'cm-bg',      defaultDelta:  1, level:1 },
    { id:'cm-bg-pressed',      family:'component', parent:'cm-bg',      defaultDelta:  2, level:1 },
    { id:'cm-outline',         family:'component', parent:'cm-bg',      defaultDelta:  4, level:1 },
    { id:'cm-outline-hover',   family:'component', parent:'cm-outline', defaultDelta:  1, level:2 },
    { id:'cm-outline-pressed', family:'component', parent:'cm-outline', defaultDelta:  1, level:2 },
    { id:'cm-separator',       family:'component', parent:'cm-bg',      defaultDelta:  4, level:1 }
  ];
  function propDefById(id) {
    for (var i = 0; i < T2_PROP_DEFS.length; i++) if (T2_PROP_DEFS[i].id === id) return T2_PROP_DEFS[i];
    return null;
  }
  /* Props whose defaultDelta means "go AWAY from bg in contrast
     direction" (vs. "go in an absolute brightness direction"). Used
     to flip deltas on polarity-inverted surfaces (inverse). The
     cm-bg subtree is EXCLUDED because it encodes elevation/press
     state, not contrast. */
  var POLARITY_SENSITIVE = {
    'subtle':1,'strong':1,'outline':1,'separator':1,
    'ct-default':1,'ct-strong':1,'ct-subtle':1,'ct-faint':1,
    'cm-outline':1,'cm-outline-hover':1,'cm-outline-pressed':1,
    'cm-separator':1
  };
  function isPolaritySensitive(propId) { return POLARITY_SENSITIVE[propId] === 1; }

  /* Inverse-only deltas for cm-bg-hover and cm-bg-pressed. These
     override the normal +1/+2 "darker" elevation deltas because the
     inverse bg sits one step away from the palette extreme — the
     standard deltas clamp at the wall and produce no motion. The
     overrides express elevation TOWARD the palette center (same
     direction cm-bg itself offsets from bg) at compressed magnitudes
     so hover reads as resting and pressed is a subtle 1-step shift.
     Tonal multiplier is applied at resolve time so light/dark mirror
     automatically. */
  var INVERSE_CM_BG_DELTAS = {
    'cm-bg-hover':    0,   // sits flush with cm-bg
    'cm-bg-pressed': -1    // 1 step toward palette center
  };

  function makeEmptyT2() {
    var out = {};
    ['light','dark'].forEach(function (mode) {
      out[mode] = {};
      T2_SURFACES.forEach(function (s) { out[mode][s.id] = {}; });
    });
    return out;
  }

  /* Anchor step for a surface's `bg` cell. Honors a user override
     stored on the bg cell; otherwise returns the per-mode default
     from T2_BASE_STEPS. This is what all other props on the surface
     offset from, so an override here cascades family-wide. */
  function surfaceBaseStep(surfaceId, mode) {
    var bgOv = State.t2 && State.t2[mode] && State.t2[mode][surfaceId] && State.t2[mode][surfaceId]['bg'];
    if (bgOv && bgOv.step && ALL_STEPS.indexOf(bgOv.step) >= 0) return bgOv.step;
    return (T2_BASE_STEPS[mode] && T2_BASE_STEPS[mode][surfaceId]) || '500';
  }
  function defaultT2Step(surfaceId, propId, mode) {
    var prop = propDefById(propId);
    if (!prop) return surfaceBaseStep(surfaceId, mode);
    if (!prop.parent) return surfaceBaseStep(surfaceId, mode); // bg = root
    // Walk: parent's RESOLVED step (so user's parent override
    // cascades into the child's default) + this prop's delta.
    var parentStep = resolveT2Step(surfaceId, prop.parent, mode);
    // Inverse surface compresses + reverses cm-bg elevation: the
    // bg sits adjacent to the palette extreme (light-mode inverse
    // bg = 900, dark-mode inverse bg = white) so the regular
    // +1 / +2 "darker" hover/pressed deltas clamp into the wall
    // and produce no visible motion. The natural "raised" feel on
    // an inverse panel goes back TOWARD the palette center —
    // matching the direction cm-bg itself offsets from bg. Magnitudes
    // are also compressed by one step: hover = 0 (same as cm-bg —
    // no motion required to read as resting), pressed = 1 step
    // toward center (subtle press indicator). cm-outline subtree
    // is still handled by POLARITY_SENSITIVE below.
    if (surfaceId === 'inverse' && INVERSE_CM_BG_DELTAS.hasOwnProperty(propId)) {
      return stepRel(parentStep, INVERSE_CM_BG_DELTAS[propId] * tonalDir(mode));
    }
    // Polarity: most props (subtle/strong/outline/separator/ct-*/
    // cm-outline*/cm-separator) encode "contrast against bg" and
    // assume bg sits at the LIGHT end of its mode's palette. For
    // a polarity-inverted surface like `inverse` (bg pinned at the
    // dark end in light mode and vice versa), those deltas have
    // to flip or ct-default falls past the end of the ladder and
    // clamps back onto bg — invisible text. cm-bg/cm-bg-hover/
    // cm-bg-pressed encode ELEVATION (raised component, hover
    // depression) which is direction-agnostic, so they don't flip.
    var polarity = (surfaceId === 'inverse' && isPolaritySensitive(propId)) ? -1 : 1;
    return stepRel(parentStep, prop.defaultDelta * tonalDir(mode) * polarity);
  }
  function resolveT2Step(surfaceId, propId, mode) {
    var ov = State.t2 && State.t2[mode] && State.t2[mode][surfaceId] && State.t2[mode][surfaceId][propId];
    if (ov && ov.step && ALL_STEPS.indexOf(ov.step) >= 0) return ov.step;
    return defaultT2Step(surfaceId, propId, mode);
  }
  /* True if any cell in this surface (either mode) differs from the
     last-published baseline. Empty bag === clean. After save-as-
     default copies the current bag into t2Baseline, every override
     becomes part of the baseline and isT2Changed returns false. */
  function isT2Changed(surfaceId) {
    if (isSurfacePaletteCustom(surfaceId)) return true;
    return ['light','dark'].some(function (mode) {
      var cur = (State.t2 && State.t2[mode] && State.t2[mode][surfaceId]) || {};
      var base = (State.t2Baseline && State.t2Baseline[mode] && State.t2Baseline[mode][surfaceId]) || {};
      var keys = {};
      Object.keys(cur).forEach(function (k) { keys[k] = 1; });
      Object.keys(base).forEach(function (k) { keys[k] = 1; });
      return Object.keys(keys).some(function (propId) {
        var c = cur[propId]  || {};
        var b = base[propId] || {};
        return (c.step || null)    !== (b.step || null)
            || (c.follows || null) !== (b.follows || null);
      });
    });
  }
  function totalT2Changes() {
    return T2_SURFACES.reduce(function (n, s) { return n + (isT2Changed(s.id) ? 1 : 0); }, 0);
  }

  /* Family grouping for the T2 renderer — order matters, it's what
     the user sees top-to-bottom in the editing pane. 4 families:
     Surface tones, Edges, Content, Component. Each card shows its
     anchor reference (parent of the family's root prop) for context. */
  var T2_FAMILIES = [
    { id:'surface',   label:'Surface',   anchorRef:null  /* bg IS the anchor */ },
    { id:'borders',   label:'Borders',   anchorRef:'bg' },
    { id:'content',   label:'Content',   anchorRef:'bg' },
    { id:'component', label:'Component', anchorRef:'bg' }
  ];

  /* ── System surface palettes (brand-coupled) ──────────
     Two ship by default and are available to every project:
       greyscale   — chroma 0, achromatic ladder. Hue tracks
                     brand but is invisible at C=0; included so
                     the cache invalidates when brand changes
                     and the math stays consistent if a future
                     T0 control lifts chroma slightly ("warm grey").
       desaturated — low chroma (0.04 OKLCH C ≈ Tailwind "slate"),
                     hue tracks brand. Reads as branded gray.
     Both seed from brand's hue and use the PaletteEngine's
     normalized anchor mode (tone curve independent of seed L*),
     so the L* ladder ("lighting legacy") is identical to brand's
     and identical between greyscale + desaturated — only chroma
     differs. That's the property the user asked us to preserve. */
  var SYSTEM_PALETTE_IDS = { brand:1, danger:1, success:1, warning:1, info:1, greyscale:1, desaturated:1 };
  var SYSTEM_PALETTE_CHROMA = { greyscale: 0, desaturated: 0.04 };
  var _systemPaletteCache = {};

  function brandSeedHex() {
    if (State.proposed && State.proposed.brand) return State.proposed.brand;
    var cs = getComputedStyle(document.documentElement);
    return (cs.getPropertyValue('--prim-brand-500').trim() || '#3366F0');
  }
  function systemPaletteSeed(paletteId) {
    var brandHex = brandSeedHex();
    var oklch = window.PaletteEngine.hexToOklch(brandHex);
    var brandH = oklch[2];
    var chroma = SYSTEM_PALETTE_CHROMA[paletteId];
    if (chroma == null) chroma = 0;
    /* Seed L* doesn't matter in normalized-anchor mode — the engine
       re-derives every step's L from TONE_SCALE. Only keyC + keyH
       drive the ladder's chroma decay + hue. Use L=0.6 (≈step 500
       luminance) so the seed lives inside sRGB for any hue. */
    return window.PaletteEngine.oklchToHex(0.6, chroma, brandH);
  }
  function systemPaletteSteps(paletteId) {
    if (_systemPaletteCache[paletteId]) return _systemPaletteCache[paletteId];
    var seed = systemPaletteSeed(paletteId);
    _systemPaletteCache[paletteId] = window.PaletteEngine.generatePalette(seed, { anchor: 'normalized' }).steps;
    return _systemPaletteCache[paletteId];
  }

  /* ── Custom palettes (project-level, discovered) ──────
     Any --prim-<name>-500 token in the loaded primitives.css that
     isn't a system palette id is registered as a custom palette
     and surfaced under "Custom palettes" in the source-palette
     picker. Writer Handhelds' "neutral" palette gets picked up
     this way without any rename or migration. The ladder is read
     directly from the project's existing 22-step CSS variables
     (not regenerated) so custom palette colors stay byte-identical
     to what the project has shipped. */
  var _customPalettesCache = null;
  function discoverCustomPalettes() {
    if (_customPalettesCache) return _customPalettesCache;
    var found = {};
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      // Only consider THIS project's primitives sheet. Without
      // this scope check the package defaults
      // (packages/tokens/src/primitives.css ships --prim-neutral-*
      // because writer-handhelds needed it) bleed in as a "Custom
      // palette: Neutral" on every brand-new project.
      var sheetHref = sheets[i].href || '';
      var sheetNode = sheets[i].ownerNode;
      var isProjectSheet = (sheetNode && sheetNode.id === 'ev2-project-primitives')
        || /\/projects\/[^/]+\/primitives\.css/.test(sheetHref);
      if (!isProjectSheet) continue;
      var crs;
      try { crs = sheets[i].cssRules || sheets[i].rules; } catch (e) { continue; }
      if (!crs) continue;
      for (var j = 0; j < crs.length; j++) {
        var rule = crs[j];
        if (!rule.style) continue;
        for (var k = 0; k < rule.style.length; k++) {
          var p = rule.style[k];
          var m = /^--prim-([a-z][a-z0-9-]*)-500$/.exec(p);
          if (m && !SYSTEM_PALETTE_IDS[m[1]]) found[m[1]] = 1;
        }
      }
    }
    _customPalettesCache = Object.keys(found).map(function (id) {
      return {
        id: id,
        label: id.charAt(0).toUpperCase() + id.slice(1),
        desc: 'Custom palette \u2014 --prim-' + id + '-*'
      };
    });
    return _customPalettesCache;
  }
  function customPaletteSteps(paletteId) {
    if (_systemPaletteCache[paletteId]) return _systemPaletteCache[paletteId];
    var cs = getComputedStyle(document.documentElement);
    var first = cs.getPropertyValue('--prim-' + paletteId + '-' + ALL_STEPS[1]).trim();
    if (!first) return null;
    /* Read every step name from --prim-<id>-<step>; gaps fall back
       to engine-generated values from --prim-<id>-500 so a partial
       custom palette still renders something sensible. */
    var ladder = ALL_STEPS.map(function (name) {
      if (name === 'white') return { name:'white', hex:'#FFFFFF' };
      if (name === 'black') return { name:'black', hex:'#000000' };
      var v = cs.getPropertyValue('--prim-' + paletteId + '-' + name).trim();
      return { name: name, hex: v || null };
    });
    var missing = ladder.some(function (s) { return !s.hex; });
    if (missing) {
      var seed = cs.getPropertyValue('--prim-' + paletteId + '-500').trim();
      if (seed) {
        var gen = window.PaletteEngine.generatePalette(seed, { anchor:'normalized' }).steps;
        var byName = {};
        gen.forEach(function (s) { byName[s.name] = s.hex; });
        ladder = ladder.map(function (s) { return { name: s.name, hex: s.hex || byName[s.name] || '#888' }; });
      }
    }
    _systemPaletteCache[paletteId] = ladder;
    return ladder;
  }

  /* Resolve a T2 cell to its hex value by walking the surface's
     source palette ladder. Used for swatches + WCAG math. */
  function t2HexFor(surfaceId, propId, mode) {
    var step = resolveT2Step(surfaceId, propId, mode);
    var ladder = t2LadderFor(surfaceId);
    if (!ladder) return '#000';
    for (var i = 0; i < ladder.length; i++) {
      if (ladder[i].name === step) return ladder[i].hex;
    }
    return '#000';
  }

  /* ── T2 surface → source-palette mapping (user-overridable) ──
     Each surface declares a DEFAULT source palette in T2_SURFACES
     (neutral for page bgs, brand for accent, etc.). Designers can
     remap any surface to a different role's ladder at runtime via
     the picker in the surface header. Stored flat (NOT per-mode
     — palette source is the role-ladder name, and the ladder itself
     already has light/dark behaviour baked in via tonalDir).

     Override survives a step pick: switching Accent from `brand`
     to `info` keeps your CUSTOM step names; they just resolve
     against the new ladder. That's the whole point — you've tuned
     the elevation/contrast shape and you want to audition it
     against a different hue without losing the work. */
  function surfacePaletteFor(surfaceId) {
    var ov = State.t2SurfacePalette && State.t2SurfacePalette[surfaceId];
    if (ov && isValidSurfacePalette(ov)) return ov;
    var def = T2_SURFACES.find(function (s) { return s.id === surfaceId; });
    return def ? def.palette : 'greyscale';
  }
  function isSurfacePaletteCustom(surfaceId) {
    var def = T2_SURFACES.find(function (s) { return s.id === surfaceId; });
    if (!def) return false;
    var current  = surfacePaletteFor(surfaceId);
    // Baseline takes precedence over the hardcoded T2_SURFACES default
    // once the user has published — "custom" means "differs from the
    // last snapshot", not "differs from factory defaults".
    var baseline = (State.t2SurfacePaletteBaseline && State.t2SurfacePaletteBaseline[surfaceId])
                || def.palette;
    return current !== baseline;
  }
  function t2LadderFor(surfaceId) {
    var pal = surfacePaletteFor(surfaceId);
    if (pal === 'greyscale' || pal === 'desaturated') return systemPaletteSteps(pal);
    if (pal === 'brand' || pal === 'danger' || pal === 'success' || pal === 'warning' || pal === 'info') return stepsFor(pal);
    /* Custom palette (discovered from --prim-<id>-* tokens) */
    var custom = customPaletteSteps(pal);
    if (custom) return custom;
    /* Last-resort fallback if palette id is stale and points
       nowhere: greyscale keeps surfaces neutral instead of black. */
    return systemPaletteSteps('greyscale');
  }
  function isValidSurfacePalette(id) {
    if (SURFACE_PALETTE_OK[id]) return true;
    var customs = discoverCustomPalettes();
    for (var i = 0; i < customs.length; i++) if (customs[i].id === id) return true;
    return false;
  }
  /* Source-palette options for the custom popover picker.
     - DEFAULTS section (system-level, ship with every project):
         Greyscale   — brand-coupled, C=0 (true achromatic)
         Desaturated — brand-coupled, low chroma (≈ Tailwind slate)
         Brand       — the project's primary hue
       Status palettes (danger/success/info/warning) are intentionally
       NOT offered as surfaces — they're alert palettes (toasts,
       badges, callouts) and a "Danger" page bg has no real use
       case.
     - CUSTOM section: project-level palettes discovered at runtime
       from --prim-<name>-* tokens in primitives.css. Writer
       Handhelds' own "Neutral" palette surfaces here.
     SURFACE_PALETTE_OPTIONS (flat) + SURFACE_PALETTE_OK stay as
     the validation source for system palette ids; isValidSurfacePalette
     additionally consults discoverCustomPalettes() so a saved
     custom-palette override survives draft load. */
  var SURFACE_PALETTE_DEFAULTS = [
    { id:'greyscale',   label:'Greyscale',   desc:'Achromatic ladder, tracks brand hue at C=0' },
    { id:'desaturated', label:'Desaturated', desc:'Low-chroma branded gray, tracks brand hue' },
    { id:'brand',       label:'Brand',       desc:'Your project\u2019s primary hue'             }
  ];
  function buildSurfacePaletteGroups() {
    var customs = discoverCustomPalettes();
    return [
      { id:'defaults', label:'Default palettes', options: SURFACE_PALETTE_DEFAULTS.slice() },
      {
        id:'custom',
        label:'Custom palettes',
        options: customs,
        emptyState: customs.length ? null
          : 'No custom palettes in this project. Add a --prim-<name>-* ladder to surface one here.'
      }
    ];
  }
  var SURFACE_PALETTE_OPTIONS = SURFACE_PALETTE_DEFAULTS.slice();
  var SURFACE_PALETTE_OK = SURFACE_PALETTE_OPTIONS.reduce(function (m, o) { m[o.id] = true; return m; }, {});
  function paletteOptionFor(id) {
    for (var i = 0; i < SURFACE_PALETTE_DEFAULTS.length; i++) {
      if (SURFACE_PALETTE_DEFAULTS[i].id === id) return SURFACE_PALETTE_DEFAULTS[i];
    }
    var customs = discoverCustomPalettes();
    for (var j = 0; j < customs.length; j++) {
      if (customs[j].id === id) return customs[j];
    }
    return null;
  }

  var State = {
    activeTier: 't0',
    activeRole: 'brand',
    activeSurface: 'base',
    editingMode:'light',
    anchor:     'exact',
    baseline:   {},
    proposed:   {},
    cachedSteps:{},
    // T1 lever state per editing mode. Light and dark each get their
    // own snapshot so users can dial in different step picks per mode.
    // Picks are step names from ALL_STEPS ('25'..'900'). The 5×2×3
    // defaults seeded here come straight from T1_DEFAULT_STEPS — the
    // exact same numbers that ship in the CSS output.
    t1: {
      light: {
        brand:   defaultT1ForRole('brand',   'light'),
        danger:  defaultT1ForRole('danger',  'light'),
        success: defaultT1ForRole('success', 'light'),
        warning: defaultT1ForRole('warning', 'light'),
        info:    defaultT1ForRole('info',    'light')
      },
      dark: {
        brand:   defaultT1ForRole('brand',   'dark'),
        danger:  defaultT1ForRole('danger',  'dark'),
        success: defaultT1ForRole('success', 'dark'),
        warning: defaultT1ForRole('warning', 'dark'),
        info:    defaultT1ForRole('info',    'dark')
      }
    },
    // Snapshot of t1 picks AFTER boot-time auto-AA-fix. This is the
    // "clean" baseline the change counter and Discard compare against,
    // so a Discard that re-applies auto-fix doesn't count its own
    // legitimate AA shifts as user changes.
    t1Baseline: {
      light: {
        brand:   defaultT1ForRole('brand',   'light'),
        danger:  defaultT1ForRole('danger',  'light'),
        success: defaultT1ForRole('success', 'light'),
        warning: defaultT1ForRole('warning', 'light'),
        info:    defaultT1ForRole('info',    'light')
      },
      dark: {
        brand:   defaultT1ForRole('brand',   'dark'),
        danger:  defaultT1ForRole('danger',  'dark'),
        success: defaultT1ForRole('success', 'dark'),
        warning: defaultT1ForRole('warning', 'dark'),
        info:    defaultT1ForRole('info',    'dark')
      }
    },
    // T2 Surfaces override map. Empty objects mean "use defaults for
    // every property". Step-4 renderer reads via resolveT2Step().
    // Keyed by [mode][surfaceId][propId] → { step?: '500', follows?: 'role.fill' }.
    // baseline mirrors t1Baseline: snapshot of overrides considered
    // "clean" so Discard / dirty-count don't compare against an
    // empty bag if seeding logic ever lands.
    t2:         makeEmptyT2(),
    t2Baseline: makeEmptyT2(),
    // Per-surface source-palette overrides. Keyed by surfaceId →
    // role id ('brand' / 'danger' / 'info' / 'success' / 'warning' /
    // 'neutral'). Absence means "use the default declared in
    // T2_SURFACES". Validated against SURFACE_PALETTE_OK on load.
    t2SurfacePalette: {},
    // Baseline mirror for surface-palette overrides. Promoted from
    // t2SurfacePalette on save-as-default so 'CUSTOM' pills clear
    // once the user publishes their picks as the new defaults.
    t2SurfacePaletteBaseline: {},
    // T0 sub-view selector. 'roles' = key-color editing for the 6
    // primary roles; 'palettes' = inventory + CRUD for the system
    // and custom palettes that surfaces consume in T2. Palette
    // *definition* lives in T0 (here); palette *consumption* lives
    // in T2 (surface→palette mapping).
    activeT0: 'roles',
    // Disclosure open-state persists across role / tier swaps.
    // Keyed by 'tierId:discId' so each tier can have its own pattern.
    disclosure: { 't0:steps': false, 't0:affects': false, 't1:slots': false, 't1:affects': false },
    focusedLever: null,
    lastSavedAt: null
  };

  var DRAFT_KEY = 'dtf-editor-v2-draft-v2';
  var UI_KEY    = 'dtf-editor-v2-ui-v1';

  /* Per-project draft key. Drafts are project-scoped: editing
     project A and then switching to project B must NOT carry A's
     proposed.brand override into B. The global DRAFT_KEY remains
     as a legacy fallback for sessions started before scoping
     existed — read once, then promoted to the project-scoped key
     on first save. */
  function getDraftKey() {
    var id = '';
    try { id = localStorage.getItem('dtf-active-project') || ''; } catch (e) {}
    return id ? (DRAFT_KEY + '--' + id) : DRAFT_KEY;
  }

  /* ── UI state persistence (separate from draft — it survives Discard) ── */
  function saveUIState() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({
        v: 1,
        activeTier: State.activeTier,
        activeRole: State.activeRole,
        activeT0:   State.activeT0,
        activeSurface: State.activeSurface,
        anchor:     State.anchor,
        disclosure: State.disclosure,
        mode: document.documentElement.getAttribute('data-theme') || 'light',
        showCss: !!document.body.classList.contains('ev2-show-css'),
        focusedLever: State.focusedLever || null
      }));
    } catch (e) {}
  }
  function loadUIState() {
    try {
      var raw = localStorage.getItem(UI_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || d.v !== 1) return null;
      return d;
    } catch (e) { return null; }
  }

  var $listTitle = document.getElementById('listTitle');
  var $listSub   = document.getElementById('listSub');
  var $body      = document.getElementById('tokenListBody');
  var $frame     = document.getElementById('previewFrame');
  var $changeCt  = document.getElementById('changeCount');
  var $deploy    = document.getElementById('deployBtn');
  var $discard   = document.getElementById('discardBtn');
  var $deployN   = document.querySelector('.ev2-deploy-count');
  var $autosave  = document.getElementById('autosaveStatus');
  var $reload    = document.getElementById('previewReload');

  function readBaseline() {
    var cs = getComputedStyle(document.documentElement);
    ROLES.forEach(function (r) {
      var v = cs.getPropertyValue('--prim-' + r.prefix + '-500').trim();
      State.baseline[r.id] = v || '#000000';
      State.proposed[r.id] = State.baseline[r.id];
    });
  }

  /* Lever metadata — just label + sub. The picker UI renders the
     full 20-step palette strip directly from ALL_STEPS; no preset
     enumeration lives here. */
  var T1_LEVERS = [
    { id: 'fill',      label: 'Component fill', sub: 'Solid backgrounds (buttons, badges, fills)' },
    { id: 'content',   label: 'Content',        sub: 'Text and icons rendered in this colour' },
    { id: 'container', label: 'Container',      sub: 'Soft tinted surfaces (alert bg, banners)' }
  ];

  /* Auto-derived cards on T1. Each ships with a sensible default
     computed from the three primary levers, BUT every one is
     overridable from its Property Card (stepper, ladder, reset).
       - border / separator: walk container ± offset in the mode-
         direction with headroom (stepRelToward).
       - on-component: white-or-black, whichever beats the fill.
       - on-container: nearest content step that AA-passes vs the
         container; falls back to the closest available step.
     State keys (per mode per role):
       borderStep, separatorStep, onComponent, onContainerStep
     Each is undefined when following the derivation. */
  var T1_DERIVED = [
    { id: 'border',       label: 'Container border',    sub: 'Outline drawn around the container surface' },
    { id: 'separator',    label: 'Container separator', sub: 'Dividers inside the container surface' },
    { id: 'onComponent',  label: 'On-component',        sub: 'Text + icons drawn on the component fill' },
    { id: 'onContainer',  label: 'On-container',        sub: 'Text drawn on the container surface' }
  ];

  function isChanged(roleId) {
    return State.proposed[roleId].toUpperCase() !== State.baseline[roleId].toUpperCase();
  }
  function isT1ChangedInMode(roleId, mode) {
    var t = State.t1[mode][roleId];
    var b = (State.t1Baseline && State.t1Baseline[mode] && State.t1Baseline[mode][roleId])
         || defaultT1ForRole(roleId, mode);
    return t.fill !== b.fill || t.content !== b.content || t.container !== b.container
        || (t.borderStep      || null) !== (b.borderStep      || null)
        || (t.separatorStep   || null) !== (b.separatorStep   || null)
        || (t.onComponent     || null) !== (b.onComponent     || null)
        || (t.onContainerStep || null) !== (b.onContainerStep || null);
  }
  function isT1Changed(roleId) {
    return isT1ChangedInMode(roleId, 'light') || isT1ChangedInMode(roleId, 'dark');
  }
  function isRoleDirty(roleId) { return isChanged(roleId) || isT1Changed(roleId); }

  /* Diff every lever in both modes — returns
     [{mode, lever, fromStep, toStep}, ...]. Used to populate the
     per-role badge tooltip and the per-role count. */
  function summarizeRoleChanges(roleId) {
    var diffs = [];
    ['light','dark'].forEach(function (mode) {
      var t = State.t1[mode][roleId];
      var b = (State.t1Baseline && State.t1Baseline[mode] && State.t1Baseline[mode][roleId])
           || defaultT1ForRole(roleId, mode);
      ['fill','content','container'].forEach(function (lever) {
        if (t[lever] !== b[lever]) diffs.push({ mode: mode, lever: lever, fromStep: b[lever], toStep: t[lever] });
      });
      if (t.borderStep)      diffs.push({ mode: mode, lever: 'border',      fromStep: 'auto', toStep: t.borderStep });
      if (t.separatorStep)   diffs.push({ mode: mode, lever: 'separator',   fromStep: 'auto', toStep: t.separatorStep });
      if (t.onComponent)     diffs.push({ mode: mode, lever: 'onComponent', fromStep: 'auto', toStep: t.onComponent });
      if (t.onContainerStep) diffs.push({ mode: mode, lever: 'onContainer', fromStep: 'auto', toStep: t.onContainerStep });
    });
    return diffs;
  }
  function badgeTipFor(roleId) {
    var diffs = summarizeRoleChanges(roleId);
    if (!diffs.length) return '';
    var labels = {
      fill:'Fill', content:'Content', container:'Container',
      border:'Border', separator:'Separator',
      onComponent:'On-component', onContainer:'On-container'
    };
    return diffs.map(function (d) {
      var modeLabel = d.mode === 'dark' ? 'Dark' : 'Light';
      return modeLabel + ' · ' + labels[d.lever] + ': step ' + d.fromStep + ' → step ' + d.toStep;
    }).join('   •   ');
  }
  function totalChanges() {
    var n = ROLES.reduce(function (acc, r) { return acc + (isRoleDirty(r.id) ? 1 : 0); }, 0);
    n += totalT2Changes();
    return n;
  }

  function stepsFor(roleId) {
    var key = State.proposed[roleId] + '|' + State.anchor;
    if (State.cachedSteps[roleId] && State.cachedSteps[roleId].__key === key) {
      return State.cachedSteps[roleId];
    }
    var palette = window.PaletteEngine.generatePalette(State.proposed[roleId], { anchor: State.anchor });
    palette.steps.__key = key;
    State.cachedSteps[roleId] = palette.steps;
    return palette.steps;
  }
  function baselineStepsFor(roleId) {
    return window.PaletteEngine.generatePalette(State.baseline[roleId], { anchor: State.anchor }).steps;
  }

  function stepHexByName(roleId, name) {
    var steps = stepsFor(roleId);
    for (var i = 0; i < steps.length; i++) if (steps[i].name === name) return steps[i].hex;
    return null;
  }

  /* ── WCAG contrast helpers ───────────────────────────── */
  /* All math lives in DTFSolver (./solver.js). These thin shims
     keep the existing call sites readable and let us swap the
     engine without touching every callsite. */
  function contrastRatio(a, b)              { return DTFSolver.contrastRatio(a, b); }
  function wcagJudge(ratio, isLargeText)    { return DTFSolver.wcagJudge(ratio, isLargeText); }
  function surfaceBgFor(mode)               { return DTFSolver.surfaceBgFor(mode); }

  /* Build the role's ladder (name → hex map) for the solver. */
  function ladderFor(roleId) {
    return DTFSolver.ladderFromSteps(stepsFor(roleId));
  }

  // Auto-pair: pick black or white text for a filled component fill,
  // whichever has higher WCAG contrast. User override = `t.onComponent`
  // ('white' | 'black') wins when present.
  function onComponentColor(roleId, mode) {
    if (!roleId) return '#FFFFFF';
    var t = State.t1[mode || State.editingMode][roleId];
    if (t.onComponent === 'white') return '#FFFFFF';
    if (t.onComponent === 'black') return '#0A0A0A';
    var fillHex = stepHexByName(roleId, t.fill) || '#000';
    return DTFSolver.deriveOnComponent(fillHex);
  }
  // Auto-pair: pick the ladder step (closest to the user's chosen
  // content-default) that passes AA against the active container.
  // User override = `t.onContainerStep` (a step name) wins when set.
  function onContainerColor(roleId, mode) {
    mode = mode || State.editingMode;
    var t = State.t1[mode][roleId];
    var ladder = ladderFor(roleId);
    if (t.onContainerStep && ALL_STEPS.indexOf(t.onContainerStep) >= 0) {
      return ladder[t.onContainerStep] || ladder[t.content] || '#000';
    }
    var containerHex = ladder[t.container] || surfaceBgFor(mode);
    return DTFSolver.deriveOnContainer(ladder, t.content, containerHex).hex;
  }
  // Step name that on-container currently resolves to (for the
  // Property Card's "current step" badge and the ladder's data-current).
  function onContainerStepName(roleId, mode) {
    mode = mode || State.editingMode;
    var t = State.t1[mode][roleId];
    if (t.onContainerStep && ALL_STEPS.indexOf(t.onContainerStep) >= 0) return t.onContainerStep;
    var ladder = ladderFor(roleId);
    var containerHex = ladder[t.container] || surfaceBgFor(mode);
    return DTFSolver.deriveOnContainer(ladder, t.content, containerHex).step;
  }

  /* Aggregate contrast for the 3 currently-picked levers of a role */
  function computeRoleContrast(roleId, mode) {
    mode = mode || State.editingMode;
    var t = State.t1[mode][roleId];
    var ev = DTFSolver.evaluateBySteps(ladderFor(roleId), t, mode);
    return { checks: ev.checks, onComp: ev.onComp, onCont: ev.onCont };
  }

  /* Walk each lever to the nearest AA-passing step (minimum disturbance).
     Mutates State.t1 in place so existing callers' side-effects stay. */
  function autoFixT1ToAA(roleId) {
    var mode = State.editingMode;
    var t = State.t1[mode][roleId];
    var ladder = ladderFor(roleId);
    t.fill      = DTFSolver.snapStepToAA(ladder, 'fill',      t.fill,      t, mode);
    t.content   = DTFSolver.snapStepToAA(ladder, 'content',   t.content,   t, mode);
    // Container's AA depends on the (now-snapped) content step.
    t.container = DTFSolver.snapStepToAA(ladder, 'container', t.container, t, mode);
  }

  /* Apply auto-AA fix across every role × mode where the picks fail.
     Used at boot and after Discard/Reset to guarantee every cleared
     role still ships AA defaults regardless of which project's
     primitives.css ladder is loaded. */
  function ensureAllRolesPassAA() {
    var savedMode = State.editingMode;
    ['light','dark'].forEach(function (mode) {
      State.editingMode = mode;
      ROLES.forEach(function (r) {
        var wcag = computeRoleContrast(r.id, mode);
        if (wcag.checks.some(function (c) { return !c.pass; })) autoFixT1ToAA(r.id);
      });
    });
    State.editingMode = savedMode;
  }
  function semanticVarsFor(roleId, mode) {
    var t = State.t1[mode][roleId];
    var fillStep      = t.fill;
    var contentStep   = t.content;
    var containerStep = t.container;
    var get = function (name) { return stepHexByName(roleId, name); };
    var p = roleId; // semantic prefix matches role id (brand, danger, ...)
    var lines = [];
    // Component fill family
    lines.push('  --' + p + '-component-bg-default: ' + get(fillStep) + ';');
    lines.push('  --' + p + '-component-bg-hover: '   + get(stepRel(fillStep, 1)) + ';');
    lines.push('  --' + p + '-component-bg-pressed: ' + get(stepRel(fillStep, 2)) + ';');
    lines.push('  --' + p + '-component-outline-default: ' + get(stepRel(fillStep, -2)) + ';');
    lines.push('  --' + p + '-component-outline-hover: '   + get(stepRel(fillStep, -2)) + ';');
    lines.push('  --' + p + '-component-outline-pressed: ' + get(stepRel(fillStep, -1)) + ';');
    lines.push('  --' + p + '-on-component: ' + onComponentColor(roleId, mode) + ';');
    // Content family
    lines.push('  --' + p + '-content-default: ' + get(contentStep) + ';');
    lines.push('  --' + p + '-content-strong: '  + get(stepRel(contentStep, 1)) + ';');
    lines.push('  --' + p + '-content-subtle: '  + get(stepRel(contentStep, -2)) + ';');
    lines.push('  --' + p + '-content-faint: '   + get(stepRel(contentStep, -3)) + ';');
    // Container family
    var dir = tonalDir(mode);
    lines.push('  --' + p + '-container-bg: '       + get(containerStep) + ';');
    lines.push('  --' + p + '-container-hover: '    + get(stepRel(containerStep, 1 * dir)) + ';');
    lines.push('  --' + p + '-container-pressed: '  + get(stepRel(containerStep, 2 * dir)) + ';');
    lines.push('  --' + p + '-container-outline: ' + get(resolveBorderStep(roleId, mode)) + ';');
    lines.push('  --' + p + '-container-separator: ' + get(resolveSeparatorStep(roleId, mode)) + ';');
    lines.push('  --' + p + '-component-separator: ' + get(stepRel(fillStep, -4)) + ';');
    lines.push('  --' + p + '-on-container: ' + onContainerColor(roleId, mode) + ';');
    return lines;
  }

  /* Emit every --surface-<id>-<prop> as a literal hex for one mode.
     Per the "always emit full ladder" pattern: we ship ALL surfaces
     in both modes whether or not anything is detached, so the
     preview's surfaces.css gets fully shadowed by editor state.
     Guarantees the preview's WCAG eye-test matches the editor's
     WCAG math, with no drift between override and clean cells. */
  function surfaceVarsLinesForMode(mode) {
    var out = [];
    T2_SURFACES.forEach(function (s) {
      T2_PROP_DEFS.forEach(function (p) {
        out.push('  --surface-' + s.id + '-' + p.id + ': ' + t2HexFor(s.id, p.id, mode) + ';');
      });
    });
    return out;
  }

  /* The preview is "surface-aware" when the user is on T2: the body
     repaints as the surface being edited. For any other tier we fall
     back to base so the preview is the canonical default. */
  function activeSurfaceForPreview() {
    if (State.activeTier !== 't2') return 'base';
    return State.activeSurface || 'base';
  }
  function pushActiveSurface() {
    var win = $frame && $frame.contentWindow;
    if (!win) return;
    try {
      win.postMessage({
        type: 'ev2-active-surface',
        surface: activeSurfaceForPreview(),
        tier: State.activeTier
      }, '*');
    } catch (e) {}
  }

  /* Tell the preview canvas to scroll-into-view and flash the
     specific zone painted by --surface-active-<prop>. Used by the
     WCAG popover so the designer SEES where the failing token lives
     and watches it shift when they Apply the suggested step. */
  function pushPvFlash(propId) {
    var win = $frame && $frame.contentWindow;
    if (!win || !propId) return;
    if (State.activeTier !== 't2') return;
    try {
      win.postMessage({ type: 'ev2-pv-flash', prop: propId }, '*');
    } catch (e) {}
  }

  function pushPreview() {
    // contentDocument is null on file:// sandboxed iframes — use postMessage.
    var win = $frame.contentWindow;
    if (!win) return;
    // T0 (palette anchor + ladder) is shared across modes.
    var rootLines = [':root {'];
    ROLES.forEach(function (r) {
      var steps = stepsFor(r.id);
      steps.forEach(function (s) {
        if (s.name === 'white' || s.name === 'black') return;
        rootLines.push('  --prim-' + r.prefix + '-' + s.name + ': ' + s.hex + ';');
      });
      // Light-mode semantic slots also live on :root (default scope).
      semanticVarsFor(r.id, 'light').forEach(function (l) { rootLines.push(l); });
    });
    // T2 surface vars for light mode — same scope as light semantic.
    surfaceVarsLinesForMode('light').forEach(function (l) { rootLines.push(l); });
    rootLines.push('}');
    // Dark-mode semantic + surface slots live under [data-theme="dark"].
    var darkLines = ['[data-theme="dark"] {'];
    ROLES.forEach(function (r) {
      semanticVarsFor(r.id, 'dark').forEach(function (l) { darkLines.push(l); });
    });
    surfaceVarsLinesForMode('dark').forEach(function (l) { darkLines.push(l); });
    darkLines.push('}');
    win.postMessage({ type: 'ev2-overrides', css: rootLines.concat(darkLines).join('\n') }, '*');
    // Tell the preview which role is currently being edited so the
    // contextual cards (Text card, Spotlight alert) reflect that role
    // instead of always showing brand.
    try {
      win.postMessage({ type: 'ev2-active-role', role: State.activeRole }, '*');
    } catch (e) {}
    // Same idea for surface: on T2, repaint preview body on the
    // surface the user is editing. On other tiers, force base.
    pushActiveSurface();
  }

  function refreshChangeBar() {
    var n = totalChanges();
    // Single, plain-English status. "No changes" / "7 unsaved changes".
    $changeCt.textContent = n === 0 ? 'No changes' : (n + ' unsaved change' + (n === 1 ? '' : 's'));
    $discard.disabled = n === 0;
    $deploy.disabled  = n === 0;
    // The badge bubble retired — count is folded into the button label.
    if ($deployN) $deployN.hidden = true;
    if ($deploy) {
      var lbl = $deploy.querySelector('.ev2-deploy-label');
      if (lbl) lbl.textContent = n === 0 ? 'Publish' : ('Publish ' + n + ' change' + (n === 1 ? '' : 's'));
    }
    refreshAutosaveLabel();
    refreshSectionResetBtn();
  }

  function sectionDirtyCount(tierId) {
    var n = 0;
    if (tierId === 't0') {
      ROLES.forEach(function (r) { if (isChanged(r.id)) n++; });
    } else if (tierId === 't1') {
      ROLES.forEach(function (r) { if (isT1Changed(r.id)) n++; });
    } else if (tierId === 't2') {
      n = totalT2Changes();
    }
    return n;
  }

  function refreshSectionResetBtn() {
    var btn = document.getElementById('sectionResetBtn');
    if (!btn) return;
    var tier = State.activeTier;
    // t2 supported even though the render arrives in step 4 — Reset
    // section already needs to flush the (currently empty) override
    // map once step-4 wiring writes to it. Keep t3 unsupported until
    // its own state lands.
    var supported = (tier === 't0' || tier === 't1' || tier === 't2');
    var dirty = supported ? sectionDirtyCount(tier) : 0;
    btn.hidden = !supported;
    btn.disabled = dirty === 0;
    var label = btn.querySelector('.ev2-section-reset-label');
    if (label) {
      var meta = TIER_META[tier];
      label.textContent = 'Reset ' + (meta && meta.title ? meta.title : 'section');
    }
  }

  function refreshAutosaveLabel() {
    // Sub-label lives next to the change count. Stays empty when
    // there are no changes (count IS the status); shows a backup
    // hint when there are unsaved changes.
    var n = totalChanges();
    var sep = document.querySelector('.ev2-savebar-sep');
    if (n === 0) {
      $autosave.textContent = '';
      if (sep) sep.hidden = true;
      return;
    }
    if (sep) sep.hidden = false;
    if (!State.lastSavedAt) { $autosave.textContent = 'backing up\u2026'; return; }
    $autosave.textContent = 'backed up ' + relTime(State.lastSavedAt);
  }

  function relTime(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    return h + 'h ago';
  }

  /* ── Local autosave (Step 6 will add server draft branch) ─ */
  var saveTimer = null;
  function scheduleAutosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var payload = {
          v: 1,
          ts: Date.now(),
          anchor: State.anchor,
          editingMode: State.editingMode,
          proposed: State.proposed,
          t1: State.t1,
          t2: State.t2,
          t2SurfacePalette: State.t2SurfacePalette
        };
        localStorage.setItem(getDraftKey(), JSON.stringify(payload));
        State.lastSavedAt = payload.ts;
        refreshDraftStatus('saved');
        refreshAutosaveLabel();
      } catch (e) {
        refreshDraftStatus('error');
      }
    }, 600);
    refreshDraftStatus('saving');
  }

  function loadDraftFromStorage() {
    try {
      var key = getDraftKey();
      var raw = localStorage.getItem(key);
      // One-shot cleanup: the bare DRAFT_KEY existed before per-
      // project scoping (4839a09). It cannot be safely migrated to
      // a specific project because we no longer know which project
      // it was created for — adopting it would re-pollute whatever
      // project happens to load next. Just delete it.
      if (key !== DRAFT_KEY) {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      }
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (!d || d.v !== 1 || !d.proposed) return false;
      var STEP_OK = {};
      ALL_STEPS.forEach(function (s) { STEP_OK[s] = true; });
      function adoptT1(target, src) {
        if (!src) return;
        if (STEP_OK[src.fill])      target.fill = src.fill;
        if (STEP_OK[src.content])   target.content = src.content;
        if (STEP_OK[src.container]) target.container = src.container;
      }
      ROLES.forEach(function (r) {
        if (d.proposed[r.id]) State.proposed[r.id] = d.proposed[r.id];
        if (!d.t1) return;
        if (d.t1.light || d.t1.dark) {
          adoptT1(State.t1.light[r.id], d.t1.light && d.t1.light[r.id]);
          adoptT1(State.t1.dark[r.id],  d.t1.dark  && d.t1.dark[r.id]);
        } else if (d.t1[r.id]) {
          adoptT1(State.t1.light[r.id], d.t1[r.id]);
          adoptT1(State.t1.dark[r.id],  d.t1[r.id]);
        }
      });
      // T2 adoption \u2014 schema is { mode: { surfaceId: { propId: {step?,follows?} } } }.
      // We validate each leaf against ALL_STEPS / known surface+prop
      // ids so a stale or corrupted draft can't poison the override
      // map. Unknown keys are silently dropped.
      if (d.t2 && typeof d.t2 === 'object') {
        var PROP_OK = {};
        T2_PROP_DEFS.forEach(function (p) { PROP_OK[p.id] = true; });
        ['light','dark'].forEach(function (mode) {
          var srcMode = d.t2[mode];
          if (!srcMode || typeof srcMode !== 'object') return;
          T2_SURFACES.forEach(function (s) {
            var srcSurf = srcMode[s.id];
            if (!srcSurf || typeof srcSurf !== 'object') return;
            Object.keys(srcSurf).forEach(function (propId) {
              if (!PROP_OK[propId]) return;
              var raw = srcSurf[propId];
              if (!raw || typeof raw !== 'object') return;
              var clean = {};
              if (raw.step && STEP_OK[raw.step]) clean.step = raw.step;
              if (typeof raw.follows === 'string' && raw.follows) clean.follows = raw.follows;
              if (clean.step || clean.follows) State.t2[mode][s.id][propId] = clean;
            });
          });
        });
      }
      if (d.editingMode === 'light' || d.editingMode === 'dark') State.editingMode = d.editingMode;
      if (d.anchor === 'exact' || d.anchor === 'normalized') State.anchor = d.anchor;
      // Per-surface source palette — validated against system
      // palette ids AND discovered custom palettes (so a custom
      // pick saved in a prior session survives draft load).
      if (d.t2SurfacePalette && typeof d.t2SurfacePalette === 'object') {
        T2_SURFACES.forEach(function (s) {
          var v = d.t2SurfacePalette[s.id];
          if (typeof v === 'string' && isValidSurfacePalette(v)) {
            State.t2SurfacePalette[s.id] = v;
          }
        });
      }
      State.lastSavedAt = d.ts || null;
      return totalChanges() > 0;
    } catch (e) { return false; }
  }

  function clearDraftFromStorage() {
    try { localStorage.removeItem(getDraftKey()); } catch (e) {}
    // Also nuke the legacy global key so it can't resurface on the
    // next load and re-pollute another project.
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    State.lastSavedAt = null;
  }

  function refreshDraftStatus(state) {
    if (!draftStatus) return;
    draftStatus.setAttribute('data-state', state);
    var label = draftStatus.querySelector('.ev2-draft-text');
    if (!label) return;
    var n = (typeof totalChanges === 'function') ? totalChanges() : 0;
    if (state === 'saving') label.textContent = 'Saving\u2026';
    else if (state === 'saved') {
      // "7 unsaved changes · backed up 2m ago" when dirty,
      // else fall through to the clean state.
      if (n > 0) label.textContent = n + ' unsaved change' + (n === 1 ? '' : 's') + ' \u00b7 backed up ' + relTime(State.lastSavedAt);
      else if (State.lastPublishedVersion) label.textContent = 'Published ' + State.lastPublishedVersion + ' \u00b7 ' + relTime(State.lastSavedAt || Date.now());
      else label.textContent = 'No changes';
    }
    else if (state === 'error') label.textContent = 'Backup failed \u2014 changes only in this tab';
    else if (state === 'published') {
      var v = State.lastPublishedVersion;
      label.textContent = v ? ('Published ' + v + ' \u00b7 just now') : 'Published \u00b7 just now';
    }
    else {
      if (n > 0) label.textContent = n + ' unsaved change' + (n === 1 ? '' : 's');
      else if (State.lastPublishedVersion) label.textContent = 'Published ' + State.lastPublishedVersion;
      else label.textContent = 'No changes yet';
    }
  }

  // Tick the relative timestamp every 30s so it stays honest
  setInterval(function () {
    if (State.lastSavedAt) { refreshDraftStatus('saved'); refreshAutosaveLabel(); }
  }, 30000);

  /* ── Unified palette ladder ──────────────────────────────
     Single renderer for every "22-step ladder of swatches" surface
     in the editor. T0 Roles, T0 System palettes, T0 Custom palettes
     all share this so a Greyscale ladder reads visually identical to
     a Brand ladder.

     opts:
       prefix       — CSS-var prefix ('brand', 'greyscale', 'sage'…)
                      used to render `--prim-<prefix>-<step>` under
                      each swatch when "Show CSS names" is on.
       compareSteps — optional array of {name,hex} to diff against
                      (T0 Roles uses this to mark changed-from-baseline
                      tiles with the brand dot).
       includeBW    — when true, render white + black tiles too
                      (System / Custom palettes use this; T0 Roles
                      skips them since white/black are constants). */
  function paletteLadderHTML(steps, opts) {
    if (!steps || !steps.length) return '';
    opts = opts || {};
    var prefix = opts.prefix || '';
    var compare = opts.compareSteps || null;
    var filtered = opts.includeBW
      ? steps
      : steps.filter(function (s) { return s.name !== 'white' && s.name !== 'black'; });
    return filtered.map(function (s) {
      var b = compare && compare.find(function (x) { return x.name === s.name; });
      var diff = b && b.hex && b.hex.toUpperCase() !== s.hex.toUpperCase();
      var tip = diff
        ? 'Was ' + b.hex.toUpperCase() + ' \u2192 now ' + s.hex.toUpperCase()
        : s.hex.toUpperCase();
      return '<div class="ev2-step"' + (diff ? ' data-changed="true"' : '') + ' title="' + tip + '">'
        + '<div class="ev2-step-sw" style="background:' + s.hex + '"></div>'
        + '<div class="ev2-step-meta">'
          + '<div class="ev2-step-name">' + s.name + '</div>'
          + '<div class="ev2-step-hex">' + s.hex.replace('#','') + '</div>'
          + (prefix ? '<div class="ev2-step-css">--prim-' + prefix + '-' + s.name + '</div>' : '')
        + '</div>'
      + '</div>';
    }).join('');
  }

  function ladderHTML(role) {
    var roleObj = ROLES.find(function (r) { return r.id === role; });
    return paletteLadderHTML(stepsFor(role), {
      prefix: roleObj ? roleObj.prefix : role,
      compareSteps: baselineStepsFor(role)
    });
  }

  /* ── T0 view ──────────────────────────────────────────────
     Sub-tabs: [ Roles | Palettes ].
       Roles    — key-color editing for the 6 primary roles
                  (brand, danger, warning, info, success, neutral).
       Palettes — inventory + CRUD for the system + custom palettes
                  that T2 surfaces consume. This is where palettes
                  are *defined*; T2 is where they're *mapped* to
                  surfaces. */
  function renderT0() {
    $body.innerHTML =
      '<div class="ev2-t0-subs" role="tablist" aria-label="T0 sub-view">'
        + '<button class="ev2-t0-sub" role="tab" data-t0-sub="roles" '
          + 'aria-selected="' + (State.activeT0 === 'roles') + '">Roles</button>'
        + '<button class="ev2-t0-sub" role="tab" data-t0-sub="palettes" '
          + 'aria-selected="' + (State.activeT0 === 'palettes') + '">Palettes</button>'
      + '</div>'
      + (State.activeT0 === 'palettes' ? renderT0Palettes() : renderT0Roles());

    bindT0();
  }

  function renderT0Roles() {
    var role = ROLES.find(function (r) { return r.id === State.activeRole; });
    if (!role) return '';
    var changedThisRole = isChanged(role.id);
    var affects = AFFECTS[role.id] || [];

    return ''
      + '<div class="ev2-roles" role="tablist">'
        + ROLES.map(function (r) {
            var current = r.id === role.id;
            return '<button class="ev2-role" role="tab" data-role-tab="' + r.id + '" '
              + 'aria-current="' + current + '" data-changed="' + isChanged(r.id) + '">'
              + '<span class="ev2-role-dot" style="background:' + State.proposed[r.id] + '"></span>'
              + '<span>' + r.label + '</span>'
              + '</button>';
          }).join('')
      + '</div>'
      + '<div class="ev2-intent">'
        + '<div class="ev2-intent-head">'
          + '<div class="ev2-intent-titlewrap">'
            + '<span class="ev2-intent-title">' + role.label + ' key color</span>'
            + '<span class="ev2-intent-sub">One color. 20 steps recompute. Every component using ' + role.label.toLowerCase() + ' updates.</span>'
          + '</div>'
          + (changedThisRole ? '<span class="ev2-intent-hint">Edited from defaults</span>' : '')
        + '</div>'
        + '<div class="ev2-intent-body">'
          + '<div class="ev2-lever">'
            + '<label class="ev2-swatch" style="background:' + State.proposed[role.id] + '" title="Pick a color">'
              + '<input type="color" id="ev2-color" value="' + State.proposed[role.id] + '">'
            + '</label>'
            + '<div class="ev2-lever-fields">'
              + '<div class="ev2-hex-row">'
                + '<input class="ev2-hex" id="ev2-hex" type="text" spellcheck="false" '
                  + 'value="' + State.proposed[role.id].toUpperCase() + '" maxlength="7">'
                + '<button class="ev2-reset" id="ev2-reset" type="button"' + (changedThisRole ? '' : ' disabled') + '>Reset</button>'
              + '</div>'
              + '<div class="ev2-anchor" role="radiogroup" aria-label="Step 500 anchor">'
                + '<button data-anchor="exact" aria-checked="' + (State.anchor === 'exact') + '" role="radio" '
                  + 'data-tip="Step 500 = your exact hex. Neighbor steps remap around it. Best when you have a brand color you must match precisely.">'
                  + 'Exact match</button>'
                + '<button data-anchor="normalized" aria-checked="' + (State.anchor === 'normalized') + '" role="radio" '
                  + 'data-tip="Step 500 snaps to the standard L*=49 lightness curve. Best for new brands &mdash; gives the most balanced ladder across all 20 steps.">'
                  + 'Normalized</button>'
              + '</div>'
            + '</div>'
          + '</div>'
          + '<div class="ev2-disc"' + (State.disclosure['t0:steps'] ? ' data-open' : '') + ' data-disc="t0:steps">'
            + '<div class="ev2-disc-head" data-toggle="steps">'
              + '<span>20 derived steps</span>'
              + '<span class="ev2-disc-meta">' + (changedThisRole ? 'before \u2192 after' : 'auto-generated') + '</span>'
            + '</div>'
            + '<div class="ev2-disc-body">'
              + '<div class="ev2-ladder">' + ladderHTML(role.id) + '</div>'
            + '</div>'
          + '</div>'
          + '<div class="ev2-disc"' + (State.disclosure['t0:affects'] ? ' data-open' : '') + ' data-disc="t0:affects">'
            + '<div class="ev2-disc-head" data-toggle="affects">'
              + '<span>Affects components</span>'
              + '<span class="ev2-disc-meta">' + affects.length + ' shown</span>'
            + '</div>'
            + '<div class="ev2-disc-body">'
              + '<div class="ev2-affects">'
                + affects.map(function (c) { return '<span class="ev2-aff-chip">' + c + '</span>'; }).join('')
              + '</div>'
            + '</div>'
          + '</div>'
        + '</div>'
      + '</div>';
  }

  /* ── T0 Palettes sub-view ───────────────────────────────
     Two stacked panels: system palettes (greyscale + desaturated,
     read-only — chroma sliders come later) and custom palettes
     (project-discovered + session-added, with Rename / Delete +
     "Add palette" affordance). Each row renders the same ladder
     component the Roles view uses so all ladders read identical. */
  function renderT0Palettes() {
    return ''
      + renderSystemPalettesPanel()
      + renderCustomPalettesPanel();
  }

  function renderSystemPalettesPanel() {
    var rows = [
      { id:'greyscale',   label:'Greyscale',   meta:'chroma 0 \u2014 achromatic' },
      { id:'desaturated', label:'Desaturated', meta:'chroma \u22480.04 \u2014 branded gray' }
    ];
    return '<div class="ev2-sp-panel" data-sp-panel="system">'
      + '<div class="ev2-sp-head">'
        + '<div class="ev2-sp-titlewrap">'
          + '<span class="ev2-sp-title">System palettes</span>'
          + '<span class="ev2-sp-sub">Auto-derived from Brand \u2014 used for surface backgrounds</span>'
        + '</div>'
      + '</div>'
      + '<div class="ev2-sp-list">'
        + rows.map(function (r) {
            var steps = systemPaletteSteps(r.id);
            return '<div class="ev2-sp-row" data-sp-palette="' + r.id + '">'
              + '<div class="ev2-sp-rowhead">'
                + '<span class="ev2-sp-name">' + r.label + '</span>'
                + '<span class="ev2-sp-meta">' + r.meta + '</span>'
              + '</div>'
              + '<div class="ev2-ladder">' + paletteLadderHTML(steps, { prefix: r.id, includeBW: true }) + '</div>'
            + '</div>';
          }).join('')
      + '</div>'
    + '</div>';
  }

  function renderCustomPalettesPanel() {
    var customs = discoverCustomPalettes();
    /* Inline SVG icons \u2014 pencil for rename, trash for delete.
       Kept inline (no icon font) so the editor stays single-file. */
    var ICON_EDIT  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
    var ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
    return '<div class="ev2-sp-panel" data-sp-panel="custom">'
      + '<div class="ev2-sp-head">'
        + '<div class="ev2-sp-titlewrap">'
          + '<span class="ev2-sp-title">Custom palettes</span>'
          + '<span class="ev2-sp-sub">Project-specific palettes \u2014 available under T2 source palette</span>'
        + '</div>'
        + '<button type="button" class="ev2-sp-add" data-add-palette>'
          + '<span class="ev2-sp-add-glyph" aria-hidden="true">+</span> Add palette'
        + '</button>'
      + '</div>'
      + (customs.length
          ? '<div class="ev2-sp-list">'
              + customs.map(function (c) {
                  var steps = customPaletteSteps(c.id);
                  return '<div class="ev2-sp-row" data-sp-palette="' + c.id + '">'
                    + '<div class="ev2-sp-rowhead">'
                      + '<span class="ev2-sp-name">' + c.label + '</span>'
                      + '<span class="ev2-sp-meta">--prim-' + c.id + '-*</span>'
                      + '<span class="ev2-sp-row-actions">'
                        + '<button type="button" class="ev2-sp-action" data-rename-palette="' + c.id + '" '
                          + 'title="Rename palette" aria-label="Rename ' + c.label + ' palette">' + ICON_EDIT + '</button>'
                        + '<button type="button" class="ev2-sp-action" data-danger data-delete-palette="' + c.id + '" '
                          + 'title="Delete palette" aria-label="Delete ' + c.label + ' palette">' + ICON_TRASH + '</button>'
                      + '</span>'
                    + '</div>'
                    + '<div class="ev2-ladder">' + paletteLadderHTML(steps, { prefix: c.id, includeBW: true }) + '</div>'
                  + '</div>';
                }).join('')
            + '</div>'
          : '<div class="ev2-sp-empty">No custom palettes in this project yet. Add one to surface it under T2 source palette.</div>'
        )
    + '</div>';
  }

  function bindT0() {
    /* Sub-tab switching */
    document.querySelectorAll('[data-t0-sub]').forEach(function (b) {
      b.addEventListener('click', function () {
        var sub = b.getAttribute('data-t0-sub');
        if (sub !== 'roles' && sub !== 'palettes') return;
        State.activeT0 = sub;
        saveUIState();
        renderT0();
      });
    });

    /* Roles sub-view bindings (the elements only exist on T0 Roles) */
    if (State.activeT0 === 'roles') bindT0Roles();
    /* Palettes sub-view bindings (Add / Rename / Delete) */
    else if (State.activeT0 === 'palettes') bindT0Palettes();
  }

  function bindT0Roles() {
    document.querySelectorAll('[data-role-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        State.activeRole = b.getAttribute('data-role-tab');
        saveUIState();
        renderT0();
      });
    });
    document.querySelectorAll('.ev2-disc-head').forEach(function (h) {
      h.addEventListener('click', function () {
        var disc = h.parentElement;
        var key = disc.getAttribute('data-disc');
        var nowOpen = !disc.hasAttribute('data-open');
        if (nowOpen) disc.setAttribute('data-open', '');
        else disc.removeAttribute('data-open');
        if (key) State.disclosure[key] = nowOpen;
        saveUIState();
      });
    });
    document.querySelectorAll('[data-anchor]').forEach(function (b) {
      b.addEventListener('click', function () {
        State.anchor = b.getAttribute('data-anchor');
        State.cachedSteps = {};
        pushPreview();
        renderT0();
        refreshChangeBar();
        scheduleAutosave();
        saveUIState();
      });
    });

    var $color = document.getElementById('ev2-color');
    var $hex   = document.getElementById('ev2-hex');
    var $reset = document.getElementById('ev2-reset');

    if ($color) $color.addEventListener('input', function () { setHex($color.value); });
    if ($hex) $hex.addEventListener('input', function () {
      var v = $hex.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        $hex.removeAttribute('data-invalid');
        setHex(v);
      } else {
        $hex.setAttribute('data-invalid', '');
      }
    });
    if ($reset) $reset.addEventListener('click', function () {
      setHex(State.baseline[State.activeRole]);
      renderT0();
    });
  }

  function bindT0Palettes() {
    var addBtn = document.querySelector('[data-add-palette]');
    if (addBtn) addBtn.addEventListener('click', function () { openAddPaletteDialog(); });

    document.querySelectorAll('[data-rename-palette]').forEach(function (b) {
      b.addEventListener('click', function () {
        openRenamePaletteDialog(b.getAttribute('data-rename-palette'));
      });
    });
    document.querySelectorAll('[data-delete-palette]').forEach(function (b) {
      b.addEventListener('click', function () {
        confirmDeletePalette(b.getAttribute('data-delete-palette'));
      });
    });
  }

  /* ── Add / Rename palette dialog ────────────────────────
     One <dialog>-style modal scaffolded in index.html
     (#ev2AddPalette). Reused for both create + rename:
       mode='add'    \u2192 name + color pickers, live ladder preview,
                       confirm injects a new custom palette.
       mode='rename' \u2192 name picker only; color + ladder hidden.
                       Confirm renames the palette's --prim-<id>-*
                       block and migrates any t2SurfacePalette refs. */
  var _addPalState = { mode: 'add', origId: null, hex: '#6B7390' };

  function openAddPaletteDialog() {
    _addPalState = { mode: 'add', origId: null, hex: '#6B7390' };
    var modal = document.getElementById('ev2AddPalette');
    if (!modal) return;
    document.getElementById('ev2AddPaletteTitle').textContent = 'Add custom palette';
    document.querySelector('#ev2AddPalConfirm').textContent = 'Add palette';
    document.getElementById('ev2AddPalName').value = '';
    document.getElementById('ev2AddPalName').removeAttribute('data-invalid');
    document.getElementById('ev2AddPalNameHint').removeAttribute('data-error');
    document.getElementById('ev2AddPalNameHint').textContent = 'Lowercase letters, numbers, dashes. Must be unique.';
    document.getElementById('ev2AddPalColor').value = _addPalState.hex.toLowerCase();
    document.getElementById('ev2AddPalHex').value = _addPalState.hex.toUpperCase();
    document.getElementById('ev2AddPalSwatch').style.background = _addPalState.hex;
    /* Show color + ladder fields (rename hides them) */
    var colorField = document.getElementById('ev2AddPalColor').closest('.ev2-addpal-field');
    var stripField = document.getElementById('ev2AddPalStrip').closest('.ev2-addpal-field');
    if (colorField) colorField.style.display = '';
    if (stripField) stripField.style.display = '';
    renderAddPalettePreview();
    showAddPaletteModal();
    setTimeout(function () { document.getElementById('ev2AddPalName').focus(); }, 30);
  }

  function openRenamePaletteDialog(id) {
    var customs = discoverCustomPalettes();
    var existing = customs.find(function (c) { return c.id === id; });
    if (!existing) return;
    _addPalState = { mode: 'rename', origId: id, hex: null };
    var modal = document.getElementById('ev2AddPalette');
    if (!modal) return;
    document.getElementById('ev2AddPaletteTitle').textContent = 'Rename palette';
    document.querySelector('#ev2AddPalConfirm').textContent = 'Rename';
    document.getElementById('ev2AddPalName').value = id;
    document.getElementById('ev2AddPalName').removeAttribute('data-invalid');
    document.getElementById('ev2AddPalNameHint').removeAttribute('data-error');
    document.getElementById('ev2AddPalNameHint').textContent = 'Lowercase letters, numbers, dashes. Must be unique.';
    /* Hide color + ladder (rename only changes the id, not the colors) */
    var colorField = document.getElementById('ev2AddPalColor').closest('.ev2-addpal-field');
    var stripField = document.getElementById('ev2AddPalStrip').closest('.ev2-addpal-field');
    if (colorField) colorField.style.display = 'none';
    if (stripField) stripField.style.display = 'none';
    validateAddPaletteForm();
    showAddPaletteModal();
    setTimeout(function () {
      var n = document.getElementById('ev2AddPalName');
      n.focus(); n.select();
    }, 30);
  }

  function showAddPaletteModal() {
    var modal = document.getElementById('ev2AddPalette');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('ev2-modal-open');
  }
  function hideAddPaletteModal() {
    var modal = document.getElementById('ev2AddPalette');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('ev2-modal-open');
  }

  /* Live preview re-renders the 22-step ladder strip every time
     the color picker or hex input changes, so designers SEE what
     they're about to add before they confirm. */
  function renderAddPalettePreview() {
    if (_addPalState.mode !== 'add') return;
    var strip = document.getElementById('ev2AddPalStrip');
    if (!strip || !window.PaletteEngine) return;
    try {
      var pal = window.PaletteEngine.generatePalette(_addPalState.hex, { anchor: State.anchor || 'normalized' });
      strip.innerHTML = pal.steps.map(function (s) {
        return '<span class="ev2-sp-sw" style="background:' + s.hex
          + '" title="' + s.name + ' \u2014 ' + s.hex.toUpperCase() + '"></span>';
      }).join('');
    } catch (e) {
      strip.innerHTML = '';
    }
  }

  function validateAddPaletteForm() {
    var name = (document.getElementById('ev2AddPalName').value || '').trim().toLowerCase();
    var hint = document.getElementById('ev2AddPalNameHint');
    var input = document.getElementById('ev2AddPalName');
    var confirmBtn = document.getElementById('ev2AddPalConfirm');
    var ok = true;
    var msg = 'Lowercase letters, numbers, dashes. Must be unique.';
    if (!name) {
      ok = false; msg = 'Name is required.';
    } else if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      ok = false; msg = 'Lowercase letters, numbers, dashes \u2014 must start with a letter.';
    } else if (SYSTEM_PALETTE_IDS[name]) {
      ok = false; msg = '"' + name + '" is a reserved system palette id.';
    } else if (_addPalState.mode === 'add'
               && discoverCustomPalettes().some(function (c) { return c.id === name; })) {
      ok = false; msg = '"' + name + '" already exists.';
    } else if (_addPalState.mode === 'rename'
               && name !== _addPalState.origId
               && discoverCustomPalettes().some(function (c) { return c.id === name; })) {
      ok = false; msg = '"' + name + '" already exists.';
    }
    if (ok) {
      input.removeAttribute('data-invalid');
      hint.removeAttribute('data-error');
    } else {
      input.setAttribute('data-invalid', '');
      hint.setAttribute('data-error', '');
    }
    hint.textContent = msg;
    confirmBtn.disabled = !ok;
    return ok;
  }

  /* Bind the dialog's controls once on boot \u2014 markup is static
     in index.html so wiring happens once, not on each open. */
  function bindAddPaletteDialog() {
    var modal = document.getElementById('ev2AddPalette');
    if (!modal) return;
    modal.querySelectorAll('[data-addpal-dismiss]').forEach(function (el) {
      el.addEventListener('click', hideAddPaletteModal);
    });
    var name = document.getElementById('ev2AddPalName');
    var color = document.getElementById('ev2AddPalColor');
    var hex = document.getElementById('ev2AddPalHex');
    var confirmBtn = document.getElementById('ev2AddPalConfirm');
    if (name) name.addEventListener('input', validateAddPaletteForm);
    if (color) color.addEventListener('input', function () {
      _addPalState.hex = color.value.toUpperCase();
      hex.value = _addPalState.hex;
      hex.removeAttribute('data-invalid');
      document.getElementById('ev2AddPalSwatch').style.background = _addPalState.hex;
      renderAddPalettePreview();
    });
    if (hex) hex.addEventListener('input', function () {
      var v = hex.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        hex.removeAttribute('data-invalid');
        _addPalState.hex = v.toUpperCase();
        color.value = _addPalState.hex.toLowerCase();
        document.getElementById('ev2AddPalSwatch').style.background = _addPalState.hex;
        renderAddPalettePreview();
      } else {
        hex.setAttribute('data-invalid', '');
      }
    });
    if (confirmBtn) confirmBtn.addEventListener('click', function () {
      if (!validateAddPaletteForm()) return;
      var newName = document.getElementById('ev2AddPalName').value.trim().toLowerCase();
      if (_addPalState.mode === 'add') {
        injectCustomPalette(newName, _addPalState.hex);
        hideAddPaletteModal();
        window.ev2Toast && window.ev2Toast('Added custom palette \u201C' + newName + '\u201D', 'ok');
      } else if (_addPalState.mode === 'rename') {
        if (newName === _addPalState.origId) { hideAddPaletteModal(); return; }
        renameCustomPalette(_addPalState.origId, newName);
        hideAddPaletteModal();
        window.ev2Toast && window.ev2Toast('Renamed to \u201C' + newName + '\u201D', 'ok');
      }
    });
    /* Esc closes */
    modal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); hideAddPaletteModal(); }
    });
  }

  function confirmDeletePalette(id) {
    var customs = discoverCustomPalettes();
    var c = customs.find(function (x) { return x.id === id; });
    if (!c) return;
    /* Count surfaces currently using this palette so the confirm
       message warns the user that those surfaces will fall back. */
    var refs = 0;
    if (State.t2SurfacePalette) {
      Object.keys(State.t2SurfacePalette).forEach(function (sid) {
        if (State.t2SurfacePalette[sid] === id) refs++;
      });
    }
    var msg = 'Delete custom palette \u201C' + c.label + '\u201D?';
    if (refs > 0) msg += ' ' + refs + ' surface' + (refs === 1 ? '' : 's')
                     + ' will fall back to the default palette.';
    openModal({
      title: 'Delete palette',
      body: msg,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      kind: 'danger',
      onConfirm: function () { deleteCustomPalette(id); }
    });
  }

  /* Build a 22-step ladder from a key hex and inject it as a
     --prim-<id>-* block into BOTH the editor document (so
     customPaletteSteps can read the values via getComputedStyle)
     AND the preview iframe (so the live preview can paint with the
     new palette). Cache invalidation forces discovery to re-scan. */
  function injectCustomPalette(id, keyHex) {
    var palette = window.PaletteEngine.generatePalette(keyHex, { anchor: State.anchor || 'normalized' });
    var cssLines = palette.steps.map(function (s) {
      return '  --prim-' + id + '-' + s.name + ': ' + s.hex + ';';
    });
    var css = ':root {\n' + cssLines.join('\n') + '\n}';
    /* Single shared <style id="ev2-custom-palettes"> holds every
       runtime-injected palette as concatenated :root blocks. We
       index per-id inside the style by data attributes so a future
       "rename / delete" can target one without nuking the others. */
    var styleEl = document.getElementById('ev2-custom-palettes');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'ev2-custom-palettes';
      styleEl.setAttribute('data-ev2-custom', '');
      document.head.appendChild(styleEl);
    }
    /* Append (palette ids are validated unique above). Wrap each
       palette in a marker comment so a future remove-by-id pass
       can splice it out by string search. */
    styleEl.textContent += '\n/* @ev2-custom-palette:' + id + ' */\n' + css + '\n/* @ev2-custom-palette-end:' + id + ' */\n';
    /* Mirror into the preview iframe so previews paint with the
       new palette too. */
    try {
      $frame.contentWindow.postMessage({ type: 'ev2-custom-palette', id: id, css: css }, '*');
    } catch (e) {}
    /* Force discovery + step caches to re-scan. */
    _customPalettesCache = null;
    delete _systemPaletteCache[id];
    /* Re-render T0 (so the new row appears under Custom palettes)
       and T2 if it's active (so picker shows the new option). */
    if (State.activeTier === 't0') renderT0();
    else if (State.activeTier === 't2') renderT2();
  }

  /* ── Rename a custom palette ────────────────────────────
     Splices the existing palette block out of the shared <style>
     and re-injects under the new id. Surfaces using the old id in
     State.t2SurfacePalette are migrated to the new id so the live
     preview doesn't fall back. Mirrored to the iframe via
     postMessage. */
  function renameCustomPalette(oldId, newId) {
    var styleEl = document.getElementById('ev2-custom-palettes');
    if (!styleEl) return;
    var src = styleEl.textContent;
    var start = src.indexOf('/* @ev2-custom-palette:' + oldId + ' */');
    var endMark = '/* @ev2-custom-palette-end:' + oldId + ' */';
    var endIdx = src.indexOf(endMark);
    if (start < 0 || endIdx < 0) return;
    var block = src.slice(start, endIdx + endMark.length);
    /* Swap the id in the block body */
    var newBlock = block
      .replace(new RegExp('@ev2-custom-palette:' + oldId, 'g'), '@ev2-custom-palette:' + newId)
      .replace(new RegExp('@ev2-custom-palette-end:' + oldId, 'g'), '@ev2-custom-palette-end:' + newId)
      .replace(new RegExp('--prim-' + oldId + '-', 'g'), '--prim-' + newId + '-');
    styleEl.textContent = src.slice(0, start) + newBlock + src.slice(endIdx + endMark.length);
    try {
      $frame.contentWindow.postMessage({ type: 'ev2-custom-palette-rename', oldId: oldId, newId: newId }, '*');
    } catch (e) {}
    /* Migrate surface assignments */
    if (State.t2SurfacePalette) {
      Object.keys(State.t2SurfacePalette).forEach(function (sid) {
        if (State.t2SurfacePalette[sid] === oldId) State.t2SurfacePalette[sid] = newId;
      });
    }
    _customPalettesCache = null;
    delete _systemPaletteCache[oldId];
    delete _systemPaletteCache[newId];
    scheduleAutosave();
    if (State.activeTier === 't0') renderT0();
    else if (State.activeTier === 't2') renderT2();
  }

  /* ── Delete a custom palette ────────────────────────────
     Splices the block out, drops any surface assignments pointing
     at it (those surfaces revert to their default palette), and
     tells the preview to remove the injected block. */
  function deleteCustomPalette(id) {
    var styleEl = document.getElementById('ev2-custom-palettes');
    if (styleEl) {
      var src = styleEl.textContent;
      var start = src.indexOf('/* @ev2-custom-palette:' + id + ' */');
      var endMark = '/* @ev2-custom-palette-end:' + id + ' */';
      var endIdx = src.indexOf(endMark);
      if (start >= 0 && endIdx >= 0) {
        styleEl.textContent = src.slice(0, start) + src.slice(endIdx + endMark.length);
      }
    }
    try {
      $frame.contentWindow.postMessage({ type: 'ev2-custom-palette-remove', id: id }, '*');
    } catch (e) {}
    if (State.t2SurfacePalette) {
      Object.keys(State.t2SurfacePalette).forEach(function (sid) {
        if (State.t2SurfacePalette[sid] === id) delete State.t2SurfacePalette[sid];
      });
    }
    _customPalettesCache = null;
    delete _systemPaletteCache[id];
    scheduleAutosave();
    window.ev2Toast && window.ev2Toast('Deleted palette', 'ok');
    if (State.activeTier === 't0') renderT0();
    else if (State.activeTier === 't2') renderT2();
  }

  function setHex(hex) {
    var role = State.activeRole;
    State.proposed[role] = hex.toUpperCase();
    delete State.cachedSteps[role];
    /* Brand drives the system surface palettes (greyscale +
       desaturated are seeded from brand's hue). Invalidate their
       caches so the swatches under T2 repaint against the new
       brand. Other role edits don't affect surfaces. */
    if (role === 'brand') {
      delete _systemPaletteCache.greyscale;
      delete _systemPaletteCache.desaturated;
    }
    pushPreview();
    refreshChangeBar();
    scheduleAutosave();

    var swatch = document.querySelector('.ev2-swatch');
    if (swatch) swatch.style.background = State.proposed[role];
    var hexInput = document.getElementById('ev2-hex');
    if (hexInput && document.activeElement !== hexInput) hexInput.value = State.proposed[role];
    var colorInput = document.getElementById('ev2-color');
    if (colorInput && document.activeElement !== colorInput) colorInput.value = State.proposed[role].toLowerCase();
    var dot = document.querySelector('[data-role-tab="' + role + '"] .ev2-role-dot');
    if (dot) dot.style.background = State.proposed[role];
    var tab = document.querySelector('[data-role-tab="' + role + '"]');
    if (tab) tab.setAttribute('data-changed', isChanged(role));
    var reset = document.getElementById('ev2-reset');
    if (reset) reset.disabled = !isChanged(role);

    // Refresh ladder
    var ladder = document.querySelector('.ev2-ladder');
    if (ladder) ladder.innerHTML = ladderHTML(role);

    // Toggle "Changed" pill
    var head = document.querySelector('.ev2-intent-head');
    if (head) {
      var pill = head.querySelector('.ev2-intent-hint');
      var resetBtn = head.querySelector('.ev2-role-reset');
      if (isChanged(role) && !pill) {
        var hint = '<span class="ev2-intent-hint">Edited from defaults</span>';
        if (resetBtn) resetBtn.insertAdjacentHTML('beforebegin', hint);
        else head.insertAdjacentHTML('beforeend', hint);
      } else if (!isChanged(role) && pill) {
        pill.remove();
      }
    }
  }

  function renderTierPlaceholder(tier) {
    var meta = TIER_META[tier];
    var letter = tier === 't1' ? 'b' : tier === 't2' ? 'c' : 'd';
    $body.innerHTML =
      '<div class="ev2-empty">'
        + '<div class="ev2-empty-icon" aria-hidden="true">\u25cc</div>'
        + '<div class="ev2-empty-title">' + meta.title + ' intent coming next</div>'
        + '<div class="ev2-empty-sub">Step 2' + letter + ' wires this tier with the same intent + live-preview pattern as Palette.</div>'
      + '</div>';
  }

  /* ── T2 Surfaces ──────────────────────────────────────
     Build step 4 (per docs §11): render the surface picker + family
     groups using the frozen Property Card from §4. Reads the state
     model shipped in step 3 (resolveT2Step / isT2Changed) and writes
     overrides back via setT2Step / clearT2Override below.

     Out of scope for this commit:
     - "follows" pointer (no T1 cascade until step 5).
     - Bulk ops (step 5).
     - Live preview push (step 6 \u2014 needs preview composition update).
     - T1 migration to the same primitive (separate commit). */

  /* WCAG sentinel per docs \u00a77 \u2014 baseline + threshold per property
     family. Returns { baseline:'<token-css-name>', baselineHex, ratio,
     judge, large } so the Property Card can render the standardized
     "X.XX:1 vs <token> [grade]" string. */
  function t2Sentinel(surfaceId, propId, mode) {
    var prop = T2_PROP_DEFS.find(function (p) { return p.id === propId; });
    if (!prop) return null;
    var cellHex = t2HexFor(surfaceId, propId, mode);
    var baselineProp, large = false, intent = 'text';
    // intent is 'text' (WCAG 1.4.3) or 'edge' (1.4.11). 'edge' is
    // informational: 3:1 is only mandatory when the border alone
    // identifies the region; shadow/spacing can substitute.
    if (prop.family === 'content') {
      baselineProp = 'bg';
      large = (propId === 'ct-subtle' || propId === 'ct-faint');
      intent = 'text';
    } else if (propId === 'cm-outline' || propId === 'cm-outline-hover' || propId === 'cm-outline-pressed') {
      baselineProp = 'cm-bg';
      large = true;
      intent = 'edge';
    } else if (propId === 'outline') {
      baselineProp = 'bg';
      large = true;
      intent = 'edge';
    } else {
      // subtle, strong, separator, cm-separator, bg, cm-bg trio --
      // no sentinel. Tints + dividers are informational; cm-bg trio
      // encodes elevation/state, not page-region contrast (paired
      // with shadow in practice). The old check that pitted cm-bg
      // against page bg @ 3:1 was a category error.
      return null;
    }
    var baselineHex = t2HexFor(surfaceId, baselineProp, mode);
    var ratio = contrastRatio(cellHex, baselineHex);
    var judge = wcagJudge(ratio, large);
    return {
      baseline: '--surface-' + surfaceId + '-' + baselineProp,
      baselineHex: baselineHex,
      ratio: ratio,
      judge: judge,
      large: large,
      intent: intent
    };
  }

  /* Walks the surface's palette ladder from the current step in the
     direction that increases contrast against the baseline, returns
     the FIRST step that crosses the threshold (3 for large/edge,
     4.5 for normal text). Null if the current step already passes
     or no step in the ladder reaches threshold. Used by the WCAG
     popover to render a one-click "Apply" suggestion. */
  function t2SuggestStep(surfaceId, propId, mode) {
    var sent = t2Sentinel(surfaceId, propId, mode);
    if (!sent || sent.judge.pass) return null;
    var threshold = sent.large ? 3 : 4.5;
    var surface = T2_SURFACES.find(function (s) { return s.id === surfaceId; });
    if (!surface) return null;
    var ladder = t2LadderFor(surfaceId);
    var current = resolveT2Step(surfaceId, propId, mode);
    var curIdx = -1;
    for (var i = 0; i < ladder.length; i++) {
      if (ladder[i].name === current) { curIdx = i; break; }
    }
    if (curIdx < 0) return null;
    // Which way pushes us further from baseline? Whichever side of
    // the baseline we're already on, push further. If we're sitting
    // ON the baseline, default to darker (works in light mode; in
    // dark mode users will see it as "toward white" once tonalDir
    // mirrors). The ladder order is white -> ... -> black (idx 0..21)
    // so "darker" = +1 in idx.
    var cellHex = ladder[curIdx].hex;
    // Try both directions; prefer the closer step that crosses
    // threshold. Skips having to luminance-compare upfront.
    function walk(dir) {
      for (var d = 1; d < ladder.length; d++) {
        var j = curIdx + dir * d;
        if (j < 0 || j >= ladder.length) return null;
        var r = contrastRatio(ladder[j].hex, sent.baselineHex);
        if (r >= threshold) {
          return { idx: j, dist: d, hex: ladder[j].hex, name: ladder[j].name, ratio: r };
        }
      }
      return null;
    }
    var darker = walk(+1);
    var lighter = walk(-1);
    var pick = null;
    if (darker && lighter) pick = (darker.dist <= lighter.dist) ? darker : lighter;
    else pick = darker || lighter;
    if (!pick) return null;
    return {
      step: pick.name,
      hex: pick.hex,
      ratio: pick.ratio,
      judge: wcagJudge(pick.ratio, sent.large),
      threshold: threshold,
      baselineHex: sent.baselineHex,
      baselineToken: sent.baseline,
      intent: sent.intent,
      large: sent.large,
      currentStep: current,
      currentHex: cellHex,
      currentRatio: sent.ratio
    };
  }

  /* Human-readable WCAG tip for the sentinel chip. Replaces the
     old "1.29:1 vs --surface-bright-bg (AA large 3:1)" line, which
     was technically correct but read as a hash to anyone who isn't
     fluent in WCAG token names. Built dynamically so the message
     reflects what FAILED, what the threshold is, and what to do. */
  function wcagTipText(sent, tokenName) {
    var role = wcagRoleFromToken(tokenName);
    var threshold = sent.large ? 3 : 4.5;
    var ratio = sent.ratio.toFixed(2) + ':1';
    var baselineShort = sent.baseline.replace(/^--surface-[^-]+-/, '');
    // Edge intent (outline / cm-outline trio): 3:1 is ONLY required
    // when the border identifies the region by itself. Most designs
    // pair a faint border with shadow or spacing, in which case a
    // sub-3:1 ratio is perfectly fine. We reframe the chip instead
    // of crying "FAIL".
    if (sent.intent === 'edge') {
      if (sent.judge.pass) {
        return (ratio + ' against ' + baselineShort + ' \u2014 clears the 3:1 minimum, so this border can identify the region on its own.').replace(/"/g, '&quot;');
      }
      return ('Below the 3:1 minimum against ' + baselineShort + '. Fine if you pair this border with a shadow or spacing (WCAG 1.4.11), otherwise step it ' + role.direction + '.').replace(/"/g, '&quot;');
    }
    // Text intent (content family) \u2014 strict pass/fail, prescriptive
    // remedy when below threshold.
    var lead = sent.judge.pass
      ? 'Passes \u2014 '
      : (sent.ratio >= threshold - 0.5 ? 'Just below \u2014 ' : 'Fails \u2014 ');
    var body = sent.judge.pass
      ? role.what + ' reads on ' + baselineShort + '.'
      : role.what + ' is under the ' + threshold + ':1 minimum against ' + baselineShort + ' for ' + role.usage + '.';
    var hint = sent.judge.pass ? '' : '  Try stepping it ' + role.direction + ', or step ' + baselineShort + ' the other way.';
    return (lead + body + hint).replace(/"/g, '&quot;');
  }
  /* Per-prop short copy used inside wcagTipText, so a fail on
     `outline` reads "This outline" rather than "This surface-bright-
     outline cell". Keeps the tip about the user's intent, not the
     CSS variable name. */
  function wcagRoleFromToken(tokenName) {
    var prop = (tokenName || '').replace(/^--surface-[^-]+-/, '');
    if (prop === 'outline')           return { what:'This outline',      usage:'UI borders (WCAG 1.4.11)', direction:'darker' };
    if (prop === 'ct-default' || prop === 'ct-strong')
                                       return { what:'This body text',    usage:'body copy (WCAG 1.4.3)',  direction:'darker' };
    if (prop === 'ct-subtle' || prop === 'ct-faint')
                                       return { what:'This support text', usage:'large/secondary text',     direction:'darker' };
    if (prop === 'cm-outline' || prop === 'cm-outline-hover' || prop === 'cm-outline-pressed')
                                       return { what:'This component border', usage:'UI borders (WCAG 1.4.11)', direction:'darker' };
    return { what:'This color', usage:'UI elements', direction:'further away from the baseline' };
  }

  function setT2Step(surfaceId, propId, mode, newStep) {
    if (ALL_STEPS.indexOf(newStep) < 0) return;
    var def = defaultT2Step(surfaceId, propId, mode);
    if (!State.t2[mode][surfaceId]) State.t2[mode][surfaceId] = {};
    if (newStep === def) {
      // Step matches the default again \u2014 drop the override so the
      // card reverts to its "follows default" rendering. Keeps the
      // override map minimal and lets cascade math stay clean.
      delete State.t2[mode][surfaceId][propId];
    } else {
      State.t2[mode][surfaceId][propId] = { step: newStep };
    }
    scheduleAutosave();
    refreshChangeBar();
    renderT2();
    pushPreview();
  }
  function clearT2Override(surfaceId, propId, mode) {
    if (State.t2[mode] && State.t2[mode][surfaceId]) {
      delete State.t2[mode][surfaceId][propId];
    }
    scheduleAutosave();
    refreshChangeBar();
    renderT2();
    pushPreview();
  }

  /* ── T1 lever write path ─────────────────────────────
     Mirrors setT2Step / clearT2Override so the Property Card
     primitive's stepper / reset / ladder-pick handlers can dispatch
     by tier. T1 state shape is { mode: { roleId: { fill, content,
     container } } } — there's no separate override map (unlike T2),
     so "detached" just means "different from default". */
  function setT1Lever(roleId, leverId, mode, newStep) {
    if (ALL_STEPS.indexOf(newStep) < 0) return;
    var t = t1For(roleId, mode);
    if (!t || t[leverId] === newStep) return;
    t[leverId] = newStep;
    scheduleAutosave();
    refreshChangeBar();
    renderT1();
    pushPreview();
  }
  function clearT1Lever(roleId, leverId, mode) {
    var def = defaultT1ForRole(roleId, mode);
    var t = t1For(roleId, mode);
    if (!t || !def || t[leverId] === def[leverId]) return;
    t[leverId] = def[leverId];
    scheduleAutosave();
    refreshChangeBar();
    renderT1();
    pushPreview();
  }
  function t1LeverIsDetached(roleId, leverId, mode) {
    var t = t1For(roleId, mode);
    var d = defaultT1ForRole(roleId, mode);
    return !!(t && d && t[leverId] !== d[leverId]);
  }

  /* Write/restore an override for a derived T1 value. onComponent
     stores the picked step name verbatim ('white' | 'black');
     everything else stores a step from ALL_STEPS. Clearing falls
     back to the auto-derivation. */
  function setT1Derived(roleId, derivedId, mode, newStep) {
    var t = t1For(roleId, mode);
    if (!t) return;
    if (derivedId === 'onComponent') {
      if (newStep !== 'white' && newStep !== 'black') return;
      if (t.onComponent === newStep) return;
      t.onComponent = newStep;
    } else if (derivedId === 'border') {
      if (ALL_STEPS.indexOf(newStep) < 0) return;
      if (t.borderStep === newStep) return;
      t.borderStep = newStep;
    } else if (derivedId === 'separator') {
      if (ALL_STEPS.indexOf(newStep) < 0) return;
      if (t.separatorStep === newStep) return;
      t.separatorStep = newStep;
    } else if (derivedId === 'onContainer') {
      if (ALL_STEPS.indexOf(newStep) < 0) return;
      if (t.onContainerStep === newStep) return;
      t.onContainerStep = newStep;
    } else { return; }
    scheduleAutosave();
    refreshChangeBar();
    renderT1();
    pushPreview();
  }
  function clearT1Derived(roleId, derivedId, mode) {
    var t = t1For(roleId, mode);
    if (!t) return;
    var changed = false;
    if (derivedId === 'border' && t.borderStep) { delete t.borderStep; changed = true; }
    else if (derivedId === 'separator' && t.separatorStep) { delete t.separatorStep; changed = true; }
    else if (derivedId === 'onComponent' && t.onComponent) { delete t.onComponent; changed = true; }
    else if (derivedId === 'onContainer' && t.onContainerStep) { delete t.onContainerStep; changed = true; }
    if (!changed) return;
    scheduleAutosave();
    refreshChangeBar();
    renderT1();
    pushPreview();
  }

  /* T1 equivalents of t2Sentinel / t2SuggestStep — let the WCAG
     popover open from a T1 lever chip exactly like a T2 prop chip.
     Per-lever baseline mirrors the solver's judgeStepForLever:
       fill      → "on-component" auto-derived from the fill hex
                   (white or black, whichever wins ≥4.5:1)
       content   → surface base bg for the current mode
       container → deriveOnContainer against the container itself
     intent flags steer the popover preview: 'fill' renders a filled
     pill; 'text' renders the role's purpose copy. */
  function t1Sentinel(roleId, leverId, mode) {
    var ladder = ladderFor(roleId);
    var picks  = t1For(roleId, mode);
    if (!ladder || !picks) return null;
    var step = picks[leverId];
    var hex  = ladder[step];
    if (!hex) return null;
    var j = DTFSolver.judgeStepForLever(ladder, leverId, step, picks, mode);
    var role = ROLES.find(function (r) { return r.id === roleId; });
    var prefix = role ? role.prefix : roleId;
    var sent;
    if (leverId === 'fill') {
      var rW = contrastRatio(hex, '#FFFFFF'), rB = contrastRatio(hex, '#0A0A0A');
      var onComp = rW >= rB ? '#FFFFFF' : '#0A0A0A';
      sent = {
        intent: 'fill', large: false,
        baselineHex: onComp,
        baseline: '--' + prefix + '-on-component',
        ratio: j.ratio, judge: { pass: j.pass, grade: j.grade },
        fillHex: hex
      };
    } else if (leverId === 'content') {
      var pageBg = surfaceBgFor(mode);
      sent = {
        intent: 'text', large: false,
        baselineHex: pageBg,
        baseline: '--surface-base-bg',
        ratio: j.ratio, judge: { pass: j.pass, grade: j.grade }
      };
    } else { // container
      // judge already gave us deriveOnContainer's ratio; surface the
      // computed on-container hex so the popover can render the
      // legible pairing the solver actually scores.
      var info = DTFSolver.deriveOnContainer(ladder, picks.content, hex);
      sent = {
        intent: 'container', large: false,
        baselineHex: hex,                 // container bg
        baseline: '--' + prefix + '-container-bg',
        ratio: j.ratio, judge: { pass: j.pass, grade: j.grade },
        onContainerHex: info.hex
      };
    }
    return sent;
  }
  function t1SuggestStep(roleId, leverId, mode) {
    var sent = t1Sentinel(roleId, leverId, mode);
    if (!sent || sent.judge.pass) return null;
    var ladder = ladderFor(roleId);
    var picks  = t1For(roleId, mode);
    var current = picks[leverId];
    var step = DTFSolver.snapStepToAA(ladder, leverId, current, picks, mode);
    if (!step || step === current) return null;
    var hex = ladder[step];
    var j = DTFSolver.judgeStepForLever(ladder, leverId, step, picks, mode);
    if (!j.pass) return null;
    return {
      step: step,
      hex: hex,
      ratio: j.ratio,
      judge: { pass: j.pass, grade: j.grade },
      baselineHex: sent.baselineHex
    };
  }
  function t1HexFor(roleId, leverId, mode) {
    var ladder = ladderFor(roleId);
    var picks  = t1For(roleId, mode);
    if (!ladder || !picks) return '#000';
    return ladder[picks[leverId]] || '#000';
  }
  function t1TokenName(roleId, leverId) {
    var role = ROLES.find(function (r) { return r.id === roleId; });
    var prefix = role ? role.prefix : roleId;
    if (leverId === 'fill')      return '--' + prefix + '-component-bg-default';
    if (leverId === 'content')   return '--' + prefix + '-content-default';
    if (leverId === 'container') return '--' + prefix + '-container-bg';
    return '--' + prefix + '-' + leverId;
  }

  /* ── T2 bulk ops ─────────────────────────────────────
     Three high-frequency designer shortcuts wired into a per-row
     overflow menu. All write through the same setT2Step path so
     the auto-default-drop logic still keeps the override map clean
     (e.g. applying step that equals the dark-mode default for that
     surface won't pollute State.t2.dark). */

  /* (removed) bulkApplyToOtherMode + bulkApplyToAllSurfaces.
     The per-row chips that drove these were rejected: both shipped
     silently with no per-target preview and no undo, so they
     created more cleanup work than they saved. If we bring them
     back they need a snapshot-undo toast first — see session
     notes on rejected bulk-apply chips. */

  /* Clear THIS prop's override + every descendant prop's override
     in the current surface + mode. Lets the user roll back an
     entire branch (e.g. all ct-* once ct-default was tweaked) in
     one click instead of clicking Reset four times. */
  function descendantPropIds(rootPropId) {
    var out = [];
    function walk(parentId) {
      T2_PROP_DEFS.forEach(function (p) {
        if (p.parent === parentId) {
          out.push(p.id);
          walk(p.id);
        }
      });
    }
    walk(rootPropId);
    return out;
  }
  function bulkResetFamily(surfaceId, propId, mode) {
    if (!State.t2[mode] || !State.t2[mode][surfaceId]) return;
    var bag = State.t2[mode][surfaceId];
    delete bag[propId];
    descendantPropIds(propId).forEach(function (d) { delete bag[d]; });
    scheduleAutosave();
    refreshChangeBar();
    renderT2();
    pushPreview();
  }

  /* Property Card primitive (docs \u00a74). Same DOM will be used by T1
     migration + T3 \u2014 keep it portable; no T2-specific assumptions
     except what the caller passes in. */

  // In-memory only \u2014 NEVER persisted to draft. Holds 'surfaceId/propId'
  // of the currently expanded card (one at a time across the whole
  // T2 view), or null. Cleared on surface tab switch.
  var __expandedT2 = null;

  /* Build the 20-step ladder strip for the inline picker. Walks the
     surface's source palette (brand for accent, neutral otherwise),
     marks the current pick, and tags every step with surface/prop
     so the picker click handler can resolve them. */
  function pcLadderHTML(surfaceId, propId, mode) {
    var surface = T2_SURFACES.find(function (s) { return s.id === surfaceId; });
    if (!surface) return '';
    var ladder = t2LadderFor(surfaceId);
    var current = resolveT2Step(surfaceId, propId, mode);
    var def     = defaultT2Step(surfaceId, propId, mode);
    return '<div class="ev2-pc-ladder" data-pc-ladder-surface="' + surfaceId + '" data-pc-ladder-prop="' + propId + '">'
      + ladder.map(function (s) {
          var isCur = s.name === current;
          var isDef = s.name === def;
          var tip = 'step ' + s.name + ' \u2022 ' + s.hex.toUpperCase()
                  + (isDef ? ' \u2022 default' : '')
                  + (isCur ? ' \u2022 selected' : '');
          return '<button type="button" class="ev2-pc-ladder-step"'
            + ' data-pc-ladder-pick="' + s.name + '"'
            + ' data-current="' + isCur + '"'
            + ' data-default="' + isDef + '"'
            + ' data-tip="' + tip + '"'
            + ' aria-label="' + tip + '"'
            + ' style="background:' + s.hex + '">'
          + '</button>';
        }).join('')
    + '</div>';
  }

  /* T1 ladder variant — same DOM shape as pcLadderHTML so the
     primitive's click handler (`[data-pc-ladder-pick]`) routes us
     here via the data-pc-tier branch. Extras over T2:
       - `data-pass` on each step (true/false) so failing steps can
         be visually dimmed; T1 is THE contrast-tuning surface, so
         seeing the pass/fail of every step inline is core info.
       - Uses the role's own palette ladder + lever-aware judge.
       - data-pc-ladder-role / -lever so the click handler can
         dispatch even though renderT1 only knows about one role.
  */
  function t1LeverLadderHTML(roleId, leverId, mode) {
    var ladderHex = ladderFor(roleId);
    var t = t1For(roleId, mode);
    var current = t[leverId];
    var def     = (defaultT1ForRole(roleId, mode) || {})[leverId];
    return '<div class="ev2-pc-ladder" data-pc-ladder-role="' + roleId + '" data-pc-ladder-lever="' + leverId + '">'
      + ALL_STEPS.map(function (step) {
          var hex   = ladderHex[step] || '#000';
          var isCur = step === current;
          var isDef = step === def;
          var j     = DTFSolver.judgeStepForLever(ladderHex, leverId, step, t, mode);
          var pass  = j.pass ? 'true' : 'false';
          var tip   = 'step ' + step + ' \u2022 ' + hex.toUpperCase()
                    + ' \u00b7 ' + j.ratio.toFixed(2) + ':1 (' + (j.pass ? j.grade : 'Fail') + ')'
                    + (isDef ? ' \u2022 default' : '')
                    + (isCur ? ' \u2022 selected' : '');
          return '<button type="button" class="ev2-pc-ladder-step"'
            + ' data-pc-ladder-pick="' + step + '"'
            + ' data-current="' + isCur + '"'
            + ' data-default="' + isDef + '"'
            + ' data-pass="' + pass + '"'
            + ' data-tip="' + tip + '"'
            + ' aria-label="' + tip + '"'
            + ' style="background:' + hex + '">'
          + '</button>';
        }).join('')
    + '</div>';
  }

  /* ── T1 derived (border / separator / on-component / on-container) ──
     Each derived card has its own:
       • current() — what is being rendered today (override or default)
       • defaultStep() — what the auto-derivation would pick
       • baselineHex() — what its step is judged AGAINST (for WCAG)
       • intent — 'edge' or 'text' (drives the sentinel chip + popover)
       • setStep(step) / clearStep() — write/restore the override
     This lets the existing Property Card primitive, the WCAG popover,
     the stepper, and the reset chip all dispatch through one shape. */

  // Step name currently rendered for a given derived id.
  function t1DerivedStep(roleId, derivedId, mode) {
    var t = State.t1[mode][roleId];
    if (derivedId === 'border')      return t.borderStep ? t.borderStep : stepRelToward(t.container, 6, mode);
    if (derivedId === 'separator')   return t.separatorStep ? t.separatorStep : stepRelToward(t.container, 2, mode);
    if (derivedId === 'onComponent') {
      if (t.onComponent === 'white' || t.onComponent === 'black') return t.onComponent;
      var fillHex = stepHexByName(roleId, t.fill) || '#000';
      var deriv   = DTFSolver.deriveOnComponent(fillHex);
      return deriv === '#FFFFFF' ? 'white' : 'black';
    }
    if (derivedId === 'onContainer') return onContainerStepName(roleId, mode);
    return null;
  }
  // What the derivation would pick if no override were set.
  function t1DerivedDefault(roleId, derivedId, mode) {
    var t = State.t1[mode][roleId];
    if (derivedId === 'border')    return stepRelToward(t.container, 6, mode);
    if (derivedId === 'separator') return stepRelToward(t.container, 2, mode);
    if (derivedId === 'onComponent') {
      var fillHex = stepHexByName(roleId, t.fill) || '#000';
      return DTFSolver.deriveOnComponent(fillHex) === '#FFFFFF' ? 'white' : 'black';
    }
    if (derivedId === 'onContainer') {
      var ladder = ladderFor(roleId);
      var containerHex = ladder[t.container] || surfaceBgFor(mode);
      return DTFSolver.deriveOnContainer(ladder, t.content, containerHex).step;
    }
    return null;
  }
  // True when user has overridden this derived value.
  function t1DerivedIsDetached(roleId, derivedId, mode) {
    var t = State.t1[mode][roleId];
    if (derivedId === 'border')      return !!t.borderStep;
    if (derivedId === 'separator')   return !!t.separatorStep;
    if (derivedId === 'onComponent') return t.onComponent === 'white' || t.onComponent === 'black';
    if (derivedId === 'onContainer') return !!t.onContainerStep;
    return false;
  }
  // Hex currently painted by a derived id.
  function t1DerivedHex(roleId, derivedId, mode) {
    var step = t1DerivedStep(roleId, derivedId, mode);
    if (derivedId === 'onComponent') return step === 'white' ? '#FFFFFF' : '#0A0A0A';
    var ladder = ladderFor(roleId);
    return ladder[step] || '#000';
  }
  // Baseline hex (what the derived's contrast is judged against)
  // + intent + token name. Used by Property Card sentinel chip + popover.
  function t1DerivedBaseline(roleId, derivedId, mode) {
    var ladder = ladderFor(roleId);
    var t = State.t1[mode][roleId];
    var role = ROLES.find(function (r) { return r.id === roleId; });
    var prefix = role ? role.prefix : roleId;
    if (derivedId === 'border' || derivedId === 'separator') {
      var contHex = ladder[t.container] || surfaceBgFor(mode);
      return {
        hex: contHex,
        token: '--' + prefix + '-container-bg',
        intent: 'edge',
        large: true
      };
    }
    if (derivedId === 'onComponent') {
      var fillHex = stepHexByName(roleId, t.fill) || '#000';
      return {
        hex: fillHex,
        token: '--' + prefix + '-component-bg-default',
        intent: 'text',
        large: false
      };
    }
    // onContainer
    var contHex2 = ladder[t.container] || surfaceBgFor(mode);
    return {
      hex: contHex2,
      token: '--' + prefix + '-container-bg',
      intent: 'text',
      large: false
    };
  }
  function t1DerivedTokenName(roleId, derivedId) {
    var role = ROLES.find(function (r) { return r.id === roleId; });
    var prefix = role ? role.prefix : roleId;
    if (derivedId === 'border')      return '--' + prefix + '-container-outline';
    if (derivedId === 'separator')   return '--' + prefix + '-container-separator';
    if (derivedId === 'onComponent') return '--' + prefix + '-on-component';
    if (derivedId === 'onContainer') return '--' + prefix + '-on-container';
    return '--' + prefix + '-' + derivedId;
  }
  // Per-step pass mark for the ladder, mirroring t1LeverLadderHTML.
  function t1DerivedJudgeStep(roleId, derivedId, mode, step) {
    var base = t1DerivedBaseline(roleId, derivedId, mode);
    var hex;
    if (derivedId === 'onComponent') {
      hex = step === 'white' ? '#FFFFFF' : '#0A0A0A';
    } else {
      hex = ladderFor(roleId)[step] || '#000';
    }
    var r = contrastRatio(hex, base.hex);
    return { ratio: r, judge: wcagJudge(r, base.large) };
  }
  /* Ladder HTML for a derived card. onComponent gets a tiny
     2-step "ladder" of just white + black; everything else uses
     the standard 22-step palette. */
  function t1DerivedLadderHTML(roleId, derivedId, mode) {
    var steps = (derivedId === 'onComponent') ? ['white', 'black'] : ALL_STEPS;
    var ladderHex = ladderFor(roleId);
    var current = t1DerivedStep(roleId, derivedId, mode);
    var def     = t1DerivedDefault(roleId, derivedId, mode);
    return '<div class="ev2-pc-ladder" data-pc-ladder-role="' + roleId + '"'
      + ' data-pc-ladder-derived="' + derivedId + '"'
      + (derivedId === 'onComponent' ? ' data-pc-ladder-compact="true"' : '')
      + '>'
      + steps.map(function (step) {
          var hex   = (derivedId === 'onComponent')
            ? (step === 'white' ? '#FFFFFF' : '#0A0A0A')
            : (ladderHex[step] || '#000');
          var isCur = step === current;
          var isDef = step === def;
          var jr    = t1DerivedJudgeStep(roleId, derivedId, mode, step);
          var pass  = jr.judge.pass ? 'true' : 'false';
          var tip   = 'step ' + step + ' \u2022 ' + hex.toUpperCase()
                    + ' \u00b7 ' + jr.ratio.toFixed(2) + ':1 (' + (jr.judge.pass ? jr.judge.grade : 'Fail') + ')'
                    + (isDef ? ' \u2022 default' : '')
                    + (isCur ? ' \u2022 selected' : '');
          return '<button type="button" class="ev2-pc-ladder-step"'
            + ' data-pc-ladder-pick="' + step + '"'
            + ' data-current="' + isCur + '"'
            + ' data-default="' + isDef + '"'
            + ' data-pass="' + pass + '"'
            + ' data-tip="' + tip + '"'
            + ' aria-label="' + tip + '"'
            + ' style="background:' + hex + '">'
          + '</button>';
        }).join('')
    + '</div>';
  }

  function propertyCardHTML(opts) {
    // opts: { tokenName, swatchHex, step, isDetached, sentinel?,
    //         dataAttrs?, expanded?, level?, parentLabel?, deltaSigned? }
    var swSt = 'background:' + opts.swatchHex + ';' +
               'border-style:' + (opts.isDetached ? 'solid' : 'dashed') + ';';
    var sent = opts.sentinel;
    var sentHTML = '';
    if (sent) {
      // Edge-intent below threshold = "fine if paired with shadow"
      // soft note (amber, ⓘ), NOT a hard red fail. Edge-intent ≥
      // threshold = green pass. Text-intent uses the canonical
      // pass / aa / aaa / fail grades.
      var grade, sym;
      if (sent.intent === 'edge') {
        if (sent.judge.pass) { grade = 'aa-large'; sym = '\u2713'; }
        else                  { grade = 'edge-soft'; sym = '\u24D8'; }
      } else {
        grade = sent.judge.pass ? (sent.judge.grade === 'AAA' ? 'aaa' : (sent.large ? 'aa-large' : 'aa')) : 'fail';
        sym   = sent.judge.pass ? '\u2713' : '\u26A0';
      }
      sentHTML = '<button type="button" class="ev2-pc-wcag" data-grade="' + grade + '"'
        + ' data-pc-wcag-open'
        + ' aria-label="Contrast ' + sent.ratio.toFixed(2) + ' to 1, click for details and fix">'
        + sym + ' ' + sent.ratio.toFixed(2) + ':1'
      + '</button>';
    }
    var attrs = '';
    if (opts.dataAttrs) Object.keys(opts.dataAttrs).forEach(function (k) {
      attrs += ' data-' + k + '="' + String(opts.dataAttrs[k]).replace(/"/g,'&quot;') + '"';
    });
    var tier = opts.tier || 't2';
    attrs += ' data-pc-tier="' + tier + '"';
    var alwaysExpanded = !!opts.alwaysExpanded;
    var expanded = alwaysExpanded || !!opts.expanded;
    var ladderHTML = '';
    var actionsHTML = '';
    if (opts.ladderHTML) {
      // Caller supplied a precomputed ladder (T1 uses this — per-step
      // WCAG marks need a judge callback we don't want to thread through
      // the primitive). Render it iff the card is expanded.
      if (expanded) ladderHTML = opts.ladderHTML;
    } else if (expanded && opts.dataAttrs && opts.dataAttrs['pc-surface'] && opts.dataAttrs['pc-prop']) {
      var _surfaceId = opts.dataAttrs['pc-surface'];
      var _propId    = opts.dataAttrs['pc-prop'];
      ladderHTML = pcLadderHTML(_surfaceId, _propId, State.editingMode);
    }
    if (opts.dataAttrs && opts.dataAttrs['pc-surface'] && opts.dataAttrs['pc-prop']) {
      // Horizontal action bar — only renders chips that are useful
      // for the row's current state. Apply-* chips need a detached
      // step to bulk-apply; Reset family needs dirty descendants.
      // When neither applies we render no bar at all (no empty rail).
      actionsHTML = pcActionsHTML(opts.dataAttrs['pc-surface'], opts.dataAttrs['pc-prop'], State.editingMode, !!opts.isDetached, !!opts.hasDirtyDescendants);
    }
    // Build meta strip. For child rows we show "step N · +d from parent"
    // when linked, and "step N · custom" when the user has pinned it.
    var metaBits = '<span class="ev2-pc-step">step ' + opts.step + '</span>';
    if (opts.isDetached) {
      metaBits += '<span class="ev2-pc-chip">edited</span>';
    } else if (opts.parentLabel && typeof opts.deltaSigned === 'number') {
      var sign = opts.deltaSigned > 0 ? '+' : '';
      metaBits += '<span class="ev2-pc-chip ev2-pc-chip-link" data-tip="Linked to ' + opts.parentLabel + ' — step changes follow">'
        + sign + opts.deltaSigned + ' from ' + opts.parentLabel
      + '</span>';
    } else if (!opts.suppressBaseChip) {
      metaBits += '<span class="ev2-pc-chip ev2-pc-chip-muted">base</span>';
    }
    if (opts.metaExtra) metaBits += opts.metaExtra;
    var lvl = opts.level || 0;
    // T1 ladder is always-open by design (small surface, 3 levers per
    // role); the swatch + disclose toggle don't apply there. Hide
    // the disclose chevron and make the swatch non-interactive
    // when alwaysExpanded is true.
    var swExtra = alwaysExpanded
      ? ' tabindex="-1" aria-hidden="true" data-pc-noninteractive="true"'
      : ' data-pc-toggle aria-expanded="' + (expanded ? 'true' : 'false') + '" data-tip="' + (expanded ? 'Hide steps' : 'Pick a step') + '" aria-label="' + (expanded ? 'Hide steps' : 'Pick a step') + ' — swatch (also opens picker)"';
    var discloseHTML = alwaysExpanded ? ''
      : '<button type="button" class="ev2-pc-disclose" data-pc-toggle aria-expanded="' + (expanded ? 'true' : 'false') + '" data-tip="' + (expanded ? 'Hide steps' : 'Pick a step') + '" aria-label="' + (expanded ? 'Hide steps' : 'Pick a step') + '"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    var subHTML = opts.subtitle ? '<div class="ev2-pc-sub">' + opts.subtitle + '</div>' : '';
    return '<div class="ev2-pc" data-detached="' + (opts.isDetached ? 'true' : 'false') + '" data-expanded="' + (expanded ? 'true' : 'false') + '" data-level="' + lvl + '"' + attrs + '>'
      + '<button type="button" class="ev2-pc-sw" style="' + swSt + '"' + swExtra + '></button>'
      + '<div class="ev2-pc-main">'
        + '<div class="ev2-pc-name">' + opts.tokenName + '</div>'
        + subHTML
        + '<div class="ev2-pc-meta">' + metaBits + '</div>'
      + '</div>'
      + sentHTML
      + '<div class="ev2-pc-controls">'
        + '<button type="button" class="ev2-pc-step-btn" data-pc-step="-1" data-tip="Step lighter" aria-label="Step lighter">\u2212</button>'
        + '<button type="button" class="ev2-pc-step-btn" data-pc-step="+1" data-tip="Step darker" aria-label="Step darker">+</button>'
        + discloseHTML
        + '<button type="button" class="ev2-pc-reset" data-pc-reset' + (opts.isDetached ? '' : ' disabled') + ' data-tip="Reset to default" aria-label="Reset to default">\u21BA</button>'
      + '</div>'
      + ladderHTML
      + actionsHTML
    + '</div>';
  }

  /* ── Inline action bar (T2 row, expanded) ─────────────
     Lives inside the expanded Property Card, below the step
     ladder. We rejected the cross-mode / cross-surface "Apply"
     chips because both ship silently with no per-target preview
     and no undo path — at 8 surfaces × 16 props they create more
     cleanup work than they save. Only Reset family survives: it's
     a pure undo (clears overrides; designer can always re-step
     individual rows back), and the (N) count gives a preview of
     scope. If apply-style ops come back, they need snapshot-undo
     toast + a per-target diff preview first. */
  function pcActionsHTML(surfaceId, propId, mode, isDetached, hasDirtyDescendants) {
    if (!hasDirtyDescendants) return '';
    var bag = (State.t2[mode] && State.t2[mode][surfaceId]) || {};
    var descCount = descendantPropIds(propId).filter(function (d) { return bag[d] && bag[d].step; }).length;
    var total = descCount + (isDetached ? 1 : 0);
    var chip = {
      key:    'reset-family',
      danger: true,
      lbl:    'Reset family (' + total + ')',
      tip:    'Clear this row + ' + descCount + ' descendant override' + (descCount === 1 ? '' : 's') + ' in ' + mode + ' mode.'
    };
    return '<div class="ev2-pc-actions" role="group" aria-label="Bulk actions for this row">'
      + '<button type="button" class="ev2-pc-action"'
        + ' data-pc-bulk="' + chip.key + '"'
        + ' data-surface="' + surfaceId + '" data-prop="' + propId + '"'
        + ' data-danger="true"'
        + ' data-tip="' + chip.tip.replace(/"/g, '&quot;') + '">'
        + '<span class="ev2-pc-action-lbl">' + chip.lbl + '</span>'
      + '</button>'
    + '</div>';
  }

  function surfacePickerHTML() {
    // Compact horizontal rail: swatch + name only. Description lives
    // in the surface-pane header, so we don't pay vertical cost twice.
    return '<div class="ev2-surfaces" role="tablist" aria-label="Surfaces">'
      + T2_SURFACES.map(function (s) {
          var current = s.id === State.activeSurface;
          var bgHex   = t2HexFor(s.id, 'bg', State.editingMode);
          var changed = isT2Changed(s.id);
          return '<button class="ev2-surface" role="tab" data-surface-tab="' + s.id + '"'
            + ' aria-current="' + current + '" data-changed="' + changed + '"'
            + ' data-tip="' + s.desc.replace(/"/g, '&quot;') + '">'
            + '<span class="ev2-surface-sw" style="background:' + bgHex + '"></span>'
            + '<span class="ev2-surface-name">' + s.label + '</span>'
            + (changed ? '<span class="ev2-surface-dot" aria-label="Has overrides"></span>' : '')
          + '</button>';
        }).join('')
    + '</div>';
  }

  function surfaceFamilyHTML(surface, family, mode) {
    var props = T2_PROP_DEFS.filter(function (p) { return p.family === family.id; });
    var cards = props.map(function (prop) {
      var resolvedStep = resolveT2Step(surface.id, prop.id, mode);
      var defaultStep  = defaultT2Step(surface.id, prop.id, mode);
      var swatchHex    = t2HexFor(surface.id, prop.id, mode);
      var ov = State.t2[mode][surface.id] && State.t2[mode][surface.id][prop.id];
      var isDetached   = !!(ov && ov.step);
      var sentinel = t2Sentinel(surface.id, prop.id, mode);
      var expanded = __expandedT2 === (surface.id + '/' + prop.id);
      // For child rows, compute effective delta from parent (in
      // mode-correct units) so meta strip can show "+1 from bg" etc.
      var parentLabel = null;
      var deltaSigned = null;
      if (prop.parent) {
        parentLabel = prop.parent;
        var pStep = resolveT2Step(surface.id, prop.parent, mode);
        var pIdx  = ALL_STEPS.indexOf(pStep);
        var cIdx  = ALL_STEPS.indexOf(resolvedStep);
        if (pIdx >= 0 && cIdx >= 0) {
          deltaSigned = (cIdx - pIdx) * tonalDir(mode);
        }
      }
      // Overflow menu visibility: this row is detached (has a step
      // override to bulk-apply or reset) OR has any descendant in
      // the same mode with an override (so "Reset family" is useful).
      var bag = (State.t2[mode] && State.t2[mode][surface.id]) || {};
      var hasDirtyDescendants = descendantPropIds(prop.id).some(function (d) {
        return bag[d] && bag[d].step;
      });
      return propertyCardHTML({
        tokenName: '--surface-' + surface.id + '-' + prop.id,
        swatchHex: swatchHex,
        step: resolvedStep,
        isDetached: isDetached,
        expanded: expanded,
        sentinel: sentinel,
        level: prop.level,
        parentLabel: parentLabel,
        deltaSigned: deltaSigned,
        hasDirtyDescendants: hasDirtyDescendants,
        dataAttrs: {
          'pc-surface': surface.id,
          'pc-prop':    prop.id,
          'pc-default': defaultStep
        }
      });
    }).join('');
    // Optional anchor reference chip — shows the family's external
    // anchor (e.g. Edges/Content/Component all anchor on bg). Lets
    // the user see "what am I deriving from" without leaving the card.
    var anchorChip = '';
    if (family.anchorRef) {
      var aStep = resolveT2Step(surface.id, family.anchorRef, mode);
      var aHex  = t2HexFor(surface.id, family.anchorRef, mode);
      anchorChip = '<div class="ev2-pc-group-anchor" data-tip="Family is derived from --surface-' + surface.id + '-' + family.anchorRef + ' (step ' + aStep + ')">'
        + '<span class="ev2-pc-group-anchor-sw" style="background:' + aHex + '"></span>'
        + '<span class="ev2-pc-group-anchor-lbl">follows <code>' + family.anchorRef + '</code> · step ' + aStep + '</span>'
      + '</div>';
    }
    return '<section class="ev2-pc-group" data-family="' + family.id + '">'
      + '<header class="ev2-pc-group-head">'
        + '<h3 class="ev2-pc-group-title">' + family.label + '</h3>'
        + anchorChip
      + '</header>'
      + '<div class="ev2-pc-list">' + cards + '</div>'
    + '</section>';
  }

  function renderT2() {
    var surface = T2_SURFACES.find(function (s) { return s.id === State.activeSurface; })
               || T2_SURFACES[0];
    State.activeSurface = surface.id;
    var mode = State.editingMode;
    var bgHex = t2HexFor(surface.id, 'bg', mode);
    var activePalette = surfacePaletteFor(surface.id);
    var paletteCustom = isSurfacePaletteCustom(surface.id);

    var modeBtns =
      '<div class="ev2-edit-mode-row" role="radiogroup" aria-label="Editing mode">'
        + '<button type="button" class="ev2-edit-mode" data-edit-mode="light" aria-checked="' + (mode === 'light') + '" role="radio">Light</button>'
        + '<button type="button" class="ev2-edit-mode" data-edit-mode="dark"  aria-checked="' + (mode === 'dark')  + '" role="radio">Dark</button>'
      + '</div>';

    /* Source-palette picker. Custom popover (not a native <select>)
       so we can show grouped sections with labels + a "Custom
       palettes" empty state. The trigger button shows the current
       pick + a CUSTOM pill / Reset button when the surface is on
       a non-default palette. The popover singleton lives at body
       level (see initSurfacePalettePopover() below). */
    var activeOpt = paletteOptionFor(activePalette) || { id:activePalette, label:activePalette };
    var paletteCtl =
      '<div class="ev2-surface-head-palette" data-custom="' + paletteCustom + '">'
        + '<span class="ev2-surface-head-palette-label">Source palette</span>'
        + '<button type="button" class="ev2-surface-head-palette-trigger"'
          + ' data-surface-palette-open="' + surface.id + '"'
          + ' aria-haspopup="listbox" aria-expanded="false"'
          + ' aria-label="Source palette for ' + surface.label + ' \u2014 currently ' + activeOpt.label + '">'
          + '<span class="ev2-surface-head-palette-trigger-val">' + activeOpt.label + '</span>'
          + '<svg class="ev2-surface-head-palette-trigger-caret" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + '</button>'
        + (paletteCustom
            ? '<span class="ev2-surface-head-palette-pill" data-tip="Default for this surface is ' + surface.palette + '. Click reset to restore.">Edited</span>'
              + '<button type="button" class="ev2-surface-head-palette-reset" data-surface-palette-reset="' + surface.id + '" aria-label="Reset source palette to ' + surface.palette + '">Reset</button>'
            : '')
      + '</div>';

    $body.innerHTML =
      surfacePickerHTML()
      + '<div class="ev2-surface-pane">'
        + '<header class="ev2-surface-head">'
          + '<div class="ev2-surface-head-l">'
            + '<span class="ev2-surface-head-sw" style="background:' + bgHex + '"></span>'
            + '<div class="ev2-surface-head-txt">'
              + '<h2 class="ev2-surface-head-name">' + surface.label + '</h2>'
              + '<p class="ev2-surface-head-sub">' + surface.desc + '</p>'
            + '</div>'
          + '</div>'
          + '<div class="ev2-surface-head-r">'
            + paletteCtl
            + modeBtns
          + '</div>'
        + '</header>'
        + T2_FAMILIES.map(function (f) { return surfaceFamilyHTML(surface, f, mode); }).join('')
      + '</div>';
  }

  /* ── T1 Roles ────────────────────────────────────────── */
  /* (removed) renderWcagPairsHTML — the auto-derived border /
     separator / on-component / on-container swatches it produced
     are now first-class Property Cards rendered by t1DerivedCard. */

  function renderT1() {
    var prevScroll = $body ? $body.scrollTop : 0;
    var role = ROLES.find(function (r) { return r.id === State.activeRole; });
    if (!role) return;
    var mode = State.editingMode;
    var t1 = t1For(role.id);
    var changed = isT1Changed(role.id) || isChanged(role.id);
    var affects = AFFECTS[role.id] || [];
    var pageBg = surfaceBgFor(mode);
    var ladder = ladderFor(role.id);

    /* Per-lever Property Card. Same primitive as T2; T1-specific
       behaviour comes from `tier: 't1'` (which the click handlers
       branch on) + `alwaysExpanded: true` (no disclose toggle, the
       ladder is the primary control) + a precomputed
       `ladderHTML` that decorates each step with its WCAG pass/fail
       against the lever's role (T1 is THE contrast-tuning surface). */
    var leversHTML = T1_LEVERS.map(function (lever) {
      var current = t1[lever.id];
      var curHex  = ladder[current] || '#000';
      var def     = (defaultT1ForRole(role.id, mode) || {})[lever.id];
      var detached = current !== def;
      // Header sentinel chip — current pick's contrast vs its baseline.
      var hJudge = DTFSolver.judgeStepForLever(ladder, lever.id, current, t1, mode);
      var sentinel = {
        ratio: hJudge.ratio,
        large: false,
        intent: 'text',
        judge: { pass: hJudge.pass, grade: hJudge.grade }
      };
      return propertyCardHTML({
        tier: 't1',
        alwaysExpanded: true,
        tokenName: lever.label,
        subtitle: lever.sub,
        swatchHex: curHex,
        step: current,
        isDetached: detached,
        sentinel: sentinel,
        suppressBaseChip: true,
        ladderHTML: t1LeverLadderHTML(role.id, lever.id, mode),
        dataAttrs: {
          'pc-role':  role.id,
          'pc-lever': lever.id,
          'lever':    lever.id    /* legacy hook for mouseenter focus preview */
        }
      });
    }).join('');

    /* Auto-derived Property Cards: border / separator / on-component
       / on-container. Each shares the T1 lever chrome (alwaysExpanded
       ladder, WCAG chip, stepper, reset). Defaults follow the
       derivation rules; user overrides write to state via setT1Derived. */
    var derivedHTML = T1_DERIVED.map(function (d) {
      var curStep   = t1DerivedStep(role.id, d.id, mode);
      var defStep   = t1DerivedDefault(role.id, d.id, mode);
      var detached  = t1DerivedIsDetached(role.id, d.id, mode);
      var curHex    = t1DerivedHex(role.id, d.id, mode);
      var base      = t1DerivedBaseline(role.id, d.id, mode);
      var jr        = t1DerivedJudgeStep(role.id, d.id, mode, curStep);
      var sentinel  = {
        ratio: jr.ratio,
        large: base.large,
        intent: base.intent,
        judge: jr.judge
      };
      return propertyCardHTML({
        tier: 't1',
        alwaysExpanded: true,
        tokenName: d.label,
        subtitle: d.sub,
        swatchHex: curHex,
        step: curStep,
        isDetached: detached,
        sentinel: sentinel,
        suppressBaseChip: true,
        ladderHTML: t1DerivedLadderHTML(role.id, d.id, mode),
        dataAttrs: {
          'pc-role':    role.id,
          'pc-derived': d.id
        }
      });
    }).join('');

    $body.innerHTML =
      '<div class="ev2-roles" role="tablist">'

        + ROLES.map(function (r) {
            var current = r.id === role.id;
            var diffs = summarizeRoleChanges(r.id);
            var badge = diffs.length
              ? '<span class="ev2-role-badge" data-tip="' + badgeTipFor(r.id).replace(/"/g,'&quot;')
                + '" aria-label="' + diffs.length + ' lever' + (diffs.length === 1 ? '' : 's') + ' changed">'
                + diffs.length + '</span>'
              : '';
            return '<button class="ev2-role" role="tab" data-role-tab="' + r.id + '" '
              + 'aria-selected="' + current + '" data-changed="' + isRoleDirty(r.id) + '">'
              + '<span class="ev2-role-dot" style="background:' + State.proposed[r.id] + '"></span>'
              + '<span>' + r.label + '</span>'
              + badge
              + '</button>';
          }).join('')
      + '</div>'
      + '<div class="ev2-intent">'
        + '<div class="ev2-intent-head">'
          + '<div class="ev2-edit-toggle" role="radiogroup" aria-label="Editing mode" data-tip="Switches which mode\u2019s tokens you are editing AND the editor UI to match. Light and dark each have their own picks \u2014 changing one does not touch the other.">'
            + '<span class="ev2-edit-toggle-label" aria-hidden="true">Editing</span>'
            + '<button type="button" class="ev2-edit-mode" data-edit-mode="light" role="radio" aria-checked="' + (mode === 'light') + '">Light</button>'
            + '<button type="button" class="ev2-edit-mode" data-edit-mode="dark" role="radio" aria-checked="' + (mode === 'dark') + '">Dark</button>'
          + '</div>'
          + (changed ? '<span class="ev2-intent-hint">Edited from defaults</span>' : '')
          + '<button type="button" class="ev2-role-reset" data-role-reset="' + role.id + '"'
            + (changed ? '' : ' disabled')
            + ' data-tip="Reset ' + role.label + ' to project defaults. Other roles are untouched.">'
            + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg>'
            + '<span>Reset</span>'
          + '</button>'
        + '</div>'
        + '<div class="ev2-intent-body">'
          + '<div class="ev2-levers">' + leversHTML + '</div>'
          + '<div class="ev2-levers ev2-levers-derived" data-pc-group="derived">' + derivedHTML + '</div>'
          + '<div class="ev2-disc"' + (State.disclosure['t1:slots'] ? ' data-open' : '') + ' data-disc="t1:slots">'
            + '<div class="ev2-disc-head">'
              + '<span>Resulting slots</span>'
              + '<span class="ev2-disc-meta">' + (changed ? 'updated' : 'defaults') + '</span>'
            + '</div>'
            + '<div class="ev2-disc-body">'
              + slotsTableHTML(role.id)
            + '</div>'
          + '</div>'
          + '<div class="ev2-disc"' + (State.disclosure['t1:affects'] ? ' data-open' : '') + ' data-disc="t1:affects">'
            + '<div class="ev2-disc-head">'
              + '<span>Affects components</span>'
              + '<span class="ev2-disc-meta">' + affects.length + ' shown</span>'
            + '</div>'
            + '<div class="ev2-disc-body">'
              + '<div class="ev2-affects">'
                + affects.map(function (c) { return '<span class="ev2-aff-chip">' + c + '</span>'; }).join('')
              + '</div>'
            + '</div>'
          + '</div>'
        + '</div>'
      + '</div>';

    bindT1();
    if ($body && prevScroll) $body.scrollTop = prevScroll;
  }

  function slotsTableHTML(roleId) {
    var t = t1For(roleId);
    var fillStep      = t.fill;
    var contentStep   = t.content;
    var containerStep = t.container;
    var rows = [
      { slot: 'component-bg-default',     step: fillStep },
      { slot: 'component-bg-hover',       step: stepRel(fillStep, 1) },
      { slot: 'component-bg-pressed',     step: stepRel(fillStep, 2) },
      { slot: 'content-default',          step: contentStep },
      { slot: 'content-strong',           step: stepRel(contentStep, 1) },
      { slot: 'content-subtle',           step: stepRel(contentStep, -2) },
      { slot: 'container-bg',             step: containerStep },
      { slot: 'container-hover',          step: stepRel(containerStep, 1) },
      { slot: 'container-outline',        step: stepRel(containerStep, 6) }
    ];
    return '<div class="ev2-slots">'
      + rows.map(function (r) {
          var hex = stepHexByName(roleId, r.step) || '#000';
          return '<div class="ev2-slot-row">'
            + '<div class="ev2-slot-sw" style="background:' + hex + '"></div>'
            + '<div class="ev2-slot-name">--' + roleId + '-' + r.slot + '</div>'
            + '<div class="ev2-slot-step">step ' + r.step + '</div>'
            + '<div class="ev2-slot-hex">' + hex.toUpperCase().replace('#','') + '</div>'
          + '</div>';
        }).join('')
      + '</div>';
  }

  function bindT1() {
    document.querySelectorAll('[data-role-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        State.activeRole = b.getAttribute('data-role-tab');
        saveUIState();
        renderT1();
        // Tell the preview spotlight which role to feature.
        try { $frame.contentWindow.postMessage({ type: 'ev2-active-role', role: State.activeRole }, '*'); } catch (e) {}
      });
    });
    document.querySelectorAll('.ev2-disc-head').forEach(function (h) {
      h.addEventListener('click', function () {
        var disc = h.parentElement;
        var key = disc.getAttribute('data-disc');
        var nowOpen = !disc.hasAttribute('data-open');
        if (nowOpen) disc.setAttribute('data-open', '');
        else disc.removeAttribute('data-open');
        if (key) State.disclosure[key] = nowOpen;
        saveUIState();
      });
    });
    document.querySelectorAll('.ev2-pc[data-pc-tier="t1"]').forEach(function (block) {
      block.addEventListener('mouseenter', function () {
        var lever = block.getAttribute('data-lever');
        State.focusedLever = lever;
        focusPreview(lever);
      });
      block.addEventListener('mouseleave', function () {
        State.focusedLever = null;
        focusPreview(null);
      });
    });
    /* (removed) per-swatch [data-t1-lever] binding — the T1 ladder
       is now a Property Card ladder so picks are dispatched through
       the shared [data-pc-ladder-pick] handler with a t1 branch. */
  }

  /* (removed) [data-step-walk] / [data-step-reset] delegated
     click handler — those attributes are no longer emitted anywhere
     (border / separator are full Property Cards routed through the
     [data-pc-step] + [data-pc-reset] dispatcher). */

  function leverSlotHint(leverId) {
    if (leverId === 'fill') return 'component-bg-default';
    if (leverId === 'content') return 'content-default';
    return 'container-bg';
  }
  function renderLeverPreview(leverId, hex) {
    if (leverId === 'fill') {
      return '<span class="ev2-pv-fill" style="background:' + hex + '"></span>';
    }
    if (leverId === 'content') {
      return '<span class="ev2-pv-content" style="color:' + hex + '">Aa</span>';
    }
    return '<span class="ev2-pv-container" style="background:' + hex + ';border-color:' + hex + '"></span>';
  }
  function focusPreview(leverId, scroll) {
    try {
      $frame.contentWindow.postMessage({ type: 'ev2-focus', lever: leverId, scroll: !!scroll }, '*');
    } catch (e) {}
  }

  function renderActiveTier() {
    var meta = TIER_META[State.activeTier];
    $listTitle.textContent = meta.title;
    $listSub.textContent = meta.sub;
    if (State.activeTier === 't0') renderT0();
    else if (State.activeTier === 't1') renderT1();
    else if (State.activeTier === 't2') renderT2();
    else renderTierPlaceholder(State.activeTier);
  }

  // Tier rail
  document.querySelectorAll('.ev2-tier').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.ev2-tier').forEach(function (b) { b.removeAttribute('aria-current'); });
      btn.setAttribute('aria-current', 'true');
      State.activeTier = btn.getAttribute('data-tier');
      saveUIState();
      renderActiveTier();
      // Switching INTO or OUT of T2 changes which surface the preview
      // should paint with. Push the active-surface signal so the
      // preview repaints; the heavy CSS payload doesn't need to move.
      pushActiveSurface();
    });
  });

  // In-panel "Editing" toggle (lives inside each role card head).
  // Single source of truth: switches BOTH the editor's UI theme
  // (data-theme on <html>, persisted in 'dtf-theme') AND which
  // mode's T1 tokens you are editing. Per-mode T1 state means
  // changes apply to that mode only.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.ev2-edit-mode');
    if (!btn) return;
    var mode = btn.getAttribute('data-edit-mode');
    if (mode !== 'light' && mode !== 'dark') return;
    if (State.editingMode === mode) return;
    State.editingMode = mode;
    document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem('dtf-theme', mode); } catch (err) {}
    try { $frame.contentWindow.postMessage({ type: 'ev2-theme', mode: mode }, '*'); } catch (err) {}
    saveUIState();
    if (State.activeTier === 't1') renderT1();
    else if (State.activeTier === 't2') renderT2();
  });

  /* Surface source-palette picker open-trigger (T2 header). Native
     <select> can't render grouped sections with separators + an
     empty-state slot, so the picker is a custom popover singleton
     (see initSurfacePalettePicker below). This handler just opens
     the popover for the clicked trigger button; the popover renders
     the groups and handles option clicks. */
  document.addEventListener('click', function (e) {
    var openBtn = e.target && e.target.closest && e.target.closest('[data-surface-palette-open]');
    if (!openBtn) return;
    e.preventDefault();
    e.stopPropagation();
    if (window.__ev2OpenPalettePicker) window.__ev2OpenPalettePicker(openBtn);
  });

  document.getElementById('showCssNames').addEventListener('change', function (e) {
    document.body.classList.toggle('ev2-show-css', e.target.checked);
    saveUIState();
  });

  $discard.addEventListener('click', function () {
    ROLES.forEach(function (r) {
      State.proposed[r.id] = State.baseline[r.id];
      // Restore to the AA-clean t1 baseline snapshotted at boot, not
      // raw T1_DEFAULT (which may not pass AA against the loaded
      // ladder for some hue/seed combinations).
      State.t1.light[r.id] = Object.assign({}, State.t1Baseline.light[r.id]);
      State.t1.dark[r.id]  = Object.assign({}, State.t1Baseline.dark[r.id]);
    });
    // T2 has no "AA-clean baseline" notion yet — every cell defaults
    // to a deterministic offset from T2_BASE_STEPS, so Discard simply
    // drops all overrides back to empty.
    State.t2 = makeEmptyT2();
    State.t2SurfacePalette = {};
    State.cachedSteps = {};
    _systemPaletteCache = {};
    clearDraftFromStorage();
    pushPreview();
    renderActiveTier();
    refreshChangeBar();
    refreshDraftStatus('idle');
    if (window.ev2Toast) window.ev2Toast('Discarded all unsaved changes', 'ok');
  });

  /* ── Section + per-role resets ─────────────────────────
     Section reset = clear only the active tier (T0 or T1).
     Role reset    = clear one role's T0 anchor + T1 picks.
     Both go through autoFixT1ToAA so the cleared roles still
     ship AA defaults against the loaded ladder. */
  function resetRole(roleId) {
    State.proposed[roleId] = State.baseline[roleId];
    // Restore to AA-clean t1 baseline (matches Discard behavior).
    State.t1.light[roleId] = Object.assign({}, State.t1Baseline.light[roleId]);
    State.t1.dark[roleId]  = Object.assign({}, State.t1Baseline.dark[roleId]);
    delete State.cachedSteps[roleId];
    scheduleAutosave();
    pushPreview();
    renderActiveTier();
    refreshChangeBar();
  }
  function resetSection(tierId) {
    if (tierId === 't0') {
      ROLES.forEach(function (r) { State.proposed[r.id] = State.baseline[r.id]; });
      State.cachedSteps = {};
    } else if (tierId === 't1') {
      ROLES.forEach(function (r) {
        // Restore to AA-clean t1 baseline (matches Discard behavior).
        State.t1.light[r.id] = Object.assign({}, State.t1Baseline.light[r.id]);
        State.t1.dark[r.id]  = Object.assign({}, State.t1Baseline.dark[r.id]);
      });
    } else if (tierId === 't2') {
      State.t2 = makeEmptyT2();
      State.t2SurfacePalette = {};
    }
    scheduleAutosave();
    pushPreview();
    renderActiveTier();
    refreshChangeBar();
  }

  // Section reset button (in list header)
  var $sectionReset = document.getElementById('sectionResetBtn');
  if ($sectionReset) {
    $sectionReset.addEventListener('click', function () {
      resetSection(State.activeTier);
      var label = TIER_META[State.activeTier] && TIER_META[State.activeTier].title;
      if (window.ev2Toast) window.ev2Toast('Reset ' + (label || 'section') + ' to defaults', 'ok');
    });
  }

  // Per-role reset (event-delegated since cards re-render)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-role-reset]');
    if (!btn) return;
    var roleId = btn.getAttribute('data-role-reset');
    var role = ROLES.find(function (r) { return r.id === roleId; });
    resetRole(roleId);
    if (window.ev2Toast) window.ev2Toast('Reset ' + (role ? role.label : roleId) + ' to defaults', 'ok');
  });

  /* ── T2 event delegation ───────────────────────────────
     Surface picker, Property Card stepper, Property Card reset. All
     delegated since renderT2() rebuilds the body each time. */
  document.addEventListener('click', function (e) {
    var surfBtn = e.target.closest && e.target.closest('[data-surface-tab]');
    if (surfBtn) {
      var sid = surfBtn.getAttribute('data-surface-tab');
      if (sid && sid !== State.activeSurface) {
        State.activeSurface = sid;
        // Different surface = different cards. Close any expanded
        // ladder picker so the user lands with the new family list
        // visible and uncluttered.
        __expandedT2 = null;
        saveUIState();
        renderT2();
        // Switching surfaces in T2 = the preview should repaint on
        // that surface. Active-surface signal is enough; the CSS
        // payload doesn't change.
        pushActiveSurface();
      }
      return;
    }
    // Reset source-palette override (back to surface's declared default).
    var palResetBtn = e.target.closest && e.target.closest('[data-surface-palette-reset]');
    if (palResetBtn) {
      var rsid = palResetBtn.getAttribute('data-surface-palette-reset');
      if (rsid && State.t2SurfacePalette && State.t2SurfacePalette[rsid]) {
        delete State.t2SurfacePalette[rsid];
        scheduleAutosave();
        pushPreview();
        renderT2();
        refreshChangeBar();
      }
      return;
    }
    // Property Card expand/collapse toggle (the swatch is the affordance).
    // T1 cards are always-expanded so toggle is a no-op there.
    var toggleBtn = e.target.closest && e.target.closest('[data-pc-toggle]');
    if (toggleBtn) {
      var tcard = toggleBtn.closest('.ev2-pc');
      if (!tcard) return;
      if (tcard.getAttribute('data-pc-tier') === 't1') return;
      var key = tcard.getAttribute('data-pc-surface') + '/' + tcard.getAttribute('data-pc-prop');
      __expandedT2 = (__expandedT2 === key) ? null : key;
      renderT2();
      return;
    }
    // Picked a step from the inline ladder — same write path as the
    // ± stepper. T1 + T2 share the DOM hook; dispatch by tier.
    var pickBtn = e.target.closest && e.target.closest('[data-pc-ladder-pick]');
    if (pickBtn) {
      var pcard = pickBtn.closest('.ev2-pc');
      if (!pcard) return;
      var picked = pickBtn.getAttribute('data-pc-ladder-pick');
      if (pcard.getAttribute('data-pc-tier') === 't1') {
        var pcDerived = pcard.getAttribute('data-pc-derived');
        if (pcDerived) {
          setT1Derived(pcard.getAttribute('data-pc-role'), pcDerived, State.editingMode, picked);
        } else {
          setT1Lever(
            pcard.getAttribute('data-pc-role'),
            pcard.getAttribute('data-pc-lever'),
            State.editingMode,
            picked
          );
        }
      } else {
        setT2Step(
          pcard.getAttribute('data-pc-surface'),
          pcard.getAttribute('data-pc-prop'),
          State.editingMode,
          picked
        );
      }
      return;
    }
    var stepBtn = e.target.closest && e.target.closest('[data-pc-step]');
    if (stepBtn) {
      var card = stepBtn.closest('.ev2-pc');
      if (!card) return;
      var delta = parseInt(stepBtn.getAttribute('data-pc-step'), 10) || 0;
      if (card.getAttribute('data-pc-tier') === 't1') {
        // T1 stepper: walk in the perceived-tonal direction so "+"
        // always goes darker on-screen, regardless of mode.
        var roleId  = card.getAttribute('data-pc-role');
        var derivedId = card.getAttribute('data-pc-derived');
        if (derivedId) {
          // onComponent is binary — flip between white/black.
          if (derivedId === 'onComponent') {
            var curOC = t1DerivedStep(roleId, derivedId, State.editingMode);
            var nxOC = curOC === 'white' ? 'black' : 'white';
            setT1Derived(roleId, derivedId, State.editingMode, nxOC);
            return;
          }
          var curD = t1DerivedStep(roleId, derivedId, State.editingMode);
          var nxD  = stepRel(curD, delta * tonalDir(State.editingMode));
          if (nxD !== curD) setT1Derived(roleId, derivedId, State.editingMode, nxD);
          return;
        }
        var leverId = card.getAttribute('data-pc-lever');
        if (!roleId || !leverId) return;
        var t1cur = t1For(roleId, State.editingMode)[leverId];
        var t1nx  = stepRel(t1cur, delta * tonalDir(State.editingMode));
        if (t1nx !== t1cur) setT1Lever(roleId, leverId, State.editingMode, t1nx);
        return;
      }
      var surfaceId = card.getAttribute('data-pc-surface');
      var propId    = card.getAttribute('data-pc-prop');
      if (!surfaceId || !propId) return;
      // Walk in the tonal direction the user perceives: clicking "+"
      // (darker) in light mode goes UP the ladder; in dark mode the
      // visible darker direction is the opposite so we mirror via
      // tonalDir(). Keeps the stepper intuitive across modes.
      var current = resolveT2Step(surfaceId, propId, State.editingMode);
      var next    = stepRel(current, delta * tonalDir(State.editingMode));
      if (next !== current) setT2Step(surfaceId, propId, State.editingMode, next);
      return;
    }
    var resetBtn = e.target.closest && e.target.closest('[data-pc-reset]');
    if (resetBtn && !resetBtn.disabled) {
      var card2 = resetBtn.closest('.ev2-pc');
      if (!card2) return;
      if (card2.getAttribute('data-pc-tier') === 't1') {
        var derivedR = card2.getAttribute('data-pc-derived');
        if (derivedR) {
          clearT1Derived(card2.getAttribute('data-pc-role'), derivedR, State.editingMode);
          return;
        }
        clearT1Lever(
          card2.getAttribute('data-pc-role'),
          card2.getAttribute('data-pc-lever'),
          State.editingMode
        );
        return;
      }
      clearT2Override(
        card2.getAttribute('data-pc-surface'),
        card2.getAttribute('data-pc-prop'),
        State.editingMode
      );
      return;
    }
    var bulkBtn = e.target.closest && e.target.closest('[data-pc-bulk]');
    if (bulkBtn) {
      handleT2RowBulk(bulkBtn);
      return;
    }
  });

  /* ── Save/Deploy summary dialog ────────────────────────
     One dialog, two modes:
       - 'save'   → Save as project default. Lists EVERY emitted
                    token (full hierarchy snapshot), collects name/
                    description/semver, writes to the repo so the
                    new mapping becomes the project's loaded default.
       - 'deploy' → Push to Figma (existing flow). Lists only the
                    deltas vs. the project default, since Figma
                    already has the rest.
     Both share the same shell so the user gets one mental model:
     "review → confirm". The mode only affects: title/sub copy, the
     metadata form's visibility, the summary scope, and what the
     confirm button does. */

  function buildDeploySummary(scope) {
    // scope: 'delta' (default — only changes) or 'full' (everything that will be persisted)
    scope = scope || 'delta';
    var full = (scope === 'full');
    var sections = [];
    var totalChanges = 0;

    // T0 — palette anchor changes
    var t0Changes = [];
    ROLES.forEach(function (r) {
      var changed = isChanged(r.id);
      if (!full && !changed) return;
      t0Changes.push({
        role: r,
        from: (State.baseline[r.id] || '').toUpperCase(),
        to:   (State.proposed[r.id] || '').toUpperCase(),
        changed: changed
      });
    });
    if (t0Changes.length) {
      if (!full) totalChanges += t0Changes.filter(function(c){return c.changed;}).length;
      sections.push({
        tier: 'T0',
        title: full ? 'Palette anchors' : 'Palette anchors',
        sub: full ? 'Foundation seed colors for every role. The full ladder is regenerated from these.' : 'Foundation colors. Cascades to roles, surfaces, and components.',
        rows: t0Changes.map(function (c) {
          var diffHTML = c.changed
            ? '<code class="ev2-deploy-from">' + c.from + '</code>'
                + '<span class="ev2-deploy-arrow">\u2192</span>'
                + '<code class="ev2-deploy-to" style="background:' + c.to + ';color:' + textOnHex(c.to) + '">' + c.to + '</code>'
            : '<code class="ev2-deploy-to" style="background:' + c.to + ';color:' + textOnHex(c.to) + '">' + c.to + '</code>';
          return '<div class="ev2-deploy-row">'
            + '<span class="ev2-deploy-row-dot" style="background:' + c.to + '"></span>'
            + '<span class="ev2-deploy-row-label">' + c.role.label + ' anchor</span>'
            + '<span class="ev2-deploy-row-diff">' + diffHTML + '</span>'
          + '</div>';
        }).join('')
      });
    }

    // T0.5 — custom palettes (project-level, e.g. "neutral"). Show in
    // full-mode only; deltas aren't tracked because custom palettes
    // come from primitives.css we don't currently edit at runtime.
    if (full) {
      var customs = (typeof discoverCustomPalettes === 'function') ? discoverCustomPalettes() : [];
      if (customs.length) {
        sections.push({
          tier: 'T0',
          title: 'Custom palettes',
          sub: 'Project-specific palettes loaded from primitives.css. Persisted as-is.',
          rows: customs.map(function (c) {
            var ladder = (typeof customPaletteSteps === 'function') ? customPaletteSteps(c.id) : null;
            var seed = ladder ? (ladder.find(function(s){return s.name==='500';}) || {}).hex : '';
            var swatch = seed || '#888';
            return '<div class="ev2-deploy-row">'
              + '<span class="ev2-deploy-row-dot" style="background:' + swatch + '"></span>'
              + '<span class="ev2-deploy-row-label">' + c.label + '</span>'
              + '<span class="ev2-deploy-row-diff"><code class="ev2-deploy-to" style="background:' + swatch + ';color:' + textOnHex(swatch) + '">' + (seed || '\u2014').toUpperCase() + '</code>'
                + '<em>22-step ladder</em></span>'
            + '</div>';
          }).join('')
        });
      }
    }

    // T1 — per-role per-mode step changes
    ['light','dark'].forEach(function (mode) {
      var rows = [];
      ROLES.forEach(function (r) {
        var changed = isT1ChangedInMode(r.id, mode);
        if (!full && !changed) return;
        var t = State.t1[mode][r.id];
        var def = defaultT1ForRole(r.id, mode);
        var swatchHex = stepHexByName(r.id, t.fill) || State.proposed[r.id];
        if (full) {
          // Show the current picks plainly (no diff arrows when unchanged)
          var pickHTML = 'Fill <em>' + t.fill + '</em> \u00b7 Content <em>' + t.content + '</em> \u00b7 Container <em>' + t.container + '</em>';
          if (changed) {
            var deltas = [];
            if (t.fill !== def.fill)           deltas.push('Fill <em>'      + def.fill      + '</em> \u2192 <em>' + t.fill      + '</em>');
            if (t.content !== def.content)     deltas.push('Content <em>'   + def.content   + '</em> \u2192 <em>' + t.content   + '</em>');
            if (t.container !== def.container) deltas.push('Container <em>' + def.container + '</em> \u2192 <em>' + t.container + '</em>');
            if (deltas.length) pickHTML = deltas.join(' \u00b7 ');
          }
          rows.push('<div class="ev2-deploy-row">'
            + '<span class="ev2-deploy-row-dot" style="background:' + swatchHex + '"></span>'
            + '<span class="ev2-deploy-row-label">' + r.label + (changed ? ' \u2022 edited' : '') + '</span>'
            + '<span class="ev2-deploy-row-diff">' + pickHTML + '</span>'
          + '</div>');
        } else {
          var deltas2 = [];
          if (t.fill !== def.fill)           deltas2.push('Fill step <em>'      + def.fill      + '</em> \u2192 <em>' + t.fill      + '</em>');
          if (t.content !== def.content)     deltas2.push('Content step <em>'   + def.content   + '</em> \u2192 <em>' + t.content   + '</em>');
          if (t.container !== def.container) deltas2.push('Container step <em>' + def.container + '</em> \u2192 <em>' + t.container + '</em>');
          if (!deltas2.length) return;
          rows.push('<div class="ev2-deploy-row">'
            + '<span class="ev2-deploy-row-dot" style="background:' + swatchHex + '"></span>'
            + '<span class="ev2-deploy-row-label">' + r.label + '</span>'
            + '<span class="ev2-deploy-row-diff">' + deltas2.join(' \u00b7 ') + '</span>'
          + '</div>');
          totalChanges += 1;
        }
      });
      if (rows.length) {
        sections.push({
          tier: 'T1',
          title: 'Roles \u2014 ' + (mode === 'light' ? 'Light mode' : 'Dark mode'),
          sub: 'Per-role step picks for fill, content, and container.',
          rows: rows.join('')
        });
      }
    });

    // T2 — per-surface palette + per-prop step picks. In full mode,
    // emit one row per surface summarising "palette + N custom props".
    // In delta mode, only surfaces with changes appear.
    ['light','dark'].forEach(function (mode) {
      var rows = [];
      T2_SURFACES.forEach(function (s) {
        var changed = isT2Changed(s.id);
        if (!full && !changed) return;
        var pal = surfacePaletteFor(s.id);
        var bg  = t2HexFor(s.id, 'bg', mode);
        var customCount = 0;
        var bag = State.t2 && State.t2[mode] && State.t2[mode][s.id];
        if (bag) {
          Object.keys(bag).forEach(function (pid) {
            var ov = bag[pid];
            if (ov && (ov.step || ov.follows)) customCount++;
          });
        }
        if (full) {
          var pieces = ['palette <em>' + pal + '</em>'];
          if (customCount) pieces.push(customCount + ' custom prop' + (customCount === 1 ? '' : 's'));
          else pieces.push('all defaults');
          rows.push('<div class="ev2-deploy-row">'
            + '<span class="ev2-deploy-row-dot" style="background:' + bg + '"></span>'
            + '<span class="ev2-deploy-row-label">' + s.label + (changed ? ' \u2022 edited' : '') + '</span>'
            + '<span class="ev2-deploy-row-diff">' + pieces.join(' \u00b7 ') + '</span>'
          + '</div>');
        } else {
          if (!customCount && !isSurfacePaletteCustom(s.id)) return;
          var deltaPieces = [];
          if (isSurfacePaletteCustom(s.id)) deltaPieces.push('palette \u2192 <em>' + pal + '</em>');
          if (customCount) deltaPieces.push(customCount + ' prop' + (customCount === 1 ? '' : 's') + ' overridden');
          rows.push('<div class="ev2-deploy-row">'
            + '<span class="ev2-deploy-row-dot" style="background:' + bg + '"></span>'
            + '<span class="ev2-deploy-row-label">' + s.label + '</span>'
            + '<span class="ev2-deploy-row-diff">' + deltaPieces.join(' \u00b7 ') + '</span>'
          + '</div>');
          totalChanges += 1;
        }
      });
      if (rows.length) {
        sections.push({
          tier: 'T2',
          title: 'Surfaces \u2014 ' + (mode === 'light' ? 'Light mode' : 'Dark mode'),
          sub: 'Surface-level palette assignments and per-prop overrides.',
          rows: rows.join('')
        });
      }
    });

    return { sections: sections, total: totalChanges };
  }

  // Quick contrast picker for the diff swatch label
  function textOnHex(hex) {
    return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#000000') ? '#FFFFFF' : '#000000';
  }

  /* ── CSS emitters (full snapshot for save-as-default) ──
     pushPreview() already builds the overrides CSS string for the
     iframe; these emitters split that logic so each file the writer
     publishes (primitives.css, semantic.css, surfaces.css) can be
     generated independently and committed to the project folder.
     The serialised content matches what the iframe sees at runtime,
     so a reload of the project will replay the editor state byte-
     identically. */
  function buildPrimitivesCSS(meta) {
    var lines = [];
    lines.push('/* Generated by Design Token Forge editor v2 \u2014 do not edit by hand. */');
    if (meta) {
      lines.push('/* version: ' + meta.version + ' \u2014 ' + (meta.name || '') + ' */');
      lines.push('/* saved:   ' + meta.savedAt + (meta.savedBy ? ' by ' + meta.savedBy : '') + ' */');
    }
    lines.push(':root {');
    ROLES.forEach(function (r) {
      var steps = stepsFor(r.id);
      steps.forEach(function (s) {
        if (s.name === 'white' || s.name === 'black') return;
        lines.push('  --prim-' + r.prefix + '-' + s.name + ': ' + s.hex + ';');
      });
    });
    // Re-emit any custom palettes (e.g. writer-handhelds 'neutral')
    // exactly as the editor sees them today \u2014 these come from the
    // project's loaded primitives.css and need to survive the round-
    // trip even though the editor doesn't currently rewrite them.
    var customs = (typeof discoverCustomPalettes === 'function') ? discoverCustomPalettes() : [];
    customs.forEach(function (c) {
      var ladder = customPaletteSteps(c.id);
      if (!ladder) return;
      ladder.forEach(function (s) {
        if (s.name === 'white' || s.name === 'black' || !s.hex) return;
        lines.push('  --prim-' + c.id + '-' + s.name + ': ' + s.hex.toUpperCase() + ';');
      });
    });
    lines.push('}');
    return lines.join('\n') + '\n';
  }
  function buildSemanticCSS(meta) {
    var lines = [];
    lines.push('/* Generated by Design Token Forge editor v2 \u2014 do not edit by hand. */');
    if (meta) lines.push('/* version: ' + meta.version + ' */');
    lines.push(':root {');
    ROLES.forEach(function (r) {
      semanticVarsFor(r.id, 'light').forEach(function (l) { lines.push(l); });
    });
    lines.push('}');
    lines.push('[data-theme="dark"] {');
    ROLES.forEach(function (r) {
      semanticVarsFor(r.id, 'dark').forEach(function (l) { lines.push(l); });
    });
    lines.push('}');
    return lines.join('\n') + '\n';
  }
  function buildSurfacesCSS(meta) {
    var lines = [];
    lines.push('/* Generated by Design Token Forge editor v2 \u2014 do not edit by hand. */');
    if (meta) lines.push('/* version: ' + meta.version + ' */');
    lines.push(':root {');
    surfaceVarsLinesForMode('light').forEach(function (l) { lines.push(l); });
    lines.push('}');
    lines.push('[data-theme="dark"] {');
    surfaceVarsLinesForMode('dark').forEach(function (l) { lines.push(l); });
    lines.push('}');
    return lines.join('\n') + '\n';
  }
  function buildConfigJSON(prevCfg, meta) {
    // Merge into existing config rather than replace \u2014 keeps any
    // future keys (paletteKeys, etc.) untouched.
    var cfg = prevCfg ? JSON.parse(JSON.stringify(prevCfg)) : {};
    cfg.schemaVersion = Math.max(cfg.schemaVersion || 2, 2);
    cfg.surfacePaletteSrc = {};
    T2_SURFACES.forEach(function (s) {
      cfg.surfacePaletteSrc[s.id] = surfacePaletteFor(s.id);
    });
    // Mirror customRoles so future loads keep them as first-class T1.
    var builtins = { brand:1, danger:1, success:1, warning:1, info:1 };
    var customRoles = ROLES.filter(function (r) { return !builtins[r.id]; }).map(function (r) {
      return { id: r.id, label: r.label, keyHex: (State.proposed[r.id] || '').toUpperCase() };
    });
    if (customRoles.length) cfg.customRoles = customRoles;
    cfg.latestVersion = {
      version: meta.version,
      name:    meta.name || '',
      description: meta.description || '',
      savedAt: meta.savedAt,
      savedBy: meta.savedBy || ''
    };
    return JSON.stringify(cfg, null, 2) + '\n';
  }

  /* ── Semver helpers ─────────────────────────────────── */
  function parseSemver(v) {
    var m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim());
    if (!m) return { major: 1, minor: 0, patch: 0 };
    return { major: +m[1], minor: +m[2], patch: +m[3] };
  }
  function formatSemver(s) { return 'v' + s.major + '.' + s.minor + '.' + s.patch; }
  function bumpSemver(current, bump) {
    var s = parseSemver(current);
    if (bump === 'major') return formatSemver({ major: s.major + 1, minor: 0, patch: 0 });
    if (bump === 'minor') return formatSemver({ major: s.major, minor: s.minor + 1, patch: 0 });
    return formatSemver({ major: s.major, minor: s.minor, patch: s.patch + 1 });
  }
  function getProjectCurrentVersion() {
    // In-session publishes are authoritative — the on-disk
    // config.json under file:// doesn't refresh after a commit,
    // so without this check a second Publish in the same session
    // would bump from the stale baseline and produce a colliding
    // older version (e.g. v0.0.5 \u2192 v1.0.0, then \u2192 v0.1.0).
    if (State.lastPublishedVersion) return State.lastPublishedVersion;
    var cfg = readProjectConfigSync();
    return (cfg && cfg.latestVersion && cfg.latestVersion.version) || 'v0.0.0';
  }

  /* ── Wizard helpers ───────────────────────────────────
     The publish flow is a two-step wizard:
       1. Save snapshot  → commits to GitHub
       2. Push to Figma  → tells the user how to refresh the plugin
     Either step can be entered first (topbar "Save as default"
     opens at step 1; topbar "Deploy to Figma" opens at step 2).
     After a successful save we auto-advance to step 2, but the
     user can also Cancel from anywhere. */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function defaultSnapshotName(d) {
    d = d || new Date();
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function setWizardStep(step) {
    // Legacy wizard stepper retired in favor of single-screen
    // Publish dialog + inline timeline. Kept as a no-op so older
    // call sites don't blow up while the JS reload propagates.
    void step;
  }

  /* ── Unified open/close ──────────────────────────────── */
  /* Publish dialog \u2014 single screen, two modes:
       'form'      \u2192 metadata form + change summary
       'progress'  \u2192 inline timeline (Saving \u2192 Notifying Figma \u2192 Done)
     Success/error are sub-states of 'progress' driven by data-tl-state. */
  function openDialog(_mode, _opts) {
    var dlg = document.getElementById('ev2DeployDialog');
    if (!dlg) return;
    // Cancel any in-flight publish state from a prior open.
    dlg.setAttribute('data-mode', 'form');
    dlg._publishing = false;
    dlg._lastPublished = null;

    var projId    = getActiveProjectId() || '';
    var projLabel = projId ? projectName(projId) : 'No project (defaults)';
    // Use delta mode \u2014 dialog shows only what's actually changing.
    // Always report the topbar/savebar count for consistency
    // (summary counts per-mode; topbar counts per-role/surface).
    var summary   = buildDeploySummary('delta');
    var n         = totalChanges();

    var title      = document.getElementById('ev2DeployTitle');
    var sub        = document.getElementById('ev2DeploySub');
    var meta       = document.getElementById('ev2DeployMeta');
    var body       = document.getElementById('ev2DeployBody');
    var hint       = document.getElementById('ev2DeployHint');
    var confirmBtn = document.getElementById('ev2DeployConfirm');
    var cancelBtn  = document.getElementById('ev2WizardCancel');
    var saveForm   = document.getElementById('ev2SaveForm');
    var timeline   = document.getElementById('ev2PublishTimeline');

    if (saveForm) saveForm.hidden = false;
    if (timeline) timeline.hidden = true;
    if (cancelBtn) { cancelBtn.hidden = false; cancelBtn.textContent = 'Cancel'; }

    var cur = getProjectCurrentVersion();
    var nextVer = bumpSemver(cur, 'patch');
    title.textContent = 'Publish to ' + projLabel;
    sub.textContent = 'Save your changes as the new default for "' + projLabel + '". Figma refreshes automatically within \u00b71 minute.';
    confirmBtn.textContent = n ? ('Publish ' + nextVer) : 'Publish';
    confirmBtn.disabled = false;
    hint.innerHTML = 'Writes to your GitHub fork. A Personal Access Token with <code>repo</code> scope is required.';

    // Wire metadata form defaults
    var prevEl = document.getElementById('ev2SaveVerPrev');
    var nextEl = document.getElementById('ev2SaveVerNext');
    if (prevEl) prevEl.textContent = cur;
    if (nextEl) nextEl.textContent = nextVer;
    saveForm.querySelectorAll('[data-ver-bump]').forEach(function (btn) {
      btn.setAttribute('aria-checked', btn.getAttribute('data-ver-bump') === 'patch' ? 'true' : 'false');
    });
    var nameInput = document.getElementById('ev2SaveName');
    var descInput = document.getElementById('ev2SaveDesc');
    if (!nameInput.value || nameInput.dataset.autofilled === '1') {
      nameInput.value = defaultSnapshotName();
      nameInput.dataset.autofilled = '1';
    }
    if (!nameInput._wiredAutofill) {
      nameInput.addEventListener('input', function () { nameInput.dataset.autofilled = '0'; });
      nameInput._wiredAutofill = true;
    }
    descInput.value = descInput.value || '';
    nameInput.removeAttribute('data-invalid');

    meta.innerHTML =
        '<span class="ev2-deploy-meta-row"><span class="ev2-deploy-meta-k">Project</span><span class="ev2-deploy-meta-v">' + projLabel + '</span></span>'
      + '<span class="ev2-deploy-meta-row"><span class="ev2-deploy-meta-k">Changes</span><span class="ev2-deploy-meta-v ev2-deploy-meta-total">' + n + '</span></span>';

    body.innerHTML = summary.sections.length
      ? summary.sections.map(renderSummarySection).join('')
      : '<div class="ev2-deploy-section-empty">No changes since the last release.</div>';

    dlg.hidden = false;
    document.body.classList.add('ev2-modal-open');
    // Legacy flags kept for any stragglers; new flow ignores them.
    dlg._wizard = false;
    dlg._deployDone = false;
  }
  function renderSummarySection(s) {
    return '<section class="ev2-deploy-section">'
      + '<header class="ev2-deploy-section-head">'
        + '<span class="ev2-deploy-section-tag">' + s.tier + '</span>'
        + '<div><div class="ev2-deploy-section-title">' + s.title + '</div>'
        + '<div class="ev2-deploy-section-sub">' + s.sub + '</div></div>'
      + '</header>'
      + '<div class="ev2-deploy-rows">' + s.rows + '</div>'
    + '</section>';
  }
  function openPublishDialog() { openDialog(); }
  function closeDeployDialog() {
    var dlg = document.getElementById('ev2DeployDialog');
    if (!dlg) return;
    if (dlg._publishing) return; // don't allow closing while in flight
    dlg.hidden = true;
    dlg._wizard = false;
    dlg._deployDone = false;
    dlg._lastPublished = null;
    dlg._publishing = false;
    document.body.classList.remove('ev2-modal-open');
  }

  /* ── Version history dialog ──────────────────────────
     Read-only listing of every published version for the
     active project. Each row offers a Restore action that
     republishes the chosen snapshot as a new patch version
     (never rewrites history — the older versions stay).
     Snapshots written before commit 87e07de only contain
     metadata (files: [...]) so their Restore is disabled.
  */
  function openHistoryDialog() {
    var dlg  = document.getElementById('ev2HistoryDialog');
    var body = document.getElementById('ev2HistoryBody');
    if (!dlg || !body) return;
    var projId = getActiveProjectId();
    if (!projId) {
      if (window.ev2Toast) window.ev2Toast('No active project \u2014 open one first', 'warn');
      return;
    }
    dlg.hidden = false;
    document.body.classList.add('ev2-modal-open');
    body.innerHTML = '<div class="ev2-history-empty">Loading version history\u2026</div>';

    // Requires a GH token to list private contents. If user doesn't
    // have one yet we prompt — same flow as Publish.
    ensureGhCredentials().then(function (cred) {
      var path = 'projects/' + projId + '/versions';
      return ghFetch('/repos/' + cred.user + '/' + GH_REPO_NAME + '/contents/' + path)
        .then(function (entries) { return { user: cred.user, entries: entries || [] }; })
        .catch(function (err) {
          if (err && err.status === 404) return { user: cred.user, entries: [] };
          throw err;
        });
    }).then(function (res) {
      var jsonFiles = (res.entries || []).filter(function (e) {
        return e && e.type === 'file' && /\.json$/i.test(e.name);
      });
      if (!jsonFiles.length) {
        body.innerHTML = '<div class="ev2-history-empty">No published versions yet. Use <strong>Publish</strong> to create your first snapshot.</div>';
        return;
      }
      // Fetch all snapshot bodies in parallel (each is tiny).
      return Promise.all(jsonFiles.map(function (e) {
        return fetch(e.download_url).then(function (r) { return r.json(); })
          .then(function (json) { return { name: e.name, json: json }; })
          .catch(function () { return { name: e.name, json: null }; });
      })).then(function (snapshots) { renderHistoryList(res.user, snapshots); });
    }).catch(function (err) {
      body.innerHTML = '<div class="ev2-history-empty">Couldn\u2019t load version history.<br><small>' + escapeHTML(String(err && err.message || err)) + '</small></div>';
    });
  }

  function closeHistoryDialog() {
    var dlg = document.getElementById('ev2HistoryDialog');
    if (!dlg) return;
    if (dlg._restoring) return;
    dlg.hidden = true;
    document.body.classList.remove('ev2-modal-open');
  }

  function renderHistoryList(ghUser, snapshots) {
    var body = document.getElementById('ev2HistoryBody');
    if (!body) return;
    // "Live" = the most recently saved snapshot (by savedAt). That
    // matches what config.latestVersion points at on GitHub after
    // any sequence of publishes/restores. Semver-max is wrong here
    // because Restore re-publishes lower numbers and a later
    // major-bump can leave a higher number that's no longer Live.
    function tsOf(s) {
      var t = s && s.json && s.json.meta && s.json.meta.savedAt;
      return t ? Date.parse(t) || 0 : 0;
    }
    // Sort newest first by savedAt; fall back to semver if times tie.
    snapshots.sort(function (a, b) {
      var ta = tsOf(a), tb = tsOf(b);
      if (ta !== tb) return tb - ta;
      var av = (a.json && a.json.meta && a.json.meta.version) || a.name;
      var bv = (b.json && b.json.meta && b.json.meta.version) || b.name;
      return cmpSemver(bv, av);
    });
    var liveName = snapshots.length ? snapshots[0].name : null;
    var rows = snapshots.map(function (s) {
      var meta = (s.json && s.json.meta) || {};
      var ver  = meta.version || s.name.replace(/\.json$/, '');
      var name = meta.name || '\u2014';
      var when = meta.savedAt ? timeAgo(meta.savedAt) : '';
      var who  = meta.savedBy || '';
      var desc = meta.description || '';
      var isCurrent = (s.name === liveName);
      // Restorable for ANY published snapshot: we either read inline
      // files from the snapshot JSON, or recover them from the git
      // commit that created the snapshot file. Only the Live row
      // is intentionally inert.
      var btnAttrs, btnLabel, btnDisabledAttr;
      if (isCurrent) {
        btnAttrs = ''; btnLabel = 'Live'; btnDisabledAttr = 'disabled';
      } else {
        btnAttrs = 'data-restore="' + escapeAttr(ver) + '"';
        btnLabel = 'Restore'; btnDisabledAttr = '';
      }
      var rowState = isCurrent ? 'live' : 'restorable';
      var metaBits = [];
      if (when) metaBits.push(escapeHTML(when));
      if (who)  metaBits.push(escapeHTML('@' + who));
      var metaLine = metaBits.join(' <span class="ev2-history-meta-sep">\u00b7</span> ');
      return '<div class="ev2-history-row" data-current="' + (isCurrent ? 'true' : 'false') + '" data-state="' + rowState + '">'
        + '<div class="ev2-history-ver">'
          + escapeHTML(ver)
          + (isCurrent ? '<span class="ev2-history-live">Live</span>' : '')
        + '</div>'
        + '<div class="ev2-history-info">'
          + '<div class="ev2-history-name">' + escapeHTML(name) + '</div>'
          + (metaLine ? '<div class="ev2-history-meta">' + metaLine + '</div>' : '')
          + (desc ? '<div class="ev2-history-desc">' + escapeHTML(desc) + '</div>' : '')
        + '</div>'
        + '<button class="ev2-history-restore" type="button" ' + btnAttrs + ' ' + btnDisabledAttr + '>'
          + escapeHTML(btnLabel)
        + '</button>'
      + '</div>';
    }).join('');
    body.innerHTML = '<div class="ev2-history-list">' + rows + '</div>';
    body._ghUser = ghUser;
    body._snapshots = snapshots;
  }

  // Restore = republish the snapshot's files as a new patch version.
  // Same files API as Publish; same Pages rebuild. Old version JSONs
  // are untouched \u2014 history only grows.
  //
  // Two paths to get the file contents:
  //   1. Inline (snapshot.files is an object \u2192 take as-is)
  //   2. Git history (snapshot.files is missing or array \u2192 find
  //      the commit that wrote versions/<ver>.json and read each
  //      file at that SHA). This makes EVERY published snapshot
  //      restorable, including ones from older builds that only
  //      saved metadata in the version JSON.
  function restoreVersion(ver) {
    var projId = getActiveProjectId();
    if (!projId) return;
    var body = document.getElementById('ev2HistoryBody');
    var snap = (body && body._snapshots || []).find(function (s) {
      return (s.json && s.json.meta && s.json.meta.version) === ver;
    });
    if (!snap || !snap.json) {
      if (window.ev2Toast) window.ev2Toast('Couldn\u2019t find snapshot for ' + ver, 'error');
      return;
    }
    var curVer  = getProjectCurrentVersion();
    var nextVer = bumpSemver(curVer, 'patch');
    var origName = (snap.json.meta && snap.json.meta.name) || ver;
    var ok = window.confirm(
      'Restore ' + ver + ' \u2014 "' + origName + '"\n\n'
      + 'This publishes a new version (' + nextVer + ') with the contents of ' + ver + '.\n'
      + 'Older versions stay in history. Figma refreshes after the commit.\n\nContinue?'
    );
    if (!ok) return;

    var btn = body.querySelector('[data-restore="' + cssEscape(ver) + '"]');
    if (btn) { btn.setAttribute('data-restoring','true'); btn.disabled = true; btn.textContent = 'Restoring\u2026'; }
    var dlg = document.getElementById('ev2HistoryDialog');
    if (dlg) dlg._restoring = true;

    var creds; // captured for the recover step
    ensureGhCredentials().then(function (cred) {
      creds = cred;
      var hasInline = snap.json.files && !Array.isArray(snap.json.files) && typeof snap.json.files === 'object';
      if (hasInline) return snap.json.files;
      // Recover from git history. Older snapshots (array of names
      // or no files key) are still in the repo \u2014 we just need
      // to read them at the commit that introduced them.
      if (btn) btn.textContent = 'Recovering\u2026';
      return recoverFilesFromGit(cred.user, projId, ver);
    }).then(function (files) {
      var meta = {
        version:     nextVer,
        name:        'Restore of ' + ver,
        description: 'Restored from ' + ver + (origName && origName !== ver ? ' \u2014 "' + origName + '"' : ''),
        savedAt:     new Date().toISOString(),
        savedBy:     creds.user
      };
      if (btn) btn.textContent = 'Restoring\u2026';
      // Patch the snapshot's config.json so latestVersion reflects
      // the NEW version, not the restored one. Without this, the
      // editor would re-open thinking ver is the live version.
      var newCfgText = files['config.json'] || '';
      try {
        var cfg = JSON.parse(newCfgText);
        cfg.latestVersion = {
          version: nextVer,
          name: meta.name,
          description: meta.description,
          savedAt: meta.savedAt,
          savedBy: meta.savedBy
        };
        newCfgText = JSON.stringify(cfg, null, 2) + '\n';
      } catch (_) { /* leave as-is */ }

      // New version JSON re-embeds the same files so the restored
      // version is itself restorable.
      var versionSnapshot = JSON.stringify({
        meta: meta,
        savedFrom: 'editor-v2-restore',
        restoredFrom: ver,
        files: {
          'primitives.css': files['primitives.css'] || '',
          'semantic.css':   files['semantic.css']   || '',
          'surfaces.css':   files['surfaces.css']   || '',
          'config.json':    newCfgText
        }
      }, null, 2) + '\n';

      var base = 'projects/' + projId;
      var toCommit = [
        { path: base + '/primitives.css', content: files['primitives.css'] || '' },
        { path: base + '/semantic.css',   content: files['semantic.css']   || '' },
        { path: base + '/surfaces.css',   content: files['surfaces.css']   || '' },
        { path: base + '/config.json',    content: newCfgText },
        { path: base + '/versions/' + nextVer + '.json', content: versionSnapshot }
      ];
      var msg = 'project(' + projId + '): restore ' + ver + ' as ' + nextVer;
      return ghMultiCommit(creds.user, toCommit, msg).then(function () { return meta; });
    }).then(function (meta) {
      // Mirror restored files into localStorage stash so the reload
      // below picks them up immediately (workspace copy / Pages will
      // lag by ~1 min).
      try {
        localStorage.setItem('dtf-project-primitives-' + projId, files['primitives.css'] || '');
        localStorage.setItem('dtf-project-config-' + projId, newCfgText);
      } catch (e) { /* non-fatal */ }
      // Fire Pages rebuild — best-effort like normal Publish.
      triggerPagesRebuild().catch(function () {});
      if (window.ev2Toast) window.ev2Toast('Restored ' + ver + ' as ' + meta.version + '. Reloading editor\u2026', 'success', 3500);
      if (dlg) dlg._restoring = false;
      // Reload so the editor reads the freshly-restored files as
      // the new baseline. This avoids any drift between in-memory
      // State and what GitHub now holds.
      setTimeout(function () { window.location.reload(); }, 1200);
    }).catch(function (err) {
      if (window.ev2Toast) window.ev2Toast('Restore failed: ' + (err && err.message || err), 'error', 6000);
      if (btn) { btn.removeAttribute('data-restoring'); btn.disabled = false; btn.textContent = 'Restore'; }
      if (dlg) dlg._restoring = false;
      // eslint-disable-next-line no-console
      console.error('[restore]', err);
    });
  }

  /* Recover project files at the commit that introduced
     versions/<ver>.json. Used when the snapshot itself doesn't
     embed file contents (older builds). Returns a Promise of
     { 'primitives.css': string, ... } same shape as inline. */
  function recoverFilesFromGit(owner, projId, ver) {
    var base = 'projects/' + projId;
    var versionPath = base + '/versions/' + ver + '.json';
    // Step 1: find the publish commit (first/only commit that
    // wrote that specific version file).
    return ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/commits?path='
        + encodeURIComponent(versionPath) + '&per_page=1')
      .then(function (commits) {
        if (!commits || !commits.length) {
          throw new Error('No commit found for ' + ver);
        }
        var sha = commits[0].sha;
        // Step 2: fetch each project file at that SHA.
        var names = ['primitives.css','semantic.css','surfaces.css','config.json'];
        return Promise.all(names.map(function (name) {
          return ghFetch('/repos/' + owner + '/' + GH_REPO_NAME
              + '/contents/' + encodeURIComponent(base + '/' + name)
              + '?ref=' + encodeURIComponent(sha))
            .then(function (resp) {
              // resp.content is base64 with newlines; decode as UTF-8.
              var b64 = (resp && resp.content) ? resp.content.replace(/\n/g, '') : '';
              var bytes = atob(b64);
              try {
                return { name: name, text: decodeURIComponent(escape(bytes)) };
              } catch (_) {
                return { name: name, text: bytes };
              }
            })
            .catch(function () { return { name: name, text: '' }; });
        }));
      })
      .then(function (parts) {
        var out = {};
        parts.forEach(function (p) { out[p.name] = p.text; });
        if (!out['primitives.css']) {
          throw new Error('Couldn\u2019t read primitives.css at that commit');
        }
        return out;
      });
  }

  /* Semver compare. Returns -1 / 0 / 1. */
  function cmpSemver(a, b) {
    var sa = parseSemver(a), sb = parseSemver(b);
    if (sa.major !== sb.major) return sa.major < sb.major ? -1 : 1;
    if (sa.minor !== sb.minor) return sa.minor < sb.minor ? -1 : 1;
    if (sa.patch !== sb.patch) return sa.patch < sb.patch ? -1 : 1;
    return 0;
  }
  /* Friendly "2 hours ago" / "3 days ago". */
  function timeAgo(iso) {
    var t = Date.parse(iso); if (!t) return '';
    var diff = (Date.now() - t) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
    if (diff < 86400 * 30) return Math.floor(diff / 86400 / 7) + 'w ago';
    return new Date(t).toISOString().slice(0, 10);
  }
  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHTML(s); }
  function cssEscape(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  /* ── Inline publish timeline ─────────────────────────── */
  /* Single-screen timeline that replaces the form during publish.
     Steps are 'save' \u2192 'figma' \u2192 'done', each tracked by
     data-state ('pending' | 'running' | 'ok' | 'fail' | 'warn'). */
  function setTimelineStep(step, state, sub) {
    var li = document.querySelector('#ev2TlSteps li[data-step="' + step + '"]');
    if (!li) return;
    li.setAttribute('data-state', state);
    if (typeof sub === 'string') {
      var subEl = li.querySelector('[data-tl-sub]');
      if (subEl) subEl.textContent = sub;
    }
  }
  function showTimeline() {
    var saveForm = document.getElementById('ev2SaveForm');
    var body     = document.getElementById('ev2DeployBody');
    var timeline = document.getElementById('ev2PublishTimeline');
    var dlg      = document.getElementById('ev2DeployDialog');
    if (saveForm) saveForm.hidden = true;
    if (body)     body.hidden = true;
    if (timeline) timeline.hidden = false;
    if (dlg) dlg.setAttribute('data-mode', 'progress');
    ['save','figma','done'].forEach(function (s) { setTimelineStep(s, 'pending'); });
  }
  function finishTimeline(kind, summary) {
    // kind: 'ok' | 'partial' | 'error'
    var dlg = document.getElementById('ev2DeployDialog');
    var hint = document.getElementById('ev2DeployHint');
    var confirmBtn = document.getElementById('ev2DeployConfirm');
    var cancelBtn  = document.getElementById('ev2WizardCancel');
    var summaryEl  = document.getElementById('ev2TlSummary');
    if (dlg) {
      dlg.setAttribute('data-mode', kind === 'error' ? 'error' : (kind === 'partial' ? 'partial' : 'success'));
      dlg._publishing = false;
    }
    if (summaryEl && summary) {
      summaryEl.hidden = false;
      summaryEl.innerHTML = summary;
    }
    if (hint) hint.innerHTML = '';
    if (kind === 'error') {
      confirmBtn.textContent = 'Try again';
      confirmBtn.disabled = false;
      if (cancelBtn) { cancelBtn.hidden = false; cancelBtn.textContent = 'Cancel'; }
    } else {
      confirmBtn.textContent = 'Done';
      confirmBtn.disabled = false;
      if (cancelBtn) cancelBtn.hidden = true;
    }
  }

  /* ── GitHub writer for save-as-default ───────────────── */
  var GH_API = 'https://api.github.com';
  var GH_REPO_NAME = 'Design-Token-Forge';
  function getGhPat() { return localStorage.getItem('dtf-gh-pat') || ''; }
  function getGhUser() { return localStorage.getItem('dtf-gh-user') || ''; }
  function ghFetch(endpoint, opts) {
    opts = opts || {};
    var url = endpoint.startsWith('http') ? endpoint : GH_API + endpoint;
    return fetch(url, {
      method: opts.method || 'GET',
      headers: { 'Authorization': 'Bearer ' + getGhPat(), 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      // GitHub endpoints often return 202/204 with an empty body
      // (workflow_dispatch, delete ref, etc.). Parse JSON only when
      // there's actually content — otherwise return a synthetic ok
      // marker so callers can keep chaining .then().
      return r.text().then(function (txt) {
        var data = null;
        if (txt && txt.trim()) {
          try { data = JSON.parse(txt); } catch (_) { data = { message: txt }; }
        }
        if (!r.ok) {
          var msg = (data && data.message) ? data.message : (r.status + ' ' + r.statusText);
          var err = new Error(msg);
          err.status = r.status;
          err.body = data;
          throw err;
        }
        return data || { ok: true, status: r.status };
      });
    });
  }
  function ghEncode(str) { return btoa(unescape(encodeURIComponent(str))); }

  /* Multi-file commit via the git-tree API \u2014 atomic vs. N
     separate file PUTs. Mirrors the legacy editor's flow.
     Each entry in `files` is either { path, content } (add/update)
     or { path, delete: true } (remove from tree by emitting a
     null-sha tree entry). */
  function ghMultiCommit(owner, files, message, branch, _retry) {
    branch = branch || 'main';
    _retry = _retry || 0;
    return ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/git/ref/heads/' + branch)
      .then(function (ref) {
        var commitSha = ref.object.sha;
        return ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/git/commits/' + commitSha)
          .then(function (commit) {
            // Only create blobs for non-delete entries.
            var writeFiles = files.filter(function (f) { return !f.delete; });
            return Promise.all(writeFiles.map(function (f) {
              return ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/git/blobs', {
                method: 'POST', body: { content: ghEncode(f.content), encoding: 'base64' }
              }).then(function (blob) { return { path: f.path, sha: blob.sha }; });
            })).then(function (blobs) {
              var bySha = {};
              blobs.forEach(function (b) { bySha[b.path] = b.sha; });
              var tree = files.map(function (f) {
                if (f.delete) {
                  return { path: f.path, mode: '100644', type: 'blob', sha: null };
                }
                return { path: f.path, mode: '100644', type: 'blob', sha: bySha[f.path] };
              });
              return ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/git/trees', {
                method: 'POST', body: { base_tree: commit.tree.sha, tree: tree }
              });
            }).then(function (newTree) {
              return ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/git/commits', {
                method: 'POST', body: { message: message, tree: newTree.sha, parents: [commitSha] }
              });
            }).then(function (newCommit) {
              return ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/git/refs/heads/' + branch, {
                method: 'PATCH', body: { sha: newCommit.sha, force: false }
              });
            });
          });
      })
      .catch(function (err) {
        // Race: someone (Pages bot, another tab, parallel commit)
        // moved the branch between our read and our PATCH. Re-read
        // and rebuild from the new tip. Up to 6 attempts total —
        // the deploy-tokens.yml workflow can push 2-3 times in
        // quick succession after every publish.
        var raceable = err && err.message && /fast.?forward|sha.*does not match|reference does not exist/i.test(err.message);
        if (raceable && _retry < 5) {
          // Backoff with jitter: 250ms, 500ms, 750ms, 1500ms, 2500ms.
          var delays = [250, 500, 750, 1500, 2500];
          var delay = delays[_retry] + Math.floor(Math.random() * 200);
          return new Promise(function (resolve) { setTimeout(resolve, delay); })
            .then(function () { return ghMultiCommit(owner, files, message, branch, _retry + 1); });
        }
        throw err;
      });
  }

  /* Trigger the deploy-tokens.yml workflow via workflow_dispatch so
     the Pages site (and therefore the Figma plugin's tokens.json
     endpoint) rebuilds with the freshly-committed snapshot ASAP.
     Best-effort: 404 / 403 (e.g. PAT missing `workflow` scope) is
     non-fatal — the commit itself already triggers Pages on push. */
  function triggerPagesRebuild() {
    var user = getGhUser();
    if (!user || !getGhPat()) return Promise.reject(new Error('Not authenticated'));
    return ghFetch('/repos/' + user + '/' + GH_REPO_NAME + '/actions/workflows/deploy-tokens.yml/dispatches', {
      method: 'POST', body: { ref: 'main' }
    });
  }

  function ensureGhCredentials() {
    var pat = getGhPat();
    var user = getGhUser();
    if (pat && user) return Promise.resolve({ pat: pat, user: user });
    var entered = prompt('GitHub Personal Access Token (with "repo" scope):\n\nThis token writes to your fork of ' + GH_REPO_NAME + '. Stored locally only.');
    if (!entered) return Promise.reject(new Error('Cancelled'));
    localStorage.setItem('dtf-gh-pat', entered.trim());
    // Verify + capture username
    return ghFetch('/user').then(function (u) {
      if (!u || !u.login) throw new Error('Token rejected by GitHub');
      localStorage.setItem('dtf-gh-user', u.login);
      return { pat: entered.trim(), user: u.login };
    }).catch(function (err) {
      localStorage.removeItem('dtf-gh-pat');
      throw err;
    });
  }

  function saveAsDefault() {
    var projId = getActiveProjectId();
    if (!projId) {
      if (window.ev2Toast) window.ev2Toast('No active project \u2014 open one first', 'warn');
      return;
    }
    var nameInput = document.getElementById('ev2SaveName');
    var descInput = document.getElementById('ev2SaveDesc');
    var name = (nameInput.value || '').trim();
    if (!name) {
      // Fall back to a timestamp instead of blocking — the name is
      // metadata, not a unique key, so an autogenerated label is fine.
      name = defaultSnapshotName();
      nameInput.value = name;
    }
    nameInput.removeAttribute('data-invalid');
    var description = (descInput.value || '').trim();
    var bumpEl = document.querySelector('#ev2SaveForm [data-ver-bump][aria-checked="true"]');
    var bump = bumpEl ? bumpEl.getAttribute('data-ver-bump') : 'patch';
    var curVer = getProjectCurrentVersion();
    var nextVer = bumpSemver(curVer, bump);

    var meta = {
      version:     nextVer,
      name:        name,
      description: description,
      savedAt:     new Date().toISOString(),
      savedBy:     getGhUser() || ''
    };

    var confirmBtn = document.getElementById('ev2DeployConfirm');
    var cancelBtn  = document.getElementById('ev2WizardCancel');
    var dlg = document.getElementById('ev2DeployDialog');
    if (dlg) dlg._publishing = true;
    if (cancelBtn) cancelBtn.hidden = true;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Publishing\u2026';

    // Swap form \u2192 timeline. Step 1 starts immediately.
    showTimeline();
    setTimelineStep('save', 'running', 'Connecting to GitHub\u2026');

    // Captured across .then() boundaries so the post-publish step
    // can sync localStorage stash (read by injectProjectPrimitivesSync
    // on next page load).
    var publishedPrimCSS = '';
    var publishedCfgJSON = '';

    ensureGhCredentials().then(function (cred) {
      meta.savedBy = cred.user;
      setTimelineStep('save', 'running', 'Committing ' + nextVer + ' to ' + projId + '\u2026');

      var prevCfg = readProjectConfigSync();
      var primCSS = buildPrimitivesCSS(meta);
      var semCSS  = buildSemanticCSS(meta);
      var surfCSS = buildSurfacesCSS(meta);
      var cfgJSON = buildConfigJSON(prevCfg, meta);
      publishedPrimCSS = primCSS;
      publishedCfgJSON = cfgJSON;
      var versionSnapshot = JSON.stringify({
        meta: meta,
        savedFrom: 'editor-v2',
        // Snapshot the full file contents inline so future "Restore"
        // can rebuild this exact release without trawling git history.
        // Older snapshots that only have ['filename', ...] are still
        // listed in History but their Restore is disabled.
        files: {
          'primitives.css': primCSS,
          'semantic.css':   semCSS,
          'surfaces.css':   surfCSS,
          'config.json':    cfgJSON
        }
      }, null, 2) + '\n';

      var base = 'projects/' + projId;
      var files = [
        { path: base + '/primitives.css', content: primCSS },
        { path: base + '/semantic.css',   content: semCSS },
        { path: base + '/surfaces.css',   content: surfCSS },
        { path: base + '/config.json',    content: cfgJSON },
        { path: base + '/versions/' + nextVer + '.json', content: versionSnapshot }
      ];

      var msg = 'project(' + projId + '): publish ' + nextVer + ' \u2014 ' + name;
      return ghMultiCommit(cred.user, files, msg);
    }).then(function () {
      // ── Step 1 done: snapshot is on GitHub.
      setTimelineStep('save', 'ok', 'Committed ' + nextVer + ' to ' + projId);
      // Promote EVERYTHING we just committed to be the new baseline.
      try {
        State.baseline   = JSON.parse(JSON.stringify(State.proposed));
        State.t1Baseline = JSON.parse(JSON.stringify(State.t1));
        State.t2Baseline = JSON.parse(JSON.stringify(State.t2));
        State.t2SurfacePaletteBaseline = JSON.parse(JSON.stringify(State.t2SurfacePalette));
        State.lastPublishedVersion = nextVer;
        clearDraftFromStorage();
        if (typeof refreshChangeBar === 'function') refreshChangeBar();
        refreshDraftStatus('published');
        if (typeof renderActiveTier === 'function') renderActiveTier();
      } catch (e) { /* baseline reset is best-effort */ }
      // Mirror the just-published files into localStorage so the next
      // page load reflects them immediately. On file:// the workspace
      // copy of projects/<id>/primitives.css is stale (only the
      // GitHub fork was updated), and on Pages it takes ~1min for the
      // deploy to roll over. Without this, the editor reopens showing
      // the OLD key color even though publish succeeded.
      try {
        if (publishedPrimCSS) localStorage.setItem('dtf-project-primitives-' + projId, publishedPrimCSS);
        if (publishedCfgJSON) localStorage.setItem('dtf-project-config-' + projId, publishedCfgJSON);
      } catch (e) { /* quota or disabled storage — non-fatal */ }
      // ── Step 2: notify Figma (best-effort).
      setTimelineStep('figma', 'running', 'Triggering Pages rebuild\u2026');
      return triggerPagesRebuild().then(function () {
        setTimelineStep('figma', 'ok', 'Figma will refresh within \u00b71 minute');
        setTimelineStep('done', 'ok', 'All set');
        finishTimeline('ok',
          '<strong>Published ' + nextVer + ' to ' + projId + '.</strong> '
          + 'Designers will see the new tokens after the next plugin sync (up to a minute).'
        );
      }).catch(function (err) {
        // Snapshot saved, but Pages dispatch failed (usually a
        // missing `workflow` scope on the PAT). Pages rebuilds on
        // push anyway — just slower (~2 min). Surface as a warning,
        // not an error, since the publish itself succeeded.
        setTimelineStep('figma', 'warn', 'Couldn\u2019t auto-trigger \u2014 Figma will still refresh on its own (~2 min)');
        setTimelineStep('done', 'ok', 'Saved');
        finishTimeline('partial',
          '<strong>Saved ' + nextVer + ' to ' + projId + '.</strong> '
          + 'Couldn\u2019t notify Figma directly (<code>' + (err.message || 'permission denied') + '</code>) '
          + '\u2014 the plugin will still pick it up on its next sync (~2 min).'
        );
      });
    }).catch(function (err) {
      // Step 1 failed \u2014 nothing committed to GitHub.
      var msg = (err && err.message) ? err.message : String(err);
      setTimelineStep('save', 'fail', msg);
      setTimelineStep('figma', 'pending', 'Skipped because the save failed');
      setTimelineStep('done', 'pending', '');
      finishTimeline('error',
        '<strong>Couldn\u2019t publish.</strong> ' + msg + '. '
        + 'Your draft is still intact \u2014 try again or check your GitHub token.'
      );
      // eslint-disable-next-line no-console
      console.error('[publish]', err);
    });
  }

  // Top-bar Publish button \u2014 opens the unified Publish dialog.
  if ($deploy) {
    $deploy.addEventListener('click', function () {
      if ($deploy.disabled) return;
      openPublishDialog();
    });
  }
  // Backdrop, close button, cancel button \u2014 all carry data-deploy-dismiss.
  document.querySelectorAll('[data-deploy-dismiss]').forEach(function (el) {
    el.addEventListener('click', closeDeployDialog);
  });

  // Top-bar History button \u2014 opens the version-history dialog.
  var $history = document.getElementById('historyBtn');
  if ($history) {
    $history.addEventListener('click', openHistoryDialog);
  }
  document.querySelectorAll('[data-history-dismiss]').forEach(function (el) {
    el.addEventListener('click', closeHistoryDialog);
  });
  // Restore-action delegation (rows are rendered async).
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-restore]');
    if (!btn) return;
    var ver = btn.getAttribute('data-restore');
    if (ver) restoreVersion(ver);
  });
  // Confirm button is contextual:
  //   form mode     \u2192 trigger publish (saveAsDefault swaps in the timeline)
  //   success/partial \u2192 Done (close)
  //   error mode    \u2192 Try again (re-opens the form, ready to retry)
  var deployConfirmBtn = document.getElementById('ev2DeployConfirm');
  if (deployConfirmBtn) {
    deployConfirmBtn.addEventListener('click', function () {
      var dlg = document.getElementById('ev2DeployDialog');
      var mode = dlg ? (dlg.getAttribute('data-mode') || 'form') : 'form';
      if (mode === 'form') {
        saveAsDefault();
      } else if (mode === 'error') {
        // Re-open the form preserving whatever the user typed.
        openPublishDialog();
      } else {
        // success / partial \u2014 just close.
        if (dlg) dlg._publishing = false;
        closeDeployDialog();
      }
    });
  }
  // Version-bump pills (delegated for tolerance to re-renders)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#ev2SaveForm [data-ver-bump]');
    if (!btn) return;
    var group = btn.parentElement;
    group.querySelectorAll('[data-ver-bump]').forEach(function (b) { b.setAttribute('aria-checked', b === btn ? 'true' : 'false'); });
    var cur = getProjectCurrentVersion();
    var next = bumpSemver(cur, btn.getAttribute('data-ver-bump'));
    var nextEl = document.getElementById('ev2SaveVerNext');
    if (nextEl) nextEl.textContent = next;
    // Reflect on the primary button label too.
    var primary = document.getElementById('ev2DeployConfirm');
    var dlg = document.getElementById('ev2DeployDialog');
    var inForm = !dlg || dlg.getAttribute('data-mode') === 'form';
    if (primary && inForm) primary.textContent = 'Publish ' + next;
  });

  $reload.addEventListener('click', function () {
    $frame.contentWindow.location.reload();
  });

  $frame.addEventListener('load', function () {
    var mode = document.documentElement.getAttribute('data-theme') || 'light';
    try { $frame.contentWindow.postMessage({ type: 'ev2-theme', mode: mode }, '*'); } catch (e) {}
    try { $frame.contentWindow.postMessage({ type: 'ev2-active-role', role: State.activeRole }, '*'); } catch (e) {}
    pushPreview();
  });

  var draftStatus = document.getElementById('draftStatus');

  var toastEl = document.getElementById('ev2Toast');
  var toastTimer = null;
  window.ev2Toast = function (msg, kind) {
    kind = kind || 'ok';
    // Error toasts get a dismiss button and stay until the user
    // closes them — they often contain GitHub API messages the user
    // needs to read in full ("Resource not accessible by integration"
    // is too long for 2.4s).
    var isErr = (kind === 'err');
    toastEl.innerHTML = '';
    var msgSpan = document.createElement('span');
    msgSpan.className = 'ev2-toast-msg';
    msgSpan.textContent = msg;
    toastEl.appendChild(msgSpan);
    if (isErr) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ev2-toast-dismiss';
      btn.setAttribute('aria-label', 'Dismiss');
      btn.textContent = '×';
      btn.addEventListener('click', function () { toastEl.removeAttribute('data-show'); });
      toastEl.appendChild(btn);
    }
    toastEl.setAttribute('data-kind', kind);
    toastEl.setAttribute('data-show', '');
    clearTimeout(toastTimer);
    if (!isErr) {
      var ttl = kind === 'warn' ? 4000 : 2400;
      toastTimer = setTimeout(function () { toastEl.removeAttribute('data-show'); }, ttl);
    }
  };

  function boot() {
    if (!window.PaletteEngine) { setTimeout(boot, 30); return; }

    // Named-route entry: support ?project=<id> from the project hub.
    // If present, persist as active project and strip the param so
    // reloads stay clean (and ?project= can be deep-linked safely).
    try {
      var url = new URL(window.location.href);
      var qp  = (url.searchParams.get('project') || '').trim();
      if (qp && /^[a-z0-9][a-z0-9-]*$/i.test(qp)) {
        if (localStorage.getItem('dtf-active-project') !== qp) {
          localStorage.setItem('dtf-active-project', qp);
        }
        url.searchParams.delete('project');
        history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
      }
    } catch (e) { /* ignore — older browsers, file:// quirks */ }

    /* Promote project's config.customRoles to first-class T1 roles.
       The 5 baseline roles (brand, danger, success, warning, info)
       are hardcoded. Projects may add roles via config.customRoles —
       writer-handhelds ships "neutral". Without this step they'd
       appear only as custom palettes (T0) but not as editable T1
       roles. We fetch the config synchronously so ROLES + State.t1
       are extended BEFORE the AA-fix loop iterates them. */
    injectProjectPrimitivesSync();
    promoteCustomRoles();
    seedSurfacePaletteFromConfig();

    bindAddPaletteDialog();
    // Default: show CSS names ON. Overridden below if UI state has been saved.
    document.body.classList.add('ev2-show-css');
    readBaseline();

    // Run boot-time auto-AA-fix BEFORE loading the draft so we can
    // snapshot the AA-clean values as the t1 baseline. Then the draft
    // (if any) overrides State.t1 with user picks, and Discard knows
    // exactly what to revert to.
    var savedMode_pre = State.editingMode;
    ['light','dark'].forEach(function (mode) {
      State.editingMode = mode;
      ROLES.forEach(function (r) {
        var wcag = computeRoleContrast(r.id, mode);
        if (wcag.checks.some(function (c) { return !c.pass; })) autoFixT1ToAA(r.id);
      });
    });
    State.editingMode = savedMode_pre;
    // Snapshot the AA-clean settled state as the baseline used by
    // change-detection and Discard.
    ROLES.forEach(function (r) {
      State.t1Baseline.light[r.id] = Object.assign({}, State.t1.light[r.id]);
      State.t1Baseline.dark[r.id]  = Object.assign({}, State.t1.dark[r.id]);
    });

    var hadDraft = loadDraftFromStorage();
    var ui = loadUIState();
    // Boot UI theme from the shared 'dtf-theme' key (matches the
    // rest of the demo pages). If the saved editing-mode in ui
    // disagrees, the editing-mode wins below — a single source of
    // truth means UI theme = editing mode after first interaction.
    try {
      var savedUiTheme = localStorage.getItem('dtf-theme');
      if (savedUiTheme === 'dark' || savedUiTheme === 'light') {
        document.documentElement.setAttribute('data-theme', savedUiTheme);
        try { $frame.contentWindow.postMessage({ type: 'ev2-theme', mode: savedUiTheme }, '*'); } catch (e) {}
      }
    } catch (e) {}
    if (ui) {
      if (ui.activeTier) State.activeTier = ui.activeTier;
      if (ui.activeRole) State.activeRole = ui.activeRole;
      if (ui.activeT0 === 'roles' || ui.activeT0 === 'palettes') State.activeT0 = ui.activeT0;
      if (ui.activeSurface && T2_SURFACES.some(function (s) { return s.id === ui.activeSurface; })) {
        State.activeSurface = ui.activeSurface;
      }
      if (ui.anchor === 'exact' || ui.anchor === 'normalized') State.anchor = ui.anchor;
      if (ui.disclosure && typeof ui.disclosure === 'object') {
        Object.keys(ui.disclosure).forEach(function (k) { State.disclosure[k] = !!ui.disclosure[k]; });
      }
      if (ui.mode === 'light' || ui.mode === 'dark') {
        State.editingMode = ui.mode;
        // Editing mode IS the UI theme — keep them in sync on boot.
        document.documentElement.setAttribute('data-theme', ui.mode);
        try { localStorage.setItem('dtf-theme', ui.mode); } catch (e) {}
        try { $frame.contentWindow.postMessage({ type: 'ev2-theme', mode: ui.mode }, '*'); } catch (e) {}
      }
      if (typeof ui.showCss === 'boolean') {
        document.body.classList.toggle('ev2-show-css', ui.showCss);
        var cb = document.getElementById('showCssNames');
        if (cb) cb.checked = !!ui.showCss;
      } else {
        // No saved preference yet — keep the HTML default (checked).
        document.body.classList.add('ev2-show-css');
      }
      // Reflect activeTier in the rail aria-current
      document.querySelectorAll('.ev2-tier').forEach(function (b) {
        if (b.getAttribute('data-tier') === State.activeTier) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
    }

    $frame.src = './preview.html?v=' + Date.now();
    // Re-validate after draft load: if any saved t1 picks fail AA
    // against the CURRENT ladder (e.g. seed changed since last
    // session, or solver thresholds tightened), silently snap them
    // and re-snapshot the baseline so the user doesn't see stale
    // fail badges on a draft they didn't intentionally make fail.
    var snappedAny = false;
    var savedMode_post = State.editingMode;
    ['light','dark'].forEach(function (mode) {
      State.editingMode = mode;
      ROLES.forEach(function (r) {
        var wcag = computeRoleContrast(r.id, mode);
        if (wcag.checks.some(function (c) { return !c.pass; })) {
          autoFixT1ToAA(r.id);
          snappedAny = true;
        }
      });
    });
    State.editingMode = savedMode_post;
    if (snappedAny) {
      // Roll the baseline forward so the now-passing picks count as
      // the new "no changes" state.
      ROLES.forEach(function (r) {
        State.t1Baseline.light[r.id] = Object.assign({}, State.t1.light[r.id]);
        State.t1Baseline.dark[r.id]  = Object.assign({}, State.t1.dark[r.id]);
      });
    }
    renderActiveTier();
    refreshChangeBar();
    initProjectWidget();
    initMigrationBanner();
    if (hadDraft) {
      refreshDraftStatus('saved');
      if (window.ev2Toast) {
        window.ev2Toast(
          snappedAny
            ? 'Restored from local draft — auto-snapped to AA'
            : 'Restored from local draft',
          'ok'
        );
      }
    } else {
      refreshDraftStatus('idle');
    }
    initPaneResizer();
  }
  // Boot runs at the very bottom, after all helpers are defined.

  /* ══════════════════════════════════════════════════════
     Pane resizer (drag divider between list and preview)
     ══════════════════════════════════════════════════════ */
  function initPaneResizer() {
    var resizer  = document.getElementById('paneResizer');
    var workspace = document.querySelector('.ev2-panes');
    if (!resizer || !workspace) return;

    var RESIZER_W = 6;         // matches CSS resizer track
    var MIN_LIST = 320;
    var MIN_PREVIEW = 380;
    var STORAGE_KEY = 'ev2-list-width';

    function applyWidth(px) {
      var totalAvail = workspace.clientWidth - RESIZER_W;
      if (totalAvail <= MIN_LIST + MIN_PREVIEW) return; // viewport too narrow
      var maxList = totalAvail - MIN_PREVIEW;
      var clamped = Math.max(MIN_LIST, Math.min(maxList, px));
      workspace.style.setProperty('--ev2-list-w', clamped + 'px');
    }

    // Restore saved width
    var saved = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    if (saved > 0) applyWidth(saved);

    var dragging = false;
    function onPointerDown(e) {
      dragging = true;
      resizer.setAttribute('data-dragging', 'true');
      document.body.setAttribute('data-pane-dragging', 'true');
      try { resizer.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    }
    function onPointerMove(e) {
      if (!dragging) return;
      var rect = workspace.getBoundingClientRect();
      var newListW = e.clientX - rect.left - (RESIZER_W / 2);
      applyWidth(newListW);
    }
    function onPointerUp(e) {
      if (!dragging) return;
      dragging = false;
      resizer.removeAttribute('data-dragging');
      document.body.removeAttribute('data-pane-dragging');
      try { resizer.releasePointerCapture(e.pointerId); } catch (_) {}
      // Persist current width
      var cs = workspace.style.getPropertyValue('--ev2-list-w').trim();
      var px = parseInt(cs, 10);
      if (px > 0) localStorage.setItem(STORAGE_KEY, String(px));
    }
    resizer.addEventListener('pointerdown', onPointerDown);
    resizer.addEventListener('pointermove', onPointerMove);
    resizer.addEventListener('pointerup', onPointerUp);
    resizer.addEventListener('pointercancel', onPointerUp);
    // Double-click to reset
    resizer.addEventListener('dblclick', function () {
      workspace.style.removeProperty('--ev2-list-w');
      localStorage.removeItem(STORAGE_KEY);
    });
    // Keyboard a11y: arrow keys nudge by 16px
    resizer.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var current = parseInt(getComputedStyle(workspace).gridTemplateColumns.split(' ')[0], 10) || 480;
      var delta = e.key === 'ArrowLeft' ? -16 : 16;
      applyWidth(current + delta);
      var cs = workspace.style.getPropertyValue('--ev2-list-w').trim();
      var px = parseInt(cs, 10);
      if (px > 0) localStorage.setItem(STORAGE_KEY, String(px));
      e.preventDefault();
    });
  }

  /* ══════════════════════════════════════════════════════
     Project widget + switch guard
     ══════════════════════════════════════════════════════ */
  var $projBtn   = document.getElementById('projBtn');
  var $projName  = document.getElementById('projName');
  var $projPanel = document.getElementById('projPanel');
  var $projRenameBtn = document.getElementById('projRenameBtn');
  var $projDeleteBtn = document.getElementById('projDeleteBtn');

  function getActiveProjectId() {
    return localStorage.getItem('dtf-active-project') || '';
  }

  /* Read project config.json synchronously (file:// — sync XHR is
     fine, blocks boot for ~1ms). Returns parsed object or null.
     Used by promoteCustomRoles() before State init runs. */
  function readProjectConfigSync() {
    var id = getActiveProjectId();
    if (!id) return null;
    // Prefer localStorage stash for the same reason as
    // injectProjectPrimitivesSync — publish writes here atomically
    // so the editor reflects the latest published config without
    // waiting on the workspace file (file://) or Pages deploy.
    try {
      var cached = localStorage.getItem('dtf-project-config-' + id);
      if (cached) return JSON.parse(cached);
    } catch (e) { /* corrupt cache, fall through */ }
    var depth = (location.pathname.indexOf('/demo/') !== -1) ? '../..' : '.';
    var url = depth + '/projects/' + encodeURIComponent(id) + '/config.json';
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, /* async */ false);
      xhr.send(null);
      if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
        return JSON.parse(xhr.responseText);
      }
    } catch (e) { /* missing file, parse error, CORS — fall through */ }
    return null;
  }

  /* Inject the project's primitives.css into <head> so the editor
     sees its FULL --prim-* ladder — not just the package default.
     This is what lets discoverCustomPalettes() pick up project-
     specific palettes (e.g. writer-handhelds ships "neutral")
     and what makes T2 surface mappings like "src: neutral"
     resolve to a valid palette instead of being silently dropped
     by isValidSurfacePalette().
     Idempotent: replaces any previously-injected block. Bust the
     custom-palette cache afterwards so discoverCustomPalettes()
     re-reads stylesheets on next call. */
  function injectProjectPrimitivesSync() {
    var id = getActiveProjectId();
    if (!id) return;
    var cssText = null;
    // Prefer the localStorage stash: it's updated atomically on
    // every successful publish (and seeded by onboarding) so it's
    // always at least as fresh as the on-disk file. On file:// the
    // workspace copy lags GitHub; on Pages it lags by ~1 min after
    // a deploy. Stash-first guarantees the editor reopens showing
    // exactly what was last published from this browser.
    try { cssText = localStorage.getItem('dtf-project-primitives-' + id) || null; }
    catch (e) { /* ignore */ }
    // Fall back to the deployed file (HTTP on Pages, workspace copy
    // on file://) only when the stash is empty — e.g. a different
    // browser, or a project published from somewhere else.
    if (!cssText) {
      var depth = (location.pathname.indexOf('/demo/') !== -1) ? '../..' : '.';
      var url = depth + '/projects/' + encodeURIComponent(id) + '/primitives.css';
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, /* async */ false);
        xhr.send(null);
        if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
          cssText = xhr.responseText;
        }
      } catch (e) { /* fall through */ }
    }
    // Last-ditch synth: if the project has paletteKeys but no
    // primitives.css (older onboards that didn't stash the
    // generated CSS), build it now from PaletteEngine.
    if (!cssText && window.PaletteEngine) {
      var cfg = readProjectConfigSync();
      if (cfg && cfg.paletteKeys) {
        var parts = [];
        Object.keys(cfg.paletteKeys).forEach(function (roleId) {
          var keyHex = cfg.paletteKeys[roleId];
          if (!keyHex) return;
          try {
            var pal = window.PaletteEngine.generatePalette(keyHex, { anchor: 'exact' });
            parts.push(window.PaletteEngine.toCss(roleId, pal));
          } catch (e) { /* skip bad role */ }
        });
        if (parts.length) cssText = parts.join('\n');
      }
    }
    if (!cssText) return;
    var existing = document.getElementById('ev2-project-primitives');
    var node = existing || document.createElement('style');
    node.id = 'ev2-project-primitives';
    node.textContent = cssText;
    if (!existing) document.head.appendChild(node);
    _customPalettesCache = null;
  }

  /* Seed State.t2SurfacePalette from config.surfacePaletteSrc so
     a project's per-surface palette mapping (e.g. writer-handhelds
     pinning every surface to its custom "neutral" palette) is the
     visible default on first load \u2014 not the system default.
     The draft, loaded later, can still override per surface.
     Idempotent + safe even when no project is active. */
  function seedSurfacePaletteFromConfig() {
    var cfg = readProjectConfigSync();
    if (!cfg || !cfg.surfacePaletteSrc) return;
    Object.keys(cfg.surfacePaletteSrc).forEach(function (sid) {
      var pal = cfg.surfacePaletteSrc[sid];
      if (typeof pal !== 'string' || !pal) return;
      if (!isValidSurfacePalette(pal)) return;
      State.t2SurfacePalette[sid] = pal;
      // Mirror into the baseline so the loaded mapping is treated
      // as "what was last published" \u2014 not as a fresh edit on
      // top of factory defaults. Without this, every surface whose
      // project config differs from T2_SURFACES default registers
      // as dirty on first load, producing a phantom "N changes"
      // badge on every hard refresh.
      State.t2SurfacePaletteBaseline[sid] = pal;
    });
  }

  /* Extend ROLES + State.t1 dictionaries with config.customRoles
     so the new roles are first-class T1 editors instead of just
     palette entries. Idempotent — safe to call repeatedly. */
  function promoteCustomRoles() {
    var cfg = readProjectConfigSync();
    if (!cfg || !Array.isArray(cfg.customRoles) || !cfg.customRoles.length) return;
    cfg.customRoles.forEach(function (cr) {
      if (!cr || !cr.id) return;
      if (!/^[a-z][a-z0-9-]*$/i.test(cr.id)) return;
      // Skip if already present (either as built-in or previously promoted)
      if (ROLES.some(function (r) { return r.id === cr.id; })) return;
      ROLES.push({ id: cr.id, label: cr.label || cr.id, prefix: cr.id });
      // Seed default step picks. defaultT1ForRole() falls back to brand
      // when the role isn't in T1_DEFAULT_STEPS — sane starting point
      // that the boot-time AA-fix loop will tighten.
      State.t1.light[cr.id]         = defaultT1ForRole(cr.id, 'light');
      State.t1.dark[cr.id]          = defaultT1ForRole(cr.id, 'dark');
      State.t1Baseline.light[cr.id] = defaultT1ForRole(cr.id, 'light');
      State.t1Baseline.dark[cr.id]  = defaultT1ForRole(cr.id, 'dark');
      // Inform AFFECTS so the role card shows a meaningful component
      // hint instead of "undefined".
      AFFECTS[cr.id] = AFFECTS[cr.id] || ['Custom (project role)'];
    });
  }

  /* ── First-boot migration banner ───────────────────────
     Mirrors scripts/migrate-v2/audit.cjs logic in-browser.
     Surfaces unresolved migration items at the top of v2 chrome
     until the user acknowledges (writes localStorage flag) or
     dismisses for the session. Acknowledge is local-only —
     editing config.json from file:// isn't possible; the audit
     script remains the canonical source of truth.
     ──────────────────────────────────────────────────── */
  var MIGRATION_TARGET_SCHEMA = 2;
  var MIGRATION_STANDARD_ROLES = ['brand','danger','warning','info','success'];

  function migrationAckKey(projectId) {
    return 'dtf-migration-ack-' + projectId;
  }
  function migrationDismissKey(projectId) {
    return 'dtf-migration-dismiss-' + projectId;
  }

  function runMigrationAuditInBrowser() {
    var id = getActiveProjectId();
    if (!id) return null;
    var cfg = readProjectConfigSync();
    if (!cfg) return null;
    var schemaVersion = cfg.schemaVersion || 1;
    var declaredKeys  = Object.keys(cfg.paletteKeys || {});
    var customRoles   = Array.isArray(cfg.customRoles) ? cfg.customRoles : [];

    // Palette inventory drift: discover palettes from the loaded
    // primitives by scanning :root CSS variables.
    var palettesInCSS = [];
    try {
      var rootCS = getComputedStyle(document.documentElement);
      var seen = {};
      // CSSOM doesn't enumerate custom properties; scan all stylesheets.
      for (var i = 0; i < document.styleSheets.length; i++) {
        var rules;
        try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
        if (!rules) continue;
        // Only count palettes that come from THIS project. Without
        // this scope check, we'd also pick up every palette declared
        // in the package defaults (packages/tokens/src/index.css)
        // and flag a brand-new project as "undeclared palettes
        // present" — which makes onboard always trigger the
        // migration banner.
        var sheetHref = document.styleSheets[i].href || '';
        var sheetNode = document.styleSheets[i].ownerNode;
        var isProjectSheet = (sheetNode && sheetNode.id === 'ev2-project-primitives')
          || /\/projects\/[^/]+\/primitives\.css/.test(sheetHref);
        if (!isProjectSheet) continue;
        for (var j = 0; j < rules.length; j++) {
          var rule = rules[j];
          if (!rule.style) continue;
          for (var k = 0; k < rule.style.length; k++) {
            var prop = rule.style[k];
            var m = /^--prim-([a-z][a-z0-9-]*)-\d+$/i.exec(prop);
            if (m && !seen[m[1]]) { seen[m[1]] = 1; palettesInCSS.push(m[1]); }
          }
        }
      }
    } catch (e) { /* sandboxed file:// — best effort */ }

    var undeclaredPalettes = palettesInCSS.filter(function (p) {
      return declaredKeys.indexOf(p) === -1;
    });

    var customRoleIds = customRoles.map(function (cr) { return cr && cr.id; }).filter(Boolean);

    return {
      projectId: id,
      schemaVersion: schemaVersion,
      targetSchema: MIGRATION_TARGET_SCHEMA,
      undeclaredPalettes: undeclaredPalettes,
      customRoleIds: customRoleIds,
      // customRoles get promoted at runtime — info only, not blocking.
      hasWork: (schemaVersion < MIGRATION_TARGET_SCHEMA)
            || (undeclaredPalettes.length > 0)
    };
  }

  function initMigrationBanner() {
    var $banner   = document.getElementById('migrateBanner');
    var $title    = document.getElementById('migrateBannerTitle');
    var $sub      = document.getElementById('migrateBannerSub');
    var $info     = document.getElementById('migrateBannerInfo');
    var $ack      = document.getElementById('migrateBannerAck');
    var $dismiss  = document.getElementById('migrateBannerDismiss');
    if (!$banner) return;

    var audit = runMigrationAuditInBrowser();
    if (!audit || !audit.hasWork) return;

    var ackd     = localStorage.getItem(migrationAckKey(audit.projectId)) === String(audit.targetSchema);
    var dismissd = sessionStorage.getItem(migrationDismissKey(audit.projectId)) === '1';
    if (ackd || dismissd) return;

    // Build subtitle from actionable items.
    var bits = [];
    if (audit.schemaVersion < audit.targetSchema) {
      bits.push('schema v' + audit.schemaVersion + ' → v' + audit.targetSchema);
    }
    if (audit.customRoleIds.length) {
      bits.push(audit.customRoleIds.length + ' custom role'
        + (audit.customRoleIds.length === 1 ? '' : 's')
        + ' (' + audit.customRoleIds.join(', ') + ') promoted to T1');
    }
    if (audit.undeclaredPalettes.length) {
      bits.push(audit.undeclaredPalettes.length + ' palette'
        + (audit.undeclaredPalettes.length === 1 ? '' : 's')
        + ' undeclared in config.paletteKeys');
    }
    $title.textContent = 'Project "' + audit.projectId + '" — migration available';
    $sub.textContent   = bits.join(' · ');

    $banner.hidden = false;

    $info.addEventListener('click', function () {
      // Open the audit script docs as a markdown blob in a new tab.
      // Falls back to a simple alert if the browser blocks Blob+open.
      var summary = '# Audit summary for "' + audit.projectId + '"\n\n'
        + '- schema: ' + audit.schemaVersion + ' → ' + audit.targetSchema + '\n'
        + '- custom roles promoted at runtime: ' + (audit.customRoleIds.join(', ') || 'none') + '\n'
        + '- undeclared palettes: ' + (audit.undeclaredPalettes.join(', ') || 'none') + '\n\n'
        + 'To finalize the migration on disk, run:\n\n'
        + '    pnpm audit:migration --bump\n\n'
        + 'This writes "schemaVersion": 2 to projects/' + audit.projectId + '/config.json. After that, this banner disappears for all users.';
      try {
        var blob = new Blob([summary], { type: 'text/markdown' });
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } catch (e) { alert(summary); }
    });

    $ack.addEventListener('click', function () {
      localStorage.setItem(migrationAckKey(audit.projectId), String(audit.targetSchema));
      $banner.hidden = true;
    });

    $dismiss.addEventListener('click', function () {
      sessionStorage.setItem(migrationDismissKey(audit.projectId), '1');
      $banner.hidden = true;
    });
  }
  function getKnownProjects() {
    try { return JSON.parse(localStorage.getItem('dtf-known-projects') || '[]') || []; }
    catch (e) { return []; }
  }
  /* Refresh the localStorage known-projects cache from the canonical
     projects.json. Tries a few path candidates so we work on file://,
     Pages, and local dev servers. Best-effort \u2014 silent on failure. */
  function syncKnownProjectsFromIndex() {
    var candidates = ['../../projects.json', '/Design-Token-Forge/projects.json', '/projects.json'];
    var i = 0;
    function tryNext() {
      if (i >= candidates.length) return;
      fetch(candidates[i++], { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      }).then(function (list) {
        if (!Array.isArray(list)) return;
        try { localStorage.setItem('dtf-known-projects', JSON.stringify(list)); } catch (e) {}
        // Re-render the panel + label if either is stale vs. what we just fetched.
        if (typeof renderProjPanel === 'function' && $projPanel && !$projPanel.hasAttribute('hidden')) renderProjPanel();
        if (typeof syncProjLabel === 'function') syncProjLabel();
      }).catch(tryNext);
    }
    tryNext();
  }
  function projectName(id) {
    var list = getKnownProjects();
    var hit = list.find(function (p) { return p && p.id === id; });
    return (hit && (hit.name || hit.id)) || id || 'No project';
  }

  function initProjectWidget() {
    syncProjLabel();
    renderProjPanel();
    // Pull the canonical project list from projects.json so the
    // switcher matches the hub even on first visit. Async, best-
    // effort: a stale cache is fine to render against meanwhile.
    syncKnownProjectsFromIndex();

    $projBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !$projPanel.hasAttribute('hidden') ? false : true;
      if (open) { $projPanel.removeAttribute('hidden'); $projBtn.setAttribute('aria-expanded', 'true'); renderProjPanel(); }
      else { $projPanel.setAttribute('hidden', ''); $projBtn.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('click', function (e) {
      if (!$projPanel.contains(e.target) && !$projBtn.contains(e.target)) {
        $projPanel.setAttribute('hidden', '');
        $projBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        $projPanel.setAttribute('hidden', '');
        $projBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Topbar icon-button actions for the active project.
    if ($projRenameBtn) {
      $projRenameBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = getActiveProjectId();
        if (!id) { if (window.ev2Toast) window.ev2Toast('No active project to rename', 'warn'); return; }
        attemptProjectRename(id);
      });
    }
    if ($projDeleteBtn) {
      $projDeleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = getActiveProjectId();
        if (!id) { if (window.ev2Toast) window.ev2Toast('No active project to delete', 'warn'); return; }
        attemptProjectDelete(id);
      });
    }
  }

  function syncProjLabel() {
    $projName.textContent = projectName(getActiveProjectId());
  }

  function renderProjPanel() {
    var list = getKnownProjects();
    var active = getActiveProjectId();
    if (!list.length) {
      $projPanel.innerHTML = '<div class="ev2-proj-empty">No projects yet.<br><a href="../onboard.html" style="color:var(--brand-content-default,#286CE5)">Create your first project</a></div>';
      return;
    }
    var rowsHtml = list.map(function (p) {
      var current = p.id === active;
      return '<div class="ev2-proj-row" role="option" aria-current="' + current + '" data-proj-id="' + p.id + '" tabindex="0">'
        + '<span class="ev2-proj-row-name">' + (p.name || p.id) + '</span>'
        + '<span class="ev2-proj-row-id">' + p.id + '</span>'
        + (current
            ? '<svg class="ev2-proj-row-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.5 3.5L13 5"/></svg>'
            : '')
        + '</div>';
    }).join('');
    $projPanel.innerHTML = rowsHtml;

    $projPanel.querySelectorAll('[data-proj-id]').forEach(function (row) {
      row.addEventListener('click', function () {
        var id = row.getAttribute('data-proj-id');
        if (id === getActiveProjectId()) {
          $projPanel.setAttribute('hidden', '');
          $projBtn.setAttribute('aria-expanded', 'false');
          return;
        }
        attemptProjectSwitch(id);
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
      });
    });
  }

  function attemptProjectDelete(id) {
    var name = projectName(id);
    // Close the dropdown so the confirm modal isn't visually crowded.
    $projPanel.setAttribute('hidden', '');
    $projBtn.setAttribute('aria-expanded', 'false');
    var expectedUser = getGhUser();
    openModal({
      title: 'Delete \u201C' + name + '\u201D?',
      body: 'This removes the project\u2019s tokens, palette, and config from your GitHub fork and updates projects.json. '
        + 'The change is committed to your repository and cannot be undone from here.',
      confirmLabel: 'Delete project',
      cancelLabel: 'Keep project',
      kind: 'danger',
      input: {
        label: 'GitHub Personal Access Token',
        type: 'password',
        placeholder: 'ghp_\u2026',
        hint: 'Re-enter your PAT (\u201Crepo\u201D scope) to authorize this destructive change. '
          + 'Verified against your GitHub account before any files are removed.'
      },
      validate: function (pat) {
        pat = (pat || '').trim();
        if (!pat) return 'Token required to authorize delete.';
        // Temporarily swap PAT so ghFetch uses the just-entered one.
        // Restored on error so a wrong token doesn\u2019t clobber the
        // cached good one.
        var prevPat = getGhPat();
        localStorage.setItem('dtf-gh-pat', pat);
        return ghFetch('/user').then(function (u) {
          if (!u || !u.login) {
            if (prevPat) localStorage.setItem('dtf-gh-pat', prevPat); else localStorage.removeItem('dtf-gh-pat');
            throw new Error('GitHub didn\u2019t recognize that token.');
          }
          if (expectedUser && u.login !== expectedUser) {
            if (prevPat) localStorage.setItem('dtf-gh-pat', prevPat); else localStorage.removeItem('dtf-gh-pat');
            throw new Error('Token belongs to @' + u.login + ' but the project is on @' + expectedUser + '\u2019s fork.');
          }
          // PAT good \u2014 keep it cached (the user explicitly re-authorized).
          localStorage.setItem('dtf-gh-user', u.login);
        });
      },
      onConfirm: function () { performProjectDelete(id, name); }
    });
  }

  /* In-editor delete via GitHub API: enumerate every file under
     projects/<id>/ in the user\u2019s fork, mark them for removal in
     a single tree commit, and rewrite projects.json without the
     entry. After success, auto-switch to the next remaining
     project (or send the user back to the project hub when the
     fork has none left). */
  function performProjectDelete(id, name) {
    showBusy('Deleting \u201C' + name + '\u201D\u2026', 'Talking to GitHub. Don\u2019t close this tab.');
    ensureGhCredentials().then(function (cred) {
      var owner = cred.user;
      var branch = 'main';
      updateBusy(null, 'Enumerating project files\u2026');
      // 1. Get the current tree to enumerate files under projects/<id>/.
      return ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/git/ref/heads/' + branch).then(function (ref) {
        return ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/git/trees/' + ref.object.sha + '?recursive=1');
      }).then(function (tree) {
        var prefix = 'projects/' + id + '/';
        var doomed = (tree.tree || []).filter(function (n) {
          return n.type === 'blob' && n.path.indexOf(prefix) === 0;
        }).map(function (n) { return { path: n.path, delete: true }; });
        if (!doomed.length) throw new Error('Project folder not found in your fork \u2014 nothing to delete.');

        // 2. Fetch + rewrite projects.json (root index).
        return ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/contents/projects.json?ref=' + branch).then(function (idx) {
          var listRaw;
          try { listRaw = JSON.parse(decodeURIComponent(escape(atob(idx.content.replace(/\n/g,''))))); }
          catch (e) { throw new Error('Could not parse projects.json from fork'); }
          var nextList = Array.isArray(listRaw) ? listRaw.filter(function (p) { return p && p.id !== id; }) : [];
          doomed.push({ path: 'projects.json', content: JSON.stringify(nextList, null, 2) + '\n' });
          updateBusy(null, 'Committing ' + doomed.length + ' file' + (doomed.length === 1 ? '' : 's') + ' to your fork\u2026');
          return ghMultiCommit(owner, doomed, 'project(' + id + '): delete via editor v2', branch).then(function () {
            // 3. Verify: re-read projects.json and confirm the
            // entry is actually gone before we switch projects.
            // The retry loop inside ghMultiCommit usually wins, but
            // if some other writer beat us we must NOT cheerfully
            // switch to a project whose folder might still exist.
            updateBusy(null, 'Verifying delete\u2026');
            return ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/contents/projects.json?ref=' + branch + '&_cb=' + Date.now())
              .then(function (idx2) {
                var verifyList;
                try { verifyList = JSON.parse(decodeURIComponent(escape(atob(idx2.content.replace(/\n/g,''))))); }
                catch (e) { throw new Error('Delete commit landed but projects.json is unreadable.'); }
                var stillThere = Array.isArray(verifyList) && verifyList.some(function (p) { return p && p.id === id; });
                if (stillThere) throw new Error('Delete commit landed but projects.json still lists this project. Try again.');
                return verifyList;
              });
          });
        });
      }).then(function (nextList) {
        // 4. Success path — local cleanup + navigation.
        try { localStorage.setItem('dtf-known-projects', JSON.stringify(nextList)); } catch (e) {}
        try { localStorage.removeItem('ev2-draft-' + id); } catch (e) {}
        try { localStorage.removeItem(DRAFT_KEY + '--' + id); } catch (e) {}
        try { localStorage.removeItem('dtf-project-config-' + id); } catch (e) {}
        try { localStorage.removeItem('dtf-project-primitives-' + id); } catch (e) {}
        try { localStorage.removeItem('dtf-color-config-' + id); } catch (e) {}
        var wasActive = (getActiveProjectId() === id);
        updateBusy('Deleted \u201C' + name + '\u201D', wasActive ? 'Switching to next project\u2026' : 'Updating list\u2026');
        if (!nextList.length) {
          localStorage.removeItem('dtf-active-project');
          setTimeout(function () { window.location.href = '../onboard.html'; }, 500);
          return;
        }
        if (wasActive) {
          var nextId = nextList[0].id;
          localStorage.setItem('dtf-active-project', nextId);
          // Hard reload to fully rebind state to the new project.
          setTimeout(function () { window.location.href = 'index.html?project=' + encodeURIComponent(nextId); }, 500);
        } else {
          hideBusy();
          if (window.ev2Toast) window.ev2Toast('Deleted \u201C' + name + '\u201D', 'ok');
          renderProjPanel();
        }
      }).catch(function (err) {
        hideBusy();
        var msg = (err && err.message) ? err.message : String(err);
        if (window.ev2Toast) window.ev2Toast('Delete failed: ' + msg, 'err');
        // eslint-disable-next-line no-console
        console.error('[project-delete]', err);
      });
    }).catch(function () {
      hideBusy();
      if (window.ev2Toast) window.ev2Toast('GitHub authentication cancelled', 'warn');
    });
  }

  /* Rename a project's display name only (id/folder unchanged).
     Edits projects.json and projects/<id>/config.json in a single
     commit. Safe across in-flight publishes thanks to ghMultiCommit
     retry. */
  function attemptProjectRename(id) {
    var current = projectName(id);
    var next = window.prompt('Rename project\nNew name for \u201C' + current + '\u201D:', current);
    if (next == null) return; // user cancelled
    next = String(next).trim();
    if (!next) { if (window.ev2Toast) window.ev2Toast('Name cannot be empty', 'warn'); return; }
    if (next === current) return; // nothing to do
    if (next.length > 80) { if (window.ev2Toast) window.ev2Toast('Name too long (max 80 chars)', 'warn'); return; }
    performProjectRename(id, next);
  }

  function performProjectRename(id, newName) {
    showBusy('Renaming to \u201C' + newName + '\u201D\u2026', 'Talking to GitHub. Don\u2019t close this tab.');
    ensureGhCredentials().then(function (cred) {
      var owner = cred.user;
      var branch = 'main';
      // Pull both files we need to rewrite in parallel.
      return Promise.all([
        ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/contents/projects.json?ref=' + branch),
        ghFetch('/repos/' + owner + '/' + GH_REPO_NAME + '/contents/projects/' + id + '/config.json?ref=' + branch)
          .catch(function () { return null; }) // config.json may not exist on legacy projects
      ]).then(function (results) {
        var idxRes = results[0];
        var cfgRes = results[1];
        var listRaw;
        try { listRaw = JSON.parse(decodeURIComponent(escape(atob(idxRes.content.replace(/\n/g,''))))); }
        catch (e) { throw new Error('Could not parse projects.json from fork'); }
        var nextList = Array.isArray(listRaw) ? listRaw.map(function (p) {
          if (p && p.id === id) { return Object.assign({}, p, { name: newName }); }
          return p;
        }) : [];
        var files = [
          { path: 'projects.json', content: JSON.stringify(nextList, null, 2) + '\n' }
        ];
        if (cfgRes && cfgRes.content) {
          var cfg;
          try { cfg = JSON.parse(decodeURIComponent(escape(atob(cfgRes.content.replace(/\n/g,''))))); }
          catch (e) { cfg = null; }
          if (cfg && typeof cfg === 'object') {
            cfg.name = newName;
            files.push({ path: 'projects/' + id + '/config.json', content: JSON.stringify(cfg, null, 2) + '\n' });
          }
        }
        return ghMultiCommit(owner, files, 'project(' + id + '): rename to "' + newName + '"', branch)
          .then(function () { return nextList; });
      }).then(function (nextList) {
        try { localStorage.setItem('dtf-known-projects', JSON.stringify(nextList)); } catch (e) {}
        hideBusy();
        if (window.ev2Toast) window.ev2Toast('Renamed to \u201C' + newName + '\u201D', 'ok');
        syncProjLabel();
        renderProjPanel();
      }).catch(function (err) {
        hideBusy();
        var msg = (err && err.message) ? err.message : String(err);
        if (window.ev2Toast) window.ev2Toast('Rename failed: ' + msg, 'err');
        // eslint-disable-next-line no-console
        console.error('[project-rename]', err);
      });
    }).catch(function () {
      hideBusy();
      if (window.ev2Toast) window.ev2Toast('GitHub authentication cancelled', 'warn');
    });
  }

  function attemptProjectSwitch(newId) {
    var pending = totalChanges();
    if (pending === 0) { performProjectSwitch(newId); return; }
    openModal({
      title: 'Switch project with unsaved changes?',
      body: 'You have ' + pending + ' pending change' + (pending === 1 ? '' : 's')
        + ' on ' + projectName(getActiveProjectId()) + '. Switching to '
        + projectName(newId) + ' will discard your local draft for the current project.',
      confirmLabel: 'Discard & switch',
      cancelLabel: 'Stay here',
      kind: 'danger',
      onConfirm: function () {
        clearDraftFromStorage();
        performProjectSwitch(newId);
      }
    });
  }

  function performProjectSwitch(newId) {
    localStorage.setItem('dtf-active-project', newId);
    // Reload so the new project's tokens / config can be picked up cleanly.
    window.location.reload();
  }

  /* ══════════════════════════════════════════════════════
     Modal
     ══════════════════════════════════════════════════════ */
  var $modal = document.getElementById('ev2Modal');
  var $modalTitle = document.getElementById('ev2ModalTitle');
  var $modalBody = document.getElementById('ev2ModalBody');
  var $modalConfirm = $modal.querySelector('[data-modal-action="confirm"]');
  /* Scope to the footer button \u2014 the close-X also has
     data-modal-action="cancel", so a plain querySelector matches
     it first and openModal would replace the \u00d7 glyph with the
     cancelLabel text. Use .ev2-modal-actions to skip the close-X. */
  var $modalCancel  = $modal.querySelector('.ev2-modal-actions [data-modal-action="cancel"]');
  var $modalField    = document.getElementById('ev2ModalField');
  var $modalInput    = document.getElementById('ev2ModalInput');
  var $modalInputLbl = document.getElementById('ev2ModalInputLabel');
  var $modalInputHint = document.getElementById('ev2ModalInputHint');
  var modalOnConfirm = null;
  var modalValidate  = null; // (value) -> string err or '' / null

  function openModal(opts) {
    $modalTitle.textContent = opts.title || 'Confirm';
    $modalBody.textContent = opts.body || '';
    // Body supports \n by collapsing into <br> via white-space:pre-line
    $modalBody.style.whiteSpace = (opts.body && opts.body.indexOf('\n') !== -1) ? 'pre-line' : '';
    $modalConfirm.textContent = opts.confirmLabel || 'Confirm';
    $modalCancel.textContent = opts.cancelLabel || 'Cancel';
    $modalConfirm.classList.toggle('ev2-modal-btn-danger', opts.kind === 'danger');
    $modalConfirm.classList.toggle('ev2-modal-btn-primary', opts.kind !== 'danger');
    modalOnConfirm = opts.onConfirm || null;
    modalValidate  = opts.validate  || null;

    // Optional input field (used by destructive ops that re-prompt
    // for PAT inline instead of via window.prompt).
    if (opts.input) {
      $modalField.hidden = false;
      $modalInputLbl.textContent = opts.input.label || 'Value';
      $modalInput.type = opts.input.type || 'text';
      $modalInput.value = '';
      $modalInput.placeholder = opts.input.placeholder || '';
      $modalInput.removeAttribute('data-invalid');
      if (opts.input.hint) {
        $modalInputHint.textContent = opts.input.hint;
        $modalInputHint.hidden = false;
        $modalInputHint.removeAttribute('data-error');
      } else {
        $modalInputHint.hidden = true;
      }
    } else {
      $modalField.hidden = true;
      $modalInput.value = '';
    }

    $modal.removeAttribute('hidden');
    setTimeout(function () {
      if (opts.input) $modalInput.focus();
      else $modalConfirm.focus();
    }, 10);
  }
  function closeModal() {
    $modal.setAttribute('hidden', '');
    modalOnConfirm = null;
    modalValidate  = null;
    $modalField.hidden = true;
    $modalInput.value = '';
    $modalInput.removeAttribute('data-invalid');
    $modalInputHint.removeAttribute('data-error');
  }
  function setModalInputError(msg) {
    $modalInput.setAttribute('data-invalid', '');
    $modalInputHint.textContent = msg;
    $modalInputHint.setAttribute('data-error', '');
    $modalInputHint.hidden = false;
    $modalInput.focus();
    $modalInput.select();
  }
  function setModalBusy(busy, label) {
    $modalConfirm.disabled = !!busy;
    $modalCancel.disabled  = !!busy;
    if (busy && label) $modalConfirm.textContent = label;
  }

  /* Busy overlay — blocks all interaction (and signals "don't
     navigate") while a long-running GH op is in flight. */
  var $busy      = document.getElementById('ev2Busy');
  var $busyTitle = document.getElementById('ev2BusyTitle');
  var $busySub   = document.getElementById('ev2BusySub');
  function showBusy(title, sub) {
    if (!$busy) return;
    if ($busyTitle) $busyTitle.textContent = title || 'Working\u2026';
    if ($busySub)   $busySub.textContent   = sub   || 'Please don\u2019t close this tab.';
    $busy.removeAttribute('hidden');
  }
  function updateBusy(title, sub) {
    if (!$busy || $busy.hasAttribute('hidden')) return;
    if (title && $busyTitle) $busyTitle.textContent = title;
    if (sub   && $busySub)   $busySub.textContent   = sub;
  }
  function hideBusy() { if ($busy) $busy.setAttribute('hidden', ''); }
  $modalConfirm.addEventListener('click', function () {
    var fn = modalOnConfirm;
    var validate = modalValidate;
    var value = $modalField.hidden ? undefined : $modalInput.value;

    // No input \u2014 classic confirm flow.
    if (!validate) {
      closeModal();
      if (fn) fn(value);
      return;
    }

    // Inline validate (may return Promise). On error we keep the
    // dialog open and show a hint instead of closing+toasting.
    var result;
    try { result = validate(value); }
    catch (e) { setModalInputError((e && e.message) || String(e)); return; }

    if (result && typeof result.then === 'function') {
      setModalBusy(true, 'Verifying\u2026');
      result.then(function () {
        setModalBusy(false);
        closeModal();
        if (fn) fn(value);
      }).catch(function (err) {
        setModalBusy(false);
        setModalInputError((err && err.message) || String(err) || 'Invalid value');
      });
      return;
    }

    if (result) { setModalInputError(result); return; }
    closeModal();
    if (fn) fn(value);
  });
  // Submit-on-Enter when the input is focused (the input lives
  // outside any <form> so we wire this explicitly).
  $modalInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $modalConfirm.click(); }
  });
  $modalCancel.addEventListener('click', closeModal);
  $modal.querySelector('.ev2-modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$modal.hasAttribute('hidden')) closeModal();
  });

  // Boot now — all helpers + DOM refs are in scope.
  boot();

  /* ── Portal tooltip ───────────────────────────────────
     CSS-only [data-tip] tooltips get clipped by any ancestor with
     overflow:auto/hidden (workspace scroll container, intent card, etc.).
     This portal renders into <body> with position:fixed so it always
     sits on top of every container. */
  (function initTipPortal() {
    var tip = document.createElement('div');
    tip.className = 'ev2-tip-portal';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    document.documentElement.classList.add('ev2-tip-js');

    var current = null;
    function hide() {
      tip.removeAttribute('data-show');
      current = null;
    }
    function show(el) {
      var text = el.getAttribute('data-tip');
      if (!text) return;
      current = el;
      tip.textContent = text;
      tip.setAttribute('data-show', '1');
      // Force layout to read final size after content swap
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var r = el.getBoundingClientRect();
      var vw = window.innerWidth, vh = window.innerHeight;
      var cx = r.left + r.width / 2;
      /* Prefer below the trigger so tips never cover the swatch /
         ratio they describe. Flip above only when there isn't room. */
      var place = 'bottom';
      var top = r.bottom + 10;
      if (top + th > vh - 8) { place = 'top'; top = r.top - th - 10; }
      var left = Math.round(cx - tw / 2);
      left = Math.max(8, Math.min(vw - tw - 8, left));
      tip.style.top = Math.round(top) + 'px';
      tip.style.left = left + 'px';
      tip.setAttribute('data-place', place);
      // Position the arrow horizontally relative to the anchor
      var arrowX = Math.max(10, Math.min(tw - 10, cx - left));
      tip.style.setProperty('--ev2-tip-arrow', arrowX + 'px');
      // Override the ::after left to match arrowX
      tip.style.cssText = tip.style.cssText; // no-op; arrow position via inline style below
      tip.style.setProperty('--ev2-arrow-x', arrowX + 'px');
    }

    function findTipAncestor(node) {
      while (node && node !== document.body) {
        if (node.nodeType === 1 && node.hasAttribute && node.hasAttribute('data-tip')) return node;
        node = node.parentNode;
      }
      return null;
    }

    document.addEventListener('mouseover', function (e) {
      var el = findTipAncestor(e.target);
      if (el && el !== current) show(el);
    });
    document.addEventListener('mouseout', function (e) {
      if (!current) return;
      var to = e.relatedTarget;
      if (to && (to === current || (current.contains && current.contains(to)))) return;
      hide();
    });
    document.addEventListener('focusin', function (e) {
      var el = findTipAncestor(e.target);
      if (el) show(el);
    });
    document.addEventListener('focusout', function () { hide(); });
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  })();

  /* ── T2 row bulk-op dispatcher ─────────────────────────
     Chips inside the expanded Property Card (pcActionsHTML) carry
     data-pc-bulk; this dispatcher routes them to the right helper.
     Replaces the earlier overflow-menu popover (which paid for one
     extra resting-state button per detached row); now the bulk ops
     are inline beneath the step ladder and only exist when the
     designer has opened the card to think about the row. */
  function handleT2RowBulk(itemBtn) {
    var key       = itemBtn.getAttribute('data-pc-bulk');
    var surfaceId = itemBtn.getAttribute('data-surface');
    var propId    = itemBtn.getAttribute('data-prop');
    var mode      = State.editingMode;
    if (key === 'reset-family') bulkResetFamily(surfaceId, propId, mode);
  }

  /* ── (removed) T2 row overflow menu ───────────────────
     The old ⋯ popover was deleted in favor of pcActionsHTML's
     inline action chips. handleT2RowBulk above is the only piece
     that survived because the inline chips reuse data-pc-bulk. */

  /* ── WCAG sentinel popover ──────────────────────────────
     Click a .ev2-pc-wcag chip on a Property Card → opens a click-
     stable popover with: mini preview of the failing pair (text-on-
     bg for content, border-on-bg for edge), the plain-language WHY
     (re-uses wcagTipText), and ONE suggested step + projected ratio
     + Apply button (writes through setT2Step). Click outside or Esc
     to close. The hover tooltip on the same chip stays as the quick
     scan; click upgrades to the full panel. */
  (function initWcagPopover() {
    var pop = document.createElement('div');
    pop.className = 'ev2-wcag-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Contrast details and suggestion');
    document.body.appendChild(pop);
    var openOn = null; // the chip currently driving the popover
    var openedAt = 0;

    function close() {
      pop.removeAttribute('data-show');
      pop.innerHTML = '';
      openOn = null;
    }

    function renderPreviewHTML(sent, sug, tokenName, propId) {
      // Contextualised previews: each prop family gets a treatment
      // that matches what the token actually paints in product UI,
      // so the designer reads the popover as "this is the thing"
      // not "this is a generic rectangle".
      //   - ct-* (text)         \u2192 the real purpose copy at the right
      //                            size/weight (heading, body, meta,
      //                            caption) painted on the baseline bg.
      //   - cm-outline trio     \u2192 a pill-shaped button outlined in
      //                            the failing color (component-like).
      //   - surface outline     \u2192 a small card with stacked inner
      //                            bars + 2px border (region-like).
      // Border thickness bumped to 2px in both edge cases so the
      // failing color is actually visible at thumbnail scale (1px
      // borders disappeared in the 42px preview boxes).
      var bg = sent.baselineHex;
      var curHex = pop.__cellHex || '#000';
      var sugHex = sug ? sug.hex : null;
      function pickFg(hex) {
        return contrastRatio('#000000', hex) >= contrastRatio('#FFFFFF', hex) ? '#000000' : '#FFFFFF';
      }
      var arrow = '<div class="ev2-wcag-pop-arrow" aria-hidden="true">\u2192</div>';

      // ---- T1 derived tokens (border / separator / on-component /
      //       on-container) \u2014 render in the actual role-tinted
      //       setting so the designer reads "this border on THIS
      //       role's container" instead of "this border on a
      //       generic surface card". Falls through to the legacy
      //       branches below for T2 and T1 levers. ----
      var t1Ctx = pop.__t1Ctx;
      if (t1Ctx && propId && propId.indexOf('t1d:') === 0) {
        var derivedKind = t1Ctx.derivedId;
        // Border on the role's container, with a real heading + body
        // line painted in on-container. 2px so the edge reads.
        if (derivedKind === 'border') {
          function borderCard(borderHex) {
            return '<div class="ev2-wcag-pop-prev-box" style="background:' + t1Ctx.roleContainerHex + ';border:2px solid ' + borderHex + ';border-radius:6px;padding:9px 11px;display:flex;flex-direction:column;gap:4px;align-items:stretch;justify-content:center;color:' + t1Ctx.onContainerHex + '">'
              + '<span style="font-size:11px;font-weight:700;line-height:1.1">Container heading</span>'
              + '<span style="font-size:10px;font-weight:500;opacity:.85;line-height:1.2">Body text inside the container.</span>'
            + '</div>';
          }
          return borderCard(curHex) + (sug ? arrow + borderCard(sugHex) : '');
        }
        // Separator: two stacked rows on the role container, divided
        // by a 1px line in the separator color.
        if (derivedKind === 'separator') {
          function sepCard(sepHex) {
            var row = '<div style="padding:5px 0;font-size:10px;font-weight:500;color:' + t1Ctx.onContainerHex + ';line-height:1.2">List item</div>';
            return '<div class="ev2-wcag-pop-prev-box" style="background:' + t1Ctx.roleContainerHex + ';border-radius:6px;padding:4px 11px;display:flex;flex-direction:column;align-items:stretch;justify-content:center">'
              + row
              + '<div style="height:1px;background:' + sepHex + '" aria-hidden="true"></div>'
              + row
              + '<div style="height:1px;background:' + sepHex + '" aria-hidden="true"></div>'
              + row
            + '</div>';
          }
          return sepCard(curHex) + (sug ? arrow + sepCard(sugHex) : '');
        }
        // On-component: a real role-tinted pill (button) carrying
        // the on-component text. The fill is the role's fill hex.
        if (derivedKind === 'onComponent') {
          function ocPill(textHex) {
            return '<div class="ev2-wcag-pop-prev-box" style="background:' + t1Ctx.roleFillHex + ';color:' + textHex + ';padding:8px 16px;border-radius:999px;min-height:0;font-size:11px;font-weight:600;justify-content:center">Button</div>';
          }
          return ocPill(curHex) + (sug ? arrow + ocPill(sugHex) : '');
        }
        // On-container: a real role-tinted card (alert) carrying a
        // small heading + body line in the on-container hex.
        if (derivedKind === 'onContainer') {
          function occBox(textHex) {
            return '<div class="ev2-wcag-pop-prev-box" style="background:' + t1Ctx.roleContainerHex + ';color:' + textHex + ';padding:8px 12px;border-radius:6px;min-height:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;text-align:left">'
              + '<span style="font-size:11px;font-weight:700;line-height:1.1">Heads up</span>'
              + '<span style="font-size:10px;font-weight:500;line-height:1.2">Body copy inside the container.</span>'
            + '</div>';
          }
          return occBox(curHex) + (sug ? arrow + occBox(sugHex) : '');
        }
      }

      // ---- Fill intent (T1 fill lever) ----
      // Role color paints the BG; on-component (white/black) is
      // the legible text the button would carry in real UI.
      if (sent.intent === 'fill') {
        function fillPill(fillHex) {
          var onC = (contrastRatio(fillHex, '#FFFFFF') >= contrastRatio(fillHex, '#0A0A0A')) ? '#FFFFFF' : '#0A0A0A';
          return '<div class="ev2-wcag-pop-prev-box" style="background:' + fillHex + ';color:' + onC + ';padding:8px 16px;border-radius:999px;min-height:0;font-size:11px;font-weight:600;justify-content:center">Button</div>';
        }
        return fillPill(curHex) + (sug ? arrow + fillPill(sugHex) : '');
      }

      // ---- Container intent (T1 container lever) ----
      // Container hex paints the BG; the auto-derived on-container
      // is what real alerts/banners use for body copy.
      if (sent.intent === 'container') {
        function containerChip(contHex) {
          var onC = (contrastRatio(contHex, '#FFFFFF') >= contrastRatio(contHex, '#0A0A0A')) ? '#FFFFFF' : '#0A0A0A';
          return '<div class="ev2-wcag-pop-prev-box" style="background:' + contHex + ';color:' + onC + ';padding:8px 12px;border-radius:6px;min-height:0;font-size:11px;font-weight:500;text-align:left;justify-content:flex-start">Container body</div>';
        }
        return containerChip(curHex) + (sug ? arrow + containerChip(sugHex) : '');
      }

      // ---- Text intent (content tokens) ----
      if (sent.intent === 'text') {
        var sample, size, weight;
        if (propId === 'ct-strong')      { sample = 'Section heading';     size = '17px'; weight = 700; }
        else if (propId === 'ct-default'){ sample = 'Body paragraph reads here.'; size = '13px'; weight = 500; }
        else if (propId === 'ct-subtle') { sample = 'Metadata \u00b7 2 min ago'; size = '12px'; weight = 500; }
        else if (propId === 'ct-faint')  { sample = 'Helper caption text'; size = '11px'; weight = 500; }
        else                              { sample = sent.large ? 'Aa' : 'Body text'; size = '13px'; weight = 500; }
        function txtBox(fg) {
          return '<div class="ev2-wcag-pop-prev-box" style="background:' + bg + ';padding:10px 12px;justify-content:flex-start;text-align:left">'
            + '<span style="color:' + fg + ';font-size:' + size + ';font-weight:' + weight + ';line-height:1.3">' + sample + '</span>'
          + '</div>';
        }
        return txtBox(curHex) + (sug ? arrow + txtBox(sugHex) : '');
      }

      // ---- Edge intent (border tokens) ----
      var isCmEdge = propId === 'cm-outline' || propId === 'cm-outline-hover' || propId === 'cm-outline-pressed';
      var innerFg = pickFg(bg);
      if (isCmEdge) {
        // Pill shape \u2014 reads as a button outline. bg here is cm-bg
        // for the matching state.
        function pill(borderHex) {
          return '<div class="ev2-wcag-pop-prev-box" style="background:' + bg + ';border:2px solid ' + borderHex + ';border-radius:999px;padding:8px 16px;min-height:0;font-size:11px;font-weight:600;color:' + innerFg + '">Button</div>';
        }
        return pill(curHex) + (sug ? arrow + pill(sugHex) : '');
      }
      // Surface outline \u2014 card with two faint inner bars so the
      // border has something to outline. 2px so it reads at scale.
      function card(borderHex) {
        return '<div class="ev2-wcag-pop-prev-box" style="background:' + bg + ';border:2px solid ' + borderHex + ';padding:8px;display:flex;flex-direction:column;gap:5px;align-items:stretch;justify-content:center">'
          + '<div style="height:5px;border-radius:2px;background:' + innerFg + ';opacity:.45;width:70%"></div>'
          + '<div style="height:5px;border-radius:2px;background:' + innerFg + ';opacity:.22;width:50%"></div>'
        + '</div>';
      }
      return card(curHex) + (sug ? arrow + card(sugHex) : '');
    }

    function open(chip) {
      var card = chip.closest('.ev2-pc');
      if (!card) return;
      var tier      = card.getAttribute('data-pc-tier') || 't2';
      var mode      = State.editingMode;
      var sent, sug, tokenName, applyAttrs, propIdHint = null, flashProp = null;
      if (tier === 't1') {
        var roleId  = card.getAttribute('data-pc-role');
        var derivedId = card.getAttribute('data-pc-derived');
        if (derivedId) {
          // Build sentinel + suggestion for a T1 derived card.
          var base = t1DerivedBaseline(roleId, derivedId, mode);
          var curStep = t1DerivedStep(roleId, derivedId, mode);
          var jr = t1DerivedJudgeStep(roleId, derivedId, mode, curStep);
          sent = {
            intent: base.intent, large: base.large,
            baselineHex: base.hex, baseline: base.token,
            ratio: jr.ratio, judge: jr.judge
          };
          // Suggestion: walk both directions, pick first passing
          // step in the derived's allowed step set.
          (function () {
            var steps = (derivedId === 'onComponent') ? ['white','black'] : ALL_STEPS;
            var threshold = base.large ? 3 : 4.5;
            if (jr.judge.pass) { sug = null; return; }
            var curIdx = steps.indexOf(curStep);
            function tryIdx(idx) {
              var j = t1DerivedJudgeStep(roleId, derivedId, mode, steps[idx]);
              return j.judge.pass ? { step: steps[idx], hex: (derivedId === 'onComponent' ? (steps[idx]==='white'?'#FFFFFF':'#0A0A0A') : ladderFor(roleId)[steps[idx]]), ratio: j.ratio, judge: j.judge } : null;
            }
            var pick = null;
            for (var d = 1; d < steps.length; d++) {
              var fwd = curIdx + d, bwd = curIdx - d;
              var rF = (fwd < steps.length) ? tryIdx(fwd) : null;
              var rB = (bwd >= 0) ? tryIdx(bwd) : null;
              if (rF || rB) { pick = (rF && rB) ? (rF.ratio >= rB.ratio ? rF : rB) : (rF || rB); break; }
            }
            sug = pick;
          })();
          tokenName = t1DerivedTokenName(roleId, derivedId);
          pop.__cellHex = t1DerivedHex(roleId, derivedId, mode);
          // Stash extra context so renderPreviewHTML can render the
          // derived token in its role-tinted setting (border on the
          // role container, on-component text on the role fill,
          // etc.) instead of falling back to abstract surface chrome.
          var roleLadder = ladderFor(roleId);
          var t1cur = State.t1[mode][roleId];
          pop.__t1Ctx = {
            derivedId: derivedId,
            roleFillHex:      roleLadder[t1cur.fill]      || '#000',
            roleContentHex:   roleLadder[t1cur.content]   || '#000',
            roleContainerHex: roleLadder[t1cur.container] || '#fff',
            onComponentHex:   onComponentColor(roleId, mode),
            onContainerHex:   onContainerColor(roleId, mode)
          };
          propIdHint = 't1d:' + derivedId;
          applyAttrs = ' data-pc-wcag-tier="t1d" data-pc-wcag-role="' + roleId + '" data-pc-wcag-derived="' + derivedId + '"';
        } else {
          var leverId = card.getAttribute('data-pc-lever');
          sent = t1Sentinel(roleId, leverId, mode);
          if (!sent) return;
          sug  = t1SuggestStep(roleId, leverId, mode);
          tokenName = t1TokenName(roleId, leverId);
          pop.__cellHex = t1HexFor(roleId, leverId, mode);
          pop.__t1Ctx = null;
          applyAttrs = ' data-pc-wcag-tier="t1" data-pc-wcag-role="' + roleId + '" data-pc-wcag-lever="' + leverId + '"';
        }
      } else {
        var surfaceId = card.getAttribute('data-pc-surface');
        var propId    = card.getAttribute('data-pc-prop');
        sent = t2Sentinel(surfaceId, propId, mode);
        if (!sent) return;
        sug  = t2SuggestStep(surfaceId, propId, mode);
        tokenName = '--surface-' + surfaceId + '-' + propId;
        pop.__cellHex = t2HexFor(surfaceId, propId, mode);
        applyAttrs = ' data-pc-wcag-tier="t2" data-surface="' + surfaceId + '" data-prop="' + propId + '"';
        propIdHint = propId;
        flashProp  = propId;
      }

      // header chip mirrors the chip style
      var grade = chip.getAttribute('data-grade') || 'fail';
      var sym = grade === 'edge-soft' ? '\u24D8' : (sent.judge.pass ? '\u2713' : '\u26A0');
      var headerChip = '<span class="ev2-wcag-pop-chip" data-grade="' + grade + '">' + sym + ' ' + sent.ratio.toFixed(2) + ':1</span>';

      var why = wcagTipText(sent, tokenName);

      var sugBlock = '';
      if (sent.judge.pass) {
        // Already passing \u2014 no fix to suggest. Don't lie with the
        // empty-fallback copy that pretends no step works.
        sugBlock = '<div class="ev2-wcag-pop-fix ev2-wcag-pop-fix-empty">No change needed \u2014 this pairing already meets the threshold.</div>';
      } else if (sug) {
        var sugGrade = sug.judge.pass ? (sug.judge.grade === 'AAA' ? 'aaa' : (sent.large ? 'aa-large' : 'aa')) : 'fail';
        sugBlock =
          '<div class="ev2-wcag-pop-fix">'
          + '<div class="ev2-wcag-pop-fix-head">'
            + '<span class="ev2-wcag-pop-fix-title">Suggested fix</span>'
            + '<span class="ev2-wcag-pop-chip" data-grade="' + sugGrade + '">\u2713 ' + sug.ratio.toFixed(2) + ':1</span>'
          + '</div>'
          + '<div class="ev2-wcag-pop-fix-body">'
            + '<span class="ev2-wcag-pop-sw" style="background:' + sug.hex + '"></span>'
            + '<span class="ev2-wcag-pop-fix-txt">Step <strong>' + sug.step + '</strong> (' + sug.hex.toUpperCase() + ')</span>'
            + '<button type="button" class="ev2-wcag-pop-apply" data-pc-wcag-apply' + applyAttrs + ' data-step="' + sug.step + '">Apply</button>'
          + '</div>'
        + '</div>';
      } else {
        sugBlock = '<div class="ev2-wcag-pop-fix ev2-wcag-pop-fix-empty">No step in this palette reaches the threshold against ' + sent.baseline.replace(/^--[^-]+-/, '') + '. Try editing the baseline instead.</div>';
      }

      var edgeNote = '';

      pop.innerHTML =
          '<div class="ev2-wcag-pop-head">'
            + '<div class="ev2-wcag-pop-name"><code>' + tokenName + '</code></div>'
            + headerChip
            + '<button type="button" class="ev2-wcag-pop-close" data-pc-wcag-close aria-label="Close">\u00D7</button>'
          + '</div>'
          + '<div class="ev2-wcag-pop-prev" aria-label="Preview">'
            + renderPreviewHTML(sent, sug, tokenName, propIdHint)
          + '</div>'
          + '<div class="ev2-wcag-pop-why">' + why + '</div>'
          + sugBlock
          + edgeNote;

      // Position below the chip (flip above if no room).
      pop.setAttribute('data-show', '1');
      var r = chip.getBoundingClientRect();
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var vw = window.innerWidth, vh = window.innerHeight;
      var top = r.bottom + 8;
      if (top + ph > vh - 8) top = Math.max(8, r.top - ph - 8);
      var left = Math.round(r.left + r.width / 2 - pw / 2);
      left = Math.max(8, Math.min(vw - pw - 8, left));
      pop.style.top  = Math.round(top) + 'px';
      pop.style.left = left + 'px';
      openOn = chip;
      openedAt = Date.now();
      // Hide the hover tooltip so we don't show two overlapping
      // descriptions of the same chip.
      var tip = document.querySelector('.ev2-tip-portal');
      if (tip) tip.removeAttribute('data-show');
      // Point the preview canvas at the same prop so the designer
      // sees WHERE the failing token lives on real UI. T1 has no
      // canvas zone mapping yet, so skip the flash there.
      if (flashProp) pushPvFlash(flashProp);
    }

    document.addEventListener('click', function (e) {
      var closeBtn = e.target.closest && e.target.closest('[data-pc-wcag-close]');
      if (closeBtn) { close(); return; }
      var applyBtn = e.target.closest && e.target.closest('[data-pc-wcag-apply]');
      if (applyBtn) {
        var step    = applyBtn.getAttribute('data-step');
        var btnTier = applyBtn.getAttribute('data-pc-wcag-tier') || 't2';
        close();
        if (btnTier === 't1') {
          var rId = applyBtn.getAttribute('data-pc-wcag-role');
          var lId = applyBtn.getAttribute('data-pc-wcag-lever');
          setT1Lever(rId, lId, State.editingMode, step);
        } else if (btnTier === 't1d') {
          var rId2 = applyBtn.getAttribute('data-pc-wcag-role');
          var dId  = applyBtn.getAttribute('data-pc-wcag-derived');
          setT1Derived(rId2, dId, State.editingMode, step);
        } else {
          var sId = applyBtn.getAttribute('data-surface');
          var pId = applyBtn.getAttribute('data-prop');
          setT2Step(sId, pId, State.editingMode, step);
          // Re-flash the zone right after the new value lands so the
          // designer SEES the fix arrive.
          setTimeout(function () { pushPvFlash(pId); }, 60);
        }
        return;
      }
      var chip = e.target.closest && e.target.closest('[data-pc-wcag-open]');
      if (chip) {
        e.preventDefault();
        if (openOn === chip) { close(); return; }
        open(chip);
        return;
      }
      // outside click
      if (openOn && !pop.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && openOn) { close(); openOn && openOn.focus && openOn.focus(); }
    });
    window.addEventListener('scroll', function () {
      // Ignore the focus-induced scrollIntoView that fires right
      // after a click; only close on genuine user scrolling.
      if (openOn && Date.now() - openedAt > 250) close();
    }, true);
    window.addEventListener('resize', function () { if (openOn) close(); });
  })();

  /* ── Surface source-palette picker (custom popover) ────
     A native <select> can't render labeled group separators or an
     empty-state slot, so the picker is a singleton popover that
     renders SURFACE_PALETTE_GROUPS as labeled sections with a 1px
     separator between groups. Mirrors the WCAG popover above for
     positioning, outside-click + Esc close, and the 250ms scroll
     grace window so focus-induced scrolls don't auto-dismiss.
     Exposes window.__ev2OpenPalettePicker(triggerBtn) so the
     delegated click handler at the top of this file can drive it. */
  (function initSurfacePalettePicker() {
    var pop = document.createElement('div');
    pop.className = 'ev2-pal-pop';
    pop.setAttribute('role', 'listbox');
    pop.setAttribute('aria-label', 'Source palette');
    document.body.appendChild(pop);
    var openOn = null;
    var openedAt = 0;

    function close() {
      if (!openOn) return;
      pop.removeAttribute('data-show');
      pop.innerHTML = '';
      openOn.setAttribute('aria-expanded', 'false');
      openOn = null;
    }

    function render(surfaceId) {
      var groups = (typeof buildSurfacePaletteGroups === 'function')
        ? buildSurfacePaletteGroups()
        : [{ id:'defaults', label:'Default palettes', options: SURFACE_PALETTE_DEFAULTS.slice() }];
      var current = surfacePaletteFor(surfaceId);
      var def = T2_SURFACES.find(function (s) { return s.id === surfaceId; });
      var defaultPaletteId = def ? def.palette : null;
      var html = '';
      groups.forEach(function (g, gi) {
        if (gi > 0) html += '<div class="ev2-pal-pop-sep" role="separator"></div>';
        html += '<div class="ev2-pal-pop-group" data-group="' + g.id + '">'
          + '<div class="ev2-pal-pop-group-label">' + g.label + '</div>';
        if (g.options.length) {
          g.options.forEach(function (opt) {
            var isCurrent = opt.id === current;
            var isDefault = opt.id === defaultPaletteId;
            html += '<button type="button" class="ev2-pal-pop-opt"'
              + ' role="option" aria-selected="' + (isCurrent ? 'true' : 'false') + '"'
              + ' data-palette-pick="' + opt.id + '"'
              + (isCurrent ? ' data-current="1"' : '')
              + '>'
              + '<span class="ev2-pal-pop-opt-main">'
                + '<span class="ev2-pal-pop-opt-label">' + opt.label
                  + (isDefault ? '<span class="ev2-pal-pop-opt-default">default</span>' : '')
                + '</span>'
                + (opt.desc ? '<span class="ev2-pal-pop-opt-desc">' + opt.desc + '</span>' : '')
              + '</span>'
              + (isCurrent ? '<span class="ev2-pal-pop-opt-check" aria-hidden="true">\u2713</span>' : '')
            + '</button>';
          });
        } else if (g.emptyState) {
          html += '<div class="ev2-pal-pop-empty">' + g.emptyState + '</div>';
        }
        html += '</div>';
      });
      pop.innerHTML = html;
    }

    function position(trigger) {
      var r = trigger.getBoundingClientRect();
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var vw = window.innerWidth, vh = window.innerHeight;
      var top = r.bottom + 6;
      if (top + ph > vh - 8) top = Math.max(8, r.top - ph - 6);
      var left = Math.round(r.left);
      // Prefer right-edge alignment if it doesn't overflow on the right.
      if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
      pop.style.top  = Math.round(top) + 'px';
      pop.style.left = left + 'px';
    }

    function openFor(trigger) {
      var surfaceId = trigger.getAttribute('data-surface-palette-open');
      if (!surfaceId) return;
      if (openOn === trigger) { close(); return; }
      if (openOn) close();
      render(surfaceId);
      pop.setAttribute('data-surface', surfaceId);
      pop.setAttribute('data-show', '1');
      // Measure AFTER paint so offsetWidth/Height are valid.
      position(trigger);
      trigger.setAttribute('aria-expanded', 'true');
      openOn = trigger;
      openedAt = Date.now();
    }
    window.__ev2OpenPalettePicker = openFor;

    document.addEventListener('click', function (e) {
      var pickBtn = e.target && e.target.closest && e.target.closest('[data-palette-pick]');
      if (pickBtn && openOn && pop.contains(pickBtn)) {
        var picked = pickBtn.getAttribute('data-palette-pick');
        var sid = pop.getAttribute('data-surface');
        var def = T2_SURFACES.find(function (s) { return s.id === sid; });
        if (!def || !picked || !isValidSurfacePalette(picked)) { close(); return; }
        if (picked === def.palette) {
          /* Restoring the surface's declared default \u2014 drop the
             override so the surface no longer counts as dirty for
             palette reasons. CUSTOM step picks survive (only the
             palette override is cleared). */
          if (State.t2SurfacePalette[sid]) delete State.t2SurfacePalette[sid];
        } else {
          State.t2SurfacePalette[sid] = picked;
        }
        scheduleAutosave();
        pushPreview();
        close();
        if (State.activeTier === 't2') renderT2();
        refreshChangeBar();
        return;
      }
      // Outside-click close. Triggers are handled by the dedicated
      // [data-surface-palette-open] click listener at the top of
      // the file; if a different trigger is clicked while one is
      // open, openFor() handles the swap.
      if (openOn && !pop.contains(e.target) && !e.target.closest('[data-surface-palette-open]')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && openOn) { var t = openOn; close(); t.focus && t.focus(); }
    });
    window.addEventListener('scroll', function () {
      if (openOn && Date.now() - openedAt > 250) close();
    }, true);
    window.addEventListener('resize', function () { if (openOn) close(); });
  })();
})();
