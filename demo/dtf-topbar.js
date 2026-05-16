/* ════════════════════════════════════════════════════════════
   Design Token Forge — <dtf-topbar> Web Component

   Single source of truth for the page chrome that wraps every
   demo page AND the token editor. Renders:

     [Home] / [Page ▾]  [Project chip slot]  ────  [Action slot]  [+ New] [🌗]

   Usage on a demo page (auto-injected by nav.js):
     <dtf-topbar page="button.html"></dtf-topbar>

   Usage in the editor (markup is hand-authored so editor-v2.js can
   still wire its existing IDs):
     <dtf-topbar page="editor-v2/" no-theme-toggle>
       <div slot="project"> ...existing #projBtn, #projName, #projPanel markup... </div>
       <label slot="action">...show-css...</label>
       <button slot="action" id="historyBtn">History</button>
       <button slot="action" id="deployBtn">Publish</button>
     </dtf-topbar>

   The component intentionally renders into LIGHT DOM (no shadow) so
   shared.css / editor-v2.css selectors keep working, and so
   shared.js's project-chip IIFE can still find the `.nav-actions`
   container on demo pages.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (window.customElements && customElements.get('dtf-topbar')) return;

  /* ── Page registry (shared with nav.js) ─────────────────── */
  var NAV_ITEMS = [
    { label: 'Edit Colors',     href: 'editor-v2/'           },
    { label: 'Tokens',          href: 'color-tokens.html'    },
    { label: 'Frameworks',      href: 'frameworks.html'      },
    { sep: true },
    { label: 'All Components',  href: 'components.html'      },
    { label: 'Button',          href: 'button.html',          hint: '246 vars'  },
    { label: 'IconButton',      href: 'icon-button.html',     hint: '120 vars'  },
    { label: 'SplitButton',     href: 'split-button.html',    hint: '154 vars'  },
    { label: 'Input',           href: 'input.html',           hint: '172 vars'  },
    { label: 'Textarea',        href: 'textarea.html',        hint: '114 vars'  },
    { label: 'Select',          href: 'select.html',          hint: '120 vars'  },
    { label: 'MenuButton',      href: 'menu-button.html',     hint: '139 vars'  },
    { label: 'Toggle',          href: 'toggle.html',          hint: '93 vars'   },
    { label: 'Checkbox',        href: 'checkbox.html',        hint: '74 vars'   },
    { label: 'Radio',           href: 'radio.html',           hint: '73 vars'   },
    { label: 'Slider',          href: 'slider.html',          hint: '120 vars'  },
    { label: 'DatePicker',      href: 'datepicker.html',      hint: '~190 vars' },
    { label: 'FileUpload',      href: 'file-upload.html',     hint: '~120 vars' },
    { label: 'Avatar',          href: 'avatar.html',          hint: '~80 vars'  },
    { label: 'Badge',           href: 'badge.html',           hint: '~90 vars'  },
    { label: 'Tooltip',         href: 'tooltip.html',         hint: '~60 vars'  },
    { label: 'Alert',           href: 'alert.html',           hint: '~80 vars'  },
    { label: 'Toast',           href: 'toast.html',           hint: '~90 vars'  },
    { label: 'Progress Bar',    href: 'progress-bar.html',    hint: '~60 vars'  },
    { label: 'Progress Circle', href: 'progress-circle.html', hint: '~50 vars'  }
  ];
  window.DtfTopbarNavItems = NAV_ITEMS;

  function esc(s){ var d=document.createElement('div'); d.textContent=String(s==null?'':s); return d.innerHTML; }

  /* SVGs are inlined to keep the bar zero-dependency. */
  var ICON_HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12L12 3l9 9"/><path d="M5 10v9a1 1 0 001 1h3v-5h6v5h3a1 1 0 001-1v-9"/></svg>';
  var ICON_CARET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  var ICON_SUN = '<svg class="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  var ICON_MOON = '<svg class="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  /* ── Custom element definition ──────────────────────────── */
  function DtfTopbar() { return Reflect.construct(HTMLElement, [], DtfTopbar); }
  DtfTopbar.prototype = Object.create(HTMLElement.prototype);
  DtfTopbar.prototype.constructor = DtfTopbar;
  Object.setPrototypeOf(DtfTopbar, HTMLElement);

  DtfTopbar.prototype.connectedCallback = function () {
    if (this._mounted) return;
    this._mounted = true;

    /* Preserve children authored by the page (slot="project" / slot="action").
       We rebuild the topbar shell, then re-attach these into the right place. */
    var slotted = { project: [], action: [] };
    var i, kids = Array.prototype.slice.call(this.children);
    for (i = 0; i < kids.length; i++) {
      var node = kids[i];
      var slot = node.getAttribute && node.getAttribute('slot');
      if (slot === 'project' || slot === 'action') {
        slotted[slot].push(node);
      }
      // unknown / unslotted children are dropped on purpose to keep the bar clean
    }

    var page = (this.getAttribute('page') || '').trim();
    var pageLabel = this._labelFor(page);
    var noTheme = this.hasAttribute('no-theme-toggle');
    var noNew = this.hasAttribute('no-new-project');

    /* dropdown menu (page switcher) */
    var ddHtml = '';
    var activePid = '';
    try { activePid = localStorage.getItem('dtf-active-project') || ''; } catch (e) {}
    for (i = 0; i < NAV_ITEMS.length; i++) {
      var it = NAV_ITEMS[i];
      if (it.sep) { ddHtml += '<div class="dd-sep" role="separator"></div>'; continue; }
      var href = it.href;
      if (activePid && !/[?&]project=/.test(href)) {
        href += (href.indexOf('?') >= 0 ? '&' : '?') + 'project=' + encodeURIComponent(activePid);
      }
      var isCurrent = (it.href === page);
      ddHtml += '<a href="' + href + '" role="menuitem"'
        + (isCurrent ? ' aria-current="page"' : '')
        + '>' + esc(it.label)
        + (it.hint ? ' <span class="dd-hint">' + esc(it.hint) + '</span>' : '')
        + '</a>';
    }

    /* shell */
    var homeHref = 'index.html';
    if (activePid) homeHref += '?project=' + encodeURIComponent(activePid);
    var newHtml = noNew ? '' :
      '<a href="onboard.html" class="nav-project-new" title="New Project">+ New</a>';
    var themeHtml = noTheme ? '' :
      '<button class="theme-toggle" id="themeToggle" type="button" aria-label="Toggle theme" aria-pressed="false">'
        + ICON_SUN + ICON_MOON +
      '</button>';
    var html = ''
      + '<nav class="explorer-nav dtf-topbar" aria-label="Site navigation">'
      +   '<div class="nav-crumb">'
      +     '<a href="' + esc(homeHref) + '" class="nav-home" aria-label="Home" title="Home">' + ICON_HOME + '</a>'
      +     '<span class="nav-sep">/</span>'
      +     '<div class="nav-switcher">'
      +       '<button class="nav-switcher-btn" type="button" aria-haspopup="true" aria-expanded="false">'
      +         esc(pageLabel)
      +         ' ' + ICON_CARET
      +       '</button>'
      +       '<div class="nav-dropdown" role="menu">' + ddHtml + '</div>'
      +     '</div>'
      +     '<div class="dtf-topbar-project" data-slot="project"></div>'
      +   '</div>'
      +   '<div class="nav-actions">'
      +     '<div class="dtf-topbar-actions" data-slot="action"></div>'
      +     newHtml
      +     themeHtml
      +   '</div>'
      + '</nav>';

    this.innerHTML = html;

    /* Re-attach slotted children into their landing zones. */
    var projZone = this.querySelector('[data-slot="project"]');
    var actZone  = this.querySelector('[data-slot="action"]');
    for (i = 0; i < slotted.project.length; i++) projZone.appendChild(slotted.project[i]);
    for (i = 0; i < slotted.action.length;  i++) actZone.appendChild(slotted.action[i]);

    /* Dropdown wiring */
    var btn = this.querySelector('.nav-switcher-btn');
    var dd  = this.querySelector('.nav-dropdown');
    function close(){ dd.removeAttribute('data-open'); btn.setAttribute('aria-expanded','false'); }
    btn.addEventListener('click', function(){
      if (dd.hasAttribute('data-open')) close();
      else { dd.setAttribute('data-open',''); btn.setAttribute('aria-expanded','true'); }
    });
    document.addEventListener('click', function(e){
      if (!btn.contains(e.target) && !dd.contains(e.target)) close();
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && dd.hasAttribute('data-open')) { close(); btn.focus(); }
    });
  };

  DtfTopbar.prototype._labelFor = function (page) {
    if (!page) return 'All Components';
    for (var i = 0; i < NAV_ITEMS.length; i++) {
      if (NAV_ITEMS[i].href === page) return NAV_ITEMS[i].label;
    }
    // Allow callers to pass a custom label that isn't in the registry
    var explicit = this.getAttribute('label');
    if (explicit) return explicit;
    return 'All Components';
  };

  customElements.define('dtf-topbar', DtfTopbar);
})();
