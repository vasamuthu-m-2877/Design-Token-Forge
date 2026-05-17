# Component Ledger & Safe-Rebuild Mechanism

> **Status:** Research / specification — NOT YET IMPLEMENTED.
> **Owner:** DTF core. Update this doc in the same PR as any implementation change.
> **Related skills:** `dtf-component-build`, `dtf-component-qc`.
> **Last updated:** 2026-05-17

---

> **Key audit finding (M1, 2026-05-17):** the plugin already writes a
> partial ledger at `figma.root.setPluginData('dtf-component-versions', …)`
> but never reads it back. Build is destructive-then-constructive every
> run, so all variant IDs, property def keys, and library keys are
> invalidated each time. See §11 for the full audit and §11.5 for
> quick-wins.

## 0. Purpose of this document

This file is the single source of truth for **how Design Token Forge updates
Figma components without corrupting designer files**.

It is intentionally long because the problem is deep — the cost of a wrong
implementation is "every consuming file in every project breaks silently."
Read end-to-end before touching `packages/figma-plugin/code.js` component
generation paths.

This doc is **living**:

- New Figma API behaviour discovered → record it in §5 (Field Notes).
- New failure mode observed → add to §3 with reproduction steps.
- Implementation lands → flip the matching checkbox in §10 and link the PR.
- Ledger schema changes → bump `schemaVersion` in §6 and document the
  migration in §7.

---

## 1. The Thumb Rule

> **A Build action must never corrupt instances, overrides, or library
> bindings that already exist in a designer's Figma file.**

Every other rule, schema, and code path in this doc exists to enforce this
single rule. If a change to the builder would violate it, the change is
wrong — even if it makes the happy path simpler.

Concretely, "never corrupt" means:

1. Variant IDs are preserved across rebuilds (instances stay on their chosen
   variant).
2. Component property definition IDs are preserved (instance overrides
   survive renames).
3. Variable bindings are updated in place — never severed and re-created.
4. Library `key` survives — consuming files in other projects don't see
   "Missing component."
5. Designer-side manual additions (custom variants, layer renames, page
   moves) are detected as CAUTION, not silently overwritten.

---

## 2. Why "by-name lookup" is insufficient (current state)

The plugin today (as of 2026-05-17) identifies components by **name** only.
A search like `figma.root.findAll(n => n.name === 'Button')` is the only
"hold" we have. This breaks in every common designer workflow:

| Designer action | What breaks on next rebuild |
|---|---|
| Renames "Button" → "DTF Button" in Layers panel | Plugin creates a 2nd "Button"; renamed one is orphaned |
| Moves component-set to a different page | By-name lookup misses → duplicate created |
| Publishes the component to team library | Local rebuild detaches the published `key`; every consuming file breaks |
| Adds a custom variant manually | Variant-index lookup doesn't see it; gets removed or shifted |
| Overrides a property on one instance | Property rename → override silently lost |

These are **not edge cases**. They are normal designer behaviour. Until we
fix this, every Build is a potential corruption event.

---

## 3. Catalogue of failure modes (live + theoretical)

Categorize by mechanism so the diff/plan engine in §8 can classify them
correctly.

### 3.1 Identity-loss failures (`RISKY` — explicit confirm required)

Deletion of a node Figma was tracking by ID.

- **Delete + recreate variant** → all instances using that variant reset to
  the new set's default variant. No warning. No undo (across plugin runs).
- **Delete + recreate component-set** → every external library reference
  reports "Missing component."
- **Delete + recreate component property** → all instance overrides for
  that property become orphaned (visible in Figma instance panel as
  greyed-out values).
- **Rename via setVariableByName + create** (instead of `.name=`) → severs
  variable bindings on every node that referenced the old variable. This
  is the variables version of the same bug; already in user memory.

### 3.2 Rebinding failures (`CAUTION` — visual change but ID-safe)

ID survives but what it points to changes.

- **Token rebound to a different variable** — bindings unchanged, but the
  variable's resolved value changes. Designer sees a colour shift on the
  next file open. Acceptable but must be reported in the plan.
- **Variant value swap** — variant ID unchanged, but the variant's visual
  output differs from what the designer last saw. Same handling.

