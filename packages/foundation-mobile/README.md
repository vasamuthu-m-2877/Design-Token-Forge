# @design-token-forge/foundation-mobile

> Mobile Foundation — L2 patterns shared across mobile shape-kits.

Phase 2.5a deliverable per the [v0.2 vision](../../docs/vision/v0.2-map/).
Sits between L1 atoms and shape-kits in the layer model:

```
L0 tokens → L1 atoms → Foundation (THIS PACKAGE) → Shape Kit → L3
```

## What's in here

10 mobile L2 patterns shared by every mobile shape (writing, commerce,
reading, chat). Each pattern is a **composition of L1 atoms** with its own
token surface, not a new atom.

| Pattern | Status | Built from | Used by |
|---|---|---|---|
| TopBar | ✅ shipped (v0.1.0) | `icon-button` + text | Writing, Commerce, Reading, Chat |
| BottomTabBar | 🚧 Phase 2.5a | `tab-bar-item` (new L1) | Writing, Commerce, Reading, Chat |
| SearchHeader | 🚧 Phase 2.5a | `input` + `icon-button` | Writing, Commerce, Reading |
| SwipeRow | 🚧 Phase 2.5a | `swipe-container` (new L1) | Writing, Commerce, Chat |
| ActionSheet | 🚧 Phase 2.5a | `bottom-sheet` (new L1) + `button` | Writing, Commerce, Chat |
| ConfirmSheet | 🚧 Phase 2.5a | `bottom-sheet` (new L1) + `button` | Writing, Commerce, Reading, Chat |
| SettingsRow.mobile | 🚧 Phase 2.5a | `toggle`, `select`, `icon` | Writing, Commerce, Reading, Chat |
| Toast.mobile | 🚧 Phase 2.5a | `toast` (L1) re-skinned | Writing, Commerce, Reading, Chat |
| EmptyState.mobile | 🚧 Phase 2.5a | text + `button` | Writing, Commerce, Reading |
| AppShell.mobile | 🚧 Phase 2.5a | `safe-area-inset` (new L1) | All |

## Installation

```bash
pnpm add @design-token-forge/foundation-mobile
```

Peer dependencies: `@design-token-forge/tokens`, `@design-token-forge/components`.

## Usage

Import the bundle:

```css
@import "@design-token-forge/tokens";
@import "@design-token-forge/components";
@import "@design-token-forge/foundation-mobile";
```

Or import just what you need:

```css
@import "@design-token-forge/foundation-mobile/top-bar";
```

Then in HTML:

```html
<header class="fm-top-bar" data-density="base">
  <button class="icon-btn fm-top-bar__leading" aria-label="Back">←</button>
  <h1 class="fm-top-bar__title">Notes</h1>
  <button class="icon-btn fm-top-bar__trailing" aria-label="New">＋</button>
</header>
```

## Versioning + LTS

See [GOVERNANCE.md](./GOVERNANCE.md). Foundation gets independent semver;
shape-kits pin to Foundation major.
