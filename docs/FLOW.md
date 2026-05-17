# Design Token Forge — User Flow & Page Map

> **Purpose:** single source of truth for every URL a user (or
> contributor) can land on, what flow it belongs to, and what
> happens next. Update this file whenever a page is added,
> renamed, or retired.

_Last refresh: 2026-05-16 (post-cleanup A+B+C; added §1.5 user journeys)_

---

## 1. Canonical user flow

```
┌────────────────────┐    + New project    ┌──────────────────┐
│  demo/index.html   │ ─────────────────▶ │  demo/onboard.   │
│  (Project hub —    │                    │  html (wizard,   │
│  landing page)     │                    │  writes via PAT) │
└─────────┬──────────┘                    └────────┬─────────┘
          │ click a project card                   │ created → reload
          ▼                                        ▼
┌──────────────────────────────────────────────────────────────┐
│  demo/editor-v2/?project=<id>                               │
│  ─────────────────────────────────────────                  │
│  • Switcher  (top-bar) — switch / DELETE / + New             │
│  • Save as default — versioned snapshot → repo (PAT)        │
│  • Deploy to Figma — delta summary → plugin                  │
└─────────┬────────────────────────────────────────────────────┘
          │
          ├── components.html (component gallery)
          ├── color-tokens.html (token ladder browser)
          └── frameworks.html (React/Vue/Svelte snippets)
```

**State-by-state coverage:**

| State | Hub (`demo/index.html`) | Editor v2 |
|---|---|---|
| 0 projects in fork | "No projects yet — Create your first project" → `onboard.html` | Switcher shows "No projects — Create your first project" |
| 1 project | Card grid (1 card) + "+ New project" | Switcher shows the single project + delete (with auto-redirect to onboard if user deletes it) |
| N projects | Card grid | Full switcher with check-mark on active + per-row delete |
| First visit on a new device | Fetches `projects.json`; populates `dtf-known-projects` cache | Editor v2 calls `syncKnownProjectsFromIndex()` on boot |

---

## 1.5 User journeys (narrative)

These are the canonical paths a real human takes. Every PR that
touches the hub, onboard, editor-v2 switcher, or save/deploy
flows must keep all five working end-to-end.

### J1 — First-time visitor, empty fork ("I want to try DTF")

1. Lands on `demo/index.html`. Sees the hub hero + an empty grid with
   "No projects yet — Create your first project."
2. Clicks **+ New project** (topbar) or the empty-state link → lands
   on `demo/onboard.html`.
3. Wizard prompts for a GitHub PAT (`repo` scope). Token + username
   are stored in `localStorage` (`dtf-gh-pat`, `dtf-gh-user`).
4. Wizard creates the fork if missing, enables Pages + Actions,
   commits `projects/<id>/{primitives,semantic,surfaces}.css` +
   `config.json`, and prepends the entry to `projects.json`.
5. Onboard finishes → hands off to `demo/editor-v2/?project=<id>`.
6. Editor v2 strips the query param, persists `dtf-active-project`,
   loads the project's CSS, and renders.

**Exit criteria:** user can edit a color and see the preview update.

### J2 — Returning editor ("I want to tweak my brand color")

1. Lands on `demo/index.html` → cards render (cache hit if visited
   recently, fresh `projects.json` fetch otherwise).
2. Clicks the project card → `demo/editor-v2/?project=<id>`.
3. Editor v2 boots, picks the project as active, replays any draft
   from `ev2-draft-<id>` localStorage if present.
4. User edits T0 anchor or a T1 step → the change persists to draft
   storage on every edit; preview updates live.
5. User opens the topbar **Save as default** dialog → fills name,
   picks bump (patch / minor / major), confirms → PAT writes 5 files
   atomically; baselines are promoted in-memory.
6. **Discard** now reverts to the just-published snapshot, not the
   pre-edit state. **Deploy to Figma** shows only the delta vs. the
   new baseline.

**Exit criteria:** `projects/<id>/config.json` on the fork has the
new `latestVersion`, and reloading the editor shows the saved state.

