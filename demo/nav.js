/* ════════════════════════════════════════════════════════════
   Design Token Forge — Dynamic Navigation
   Generates the full explorer-nav from data.
   Loaded via <script src="nav.js"></script> before shared.js.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Menu Data ──────────────────────────────────────────── */
  /* Check if user has any projects */
  var hasProjects = false;
  try {
    var kp = JSON.parse(localStorage.getItem('dtf-known-projects') || '[]');
    hasProjects = kp.length > 0;
  } catch(e) {}

  var onboardLabel = hasProjects ? 'Create Project' : 'Start Your Own Project';

  var NAV_ITEMS = [
    { label: 'Edit Colors',     href: 'editor-v2/',              hint: ''            },
    { label: 'Tokens',          href: 'color-tokens.html',       hint: ''            },
    { label: 'Frameworks',      href: 'frameworks.html',         hint: ''            },
    { sep: true },
    { label: 'All Components',  href: 'components.html',         hint: ''            },
    { label: 'Button',          href: 'button.html',          hint: '246 vars'    },
    { label: 'IconButton',      href: 'icon-button.html',     hint: '120 vars'    },
    { label: 'SplitButton',     href: 'split-button.html',    hint: '154 vars'    },
    { label: 'Input',           href: 'input.html',           hint: '172 vars'    },
    { label: 'Textarea',        href: 'textarea.html',        hint: '114 vars'    },
    { label: 'Select',          href: 'select.html',          hint: '120 vars'    },
    { label: 'MenuButton',      href: 'menu-button.html',     hint: '139 vars'    },
    { label: 'Toggle',          href: 'toggle.html',          hint: '93 vars'     },
    { label: 'Checkbox',        href: 'checkbox.html',        hint: '74 vars'     },
    { label: 'Radio',           href: 'radio.html',           hint: '73 vars'     },
    { label: 'Slider',          href: 'slider.html',          hint: '120 vars'    },
    { label: 'DatePicker',      href: 'datepicker.html',      hint: '~190 vars'   },
    { label: 'FileUpload',      href: 'file-upload.html',     hint: '~120 vars'   },
    { label: 'Avatar',          href: 'avatar.html',          hint: '~80 vars'    },
    { label: 'Badge',           href: 'badge.html',           hint: '~90 vars'    },
    { label: 'Tooltip',         href: 'tooltip.html',         hint: '~60 vars'    },
    { label: 'Alert',           href: 'alert.html',           hint: '~80 vars'    },
    { label: 'Toast',           href: 'toast.html',           hint: '~90 vars'    },
    { label: 'Progress Bar',    href: 'progress-bar.html',    hint: '~60 vars'    },
    { label: 'Progress Circle', href: 'progress-circle.html', hint: '~50 vars'    }
  ];

  /* ── Detect current page ────────────────────────────────── */
  var path = location.pathname;
  var filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

  /* Determine page label for the switcher button */
  var pageLabel = 'All Components';
  for (var i = 0; i < NAV_ITEMS.length; i++) {
    if (NAV_ITEMS[i].href === filename) { pageLabel = NAV_ITEMS[i].label; break; }
  }

  /* ── Build HTML ─────────────────────────────────────────── */
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  var dropdownHtml = '';
  for (var j = 0; j < NAV_ITEMS.length; j++) {
    var it = NAV_ITEMS[j];
    if (it.group) {
      dropdownHtml += '<div class="dd-group">' + esc(it.group) + '</div>';
    } else if (it.sep) {
      dropdownHtml += '<div class="dd-sep" role="separator"></div>';
    } else {
      var isCurrent = (it.href === filename);
      // Carry the active project across nav. Editor v2 reads ?project=…
      // and other demo pages already react to the dtf-active-project
      // localStorage key, so appending the query param keeps the
      // current project context wherever the user navigates.
      var activePid = '';
      try { activePid = localStorage.getItem('dtf-active-project') || ''; } catch (e) {}
      var href = it.href;
      if (activePid && !/[?&]project=/.test(href)) {
        href += (href.indexOf('?') >= 0 ? '&' : '?') + 'project=' + encodeURIComponent(activePid);
      }
      dropdownHtml += '<a href="' + href + '" role="menuitem"'
        + (isCurrent ? ' aria-current="page"' : '')
        + '>' + esc(it.label)
        + (it.hint ? ' <span class="dd-hint">' + esc(it.hint) + '</span>' : '')
        + '</a>';
    }
  }

  var navHtml = ''
    + '<div class="nav-crumb">'
    +   '<a href="index.html" class="nav-home" aria-label="Home" title="Home">'
        +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        +     '<path d="M3 12L12 3l9 9"/><path d="M5 10v9a1 1 0 001 1h3v-5h6v5h3a1 1 0 001-1v-9"/>'
        +   '</svg>'
        + '</a>'
        + '<span class="nav-sep">/</span>'
    +   '<div class="nav-switcher">'
    +     '<button class="nav-switcher-btn" id="navSwitcher" aria-expanded="false" aria-haspopup="true" type="button">'
    +       esc(pageLabel)
    +       ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>'
    +     '</button>'
    +     '<div class="nav-dropdown" id="navDropdown" role="menu">'
    +       dropdownHtml
    +     '</div>'
    +   '</div>'
    + '</div>'
    + '<div class="nav-actions">'
    +   (filename !== 'onboard.html' ? '<a href="onboard.html" class="nav-project-new" title="New Project">+ New</a>' : '')
    +   '<button class="theme-toggle" id="themeToggle" type="button">Toggle Dark</button>'
    + '</div>';

  /* ── Inject ─────────────────────────────────────────────── */
  var navEl = document.querySelector('nav.explorer-nav');
  if (!navEl) {
    /* Create nav element at top of body if placeholder doesn't exist */
    navEl = document.createElement('nav');
    navEl.className = 'explorer-nav';
    navEl.setAttribute('aria-label', 'Site navigation');
    document.body.insertBefore(navEl, document.body.firstChild);
  }
  navEl.setAttribute('aria-label', 'Site navigation');
  navEl.innerHTML = navHtml;

  /* ── Dropdown toggle ────────────────────────────────────── */
  var btn = document.getElementById('navSwitcher');
  var dd  = document.getElementById('navDropdown');

  btn.addEventListener('click', function () {
    var open = dd.hasAttribute('data-open');
    if (open) { dd.removeAttribute('data-open'); btn.setAttribute('aria-expanded', 'false'); }
    else      { dd.setAttribute('data-open', ''); btn.setAttribute('aria-expanded', 'true'); }
  });

  document.addEventListener('click', function (e) {
    if (!btn.contains(e.target) && !dd.contains(e.target)) {
      dd.removeAttribute('data-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dd.hasAttribute('data-open')) {
      dd.removeAttribute('data-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  });
})();
