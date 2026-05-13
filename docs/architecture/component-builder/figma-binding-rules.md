# Figma Binding Rules

The plugin's job is to keep **bindings stable** across regenerations.
A binding is the link from a component property → a Figma variable. If you
break a binding, every existing instance loses its color/spacing/etc.

## The cardinal rule

**NEVER delete-and-recreate a Figma variable.** Figma tracks variables by
internal ID, not name. Delete + recreate = new ID = every binding is severed
permanently. There is no recovery.

```js
// ❌ FORBIDDEN
collection.variables.find(v => v.name === 'button/height').remove();
const fresh = figma.variables.createVariable('button/height', collection, 'FLOAT');
fresh.setValueForMode(modeId, 44);

// ✅ CORRECT — update in place
const existing = collection.variables.find(v => v.name === 'button/height');
existing.setValueForMode(modeId, 44);
```

The only acceptable delete is an **explicit user action** ("Reset & Recreate"
button) with a confirmation dialog, for a corrupted state.

## Renames

Renames are safe — they preserve the ID:
```js
existing.name = 'button/default/height';
```

The plugin's Step 2a runs a self-heal pass on startup that renames legacy
variable names to current convention. Add to that list whenever you change
naming convention; never just update BLUEPRINT and hope users re-run.

## Aliasing as fallback

Some users have files where renames can't run (different team library, locked
collection). Step 2b registers **both old and new names** in the lookup map
so BLUEPRINT can use the new name and the resolver still finds the variable.

```js
varMap['button/height'] = varMap['button/default/height'];
```

## T3 mode lock per Component Set

T3 (Status Context) variables have multiple modes (Brand, Danger, Success,
Warning, Info). When a Component Set lives in the Brand family, **every
variant in that set must be locked to the Brand mode**.

```js
// On the variant component (not master), set explicitMode for the T3 collection
variantComponent.setExplicitVariableModeForCollection(
  t3Collection,
  brandModeId
);
```

Without the lock, a Brand-family component placed on a frame with a different
T3 mode override will switch palettes. We don't want that — family is
horizontal; modes are project-level.

## Per-instance overrides for boolean axes

Boolean axes (Rounded, Loading) can't change a Component Set's structure.
Instead, the plugin clones the master and **rebinds individual properties on
the instance**.

For Rounded:
```js
if (isRounded && radiusRoundedVar) {
  instance.setBoundVariable('topLeftRadius',     radiusRoundedVar);
  instance.setBoundVariable('topRightRadius',    radiusRoundedVar);
  instance.setBoundVariable('bottomLeftRadius',  radiusRoundedVar);
  instance.setBoundVariable('bottomRightRadius', radiusRoundedVar);
}
```

For multi-zone components (split-button), the rebind targets only the
**outer corners** — inner corners remain 0. See
[multi-zone-model.md](./multi-zone-model.md).

## Reactions — scope by axis

Reactions (Hover/Press triggers) link variants. When you have a boolean axis,
**every reaction must include the boolean value in its target descriptor**, or
hovering on Rounded=True flips back to Rounded=False.

```js
// BAD — drops the Rounded axis
target = { Type: 'Filled', State: 'Hover', Size: 'base' };

// GOOD — preserves the active axis value
target = { Type: 'Filled', State: 'Hover', Size: 'base', Rounded: rRounded };
```

## Variable creation order

The plugin's `requiredVars` list is the source of truth for what must exist.
On startup:

1. Verify each var in `requiredVars` exists; create missing ones with default
   values.
2. Run alias rename pass (Step 2a).
3. Build the lookup map with both old and new names (Step 2b).
4. Generate masters.
5. Generate variants (which depend on masters).

Never reorder these steps. Variant generation assumes masters exist;
master generation assumes variables exist.

## Two-tier component model

| Tier | Created by | Owns | Why |
|---|---|---|---|
| Master | `createMaster()` | Structure (sizes, slots, padding) | Reused across all variants |
| Variant wrapper | `createVariant()` | Color overrides, T3 mode lock, opacity | Per-state visual treatment |

The wrapper contains **one instance** of the master. Color overrides happen
on the instance, not the wrapper. The wrapper has no fill of its own — it's
just a frame for variant addressing.

This separation means:
- Resizing a master propagates to every variant.
- A variant can swap colors without touching structure.
- Boolean per-instance overrides (rounded) happen on the instance inside
  the wrapper.

## When tests fail in Figma

Don't iterate blindly via the plugin UI. Use MCP `figma_execute` to query
state:

```js
const v = figma.variables.getLocalVariables()
  .find(v => v.name === 'button/default/height');
console.log(v.id, v.valuesByMode);
```

Then write a one-line fix and rerun. Round-trips through the plugin UI
re-create variables and slow you down by 5×.

## Plugin location

The Figma plugin loads from
`/Users/sridhar-2917/FigmaWorkspace/packages/figma-plugin/`.
**NOT** from any cloned-elsewhere location. If your edits aren't taking
effect, check the file mtime in Finder against the manifest path Figma is
using (Plugins → Development → Manage in development).