### 3.3 Reorder failures (`RISKY` — silent and dangerous)

When the variant matrix is indexed-by-position rather than named.

- **Add new variant in the middle** — old "variant index 3" now resolves
  to a different visual identity. Only happens if our reader keys by
  index. **Rule: always key variants by named coordinate
  (e.g. `primary/large/default`), never by index.**

### 3.4 Property-type changes (`RISKY` — Figma forces ID change)

`componentPropertyDefinitions` IDs encode type. When the type changes:

- **Variant → Boolean** (or any other type swap) → property ID gets a
  new suffix → all instance overrides referencing the old ID orphan.
- We must detect this in the diff and treat as an explicit "Replace
  property X" operation with a designer prompt.

### 3.5 Library/publish failures (`RISKY` — cross-file impact)

- **Local rebuild after publish** — if the plugin deletes the local
  component to recreate it, the library `key` is lost. Consuming files
  break.
- **Republish during structural diff** — if rebuild changes variant
  composition mid-publish, instances in consuming files may pick up
  the new set with the wrong variant selected.

### 3.6 Race conditions (`CAUTION` — multi-user)

- **Two designers running Builder in parallel on the same file** — second
  run overwrites first. Today there is no lock.
- **Designer makes manual edits while Builder runs** — Figma's undo stack
  cannot recover plugin-driven mutations cleanly.

### 3.7 Stale-source failures (`CAUTION` — Build vs Token sync)

- **Build runs before sync-server pushed latest tokens** — component bakes
  in old values. No corruption, but creates "this Figma file doesn't match
  the editor" complaints.
- **Build runs against a project whose CSS hasn't been published yet** —
  similar; component reflects a draft state.

---

## 4. Figma's "hold" surface — what IDs are available

What Figma actually exposes that we can store and look up by.

| ID | Scope | Stability | Survives |
|---|---|---|---|
| `node.id` | File-local | Strong (years) | Rename, move pages, copy in same file |
| `component.key` | Cross-file (publish) | Strong | Publish, library import, file copy |
| `variable.id` | File-local | Strong | We already trust this for the token ledger |
| `componentPropertyDefinitions[key]` | File-local | Strong if property type unchanged | Rename via `editComponentProperty()` |
| Variant name path | File-local | Logical | Use as the *lookup key*, NOT as the source of truth |
| `pluginData[key]` | Per-plugin per-file | Strong since 2020 | File copy, library publish |
| `sharedPluginData[ns][key]` | Cross-plugin per-file | Strong | When other tools need to read our ledger |

Lookup chain (defensive, top to bottom):

1. Stored `nodeId` → still resolves? Use it.
2. Stored `libraryKey` → resolve via `figma.importComponentByKeyAsync`. Use it.
3. By-name match on current page → use it, **and update ledger with new
   nodeId**.
4. By-name match across pages → use it, **and warn designer about page
   move**.
5. Nothing found → treat as new component, create at default location.

---

## 5. Field notes (Figma API gotchas)

Each entry must include date observed + a way to reproduce.

> **Add new entries at the top.**

- *(2026-05-17) Documentation placeholder.* `getNodeByIdAsync` returns
  null for IDs from deleted nodes, but the Figma file may still hold
  references to those IDs in undo history. Treat null as "definitely
  deleted" but record the lookup attempt for telemetry.

- *(2026-05-17) Library import async.* `figma.importComponentByKeyAsync`
  must be awaited; it can take seconds for libraries hosted in different
  workspaces. Builder UI must show a loading state during ledger
  resolution for published components.

---

## 6. Ledger schema (proposed v1)

Stored at:

```
figma.root.setPluginData('dtf-component-ledger', JSON.stringify(ledger))
```

Per-project namespacing — one ledger object per file, internally keyed by
project:

