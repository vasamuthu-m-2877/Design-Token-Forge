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
  var T1_PRESETS = {
    fill:      { soft: '400', standard: '500', bold: '600' },
    content:   { subtle: '450', standard: '550', strong: '700' },
    container: { whisper: '25', light: '50', tinted: '100' }
  };
  var T1_DEFAULT = { fill: 'standard', content: 'standard', container: 'light' };
  var T1_LEVERS = [
    { id: 'fill', label: 'Fill emphasis', sub: 'Solid component backgrounds (buttons, badges, fills)',
      options: [
        { id: 'soft',     label: 'Soft',     hint: 'Step 400 \u2014 gentler, less assertive' },
        { id: 'standard', label: 'Standard', hint: 'Step 500 \u2014 recommended default' },
        { id: 'bold',     label: 'Bold',     hint: 'Step 600 \u2014 heavier, more presence' }
      ]
    },
    { id: 'content', label: 'Content weight', sub: 'Text and icons rendered in this color',
      options: [
        { id: 'subtle',   label: 'Subtle',   hint: 'Step 450 \u2014 lighter on white' },
        { id: 'standard', label: 'Standard', hint: 'Step 550 \u2014 comfortable everywhere' },
        { id: 'strong',   label: 'Strong',   hint: 'Step 700 \u2014 high contrast' }
      ]
    },
    { id: 'container', label: 'Container softness', sub: 'Soft tinted surfaces (alert bg, banners)',
      options: [
        { id: 'whisper',  label: 'Whisper',  hint: 'Step 25 \u2014 barely tinted' },
        { id: 'light',    label: 'Light',    hint: 'Step 50 \u2014 gentle wash' },
        { id: 'tinted',   label: 'Tinted',   hint: 'Step 100 \u2014 clearly colored' }
      ]
    }
  ];

  var State = {
    activeTier: 't0',
    activeRole: 'brand',
    anchor:     'exact',
    baseline:   {},
    proposed:   {},
    cachedSteps:{},
    t1: {
      brand:   { fill:'standard', content:'standard', container:'light' },
      danger:  { fill:'standard', content:'standard', container:'light' },
      success: { fill:'standard', content:'standard', container:'light' },
      warning: { fill:'standard', content:'standard', container:'light' },
      info:    { fill:'standard', content:'standard', container:'light' }
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
  function isT1Changed(roleId) {
    var t = State.t1[roleId];
    return t.fill !== T1_DEFAULT.fill || t.content !== T1_DEFAULT.content || t.container !== T1_DEFAULT.container;
  }
  function isRoleDirty(roleId) { return isChanged(roleId) || isT1Changed(roleId); }
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
  function semanticVarsFor(roleId) {
    var t = State.t1[roleId];
    var fillStep      = T1_PRESETS.fill[t.fill];
    var contentStep   = T1_PRESETS.content[t.content];
    var containerStep = T1_PRESETS.container[t.container];
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
    lines.push('  --' + p + '-on-component: #FFFFFF;');
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
    lines.push('  --' + p + '-on-container: ' + get(stepRel(fillStep, 2)) + ';');
    return lines;
  }

  function pushPreview() {
    var doc = $frame.contentDocument;
    if (!doc || !doc.head) return;
    var style = doc.getElementById('ev2-overrides');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'ev2-overrides';
      doc.head.appendChild(style);
    }
    var lines = [':root, [data-theme="dark"] {'];
    ROLES.forEach(function (r) {
      var t0 = isChanged(r.id);
      var t1 = isT1Changed(r.id);
      if (!t0 && !t1) return;
      var steps = stepsFor(r.id);
      // Always re-emit the prim ladder when role is dirty so semantic
      // overrides and any direct prim consumers stay coherent.
      steps.forEach(function (s) {
        if (s.name === 'white' || s.name === 'black') return;
        lines.push('  --prim-' + r.prefix + '-' + s.name + ': ' + s.hex + ';');
      });
      // Re-emit semantic mapping any time the role is dirty (T0 or T1).
      semanticVarsFor(r.id).forEach(function (l) { lines.push(l); });
    });
    lines.push('}');
    style.textContent = lines.join('\n');
  }

  function refreshChangeBar() {
    var n = totalChanges();
    $changeCt.textContent = n + ' change' + (n === 1 ? '' : 's');
    $discard.disabled = n === 0;
    $deploy.disabled  = n === 0;
    $deployN.hidden = n === 0;
    $deployN.textContent = n;
    refreshAutosaveLabel();
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
    $autosave.textContent = 'Saved to local draft \u00b7 ' + relTime(State.lastSavedAt);
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
      // Only adopt fields we recognize; ignore proposed roles not in current ROLES list.
      ROLES.forEach(function (r) {
        if (d.proposed[r.id]) State.proposed[r.id] = d.proposed[r.id];
        if (d.t1 && d.t1[r.id]) {
          var t = d.t1[r.id];
          if (T1_PRESETS.fill[t.fill])           State.t1[r.id].fill = t.fill;
          if (T1_PRESETS.content[t.content])     State.t1[r.id].content = t.content;
          if (T1_PRESETS.container[t.container]) State.t1[r.id].container = t.container;
        }
      });
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
  function renderT1() {
    var role = ROLES.find(function (r) { return r.id === State.activeRole; });
    if (!role) return;
    var t1 = State.t1[role.id];
    var changed = isT1Changed(role.id) || isChanged(role.id);
    var affects = AFFECTS[role.id] || [];

    var leversHTML = T1_LEVERS.map(function (lever) {
      var current = t1[lever.id];
      return '<div class="ev2-lever-block" data-lever="' + lever.id + '">'
        + '<div class="ev2-lever-head">'
          + '<span class="ev2-lever-title">' + lever.label + '</span>'
          + '<span class="ev2-lever-sub">' + lever.sub + '</span>'
        + '</div>'
        + '<div class="ev2-seg ev2-seg-' + lever.id + '" role="radiogroup" aria-label="' + lever.label + '">'
          + lever.options.map(function (opt) {
              var isSel = opt.id === current;
              var step  = ({fill:T1_PRESETS.fill, content:T1_PRESETS.content, container:T1_PRESETS.container})[lever.id][opt.id];
              var hex   = stepHexByName(role.id, step) || '#000';
              var preview = renderLeverPreview(lever.id, hex);
              return '<button class="ev2-seg-btn" role="radio" '
                + 'aria-checked="' + isSel + '" '
                + 'data-t1-lever="' + lever.id + '" data-t1-value="' + opt.id + '" '
                + 'data-tip="' + opt.hint + '">'
                + '<span class="ev2-seg-preview">' + preview + '</span>'
                + '<span class="ev2-seg-label">' + opt.label + '</span>'
                + '<span class="ev2-seg-css">step ' + step + ' \u2022 ' + hex.toUpperCase().replace('#','') + '</span>'
                + '</button>';
            }).join('')
        + '</div>'
        + '<div class="ev2-lever-css">--' + role.id + '-' + leverSlotHint(lever.id) + '<span> = </span>'
          + (function () {
              var step = ({fill:T1_PRESETS.fill, content:T1_PRESETS.content, container:T1_PRESETS.container})[lever.id][current];
              return (stepHexByName(role.id, step) || '#000').toUpperCase();
            })()
          + '</div>'
      + '</div>';
    }).join('');

    $body.innerHTML =
      '<div class="ev2-roles" role="tablist">'
        + ROLES.map(function (r) {
            var current = r.id === role.id;
            return '<button class="ev2-role" role="tab" data-role-tab="' + r.id + '" '
              + 'aria-selected="' + current + '" data-changed="' + isRoleDirty(r.id) + '">'
              + '<span class="ev2-role-dot" style="background:' + State.proposed[r.id] + '"></span>'
              + '<span>' + r.label + '</span>'
              + '</button>';
          }).join('')
      + '</div>'
      + '<div class="ev2-intent">'
        + '<div class="ev2-intent-head">'
          + '<div class="ev2-intent-titlewrap">'
            + '<span class="ev2-intent-title">' + role.label + ' role</span>'
            + '<span class="ev2-intent-sub">How prominently should ' + role.label.toLowerCase() + ' appear across surfaces, content and containers?</span>'
          + '</div>'
          + (changed ? '<span class="ev2-intent-changed">Changed</span>' : '')
        + '</div>'
        + '<div class="ev2-intent-body">'
          + '<div class="ev2-levers">' + leversHTML + '</div>'
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
  }

  function slotsTableHTML(roleId) {
    var t = State.t1[roleId];
    var fillStep      = T1_PRESETS.fill[t.fill];
    var contentStep   = T1_PRESETS.content[t.content];
    var containerStep = T1_PRESETS.container[t.container];
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
        State.t1[State.activeRole][lever] = value;
        pushPreview();
        refreshChangeBar();
        scheduleAutosave();
        renderT1();
      });
    });
  }

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
  function focusPreview(leverId) {
    try {
      $frame.contentWindow.postMessage({ type: 'ev2-focus', lever: leverId }, '*');
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

  // Mode toggle
  document.querySelectorAll('.ev2-mode').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.ev2-mode').forEach(function (b) { b.setAttribute('aria-checked', 'false'); });
      btn.setAttribute('aria-checked', 'true');
      var mode = btn.getAttribute('data-mode');
      document.documentElement.setAttribute('data-theme', mode);
      try {
        var doc = $frame.contentDocument;
        if (doc && doc.documentElement) doc.documentElement.setAttribute('data-theme', mode);
      } catch (e) {}
      saveUIState();
    });
  });

  document.getElementById('showCssNames').addEventListener('change', function (e) {
    document.body.classList.toggle('ev2-show-css', e.target.checked);
    saveUIState();
  });

  $discard.addEventListener('click', function () {
    ROLES.forEach(function (r) {
      State.proposed[r.id] = State.baseline[r.id];
      State.t1[r.id] = { fill: T1_DEFAULT.fill, content: T1_DEFAULT.content, container: T1_DEFAULT.container };
    });
    State.cachedSteps = {};
    clearDraftFromStorage();
    pushPreview();
    renderActiveTier();
    refreshChangeBar();
    refreshDraftStatus('idle');
    if (window.ev2Toast) window.ev2Toast('Reverted all changes', 'ok');
  });

  $reload.addEventListener('click', function () {
    $frame.contentWindow.location.reload();
  });

  $frame.addEventListener('load', function () {
    pushPreview();
    try {
      var mode = document.documentElement.getAttribute('data-theme') || 'light';
      $frame.contentDocument.documentElement.setAttribute('data-theme', mode);
    } catch (e) {}
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
    readBaseline();
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
        document.documentElement.setAttribute('data-theme', ui.mode);
        document.querySelectorAll('.ev2-mode').forEach(function (b) {
          b.setAttribute('aria-checked', String(b.getAttribute('data-mode') === ui.mode));
        });
      }
      if (ui.showCss) {
        document.body.classList.add('ev2-show-css');
        var cb = document.getElementById('showCssNames');
        if (cb) cb.checked = true;
      }
      // Reflect activeTier in the rail aria-current
      document.querySelectorAll('.ev2-tier').forEach(function (b) {
        if (b.getAttribute('data-tier') === State.activeTier) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
    }
    $frame.src = './preview.html';
    renderActiveTier();
    refreshChangeBar();
    initProjectWidget();
    if (hadDraft) {
      refreshDraftStatus('saved');
      if (window.ev2Toast) window.ev2Toast('Restored from local draft', 'ok');
    } else {
      refreshDraftStatus('idle');
    }
  }
  // Boot runs at the very bottom, after all helpers are defined.

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
})();