### J3 — Switching between projects ("Compare brand vs. handhelds")

1. From editor-v2, user clicks the project name in the topbar to
   open the switcher.
2. Switcher lists every project the local fork knows about
   (`dtf-known-projects` cache, refreshed on each boot).
3. User clicks a different project.
4. If there are unsaved changes → confirm modal ("Discard & switch"
   vs. "Stay here").
5. On confirm: `dtf-active-project` rewritten → page reloads → new
   project's primitives / semantic / surfaces are injected
   synchronously before the AA-fix loop runs.

**Exit criteria:** the swatch row, semantic legend, and preview
iframe all reflect the newly-active project within one reload.

### J4 — Deleting a project ("This was a sandbox, kill it")

1. From editor-v2's switcher, user hovers a project row → the trash
   icon fades in (opacity transition, no layout jerk).
2. Clicks trash → confirm modal ("Delete 'X'? This removes the
   project's tokens, palette, and config from your GitHub fork…").
3. On confirm: PAT prompt if not yet authenticated.
4. v2 enumerates every blob under `projects/<id>/` from the fork's
   tree, marks them for removal, rewrites `projects.json`, and
   commits everything atomically.
5. Toast confirms deletion.
6. If the deleted project was active and others remain → auto-switch
   to the next remaining project.
7. If the fork now has zero projects → redirect to `onboard.html`.

**Exit criteria:** `projects/<id>/` is gone from the fork on next
page load; `projects.json` no longer lists it; the switcher cache
reflects this without a manual hard refresh.

### J5 — Designer in Figma ("Push my color changes to the plugin")

1. In editor-v2, user finishes editing and clicks **Deploy to Figma**.
2. Dialog opens in delta mode: shows only changes vs. the project's
   published baseline (cleaner than save-mode, because Figma already
   has the rest).
3. User confirms → today this is a toast hook (server integration
   pending). When wired, the sync server pushes overrides to the
   plugin, which calls `setValueForMode()` on each Figma variable.
4. Component instances inside Figma update on next refresh.

**Exit criteria:** Figma plugin variables match what the editor
shows. (Currently a stub — see Gaps §5.)

---

## 2. Pages directory

### 2.1 Active surface (linked from canonical flow)

| Path | Purpose | Reached from |
|---|---|---|
| `demo/index.html` | **Project hub** — landing page, project cards | Pages root, direct |
| `demo/onboard.html` | **New-project wizard** — PAT auth, palette pick, commits scaffold | Hub topbar `+ New project`, editor switcher empty state, post-delete (when fork hits 0 projects) |
| `demo/editor-v2/index.html` | **Editor v2** — T0/T1/T2/T3 tier editor with switcher, save-as-default, deploy | Hub project cards (with `?project=<id>`) |
| `demo/components.html` | Component gallery index | Hub topbar, hub explore cards, every component demo via `nav.js` |
| `demo/color-tokens.html` | Browse primitive → semantic → surface ladder | Hub explore card |
| `demo/frameworks.html` | React/Vue/Svelte integration snippets | Hub explore card, component pages |
| `demo/<component>.html` | Per-component demos (button, input, toggle, …) | `components.html`, `nav.js` dropdown |
| `demo/editor-v2/preview.html` | Iframe-only render surface for editor-v2 | `editor-v2/index.html` iframe |
| `demo/plugin/ui.html` | Figma plugin UI (panel) | Loaded by the Figma plugin runtime |
| `demo/shared.css`, `demo/shared.js`, `demo/nav.js`, `demo/_TEMPLATE.html`, `demo/_COMPONENT_CONFIGS.js`, `demo/_onboard-build-template.*` | Shared assets / templates | Used by demos and build pipeline |

### 2.2 Retained but unlinked from the main flow

| Path | Status | Recommendation |
|---|---|---|
| `demo/editor-legacy.html` | **Frozen** — the old monolithic Color System editor. Still functional as a fallback. No longer linked from the hub or editor-v2. | Keep until v2 covers all its remaining features (advanced AA tuning, multi-mode export). After parity → retire. |

### 2.3 Plugin / packages

| Path | Purpose |
|---|---|
| `packages/figma-plugin/` | Source of the Figma plugin (loaded into Figma directly, not via Pages) |
| `packages/components/`, `packages/tokens/`, `packages/generator/`, `packages/sync-server/` | npm-publishable packages |

---

## 3. URL/route contracts

| Route | Owner | Contract |
|---|---|---|
| `demo/index.html` | Hub | Reads `projects.json` (relative or `/Design-Token-Forge/projects.json`); seeds `dtf-known-projects` localStorage by handing off via card click. |
| `demo/editor-v2/?project=<id>` | Editor v2 | On boot: writes `dtf-active-project` from query, strips param, then loads. Falls back to last-active if no param. |
| `demo/onboard.html?return=<url>` (planned) | Onboard | Currently always returns to `editor-v2/`. **TODO:** honour `?return=` so deep-link-after-create works. |
| `demo/editor-legacy.html?keep=1` | Legacy | Bypass any auto-action params. Still works. |

---

## 4. State keys (localStorage / sessionStorage)

| Key | Owner | Purpose |
|---|---|---|
| `dtf-active-project` | All | Currently-loaded project id. |
| `dtf-known-projects` | All | Cached `projects.json` content for the local fork. Refreshed on every editor-v2 boot. |
| `dtf-theme` | All | `light` / `dark`. |
| `dtf-gh-pat` | onboard + editor-v2 + legacy | GitHub PAT (`repo` scope). |
| `dtf-gh-user` | onboard + editor-v2 + legacy | GitHub username (cached from `/user`). |
| `ev2-draft-<projectId>` | editor-v2 | Per-project unsaved-draft snapshot. Cleared on project switch. |
| `dtf-migration-ack-<projectId>` | editor-v2 | Migration-banner acknowledgement, version-scoped. |

---

## 5. Outstanding gaps

1. **Onboard return URL** — `onboard.html` always lands on `editor-v2/` after create. Should honour `?return=`.
2. **Hub doesn't show "set as default" version** — once a project has a `latestVersion`, surface it on the card (e.g. "v1.2.0 · Updated 3 days ago").
3. **Cross-fork projects** — when `projects.json` lists a project owned by another user, the local fork can't write to it. Hub should label these "read-only" or hide them behind a toggle.
4. **`shared.css` cache busting drift** — each demo page hard-codes `?v=20260516a` independently. Centralise.
5. **Deploy-to-Figma is a stub** — dialog opens and confirms, but the server-side push to the plugin is not wired (toast "Deploy queued (server integration TBD)"). See J5.

---

## 6. Cleanup log

| Date | Commit | Scope | Files removed |
|---|---|---|---|
| 2026-05-16 | `539cd87` | Group A — backup cruft | `complete-backup.html`, `demo/alert.html.old`, `demo/alert.html.prev` |
| 2026-05-16 | `d73d18f` | Group B — pages superseded by editor-v2 | `demo/editor-v1-archive.html`, `demo/color-system.html`, `demo/color-generator.html`, `demo/color-integration.html` (+ supporting edits in `demo/nav.js` and `demo/_TEMPLATE.html`) |
| 2026-05-16 | `023a48d` | Group C — root-level prototypes (never in Pages artifact) | `index.html`, `interactive.html`, `mockup.html`, `mockup-v2.html`, `complete.html`, `validate.js` |

Follow-ups still open:

- **Stale comments** in `packages/sync-server/build-static.js` and `packages/sync-server/generate-from-config.js` still mention `color-system.html`. Descriptive comments only — no live references. Schedule in a later doc pass.
- **`demo/editor-legacy.html`** is retained as fallback for features v2 doesn't cover yet (advanced AA tuning, multi-mode export). Retire when v2 reaches parity.

**Do not delete:**

- Anything under `packages/`, `projects/`, `scripts/`, `specs/`, `docs/`, `src/`, `tests/`.
- `demo/_TEMPLATE.html`, `demo/_COMPONENT_CONFIGS.js`, `demo/_onboard-*` (build templates).