```jsonc
{
  "schemaVersion": 1,
  "writtenAt": "2026-05-17T00:00:00.000Z",
  "writtenBy": "dtf-plugin@2.3.0",
  "projects": {
    "pearl": {
      "components": {
        "button": {
          "version":     "2.0.0",
          "specHash":    "deadbeef…",
          "builtAt":     "2026-05-17T12:34:56.000Z",
          "builtBy":     "sridhar",
          "nodeId":      "1234:5678",     // local component-set id
          "libraryKey":  null,             // populated after publish
          "pageId":      "0:1",            // for cross-page move detection
          "variants": {
            "primary/large/default": "1234:5679",
            "primary/large/hover":   "1234:5680",
            "primary/large/pressed": "1234:5681"
            // … one entry per named variant coordinate
          },
          "properties": {
            "size":     { "defId": "size#1234:0",     "type": "VARIANT" },
            "tone":     { "defId": "tone#1234:1",     "type": "VARIANT" },
            "iconOnly": { "defId": "iconOnly#1234:2", "type": "BOOLEAN" }
          },
          "bindings": {
            "fill":     "VariableID:42:0",
            "content":  "VariableID:42:1",
            "height":   "VariableID:42:7"   // includes comp-size axis
          },
          "axes": {                          // declares WHICH axes this build covers
            "color":   true,
            "spacing": true,
            "radius":  true,
            "motion":  false
          }
        }
      }
    }
  }
}
```

### Why this shape

- **Schema-versioned** so v2 migrations are clean (§7).
- **Namespaced by project** because one file can be open against multiple
  projects (rare but possible) and we never want cross-project bleed.
- **Per-axis flags** so when comp-size lands tomorrow, the diff engine
  knows "this build pre-dates spacing" and treats the new bindings as
  ADDITIVE (safe) rather than REPLACEMENT (caution).
- **Variants keyed by named coordinate**, not index — enforces §3.3 fix.
- **Properties carry their type** so §3.4 type-changes are detectable
  without a separate probe.
- **Records `writtenBy` plugin version** so we can correlate bugs to
  plugin releases.

---

## 7. Migration policy

Forward compatibility rules.

1. **Reader is tolerant.** Unknown keys at any level are preserved on read,
   re-emitted on write. Lets a newer plugin write fields an older plugin
   doesn't understand without losing them on the older plugin's first save.
2. **Writer declares its version.** `writtenBy` lets us blame field-shape
   bugs to a specific plugin release.
3. **Schema bump triggers a migration function.** `migrations/v1-to-v2.js`
   takes a v1 object, returns v2. Run on read, write back.
4. **Ledger is a cache.** If migration fails, fall back to walking the
   file once and rebuilding. **No data is ever lost from corrupting the
   ledger** — worst case is a slow re-scan.
5. **Migration must be tested with a synthetic file** before shipping. Add
   a fixture to `tests/figma-fixtures/` per migration.

---

## 8. Plan-then-apply flow

Every Build is two phases.

### Phase A — Read

1. Load ledger for project.
2. For each requested component, resolve current Figma state via the
   defensive lookup chain (§4).
3. Build a `current` snapshot in the same shape as the ledger entry.
4. Load the target spec from `dist/<project>/components/<name>.manifest.json`.
5. Compute `target` snapshot.

### Phase B — Diff

Pure-JS function. No Figma mutations. Returns:

```jsonc
{
  "component": "button",
  "from": "1.9.0",
  "to":   "2.0.0",
  "safe":    [ /* additive variants, new optional props, new bindings */ ],
  "caution": [ /* rebinds, value changes, page-move detection */ ],
  "risky":   [ /* deletes, type changes, identity loss */ ],
  "blocked": [ /* library-key conflicts, parallel-edit detection */ ]
}
```

### Phase C — Present

Builder UI renders the plan **before** any write. UI rules:

- `safe` items auto-checked.
- `caution` items auto-checked, each shows a one-line "what changes"
  description.
- `risky` items unchecked, each requires explicit toggle ON + a top-level
  "I understand instance overrides may be affected" confirmation.
