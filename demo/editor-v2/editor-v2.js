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

  var State = {
    activeTier: 't0',
    activeRole: 'brand',
    anchor:     'exact',
    baseline:   {},
    proposed:   {},
    cachedSteps:{}
  };

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
  function totalChanges() {
    return ROLES.reduce(function (n, r) { return n + (isChanged(r.id) ? 1 : 0); }, 0);
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
      if (!isChanged(r.id)) return;
      var steps = stepsFor(r.id);
      steps.forEach(function (s) {
        if (s.name === 'white' || s.name === 'black') return;
        lines.push('  --prim-' + r.prefix + '-' + s.name + ': ' + s.hex + ';');
      });
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
    $autosave.textContent = n === 0 ? 'No pending changes' : 'Staged locally · autosave wires up in Step 6';
  }

  function ladderHTML(role) {
    var steps = stepsFor(role).filter(function(s){ return s.name !== 'white' && s.name !== 'black'; });
    var baseSteps = baselineStepsFor(role);
    return steps.map(function (s) {
      var b = baseSteps.find(function(x){ return x.name === s.name; });
      var diff = b && b.hex.toUpperCase() !== s.hex.toUpperCase();
      return '<div class="ev2-step">'
        + '<div class="ev2-step-swatches">'
          + (diff ? '<div class="ev2-step-sw" style="background:' + b.hex + '" title="Before: ' + b.hex + '"></div>' : '')
          + '<div class="ev2-step-sw" style="background:' + s.hex + '" title="After: ' + s.hex + '"></div>'
        + '</div>'
        + '<div class="ev2-step-meta">'
          + '<div class="ev2-step-name">' + s.name + '</div>'
          + '<div class="ev2-step-hex">' + s.hex.replace('#','') + '</div>'
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
                + '<button data-anchor="exact" aria-checked="' + (State.anchor === 'exact') + '" role="radio">Exact match</button>'
                + '<button data-anchor="normalized" aria-checked="' + (State.anchor === 'normalized') + '" role="radio">Normalized</button>'
              + '</div>'
            + '</div>'
          + '</div>'
          + '<div class="ev2-disc"' + (changedThisRole ? ' data-open' : '') + '>'
            + '<div class="ev2-disc-head" data-toggle="steps">'
              + '<span>20 derived steps</span>'
              + '<span class="ev2-disc-meta">' + (changedThisRole ? 'before \u2192 after' : 'auto-generated') + '</span>'
            + '</div>'
            + '<div class="ev2-disc-body">'
              + '<div class="ev2-ladder">' + ladderHTML(role.id) + '</div>'
            + '</div>'
          + '</div>'
          + '<div class="ev2-disc">'
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
        renderT0();
      });
    });
    document.querySelectorAll('.ev2-disc-head').forEach(function (h) {
      h.addEventListener('click', function () {
        var disc = h.parentElement;
        if (disc.hasAttribute('data-open')) disc.removeAttribute('data-open');
        else disc.setAttribute('data-open', '');
      });
    });
    document.querySelectorAll('[data-anchor]').forEach(function (b) {
      b.addEventListener('click', function () {
        State.anchor = b.getAttribute('data-anchor');
        State.cachedSteps = {};
        pushPreview();
        renderT0();
        refreshChangeBar();
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

  function renderActiveTier() {
    var meta = TIER_META[State.activeTier];
    $listTitle.textContent = meta.title;
    $listSub.textContent = meta.sub;
    if (State.activeTier === 't0') renderT0();
    else renderTierPlaceholder(State.activeTier);
  }

  // Tier rail
  document.querySelectorAll('.ev2-tier').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.ev2-tier').forEach(function (b) { b.removeAttribute('aria-current'); });
      btn.setAttribute('aria-current', 'true');
      State.activeTier = btn.getAttribute('data-tier');
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
    });
  });

  document.getElementById('showCssNames').addEventListener('change', function (e) {
    document.body.classList.toggle('ev2-show-css', e.target.checked);
  });

  $discard.addEventListener('click', function () {
    ROLES.forEach(function (r) { State.proposed[r.id] = State.baseline[r.id]; });
    State.cachedSteps = {};
    pushPreview();
    renderActiveTier();
    refreshChangeBar();
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
  draftStatus.setAttribute('data-state', 'idle');
  draftStatus.querySelector('.ev2-draft-text').textContent = 'Draft branch wires up in Step 6';

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
    $frame.src = './preview.html';
    renderActiveTier();
    refreshChangeBar();
  }
  boot();
})();
