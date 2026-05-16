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
  var ALL_STEPS = ['25','50','75','100','150','175','200','250','300','350','400','450','500','550','600','700','750','800','850','900'];
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
  /* Resolve the auto-derived border/separator step for a role+mode.
     Honors a user override stored in State.t1[mode][roleId][key];
     otherwise computes the default offset from the container pick
     in the mode-correct direction. */
  function resolveBorderStep(roleId, mode) {
    var t = State.t1[mode][roleId];
    if (t.borderStep && ALL_STEPS.indexOf(t.borderStep) >= 0) return t.borderStep;
    return stepRel(t.container, 6 * tonalDir(mode));
  }
  function resolveSeparatorStep(roleId, mode) {
    var t = State.t1[mode][roleId];
    if (t.separatorStep && ALL_STEPS.indexOf(t.separatorStep) >= 0) return t.separatorStep;
    return stepRel(t.container, 2 * tonalDir(mode));
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
    { id:'bright',    label:'Bright',    palette:'neutral', desc:'Brightest page background' },
    { id:'base',      label:'Base',      palette:'neutral', desc:'Base page background'      },
    { id:'dim',       label:'Dim',       palette:'neutral', desc:'Recessed background'       },
    { id:'deep',      label:'Deep',      palette:'neutral', desc:'Most recessed background'  },
    { id:'accent',    label:'Accent',    palette:'brand',   desc:'Branded panels'            },
    { id:'container', label:'Container', palette:'neutral', desc:'Card-on-surface'           },
    { id:'float',     label:'Float',     palette:'neutral', desc:'Popovers, menus'           },
    { id:'inverse',   label:'Inverse',   palette:'neutral', desc:'Dark on light, light on dark' }
  ];

  /* Anchor step for each surface's `bg` per mode. All other props on
     a surface derive from this via T2_PROP_DEFS[].defaultOffset, in
     the mode-correct direction. Values are the v0 picks accepted in
     Q2 of docs §10 \u2014 step-4 render will paint from these, not from
     the existing surfaces.css output, and the \u00b1 stepper is the
     escape hatch when a surface needs a different anchor. */
  var T2_BASE_STEPS = {
    light: { bright:'25',  base:'50',  dim:'100', deep:'200',
             accent:'25',  container:'25', float:'25',  inverse:'900' },
    dark:  { bright:'850', base:'900', dim:'850', deep:'800',
             accent:'900', container:'850', float:'800', inverse:'25'  }
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
  /* True if any cell in this surface (either mode) carries an
     override — either a custom step or a follows pointer. */
  function isT2Changed(surfaceId) {
    return ['light','dark'].some(function (mode) {
      var bag = State.t2 && State.t2[mode] && State.t2[mode][surfaceId];
      if (!bag) return false;
      return Object.keys(bag).some(function (propId) {
        var ov = bag[propId];
        return ov && (ov.step || ov.follows);
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

  /* Neutral palette generator. ROLES already cover brand/danger/etc
     via stepsFor(); neutral has no T0 entry because it's never the
     "active editing role". For T2 we need its ladder to paint
     surface swatches, so we generate it on demand from
     --prim-neutral-500 in the loaded primitives.css. Cached at
     module scope; invalidated on Discard (T0 wipe). */
  var _neutralStepsCache = null;
  function neutralSteps() {
    if (_neutralStepsCache) return _neutralStepsCache;
    var cs = getComputedStyle(document.documentElement);
    var seed = cs.getPropertyValue('--prim-neutral-500').trim() || '#737E88';
    _neutralStepsCache = window.PaletteEngine.generatePalette(seed, { anchor: 'normalized' }).steps;
    return _neutralStepsCache;
  }

  /* Resolve a T2 cell to its hex value by walking the surface's
     source palette ladder. Used for swatches + WCAG math. */
  function t2HexFor(surfaceId, propId, mode) {
    var surface = T2_SURFACES.find(function (s) { return s.id === surfaceId; });
    if (!surface) return '#000';
    var step = resolveT2Step(surfaceId, propId, mode);
    var ladder = surface.palette === 'brand' ? stepsFor('brand') : neutralSteps();
    for (var i = 0; i < ladder.length; i++) {
      if (ladder[i].name === step) return ladder[i].hex;
    }
    return '#000';
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
    // Disclosure open-state persists across role / tier swaps.
    // Keyed by 'tierId:discId' so each tier can have its own pattern.
    disclosure: { 't0:steps': false, 't0:affects': false, 't1:slots': false, 't1:affects': false },
    focusedLever: null,
    lastSavedAt: null
  };

  var DRAFT_KEY = 'dtf-editor-v2-draft-v2';
  var UI_KEY    = 'dtf-editor-v2-ui-v1';

  /* ── UI state persistence (separate from draft — it survives Discard) ── */
  function saveUIState() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({
        v: 1,
        activeTier: State.activeTier,
        activeRole: State.activeRole,
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

  function isChanged(roleId) {
    return State.proposed[roleId].toUpperCase() !== State.baseline[roleId].toUpperCase();
  }
  function isT1ChangedInMode(roleId, mode) {
    var t = State.t1[mode][roleId];
    var b = (State.t1Baseline && State.t1Baseline[mode] && State.t1Baseline[mode][roleId])
         || defaultT1ForRole(roleId, mode);
    return t.fill !== b.fill || t.content !== b.content || t.container !== b.container
        || !!t.borderStep || !!t.separatorStep;
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
    });
    return diffs;
  }
  function badgeTipFor(roleId) {
    var diffs = summarizeRoleChanges(roleId);
    if (!diffs.length) return '';
    var labels = { fill:'Fill', content:'Content', container:'Container' };
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
  // whichever has higher WCAG contrast.
  function onComponentColor(roleId, mode) {
    if (!roleId) return '#FFFFFF'; // legacy callers (preserved for safety)
    var t = State.t1[mode || State.editingMode][roleId];
    var fillHex = stepHexByName(roleId, t.fill) || '#000';
    return DTFSolver.deriveOnComponent(fillHex);
  }
  // Auto-pair: pick the ladder step (closest to the user's chosen
  // content-default) that passes AA against the active container.
  function onContainerColor(roleId, mode) {
    mode = mode || State.editingMode;
    var t = State.t1[mode][roleId];
    var ladder = ladderFor(roleId);
    var containerHex = ladder[t.container] || surfaceBgFor(mode);
    return DTFSolver.deriveOnContainer(ladder, t.content, containerHex).hex;
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
    $changeCt.textContent = n + ' change' + (n === 1 ? '' : 's');
    $discard.disabled = n === 0;
    $deploy.disabled  = n === 0;
    $deployN.hidden = n === 0;
    $deployN.textContent = n;
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
    var n = totalChanges();
    if (n === 0) {
      $autosave.textContent = State.lastSavedAt
        ? 'Last draft cleared \u00b7 ' + relTime(State.lastSavedAt)
        : 'No pending changes';
      return;
    }
    if (!State.lastSavedAt) { $autosave.textContent = 'Saving draft\u2026'; return; }
    var d = new Date(State.lastSavedAt);
    var hh = String(d.getHours()).padStart(2,'0');
    var mm = String(d.getMinutes()).padStart(2,'0');
    $autosave.textContent = 'Saved to draft \u00b7 ' + hh + ':' + mm + ' (' + relTime(State.lastSavedAt) + ')';
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
          t2: State.t2
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
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
      var raw = localStorage.getItem(DRAFT_KEY);
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
      State.lastSavedAt = d.ts || null;
      return totalChanges() > 0;
    } catch (e) { return false; }
  }

  function clearDraftFromStorage() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    State.lastSavedAt = null;
  }

  function refreshDraftStatus(state) {
    if (!draftStatus) return;
    draftStatus.setAttribute('data-state', state);
    var label = draftStatus.querySelector('.ev2-draft-text');
    if (!label) return;
    if (state === 'saving') label.textContent = 'Saving draft\u2026';
    else if (state === 'saved') label.textContent = 'Draft saved \u00b7 ' + relTime(State.lastSavedAt);
    else if (state === 'error') label.textContent = 'Draft save failed';
    else label.textContent = State.lastSavedAt ? 'Draft saved \u00b7 ' + relTime(State.lastSavedAt) : 'No draft yet';
  }

  // Tick the relative timestamp every 30s so it stays honest
  setInterval(function () {
    if (State.lastSavedAt) { refreshDraftStatus('saved'); refreshAutosaveLabel(); }
  }, 30000);

  function ladderHTML(role) {
    var steps = stepsFor(role).filter(function(s){ return s.name !== 'white' && s.name !== 'black'; });
    var baseSteps = baselineStepsFor(role);
    var roleObj = ROLES.find(function (r) { return r.id === role; });
    var prefix = roleObj ? roleObj.prefix : role;
    return steps.map(function (s) {
      var b = baseSteps.find(function(x){ return x.name === s.name; });
      var diff = b && b.hex.toUpperCase() !== s.hex.toUpperCase();
      var tip = diff ? 'Was ' + b.hex.toUpperCase() + ' \u2192 now ' + s.hex.toUpperCase() : s.hex.toUpperCase();
      return '<div class="ev2-step"' + (diff ? ' data-changed="true"' : '') + ' title="' + tip + '">'
        + '<div class="ev2-step-sw" style="background:' + s.hex + '"></div>'
        + '<div class="ev2-step-meta">'
          + '<div class="ev2-step-name">' + s.name + '</div>'
          + '<div class="ev2-step-hex">' + s.hex.replace('#','') + '</div>'
          + '<div class="ev2-step-css">--prim-' + prefix + '-' + s.name + '</div>'
        + '</div>'
      + '</div>';
    }).join('');
  }

  function renderT0() {
    var role = ROLES.find(function (r) { return r.id === State.activeRole; });
    if (!role) return;
    var changedThisRole = isChanged(role.id);
    var affects = AFFECTS[role.id] || [];

    $body.innerHTML =
      '<div class="ev2-roles" role="tablist">'
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

    bindT0();
  }

  function bindT0() {
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

    $color.addEventListener('input', function () { setHex($color.value); });
    $hex.addEventListener('input', function () {
      var v = $hex.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        $hex.removeAttribute('data-invalid');
        setHex(v);
      } else {
        $hex.setAttribute('data-invalid', '');
      }
    });
    $reset.addEventListener('click', function () {
      setHex(State.baseline[State.activeRole]);
      // After reset, refresh tabs/inputs visually
      renderT0();
    });
  }

  function setHex(hex) {
    var role = State.activeRole;
    State.proposed[role] = hex.toUpperCase();
    delete State.cachedSteps[role];
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
    var baselineProp, large = false;
    // Match the matrix in docs \u00a77.
    if (prop.family === 'content') {
      baselineProp = 'bg';
      large = (propId === 'ct-subtle' || propId === 'ct-faint');
    } else if (propId === 'cm-outline' || propId === 'cm-outline-hover' || propId === 'cm-outline-pressed') {
      baselineProp = 'cm-bg';   // outline vs adjacent component bg
      large = true;             // 3:1 is the AA threshold for non-text
    } else if (propId === 'cm-bg' || propId === 'cm-bg-hover' || propId === 'cm-bg-pressed' ||
               propId === 'outline') {
      baselineProp = 'bg';
      large = true;
    } else {
      // subtle, strong, separator, cm-separator, bg \u2014 no sentinel
      // per docs \u00a77 (informational tints / decorative dividers).
      // bg has no sentinel because it IS the baseline.
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
      large: large
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
    var lead = sent.judge.pass
      ? 'Passes — '
      : (sent.ratio >= threshold - 0.5 ? 'Just below — ' : 'Fails — ');
    var body = role.what + ' has ' + ratio + ' contrast against ' + baselineShort
             + (sent.judge.pass ? '' : (', under the ' + threshold + ':1 minimum for ' + role.usage + '.'));
    var hint = '';
    if (!sent.judge.pass) {
      hint = '  Try stepping it ' + role.direction + ', or step ' + baselineShort + ' the other way.';
    }
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
    if (prop === 'cm-bg' || prop === 'cm-bg-hover' || prop === 'cm-bg-pressed')
                                       return { what:'This component fill', usage:'component surface (WCAG 1.4.11)', direction:'darker or lighter to separate from the page bg' };
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
  }
  function clearT2Override(surfaceId, propId, mode) {
    if (State.t2[mode] && State.t2[mode][surfaceId]) {
      delete State.t2[mode][surfaceId][propId];
    }
    scheduleAutosave();
    refreshChangeBar();
    renderT2();
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
    var ladder = surface.palette === 'brand' ? stepsFor('brand') : neutralSteps();
    var current = resolveT2Step(surfaceId, propId, mode);
    var def     = defaultT2Step(surfaceId, propId, mode);
    return '<div class="ev2-pc-ladder" data-pc-ladder-surface="' + surfaceId + '" data-pc-ladder-prop="' + propId + '">'
      + ladder.map(function (s) {
          if (s.name === 'white' || s.name === 'black') return '';
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

  function propertyCardHTML(opts) {
    // opts: { tokenName, swatchHex, step, isDetached, sentinel?,
    //         dataAttrs?, expanded?, level?, parentLabel?, deltaSigned? }
    var swSt = 'background:' + opts.swatchHex + ';' +
               'border-style:' + (opts.isDetached ? 'solid' : 'dashed') + ';';
    var sent = opts.sentinel;
    var sentHTML = '';
    if (sent) {
      var grade = sent.judge.pass ? (sent.judge.grade === 'AAA' ? 'aaa' : (sent.large ? 'aa-large' : 'aa')) : 'fail';
      var sym   = sent.judge.pass ? '\u2713' : '\u26A0';
      sentHTML = '<div class="ev2-pc-wcag" data-grade="' + grade + '"'
        + ' data-tip="' + wcagTipText(sent, opts.tokenName) + '">'
        + sym + ' ' + sent.ratio.toFixed(2) + ':1'
      + '</div>';
    }
    var attrs = '';
    if (opts.dataAttrs) Object.keys(opts.dataAttrs).forEach(function (k) {
      attrs += ' data-' + k + '="' + String(opts.dataAttrs[k]).replace(/"/g,'&quot;') + '"';
    });
    var expanded = !!opts.expanded;
    var ladderHTML = '';
    if (expanded && opts.dataAttrs && opts.dataAttrs['pc-surface'] && opts.dataAttrs['pc-prop']) {
      ladderHTML = pcLadderHTML(opts.dataAttrs['pc-surface'], opts.dataAttrs['pc-prop'], State.editingMode);
    }
    // Build meta strip. For child rows we show "step N · +d from parent"
    // when linked, and "step N · custom" when the user has pinned it.
    var metaBits = '<span class="ev2-pc-step">step ' + opts.step + '</span>';
    if (opts.isDetached) {
      metaBits += '<span class="ev2-pc-chip">custom</span>';
    } else if (opts.parentLabel && typeof opts.deltaSigned === 'number') {
      var sign = opts.deltaSigned > 0 ? '+' : '';
      metaBits += '<span class="ev2-pc-chip ev2-pc-chip-link" data-tip="Linked to ' + opts.parentLabel + ' — step changes follow">'
        + sign + opts.deltaSigned + ' from ' + opts.parentLabel
      + '</span>';
    } else {
      metaBits += '<span class="ev2-pc-chip ev2-pc-chip-muted">base</span>';
    }
    var lvl = opts.level || 0;
    return '<div class="ev2-pc" data-detached="' + (opts.isDetached ? 'true' : 'false') + '" data-expanded="' + (expanded ? 'true' : 'false') + '" data-level="' + lvl + '"' + attrs + '>'
      + '<button type="button" class="ev2-pc-sw" style="' + swSt + '" data-pc-toggle aria-expanded="' + (expanded ? 'true' : 'false') + '" data-tip="' + (expanded ? 'Hide steps' : 'Pick a step') + '" aria-label="' + (expanded ? 'Hide steps' : 'Pick a step') + ' — swatch (also opens picker)"></button>'
      + '<div class="ev2-pc-main">'
        + '<div class="ev2-pc-name">' + opts.tokenName + '</div>'
        + '<div class="ev2-pc-meta">' + metaBits + '</div>'
      + '</div>'
      + sentHTML
      + '<div class="ev2-pc-controls">'
        + '<button type="button" class="ev2-pc-step-btn" data-pc-step="-1" data-tip="Step lighter" aria-label="Step lighter">\u2212</button>'
        + '<button type="button" class="ev2-pc-step-btn" data-pc-step="+1" data-tip="Step darker" aria-label="Step darker">+</button>'
        + '<button type="button" class="ev2-pc-disclose" data-pc-toggle aria-expanded="' + (expanded ? 'true' : 'false') + '" data-tip="' + (expanded ? 'Hide steps' : 'Pick a step') + '" aria-label="' + (expanded ? 'Hide steps' : 'Pick a step') + '"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
        + '<button type="button" class="ev2-pc-reset" data-pc-reset' + (opts.isDetached ? '' : ' disabled') + ' data-tip="Reset to default" aria-label="Reset to default">\u21BA</button>'
      + '</div>'
      + ladderHTML
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

    var modeBtns =
      '<div class="ev2-edit-mode-row" role="radiogroup" aria-label="Editing mode">'
        + '<button type="button" class="ev2-edit-mode" data-edit-mode="light" aria-checked="' + (mode === 'light') + '" role="radio">Light</button>'
        + '<button type="button" class="ev2-edit-mode" data-edit-mode="dark"  aria-checked="' + (mode === 'dark')  + '" role="radio">Dark</button>'
      + '</div>';

    $body.innerHTML =
      surfacePickerHTML()
      + '<div class="ev2-surface-pane">'
        + '<header class="ev2-surface-head">'
          + '<div class="ev2-surface-head-l">'
            + '<span class="ev2-surface-head-sw" style="background:' + bgHex + '"></span>'
            + '<div class="ev2-surface-head-txt">'
              + '<h2 class="ev2-surface-head-name">' + surface.label + '</h2>'
              + '<p class="ev2-surface-head-sub">' + surface.desc + ' \u2014 source: <code>' + surface.palette + '</code></p>'
            + '</div>'
          + '</div>'
          + modeBtns
        + '</header>'
        + T2_FAMILIES.map(function (f) { return surfaceFamilyHTML(surface, f, mode); }).join('')
      + '</div>';
  }

  /* ── T1 Roles ────────────────────────────────────────── */
  /* WCAG bar + auto-derived swatches for the current step picks of a
     role/mode. Returns two HTML strings (the bar + the derived card)
     so the renderer can place them in the right slots. */
  function renderWcagPairsHTML(role, mode) {
    var t1 = State.t1[mode][role.id];
    var pageBg = surfaceBgFor(mode);
    var wcag = computeRoleContrast(role.id, mode);
    var failCount = wcag.checks.filter(function (c) { return !c.pass; }).length;
    /* Suppress the success bar entirely — per-step AA marks already
       confirm everything passes. Only surface the bar (with a Snap
       affordance) when something is actually broken. */
    var wcagHTML = '';
    if (failCount > 0) {
      var wcagBadgeTxt = failCount + ' of ' + wcag.checks.length + ' selected pairs fail AA';
      var wcagDetails = wcag.checks.map(function (c) {
        var sym = c.pass ? '\u2713' : '\u26A0';
        return sym + ' ' + c.label + ' \u2014 ' + c.ratio.toFixed(2) + ':1 (' + c.grade + ')';
      }).join('\n');
      wcagHTML = '<div class="ev2-wcag-bar" data-grade="fail">'
        + '<span class="ev2-wcag-bar-icon" aria-hidden="true">\u26A0</span>'
        + '<span class="ev2-wcag-bar-text">' + wcagBadgeTxt + '</span>'
        + '<button type="button" class="ev2-wcag-bar-info" data-tip="' + wcagDetails.replace(/"/g,'&quot;').replace(/\n/g,'\u2003') + '">Details</button>'
        + '<button type="button" class="ev2-wcag-bar-fix" id="ev2WcagAutoFix">Snap to AA</button>'
      + '</div>';
    }

    var pairedFillHex = stepHexByName(role.id, t1.fill) || '#000';
    var pairedContainerHex = stepHexByName(role.id, t1.container) || pageBg;
    var pairOnComp = wcag.onComp;
    var pairOnCont = wcag.onCont;
    var pairOnCompRatio = contrastRatio(pairOnComp, pairedFillHex);
    var pairOnContRatio = contrastRatio(pairOnCont, pairedContainerHex);
    var pairOnCompJudge = wcagJudge(pairOnCompRatio, false);
    var pairOnContJudge = wcagJudge(pairOnContRatio, false);
    var pairOnCompName  = pairOnComp.toUpperCase() === '#FFFFFF' ? 'White' : 'Black';
    /* Border + Separator are auto-derived from the container pick
       and walk in the mode-correct direction (lighter in dark mode,
       darker in light mode) so they remain visible. Users can
       override the step via the ± controls below — honored by
       resolveBorderStep / resolveSeparatorStep. */
    var containerStep = t1.container;
    var borderStep    = resolveBorderStep(role.id, mode);
    var separatorStep = resolveSeparatorStep(role.id, mode);
    var borderHex     = stepHexByName(role.id, borderStep) || pairedContainerHex;
    var separatorHex  = stepHexByName(role.id, separatorStep) || pairedContainerHex;
    var borderOverridden    = !!t1.borderStep;
    var separatorOverridden = !!t1.separatorStep;
    var borderRatio    = contrastRatio(borderHex, pairedContainerHex);
    var separatorRatio = contrastRatio(separatorHex, pairedContainerHex);
    function surfaceGrade(r) { return r >= 3 ? "aa" : "fail"; }
    function pairBadge(j) {
      var cls = j.pass ? (j.grade === 'AAA' ? 'aaa' : 'aa') : 'fail';
      var txt = j.pass ? j.grade : 'Fail';
      return '<span class="ev2-pair-badge" data-grade="' + cls + '">'
        + (j.pass ? '\u2713 ' : '\u26A0 ') + txt + '</span>';
    }
    var pairedHTML = '<div class="ev2-pairs">'
      + '<div class="ev2-pairs-head">'
        + '<span class="ev2-pairs-title" data-tip="These slots are auto-derived from your fill / content / container picks. Change the underlying levers to adjust them.">Auto-derived from picks</span>'
        + '<span class="ev2-pairs-sub">On-pair text, borders and separators — always coherent with the levers above</span>'
      + '</div>'
      + '<div class="ev2-pairs-grid">'
        + '<div class="ev2-pair" data-wcag-grade="' + (pairOnCompJudge.pass ? (pairOnCompJudge.grade === "AAA" ? "aaa" : "aa") : "fail") + '">'
          + '<div class="ev2-pair-label">on-component</div>'
          + '<div class="ev2-pair-swatch" style="background:' + pairedFillHex + ';color:' + pairOnComp + '">Aa</div>'
          + '<div class="ev2-pair-meta">'
            + '<span class="ev2-pair-pick">' + pairOnCompName + ' on fill</span>'
            + '<span class="ev2-pair-ratio"><strong>' + pairOnCompRatio.toFixed(2) + ':1</strong> <em class="ev2-pair-vs" data-tip="This ratio is measured against the component-bg fill (your fill pick).">vs ' + role.id + '-component-bg</em></span>'
            + pairBadge(pairOnCompJudge)
          + '</div>'
        + '</div>'
        + '<div class="ev2-pair" data-wcag-grade="' + (pairOnContJudge.pass ? (pairOnContJudge.grade === "AAA" ? "aaa" : "aa") : "fail") + '">'
          + '<div class="ev2-pair-label">on-container</div>'
          + '<div class="ev2-pair-swatch" style="background:' + pairedContainerHex + ';color:' + pairOnCont + '">Aa</div>'
          + '<div class="ev2-pair-meta">'
            + (function () {
                /* Find which ladder step corresponds to the auto-derived
                   on-container hex, then surface a fallback note when it
                   differs from the user's content pick. Keeps the auto-
                   derived card honest about the silent step-walk. */
                var s = ALL_STEPS, h = pairOnCont, derivedStep = '?';
                for (var i = 0; i < s.length; i++) {
                  if ((stepHexByName(role.id, s[i]) || '').toLowerCase() === h.toLowerCase()) { derivedStep = s[i]; break; }
                }
                var walked = derivedStep !== t1.content;
                var pick = walked
                  ? 'step ' + derivedStep + ' on container <em class="ev2-pair-fallback" data-tip="Your content pick (step ' + t1.content + ') doesn\'t pass AA on this container, so the on-container token auto-walked to step ' + derivedStep + '.">· fallback from step ' + t1.content + '</em>'
                  : 'step ' + derivedStep + ' on container';
                return '<span class="ev2-pair-pick">' + pick + '</span>';
              })()
            + '<span class="ev2-pair-ratio"><strong>' + pairOnContRatio.toFixed(2) + ':1</strong> <em class="ev2-pair-vs" data-tip="This ratio is measured against the container background (your container pick).">vs ' + role.id + '-container-bg</em></span>'
            + pairBadge(pairOnContJudge)
          + '</div>'
        + '</div>'
        + '<div class="ev2-pair" data-kind="surface" data-wcag-grade="' + surfaceGrade(borderRatio) + '">'
          + '<div class="ev2-pair-label">border</div>'
          + '<div class="ev2-pair-swatch" style="background:' + pairedContainerHex + ';border:2px solid ' + borderHex + ';color:transparent">—</div>'
          + '<div class="ev2-pair-meta">'
            + '<span class="ev2-pair-pick">step ' + borderStep + ' on container'
              + (borderOverridden ? ' <em class="ev2-pair-fallback" data-tip="You overrode the auto-derived step. Click Reset to return to the default.">· custom</em>' : '')
            + '</span>'
            + '<span class="ev2-pair-ratio"><strong>' + borderRatio.toFixed(2) + ':1</strong> <em class="ev2-pair-vs" data-tip="Border step is measured against the container background. Aim for at least 3:1 for visible separation.">vs ' + role.id + '-container-bg</em></span>'
          + '</div>'
          + '<div class="ev2-pair-stepper" role="group" aria-label="Border step">'
            + '<button type="button" data-step-walk="border" data-dir="-1" data-tip="Walk one step lighter">\u2212</button>'
            + '<button type="button" data-step-walk="border" data-dir="1"  data-tip="Walk one step darker">+</button>'
            + (borderOverridden ? '<button type="button" data-step-reset="border" data-tip="Reset to mode default">\u21BA</button>' : '')
          + '</div>'
        + '</div>'
        + '<div class="ev2-pair" data-kind="surface" data-wcag-grade="info">'
          + '<div class="ev2-pair-label">separator</div>'
          + '<div class="ev2-pair-swatch" style="background:' + pairedContainerHex + ';color:transparent;position:relative"><span style="position:absolute;left:6px;right:6px;top:50%;height:2px;background:' + separatorHex + ';transform:translateY(-50%);display:block"></span>—</div>'
          + '<div class="ev2-pair-meta">'
            + '<span class="ev2-pair-pick">step ' + separatorStep + ' on container'
              + (separatorOverridden ? ' <em class="ev2-pair-fallback" data-tip="You overrode the auto-derived step. Click Reset to return to the default.">· custom</em>' : '')
            + '</span>'
            + '<span class="ev2-pair-ratio"><strong>' + separatorRatio.toFixed(2) + ':1</strong> <em class="ev2-pair-vs" data-tip="Separator step is measured against the container background. Informational only.">vs ' + role.id + '-container-bg</em></span>'
          + '</div>'
          + '<div class="ev2-pair-stepper" role="group" aria-label="Separator step">'
            + '<button type="button" data-step-walk="separator" data-dir="-1" data-tip="Walk one step lighter">\u2212</button>'
            + '<button type="button" data-step-walk="separator" data-dir="1"  data-tip="Walk one step darker">+</button>'
            + (separatorOverridden ? '<button type="button" data-step-reset="separator" data-tip="Reset to mode default">\u21BA</button>' : '')
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>';
    return { wcagHTML: wcagHTML, pairedHTML: pairedHTML };
  }

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

    /* Per-lever palette strip: 20 swatches (one per ladder step) act
       as the picker. The currently-picked step gets the brand ring,
       AA-failing steps get a dimmed mark, and clicking commits. */
    var leversHTML = T1_LEVERS.map(function (lever) {
      var current = t1[lever.id];
      var curHex  = ladder[current] || '#000';
      // Header WCAG read-out for the current pick
      var hJudge = DTFSolver.judgeStepForLever(ladder, lever.id, current, t1, mode);
      var hCls   = hJudge.pass ? (hJudge.grade === 'AAA' ? 'aaa' : 'aa') : 'fail';
      var hTxt   = hJudge.pass ? hJudge.grade : 'Fail';
      var swatchesHTML = ALL_STEPS.map(function (step) {
        var hex = ladder[step] || '#000';
        var isSel = step === current;
        var j = DTFSolver.judgeStepForLever(ladder, lever.id, step, t1, mode);
        var pass = j.pass ? 'true' : 'false';
        var tip  = 'Step ' + step + ' \u2014 ' + hex.toUpperCase()
                 + ' \u00b7 ' + j.ratio.toFixed(2) + ':1 (' + (j.pass ? j.grade : 'Fail') + ')';
        return '<button type="button" class="ev2-pal-sw" '
             + 'role="radio" aria-checked="' + isSel + '" '
             + 'data-t1-lever="' + lever.id + '" data-step="' + step + '" '
             + 'data-pass="' + pass + '" '
             + 'style="background:' + hex + '" '
             + 'data-tip="' + tip + '" '
             + 'aria-label="Step ' + step + ', ' + (j.pass ? j.grade : 'fails AA') + '">'
             + '<span class="ev2-pal-sw-step" aria-hidden="true">' + step + '</span>'
             + '</button>';
      }).join('');
      return '<div class="ev2-lever-block" data-lever="' + lever.id + '">'
        + '<div class="ev2-lever-head">'
          + '<span class="ev2-lever-title">' + lever.label + '</span>'
          + '<span class="ev2-lever-sub">' + lever.sub + '</span>'
          + '<span class="ev2-lever-step" aria-live="polite">'
            + '<span class="ev2-lever-step-chip" style="background:' + curHex + '" aria-hidden="true"></span>'
            + 'Step <strong>' + current + '</strong>'
            + ' \u00b7 ' + hJudge.ratio.toFixed(2) + ':1'
            + ' <span class="ev2-seg-wcag" data-grade="' + hCls + '" aria-hidden="true">'
            + (hJudge.pass ? '\u2713 ' : '\u26A0 ') + hTxt + '</span>'
          + '</span>'
        + '</div>'
        + '<div class="ev2-pal" role="radiogroup" aria-label="' + lever.label + ' \u2014 pick a step">'
          + swatchesHTML
        + '</div>'
      + '</div>';
    }).join('');

    /* Contrast summary + auto-derived 2\u00d72 (on-comp, on-cont, border, separator). */
    var _wp = renderWcagPairsHTML(role, mode);
    var wcagHTML = _wp.wcagHTML;
    var pairedHTML = _wp.pairedHTML;

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
          + wcagHTML
          + '<div class="ev2-levers">' + leversHTML + '</div>'
          + pairedHTML
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
    document.querySelectorAll('.ev2-lever-block').forEach(function (block) {
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
    document.querySelectorAll('[data-t1-lever]').forEach(function (b) {
      b.addEventListener('click', function () {
        var lever = b.getAttribute('data-t1-lever');
        var step  = b.getAttribute('data-step');
        if (!step) return;
        t1For(State.activeRole)[lever] = step;
        pushPreview();
        refreshChangeBar();
        scheduleAutosave();
        renderT1();
        // Highlight + scroll matching preview section into view
        focusPreview(lever, true);
      });
    });
  }

  /* Delegated handler for the Snap-to-AA button. Bound once at
     module init so it survives re-renders. */
  document.addEventListener('click', function (e) {
    var fix = e.target && e.target.closest && e.target.closest('#ev2WcagAutoFix');
    if (!fix) return;
    autoFixT1ToAA(State.activeRole);
    pushPreview();
    refreshChangeBar();
    scheduleAutosave();
    renderT1();
  });

  /* Delegated handlers for the border / separator step controls.
     Lets the user walk the auto-derived step or reset to the
     mode-default direction. Persisted in t1[mode][roleId]. */
  document.addEventListener('click', function (e) {
    var walk  = e.target && e.target.closest && e.target.closest('[data-step-walk]');
    var reset = e.target && e.target.closest && e.target.closest('[data-step-reset]');
    if (!walk && !reset) return;
    var key   = (walk || reset).getAttribute(walk ? 'data-step-walk' : 'data-step-reset');
    var which = key === 'border' ? 'borderStep' : 'separatorStep';
    var t = t1For(State.activeRole);
    if (reset) {
      delete t[which];
    } else {
      var current = which === 'borderStep'
        ? resolveBorderStep(State.activeRole, State.editingMode)
        : resolveSeparatorStep(State.activeRole, State.editingMode);
      var dir = parseInt(walk.getAttribute('data-dir'), 10) || 1;
      var next = stepRel(current, dir);
      if (next === current) return; // clamped at edge
      t[which] = next;
    }
    pushPreview();
    refreshChangeBar();
    scheduleAutosave();
    renderT1();
  });

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
    State.cachedSteps = {};
    _neutralStepsCache = null;
    clearDraftFromStorage();
    pushPreview();
    renderActiveTier();
    refreshChangeBar();
    refreshDraftStatus('idle');
    if (window.ev2Toast) window.ev2Toast('Reverted all changes', 'ok');
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
    // Property Card expand/collapse toggle (the swatch is the affordance).
    var toggleBtn = e.target.closest && e.target.closest('[data-pc-toggle]');
    if (toggleBtn) {
      var tcard = toggleBtn.closest('.ev2-pc');
      if (!tcard) return;
      var key = tcard.getAttribute('data-pc-surface') + '/' + tcard.getAttribute('data-pc-prop');
      __expandedT2 = (__expandedT2 === key) ? null : key;
      renderT2();
      return;
    }
    // Picked a step from the inline ladder — same write path as the
    // ± stepper. setT2Step's auto-default-drop logic keeps the
    // override map minimal if the user re-picks the default step.
    var pickBtn = e.target.closest && e.target.closest('[data-pc-ladder-pick]');
    if (pickBtn) {
      var pcard = pickBtn.closest('.ev2-pc');
      if (!pcard) return;
      var picked = pickBtn.getAttribute('data-pc-ladder-pick');
      setT2Step(
        pcard.getAttribute('data-pc-surface'),
        pcard.getAttribute('data-pc-prop'),
        State.editingMode,
        picked
      );
      return;
    }
    var stepBtn = e.target.closest && e.target.closest('[data-pc-step]');
    if (stepBtn) {
      var card = stepBtn.closest('.ev2-pc');
      if (!card) return;
      var surfaceId = card.getAttribute('data-pc-surface');
      var propId    = card.getAttribute('data-pc-prop');
      if (!surfaceId || !propId) return;
      var delta = parseInt(stepBtn.getAttribute('data-pc-step'), 10) || 0;
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
      clearT2Override(
        card2.getAttribute('data-pc-surface'),
        card2.getAttribute('data-pc-prop'),
        State.editingMode
      );
    }
  });

  /* ── Deploy summary dialog ─────────────────────────────
     Opens on Deploy click. Lists every change the user is about to
     ship to Figma, grouped by tier, with old → new diffs. Lets the
     user verify before committing — prevents wrong-anchor accidents. */
  function buildDeploySummary() {
    var sections = [];
    var totalChanges = 0;

    // T0 — palette anchor changes
    var t0Changes = [];
    ROLES.forEach(function (r) {
      if (!isChanged(r.id)) return;
      t0Changes.push({
        role: r,
        from: State.baseline[r.id].toUpperCase(),
        to:   State.proposed[r.id].toUpperCase()
      });
    });
    if (t0Changes.length) {
      totalChanges += t0Changes.length;
      sections.push({
        tier: 'T0',
        title: 'Palette anchors',
        sub: 'Foundation colors. Cascades to roles, surfaces, and components.',
        rows: t0Changes.map(function (c) {
          return '<div class="ev2-deploy-row">'
            + '<span class="ev2-deploy-row-dot" style="background:' + c.to + '"></span>'
            + '<span class="ev2-deploy-row-label">' + c.role.label + ' anchor</span>'
            + '<span class="ev2-deploy-row-diff">'
              + '<code class="ev2-deploy-from">' + c.from + '</code>'
              + '<span class="ev2-deploy-arrow">\u2192</span>'
              + '<code class="ev2-deploy-to" style="background:' + c.to + ';color:' + textOnHex(c.to) + '">' + c.to + '</code>'
            + '</span>'
          + '</div>';
        }).join('')
      });
    }

    // T1 — per-role per-mode step changes
    ['light','dark'].forEach(function (mode) {
      var rows = [];
      ROLES.forEach(function (r) {
        if (!isT1ChangedInMode(r.id, mode)) return;
        var t = State.t1[mode][r.id];
        var def = defaultT1ForRole(r.id, mode);
        var deltas = [];
        if (t.fill !== def.fill)           deltas.push('Fill step <em>'      + def.fill      + '</em> \u2192 <em>' + t.fill      + '</em>');
        if (t.content !== def.content)     deltas.push('Content step <em>'   + def.content   + '</em> \u2192 <em>' + t.content   + '</em>');
        if (t.container !== def.container) deltas.push('Container step <em>' + def.container + '</em> \u2192 <em>' + t.container + '</em>');
        if (!deltas.length) return;
        var swatchHex = stepHexByName(r.id, t.fill) || State.proposed[r.id];
        rows.push('<div class="ev2-deploy-row">'
          + '<span class="ev2-deploy-row-dot" style="background:' + swatchHex + '"></span>'
          + '<span class="ev2-deploy-row-label">' + r.label + '</span>'
          + '<span class="ev2-deploy-row-diff">' + deltas.join(' \u00b7 ') + '</span>'
        + '</div>');
        totalChanges += 1;
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

    return { sections: sections, total: totalChanges };
  }

  // Quick contrast picker for the diff swatch label
  function textOnHex(hex) {
    return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#000000') ? '#FFFFFF' : '#000000';
  }

  function openDeployDialog() {
    var dlg = document.getElementById('ev2DeployDialog');
    if (!dlg) return;
    var summary = buildDeploySummary();
    var body = document.getElementById('ev2DeployBody');
    var meta = document.getElementById('ev2DeployMeta');
    var hint = document.getElementById('ev2DeployHint');
    var sub  = document.getElementById('ev2DeploySub');

    var projId = (typeof getActiveProjectId === 'function' && getActiveProjectId()) || '';
    var projLabel = projId ? projectName(projId) : 'No project (defaults)';
    meta.innerHTML = '<span class="ev2-deploy-meta-row"><span class="ev2-deploy-meta-k">Project</span><span class="ev2-deploy-meta-v">' + projLabel + '</span></span>'
      + '<span class="ev2-deploy-meta-row"><span class="ev2-deploy-meta-k">Editing mode</span><span class="ev2-deploy-meta-v">' + (State.editingMode === 'dark' ? 'Dark' : 'Light') + '</span></span>'
      + '<span class="ev2-deploy-meta-row"><span class="ev2-deploy-meta-k">Total changes</span><span class="ev2-deploy-meta-v ev2-deploy-meta-total">' + summary.total + '</span></span>';

    if (summary.total === 0) {
      body.innerHTML = '<div class="ev2-deploy-empty">No changes to deploy. Make some edits first.</div>';
      hint.textContent = 'Nothing to deploy.';
      document.getElementById('ev2DeployConfirm').disabled = true;
    } else {
      body.innerHTML = summary.sections.map(function (s) {
        return '<section class="ev2-deploy-section">'
          + '<header class="ev2-deploy-section-head">'
            + '<span class="ev2-deploy-section-tag">' + s.tier + '</span>'
            + '<div><div class="ev2-deploy-section-title">' + s.title + '</div>'
            + '<div class="ev2-deploy-section-sub">' + s.sub + '</div></div>'
          + '</header>'
          + '<div class="ev2-deploy-rows">' + s.rows + '</div>'
        + '</section>';
      }).join('');
      hint.innerHTML = 'After deploy, every consumer of these tokens (other Figma files, Storybook, your apps) will see the new values within seconds.';
      document.getElementById('ev2DeployConfirm').disabled = false;
    }
    sub.textContent = 'Review every change before pushing to Figma. Deploys are tracked but cannot be undone in-place.';
    dlg.hidden = false;
    document.body.classList.add('ev2-modal-open');
  }
  function closeDeployDialog() {
    var dlg = document.getElementById('ev2DeployDialog');
    if (dlg) { dlg.hidden = true; }
    document.body.classList.remove('ev2-modal-open');
  }

  if ($deploy) {
    $deploy.addEventListener('click', function () {
      if ($deploy.disabled) return;
      openDeployDialog();
    });
  }
  document.querySelectorAll('[data-deploy-dismiss]').forEach(function (el) {
    el.addEventListener('click', closeDeployDialog);
  });
  var deployConfirmBtn = document.getElementById('ev2DeployConfirm');
  if (deployConfirmBtn) {
    deployConfirmBtn.addEventListener('click', function () {
      // Hook for the actual deploy call — wired to the sync server
      // by the project widget when a project is active. For now,
      // close the dialog and surface a toast so the flow is end-to-end
      // testable without a live server.
      closeDeployDialog();
      if (window.ev2Toast) window.ev2Toast('Deploy queued (server integration TBD)', 'ok');
    });
  }

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
    toastEl.textContent = msg;
    toastEl.setAttribute('data-kind', kind || 'ok');
    toastEl.setAttribute('data-show', '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.removeAttribute('data-show'); }, 2400);
  };

  function boot() {
    if (!window.PaletteEngine) { setTimeout(boot, 30); return; }
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

  function getActiveProjectId() {
    return localStorage.getItem('dtf-active-project') || '';
  }
  function getKnownProjects() {
    try { return JSON.parse(localStorage.getItem('dtf-known-projects') || '[]') || []; }
    catch (e) { return []; }
  }
  function projectName(id) {
    var list = getKnownProjects();
    var hit = list.find(function (p) { return p && p.id === id; });
    return (hit && (hit.name || hit.id)) || id || 'No project';
  }

  function initProjectWidget() {
    syncProjLabel();
    renderProjPanel();

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
  }

  function syncProjLabel() {
    $projName.textContent = projectName(getActiveProjectId());
  }

  function renderProjPanel() {
    var list = getKnownProjects();
    var active = getActiveProjectId();
    if (!list.length) {
      $projPanel.innerHTML = '<div class="ev2-proj-empty">No projects yet.<br><a href="../onboard.html" style="color:var(--brand-content-default,#286CE5)">Create one</a></div>';
      return;
    }
    $projPanel.innerHTML = list.map(function (p) {
      var current = p.id === active;
      return '<button class="ev2-proj-row" role="option" aria-current="' + current + '" data-proj-id="' + p.id + '">'
        + '<span class="ev2-proj-row-name">' + (p.name || p.id) + '</span>'
        + '<span class="ev2-proj-row-id">' + p.id + '</span>'
        + (current
            ? '<svg class="ev2-proj-row-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.5 3.5L13 5"/></svg>'
            : '')
        + '</button>';
    }).join('');

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
  var $modalCancel  = $modal.querySelector('[data-modal-action="cancel"]');
  var modalOnConfirm = null;

  function openModal(opts) {
    $modalTitle.textContent = opts.title || 'Confirm';
    $modalBody.textContent = opts.body || '';
    $modalConfirm.textContent = opts.confirmLabel || 'Confirm';
    $modalCancel.textContent = opts.cancelLabel || 'Cancel';
    $modalConfirm.classList.toggle('ev2-modal-btn-danger', opts.kind === 'danger');
    $modalConfirm.classList.toggle('ev2-modal-btn-primary', opts.kind !== 'danger');
    modalOnConfirm = opts.onConfirm || null;
    $modal.removeAttribute('hidden');
    setTimeout(function () { $modalConfirm.focus(); }, 10);
  }
  function closeModal() {
    $modal.setAttribute('hidden', '');
    modalOnConfirm = null;
  }
  $modalConfirm.addEventListener('click', function () {
    var fn = modalOnConfirm;
    closeModal();
    if (fn) fn();
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
})();
