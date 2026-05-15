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
     Each role has 3 "smart" levers. Each lever picks a palette
     step that becomes the anchor of a slot family. Other slots
     in the family derive by index-stepping along the ladder.   */
  var ALL_STEPS = ['25','50','75','100','150','175','200','250','300','350','400','450','500','550','600','700','750','800','850','900'];
  function stepRel(name, delta) {
    var i = ALL_STEPS.indexOf(name); if (i < 0) return name;
    i = Math.max(0, Math.min(ALL_STEPS.length - 1, i + delta));
    return ALL_STEPS[i];
  }
  // Per-spread, per-mode preset maps. Dark mode inverts the relationship:
  // Subtle = recommended/safe defaults (all picks pass WCAG AA for the
  // intended pairing). Distinct = opt-in wider range that exposes more
  // expressive picks — some may fail AA; the badges + warning surface that.
  var T1_PRESETS_BY_SPREAD = {
    subtle: {
      light: {
        fill:      { soft: '500', standard: '550', bold: '600' },
        content:   { subtle: '500', standard: '550', strong: '600' },
        container: { whisper: '50',  light: '75',  tinted: '100' }
      },
      dark: {
        // Dark-mode aesthetic: lift fills to luminous mid-tones (the
        // saturated-on-near-black "bruise" look is replaced with a
        // softer glow). Soften content one step (cream-white instead
        // of bone-white reduces eye strain) while keeping containers
        // at the deep desaturated end of the ladder so alert
        // backgrounds read as tinted dark surfaces, not saturated
        // blocks. Auto-pair flips on-component to black for the
        // brighter fills where white loses contrast.
        fill:      { soft: '400', standard: '450', bold: '500' },
        content:   { subtle: '250', standard: '200', strong: '150' },
        container: { whisper: '900', light: '850', tinted: '800' }
      }
    },
    bold: {
      light: {
        fill:      { soft: '400', standard: '500', bold: '700' },
        content:   { subtle: '400', standard: '550', strong: '700' },
        container: { whisper: '25',  light: '75',  tinted: '150' }
      },
      dark: {
        fill:      { soft: '350', standard: '450', bold: '550' },
        content:   { subtle: '300', standard: '200', strong: '100' },
        container: { whisper: '900', light: '850', tinted: '800' }
      }
    }
  };
  var SPREAD_OPTIONS = [
    { id: 'subtle', label: 'Subtle',  sub: '1-step interval' },
    { id: 'bold',   label: 'Distinct', sub: '2-step interval' }
  ];

  /* Per-role preset overrides — some hues' step ladders don't sit in the
     same WCAG / luminance band as brand. We override only the steps that
     need it so every role ships with AA-pass defaults AND alert
     containers across roles look like one cohesive family.

     Verified math (Subtle, light mode):
       brand:   fill 550 vs white = 5.80; content 550 vs container 75 = 4.5+
       danger:  fill 550 vs white = 5.86; content 550 vs container 75 = 4.5+
       warning: fill 550 vs white = 5.42; content 550 vs container 75 = 4.5+
       success: needs fill 600 (4.32 -> 6.07) AND container 50 (cohesive with
                Light by being one notch up to clear text-on-container)
       info:    needs container 50 — content 550 vs 75 falls at 4.44 (just
                under AA); 50 lifts it cleanly above 4.5 */
  var T1_PRESET_OVERRIDES = {
    success: {
      subtle: {
        light: {
          fill:    { soft: '550', standard: '600', bold: '700' },
          content: { subtle: '600', standard: '700', strong: '750' },
          container: { whisper: '25', light: '50', tinted: '75' }
        },
        dark: {
          // Lift success greens off near-black for the same reason as base —
          // step 600 was visually heavy. 450/500/550 reads as a clear
          // luminous green pill on dark.
          fill: { soft: '450', standard: '500', bold: '550' }
        }
      },
      bold: {
        light: {
          fill:    { soft: '500', standard: '600', bold: '750' },
          content: { subtle: '550', standard: '700', strong: '800' },
          container: { whisper: '25', light: '50', tinted: '100' }
        },
        dark: { fill: { soft: '400', standard: '500', bold: '600' } }
      }
    },
    warning: {
      subtle: {
        light: {
          fill:    { soft: '550', standard: '600', bold: '700' },
          // Warning amber is the worst hue for AA on white — even step 600
          // amber sits around 3.5:1. Push content to the dark-amber band
          // (700+) so every default pick AA-passes both on page and on
          // the warning container. Order kept monotonic.
          content: { subtle: '700', standard: '750', strong: '800' }
        },
        // Warning's amber needs to stay on the darker side in dark mode
        // (lighter amber → near-yellow, loses warning semantic). Keep
        // close to the base lift (450/500/550) but shifted one cooler.
        dark:  { fill: { soft: '500', standard: '550', bold: '600' } }
      },
      bold: {
        light: {
          fill:    { soft: '500', standard: '600', bold: '750' },
          content: { subtle: '600', standard: '750', strong: '850' }
        }
      }
    },
    info: {
      subtle: {
        light: { container: { whisper: '25', light: '50', tinted: '75' } }
      }
    }
  };

  function presetsFor(roleId, mode) {
    mode = mode || State.editingMode;
    var s = (State.t1[mode][roleId] && State.t1[mode][roleId].spread) || T1_DEFAULT.spread;
    var family = T1_PRESETS_BY_SPREAD[s] || T1_PRESETS_BY_SPREAD.subtle;
    var base = family[mode] || family.light;
    var ov = T1_PRESET_OVERRIDES[roleId] && T1_PRESET_OVERRIDES[roleId][s] && T1_PRESET_OVERRIDES[roleId][s][mode];
    if (!ov) return base;
    // Merge override layer onto base (non-destructive)
    return {
      fill:      Object.assign({}, base.fill,      ov.fill      || {}),
      content:   Object.assign({}, base.content,   ov.content   || {}),
      container: Object.assign({}, base.container, ov.container || {})
    };
  }
  function t1For(roleId, mode) { return State.t1[mode || State.editingMode][roleId]; }
  var T1_DEFAULT = { fill: 'standard', content: 'standard', container: 'light', spread: 'subtle' };
  var T1_LEVERS = [
    { id: 'fill', label: 'Fill emphasis', sub: 'Solid component backgrounds (buttons, badges, fills)',
      options: [
        { id: 'soft',     label: 'Soft',     hint: 'Gentler, less assertive' },
        { id: 'standard', label: 'Standard', hint: 'Recommended default' },
        { id: 'bold',     label: 'Bold',     hint: 'Heavier, more presence' }
      ]
    },
    { id: 'content', label: 'Content weight', sub: 'Text and icons rendered in this color',
      options: [
        { id: 'subtle',   label: 'Subtle',   hint: 'Lighter on white' },
        { id: 'standard', label: 'Standard', hint: 'Comfortable everywhere' },
        { id: 'strong',   label: 'Strong',   hint: 'High contrast' }
      ]
    },
    { id: 'container', label: 'Container softness', sub: 'Soft tinted surfaces (alert bg, banners)',
      options: [
        { id: 'whisper',  label: 'Whisper',  hint: 'Barely tinted' },
        { id: 'light',    label: 'Light',    hint: 'Gentle wash' },
        { id: 'tinted',   label: 'Tinted',   hint: 'Clearly colored' }
      ]
    }
  ];

  function defaultT1() { return { fill:'standard', content:'standard', container:'light', spread:'subtle' }; }
  var State = {
    activeTier: 't0',
    activeRole: 'brand',
    editingMode:'light',
    anchor:     'exact',
    baseline:   {},
    proposed:   {},
    cachedSteps:{},
    // T1 lever state per editing mode. Light and dark each get their
    // own snapshot so users can dial in different step picks per mode.
    t1: {
      light: {
        brand:   defaultT1(), danger:  defaultT1(), success: defaultT1(),
        warning: defaultT1(), info:    defaultT1()
      },
      dark: {
        brand:   defaultT1(), danger:  defaultT1(), success: defaultT1(),
        warning: defaultT1(), info:    defaultT1()
      }
    },
    // Snapshot of t1 picks AFTER boot-time auto-AA-fix. This is the
    // "clean" baseline the change counter and Discard compare against,
    // so a Discard that re-applies auto-fix doesn't count its own
    // legitimate AA shifts as user changes.
    t1Baseline: {
      light: {
        brand:   defaultT1(), danger:  defaultT1(), success: defaultT1(),
        warning: defaultT1(), info:    defaultT1()
      },
      dark: {
        brand:   defaultT1(), danger:  defaultT1(), success: defaultT1(),
        warning: defaultT1(), info:    defaultT1()
      }
    },
    // Disclosure open-state persists across role / tier swaps.
    // Keyed by 'tierId:discId' so each tier can have its own pattern.
    disclosure: { 't0:steps': false, 't0:affects': false, 't1:slots': false, 't1:affects': false },
    focusedLever: null,
    lastSavedAt: null
  };

  var DRAFT_KEY = 'dtf-editor-v2-draft-v1';
  var UI_KEY    = 'dtf-editor-v2-ui-v1';

  /* ── UI state persistence (separate from draft — it survives Discard) ── */
  function saveUIState() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({
        v: 1,
        activeTier: State.activeTier,
        activeRole: State.activeRole,
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

  function isChanged(roleId) {
    return State.proposed[roleId].toUpperCase() !== State.baseline[roleId].toUpperCase();
  }
  function isT1ChangedInMode(roleId, mode) {
    var t = State.t1[mode][roleId];
    var b = (State.t1Baseline && State.t1Baseline[mode] && State.t1Baseline[mode][roleId]) || T1_DEFAULT;
    return t.fill !== b.fill || t.content !== b.content ||
           t.container !== b.container || (t.spread || T1_DEFAULT.spread) !== (b.spread || T1_DEFAULT.spread);
  }
  function isT1Changed(roleId) {
    return isT1ChangedInMode(roleId, 'light') || isT1ChangedInMode(roleId, 'dark');
  }
  function isRoleDirty(roleId) { return isChanged(roleId) || isT1Changed(roleId); }

  /* Diff every lever in both modes — returns
     [{mode, lever, fromId, toId}, ...]. Used to populate the
     per-role badge tooltip and the per-role count. */
  function summarizeRoleChanges(roleId) {
    var diffs = [];
    ['light','dark'].forEach(function (mode) {
      var t = State.t1[mode][roleId];
      var b = (State.t1Baseline && State.t1Baseline[mode] && State.t1Baseline[mode][roleId]) || T1_DEFAULT;
      ['fill','content','container','spread'].forEach(function (lever) {
        var cur = t[lever] || (lever === 'spread' ? T1_DEFAULT.spread : null);
        var base = b[lever] || (lever === 'spread' ? T1_DEFAULT.spread : null);
        if (cur !== base) diffs.push({ mode: mode, lever: lever, fromId: base, toId: cur });
      });
    });
    return diffs;
  }
  function badgeTipFor(roleId) {
    var diffs = summarizeRoleChanges(roleId);
    if (!diffs.length) return '';
    var labels = { fill:'Fill', content:'Content', container:'Container', spread:'Spread' };
    return diffs.map(function (d) {
      var modeLabel = d.mode === 'dark' ? 'Dark' : 'Light';
      return modeLabel + ' · ' + labels[d.lever] + ': ' + d.fromId + ' → ' + d.toId;
    }).join('   •   ');
  }
  function totalChanges() {
    return ROLES.reduce(function (n, r) { return n + (isRoleDirty(r.id) ? 1 : 0); }, 0);
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
    var P = presetsFor(roleId, mode || State.editingMode);
    var fillHex = stepHexByName(roleId, P.fill[t.fill]) || '#000';
    return DTFSolver.deriveOnComponent(fillHex);
  }
  // Auto-pair: pick the ladder step (closest to the user's chosen
  // content-default) that passes AA against the active container.
  function onContainerColor(roleId, mode) {
    mode = mode || State.editingMode;
    var t = State.t1[mode][roleId];
    var P = presetsFor(roleId, mode);
    var ladder = ladderFor(roleId);
    var containerHex = ladder[P.container[t.container]] || surfaceBgFor(mode);
    return DTFSolver.deriveOnContainer(ladder, P.content[t.content], containerHex).hex;
  }

  /* Aggregate contrast for the 3 currently-picked levers of a role */
  function computeRoleContrast(roleId, mode) {
    mode = mode || State.editingMode;
    var t = State.t1[mode][roleId];
    var P = presetsFor(roleId, mode);
    var ev = DTFSolver.evaluate(ladderFor(roleId), t, P, mode);
    return { checks: ev.checks, onComp: ev.onComp, onCont: ev.onCont };
  }

  /* Walk to the nearest in-options pick that satisfies AA for each lever.
     Delegates to DTFSolver.autoFix; this shim writes back into State.t1
     so existing call sites that rely on side-effects keep working. */
  function autoFixT1ToAA(roleId) {
    var mode = State.editingMode;
    var t = State.t1[mode][roleId];
    var P = presetsFor(roleId, mode);
    var newPicks = DTFSolver.autoFix(ladderFor(roleId), t, P, mode, T1_LEVERS);
    t.fill      = newPicks.fill;
    t.content   = newPicks.content;
    t.container = newPicks.container;
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
    var P = presetsFor(roleId, mode);
    var fillStep      = P.fill[t.fill];
    var contentStep   = P.content[t.content];
    var containerStep = P.container[t.container];
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
    lines.push('  --' + p + '-container-bg: '       + get(containerStep) + ';');
    lines.push('  --' + p + '-container-hover: '    + get(stepRel(containerStep, 1)) + ';');
    lines.push('  --' + p + '-container-pressed: '  + get(stepRel(containerStep, 2)) + ';');
    lines.push('  --' + p + '-container-outline: ' + get(stepRel(containerStep, 6)) + ';');
    lines.push('  --' + p + '-container-separator: ' + get(stepRel(containerStep, 2)) + ';');
    lines.push('  --' + p + '-component-separator: ' + get(stepRel(fillStep, -4)) + ';');
    lines.push('  --' + p + '-on-container: ' + onContainerColor(roleId, mode) + ';');
    return lines;
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
    rootLines.push('}');
    // Dark-mode semantic slots live under [data-theme="dark"].
    var darkLines = ['[data-theme="dark"] {'];
    ROLES.forEach(function (r) {
      semanticVarsFor(r.id, 'dark').forEach(function (l) { darkLines.push(l); });
    });
    darkLines.push('}');
    win.postMessage({ type: 'ev2-overrides', css: rootLines.concat(darkLines).join('\n') }, '*');
    // Tell the preview which role is currently being edited so the
    // contextual cards (Text card, Spotlight alert) reflect that role
    // instead of always showing brand.
    try {
      win.postMessage({ type: 'ev2-active-role', role: State.activeRole }, '*');
    } catch (e) {}
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
    }
    return n;
  }

  function refreshSectionResetBtn() {
    var btn = document.getElementById('sectionResetBtn');
    if (!btn) return;
    var tier = State.activeTier;
    var supported = (tier === 't0' || tier === 't1');
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
          t1: State.t1
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
      function adoptT1(target, src, mode) {
        if (!src) return;
        var family = T1_PRESETS_BY_SPREAD[src.spread] || T1_PRESETS_BY_SPREAD.subtle;
        var P = family[mode] || family.light;
        if (P.fill[src.fill])           target.fill = src.fill;
        if (P.content[src.content])     target.content = src.content;
        if (P.container[src.container]) target.container = src.container;
        if (src.spread === 'subtle' || src.spread === 'bold') target.spread = src.spread;
      }
      ROLES.forEach(function (r) {
        if (d.proposed[r.id]) State.proposed[r.id] = d.proposed[r.id];
        if (!d.t1) return;
        if (d.t1.light || d.t1.dark) {
          adoptT1(State.t1.light[r.id], d.t1.light && d.t1.light[r.id], 'light');
          adoptT1(State.t1.dark[r.id],  d.t1.dark  && d.t1.dark[r.id],  'dark');
        } else if (d.t1[r.id]) {
          adoptT1(State.t1.light[r.id], d.t1[r.id], 'light');
          adoptT1(State.t1.dark[r.id],  d.t1[r.id], 'dark');
        }
      });
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
          + (changedThisRole ? '<span class="ev2-intent-changed">Changed</span>' : '')
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
      var pill = head.querySelector('.ev2-intent-changed');
      if (isChanged(role) && !pill) {
        head.insertAdjacentHTML('beforeend', '<span class="ev2-intent-changed">Changed</span>');
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

  /* ── T1 Roles ────────────────────────────────────────── */
  /* WCAG bar + auto-paired text panel for the current picks of a role/mode.
     Extracted so hover-preview can surgically rebuild just these two
     elements without re-rendering the whole T1 panel (which would tear
     down the radio button under the user's cursor). */
  function renderWcagPairsHTML(role, mode) {
    var t1 = State.t1[mode][role.id];
    var P = presetsFor(role.id, mode);
    var pageBg = surfaceBgFor(mode);
    var wcag = computeRoleContrast(role.id, mode);
    var failCount = wcag.checks.filter(function (c) { return !c.pass; }).length;
    /* Suppress the success bar entirely — per-option AA badges already
       confirm everything passes. Only surface the bar (with Auto-fix
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
        + '<button type="button" class="ev2-wcag-bar-info ev2-spread-link" data-tip="' + wcagDetails.replace(/"/g,'&quot;').replace(/\n/g,'\u2003') + '">Details</button>'
        + '<button type="button" class="ev2-wcag-bar-fix" id="ev2WcagAutoFix">Auto-fix to AA</button>'
      + '</div>';
    }

    var pairedFillHex = stepHexByName(role.id, P.fill[t1.fill]) || '#000';
    var pairedContainerHex = stepHexByName(role.id, P.container[t1.container]) || pageBg;
    var pairOnComp = wcag.onComp;
    var pairOnCont = wcag.onCont;
    var pairOnCompRatio = contrastRatio(pairOnComp, pairedFillHex);
    var pairOnContRatio = contrastRatio(pairOnCont, pairedContainerHex);
    var pairOnCompJudge = wcagJudge(pairOnCompRatio, false);
    var pairOnContJudge = wcagJudge(pairOnContRatio, false);
    var pairOnCompName  = pairOnComp.toUpperCase() === '#FFFFFF' ? 'White' : 'Black';
    /* Border + Separator are auto-derived from the container pick
       (see semanticVarsFor: container-outline = +6 steps, separator
       = +2 steps). Surface them inside the same card so designers
       see every axis accounted for without adding a new lever. */
    var containerStep = P.container[t1.container];
    var borderStep    = stepRel(containerStep, 6);
    var separatorStep = stepRel(containerStep, 2);
    var borderHex     = stepHexByName(role.id, borderStep) || pairedContainerHex;
    var separatorHex  = stepHexByName(role.id, separatorStep) || pairedContainerHex;
    function pairBadge(j) {
      var cls = j.pass ? (j.grade === 'AAA' ? 'aaa' : 'aa') : 'fail';
      var txt = j.pass ? j.grade : 'Fail';
      return '<span class="ev2-pair-badge" data-grade="' + cls + '">'
        + (j.pass ? '\u2713 ' : '\u26A0 ') + txt + '</span>';
    }
    var pairedHTML = '<div class="ev2-pairs" data-tip="These slots are auto-derived from your fill / content / container picks. Change the underlying levers to adjust them.">'
      + '<div class="ev2-pairs-head">'
        + '<span class="ev2-pairs-title">Auto-derived from picks</span>'
        + '<span class="ev2-pairs-sub">On-pair text, borders and separators — always coherent with the levers above</span>'
      + '</div>'
      + '<div class="ev2-pairs-grid">'
        + '<div class="ev2-pair">'
          + '<div class="ev2-pair-label">on-component</div>'
          + '<div class="ev2-pair-swatch" style="background:' + pairedFillHex + ';color:' + pairOnComp + '">Aa</div>'
          + '<div class="ev2-pair-meta">'
            + '<span class="ev2-pair-pick">' + pairOnCompName + ' on fill</span>'
            + '<span class="ev2-pair-ratio">' + pairOnCompRatio.toFixed(2) + ':1</span>'
            + pairBadge(pairOnCompJudge)
          + '</div>'
        + '</div>'
        + '<div class="ev2-pair">'
          + '<div class="ev2-pair-label">on-container</div>'
          + '<div class="ev2-pair-swatch" style="background:' + pairedContainerHex + ';color:' + pairOnCont + '">Aa</div>'
          + '<div class="ev2-pair-meta">'
            + '<span class="ev2-pair-pick">step ' + (function(){var s=ALL_STEPS,h=pairOnCont;for(var i=0;i<s.length;i++){if((stepHexByName(role.id,s[i])||'').toLowerCase()===h.toLowerCase())return s[i];}return '?';})() + ' on container</span>'
            + '<span class="ev2-pair-ratio">' + pairOnContRatio.toFixed(2) + ':1</span>'
            + pairBadge(pairOnContJudge)
          + '</div>'
        + '</div>'
        + '<div class="ev2-pair" data-kind="surface">'
          + '<div class="ev2-pair-label">border</div>'
          + '<div class="ev2-pair-swatch" style="background:' + pairedContainerHex + ';border:2px solid ' + borderHex + ';color:transparent">—</div>'
          + '<div class="ev2-pair-meta">'
            + '<span class="ev2-pair-pick">step ' + borderStep + ' on container</span>'
            + '<span class="ev2-pair-ratio">container-outline</span>'
          + '</div>'
        + '</div>'
        + '<div class="ev2-pair" data-kind="surface">'
          + '<div class="ev2-pair-label">separator</div>'
          + '<div class="ev2-pair-swatch" style="background:' + pairedContainerHex + ';color:transparent;position:relative"><span style="position:absolute;left:6px;right:6px;top:50%;height:2px;background:' + separatorHex + ';transform:translateY(-50%);display:block"></span>—</div>'
          + '<div class="ev2-pair-meta">'
            + '<span class="ev2-pair-pick">step ' + separatorStep + ' on container</span>'
            + '<span class="ev2-pair-ratio">container-separator</span>'
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
    var P = presetsFor(role.id);
    var pageBg = surfaceBgFor(mode);

    var leversHTML = T1_LEVERS.map(function (lever) {
      var current = t1[lever.id];
      var P = presetsFor(role.id);
      var pageBg = surfaceBgFor(mode);
      // Resolve the currently-selected content + container for cross-checks
      var curContentHex = stepHexByName(role.id, P.content[t1.content]) || '#000';
      var curContainerHex = stepHexByName(role.id, P.container[t1.container]) || pageBg;
      return '<div class="ev2-lever-block" data-lever="' + lever.id + '">'
        + '<div class="ev2-lever-head">'
          + '<span class="ev2-lever-title">' + lever.label + '</span>'
          + '<span class="ev2-lever-sub">' + lever.sub + '</span>'
        + '</div>'
        + '<div class="ev2-seg ev2-seg-' + lever.id + '" role="radiogroup" aria-label="' + lever.label + '">'
          + lever.options.map(function (opt) {
              var isSel = opt.id === current;
              var step  = P[lever.id][opt.id];
              var hex   = stepHexByName(role.id, step) || '#000';
              var preview = renderLeverPreview(lever.id, hex);
              // Per-lever WCAG check
              var judge, tipDetail;
              if (lever.id === 'fill') {
                // Use the smart on-component color (black/white whichever wins)
                // so the per-option badge agrees with what we actually emit.
                var rW = contrastRatio(hex, '#FFFFFF'), rB = contrastRatio(hex, '#0A0A0A');
                var onComp = rB > rW ? '#0A0A0A' : '#FFFFFF';
                var onCompName = rB > rW ? 'Black' : 'White';
                judge = wcagJudge(Math.max(rW, rB), false);
                tipDetail = onCompName + ' text on this fill: ' + judge.ratio.toFixed(2) + ':1';
              } else if (lever.id === 'content') {
                judge = wcagJudge(contrastRatio(hex, pageBg), false);
                tipDetail = 'Text on ' + (mode === 'dark' ? 'dark' : 'light') + ' page surface: ' + judge.ratio.toFixed(2) + ':1';
              } else { // container
                judge = wcagJudge(contrastRatio(curContentHex, hex), false);
                tipDetail = 'Selected content text on this container: ' + judge.ratio.toFixed(2) + ':1';
              }
              var badgeCls = judge.pass ? (judge.grade === 'AAA' ? 'aaa' : 'aa') : 'fail';
              var badgeTxt = judge.pass ? judge.grade : 'Fail';
              // Single combined tooltip on the button \u2014 badge has no own tip,
              // so the two never stack.
              var combinedTip = opt.hint + ' \u2014 WCAG ' + judge.grade + ' (' + judge.ratio.toFixed(2) + ':1, ' + tipDetail + ')';
              var badge = '<span class="ev2-seg-wcag" data-grade="' + badgeCls + '" aria-hidden="true">'
                + (judge.pass ? '\u2713 ' : '\u26A0 ') + badgeTxt
              + '</span>';
              return '<button class="ev2-seg-btn" role="radio" '
                + 'aria-checked="' + isSel + '" '
                + 'data-t1-lever="' + lever.id + '" data-t1-value="' + opt.id + '" '
                + 'data-tip="' + combinedTip + '">'
                + '<span class="ev2-seg-preview">' + preview + '</span>'
                + '<span class="ev2-seg-label">'
                  + '<span class="ev2-seg-name">' + opt.label + '</span>'
                  + '<span class="ev2-seg-step">step ' + step + '</span>'
                + '</span>'
                + badge
                + '</button>';
            }).join('')
        + '</div>'
      + '</div>';
    }).join('');

    var currentSpread = t1.spread || T1_DEFAULT.spread;
    var spreadOpt = SPREAD_OPTIONS.find(function (o) { return o.id === currentSpread; }) || SPREAD_OPTIONS[0];
    var spreadInfoTip = 'Step interval controls how far apart Soft, Standard and Bold sit on the palette ladder. Subtle = 1 step apart (gentle). Distinct = 2 steps apart (clearly different). Click Change to switch.';
    var spreadHTML = '<p class="ev2-spread-line">'
      + '<span class="ev2-spread-line-label">Step interval:</span> '
      + '<span class="ev2-spread-line-value">' + spreadOpt.label + ' \u00b7 ' + spreadOpt.sub + '</span> '
      + '<button type="button" class="ev2-spread-link" id="openSpreadDialog">Change</button>'
      + '<span class="ev2-spread-sep" aria-hidden="true">\u00b7</span>'
      + '<button type="button" class="ev2-spread-link ev2-spread-why" data-tip="' + spreadInfoTip + '" aria-label="' + spreadInfoTip + '">Why is this for?</button>'
    + '</p>';

    /* Contrast summary + auto-paired text — extracted helper so
       hover-preview can rebuild these surgically. */
    var _wp = renderWcagPairsHTML(role, mode);
    var wcagHTML = _wp.wcagHTML;
    var pairedHTML = _wp.pairedHTML;

    var modeBanner = '<div class="ev2-edit-scope" data-mode="' + mode + '" '
      + 'title="You are editing the ' + mode + ' theme. Use the Light\u2009/\u2009Dark toggle in the top bar to switch.">'
      + '<span class="ev2-edit-scope-dot" aria-hidden="true"></span>'
      + '<span class="ev2-edit-scope-label">Editing <strong>' + (mode === 'dark' ? 'Dark' : 'Light') + ' mode</strong> tokens</span>'
      + '<span class="ev2-edit-scope-meta">Picks below apply to ' + mode + ' theme only</span>'
    + '</div>';

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
      + modeBanner
      + '<div class="ev2-intent">'
        + '<div class="ev2-intent-head">'
          + '<div class="ev2-intent-titlewrap">'
            + '<span class="ev2-intent-title">' + role.label + ' role</span>'
            + '<span class="ev2-intent-sub">How prominently should ' + role.label.toLowerCase() + ' appear across surfaces, content and containers?</span>'
          + '</div>'
          + (changed ? '<span class="ev2-intent-changed">Changed</span>' : '')
          + '<button type="button" class="ev2-role-reset" data-role-reset="' + role.id + '"'
            + (changed ? '' : ' disabled')
            + ' data-tip="Reset ' + role.label + ' to project defaults — anchor color, fill / content / container picks, and step interval. Other roles are untouched.">'
            + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg>'
            + '<span>Reset ' + role.label + '</span>'
          + '</button>'
        + '</div>'
        + '<div class="ev2-intent-body">'
          + spreadHTML
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
    var P = presetsFor(roleId);
    var fillStep      = P.fill[t.fill];
    var contentStep   = P.content[t.content];
    var containerStep = P.container[t.container];
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
        var value = b.getAttribute('data-t1-value');
        t1For(State.activeRole)[lever] = value;
        pushPreview();
        refreshChangeBar();
        scheduleAutosave();
        renderT1();
        // Highlight + scroll matching preview section into view
        focusPreview(lever, true);
      });
    });
    var openSpread = document.getElementById('openSpreadDialog');
    if (openSpread) openSpread.addEventListener('click', function () { openSpreadDialog(); });
  }

  /* Delegated handler for the Auto-fix-to-AA button. Bound once at
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

  function openSpreadDialog() {
    var role = State.activeRole;
    var current = t1For(role).spread || T1_DEFAULT.spread;
    var card = document.getElementById('ev2SpreadDialog');
    if (!card) return;
    // Track the pending pick — only commit on Apply
    var pending = current;
    function paintCards() {
      var hasRiskyPending = (pending === 'bold');
      card.innerHTML = (hasRiskyPending
        ? '<div class="ev2-spread-warn" role="note">'
            + '<span class="ev2-spread-warn-icon" aria-hidden="true">\u26A0</span>'
            + '<span><strong>Distinct</strong> opens a wider range of picks. '
            + 'Some Soft / Subtle / Tinted options may not pass WCAG AA \u2014 '
            + 'check the badges in each lever before applying.</span>'
          + '</div>'
        : ''
      ) + SPREAD_OPTIONS.map(function (opt) {
        var isSel = opt.id === pending;
        var family = T1_PRESETS_BY_SPREAD[opt.id];
        var P = (family && family[State.editingMode]) || family.light;
        var preview = ['soft','standard','bold'].map(function (k) {
          var hex = stepHexByName(role, P.fill[k]) || '#000';
          return '<span style="background:' + hex + '"></span>';
        }).join('');
        var desc = opt.id === 'subtle'
          ? 'Soft, Standard and Bold sit close together \u2014 gentle, restrained variation. Best for refined or low-contrast brands.'
          : 'Soft, Standard and Bold are clearly different shades \u2014 stronger emphasis. Best for high-contrast or expressive brands.';
        return '<button class="ev2-spread-card" type="button" aria-pressed="' + isSel + '" data-spread-pick="' + opt.id + '">'
          + '<div class="ev2-spread-card-head">'
            + '<span class="ev2-spread-card-pv">' + preview + '</span>'
            + '<div class="ev2-spread-card-titles">'
              + '<span class="ev2-spread-card-label">' + opt.label + '</span>'
              + '<span class="ev2-spread-card-meta">' + opt.sub + '</span>'
            + '</div>'
          + '</div>'
          + '<p class="ev2-spread-card-desc">' + desc + '</p>'
        + '</button>';
      }).join('');
      card.querySelectorAll('[data-spread-pick]').forEach(function (b) {
        b.addEventListener('click', function () {
          pending = b.getAttribute('data-spread-pick');
          paintCards();
        });
      });
    }
    paintCards();
    // Wire Apply (replace handler each open so closure captures fresh `pending`)
    var applyBtn = document.getElementById('ev2SpreadApply');
    if (applyBtn) {
      var fresh = applyBtn.cloneNode(true);
      applyBtn.parentNode.replaceChild(fresh, applyBtn);
      fresh.addEventListener('click', function () {
        if (pending !== current) {
          t1For(State.activeRole).spread = pending;
          pushPreview();
          refreshChangeBar();
          scheduleAutosave();
          renderT1();
        }
        closeSpreadDialog();
      });
    }
    document.getElementById('ev2SpreadDialogWrap').removeAttribute('hidden');
  }
  function closeSpreadDialog() {
    var w = document.getElementById('ev2SpreadDialogWrap');
    if (w) w.setAttribute('hidden', '');
  }
  // Dismiss handlers (backdrop + Close button)
  document.addEventListener('click', function (e) {
    if (e.target && e.target.matches && e.target.matches('[data-spread-dismiss]')) closeSpreadDialog();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var w = document.getElementById('ev2SpreadDialogWrap');
      if (w && !w.hasAttribute('hidden')) closeSpreadDialog();
    }
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
    });
  });

  // Mode toggle — single source of truth: switches PREVIEW theme AND
  // which mode's tokens you are editing in the panel. Per-mode T1 state
  // means changes apply to that mode only.
  document.querySelectorAll('.ev2-mode').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.ev2-mode').forEach(function (b) { b.setAttribute('aria-checked', 'false'); });
      btn.setAttribute('aria-checked', 'true');
      var mode = btn.getAttribute('data-mode');
      State.editingMode = mode;
      document.documentElement.setAttribute('data-theme', mode);
      try { $frame.contentWindow.postMessage({ type: 'ev2-theme', mode: mode }, '*'); } catch (e) {}
      saveUIState();
      // Re-render so T1 panel reflects the new mode's picks + banner.
      if (State.activeTier === 't1') renderT1();
    });
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
    State.cachedSteps = {};
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

    // T1 — role lever / spread changes (per mode)
    ['light','dark'].forEach(function (mode) {
      var rows = [];
      ROLES.forEach(function (r) {
        if (!isT1ChangedInMode(r.id, mode)) return;
        var t = State.t1[mode][r.id];
        var def = T1_DEFAULT;
        var deltas = [];
        if (t.fill !== def.fill)           deltas.push('Fill <em>'      + def.fill      + '</em> \u2192 <em>' + t.fill      + '</em>');
        if (t.content !== def.content)     deltas.push('Content <em>'   + def.content   + '</em> \u2192 <em>' + t.content   + '</em>');
        if (t.container !== def.container) deltas.push('Container <em>' + def.container + '</em> \u2192 <em>' + t.container + '</em>');
        var spr = t.spread || def.spread;
        if (spr !== def.spread)             deltas.push('Step interval <em>' + def.spread + '</em> \u2192 <em>' + spr + '</em>');
        if (!deltas.length) return;
        var swatchHex = stepHexByName(r.id, presetsFor(r.id, mode).fill[t.fill]) || State.proposed[r.id];
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
          sub: 'Per-role lever picks (which step Soft / Standard / Bold maps to).',
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
    if (ui) {
      if (ui.activeTier) State.activeTier = ui.activeTier;
      if (ui.activeRole) State.activeRole = ui.activeRole;
      if (ui.anchor === 'exact' || ui.anchor === 'normalized') State.anchor = ui.anchor;
      if (ui.disclosure && typeof ui.disclosure === 'object') {
        Object.keys(ui.disclosure).forEach(function (k) { State.disclosure[k] = !!ui.disclosure[k]; });
      }
      if (ui.mode === 'light' || ui.mode === 'dark') {
        State.editingMode = ui.mode;
        document.documentElement.setAttribute('data-theme', ui.mode);
        document.querySelectorAll('.ev2-mode').forEach(function (b) {
          b.setAttribute('aria-checked', String(b.getAttribute('data-mode') === ui.mode));
        });
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
    renderActiveTier();
    refreshChangeBar();
    initProjectWidget();
    if (hadDraft) {
      refreshDraftStatus('saved');
      if (window.ev2Toast) window.ev2Toast('Restored from local draft', 'ok');
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
    var workspace = document.querySelector('.ev2-workspace');
    if (!resizer || !workspace) return;

    var RAIL_W = 240;          // matches CSS first column
    var RESIZER_W = 6;         // matches CSS resizer track
    var MIN_LIST = 320;
    var MIN_PREVIEW = 380;
    var STORAGE_KEY = 'ev2-list-width';

    function applyWidth(px) {
      var totalAvail = workspace.clientWidth - RAIL_W - RESIZER_W;
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
      var newListW = e.clientX - rect.left - RAIL_W - (RESIZER_W / 2);
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
      var current = parseInt(getComputedStyle(workspace).gridTemplateColumns.split(' ')[1], 10) || 480;
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
      var place = 'top';
      var top = r.top - th - 10;
      if (top < 8) { place = 'bottom'; top = r.bottom + 10; }
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
