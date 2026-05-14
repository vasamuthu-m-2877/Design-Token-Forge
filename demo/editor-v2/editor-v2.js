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
    cachedSteps:{},
    // Disclosure open-state persists across role / tier swaps.
    // Keyed by 'tierId:discId' so each tier can have its own pattern.
    disclosure: { 't0:steps': false, 't0:affects': false },
    lastSavedAt: null
  };

  var DRAFT_KEY = 'dtf-editor-v2-draft-v1';

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
          proposed: State.proposed
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