- `blocked` items show a fix path ("publish first," "ask Designer X to
  finish their build," etc.) and cannot be auto-resolved.

### Phase D — Apply

1. Acquire build lock (§9).
2. For each accepted item, call the appropriate Figma API in
   in-place-update mode (never delete+create unless the diff explicitly
   said so and the user confirmed).
3. Update ledger entry on success.
4. Release lock.
5. Show summary toast: "Button updated to v2.0.0 · 14 variants safe, 2
   rebinds applied, 1 risky change skipped."

---

## 9. Concurrency / locking

For multi-designer safety:

- **Single-file lock:** ledger entry includes `inProgress: { startedAt,
  startedBy }`. Build start writes it; Build end clears it.
- **Stale lock recovery:** if `inProgress.startedAt` is older than 10
  minutes, next Build attempt warns and offers to override. Catches the
  "designer closed Figma mid-build" case.
- **Cross-file lock (future):** for the team-awareness feature in the
  Builder timestamp proposal, write to
  `dist/<project>/components/<name>.lock.json` via GitHub PAT.

---

## 10. Implementation milestones

Each box is a discrete PR. Cross-link the PR when it ships.

- [x] **M1 — Audit current `code.js` component build path.** Document
  every place we do `findAll` or by-name lookup, every `remove()` call,
  every `createComponent…()` call. Output: §11 of this doc populated with
  current behaviour matrix. **No code change.** _Completed 2026-05-17._
- [x] **M2 — Read-only ledger writer.** On every successful Build, write
  the ledger entry. Do NOT use it for lookups yet. Risk: zero (only
  adding writes to pluginData). Unlocks the timestamp pill UI in M3.
  _Shipped 2026-05-17 via W1 (same code path)._
- [x] **M3 — Builder UI timestamp pill.** Reads ledger entries, decorates
  each component row with "Built Xh ago · vN.N.N · K variants." Pure UI,
  no behaviour change. **First user-visible deliverable.** _Shipped
  2026-05-17. See
  [ui-full.html L626-L658](packages/figma-plugin/ui-full.html#L626-L658)
  (CSS),
  [ui-full.html L1003-L1014](packages/figma-plugin/ui-full.html#L1003-L1014)
  (markup), and
  [ui-full.html L2866-L2949](packages/figma-plugin/ui-full.html#L2866-L2949)
  (`renderBuilderMeta` + `fmtBuiltAgo`). Includes drift badge when the
  file's current project differs from the build's `project` field._
- [ ] **M4 — Defensive lookup chain.** Switch Build's "find existing
  component" path from by-name to the §4 chain. Behind a feature flag
  initially.
- [ ] **M5 — Diff engine.** Pure-JS, well-tested, returns the §8
  classified plan. Plug into a "Show plan" button in the Builder UI.
  Still doesn't change Apply behaviour.
- [ ] **M6 — Plan-then-apply Build.** Replace the existing Generate flow
  with the Phase A–D pipeline.
- [ ] **M7 — Library-key tracking + publish-safe rebuild.** Handles §3.5
  failures.
- [ ] **M8 — Build lock + stale-recovery.** Handles §3.6 races.
- [ ] **M9 — Schema v2 (whatever lands next).** First real exercise of
  the migration policy in §7.

Order is deliberate: M1–M3 are safe and give immediate UX value; M4
onwards changes write behaviour and needs the foundation in place.

---

## 11. Current behaviour audit (M1 — read-only)

> Source: [packages/figma-plugin/code.js](packages/figma-plugin/code.js)
> (4138 lines). Audit performed 2026-05-17 against the
> `generateComponentFromBlueprint` path and `wireReactionsForCurrentPage`.

### 11.1 What's already good

The plugin is **not** purely "by-name." It already uses a primitive
ownership/ledger pattern that the §6 schema can extend without rewrite:

1. **Owner stamps** ([code.js L1528-1535](packages/figma-plugin/code.js#L1528-L1535)):
   every node we create gets
   `setPluginData('dtf-owner', BP.name)` + `'dtf-generated', '1'`.
   Cleanup checks this stamp before removing — protects hand-built nodes
   sharing a name prefix.
2. **Shared-primitives guard** ([code.js L1565-L1568](packages/figma-plugin/code.js#L1565-L1568)):
   nodes stamped `dtf-owner = 'DTF-PRIMITIVES'` (Icon/Placeholder, Chevron
   set) are skipped by per-blueprint cleanup. Prevents one BP's rebuild
   from nuking another BP's dependencies.
3. **Component-version ledger already exists**
   ([code.js L3675-L3692](packages/figma-plugin/code.js#L3675-L3692)):
   `figma.root.setPluginData('dtf-component-versions', ...)` writes
   `{ <bpName>: { version, nodeIds[], masterFrameId, generatedAt,
   families[], types, states, totalComponents, architecture } }`.
   This is a real ledger, written today, but **never read back for
   lookup** — only overwritten on each Build.
4. **Variable ID hold is solid** ([code.js L170](packages/figma-plugin/code.js#L170)):
   `dtf-id-map` mirrors the proven "never delete + recreate variables"
   rule from user memory.

### 11.2 What's broken

The current Build is **destructive-then-constructive** for every
component:

1. **Lookup strategy is "stamp-scoped clear + recreate from scratch"**
   ([code.js L1583-L1599](packages/figma-plugin/code.js#L1583-L1599)).
   Section / component-set children matching this BP's owner stamp are
   `child.remove()`-ed at the start of every Build, then rebuilt below.
2. **Component-set itself is replaced**
   ([code.js L1593-L1595](packages/figma-plugin/code.js#L1593-L1595)
   removes any `COMPONENT_SET` with our stamp; then
   [code.js L3388](packages/figma-plugin/code.js#L3388)
   does `figma.combineAsVariants(allComps, page)` to create a new one).
   **Consequence:** every Build mints a new `node.id` for the set and a
   new `node.id` for every variant. All library `key`s are invalidated,
   all variant IDs change, all property def IDs change.
3. **No lookup chain.** There is no
   `getNodeByIdAsync(storedNodeId)` attempt, no
   `importComponentByKeyAsync(storedLibraryKey)` fallback, no by-named-
   coordinate variant lookup — because nothing is read from the existing
   `dtf-component-versions` entry before delete.
4. **Component properties are recreated**
   ([code.js L2685-L2898](packages/figma-plugin/code.js#L2685-L2898)):
   `addComponentProperty(...)` is called fresh each Build. Property
   def keys (e.g. `Icon#1234:0`) change on every run. All instance
   overrides for `Icon`, `label`, `Chevron icon` orphan.
5. **`combineAsVariants` is run on freshly-created components**, never
   on the existing set with new variants appended — so even named
   variants don't survive.
6. **Page move not detected.** The "Components" page is found by name
   ([code.js L1506-L1516](packages/figma-plugin/code.js#L1506-L1516));
   if a designer renames it, a 2nd Components page is created and the
   first becomes orphaned (but not deleted, since cleanup is scoped to
   the *current* page being rebuilt).

### 11.3 Behaviour matrix

| Designer action between Builds | Current outcome |
|---|---|
| Rename component-set in Layers panel | Stamp survives → cleanup removes the renamed set → fresh set created. Library `key` lost. |
| Move Components page elsewhere | Per-page cleanup misses → duplicate set created. Old page retained. |
| Add a manual variant to our set | Stamp on the set → set removed wholesale → manual variant gone. |
| Publish set to team library | Local Build replaces set → published `key` is now an orphan reference in every consuming file. |
| Rename a component property in panel | Property def removed with old set → new set has fresh def key → all instance overrides for that prop orphan. |
| Reorder variants in Variant panel | Set removed → order reset to BP definition order. |
| Override a property value on an instance | Survives until next Build of the parent set, then orphans (per #4 above). |
| Edit a token in editor → Build | Variable IDs survive (good, per `dtf-id-map`). But components rebound to those variables via fresh `setBoundVariable` calls on new nodes — bindings are "new bindings to same variable IDs," not preserved bindings. |

### 11.4 Why the existing pattern is mostly fine for v1

Most current DTF users **only** run Build right after a token edit, on a
clean throwaway file. Corruption is not observed because:

- Nobody publishes the DTF-generated sets to a team library yet.
- Nobody hand-edits the generated sets between Builds.
- Property overrides on instances are rare in a sandbox file.

This means we can roll out the milestones in §10 **without breaking
anyone today**, but the longer we wait the higher the blast radius when
DTF gets used "for real."

### 11.5 Quick-win opportunities (low risk, ship before M5)

These are all small additions that don't change Apply behaviour:

- [x] **W1** — Extend `dtf-component-versions` entry to record full §6
  ledger shape (variants{name→id}, properties{name→defId}, libraryKey,
  pageId, specHash, axes). Still write-only. Unlocks M3 timestamp UI
  with no risk. _Shipped 2026-05-17. See
  [code.js L1607-L1683](packages/figma-plugin/code.js#L1607-L1683)
  (`snapshotComponentSet` + `priorSnapshot`) and
  [code.js L3753-L3805](packages/figma-plugin/code.js#L3753-L3805)
  (extended Step 9 write)._
- [x] **W2** — Add `dtf-page` stamp to the Components page so renames
  don't cause duplicate pages. _Shipped 2026-05-17. See
  [code.js L1521-L1530](packages/figma-plugin/code.js#L1521-L1530)._
- [x] **W3** — Before delete-then-recreate, log a `console.warn` listing
  the IDs about to be invalidated. Gives us telemetry for free.
  _Shipped 2026-05-17. See
  [code.js L1685-L1707](packages/figma-plugin/code.js#L1685-L1707)._

### 11.6 Files touched by M1 (none)

This was a read-only audit. No code changes. Findings above feed M2.

---

## 12. Open design questions

Questions we have not yet resolved. Each one needs a decision before the
relevant milestone can ship.

- **Manifest location:** `dist/<project>/components/<name>.manifest.json`
  (per-project, follows existing CSS publish path) vs
  `packages/components/src/<name>/manifest.json` (one global manifest)?
  Decision needed before M5.
- **Version source of truth:** manual bump in spec vs auto-bump on spec
  hash change. Auto-bump = always accurate but loses semantic meaning;
  manual = batched and meaningful but easy to forget.
- **Plan UI surface:** inline expansion vs modal. Inline scales worse but
  is more discoverable. Decision before M5.
- **Comp-size axis timing:** retrofit ledger entries when comp-size ships,
  or wait until comp-size is in to write the first ledger? Recommendation:
  ship M2 with `axes: { color: true }` only and let the comp-size release
  extend the axes object — that's exactly what schema-versioning is for.
- **Failure telemetry:** do we emit anonymized failure-mode counts back to
  sync-server so we can prioritize fixes? Needs a privacy review.

---

## 13. Risk matrix — "will future Figma break this?"

For each axis the ledger depends on:

| Dependency | Stability | What breaks if Figma changes it | Mitigation |
|---|---|---|---|
| `node.id` format | Very high | Every plugin in the ecosystem | None needed; same risk as Figma itself |
| `component.key` semantics | Very high | All library workflows | Same |
| `variable.id` | High (newer API) | Variable bindings everywhere | Already accepted risk; we mirror the same pattern |
| `componentPropertyDefinitions` shape | Medium | Property-rename handling | Schema v2 migration covers it |
| `pluginData` API | Very high | Every serious plugin | None needed |
| `sharedPluginData` (if we use it) | High | Cross-plugin reads | Document namespace, version-gate |
| `findAll` / `findAllAsync` cost | Medium | Lookup speed only | Ledger removes hot-path dependence |

Bottom line: **ledger durability tracks Figma's own stability promises**.
If those break, the whole Figma plugin ecosystem breaks — not specifically
us. We are not building on novel ground.

---

## 14. References

External:

- Figma Plugin API: https://www.figma.com/plugin-docs/
- Plugin data limits: 100KB/key, 5MB/file aggregate (per docs as of 2026-Q1).
- Variable API reference (the proven precedent we mirror).

Internal:

- `docs/architecture/component-builder/figma-binding-rules.md`
- `docs/architecture/component-builder/variant-axes.md`
- `docs/architecture/component-builder/token-naming-and-aliasing.md`
- User memory: "Figma Variable Sync — CRITICAL" (the never-delete-recreate
  rule that's the foundation of this whole approach).

---

## 15. How to update this doc

1. When you ship a milestone in §10, check the box and link the PR.
2. When you discover an API quirk, add a §5 entry with date + repro.
3. When you change the ledger schema, bump §6, document the migration in
   §7, and add a test fixture per the rule in §7.
4. When you resolve an open question in §12, move it to a "Decisions"
   section at the bottom with the date and rationale.
5. When you discover a new failure mode, add to §3 — even if you don't
   immediately fix it. The catalogue is the safety net.

This document is the *contract*. Code that violates it is wrong, even if
tests pass.
