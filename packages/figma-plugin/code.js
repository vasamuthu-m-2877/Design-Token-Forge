/* ═══════════════════════════════════════════════════════════════
   Design Token Forge — Figma Plugin (Live Sync Edition)
   Connects to DTF Sync Server for real-time token updates.
   Uses async Figma APIs for compatibility with Figma 2025+.
   ═══════════════════════════════════════════════════════════════ */

figma.showUI(__html__, { width: 480, height: 560 });

var CODE_VERSION = '2026-05-14-v35';
log('code.js loaded — version ' + CODE_VERSION);

/* ── URL migration via clientStorage (reliable, not blocked like localStorage) ── */
(async function() {
  try {
    var url = await figma.clientStorage.getAsync('dtf-server-url');
    if (url && url.toLowerCase().indexOf('sridharravi90.github.io') !== -1) {
      url = 'https://sridhar-ravi-2917.github.io/Design-Token-Forge';
      await figma.clientStorage.setAsync('dtf-server-url', url);
    }
    if (!url) {
      url = 'https://sridhar-ravi-2917.github.io/Design-Token-Forge';
      await figma.clientStorage.setAsync('dtf-server-url', url);
    }
    figma.ui.postMessage({ type: 'set-server-url', url: url });
  } catch (e) { /* clientStorage unavailable — UI will use its own default */ }
})();

/* ── Component Builder access gate ────────────────────────
   Only the plugin owner sees the component builder.
   Uses figma.currentUser (available in plugins with enableProposedApi). */
var BUILDER_OWNER_ID = null; /* set to a Figma user ID string to restrict, or null to allow all */

function sendUserInfo() {
  try {
    var currentUser = figma.currentUser;
    if (currentUser) {
      log('Current user: ' + currentUser.name + ' (id: ' + currentUser.id + ')');
      /* Authorize if owner ID matches, or if no gate is set */
      var isOwner = !BUILDER_OWNER_ID || currentUser.id === BUILDER_OWNER_ID;
      /* Also authorize by name as fallback */
      if (!isOwner && currentUser.name) {
        var lname = currentUser.name.toLowerCase();
        if (lname.indexOf('sridhar') !== -1) isOwner = true;
      }
      figma.ui.postMessage({ type: 'user-info', name: currentUser.name, id: currentUser.id, authorized: isOwner });
    } else {
      figma.ui.postMessage({ type: 'user-info', name: '', id: '', authorized: false });
    }
  } catch (e) {
    log('User check failed: ' + e.message);
    figma.ui.postMessage({ type: 'user-info', name: '', id: '', authorized: false });
  }
}
/* Send after a short delay so the UI listener is ready */
setTimeout(sendUserInfo, 300);

/* ── Helpers ──────────────────────────────────────────────── */

function hexToRGB(hex) {
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255
  };
}

function toFigmaValue(raw, type) {
  if (type === 'COLOR') return hexToRGB(raw);
  if (type === 'FLOAT')  return parseFloat(raw) || 0;
  return String(raw);
}

function log(msg) {
  console.log('[DTF] ' + msg);
}

/* ── Scan for existing DTF collections ───────────────────── */

var DTF_PREFIXES = ['T0 ', 'T1 ', 'T2 ', 'T3 ', 'DTF /'];
var DTF_EXACT_NAMES = ['primitives-numbers', 'comp size'];

function isDTFCollection(name) {
  for (var p = 0; p < DTF_PREFIXES.length; p++) {
    if (name.indexOf(DTF_PREFIXES[p]) === 0) return true;
  }
  for (var e = 0; e < DTF_EXACT_NAMES.length; e++) {
    if (name === DTF_EXACT_NAMES[e]) return true;
  }
  return false;
}

async function findDTFCollections() {
  var all = await figma.variables.getLocalVariableCollectionsAsync();
  var found = [];
  for (var i = 0; i < all.length; i++) {
    if (isDTFCollection(all[i].name)) {
      found.push(all[i]);
    }
  }
  return found;
}

/* ── Build lookup of existing DTF variables ──────────────── */

async function buildExistingLookup() {
  var cols = await findDTFCollections();
  var colMap = {};   // collectionName => { collection, modeMap, varMap }
  for (var i = 0; i < cols.length; i++) {
    var c = cols[i];
    var modeMap = {};
    for (var m = 0; m < c.modes.length; m++) {
      modeMap[c.modes[m].name] = c.modes[m].modeId;
    }
    var varMap = {};  // varName => figma Variable
    for (var j = 0; j < c.variableIds.length; j++) {
      var v = await figma.variables.getVariableByIdAsync(c.variableIds[j]);
      if (v) varMap[v.name] = v;
    }
    colMap[c.name] = { collection: c, modeMap: modeMap, varMap: varMap };
  }
  return colMap;
}

/* ── Persistent variable ID map — tracks Figma IDs across renames ── */

function loadIdMap() {
  var raw = figma.root.getPluginData('dtf-id-map');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

function saveIdMap(map) {
  figma.root.setPluginData('dtf-id-map', JSON.stringify(map));
}

/* Apply renames to ID map keys (pure data transform, no Figma API calls) */
function applyRenamesToIdMap(renames, idMap) {
  if (!renames || typeof renames !== 'object') return 0;
  var entries = Object.entries(renames);
  var count = 0;
  for (var i = 0; i < entries.length; i++) {
    var oldSuffix = '::' + entries[i][0];
    var newSuffix = '::' + entries[i][1];
    var keys = Object.keys(idMap);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k].endsWith(oldSuffix)) {
        var prefix = keys[k].slice(0, -oldSuffix.length);
        var newKey = prefix + newSuffix;
        /* If the new key already exists (duplicate from a previous partial sync),
           prefer the original variable being renamed — it has component bindings */
        if (idMap[newKey]) {
          log('idMap rename: overwriting duplicate key ' + newKey + ' (old id=' + idMap[newKey] + ' → keeping id=' + idMap[keys[k]] + ')');
        }
        idMap[newKey] = idMap[keys[k]];
        delete idMap[keys[k]];
        count++;
      }
    }
  }
  return count;
}

/* ── Remove orphan variables not present in token data ──── */

async function removeOrphans(data, stats) {
  /* Build set of expected variable names per collection */
  var expectedByCol = {};
  for (var ci = 0; ci < data.collections.length; ci++) {
    var col = data.collections[ci];
    var nameSet = {};
    for (var vi = 0; vi < col.variables.length; vi++) {
      nameSet[col.variables[vi].name] = true;
    }
    expectedByCol[col.name] = nameSet;
  }

  var removed = 0;
  var dtfCols = await findDTFCollections();
  for (var i = 0; i < dtfCols.length; i++) {
    var c = dtfCols[i];
    var expected = expectedByCol[c.name];
    if (!expected) continue; /* Only clean collections we're syncing */
    var colVarIds = c.variableIds.slice(); /* snapshot — avoids mutation issues */
    for (var j = 0; j < colVarIds.length; j++) {
      var v = await figma.variables.getVariableByIdAsync(colVarIds[j]);
      if (v && !expected[v.name]) {
        log('Removing orphan: ' + c.name + ' / ' + v.name);
        try { v.remove(); removed++; } catch (e) {
          log('Failed to remove orphan ' + v.name + ': ' + e.message);
          stats.errors.push('Remove orphan ' + v.name + ': ' + e.message);
        }
      }
    }
  }
  return removed;
}

/* ── Sync all collections — update-in-place, preserving IDs */

async function syncAll(data) {
  var stats = { collections: 0, variables: 0, aliases: 0, updated: 0, created: 0, renamed: 0, orphansRemoved: 0, errors: [] };

  log('syncAll start — code version ' + CODE_VERSION);
  log('Renames in data: ' + (data.renames ? Object.keys(data.renames).length : 0));
  log('Collections in data: ' + data.collections.length);

  /* Load persistent ID map and apply renames to its keys */
  var idMap = loadIdMap();
  var idMapSize = Object.keys(idMap).length;
  log('idMap loaded with ' + idMapSize + ' entries');

  var existing = await buildExistingLookup();
  var existingColNames = Object.keys(existing);
  var existingVarTotal = 0;
  for (var evi = 0; evi < existingColNames.length; evi++) {
    existingVarTotal += Object.keys(existing[existingColNames[evi]].varMap).length;
  }

  /* If no variables exist but idMap has stale entries, clear it —
     those IDs point to deleted variables and cause wasted async lookups */
  if (existingVarTotal === 0 && idMapSize > 0) {
    log('Clearing stale idMap (' + idMapSize + ' entries) — no variables exist in Figma');
    idMap = {};
  }

  if (data.renames) {
    var renameCount = applyRenamesToIdMap(data.renames, idMap);
    stats.renamed = renameCount;
    log('idMap renames applied: ' + renameCount + ' keys transformed');
  }

  /* Build inverse rename map: newName → oldName for fallback lookup */
  var inverseRenames = {};
  if (data.renames) {
    var renameKeys = Object.keys(data.renames);
    for (var ri = 0; ri < renameKeys.length; ri++) {
      inverseRenames[data.renames[renameKeys[ri]]] = renameKeys[ri];
    }
  }

  var existing = await buildExistingLookup();
  var existingColNames = Object.keys(existing);
  log('Existing DTF collections in Figma: ' + (existingColNames.length > 0 ? existingColNames.join(', ') : '(none)') + ' — ' + existingVarTotal + ' total vars');
  for (var eli = 0; eli < existingColNames.length; eli++) {
    var elName = existingColNames[eli];
    var elVarCount = Object.keys(existing[elName].varMap).length;
    log('  ' + elName + ': ' + elVarCount + ' variables');
  }

  /* ── Pass 0: DIRECT PRE-SYNC RENAME ────────────────────────────────
     Bypass all lookup logic — iterate actual Figma variables in each
     collection and rename any that match a renames entry directly.
     This guarantees renames happen regardless of idMap/varMap state. */
  if (data.renames && Object.keys(data.renames).length > 0) {
    var directRenames = 0;
    var allDTFCols = await findDTFCollections();
    for (var dri = 0; dri < allDTFCols.length; dri++) {
      var drCol = allDTFCols[dri];
      var drVarIds = drCol.variableIds.slice();
      for (var drvi = 0; drvi < drVarIds.length; drvi++) {
        var drVar = await figma.variables.getVariableByIdAsync(drVarIds[drvi]);
        if (!drVar) continue;
        var newName = data.renames[drVar.name];
        if (newName) {
          /* Check if another variable already has the target name */
          for (var drdi = 0; drdi < drVarIds.length; drdi++) {
            if (drdi === drvi) continue;
            var drDup = await figma.variables.getVariableByIdAsync(drVarIds[drdi]);
            if (drDup && drDup.name === newName) {
              log('Pass0: removing blocker ' + newName + ' (id=' + drDup.id + ')');
              try { drDup.remove(); } catch (dre) { log('Pass0 remove failed: ' + dre.message); }
            }
          }
          log('Pass0 RENAME: ' + drVar.name + ' → ' + newName + ' (id=' + drVar.id + ')');
          try {
            drVar.name = newName;
            if (drVar.name === newName) {
              directRenames++;
              /* Update idMap to reflect new name */
              idMap[drCol.name + '::' + newName] = drVar.id;
            } else {
              log('Pass0 WARN: rename assignment did not stick for ' + newName + ' (got ' + drVar.name + ')');
            }
          } catch (drErr) {
            log('Pass0 ERROR renaming ' + drVar.name + ': ' + drErr.message);
            stats.errors.push('Pass0 rename ' + drVar.name + ': ' + drErr.message);
          }
        }
      }
    }
    log('Pass0 direct renames completed: ' + directRenames);
    stats.renamed += directRenames;

    /* Rebuild existing lookup since names changed */
    if (directRenames > 0) {
      existing = await buildExistingLookup();
    }
  }

  /* Pass 1: Create/update collections, modes, and variables.
     Build a lookup so aliases can be resolved in pass 2. */
  var varLookup = {}; // "CollectionName::VarPath" => figma Variable obj
  var pendingAliases = []; // { variable, modeId, ref }

  for (var ci = 0; ci < data.collections.length; ci++) {
    var col = data.collections[ci];
    try {
      var collection, modeMap;
      var ex = existing[col.name];

      if (ex) {
        /* ─── Reuse existing collection ─── */
        collection = ex.collection;
        modeMap = ex.modeMap;

        /* Ensure all required modes exist */
        for (var mi = 0; mi < col.modes.length; mi++) {
          if (!modeMap[col.modes[mi]]) {
            try {
              var newModeId = collection.addMode(col.modes[mi]);
              modeMap[col.modes[mi]] = newModeId;
            } catch (modeErr) {
              stats.errors.push('Mode ' + col.modes[mi] + ' in ' + col.name + ': ' + modeErr.message);
              log('Mode limit hit: ' + col.modes[mi] + ' — ' + modeErr.message);
            }
          }
        }

        /* Reorder modes to match server order if different */
        try {
          var desiredModeIds = [];
          for (var mri = 0; mri < col.modes.length; mri++) {
            if (modeMap[col.modes[mri]]) desiredModeIds.push(modeMap[col.modes[mri]]);
          }
          if (desiredModeIds.length > 1) {
            var currentOrder = collection.modes.map(function(m) { return m.modeId; });
            var needsReorder = false;
            for (var coi = 0; coi < desiredModeIds.length; coi++) {
              if (currentOrder[coi] !== desiredModeIds[coi]) { needsReorder = true; break; }
            }
            if (needsReorder) {
              /* Figma doesn't have reorderModes — rebuild: remove extra modes,
                 but only if the first mode is wrong (most common case).
                 Use removeMode + addMode to shift order. */
              log('Mode order mismatch in ' + col.name + ' — current first: ' +
                collection.modes[0].name + ', desired first: ' + col.modes[0]);
            }
          }
        } catch (reorderErr) {
          log('Mode reorder check failed: ' + reorderErr.message);
        }
      } else {
        /* ─── Create new collection ─── */
        collection = figma.variables.createVariableCollection(col.name);
        modeMap = {};
        var firstModeId = collection.modes[0].modeId;
        collection.renameMode(firstModeId, col.modes[0]);
        modeMap[col.modes[0]] = firstModeId;

        for (var mi2 = 1; mi2 < col.modes.length; mi2++) {
          try {
            var newMId = collection.addMode(col.modes[mi2]);
            modeMap[col.modes[mi2]] = newMId;
          } catch (modeErr2) {
            stats.errors.push('Mode ' + col.modes[mi2] + ' in ' + col.name + ': ' + modeErr2.message);
            log('Mode limit hit: ' + col.modes[mi2] + ' — ' + modeErr2.message);
          }
        }
      }
      stats.collections++;

      if (col.hiddenFromPublishing) {
        collection.hiddenFromPublishing = true;
      }

      for (var vi = 0; vi < col.variables.length; vi++) {
        var v = col.variables[vi];
        var resolvedType = null;
        if (v.type === 'COLOR')  resolvedType = 'COLOR';
        if (v.type === 'FLOAT')  resolvedType = 'FLOAT';
        if (v.type === 'STRING') resolvedType = 'STRING';
        if (!resolvedType) continue;

        try {
          var variable;
          var tokenKey = col.name + '::' + v.name;
          var existingVar = null;

          /* 1. Try ID map — finds variable even after renames */
          if (idMap[tokenKey]) {
            try {
              var byId = await figma.variables.getVariableByIdAsync(idMap[tokenKey]);
              if (byId) {
                if (byId.name !== v.name) {
                  /* Before renaming, remove any duplicate with the target name
                     to prevent naming conflicts (mirrors Step 2 logic) */
                  if (ex) {
                    var dupById = ex.varMap[v.name];
                    if (dupById && dupById.id !== byId.id) {
                      log('Step1: removing duplicate ' + v.name + ' (id=' + dupById.id + ') before renaming ' + byId.name);
                      try { dupById.remove(); stats.orphansRemoved++; } catch (de) {
                        log('Failed to remove duplicate: ' + de.message);
                      }
                    }
                  }
                  log('ID-match rename: ' + byId.name + ' → ' + v.name);
                  byId.name = v.name;
                  /* Verify rename actually took effect */
                  if (byId.name === v.name) {
                    existingVar = byId;
                    stats.renamed++;
                  } else {
                    log('WARN: rename did not take effect for ' + v.name + ' (still ' + byId.name + ')');
                    /* Clear idMap entry so Steps 2/3 can find it */
                    delete idMap[tokenKey];
                  }
                } else {
                  /* Name already matches — use as-is */
                  existingVar = byId;
                }
              }
            } catch (idErr) {
              log('Step1 error for ' + v.name + ': ' + (idErr.message || idErr));
              /* DO NOT set existingVar — let Steps 2/3 handle it */
              delete idMap[tokenKey];
            }
          }

          /* 2. Rename path: find variable by OLD name, rename it in-place
                (preserves original Figma ID + component bindings).
                If a duplicate already exists with the NEW name, delete it. */
          if (!existingVar && ex && inverseRenames[v.name]) {
            var oldName = inverseRenames[v.name];
            var original = ex.varMap[oldName];
            if (original) {
              /* Delete any duplicate that was created with the new name */
              var dup = ex.varMap[v.name];
              if (dup && dup.id !== original.id) {
                log('Removing duplicate: ' + v.name + ' (id=' + dup.id + ') — keeping original ' + oldName);
                try { dup.remove(); stats.orphansRemoved++; } catch (de) {
                  log('Failed to remove duplicate ' + v.name + ': ' + de.message);
                }
              }
              log('Rename in-place: ' + oldName + ' → ' + v.name);
              original.name = v.name;
              existingVar = original;
              stats.renamed++;
            }
          }

          /* 3. Fallback: match by current name in collection */
          if (!existingVar && ex) {
            existingVar = ex.varMap[v.name];
          }

          if (existingVar) {
            /* ─── Update existing variable in-place ─── */
            variable = existingVar;
            stats.updated++;
          } else {
            /* ─── Create new variable ─── */
            variable = figma.variables.createVariable(v.name, collection, resolvedType);
            stats.created++;
          }

          /* Track Figma variable ID for future syncs */
          idMap[tokenKey] = variable.id;

          varLookup[col.name + '::' + v.name] = variable;

          if (Array.isArray(v.scopes)) {
            try {
              variable.scopes = v.scopes;
            } catch (scopeErr) {
              log('Scope error on ' + v.name + ': ' + scopeErr.message);
            }
          }

          var modeNames = Object.keys(v.values);
          for (var ki = 0; ki < modeNames.length; ki++) {
            var modeName = modeNames[ki];
            var mId = modeMap[modeName];
            if (!mId) continue;
            var rawVal = v.values[modeName];

            if (rawVal && typeof rawVal === 'object' && rawVal.type === 'VARIABLE_ALIAS') {
              pendingAliases.push({ variable: variable, modeId: mId, ref: rawVal });
            } else {
              variable.setValueForMode(mId, toFigmaValue(rawVal, resolvedType));
            }
          }
          stats.variables++;
        } catch (ve) {
          stats.errors.push(v.name + ': ' + ve.message);
        }
      }
    } catch (ce) {
      stats.errors.push('Collection ' + col.name + ': ' + ce.message);
    }
  }

  /* Pass 2: Resolve alias references now that all variables exist */
  for (var ai = 0; ai < pendingAliases.length; ai++) {
    var pa = pendingAliases[ai];
    var lookupKey = pa.ref.collection + '::' + pa.ref.name;
    var target = varLookup[lookupKey];
    if (target) {
      try {
        var alias = figma.variables.createVariableAlias(target);
        pa.variable.setValueForMode(pa.modeId, alias);
        stats.aliases++;
      } catch (ae) {
        stats.errors.push('Alias ' + pa.ref.name + ': ' + ae.message);
      }
    } else {
      stats.errors.push('Alias target not found: ' + lookupKey);
    }
  }

  /* Pass 2.5: Verify variable names — force-fix any that didn't rename correctly.
     This is a safety net for edge cases where byId.name = newName silently fails. */
  var nameFixes = 0;
  for (var nci = 0; nci < data.collections.length; nci++) {
    var ncol = data.collections[nci];
    for (var nvi = 0; nvi < ncol.variables.length; nvi++) {
      var nv = ncol.variables[nvi];
      var nKey = ncol.name + '::' + nv.name;
      var nVar = varLookup[nKey];
      if (nVar && nVar.name !== nv.name) {
        log('Pass2.5 force-rename: ' + nVar.name + ' → ' + nv.name);
        try {
          /* Find and remove any variable blocking the target name */
          var dtfCols2 = await findDTFCollections();
          for (var dci = 0; dci < dtfCols2.length; dci++) {
            if (dtfCols2[dci].name === ncol.name) {
              for (var dvi = 0; dvi < dtfCols2[dci].variableIds.length; dvi++) {
                var blocker = await figma.variables.getVariableByIdAsync(dtfCols2[dci].variableIds[dvi]);
                if (blocker && blocker.name === nv.name && blocker.id !== nVar.id) {
                  log('Pass2.5: removing blocker ' + nv.name + ' (id=' + blocker.id + ')');
                  blocker.remove();
                }
              }
              break;
            }
          }
          nVar.name = nv.name;
          nameFixes++;
        } catch (nfe) {
          log('Pass2.5 rename failed for ' + nv.name + ': ' + nfe.message);
          stats.errors.push('Force-rename ' + nv.name + ': ' + nfe.message);
        }
      }
    }
  }
  if (nameFixes > 0) {
    log('Pass2.5: fixed ' + nameFixes + ' variable names');
    stats.renamed += nameFixes;
  }

  /* Pass 3: Remove orphan variables not in token data */
  stats.orphansRemoved = await removeOrphans(data, stats);
  if (stats.orphansRemoved > 0) {
    log('Removed ' + stats.orphansRemoved + ' orphan variable(s)');
  }

  /* Persist updated ID map (prune stale entries) */
  var validKeys = {};
  for (var vci = 0; vci < data.collections.length; vci++) {
    var vc = data.collections[vci];
    for (var vvi = 0; vvi < vc.variables.length; vvi++) {
      validKeys[vc.name + '::' + vc.variables[vvi].name] = true;
    }
  }
  var staleKeys = Object.keys(idMap);
  for (var ski = 0; ski < staleKeys.length; ski++) {
    if (!validKeys[staleKeys[ski]]) delete idMap[staleKeys[ski]];
  }
  saveIdMap(idMap);

  /* Final diagnostic: check for any remaining old-name variables */
  if (data.renames) {
    var oldNames = Object.keys(data.renames);
    var remaining = [];
    var finalCols = await findDTFCollections();
    for (var fci = 0; fci < finalCols.length; fci++) {
      var fc = finalCols[fci];
      for (var fvi = 0; fvi < fc.variableIds.length; fvi++) {
        var fv = await figma.variables.getVariableByIdAsync(fc.variableIds[fvi]);
        if (fv && data.renames[fv.name]) {
          remaining.push(fc.name + '/' + fv.name);
        }
      }
    }
    if (remaining.length > 0) {
      log('WARNING: ' + remaining.length + ' variables still have old names after sync:');
      for (var rmi = 0; rmi < Math.min(remaining.length, 10); rmi++) {
        log('  ' + remaining[rmi]);
      }
      stats.errors.push(remaining.length + ' variables failed to rename (check console)');
    } else {
      log('✓ All renames verified — no old names remain');
    }
  }

  /* Pass 4: Post-sync verification — ensure variables actually exist.
     If stats say we created/updated N variables but Figma has 0,
     something went silently wrong. Log and report it. */
  var verifyCols = await findDTFCollections();
  var verifyTotal = 0;
  for (var vfi = 0; vfi < verifyCols.length; vfi++) {
    verifyTotal += verifyCols[vfi].variableIds.length;
  }
  log('Post-sync verification: ' + verifyTotal + ' variables in ' + verifyCols.length + ' collections');
  if (verifyTotal === 0 && stats.variables > 0) {
    log('ERROR: sync reported ' + stats.variables + ' variables but Figma has 0 — variables may not have persisted');
    stats.errors.push('Sync created ' + stats.variables + ' variables but verification found 0 — try re-syncing');
  }
  stats.variables = verifyTotal; /* Use actual Figma count, not theoretical */

  return stats;
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT GENERATOR — builds Figma ComponentSets from blueprints
   ═══════════════════════════════════════════════════════════════ */

/* Build a variable lookup map for a named collection */
async function buildCollectionVarMap(collectionName) {
  var allCols = await figma.variables.getLocalVariableCollectionsAsync();
  var map = {};
  for (var i = 0; i < allCols.length; i++) {
    if (allCols[i].name !== collectionName) continue;
    for (var j = 0; j < allCols[i].variableIds.length; j++) {
      var v = await figma.variables.getVariableByIdAsync(allCols[i].variableIds[j]);
      if (v) map[v.name] = v;
    }
    break;
  }
  return map;
}

/* Bind a color variable to a node's fills or strokes */
function setPaintBoundToVariable(node, paintField, variable) {
  var paint = { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 }, opacity: 1, visible: true };
  try {
    paint = figma.variables.setBoundVariableForPaint(paint, 'color', variable);
  } catch (e) {
    /* Fallback: manual boundVariables reference */
    paint.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: variable.id } };
  }
  node[paintField] = [paint];
}

/* Try to bind a variable to a numeric/boolean node property */
async function tryBindVar(node, field, variable) {
  if (!variable) return false;
  try {
    node.setBoundVariable(field, variable);
    return true;
  } catch (e) {
    log('bindVar failed: ' + field + ' on ' + node.name + ' — ' + e.message);
    return false;
  }
}

/* ══════════════════════════════════════════════════════════════
   BUTTON BLUEPRINT — Two-Tier Master/Instance Architecture
   ──────────────────────────────────────────────────────────────
   TIER 1 — Master components: own structure + spacing (comp-size vars)
   TIER 2 — Variant components: contain master instances, own color/state
   ══════════════════════════════════════════════════════════════ */

var BUTTON_BLUEPRINT = {
  name: 'Button',
  description: 'A multi-purpose button supporting 4 structures (Filled, Outlined, Ghost, Fill & Outline), 10 density sizes, icon + text slots, and full state coverage. Uses comp-size variables for spacing and T2/T3 context tokens for color.',

  /* Master component layouts (TIER 1)
     Each master defines: slots, rootPAlign, and slot-specific overrides.
     ─────────────────────────────────────────────────────────────────────────
     Smart padding model:
       - Each wrapper only owns its OUTER-EDGE padding.
       - Inner edges are always 0 — root itemSpacing (gap var) handles spacing.
       - When a wrapper is the ONLY slot, it owns BOTH L and R.
       - Padding binding is auto-derived from slot position (first→padL, last→padR).
  */
  masters: {
    'Icon + Text': {
      slots: ['iconWrapper', 'textWrapper'],
      rootPAlign: 'MIN',
      iconWrapperPAlign: 'MIN'
    },
    'Text Button': {
      slots: ['textWrapper'],
      rootPAlign: 'MIN'
    },
    'Icon Button': {
      slots: ['iconWrapper'],
      rootPAlign: 'CENTER',
      iconWrapperPAlign: 'CENTER'
    }
  },

  /* comp-size variable paths bound on master components.
     Padding bindings are per-edge so the generator can pick L, R, or both
     depending on the slot's position in the master. */
  sizeBindings: {
    root: {
      height:           'button/default/height',
      topLeftRadius:    'button/default/radius',
      topRightRadius:   'button/default/radius',
      bottomLeftRadius: 'button/default/radius',
      bottomRightRadius:'button/default/radius'
    },
    iconWrapperPadL:      'button/default/icon wrapper padding L',
    iconWrapperPadR:      'button/default/icon wrapper padding R',
    iconPad:              'button/default/icon pad',
    textWrapperPadL:      'button/default/text wrapper padding L',
    textWrapperPadR:      'button/default/text wrapper padding R',
    icon: {
      width:  'button/default/icon container',
      height: 'button/default/icon container'
    },
    text: {
      fontSize: 'button/default/font-size'
    }
  },

  /* Default content color applied in master (T2 Surface Context) */
  masterContentColor: 'default/content/default',

  /* ── Families ──────────────────────────────────────────────
     Each family produces its own component set per master.
     - Neutral: structural variants on T2 surface context (theme-aware greys).
     - Brand:   semantic variants on T3 status context, locked to 'brand' mode
                (uses the project's brand palette via T3 → T1 alias chain).

     stateOverrides format:
       String values  = T2 Surface Context path.
       { t3: path }   = T3 Status Context path (resolved in family.t3Mode).
     ─────────────────────────────────────────────────────────── */
  families: {
    'Neutral': {
      types:  ['Filled', 'Outlined', 'Ghost', 'Fill & Outline'],
      states: ['Default', 'Hover', 'Pressed', 'Selected', 'Focus', 'Disabled'],
      stateOverrides: {
        'Filled': {
          'Default':  { fill: 'default/component/bg-default' },
          'Hover':    { fill: 'default/component/bg-hover' },
          'Pressed':  { fill: 'default/component/bg-pressed' },
          'Selected': { t3Mode: 'brand',
                        fill: { t3: 'container/bg' }, stroke: { t3: 'component/outline-default' }, strokeWeight: 2,
                        text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
          'Focus':    { fill: 'default/component/bg-default', stroke: { t3: 'component/outline-default' }, strokeWeight: 2 },
          'Disabled': { fill: 'default/component/bg-default', componentOpacity: 0.3 }
        },
        'Outlined': {
          'Default':  { stroke: 'default/component/outline-default', strokeWeight: 1 },
          'Hover':    { fill: 'default/component/bg-hover',   stroke: 'default/component/outline-default', strokeWeight: 1 },
          'Pressed':  { fill: 'default/component/bg-pressed', stroke: 'default/component/outline-default', strokeWeight: 1 },
          'Selected': { t3Mode: 'brand',
                        fill: { t3: 'container/bg' }, stroke: { t3: 'component/outline-default' }, strokeWeight: 2,
                        text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
          'Focus':    { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 },
          'Disabled': { stroke: 'default/component/outline-default', strokeWeight: 1, componentOpacity: 0.3 }
        },
        'Ghost': {
          'Default':  {},
          'Hover':    { fill: 'default/component/bg-hover' },
          'Pressed':  { fill: 'default/component/bg-pressed' },
          'Selected': { t3Mode: 'brand',
                        fill: { t3: 'container/bg' }, stroke: { t3: 'component/outline-default' }, strokeWeight: 2,
                        text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
          'Focus':    { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 },
          'Disabled': { componentOpacity: 0.3 }
        },
        'Fill & Outline': {
          'Default':  { fill: 'default/component/bg-default', stroke: 'default/component/outline-default', strokeWeight: 1 },
          'Hover':    { fill: 'default/component/bg-hover',   stroke: 'default/component/outline-default', strokeWeight: 1 },
          'Pressed':  { fill: 'default/component/bg-pressed', stroke: 'default/component/outline-default', strokeWeight: 1 },
          'Selected': { t3Mode: 'brand',
                        fill: { t3: 'container/bg' }, stroke: { t3: 'component/outline-default' }, strokeWeight: 2,
                        text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
          'Focus':    { fill: 'default/component/bg-default', stroke: { t3: 'component/outline-default' }, strokeWeight: 2 },
          'Disabled': { fill: 'default/component/bg-default', stroke: 'default/component/outline-default', strokeWeight: 1, componentOpacity: 0.3 }
        }
      }
    },

    /* ── BRAND FAMILY ──────────────────────────────────────────
       4 semantic variants, all bound to T3 collection's 'brand' mode.
       Maps to real-world button hierarchies:
         Primary   = high-emphasis, brand-filled, white text       (Call-to-Action)
         Secondary = brand outline, brand text                     (Confirm / next-tier action)
         Tertiary  = tonal brand container fill, brand text         (Quiet emphasis)
         Ghost     = no chrome, brand text                          (Inline / minimal)
       Selected state intentionally omitted — toggle/selection isn't a brand-button concept.
       ────────────────────────────────────────────────────────── */
    'Brand': {
      types:  ['Primary', 'Secondary', 'Tertiary', 'Ghost'],
      states: ['Default', 'Hover', 'Pressed', 'Focus', 'Disabled'],
      t3Mode: 'brand',
      stateOverrides: {
        'Primary': {
          'Default':  { fill: { t3: 'component/bg-default' },
                        text: { t3: 'oncomponent-content/default' }, icon: { t3: 'oncomponent-content/default' } },
          'Hover':    { fill: { t3: 'component/bg-hover' },
                        text: { t3: 'oncomponent-content/default' }, icon: { t3: 'oncomponent-content/default' } },
          'Pressed':  { fill: { t3: 'component/bg-pressed' },
                        text: { t3: 'oncomponent-content/default' }, icon: { t3: 'oncomponent-content/default' } },
          'Focus':    { fill: { t3: 'component/bg-default' }, stroke: { t3: 'component/outline-default' }, strokeWeight: 2,
                        text: { t3: 'oncomponent-content/default' }, icon: { t3: 'oncomponent-content/default' } },
          'Disabled': { fill: { t3: 'component/bg-default' }, componentOpacity: 0.3,
                        text: { t3: 'oncomponent-content/default' }, icon: { t3: 'oncomponent-content/default' } }
        },
        'Secondary': {
          'Default':  { stroke: { t3: 'component/outline-default' }, strokeWeight: 1,
                        text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          'Hover':    { fill: { t3: 'container/bg' }, stroke: { t3: 'component/outline-hover' }, strokeWeight: 1,
                        text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          'Pressed':  { fill: { t3: 'container/hover' }, stroke: { t3: 'component/outline-pressed' }, strokeWeight: 1,
                        text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          'Focus':    { stroke: { t3: 'component/outline-default' }, strokeWeight: 2,
                        text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          'Disabled': { stroke: { t3: 'component/outline-default' }, strokeWeight: 1, componentOpacity: 0.3,
                        text: { t3: 'content/default' }, icon: { t3: 'content/default' } }
        },
        'Tertiary': {
          'Default':  { fill: { t3: 'container/bg' },
                        text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
          'Hover':    { fill: { t3: 'container/hover' },
                        text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
          'Pressed':  { fill: { t3: 'container/pressed' },
                        text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
          'Focus':    { fill: { t3: 'container/bg' }, stroke: { t3: 'container/outline' }, strokeWeight: 2,
                        text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
          'Disabled': { fill: { t3: 'container/bg' }, componentOpacity: 0.3,
                        text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } }
        },
        'Ghost': {
          'Default':  { text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          'Hover':    { fill: { t3: 'container/bg' },
                        text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          'Pressed':  { fill: { t3: 'container/hover' },
                        text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          'Focus':    { stroke: { t3: 'component/outline-default' }, strokeWeight: 2,
                        text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          'Disabled': { componentOpacity: 0.3,
                        text: { t3: 'content/default' }, icon: { t3: 'content/default' } }
        }
      }
    }
  }
};

/* ══════════════════════════════════════════════════════════════
   SPLIT BUTTON BLUEPRINT — Wrapper + Button-Instance Architecture
   ──────────────────────────────────────────────────────────────
   Per multi-zone-model.md (Q1–Q7), refined for Option B (button reuse):
     Q1: nested zones inside a wrapper (action [= button instance] + chevron)
     Q3: divider rendered as a 1px LEFT-edge stroke on the chevron zone
         (no sibling node, no thickness var)
     Q4: outer corners owned by wrapper; clipsContent=true clips the inner
         button-instance corners flush
     Q5: Rounded boolean variant axis only
     Q6: ALL action-zone tokens INHERIT from button (the action zone IS a
         button instance — single source of truth, automatic propagation).
         STRUCTURAL tokens OWNED by split-button:
           - split-button/chevron/padding  (chevron zone padding)
           - split-button/chevron/size       (chevron icon container)
     Q7: ~6 component-level reactions per type (Default↔Hover, Default↔Pressed)

   Each split-button master = HORIZONTAL frame containing:
     [button-instance (action)] · [chevron zone with leftStroke = divider]

   The action zone is an INSTANCE of one of the 3 button masters:
     'Text + Chevron'         → instance of button 'Text Button'
     'Icon + Text + Chevron'  → instance of button 'Icon + Text'
     'Icon + Chevron'         → instance of button 'Icon Button'

   Variant overrides apply fill/stroke to BOTH the button instance AND the
   chevron zone (so both halves stay visually unified). The chevron zone's
   leftStroke is bound to the separator color and is independent of the
   variant's main fill/stroke.
   ══════════════════════════════════════════════════════════════ */

var SPLIT_BUTTON_BLUEPRINT = {
  name: 'Split Button',
  description: 'A two-zone action+menu button. Action zone is a button-master instance (inherits all button tokens). Trigger zone (chevron) opens a menu. Divider = 1px stroke between zones.',

  /* Discriminator: tells the generator to use wrapper-with-button-instance
     master construction. Variant overrides apply to the wrapper itself —
     fills naturally show through the transparent button-instance and
     chevron-zone children, so both halves stay color-unified. */
  kind: 'wrapper-with-button-instance',

  /* Master shapes — each maps to an existing button master used as the
     action zone. The chevron zone is implicit and always present. */
  masters: {
    'Text + Chevron': {
      buttonMaster: 'Text Button'
    },
    'Icon + Text + Chevron': {
      buttonMaster: 'Icon + Text'
    },
    'Icon + Chevron': {
      buttonMaster: 'Icon Button'
    }
  },

  /* comp-size variable paths for STRUCTURAL tokens (split-button-owned).
     Action-zone bindings are NOT here — they come from the button instance
     automatically. Only the chevron zone needs explicit bindings. */
  sizeBindings: {
    /* Wrapper root: height + 4 outer corners INHERIT from button. */
    root: {
      height:           'button/default/height',
      topLeftRadius:    'button/default/radius',
      topRightRadius:   'button/default/radius',
      bottomLeftRadius: 'button/default/radius',
      bottomRightRadius:'button/default/radius'
    },
    /* Chevron zone — STRUCTURAL, owned. Symmetric padding around chevron. */
    chevronWrapperPadL:   'split-button/chevron/padding',
    chevronWrapperPadR:   'split-button/chevron/padding',
    chevron: {
      width:  'split-button/chevron/size',
      height: 'split-button/chevron/size'
    }
  },

  /* Default content color applied to chevron icon (T2 Surface Context).
     The button instance carries its own content color from button master. */
  masterContentColor: 'default/content/default',

  /* Divider color binding strategy.
     Bound as the chevron zone's LEFT stroke (strokeLeftWeight=1).
     Neutral family → T2 'default/component/separator'.
     Brand   family → T3 'component/separator' (resolved in family.t3Mode). */
  dividerColor: {
    t2: 'default/component/separator',
    t3: 'component/separator'
  },

  /* ── Families ──────────────────────────────────────────────
     Mirror BUTTON_BLUEPRINT's families exactly so split-button has
     visual + state parity with button.

  /* ── Families ──────────────────────────────────────────────
     Per-zone state variants (Option B).

     The state axis has 8 values that combine action-zone and trigger-zone
     state independently:

       Default          → both zones rest
       Action Hover     → action zone hover,  trigger rest
       Action Pressed   → action zone pressed, trigger rest
       Trigger Hover    → action rest, trigger zone hover
       Trigger Pressed  → action rest, trigger zone pressed
       Selected         → both zones selected (whole component is "on")
       Focus            → both zones rest, wrapper gets focus ring stroke
       Disabled         → both zones rest, wrapper gets opacity 0.3

     Per type, we declare semantic state SPECS (rest / hover / pressed /
     selected / focus / disabled). The generator expands each spec to
     per-zone overrides at variant time. This keeps the data tight and
     authoring per-type painless.

     A spec entry shape:
       { fill, stroke, strokeWeight, text, icon }   ← applied per zone
       wrapper: { stroke, strokeWeight, componentOpacity, fill } ← applied to wrapper
     ─────────────────────────────────────────────────────────── */
  states: ['Default', 'Action Hover', 'Action Pressed', 'Trigger Hover', 'Trigger Pressed', 'Selected', 'Focus', 'Disabled'],

  families: {
    'Neutral': {
      types: ['Filled', 'Outlined', 'Ghost', 'Fill & Outline'],
      typeSpecs: {
        'Filled': {
          rest:     { fill: 'default/component/bg-default' },
          hover:    { fill: 'default/component/bg-hover' },
          pressed:  { fill: 'default/component/bg-pressed' },
          selected: { t3Mode: 'brand',
                      fill: { t3: 'container/bg' }, text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' },
                      wrapper: { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 } },
          focus:    { fill: 'default/component/bg-default',
                      wrapper: { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 } },
          disabled: { fill: 'default/component/bg-default',
                      wrapper: { componentOpacity: 0.3 } }
        },
        'Outlined': {
          rest:     {},
          hover:    { fill: 'default/component/bg-hover' },
          pressed:  { fill: 'default/component/bg-pressed' },
          selected: { t3Mode: 'brand',
                      fill: { t3: 'container/bg' }, text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' },
                      wrapper: { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 } },
          focus:    { wrapper: { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 } },
          disabled: { wrapper: { stroke: 'default/component/outline-default', strokeWeight: 1, componentOpacity: 0.3 } },
          wrapperBase: { stroke: 'default/component/outline-default', strokeWeight: 1 }
        },
        'Ghost': {
          rest:     {},
          hover:    { fill: 'default/component/bg-hover' },
          pressed:  { fill: 'default/component/bg-pressed' },
          selected: { t3Mode: 'brand',
                      fill: { t3: 'container/bg' }, text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' },
                      wrapper: { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 } },
          focus:    { wrapper: { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 } },
          disabled: { wrapper: { componentOpacity: 0.3 } }
        },
        'Fill & Outline': {
          rest:     { fill: 'default/component/bg-default' },
          hover:    { fill: 'default/component/bg-hover' },
          pressed:  { fill: 'default/component/bg-pressed' },
          selected: { t3Mode: 'brand',
                      fill: { t3: 'container/bg' }, text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' },
                      wrapper: { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 } },
          focus:    { fill: 'default/component/bg-default',
                      wrapper: { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 } },
          disabled: { fill: 'default/component/bg-default',
                      wrapper: { stroke: 'default/component/outline-default', strokeWeight: 1, componentOpacity: 0.3 } },
          wrapperBase: { stroke: 'default/component/outline-default', strokeWeight: 1 }
        }
      }
    },

    'Brand': {
      types: ['Primary', 'Secondary', 'Tertiary', 'Ghost'],
      t3Mode: 'brand',
      typeSpecs: {
        'Primary': {
          rest:     { fill: { t3: 'component/bg-default' }, text: { t3: 'oncomponent-content/default' }, icon: { t3: 'oncomponent-content/default' } },
          hover:    { fill: { t3: 'component/bg-hover' },   text: { t3: 'oncomponent-content/default' }, icon: { t3: 'oncomponent-content/default' } },
          pressed:  { fill: { t3: 'component/bg-pressed' }, text: { t3: 'oncomponent-content/default' }, icon: { t3: 'oncomponent-content/default' } },
          focus:    { fill: { t3: 'component/bg-default' }, text: { t3: 'oncomponent-content/default' }, icon: { t3: 'oncomponent-content/default' },
                      wrapper: { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 } },
          disabled: { fill: { t3: 'component/bg-default' }, text: { t3: 'oncomponent-content/default' }, icon: { t3: 'oncomponent-content/default' },
                      wrapper: { componentOpacity: 0.3 } }
        },
        'Secondary': {
          rest:     { text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          hover:    { fill: { t3: 'container/bg' },    text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          pressed:  { fill: { t3: 'container/hover' }, text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          focus:    { text: { t3: 'content/default' }, icon: { t3: 'content/default' },
                      wrapper: { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 } },
          disabled: { text: { t3: 'content/default' }, icon: { t3: 'content/default' },
                      wrapper: { stroke: { t3: 'component/outline-default' }, strokeWeight: 1, componentOpacity: 0.3 } },
          wrapperBase: { stroke: { t3: 'component/outline-default' }, strokeWeight: 1 }
        },
        'Tertiary': {
          rest:     { fill: { t3: 'container/bg' },     text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
          hover:    { fill: { t3: 'container/hover' },  text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
          pressed:  { fill: { t3: 'container/pressed' }, text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
          focus:    { fill: { t3: 'container/bg' },     text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' },
                      wrapper: { stroke: { t3: 'container/outline' }, strokeWeight: 2 } },
          disabled: { fill: { t3: 'container/bg' },     text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' },
                      wrapper: { componentOpacity: 0.3 } }
        },
        'Ghost': {
          rest:     { text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          hover:    { fill: { t3: 'container/bg' },    text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          pressed:  { fill: { t3: 'container/hover' }, text: { t3: 'content/default' }, icon: { t3: 'content/default' } },
          focus:    { text: { t3: 'content/default' }, icon: { t3: 'content/default' },
                      wrapper: { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 } },
          disabled: { text: { t3: 'content/default' }, icon: { t3: 'content/default' },
                      wrapper: { componentOpacity: 0.3 } }
        }
      }
    }
  }
};

/* ── Component Generator Engine (Two-Tier Architecture) ──── */

/* Resolve a color spec to a Figma variable.
   String = T2 Surface Context path.
   { t3: path } = T3 Status Context path. */
function resolveColorSpec(spec, t2Map, t3Map) {
  if (!spec) return null;
  if (typeof spec === 'string') return t2Map[spec] || null;
  if (spec.t3) return t3Map[spec.t3] || null;
  return null;
}

/* Strip wrapper-only props from a spec entry, leaving only zone-applicable
   keys (fill / stroke / strokeWeight / text / icon). */
function zoneSlice(spec) {
  if (!spec) return {};
  var out = {};
  if (spec.fill         !== undefined) out.fill         = spec.fill;
  if (spec.stroke       !== undefined) out.stroke       = spec.stroke;
  if (spec.strokeWeight !== undefined) out.strokeWeight = spec.strokeWeight;
  if (spec.text         !== undefined) out.text         = spec.text;
  if (spec.icon         !== undefined) out.icon         = spec.icon;
  return out;
}

/* Expand a type's semantic state specs (rest/hover/pressed/selected/focus/disabled)
   into the 8-state per-zone override matrix used by the variant loop.
   Result shape: { [type]: { [stateName]: { action, trigger, wrapper } } }. */
function expandTypeSpecsToZoneOverrides(typeSpecs, stateNames) {
  var result = {};
  var typeNames = Object.keys(typeSpecs);
  for (var ti = 0; ti < typeNames.length; ti++) {
    var typeName = typeNames[ti];
    var spec = typeSpecs[typeName];
    var rest     = zoneSlice(spec.rest);
    var hover    = zoneSlice(spec.hover);
    var pressed  = zoneSlice(spec.pressed);
    var selected = zoneSlice(spec.selected);
    var focus    = zoneSlice(spec.focus);
    var disabled = zoneSlice(spec.disabled);
    /* wrapperBase = type-default wrapper props (e.g. Outlined always
       has a stroke on the wrapper regardless of state). */
    var wrapBase = spec.wrapperBase || null;
    function wrap(stateSpec) {
      var w = {};
      if (wrapBase) {
        if (wrapBase.stroke       !== undefined) w.stroke       = wrapBase.stroke;
        if (wrapBase.strokeWeight !== undefined) w.strokeWeight = wrapBase.strokeWeight;
      }
      if (stateSpec && stateSpec.wrapper) {
        var sw = stateSpec.wrapper;
        if (sw.stroke           !== undefined) w.stroke           = sw.stroke;
        if (sw.strokeWeight     !== undefined) w.strokeWeight     = sw.strokeWeight;
        if (sw.componentOpacity !== undefined) w.componentOpacity = sw.componentOpacity;
        if (sw.fill             !== undefined) w.fill             = sw.fill;
      }
      return w;
    }
    result[typeName] = {
      'Default':         { action: rest,     trigger: rest,     wrapper: wrap(null) },
      'Action Hover':    { action: hover,    trigger: rest,     wrapper: wrap(null) },
      'Action Pressed':  { action: pressed,  trigger: rest,     wrapper: wrap(null) },
      'Trigger Hover':   { action: rest,     trigger: hover,    wrapper: wrap(null) },
      'Trigger Pressed': { action: rest,     trigger: pressed,  wrapper: wrap(null) },
      'Selected':        { action: selected, trigger: selected, wrapper: wrap(spec.selected),
                           t3Mode: spec.selected && spec.selected.t3Mode },
      'Focus':           { action: rest,     trigger: rest,     wrapper: wrap(spec.focus) },
      'Disabled':        { action: rest,     trigger: rest,     wrapper: wrap(spec.disabled) }
    };
  }
  /* Filter out states that have nothing to render (defensive — should not
     happen given the matrix above always sets something). */
  for (var tn in result) {
    if (!result.hasOwnProperty(tn)) continue;
    var stateMap = result[tn];
    for (var sn in stateMap) {
      if (!stateMap.hasOwnProperty(sn)) continue;
      var st = stateMap[sn];
      if (!st.action && !st.trigger && !st.wrapper) delete stateMap[sn];
    }
  }
  return result;
}

async function generateComponentFromBlueprint(blueprint) {
  var stats = { components: 0, bindings: 0, reactions: 0, errors: [] };
  var BP = blueprint;

  /* ── Step 1: Font loading deferred — see Step 2b below ─── */
  var fontName = null;
  var fontNameBold = null;

  /* ── Step 2: Build variable lookup maps ────────────────── */
  log('Gen: loading variable lookups…');
  figma.ui.postMessage({ type: 'gen-progress', text: 'Loading variables…' });

  var compSizeVars = await buildCollectionVarMap('comp size');
  var t2Vars = await buildCollectionVarMap('T2 Surface Context Tokens');
  var t3Vars = await buildCollectionVarMap('T3 Status Context Tokens');

  /* ── Step 2a: Normalize legacy T2 variable names ────────────
     Older project files have T2 vars named `default/component/bg` and
     `default/component/outline` (no -default suffix). The blueprint's
     state-Default overrides reference `…-default` to be symmetric with
     `-hover`/`-pressed`. Rename in-place (preserves variable IDs and all
     bindings) so legacy files self-heal on every plugin run. */
  var t2Aliases = [
    { from: 'default/component/bg',      to: 'default/component/bg-default' },
    { from: 'default/component/outline', to: 'default/component/outline-default' }
  ];
  for (var ai2 = 0; ai2 < t2Aliases.length; ai2++) {
    var fromName = t2Aliases[ai2].from;
    var toName = t2Aliases[ai2].to;
    if (t2Vars[fromName] && !t2Vars[toName]) {
      try {
        t2Vars[fromName].name = toName;
        t2Vars[toName] = t2Vars[fromName];
        delete t2Vars[fromName];
        log('Renamed T2 var: ' + fromName + ' → ' + toName);
        stats.bindings++;
      } catch (rne) {
        log('Failed to rename T2 var ' + fromName + ': ' + rne.message);
      }
    }
  }


  var csCount = Object.keys(compSizeVars).length;
  var t2Count = Object.keys(t2Vars).length;
  var t3Count = Object.keys(t3Vars).length;
  log('Variables: ' + csCount + ' comp-size, ' + t2Count + ' T2, ' + t3Count + ' T3');

  /* ── Step 2b: Create/find Typography variable collection ─── */
  figma.ui.postMessage({ type: 'gen-progress', text: 'Setting up typography variables…' });
  var typoVars = {};
  var typoCol = null;
  var typoColName = 'Typography';
  var allColsTypo = await figma.variables.getLocalVariableCollectionsAsync();
  for (var tci = 0; tci < allColsTypo.length; tci++) {
    if (allColsTypo[tci].name === typoColName || allColsTypo[tci].name === 'DTF Typography') {
      typoCol = allColsTypo[tci];
      if (typoCol.name !== typoColName) {
        typoCol.name = typoColName;
        log('Renamed collection DTF Typography → Typography');
      }
      break;
    }
  }
  if (!typoCol) {
    typoCol = figma.variables.createVariableCollection(typoColName);
    log('Created typography collection: ' + typoColName);
  }
  var typoModeId = typoCol.modes[0].modeId;

  /* Define typography tokens: font sizes and font weights */
  var TYPO_DEFS = [
    /* Font sizes (FLOAT) */
    { name: 'font-size/xs',   type: 'FLOAT', value: 10 },
    { name: 'font-size/sm',   type: 'FLOAT', value: 11 },
    { name: 'font-size/base', type: 'FLOAT', value: 14 },
    { name: 'font-size/md',   type: 'FLOAT', value: 16 },
    { name: 'font-size/lg',   type: 'FLOAT', value: 20 },
    { name: 'font-size/xl',   type: 'FLOAT', value: 24 },
    { name: 'font-size/2xl',  type: 'FLOAT', value: 32 },
    /* Line heights (FLOAT — px values) */
    { name: 'line-height/tight',  type: 'FLOAT', value: 16 },
    { name: 'line-height/base',   type: 'FLOAT', value: 20 },
    { name: 'line-height/relaxed', type: 'FLOAT', value: 24 },
    { name: 'line-height/loose',  type: 'FLOAT', value: 32 },
    /* Letter spacing (FLOAT — px) */
    { name: 'letter-spacing/tight',  type: 'FLOAT', value: -0.2 },
    { name: 'letter-spacing/normal', type: 'FLOAT', value: 0 },
    { name: 'letter-spacing/wide',   type: 'FLOAT', value: 0.5 },
    /* Font family (STRING) */
    { name: 'font-family/primary', type: 'STRING', value: 'Lato' },
    /* Font style (STRING) — for binding to text nodes */
    { name: 'font-style/default', type: 'STRING', value: 'Regular' },
    { name: 'font-style/bold', type: 'STRING', value: 'Bold' }
  ];

  /* Load existing vars in the collection */
  for (var tvl = 0; tvl < typoCol.variableIds.length; tvl++) {
    var tvVar = await figma.variables.getVariableByIdAsync(typoCol.variableIds[tvl]);
    if (tvVar) typoVars[tvVar.name] = tvVar;
  }

  /* Create missing, update existing */
  for (var tdi = 0; tdi < TYPO_DEFS.length; tdi++) {
    var td = TYPO_DEFS[tdi];
    if (typoVars[td.name]) {
      /* Update in place — preserve ID */
      try { typoVars[td.name].setValueForMode(typoModeId, td.value); } catch (e) {}
    } else {
      try {
        var tv = figma.variables.createVariable(td.name, typoCol, td.type);
        tv.setValueForMode(typoModeId, td.value);
        typoVars[td.name] = tv;
      } catch (tve) {
        log('Failed to create typo var ' + td.name + ': ' + tve.message);
      }
    }
  }
  log('Typography vars: ' + Object.keys(typoVars).length + ' in ' + typoColName);

  /* ── Step 1 (deferred): Load font from typography variable ── */
  var primaryFamily = 'Lato'; /* default */
  var defaultStyle = 'Regular';
  var boldStyle = 'Bold';
  if (typoVars['font-family/primary']) {
    try {
      var famVal = typoVars['font-family/primary'].valuesByMode;
      var famKeys = Object.keys(famVal);
      if (famKeys.length > 0 && typeof famVal[famKeys[0]] === 'string') {
        primaryFamily = famVal[famKeys[0]];
      }
    } catch (e) { /* keep default */ }
  }
  if (typoVars['font-style/default']) {
    try {
      var styVal = typoVars['font-style/default'].valuesByMode;
      var styKeys = Object.keys(styVal);
      if (styKeys.length > 0 && typeof styVal[styKeys[0]] === 'string') {
        defaultStyle = styVal[styKeys[0]];
      }
    } catch (e) { /* keep default */ }
  }
  if (typoVars['font-style/bold']) {
    try {
      var boldVal = typoVars['font-style/bold'].valuesByMode;
      var boldKeys = Object.keys(boldVal);
      if (boldKeys.length > 0 && typeof boldVal[boldKeys[0]] === 'string') {
        boldStyle = boldVal[boldKeys[0]];
      }
    } catch (e) { /* keep default */ }
  }
  log('Typography: family=' + primaryFamily + ', style=' + defaultStyle + '/' + boldStyle);

  fontName = { family: primaryFamily, style: defaultStyle };
  fontNameBold = { family: primaryFamily, style: boldStyle };
  try {
    await figma.loadFontAsync(fontName);
  } catch (e) {
    log('Font load failed for ' + primaryFamily + ' ' + defaultStyle + ', trying Inter');
    try {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      fontName = { family: 'Inter', style: 'Regular' };
      fontNameBold = { family: 'Inter', style: 'Regular' };
    } catch (e2) {
      stats.errors.push('Cannot load font: ' + primaryFamily + ' or Inter');
      return stats;
    }
  }
  try {
    await figma.loadFontAsync(fontNameBold);
  } catch (e) {
    fontNameBold = fontName;
  }

  if (t2Count === 0) {
    stats.errors.push('No T2 Surface Context Tokens found — run token sync first');
    return stats;
  }
  if (csCount === 0) {
    stats.errors.push('No comp size variables found — run token sync first');
    return stats;
  }

  /* ── Step 2b: Alias comp-size variable names ───────────────
     Different files use different naming conventions:
       Writer Handhelds: button/height          (2 segments)
       PDF Editor:       button/default/height  (3 segments)
     Create aliases so the blueprint works in either file.       */
  var csKeys = Object.keys(compSizeVars);
  for (var cki = 0; cki < csKeys.length; cki++) {
    var csName = csKeys[cki];
    var csParts = csName.split('/');
    if (csParts.length === 2) {
      /* button/height → also register as button/default/height */
      var aliasLong = csParts[0] + '/default/' + csParts[1];
      if (!compSizeVars[aliasLong]) compSizeVars[aliasLong] = compSizeVars[csName];
    } else if (csParts.length === 3) {
      /* button/default/height → also register as button/height */
      var aliasShort = csParts[0] + '/' + csParts[2];
      if (!compSizeVars[aliasShort]) compSizeVars[aliasShort] = compSizeVars[csName];
    }
  }

  /* ── Step 2c: Create missing comp-size variables ───────────
     Some files may not have all the variables the blueprint needs.
     Create them in the comp size collection with sensible defaults. */
  var requiredVars = [
    { name: 'button/icon wrapper padding L', defaultVal: 8 },
    { name: 'button/icon wrapper padding R', defaultVal: 8 },
    { name: 'button/icon pad', defaultVal: 8 },
    /* Rounded (pill) corner radius — bound on Rounded=True variants instead
       of button/default/radius. Mirrors --btn-radius-rounded in CSS. */
    { name: 'button/radius-rounded', defaultVal: 9999 }
  ];

  var allCols = await figma.variables.getLocalVariableCollectionsAsync();
  var csCol = allCols.find(function(c) { return c.name === 'comp size'; });

  if (csCol) {
    var csModeId = csCol.modes[0].modeId;
    for (var rvi = 0; rvi < requiredVars.length; rvi++) {
      var reqName = requiredVars[rvi].name;
      var reqVal  = requiredVars[rvi].defaultVal;
      var longName = reqName.replace('button/', 'button/default/');
      var existing = compSizeVars[reqName] || compSizeVars[longName];
      if (existing) {
        /* Variable already exists — enforce canonical value so stale
           values from earlier file states (e.g. icon pad = 6) are
           upgraded to the current source of truth. Update-in-place
           preserves the variable ID and all bindings. */
        try {
          var curVal = existing.valuesByMode && existing.valuesByMode[csModeId];
          if (curVal !== reqVal) {
            existing.setValueForMode(csModeId, reqVal);
            log('Updated ' + reqName + ': ' + curVal + ' → ' + reqVal);
            stats.bindings++;
          }
        } catch (uve) {
          log('Failed to update variable ' + reqName + ': ' + uve.message);
        }
      } else {
        try {
          var newVar = figma.variables.createVariable(reqName, csCol, 'FLOAT');
          newVar.setValueForMode(csModeId, reqVal);
          compSizeVars[reqName] = newVar;
          /* Also create alias */
          compSizeVars[longName] = newVar;
          log('Created missing variable: ' + reqName + ' = ' + reqVal);
          stats.bindings++;
        } catch (cve) {
          log('Failed to create variable ' + reqName + ': ' + cve.message);
        }
      }
    }
  }

  log('Comp-size vars after aliasing: ' + Object.keys(compSizeVars).length);

  /* ── Step 3: Find or create DTF Components page ────────── */
  var page = null;
  for (var pi = 0; pi < figma.root.children.length; pi++) {
    if (figma.root.children[pi].name === 'Components') {
      page = figma.root.children[pi];
      break;
    }
  }
  if (!page) {
    page = figma.createPage();
    page.name = 'Components';
  }
  await figma.setCurrentPageAsync(page);

  /* ── Step 4: Clean up existing ───────────────────────────
     IMPORTANT: only remove things specific to the CURRENT blueprint.
     For wrapper-with-button-instance kinds (split-button), do NOT touch
     button-owned items (masters, icon placeholder, button section) —
     they are dependencies. */
  var isWrapperKind = (BP.kind === 'wrapper-with-button-instance');
  /* Set of master names this BP will generate — used to identify
     section ownership for legacy unprefixed sections. */
  var ourMasterFullNames = {};
  var _ourMasterKeys = Object.keys(BP.masters || {});
  for (var _omk = 0; _omk < _ourMasterKeys.length; _omk++) {
    ourMasterFullNames['mc / ' + _ourMasterKeys[_omk]] = true;
  }
  /* Helper: does a section contain any of our masters? */
  function sectionOwnedByThisBP(node) {
    if (!node.findOne) return false;
    var hit = node.findOne(function(n) {
      return (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') && ourMasterFullNames[n.name];
    });
    return !!hit;
  }
  for (var ci2 = page.children.length - 1; ci2 >= 0; ci2--) {
    var child = page.children[ci2];
    /* Remove DTF sections (contain all presentation).
       For wrapper kinds, only remove sections that mention THIS BP name
       (avoids deleting the button section that hosts our dependencies).
       Also catch legacy unprefixed sections (Tier 1 — Masters, Tier 2 —
       Variants, Icon Primitive) that belong to THIS BP, identified by
       containing one of our masters. */
    if ((child.type === 'SECTION' || child.type === 'FRAME')) {
      var legacyName = (child.name === 'Tier 1 \u2014 Masters' ||
                        child.name === 'Tier 2 \u2014 Variants' ||
                        child.name === 'Icon Primitive');
      var matchesBP = (child.name.indexOf(BP.name) === 0) ||
                      (child.name.indexOf('DTF / ' + BP.name) === 0) ||
                      (!isWrapperKind && child.name.indexOf('DTF /') === 0) ||
                      (legacyName && sectionOwnedByThisBP(child));
      if (matchesBP) {
        child.remove();
        log('Removed existing section: ' + child.name);
        continue;
      }
    }
    /* Remove legacy loose nodes from older versions */
    if (child.name === 'Master/ Buttons/ ' + BP.name) {
      child.remove(); continue;
    }
    if (child.type === 'COMPONENT_SET' && child.name.indexOf(BP.name + ' /') === 0) {
      child.remove(); continue;
    }
    /* Icon placeholder is OWNED by button. Only the button generator
       (non-wrapper kind) is allowed to remove it. */
    if (!isWrapperKind && child.type === 'COMPONENT' && (child.name === 'Icon/Placeholder' || child.name === 'DTF/Icon/Placeholder')) {
      child.remove(); continue;
    }
    /* Chevron icon is OWNED by split-button. Only the split-button
       generator (wrapper kind) is allowed to remove it — keep it across
       button re-runs so split-button doesn't re-create the same component
       with a new ID. */
    if (isWrapperKind && child.type === 'COMPONENT' && child.name === 'Icon/Chevron Down') {
      child.remove(); continue;
    }
    if (child.type === 'TEXT' && (child.name.indexOf('MASTER ') === 0 || child.name.indexOf('VARIANT ') === 0 || child.name === 'Icon Primitive' || child.name.indexOf('DTF-') === 0)) {
      child.remove(); continue;
    }
  }

  /* ── Presentation helpers ──────────────────────────────── */

  /* Resolve system colors from T2/T3 tokens instead of hardcoding.
     Falls back to hardcoded values if variables missing (e.g. first-run). */

  /* Helper: resolve a variable's current value for a given mode,
     following VariableAlias chains up to 5 levels deep */
  async function resolveVarColor(v, modeId) {
    if (!v || !modeId) return null;
    var current = v;
    for (var depth = 0; depth < 5; depth++) {
      try {
        var val = current.valuesByMode[modeId];
        if (!val) return null;
        if (val.type === 'VARIABLE_ALIAS') {
          /* Follow the alias to the referenced variable */
          current = await figma.variables.getVariableByIdAsync(val.id);
          if (!current) return null;
          /* Use the first mode of the referenced variable's collection */
          var refCol = await figma.variables.getVariableCollectionByIdAsync(current.variableCollectionId);
          if (refCol && refCol.modes && refCol.modes.length > 0) {
            modeId = refCol.modes[0].modeId;
          } else {
            return null;
          }
          continue;
        }
        if (typeof val.r === 'number') return { r: val.r, g: val.g, b: val.b };
      } catch (e) { return null; }
    }
    return null;
  }

  /* Find T2 collection + modes for presentation binding */
  var t2Col = null, t2Modes = {};
  var t3Col = null, t3Modes = {};
  var presColls = await figma.variables.getLocalVariableCollectionsAsync();
  for (var pci = 0; pci < presColls.length; pci++) {
    var pcol = presColls[pci];
    if (pcol.name === 'T2 Surface Context Tokens') {
      t2Col = pcol;
      for (var pmi = 0; pmi < pcol.modes.length; pmi++) {
        t2Modes[pcol.modes[pmi].name] = pcol.modes[pmi].modeId;
      }
    }
    if (pcol.name === 'T3 Status Context Tokens') {
      t3Col = pcol;
      /* ── Migration: rename legacy 'primary' mode → 'brand' ──
         The system was unified around 'brand' as the canonical role.
         If a file still has a 'primary' mode (or both 'primary' and
         'brand'), normalize to 'brand' in-place to preserve all
         existing component bindings (variable mode IDs survive).      */
      try {
        var hasPrimary = pcol.modes.some(function(m) { return m.name === 'primary'; });
        var hasBrand   = pcol.modes.some(function(m) { return m.name === 'brand'; });
        if (hasPrimary && !hasBrand) {
          /* Simple rename: 'primary' → 'brand' (mode ID preserved) */
          for (var rmi = 0; rmi < pcol.modes.length; rmi++) {
            if (pcol.modes[rmi].name === 'primary') {
              pcol.renameMode(pcol.modes[rmi].modeId, 'brand');
              log("T3 mode migration: renamed 'primary' → 'brand'");
              break;
            }
          }
        } else if (hasPrimary && hasBrand) {
          /* Both exist — keep 'primary' (it's the live one with bindings)
             rename it to 'brand-new' temporarily, drop the stale 'brand'
             mode, then rename 'brand-new' → 'brand'. This preserves IDs. */
          var primaryMode = pcol.modes.find(function(m) { return m.name === 'primary'; });
          var brandMode   = pcol.modes.find(function(m) { return m.name === 'brand'; });
          pcol.renameMode(primaryMode.modeId, '__brand_tmp__');
          try { pcol.removeMode(brandMode.modeId); } catch (_e) {}
          pcol.renameMode(primaryMode.modeId, 'brand');
          log("T3 mode migration: dropped stale 'brand', promoted 'primary' → 'brand'");
        }
      } catch (mige) {
        log('T3 mode migration warning: ' + mige.message);
      }
      /* Re-read modes after potential rename */
      for (var pmi2 = 0; pmi2 < pcol.modes.length; pmi2++) {
        t3Modes[pcol.modes[pmi2].name] = pcol.modes[pmi2].modeId;
      }
    }
  }
  log('Presentation: T2 modes = ' + Object.keys(t2Modes).join(', '));
  log('Presentation: T3 modes = ' + Object.keys(t3Modes).join(', '));

  /* Resolve presentation colors from system tokens */
  var brightModeId  = t2Modes['surface-bright'] || t2Modes['surface-base'] || null;
  var inverseModeId = t2Modes['surface-inverse'] || null;
  var brandModeId = t3Modes['brand'] || null;

  /* Surface-bright resolved values (for cards, labels, dividers) */
  var COLOR_SURFACE_BG = (await resolveVarColor(t2Vars['default/surfaces/bg'], brightModeId))    || { r: 1, g: 1, b: 1 };
  var COLOR_HEADING  = (await resolveVarColor(t2Vars['default/content/strong'], brightModeId))    || { r: 0.12, g: 0.12, b: 0.15 };
  var COLOR_BODY     = (await resolveVarColor(t2Vars['default/content/default'], brightModeId))   || { r: 0.35, g: 0.35, b: 0.40 };
  var COLOR_DIMMED   = (await resolveVarColor(t2Vars['default/content/subtle'], brightModeId))    || { r: 0.55, g: 0.55, b: 0.60 };
  var COLOR_FAINT    = (await resolveVarColor(t2Vars['default/content/faint'], brightModeId))     || { r: 0.70, g: 0.72, b: 0.75 };
  var COLOR_CARD_BG  = (await resolveVarColor(t2Vars['default/surfaces/subtle'], brightModeId))   || { r: 0.965, g: 0.969, b: 0.976 };
  var COLOR_HEADER_BG = (await resolveVarColor(t2Vars['default/surfaces/strong'], brightModeId))  || { r: 0.933, g: 0.937, b: 0.949 };
  var COLOR_DIVIDER  = (await resolveVarColor(t2Vars['default/surfaces/separator'], brightModeId)) || { r: 0.88, g: 0.89, b: 0.91 };
  var COLOR_OUTLINE  = (await resolveVarColor(t2Vars['default/surfaces/outline'], brightModeId))  || { r: 0.84, g: 0.85, b: 0.87 };
  var COLOR_CM_BG    = (await resolveVarColor(t2Vars['default/component/bg'], brightModeId))      || { r: 0.96, g: 0.97, b: 0.98 };

  /* Accent from T3 primary */
  var COLOR_ACCENT   = (await resolveVarColor(t3Vars['component/bg-default'], brandModeId))     || { r: 0.22, g: 0.42, b: 0.95 };
  var COLOR_PRIMARY_CT = (await resolveVarColor(t3Vars['content/default'], brandModeId))        || { r: 0.17, g: 0.36, b: 0.89 };
  var COLOR_ON_COMP  = (await resolveVarColor(t3Vars['oncomponent-content/default'], brandModeId)) || { r: 1, g: 1, b: 1 };
  var COLOR_PRIMARY_CONTAINER = (await resolveVarColor(t3Vars['container/bg'], brandModeId))    || { r: 0.92, g: 0.95, b: 1 };

  /* Surface-inverse resolved values (for hero dark background) */
  var COLOR_HERO_BG  = (await resolveVarColor(t2Vars['default/surfaces/bg'], inverseModeId))       || { r: 0.09, g: 0.09, b: 0.12 };
  var COLOR_HERO_TEXT = (await resolveVarColor(t2Vars['default/content/strong'], inverseModeId))    || { r: 1, g: 1, b: 1 };
  var COLOR_HERO_SUB  = (await resolveVarColor(t2Vars['default/content/subtle'], inverseModeId))   || { r: 0.70, g: 0.72, b: 0.78 };
  var COLOR_HERO_FAINT = (await resolveVarColor(t2Vars['default/content/faint'], inverseModeId))   || { r: 0.45, g: 0.47, b: 0.52 };
  var COLOR_HERO_DIV  = (await resolveVarColor(t2Vars['default/surfaces/separator'], inverseModeId)) || { r: 0.20, g: 0.20, b: 0.25 };
  var COLOR_HERO_CARD = (await resolveVarColor(t2Vars['default/surfaces/subtle'], inverseModeId))  || { r: 0.14, g: 0.14, b: 0.18 };
  var COLOR_WHITE    = { r: 1, g: 1, b: 1 };  /* Fixed white — kept as utility */

  /* Success color for tier-2 accent */
  var COLOR_SUCCESS  = (await resolveVarColor(t3Vars['component/bg-default'], t3Modes['success'] || null)) || { r: 0.18, g: 0.62, b: 0.42 };
  var COLOR_SUCCESS_CT = (await resolveVarColor(t3Vars['content/default'], t3Modes['success'] || null)) || { r: 0.04, g: 0.51, b: 0.15 };
  var COLOR_SUCCESS_CONTAINER = (await resolveVarColor(t3Vars['container/bg'], t3Modes['success'] || null)) || { r: 0.82, g: 1, b: 0.82 };

  log('Presentation colors resolved from ' + (brightModeId ? 'system tokens' : 'fallback values'));
  log('Token check — HEADING: r=' + COLOR_HEADING.r.toFixed(2) + ' ACCENT: r=' + COLOR_ACCENT.r.toFixed(2) + ' HERO_BG: r=' + COLOR_HERO_BG.r.toFixed(2));

  /* Helper: safely bind a node's fill to a T2/T3 variable. Returns true on success. */
  function tryBindFill(node, varObj) {
    if (!varObj) return false;
    try { setPaintBoundToVariable(node, 'fills', varObj); return true; }
    catch (e) { return false; }
  }
  /* Helper: safely bind a node's stroke to a variable */
  function tryBindStroke(node, varObj) {
    if (!varObj) return false;
    try {
      node.strokes = [figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 }, opacity: 1, visible: true },
        'color', varObj
      )];
      return true;
    } catch (e) { return false; }
  }

  function createLabel(text, size, bold, color) {
    var label = figma.createText();
    label.fontName = bold ? fontNameBold : fontName;
    label.characters = text;
    label.fontSize = size;
    label.fills = [{ type: 'SOLID', color: color || COLOR_HEADING }];
    label.textAutoResize = 'WIDTH_AND_HEIGHT';
    return label;
  }

  /** Create a styled card frame with auto-layout, background, and rounded corners.
      Pass opts.width to get a fixed-width card that hugs height. */
  function createCard(opts) {
    var card = figma.createFrame();
    card.name = opts.name || 'Card';
    card.layoutMode = opts.direction || 'VERTICAL';
    card.cornerRadius = opts.radius !== undefined ? opts.radius : 12;
    card.paddingLeft = opts.padX || 24;
    card.paddingRight = opts.padX || 24;
    card.paddingTop = opts.padY || 20;
    card.paddingBottom = opts.padY || 20;
    card.itemSpacing = opts.gap || 12;
    card.fills = [{ type: 'SOLID', color: opts.fill || COLOR_CARD_BG }];
    card.clipsContent = false;
    if (opts.stroke) {
      card.strokes = [{ type: 'SOLID', color: opts.stroke }];
      card.strokeWeight = 1;
      card.strokeAlign = 'INSIDE';
    }
    /* Sizing: if width given → fixed width, hug height.
       For VERTICAL layout: counter axis = width, primary axis = height.
       For HORIZONTAL layout: primary axis = width, counter axis = height. */
    if (opts.width) {
      if ((opts.direction || 'VERTICAL') === 'VERTICAL') {
        card.counterAxisSizingMode = 'FIXED';
        card.primaryAxisSizingMode = 'AUTO';
      } else {
        card.primaryAxisSizingMode = 'FIXED';
        card.counterAxisSizingMode = 'AUTO';
      }
      card.resize(opts.width, 1);
    } else {
      card.primaryAxisSizingMode = 'AUTO';
      card.counterAxisSizingMode = 'AUTO';
    }
    card.layoutSizingHorizontal = opts.hSize || 'HUG';
    card.layoutSizingVertical = 'HUG';
    return card;
  }

  /** Create a horizontal divider line */
  function createDivider(width) {
    var line = figma.createFrame();
    line.name = 'divider';
    line.resize(width || 1120, 1);
    line.fills = [{ type: 'SOLID', color: COLOR_DIVIDER }];
    return line;
  }

  /** Create a styled badge / chip */
  function createBadge(text, bgColor, textColor) {
    var badge = figma.createFrame();
    badge.name = 'badge-' + text.toLowerCase().replace(/\s+/g, '-');
    badge.layoutMode = 'HORIZONTAL';
    badge.primaryAxisSizingMode = 'AUTO';
    badge.counterAxisSizingMode = 'AUTO';
    badge.layoutSizingHorizontal = 'HUG';
    badge.layoutSizingVertical = 'HUG';
    badge.cornerRadius = 6;
    badge.paddingLeft = 10;
    badge.paddingRight = 10;
    badge.paddingTop = 4;
    badge.paddingBottom = 4;
    badge.fills = [{ type: 'SOLID', color: bgColor || COLOR_CARD_BG }];
    var badgeLabel = createLabel(text, 11, true, textColor || COLOR_BODY);
    badge.appendChild(badgeLabel);
    return badge;
  }

  /** Create a Figma section — uses surface-bg token color.
      Returns { section, innerX, innerY } */
  /* Shadow effect for section containers */
  var SECTION_SHADOW = {
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.06 },
    offset: { x: 0, y: 4 },
    radius: 16,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL'
  };
  var SECTION_SHADOW_SUBTLE = {
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.03 },
    offset: { x: 0, y: 1 },
    radius: 4,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL'
  };

  /** Create a styled section — a FRAME with rounded corners, shadow, and token-bound fill.
      Returns { section: <frame>, innerX, innerY } */
  function createSection(name, sectionWidth) {
    var sw = sectionWidth || 1200;
    var frame = figma.createFrame();
    frame.name = name;
    frame.resize(sw, 100);
    frame.cornerRadius = 16;
    frame.fills = [{ type: 'SOLID', color: COLOR_SURFACE_BG }];
    frame.effects = [SECTION_SHADOW, SECTION_SHADOW_SUBTLE];
    frame.clipsContent = false;
    frame.strokes = [{ type: 'SOLID', color: COLOR_OUTLINE }];
    frame.strokeWeight = 1;
    frame.strokeAlign = 'INSIDE';

    /* Bind fill + stroke to variables */
    tryBindFill(frame, t2Vars['default/surfaces/bg']);
    tryBindStroke(frame, t2Vars['default/surfaces/outline']);
    if (t2Col && brightModeId) {
      try { frame.setExplicitVariableModeForCollection(t2Col, brightModeId); } catch (e) {}
    }

    return { section: frame, innerX: 40, innerY: 40 };
  }

  /* ── Layout cursor — tracks Y position on the page ─────── */
  var PAGE_X = 100;
  var SECTION_GAP = 60;
  /* Section width adapts to the widest variant set: 8-state split-button
     needs more room than 6-state button. Formula mirrors the variant grid:
     ROW_LABEL_WIDTH(100) + padX*2(40) + (colCount-1)*colSpacing(155) + 120
     extras + innerX*2(80) margin. Round up for headroom. */
  var _maxStatesForLayout = (BP.states && BP.states.length) || 6;
  for (var _flk = 0; _flk < Object.keys(BP.families || {}).length; _flk++) {
    var _flf = BP.families[Object.keys(BP.families)[_flk]];
    if (_flf.states && _flf.states.length > _maxStatesForLayout) _maxStatesForLayout = _flf.states.length;
  }
  var SECTION_W = Math.max(1200, 100 + 40 + (_maxStatesForLayout - 1) * 155 + 120 + 80);
  var CARD_W = SECTION_W - 80; /* card width inside sections */
  var cursorY = 100;

  /* If other content already exists on the page (e.g. a previously
     generated Button block when generating Split Button), shift this
     run to the right so the new presentation lands beside the old one
     instead of overlapping it. Cleanup above only removed sections
     belonging to THIS blueprint, so anything still present is foreign. */
  var PAGE_MARGIN = 200;
  var existingMaxX = null;
  for (var pcx = 0; pcx < page.children.length; pcx++) {
    var pc = page.children[pcx];
    if (pc.type === 'SECTION' || pc.type === 'FRAME' || pc.type === 'COMPONENT' || pc.type === 'COMPONENT_SET') {
      var rightEdge = (pc.x || 0) + (pc.width || 0);
      if (existingMaxX === null || rightEdge > existingMaxX) existingMaxX = rightEdge;
    }
  }
  if (existingMaxX !== null && existingMaxX > PAGE_X) {
    PAGE_X = existingMaxX + PAGE_MARGIN;
    log('Existing content detected on page (max X = ' + existingMaxX + '). Shifting new layout to X = ' + PAGE_X);
  }

  /* Pre-compute master names for use in hero section stats */
  var masterNames = Object.keys(BP.masters);

  /* ── Step 5a: Create Icon placeholder component ─────────
     A tiny 20×20 component with a vector child that scales.
     This lives on the page and acts as the INSTANCE_SWAP default.
     Users swap it with their own icon library components.

     For wrapper-with-button-instance kinds (split-button), reuse the
     existing placeholder created by the button generator — instances of
     button masters reference it by ID and we must not orphan them. */
  figma.ui.postMessage({ type: 'gen-progress', text: 'Building icon placeholder…' });

  var iconPlaceholder = null;
  if (BP.kind === 'wrapper-with-button-instance') {
    iconPlaceholder = page.findOne(function(n) {
      return n.type === 'COMPONENT' && (n.name === 'Icon/Placeholder' || n.name === 'DTF/Icon/Placeholder');
    });
    if (iconPlaceholder) log('Reusing existing icon placeholder: ' + iconPlaceholder.id);
  }
  if (!iconPlaceholder) {
    iconPlaceholder = figma.createComponent();
    iconPlaceholder.name = 'Icon/Placeholder';
    iconPlaceholder.description =
      'Default icon placeholder used by every Button master as the INSTANCE_SWAP target.\n\n' +
      'REPLACE THIS with your own icon component (e.g. from Lucide, Phosphor, Material Symbols, ' +
      'or your in-house icon library). Any component with the same 1:1 frame can be swapped in via ' +
      'the right-panel "Icon" property on a button instance.\n\n' +
      'Sizing is controlled by the button\u2019s comp-size variables (icon container) \u2014 the icon ' +
      'inherits the slot size and color automatically. Use a vector with `constraints: SCALE` so it ' +
      'fills the swap target cleanly.';
    iconPlaceholder.resize(20, 20);
    iconPlaceholder.clipsContent = true;
    iconPlaceholder.fills = [];
    /* No auto-layout — matches reference icon component (layoutMode NONE) */

    /* Create a simple vector shape as visual placeholder */
    var iconStar = figma.createStar();
    iconStar.name = 'Vector';
    iconStar.resize(15, 15);
    iconStar.x = 2.5;
    iconStar.y = 2.5;
    iconStar.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
    /* Fill with content color */
    var iconContentVar = t2Vars[BP.masterContentColor];
    if (iconContentVar) {
      setPaintBoundToVariable(iconStar, 'fills', iconContentVar);
      stats.bindings++;
    }
    iconPlaceholder.appendChild(iconStar);
    /* Don't append to page yet — will go inside section */
    log('Created icon placeholder component: ' + iconPlaceholder.id);
  }

  /* ── Chevron icon component set (split-button only) ──
     A 4-direction chevron icon set: Down (default), Up, Left, Right.
     Designers can swap direction via the variant property — useful
     for split-button menus that flip the chevron when the menu is
     open (Down → Up), or RTL/right-aligned menus (Right → Left).
     Reuses if present from a prior run.

     Returns: chevronIcon = the Down variant COMPONENT (for backward
     compatibility with downstream consumers that need a single
     COMPONENT id), and chevronIconSet = the parent COMPONENT_SET. */
  var chevronIcon = null;
  var chevronIconSet = null;
  if (BP.kind === 'wrapper-with-button-instance') {
    /* Look for an existing set first; if not, look for a stale
       single Chevron Down component from older plugin versions. */
    chevronIconSet = page.findOne(function(n) {
      return n.type === 'COMPONENT_SET' && n.name === 'Icon/Chevron';
    });
    /* Detect a broken / zero-size / wrong-arity set from a prior run and
       force recreation. Without this, a stale empty set keeps getting
       reused and the showcase preview keeps showing nothing. */
    if (chevronIconSet) {
      var brokenChev = (chevronIconSet.children.length !== 4) ||
                       (chevronIconSet.width < 1) || (chevronIconSet.height < 1);
      if (brokenChev) {
        log('Stale Icon/Chevron set detected (children=' + chevronIconSet.children.length + ' size=' + chevronIconSet.width + 'x' + chevronIconSet.height + '); recreating.');
        try { chevronIconSet.remove(); } catch (e) {}
        chevronIconSet = null;
      }
    }
    if (chevronIconSet) {
      chevronIcon = chevronIconSet.children.find(function(c) {
        return c.type === 'COMPONENT' && c.variantProperties && c.variantProperties.Direction === 'Down';
      }) || chevronIconSet.children[0];
      /* Repair layout in case the set was created by an older plugin
         version without auto-layout, or got squished to 0×0 by a prior
         resize attempt. Without this, the showcase preview shows an
         empty selection box. */
      try {
        chevronIconSet.layoutMode = 'HORIZONTAL';
        chevronIconSet.itemSpacing = 16;
        chevronIconSet.paddingLeft = 16; chevronIconSet.paddingRight = 16;
        chevronIconSet.paddingTop = 16; chevronIconSet.paddingBottom = 16;
        chevronIconSet.primaryAxisSizingMode = 'AUTO';
        chevronIconSet.counterAxisSizingMode = 'AUTO';
        for (var rci = 0; rci < chevronIconSet.children.length; rci++) {
          var rc = chevronIconSet.children[rci];
          try { rc.layoutSizingHorizontal = 'FIXED'; rc.layoutSizingVertical = 'FIXED'; } catch (e) {}
          try { if (rc.width < 16 || rc.height < 16) rc.resize(20, 20); } catch (e) {}
        }
      } catch (e) { log('Chevron set layout repair skipped: ' + e.message); }
      log('Reusing existing chevron icon set: ' + chevronIconSet.id);
    } else {
      /* Path data for each direction. Apex centred at x=9 / y=9
         (1px LEFT/UP nudge from geometric centre 10) so that swapping
         Down ↔ Up keeps the apex in the same horizontal position —
         critical for visual stability when split-button trigger flips
         from closed to open state.
         Down/Up share x=9 apex; Left/Right share y=9 apex. */
      var chevronPaths = {
        Down:  'M 4 7.5 L 9 12.5 L 14 7.5',
        Up:    'M 4 12.5 L 9 7.5 L 14 12.5',
        Left:  'M 12.5 4 L 7.5 9 L 12.5 14',
        Right: 'M 7.5 4 L 12.5 9 L 7.5 14'
      };
      var chevronVariants = [];
      var chevronDirections = ['Down', 'Up', 'Left', 'Right'];
      for (var cdi = 0; cdi < chevronDirections.length; cdi++) {
        var dir = chevronDirections[cdi];
        var compNode = figma.createComponent();
        compNode.name = 'Direction=' + dir;
        compNode.resize(20, 20);
        compNode.clipsContent = true;
        compNode.fills = [];
        try {
          var chevVec = figma.createVector();
          chevVec.name = 'Vector';
          chevVec.x = 0; chevVec.y = 0;
          chevVec.resize(20, 20);
          chevVec.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
          chevVec.vectorPaths = [{ windingRule: 'NONE', data: chevronPaths[dir] }];
          chevVec.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
          chevVec.strokeWeight = 1.75;
          chevVec.strokeCap = 'ROUND';
          chevVec.strokeJoin = 'ROUND';
          chevVec.fills = [];
          var chevColorVar = t2Vars[BP.masterContentColor];
          if (chevColorVar) {
            setPaintBoundToVariable(chevVec, 'strokes', chevColorVar);
            stats.bindings++;
          }
          compNode.appendChild(chevVec);
        } catch (cve) {
          log('Chevron ' + dir + ' vector creation failed: ' + cve.message);
        }
        chevronVariants.push(compNode);
      }
      try {
        chevronIconSet = figma.combineAsVariants(chevronVariants, page);
        chevronIconSet.name = 'Icon/Chevron';
        chevronIconSet.description = 'Directional chevron icon (Down / Up / Left / Right). Default = Down. Used by Split Button triggers; flip to Up for active/open state.';
        /* Auto-layout the variant grid so it presents cleanly. */
        try {
          chevronIconSet.layoutMode = 'HORIZONTAL';
          chevronIconSet.itemSpacing = 16;
          chevronIconSet.paddingLeft = 16; chevronIconSet.paddingRight = 16;
          chevronIconSet.paddingTop = 16; chevronIconSet.paddingBottom = 16;
          chevronIconSet.primaryAxisSizingMode = 'AUTO';
          chevronIconSet.counterAxisSizingMode = 'AUTO';
          for (var ncv = 0; ncv < chevronIconSet.children.length; ncv++) {
            try {
              chevronIconSet.children[ncv].layoutSizingHorizontal = 'FIXED';
              chevronIconSet.children[ncv].layoutSizingVertical = 'FIXED';
            } catch (e) {}
          }
        } catch (e) { /* combineAsVariants may already auto-layout */ }
        chevronIcon = chevronVariants[0]; /* Down */
        log('Created chevron icon set with 4 directions: ' + chevronIconSet.id + ' size=' + chevronIconSet.width + 'x' + chevronIconSet.height);
      } catch (cse) {
        log('Chevron combineAsVariants failed: ' + cse.message);
        /* Fall back to single Down component if combine fails */
        chevronIcon = chevronVariants[0];
        chevronIcon.name = 'Icon/Chevron Down';
        for (var cvi = 1; cvi < chevronVariants.length; cvi++) {
          try { chevronVariants[cvi].remove(); } catch (e) {}
        }
        chevronIconSet = null;
      }
    }
  }
  /* Resolve which icon to use as the trigger's default child.
     Always the Down chevron variant (or fallback placeholder). */
  var triggerIconComp = chevronIcon || iconPlaceholder;

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     PRESENTATION: Page Header — Hero Card (absolute positioning)
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  var headerSec = createSection(BP.name + ' — Overview', SECTION_W);

  /* Hero — plain frame, NO auto-layout. All children positioned manually. */
  var HERO_PAD = 40;
  var HERO_INNER_W = CARD_W - HERO_PAD * 2;
  var heroBg = figma.createFrame();
  heroBg.name = 'hero';
  heroBg.resize(CARD_W, 320);
  heroBg.fills = [{ type: 'SOLID', color: COLOR_HERO_BG }];
  heroBg.cornerRadius = 16;
  heroBg.clipsContent = false;

  var hy = 36; /* Y cursor inside hero */

  /* Title */
  var heroTitle = createLabel(BP.name.charAt(0).toUpperCase() + BP.name.slice(1), 32, true, COLOR_HERO_TEXT);
  heroBg.appendChild(heroTitle);
  heroTitle.x = HERO_PAD; heroTitle.y = hy;

  /* Version badge next to title */
  var versionBadge = createBadge(CODE_VERSION, COLOR_ACCENT, COLOR_ON_COMP);
  heroBg.appendChild(versionBadge);
  versionBadge.x = HERO_PAD + heroTitle.width + 16; versionBadge.y = hy + 8;
  hy += 46;

  /* Subtitle */
  var heroSub = createLabel('Two-tier component architecture with full design token binding', 16, false, COLOR_HERO_SUB);
  heroBg.appendChild(heroSub);
  heroSub.x = HERO_PAD; heroSub.y = hy;
  hy += 30;

  /* Divider */
  var heroDivider = createDivider(HERO_INNER_W);
  heroDivider.fills = [{ type: 'SOLID', color: COLOR_HERO_DIV }];
  heroBg.appendChild(heroDivider);
  heroDivider.x = HERO_PAD; heroDivider.y = hy;
  hy += 16;

  /* Stat badges — aggregate counts across all families.
     Tolerate both blueprint shapes: legacy flat (family.states) or
     wrapper-with-zones (BP.states at root, no family.states). */
  var _famNames = Object.keys(BP.families || {});
  var _totalTypes = 0, _totalStates = 0, _maxStates = 0;
  var _rootStatesLen = (BP.states && BP.states.length) || 0;
  for (var _fi = 0; _fi < _famNames.length; _fi++) {
    var _f = BP.families[_famNames[_fi]];
    _totalTypes += (_f.types && _f.types.length) || 0;
    var _famStLen = (_f.states && _f.states.length) || _rootStatesLen;
    if (_famStLen > _maxStates) _maxStates = _famStLen;
  }
  _totalStates = _maxStates;
  var statBadges = [
    createBadge('Tier 1: ' + masterNames.length + ' Masters', COLOR_HERO_CARD, COLOR_HERO_SUB),
    createBadge('Tier 2: ' + _famNames.length + ' Families \u00b7 ' + _totalTypes + ' Types \u00d7 up to ' + _totalStates + ' States', COLOR_HERO_CARD, COLOR_HERO_SUB),
    createBadge('Token-bound', COLOR_HERO_CARD, COLOR_SUCCESS)
  ];
  var bx = HERO_PAD;
  for (var sbi = 0; sbi < statBadges.length; sbi++) {
    heroBg.appendChild(statBadges[sbi]);
    statBadges[sbi].x = bx; statBadges[sbi].y = hy;
    bx += statBadges[sbi].width + 12;
  }
  hy += statBadges[0].height + 20;

  /* Architecture info boxes (side by side) */
  var INFO_W = Math.floor((HERO_INNER_W - 56) / 2);
  var INFO_H = 84;

  var t1Box = figma.createFrame();
  t1Box.name = 'tier1-info'; t1Box.resize(INFO_W, INFO_H); t1Box.cornerRadius = 10;
  t1Box.fills = [{ type: 'SOLID', color: COLOR_HERO_CARD }]; t1Box.clipsContent = false;
  var t1l1 = createLabel('TIER 1 \u2014 MASTERS', 11, true, COLOR_ACCENT);
  t1Box.appendChild(t1l1); t1l1.x = 20; t1l1.y = 14;
  var t1l2 = createLabel('Structure \u00b7 Spacing \u00b7 Sizing', 13, false, COLOR_HERO_SUB);
  t1Box.appendChild(t1l2); t1l2.x = 20; t1l2.y = 34;
  var t1l3 = createLabel('Bound to comp-size variables', 11, false, COLOR_HERO_FAINT);
  t1Box.appendChild(t1l3); t1l3.x = 20; t1l3.y = 56;
  heroBg.appendChild(t1Box); t1Box.x = HERO_PAD; t1Box.y = hy;

  var arrowNode = createLabel('\u2192', 24, true, COLOR_HERO_FAINT);
  heroBg.appendChild(arrowNode);
  arrowNode.x = HERO_PAD + INFO_W + 16; arrowNode.y = hy + 26;

  var t2Box = figma.createFrame();
  t2Box.name = 'tier2-info'; t2Box.resize(INFO_W, INFO_H); t2Box.cornerRadius = 10;
  t2Box.fills = [{ type: 'SOLID', color: COLOR_HERO_CARD }]; t2Box.clipsContent = false;
  var t2l1 = createLabel('TIER 2 \u2014 VARIANTS', 11, true, COLOR_SUCCESS);
  t2Box.appendChild(t2l1); t2l1.x = 20; t2l1.y = 14;
  var t2l2 = createLabel('Color \u00b7 State \u00b7 Interactions', 13, false, COLOR_HERO_SUB);
  t2Box.appendChild(t2l2); t2l2.x = 20; t2l2.y = 34;
  var t2l3 = createLabel('Token-bound fills, strokes, content', 11, false, COLOR_HERO_FAINT);
  t2Box.appendChild(t2l3); t2l3.x = 20; t2l3.y = 56;
  heroBg.appendChild(t2Box); t2Box.x = HERO_PAD + INFO_W + 48; t2Box.y = hy;

  hy += INFO_H + 36;
  heroBg.resize(CARD_W, hy); /* Resize hero to exact computed height */

  /* ── Bind hero fills to actual T2/T3 variables (live theme response) ── */
  if (t2Col && inverseModeId) {
    try {
      /* Set hero frame to inverse surface mode — all children inherit */
      heroBg.setExplicitVariableModeForCollection(t2Col, inverseModeId);

      /* Background */
      tryBindFill(heroBg, t2Vars['default/surfaces/bg']);

      /* Title & subtitle text */
      tryBindFill(heroTitle, t2Vars['default/content/strong']);
      tryBindFill(heroSub, t2Vars['default/content/subtle']);

      /* Divider */
      tryBindFill(heroDivider, t2Vars['default/surfaces/separator']);

      /* Info box backgrounds */
      tryBindFill(t1Box, t2Vars['default/surfaces/subtle']);
      tryBindFill(t2Box, t2Vars['default/surfaces/subtle']);

      /* Info box text — faint & subtle */
      tryBindFill(t1l2, t2Vars['default/content/subtle']);
      tryBindFill(t1l3, t2Vars['default/content/faint']);
      tryBindFill(t2l2, t2Vars['default/content/subtle']);
      tryBindFill(t2l3, t2Vars['default/content/faint']);
      tryBindFill(arrowNode, t2Vars['default/content/faint']);

      /* Stat badge backgrounds — bind to surfaces/subtle */
      for (var sbBind = 0; sbBind < statBadges.length; sbBind++) {
        tryBindFill(statBadges[sbBind], t2Vars['default/surfaces/subtle']);
      }

      log('Hero: bound ALL children to T2 inverse surface variables');
    } catch (heroBindErr) {
      log('Hero binding skipped: ' + heroBindErr.message);
    }
  }
  /* Bind T3 accent elements on hero (these need T3 collection mode set) */
  if (t3Col && brandModeId) {
    try {
      heroBg.setExplicitVariableModeForCollection(t3Col, brandModeId);
      tryBindFill(t1l1, t3Vars['content/default']); /* "TIER 1 — MASTERS" label */
      tryBindFill(versionBadge, t3Vars['component/bg-default']); /* version badge bg */
    } catch (e) {}
  }
  if (t3Col && t3Modes['success']) {
    try {
      /* t2l1 "TIER 2 — VARIANTS" uses success — but mode set on heroBg applies to children */
      /* We can't set two T3 modes on one frame, so these stay as resolved colors */
    } catch (e) {}
  }

  /* Place hero in section */
  headerSec.section.appendChild(heroBg);
  heroBg.x = headerSec.innerX;
  heroBg.y = headerSec.innerY;

  /* Meta footer */
  var metaNode = createLabel('Generated by Design Token Forge', 11, false, COLOR_DIMMED);
  headerSec.section.appendChild(metaNode);
  metaNode.x = headerSec.innerX;
  metaNode.y = headerSec.innerY + heroBg.height + 12;
  tryBindFill(metaNode, t2Vars['default/content/subtle']);

  var headerH = headerSec.innerY + heroBg.height + 12 + 18 + 32;
  try { headerSec.section.resize(SECTION_W, headerH); } catch (e) {}
  page.appendChild(headerSec.section);
  headerSec.section.x = PAGE_X;
  headerSec.section.y = cursorY;
  cursorY += headerH + SECTION_GAP;

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     PRESENTATION: Icon Primitive (absolute positioning)
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  var iconSec = createSection(BP.name + ' — Icon Primitive', 480);

  /* Card background */
  var iconCard = figma.createFrame();
  iconCard.name = 'icon-card';
  iconCard.resize(400, 160);
  iconCard.cornerRadius = 12;
  iconCard.fills = [{ type: 'SOLID', color: COLOR_CARD_BG }];
  iconCard.strokes = [{ type: 'SOLID', color: COLOR_OUTLINE }];
  iconCard.strokeWeight = 1; iconCard.strokeAlign = 'INSIDE';
  iconCard.clipsContent = false;

  var icTitle = createLabel('Icon Primitive', 16, true, COLOR_HEADING);
  iconCard.appendChild(icTitle); icTitle.x = 24; icTitle.y = 20;
  var icDesc = createLabel('Default INSTANCE_SWAP target.\nReplace with your icon library.', 12, false, COLOR_BODY);
  iconCard.appendChild(icDesc); icDesc.x = 24; icDesc.y = 44;

  /* Icon preview box — auto-layout so it hugs whatever children we
     append (placeholder alone, or placeholder + 4-direction chevron set). */
  var icPreview = figma.createFrame();
  icPreview.name = 'icon-preview';
  icPreview.layoutMode = 'HORIZONTAL';
  icPreview.primaryAxisSizingMode = 'AUTO';
  icPreview.counterAxisSizingMode = 'AUTO';
  icPreview.counterAxisAlignItems = 'CENTER';
  icPreview.itemSpacing = 24;
  icPreview.paddingLeft = 22; icPreview.paddingRight = 22;
  icPreview.paddingTop = 22; icPreview.paddingBottom = 22;
  icPreview.cornerRadius = 8;
  icPreview.fills = [{ type: 'SOLID', color: COLOR_SURFACE_BG }];
  icPreview.strokes = [{ type: 'SOLID', color: COLOR_OUTLINE }];
  icPreview.strokeWeight = 1; icPreview.strokeAlign = 'INSIDE';
  icPreview.dashPattern = [4, 4];
  icPreview.clipsContent = false;
  iconCard.appendChild(icPreview);
  icPreview.x = 24; icPreview.y = 82;
  icPreview.appendChild(iconPlaceholder);
  try { iconPlaceholder.layoutSizingHorizontal = 'FIXED'; iconPlaceholder.layoutSizingVertical = 'FIXED'; } catch (e) {}

  /* If a chevron icon set was created (split-button generation), place it
     beside the placeholder. Auto-layout will grow icPreview to fit; we
     then grow the outer iconCard to fit the new preview width/height. */
  if (chevronIconSet) {
    icPreview.appendChild(chevronIconSet);
    try { chevronIconSet.layoutSizingHorizontal = 'FIXED'; chevronIconSet.layoutSizingVertical = 'FIXED'; } catch (e) {}
    /* After auto-layout settles, icPreview.width/height reflect the real
       hugged size. Grow iconCard accordingly. */
    var newPreviewW = icPreview.width;
    var newPreviewH = icPreview.height;
    try { iconCard.resize(Math.max(iconCard.width, 24 + newPreviewW + 24), Math.max(iconCard.height, 82 + newPreviewH + 24)); } catch (e) {}
  } else if (chevronIcon && chevronIcon !== iconPlaceholder) {
    /* Fallback path when combineAsVariants failed — single chevron component */
    icPreview.appendChild(chevronIcon);
    try { chevronIcon.layoutSizingHorizontal = 'FIXED'; chevronIcon.layoutSizingVertical = 'FIXED'; } catch (e) {}
  }

  iconSec.section.appendChild(iconCard);
  iconCard.x = iconSec.innerX;
  iconCard.y = iconSec.innerY;

  /* Bind icon card to surface-bright tokens */
  if (t2Col && brightModeId) {
    try {
      iconCard.setExplicitVariableModeForCollection(t2Col, brightModeId);
      tryBindFill(iconCard, t2Vars['default/surfaces/subtle']);
      tryBindStroke(iconCard, t2Vars['default/surfaces/outline']);
      tryBindFill(icTitle, t2Vars['default/content/strong']);
      tryBindFill(icDesc, t2Vars['default/content/default']);
      tryBindFill(icPreview, t2Vars['default/surfaces/bg']);
      tryBindStroke(icPreview, t2Vars['default/surfaces/outline']);
    } catch (icBindErr) {
      log('Icon card binding skipped: ' + icBindErr.message);
    }
  }
  var iconSecH = iconSec.innerY + iconCard.height + 32;
  /* Section width grows to fit the card (which may have been widened to
     accommodate the chevron variant set). */
  var iconSecW = Math.max(480, iconSec.innerX + iconCard.width + 32);
  try { iconSec.section.resize(iconSecW, iconSecH); } catch (e) {}
  page.appendChild(iconSec.section);
  iconSec.section.x = PAGE_X;
  iconSec.section.y = cursorY;
  cursorY += iconSecH + SECTION_GAP;

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     PRESENTATION: Tier 1 — Master Components (absolute positioning)
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  figma.ui.postMessage({ type: 'gen-progress', text: 'Building master components…' });

  var masterSec = createSection(BP.name + ' — Tier 1 / Masters', SECTION_W);

  /* Header bar — plain frame with absolute text */
  var mHeaderBar = figma.createFrame();
  mHeaderBar.name = 'tier1-header';
  mHeaderBar.resize(CARD_W, 96);
  mHeaderBar.cornerRadius = 0;
  mHeaderBar.fills = [];
  mHeaderBar.clipsContent = false;

  var mhBadge = createBadge('TIER 1', COLOR_PRIMARY_CONTAINER, COLOR_PRIMARY_CT);
  mHeaderBar.appendChild(mhBadge); mhBadge.x = 0; mhBadge.y = 8;
  var mhTitle = createLabel('Master Components', 26, true, COLOR_HEADING);
  mHeaderBar.appendChild(mhTitle); mhTitle.x = 0; mhTitle.y = 38;
  var mhDesc = createLabel('Structure + spacing \u00b7 Bound to comp-size variables \u00b7 No color (inherited from Tier 2)', 12, false, COLOR_BODY);
  mHeaderBar.appendChild(mhDesc); mhDesc.x = 0; mhDesc.y = 74;

  masterSec.section.appendChild(mHeaderBar);
  mHeaderBar.x = masterSec.innerX;
  mHeaderBar.y = masterSec.innerY;

  /* Bind master header to surface-bright tokens */
  if (t2Col && brightModeId) {
    try {
      mHeaderBar.setExplicitVariableModeForCollection(t2Col, brightModeId);
      tryBindFill(mhTitle, t2Vars['default/content/strong']);
      tryBindFill(mhDesc, t2Vars['default/content/default']);
    } catch (mhBindErr) {
      log('Master header binding skipped: ' + mhBindErr.message);
    }
  }
  /* Bind tier-1 badge to primary container tokens */
  if (t3Col && brandModeId) {
    try {
      mhBadge.setExplicitVariableModeForCollection(t3Col, brandModeId);
      tryBindFill(mhBadge, t3Vars['container/bg']);
      /* Bind badge label text */
      if (mhBadge.children.length > 0) tryBindFill(mhBadge.children[0], t3Vars['content/default']);
    } catch (e) {}
  }

  var masterFrame = figma.createFrame();
  masterFrame.name = BP.name + ' / Masters';
  masterFrame.fills = [];
  masterFrame.resize(600, 80);
  masterFrame.clipsContent = false;

  var masterComponents = {};
  /* masterNames already defined before hero section */

  /* Look up existing button masters by name on the Components page.
     Required for wrapper-with-button-instance kind (split-button reuses
     button masters as its action zone). Empty when generating button itself. */
  var buttonMasters = {};
  if (BP.kind === 'wrapper-with-button-instance') {
    var pageNodes = page.findAll(function(n) {
      return n.type === 'COMPONENT' && n.name && n.name.indexOf('mc / ') === 0;
    });
    for (var bmi = 0; bmi < pageNodes.length; bmi++) {
      buttonMasters[pageNodes[bmi].name.replace(/^mc \/ /, '')] = pageNodes[bmi];
    }
    log('Found ' + pageNodes.length + ' existing button masters: ' + Object.keys(buttonMasters).join(', '));
  }

  for (var mi = 0; mi < masterNames.length; mi++) {
    var masterName = masterNames[mi];
    var masterCfg = BP.masters[masterName];
    var slots = masterCfg.slots;

    /* ── Wrapper-with-button-instance branch (split-button) ──────
       Build a wrapper master that hosts a button-master instance + a
       chevron zone. Skips the slot-based construction below. */
    if (BP.kind === 'wrapper-with-button-instance') {
      var btnMasterName = masterCfg.buttonMaster;
      var btnMaster = buttonMasters[btnMasterName];
      if (!btnMaster) {
        var errMsg = 'Cannot build "' + masterName + '": button master "' + btnMasterName + '" not found. Generate Button component first.';
        log(errMsg);
        stats.errors.push(errMsg);
        continue;
      }

      /* Create wrapper master */
      var sbMaster = figma.createComponent();
      sbMaster.name = 'mc / ' + masterName;
      sbMaster.description = BP.description || '';
      sbMaster.resize(140, 32);
      sbMaster.layoutMode = 'HORIZONTAL';
      sbMaster.counterAxisAlignItems = 'CENTER';
      sbMaster.primaryAxisAlignItems = 'MIN';
      sbMaster.layoutSizingHorizontal = 'HUG';
      sbMaster.layoutSizingVertical = 'FIXED';
      sbMaster.fills = [];                /* color comes from variant */
      sbMaster.clipsContent = true;       /* clip inner zones at outer rounded corners (Q4) */
      sbMaster.itemSpacing = 0;
      sbMaster.paddingLeft = 0;
      sbMaster.paddingRight = 0;
      sbMaster.paddingTop = 0;
      sbMaster.paddingBottom = 0;

      /* Bind root size variables (height, 4 outer corners) */
      var sbRootBinds = BP.sizeBindings.root;
      var sbRootKeys = Object.keys(sbRootBinds);
      for (var sbrk = 0; sbrk < sbRootKeys.length; sbrk++) {
        var sbrv = compSizeVars[sbRootBinds[sbRootKeys[sbrk]]];
        if (sbrv) {
          await tryBindVar(sbMaster, sbRootKeys[sbrk], sbrv);
          stats.bindings++;
        }
      }

      /* ── Action zone: instance of the existing button master ──
         Same ordering rule as trigger: append first, then set sizing. */
      var actionInst = btnMaster.createInstance();
      actionInst.name = 'Action';
      /* Strip the button instance's stroke/fill so the wrapper's
         variant overrides become the visible color (single source). */
      try { actionInst.fills = []; } catch (e) {}
      try { actionInst.strokes = []; } catch (e) {}
      sbMaster.appendChild(actionInst);
      try { actionInst.layoutSizingHorizontal = 'HUG'; } catch (e) {}
      try { actionInst.layoutSizingVertical   = 'FIXED'; } catch (e) {}

      /* ── Trigger zone: chevron icon in a small frame with leftStroke = divider ──
         IMPORTANT: do NOT set layoutSizingVertical/Horizontal here — must be
         applied AFTER appendChild to parent, otherwise FIXED captures the
         default 100px height. We also bind 'height' explicitly to the
         button height token as a defensive measure. */
      var triggerZone = figma.createFrame();
      triggerZone.name = 'Trigger';
      triggerZone.layoutMode = 'HORIZONTAL';
      triggerZone.counterAxisAlignItems = 'CENTER';
      triggerZone.primaryAxisAlignItems = 'CENTER';
      triggerZone.fills = [];
      triggerZone.itemSpacing = 0;
      triggerZone.clipsContent = false;
      /* Pre-resize to button-default height so initial dimensions are sane
         before sizing modes are applied post-append. */
      triggerZone.resize(28, 32);

      /* Bind trigger zone padding */
      var triggerPadVar = compSizeVars[BP.sizeBindings.chevronWrapperPadL];
      if (triggerPadVar) {
        await tryBindVar(triggerZone, 'paddingLeft',  triggerPadVar);
        await tryBindVar(triggerZone, 'paddingRight', triggerPadVar);
        stats.bindings += 2;
      }

      /* Divider = 1px LEFT stroke on the trigger zone.
         Bind to T2 separator at master level. Brand-family variants will
         REBIND this stroke to the T3 separator at variant time so the
         divider tracks the variant's palette context. */
      var sepVar = t2Vars[BP.dividerColor.t2];
      if (sepVar) {
        setPaintBoundToVariable(triggerZone, 'strokes', sepVar);
        triggerZone.strokeWeight = 0;
        try {
          triggerZone.strokeLeftWeight   = 1;
          triggerZone.strokeRightWeight  = 0;
          triggerZone.strokeTopWeight    = 0;
          triggerZone.strokeBottomWeight = 0;
        } catch (e) { log('Per-edge stroke not supported: ' + e.message); }
        triggerZone.strokeAlign = 'INSIDE';
        stats.bindings++;
      }

      /* Chevron icon — instance of the icon placeholder.
         Same ordering rule: append first, then set FIXED sizing + bind size. */
      var chevronInst = triggerIconComp.createInstance();
      chevronInst.name = 'Chevron';
      triggerZone.appendChild(chevronInst);
      try { chevronInst.layoutSizingHorizontal = 'FIXED'; } catch (e) {}
      try { chevronInst.layoutSizingVertical   = 'FIXED'; } catch (e) {}
      var chevBinds = BP.sizeBindings.chevron;
      var chevKeys = Object.keys(chevBinds);
      for (var ck = 0; ck < chevKeys.length; ck++) {
        var chv = compSizeVars[chevBinds[chevKeys[ck]]];
        if (chv) {
          await tryBindVar(chevronInst, chevKeys[ck], chv);
          stats.bindings++;
        }
      }

      /* Append trigger zone to wrapper, THEN apply sizing + bind height. */
      sbMaster.appendChild(triggerZone);
      try { triggerZone.layoutSizingHorizontal = 'HUG'; } catch (e) {}
      try { triggerZone.layoutSizingVertical   = 'FIXED'; } catch (e) {}
      /* Defensive height bind: ensure trigger height tracks button height
         even if FIXED sizing somehow captured a stale value. */
      var btnHeightVar = compSizeVars[BP.sizeBindings.root.height];
      if (btnHeightVar) {
        await tryBindVar(triggerZone, 'height', btnHeightVar);
        stats.bindings++;
      }


      /* Component property: expose chevron as INSTANCE_SWAP so designers can
         replace it with a different icon (e.g. dots, ellipsis). */
      try {
        var chevSwapKey = sbMaster.addComponentProperty('Chevron icon', 'INSTANCE_SWAP', triggerIconComp.id);
        chevronInst.componentPropertyReferences = { mainComponent: chevSwapKey };
      } catch (e) { log('Chevron INSTANCE_SWAP property failed: ' + e.message); }

      /* Place into masterFrame and section */
      masterFrame.appendChild(sbMaster);
      sbMaster.x = mi * 360;
      sbMaster.y = 0;

      var sbMasterLabel = createLabel(masterName, 13, true, COLOR_HEADING);
      masterSec.section.appendChild(sbMasterLabel);
      sbMasterLabel.x = masterSec.innerX + mi * 360;
      sbMasterLabel.y = masterSec.innerY + mHeaderBar.height + 24;
      tryBindFill(sbMasterLabel, t2Vars['default/content/strong']);

      var sbMasterBadge = createBadge('action + chevron', COLOR_CM_BG, COLOR_DIMMED);
      masterSec.section.appendChild(sbMasterBadge);
      sbMasterBadge.x = masterSec.innerX + mi * 360 + sbMasterLabel.width + 12;
      sbMasterBadge.y = masterSec.innerY + mHeaderBar.height + 22;
      tryBindFill(sbMasterBadge, t2Vars['default/component/bg']);
      if (sbMasterBadge.children.length > 0) tryBindFill(sbMasterBadge.children[0], t2Vars['default/content/subtle']);

      masterComponents[masterName] = sbMaster;
      log('Created split-button master: ' + masterName + ' (action=' + btnMasterName + ')');
      continue; /* skip the slot-based construction below */
    }


    /* Create master component */
    var master = figma.createComponent();
    master.name = 'mc / ' + masterName;
    master.description = BP.description || '';
    master.resize(120, 32);
    master.layoutMode = 'HORIZONTAL';
    master.counterAxisAlignItems = 'CENTER';
    master.primaryAxisAlignItems = masterCfg.rootPAlign || 'MIN';
    master.layoutSizingHorizontal = 'HUG';
    master.layoutSizingVertical = 'FIXED';
    master.fills = []; /* NO fill on master — color comes from variant */
    master.clipsContent = false;

    /* No root gap — icon wrapper's right padding provides visual spacing
       between icon and text. Root itemSpacing is always 0. */
    master.itemSpacing = 0;

    /* Bind root size variables (height, radius) */
    var rootBinds = BP.sizeBindings.root;
    var rootKeys = Object.keys(rootBinds);
    for (var rk = 0; rk < rootKeys.length; rk++) {
      var rv = compSizeVars[rootBinds[rootKeys[rk]]];
      if (rv) {
        await tryBindVar(master, rootKeys[rk], rv);
        stats.bindings++;
      }
    }

    /* Track whether this master has an icon (for INSTANCE_SWAP property) */
    var hasIcon = false;

    /* ── Create children based on slot definitions ──
       Padding rules:
         - Icon wrapper: ALWAYS bind both padL + padR (its padR = gap between icon & text)
         - Text wrapper: padR always, padL only when it's the sole slot (text-only button)
         - Root itemSpacing = 0 — no gap between wrappers */
    for (var si = 0; si < slots.length; si++) {
      var slot = slots[si];
      var isFirstSlot = (si === 0);

      if (slot === 'iconWrapper') {
        hasIcon = true;

        /* ── Icon Wrapper Container ── */
        var iconWrapper = figma.createFrame();
        iconWrapper.name = 'Icon wrapper cont';
        iconWrapper.layoutMode = 'HORIZONTAL';
        iconWrapper.counterAxisAlignItems = 'CENTER';
        iconWrapper.primaryAxisAlignItems = masterCfg.iconWrapperPAlign || 'MIN';
        iconWrapper.layoutSizingHorizontal = 'HUG';
        iconWrapper.layoutSizingVertical = 'HUG';
        iconWrapper.fills = [];
        iconWrapper.itemSpacing = 0;

        /* Icon wrapper: ALWAYS bind padL.
           padR depends on whether this is the only slot (icon-only → symmetric icon pad)
           or there's a text slot after it (icon+text → padR is icon-to-text gap). */
        var isOnlySlot = (slots.length === 1);
        var iwPadLVar = compSizeVars[isOnlySlot ? BP.sizeBindings.iconPad : BP.sizeBindings.iconWrapperPadL];
        if (iwPadLVar) { await tryBindVar(iconWrapper, 'paddingLeft', iwPadLVar); stats.bindings++; }
        var iwPadRVar = compSizeVars[isOnlySlot ? BP.sizeBindings.iconPad : BP.sizeBindings.iconWrapperPadR];
        if (iwPadRVar) { await tryBindVar(iconWrapper, 'paddingRight', iwPadRVar); stats.bindings++; }

        /* ── Icon Instance (INSTANCE of placeholder component) ──
           Reference: the icon is an INSTANCE with layoutMode NONE,
           clipsContent true, FIXED×FIXED sizing, width/height bound
           to icon container variable. The vector child has SCALE constraints
           so it resizes proportionally. */
        var iconInst = iconPlaceholder.createInstance();
        iconInst.name = iconPlaceholder.name;
        iconInst.layoutSizingHorizontal = 'FIXED';
        iconInst.layoutSizingVertical = 'FIXED';

        /* Bind icon instance size to comp-size variables */
        var iconBinds = BP.sizeBindings.icon;
        var iconKeys = Object.keys(iconBinds);
        for (var iik = 0; iik < iconKeys.length; iik++) {
          var iiv = compSizeVars[iconBinds[iconKeys[iik]]];
          if (iiv) {
            await tryBindVar(iconInst, iconKeys[iik], iiv);
            stats.bindings++;
          }
        }

        iconWrapper.appendChild(iconInst);
        master.appendChild(iconWrapper);
      }

      if (slot === 'textWrapper') {
        /* ── Text Wrapper Container ── */
        var textWrapper = figma.createFrame();
        textWrapper.name = 'text wrapper cont';
        textWrapper.layoutMode = 'HORIZONTAL';
        textWrapper.counterAxisAlignItems = 'CENTER';
        textWrapper.primaryAxisAlignItems = 'CENTER';
        textWrapper.layoutSizingHorizontal = 'HUG';
        textWrapper.layoutSizingVertical = 'HUG';
        textWrapper.fills = [];
        textWrapper.itemSpacing = 0;

        /* Text wrapper: padR always, padL only when text is the sole slot
           (text-only button needs left padding; icon+text button does not
            because the icon wrapper's right padding provides spacing). */
        if (isFirstSlot) {
          var twPadLVar = compSizeVars[BP.sizeBindings.textWrapperPadL];
          if (twPadLVar) { await tryBindVar(textWrapper, 'paddingLeft', twPadLVar); stats.bindings++; }
        }
        var twPadRVar = compSizeVars[BP.sizeBindings.textWrapperPadR];
        if (twPadRVar) { await tryBindVar(textWrapper, 'paddingRight', twPadRVar); stats.bindings++; }

        /* Text node */
        var textNode = figma.createText();
        textNode.name = 'text button';
        textNode.fontName = fontName;
        textNode.characters = 'Button';
        textNode.fontSize = 14;
        textNode.lineHeight = { unit: 'AUTO' };
        textNode.textAlignHorizontal = 'LEFT';
        textNode.textAlignVertical = 'CENTER';
        textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
        textNode.leadingTrim = 'CAP_HEIGHT';
        textNode.layoutAlign = 'INHERIT';

        /* Content color on text */
        var textContentVar = t2Vars[BP.masterContentColor];
        if (textContentVar) {
          setPaintBoundToVariable(textNode, 'fills', textContentVar);
          stats.bindings++;
        }

        /* Bind font size from comp-size */
        var textBinds = BP.sizeBindings.text;
        var textKeys = Object.keys(textBinds);
        for (var txk = 0; txk < textKeys.length; txk++) {
          var txv = compSizeVars[textBinds[textKeys[txk]]];
          if (txv) {
            await tryBindVar(textNode, textKeys[txk], txv);
            stats.bindings++;
          }
        }

        /* Bind typography variables to text node (font-family, font-style, line-height, letter-spacing) */
        if (typoVars['font-family/primary']) {
          await tryBindVar(textNode, 'fontFamily', typoVars['font-family/primary']);
          stats.bindings++;
        }
        if (typoVars['font-style/default']) {
          await tryBindVar(textNode, 'fontStyle', typoVars['font-style/default']);
          stats.bindings++;
        }
        if (typoVars['line-height/base']) {
          await tryBindVar(textNode, 'lineHeight', typoVars['line-height/base']);
          stats.bindings++;
        }
        if (typoVars['letter-spacing/normal']) {
          await tryBindVar(textNode, 'letterSpacing', typoVars['letter-spacing/normal']);
          stats.bindings++;
        }

        textWrapper.appendChild(textNode);
        master.appendChild(textWrapper);
      }
    }

    /* ── Add component properties on the MASTER ──
       Properties added here propagate through all instances automatically.
       INSTANCE_SWAP for icon + TEXT for label. */
    if (hasIcon) {
      var swapPropKey = master.addComponentProperty('Icon', 'INSTANCE_SWAP', iconPlaceholder.id);
      /* Wire the icon instance to this swap property.
         Must be done BEFORE the master is instanced. */
      var iconInstInMaster = master.findOne(function(n) { return n.type === 'INSTANCE'; });
      if (iconInstInMaster) {
        iconInstInMaster.componentPropertyReferences = { mainComponent: swapPropKey };
        log('Wired INSTANCE_SWAP on ' + masterName + ' → key: ' + swapPropKey);
      }
    }

    /* TEXT property for label — wire to text node inside the master */
    var hasText = masterCfg.slots.indexOf('textWrapper') !== -1;
    if (hasText) {
      var textPropKey = master.addComponentProperty('label', 'TEXT', 'Button');
      var textInMaster = master.findOne(function(n) { return n.type === 'TEXT' && n.name === 'text button'; });
      if (textInMaster) {
        textInMaster.componentPropertyReferences = { characters: textPropKey };
        log('Wired TEXT property on ' + masterName + ' → key: ' + textPropKey);
      }
    }

    masterFrame.appendChild(master);
    /* Position inside invisible frame (for Figma component panel) */
    master.x = mi * 320;
    master.y = 0;

    /* Simple label for this master — positioned directly above it */
    var masterLabel = createLabel(masterName, 13, true, COLOR_HEADING);
    masterSec.section.appendChild(masterLabel);
    masterLabel.x = masterSec.innerX + mi * 320;
    masterLabel.y = masterSec.innerY + mHeaderBar.height + 24;
    tryBindFill(masterLabel, t2Vars['default/content/strong']);

    var masterSlotBadge = createBadge(masterCfg.slots.join(' + '), COLOR_CM_BG, COLOR_DIMMED);
    masterSec.section.appendChild(masterSlotBadge);
    masterSlotBadge.x = masterSec.innerX + mi * 320 + masterLabel.width + 12;
    masterSlotBadge.y = masterSec.innerY + mHeaderBar.height + 22;
    tryBindFill(masterSlotBadge, t2Vars['default/component/bg']);
    if (masterSlotBadge.children.length > 0) tryBindFill(masterSlotBadge.children[0], t2Vars['default/content/subtle']);

    masterComponents[masterName] = master;
    log('Created master: ' + masterName + ' (' + master.children.length + ' children)');
  }

  /* Resize master frame to fit its children (invisible, just for component panel) */
  var mfMaxX = 0, mfMaxY = 0;
  for (var mfi = 0; mfi < masterFrame.children.length; mfi++) {
    var mc = masterFrame.children[mfi];
    var mcR = mc.x + mc.width;
    var mcB = mc.y + mc.height;
    if (mcR > mfMaxX) mfMaxX = mcR;
    if (mcB > mfMaxY) mfMaxY = mcB;
  }
  try { masterFrame.resize(mfMaxX + 40, mfMaxY + 20); } catch (e) {}

  /* Place master frame in section (below header + single label row) */
  var masterFrameY = masterSec.innerY + mHeaderBar.height + 24 + 28 + 16;
  masterSec.section.appendChild(masterFrame);
  masterFrame.x = masterSec.innerX;
  masterFrame.y = masterFrameY;

  var masterSecH = masterFrameY + masterFrame.height + 40;
  try { masterSec.section.resize(SECTION_W, masterSecH); } catch (e) {}
  page.appendChild(masterSec.section);
  masterSec.section.x = PAGE_X;
  masterSec.section.y = cursorY;
  cursorY += masterSecH + SECTION_GAP;

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     PRESENTATION: Tier 2 — Variant Component Sets (absolute positioning)
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  figma.ui.postMessage({ type: 'gen-progress', text: 'Building variant components…' });

  var allComponentSets = [];

  var variantSec = createSection(BP.name + ' — Tier 2 / Variants', SECTION_W);

  /* Header bar — plain frame, absolute children */
  var vHeaderBar = figma.createFrame();
  vHeaderBar.name = 'tier2-header';
  vHeaderBar.resize(CARD_W, 96);
  vHeaderBar.cornerRadius = 0;
  vHeaderBar.fills = [];
  vHeaderBar.clipsContent = false;

  var vhBadge = createBadge('TIER 2', COLOR_SUCCESS_CONTAINER, COLOR_SUCCESS_CT);
  vHeaderBar.appendChild(vhBadge); vhBadge.x = 0; vhBadge.y = 8;
  var vhTitle = createLabel('Variant Component Sets', 26, true, COLOR_HEADING);
  vHeaderBar.appendChild(vhTitle); vhTitle.x = 0; vhTitle.y = 38;
  var vhDesc = createLabel('Color + state overrides \u00b7 Each variant wraps a Tier 1 master instance with token-bound fills, strokes, and content colors', 12, false, COLOR_BODY);
  vHeaderBar.appendChild(vhDesc); vhDesc.x = 0; vhDesc.y = 74;

  variantSec.section.appendChild(vHeaderBar);
  vHeaderBar.x = variantSec.innerX;
  vHeaderBar.y = variantSec.innerY;

  /* Bind variant header to surface-bright tokens */
  if (t2Col && brightModeId) {
    try {
      vHeaderBar.setExplicitVariableModeForCollection(t2Col, brightModeId);
      tryBindFill(vhTitle, t2Vars['default/content/strong']);
      tryBindFill(vhDesc, t2Vars['default/content/default']);
    } catch (vhBindErr) {
      log('Variant header binding skipped: ' + vhBindErr.message);
    }
  }
  /* Bind tier-2 badge to success container tokens */
  if (t3Col && t3Modes['success']) {
    try {
      vhBadge.setExplicitVariableModeForCollection(t3Col, t3Modes['success']);
      tryBindFill(vhBadge, t3Vars['container/bg']);
      if (vhBadge.children.length > 0) tryBindFill(vhBadge.children[0], t3Vars['content/default']);
    } catch (e) {}
  }

  var varSecContentY = variantSec.innerY + vHeaderBar.height + 24;

  for (var mci = 0; mci < masterNames.length; mci++) {
    var mName = masterNames[mci];
    var masterComp = masterComponents[mName];

    /* Iterate FAMILIES (Neutral, Brand, …) — each produces its own component set. */
    var familyNames = Object.keys(BP.families);
    for (var famI = 0; famI < familyNames.length; famI++) {
      var familyName = familyNames[famI];
      var family = BP.families[familyName];
      var famTypes = family.types;
      var famStates;          /* state name array */
      var famOverrides;       /* { type: { state: overridesObj } } */
      var famT3ModeId = (family.t3Mode && t3Modes[family.t3Mode]) ? t3Modes[family.t3Mode] : null;

      /* Two blueprint shapes:
         - Legacy flat (button): family.states + family.stateOverrides
         - Wrapper-with-zones (split-button): BP.states + family.typeSpecs
           Expand typeSpecs to per-zone overrides matching the 8-state axis. */
      if (BP.kind === 'wrapper-with-button-instance' && family.typeSpecs) {
        famStates = BP.states;
        famOverrides = expandTypeSpecsToZoneOverrides(family.typeSpecs, BP.states);
      } else {
        famStates = family.states;
        famOverrides = family.stateOverrides;
      }

      var setDisplayName = BP.name + ' / ' + familyName + ' / ' + mName;

      var components = []; /* { component, type, state, rounded } */

      /* Rounded axis — boolean variant property mirroring CSS [data-rounded].
         False = bound to button/default/radius (default). True = bound to
         button/radius-rounded (pill, 9999). Lookup tolerates both naming
         conventions used across files. */
      var radiusRoundedVar = compSizeVars['button/radius-rounded']
                          || compSizeVars['button/default/radius-rounded'];
      var roundedValues = [false, true];

      for (var ri2 = 0; ri2 < roundedValues.length; ri2++) {
        var isRounded = roundedValues[ri2];
      for (var ti = 0; ti < famTypes.length; ti++) {
        var typeName = famTypes[ti];
        for (var sti = 0; sti < famStates.length; sti++) {
          var stateName = famStates[sti];
          var overrides = famOverrides[typeName] && famOverrides[typeName][stateName];
          if (!overrides) continue;

          /* Create variant component — thin wrapper, NO padding or layout of its own.
             All structure comes from the master instance inside it. */
          var varComp = figma.createComponent();
          varComp.name = 'Type=' + typeName + ', State=' + stateName + ', Rounded=' + (isRounded ? 'True' : 'False');
          varComp.resize(120, 36);
          varComp.layoutMode = 'HORIZONTAL';
          varComp.counterAxisAlignItems = 'CENTER';
          varComp.primaryAxisAlignItems = 'MIN';
          varComp.layoutSizingHorizontal = 'HUG';
          varComp.layoutSizingVertical = 'HUG';
          varComp.fills = [];
          varComp.clipsContent = false;
          varComp.paddingLeft = 0;
          varComp.paddingRight = 0;
          varComp.paddingTop = 0;
          varComp.paddingBottom = 0;
          varComp.itemSpacing = 0;

          /* Lock T3 mode for brand/semantic families so all { t3: … } bindings
             resolve to the family's status palette. A per-state override
             (overrides.t3Mode) wins — used by Selected to force brand-mode
             resolution so the selected highlight is visibly distinct from
             the default neutral surface. */
          var stateT3ModeId = (overrides.t3Mode && t3Modes[overrides.t3Mode]) ? t3Modes[overrides.t3Mode] : null;
          var effectiveT3ModeId = stateT3ModeId || famT3ModeId;
          if (effectiveT3ModeId && t3Col) {
            try { varComp.setExplicitVariableModeForCollection(t3Col, effectiveT3ModeId); }
            catch (e) { log('T3 mode lock failed (' + familyName + '/' + stateName + '): ' + e.message); }
          }

          /* Disabled opacity lives on the COMPONENT (not the instance) */
          if (overrides.componentOpacity !== undefined) {
            varComp.opacity = overrides.componentOpacity;
          }

          /* Create instance of master component */
          var instance = masterComp.createInstance();
          varComp.appendChild(instance);
          instance.layoutSizingHorizontal = 'HUG';
          instance.layoutSizingVertical = 'FIXED';

          /* Rounded override — rebind all four corner radii on the instance
             to button/radius-rounded. Master remains bound to button/default/radius;
             instance bindings override the master per Figma's variable inheritance. */
          if (isRounded && radiusRoundedVar) {
            try {
              await tryBindVar(instance, 'topLeftRadius',     radiusRoundedVar);
              await tryBindVar(instance, 'topRightRadius',    radiusRoundedVar);
              await tryBindVar(instance, 'bottomLeftRadius',  radiusRoundedVar);
              await tryBindVar(instance, 'bottomRightRadius', radiusRoundedVar);
              stats.bindings += 4;
            } catch (rre) {
              log('Rounded radius bind failed (' + familyName + '/' + typeName + '/' + stateName + '): ' + rre.message);
            }
          }

          /* ── Apply color overrides on the INSTANCE ── */

          if (BP.kind === 'wrapper-with-button-instance') {
            /* Per-zone overrides: action zone + trigger zone applied
               independently. Wrapper-level overrides apply to the instance
               (which is the wrapper master instance). */
            var wrapOv    = overrides.wrapper || {};
            var actionOv  = overrides.action  || {};
            var triggerOv = overrides.trigger || {};

            /* Wrapper-level componentOpacity → on the variant component */
            if (wrapOv.componentOpacity !== undefined) {
              varComp.opacity = wrapOv.componentOpacity;
            }

            /* Wrapper-level fill (rare — focus-with-fill) → on the instance */
            if (wrapOv.fill) {
              var wrapFillVar = resolveColorSpec(wrapOv.fill, t2Vars, t3Vars);
              if (wrapFillVar) { setPaintBoundToVariable(instance, 'fills', wrapFillVar); stats.bindings++; }
            } else {
              try { instance.fills = []; } catch (e) {}
            }

            /* Wrapper-level stroke (focus ring, outlined types) → on the instance */
            if (wrapOv.stroke) {
              var wrapStrokeVar = resolveColorSpec(wrapOv.stroke, t2Vars, t3Vars);
              if (wrapStrokeVar) {
                setPaintBoundToVariable(instance, 'strokes', wrapStrokeVar);
                instance.strokeWeight = wrapOv.strokeWeight || 1;
                instance.strokeAlign = 'INSIDE';
                stats.bindings++;
              }
            } else {
              try { instance.strokes = []; } catch (e) {}
            }

            /* Locate Action and Trigger sub-children inside the wrapper instance */
            var actionChild  = instance.findOne(function(n) { return n.name === 'Action'; });
            var triggerChild = instance.findOne(function(n) { return n.name === 'Trigger'; });

            /* ── Zero out the seam corners ──
               Action zone is the LEFT half — its right corners must be square
               so it butts cleanly against the trigger. Conversely the trigger
               zone is the RIGHT half — its left corners must be square. The
               wrapper's outer corner radii (bound to button/default/radius or
               radius-rounded) provide the only visible rounding. */
            if (actionChild) {
              try {
                actionChild.topRightRadius    = 0;
                actionChild.bottomRightRadius = 0;
              } catch (e) {}
            }
            if (triggerChild) {
              try {
                triggerChild.topLeftRadius    = 0;
                triggerChild.bottomLeftRadius = 0;
                /* Trigger zone never gets outer rounding — the wrapper handles
                   the right-side rounding via clipsContent. */
                triggerChild.topRightRadius    = 0;
                triggerChild.bottomRightRadius = 0;
              } catch (e) {}
            }

            /* Helper: apply zone-level overrides to a single zone child */
            async function applyZoneOverrides(zoneNode, zOv) {
              if (!zoneNode) return;
              if (zOv.fill) {
                var zfv = resolveColorSpec(zOv.fill, t2Vars, t3Vars);
                if (zfv) { setPaintBoundToVariable(zoneNode, 'fills', zfv); stats.bindings++; }
              } else {
                try { zoneNode.fills = []; } catch (e) {}
              }
              /* NOTE: do NOT touch the trigger zone's strokes here — those
                 carry the divider (left-stroke) which is independent of
                 zone state. Skip stroke overrides for the trigger child. */
              if (zoneNode === actionChild) {
                if (zOv.stroke) {
                  var zsv = resolveColorSpec(zOv.stroke, t2Vars, t3Vars);
                  if (zsv) {
                    setPaintBoundToVariable(zoneNode, 'strokes', zsv);
                    zoneNode.strokeWeight = zOv.strokeWeight || 1;
                    zoneNode.strokeAlign = 'INSIDE';
                    stats.bindings++;
                  }
                } else {
                  try { zoneNode.strokes = []; } catch (e) {}
                }
              }
              if (zOv.text) {
                var ztv = resolveColorSpec(zOv.text, t2Vars, t3Vars);
                if (ztv) {
                  var tns = zoneNode.findAll(function(n) { return n.type === 'TEXT'; });
                  for (var ttx = 0; ttx < tns.length; ttx++) {
                    setPaintBoundToVariable(tns[ttx], 'fills', ztv);
                    stats.bindings++;
                  }
                }
              }
              if (zOv.icon) {
                var ziv = resolveColorSpec(zOv.icon, t2Vars, t3Vars);
                if (ziv) {
                  var ins = zoneNode.findAll(function(n) { return n.name === 'Vector'; });
                  for (var iix = 0; iix < ins.length; iix++) {
                    var v = ins[iix];
                    /* Bind BOTH fills and strokes so the override survives an
                       INSTANCE_SWAP across icons with different paint types
                       (filled icons use fills, line icons like chevron use
                       strokes). Only the paint type the icon component uses
                       renders visibly; the unused binding is harmless.
                       Critically, Figma preserves child overrides across
                       INSTANCE_SWAP only when the child node names match —
                       we standardize on the name 'Vector' for all icons. */
                    var hasFills   = v.fills   && v.fills.length   > 0;
                    var hasStrokes = v.strokes && v.strokes.length > 0;
                    if (hasFills || !hasStrokes) {
                      setPaintBoundToVariable(v, 'fills', ziv);
                      stats.bindings++;
                    }
                    if (hasStrokes) {
                      setPaintBoundToVariable(v, 'strokes', ziv);
                      stats.bindings++;
                    }
                  }
                }
              }
            }
            await applyZoneOverrides(actionChild,  actionOv);
            await applyZoneOverrides(triggerChild, triggerOv);

            /* ── Chevron direction flip on "open" states ──
               When the trigger is pressed (menu open) or the split-button is
               in Selected state, flip the chevron from Down → Up so the icon
               communicates the menu's open state. Apex is preserved across
               the swap (both Down and Up have apex at x=9, see chevron set
               creation), so there's no visual jitter.
               Idempotent: only acts when the chevron icon is the variant set
               (chevronIconSet present); silently no-ops when fallback single
               chevron is in use. */
            if (triggerChild && chevronIconSet && (stateName === 'Trigger Pressed' || stateName === 'Selected')) {
              try {
                var chevInst = triggerChild.findOne(function(n) {
                  return n.type === 'INSTANCE' && n.name === 'Chevron';
                });
                if (chevInst && chevInst.componentProperties && chevInst.componentProperties.Direction) {
                  chevInst.setProperties({ Direction: 'Up' });
                }
              } catch (cfe) {
                log('Chevron flip skipped (' + familyName + '/' + typeName + '/' + stateName + '): ' + cfe.message);
              }
            }

            /* Divider colour: rebind trigger's left-stroke to track the
               variant's context.

               Strategy:
               - Selected state: the action+trigger fills become container/bg
                 (a tinted surface). The default separator no longer reads.
                 Use container/separator (T3) or default/container/separator (T2)
                 so the divider stays visible against the selected fill.
               - Brand-mode families (any non-Selected state): rebind to T3
                 component/separator so the divider tracks the brand palette.
               - Neutral non-selected: keep the master-level T2 binding. */
            if (triggerChild) {
              var dividerVar = null;
              var isSelected = (stateName === 'Selected');
              if (isSelected) {
                /* Use container-flavoured separator for selected. T3 first
                   (works for both Neutral with container collection mode and
                   Brand with brand mode), fall back to T2 if T3 missing. */
                dividerVar = t3Vars['container/separator']
                          || t3Vars['oncontainer-content/default']
                          || t2Vars['default/container/separator']
                          || t2Vars[BP.dividerColor.t2];
              } else if (famT3ModeId && BP.dividerColor && BP.dividerColor.t3) {
                dividerVar = t3Vars[BP.dividerColor.t3];
              }
              if (dividerVar) {
                /* Re-apply because applyZoneOverrides skipped trigger strokes */
                setPaintBoundToVariable(triggerChild, 'strokes', dividerVar);
                triggerChild.strokeWeight = 0;
                try {
                  triggerChild.strokeLeftWeight   = 1;
                  triggerChild.strokeRightWeight  = 0;
                  triggerChild.strokeTopWeight    = 0;
                  triggerChild.strokeBottomWeight = 0;
                } catch (e) {}
                triggerChild.strokeAlign = 'INSIDE';
                stats.bindings++;
              }
            }

          } else {
          /* ── Legacy flat overrides (button family) ── */

          /* Disabled opacity lives on the COMPONENT (not the instance) */
          if (overrides.componentOpacity !== undefined) {
            varComp.opacity = overrides.componentOpacity;
          }

          /* Fill override */
          if (overrides.fill) {
            var fillVar = resolveColorSpec(overrides.fill, t2Vars, t3Vars);
            if (fillVar) {
              setPaintBoundToVariable(instance, 'fills', fillVar);
              stats.bindings++;
            }
          } else {
            instance.fills = [];
          }

          /* Stroke override */
          if (overrides.stroke) {
            var strokeVar = resolveColorSpec(overrides.stroke, t2Vars, t3Vars);
            if (strokeVar) {
              setPaintBoundToVariable(instance, 'strokes', strokeVar);
              instance.strokeWeight = overrides.strokeWeight || 1;
              instance.strokeAlign = 'INSIDE';
              stats.bindings++;
            }
          } else {
            instance.strokes = [];
          }

          /* Text/icon color overrides (only when different from master default) */
          if (overrides.text) {
            var textColorVar = resolveColorSpec(overrides.text, t2Vars, t3Vars);
            if (textColorVar) {
              var textChildren = instance.findAll(function(n) { return n.type === 'TEXT'; });
              for (var tci = 0; tci < textChildren.length; tci++) {
                setPaintBoundToVariable(textChildren[tci], 'fills', textColorVar);
                stats.bindings++;
              }
            }
          }

          if (overrides.icon) {
            var iconColorVar = resolveColorSpec(overrides.icon, t2Vars, t3Vars);
            if (iconColorVar) {
              var iconChildren = instance.findAll(function(n) { return n.name === 'Vector'; });
              for (var ici = 0; ici < iconChildren.length; ici++) {
                setPaintBoundToVariable(iconChildren[ici], 'fills', iconColorVar);
                stats.bindings++;
              }
            }
          }
          } /* end legacy/wrapper branch */


          components.push({ component: varComp, type: typeName, state: stateName, rounded: isRounded });
          stats.components++;
        }
      }
      } /* end rounded loop */

      /* ── Combine into ComponentSet ── */
      figma.ui.postMessage({ type: 'gen-progress', text: 'Combining ' + setDisplayName + '…' });

      var allComps = [];
      for (var ai = 0; ai < components.length; ai++) {
        allComps.push(components[ai].component);
      }
      var componentSet = figma.combineAsVariants(allComps, page);
      componentSet.name = setDisplayName;
      componentSet.description = (BP.description || '') + ' Family: ' + familyName + '.';

      /* Grid layout: types as rows, states as columns. Rounded=False set
         occupies the top half; Rounded=True set is stacked below with a
         small gap so the variant set is browsable at a glance. */
      var colCount = famStates.length;
      var rowCount = famTypes.length;
      var padX = 20;
      var padY = 27;
      var colSpacing = 155;
      var rowSpacing = 70;
      var roundedBlockGap = 30; /* extra gap between False-block and True-block */
      var blockHeight = rowCount * rowSpacing;
      for (var gi = 0; gi < components.length; gi++) {
        var entry = components[gi];
        var typeIdx = famTypes.indexOf(entry.type);
        var stateIdx = famStates.indexOf(entry.state);
        var roundedOffset = entry.rounded ? (blockHeight + roundedBlockGap) : 0;
        entry.component.x = padX + stateIdx * colSpacing;
        entry.component.y = padY + typeIdx * rowSpacing + roundedOffset;
      }
      var totalW = padX * 2 + (colCount - 1) * colSpacing + 120;
      /* Doubled height to fit Rounded=False block + Rounded=True block + gap. */
      var totalH = padY + (rowCount - 1) * rowSpacing + 32 + (blockHeight + roundedBlockGap) + padY;
      try { componentSet.resize(totalW, totalH); } catch (e) { /* auto-size */ }

      /* ── Row/column label constants ── */
      var ROW_LABEL_WIDTH = 100;
      var COL_HEADER_HEIGHT = 40;

      /* ── Step 7: Component properties propagated from master ── */
      figma.ui.postMessage({ type: 'gen-progress', text: 'Properties propagated from masters…' });

      /* ── Step 8: Wire interactive reactions ── */
      figma.ui.postMessage({ type: 'gen-progress', text: 'Wiring interactions for ' + familyName + '…' });

      if (BP.kind === 'wrapper-with-button-instance') {
        /* Per-zone reactions: each variant has reactions on its Action and
           Trigger sub-children. Hovering/pressing a zone navigates the
           whole component to the corresponding zone-state variant. */
        for (var rri = 0; rri < roundedValues.length; rri++) {
          var rRounded = roundedValues[rri];
          for (var ri = 0; ri < famTypes.length; ri++) {
            var rType = famTypes[ri];

            /* Build a state→component map for this (type, rounded) */
            var stateToComp = {};
            for (var rj = 0; rj < components.length; rj++) {
              var entry = components[rj];
              if (entry.type !== rType) continue;
              if (entry.rounded !== rRounded) continue;
              stateToComp[entry.state] = entry.component;
            }

            var actionHover    = stateToComp['Action Hover'];
            var actionPressed  = stateToComp['Action Pressed'];
            var triggerHover   = stateToComp['Trigger Hover'];
            var triggerPressed = stateToComp['Trigger Pressed'];

            var stateNamesForRx = Object.keys(stateToComp);
            for (var sx = 0; sx < stateNamesForRx.length; sx++) {
              var srcComp = stateToComp[stateNamesForRx[sx]];
              if (!srcComp) continue;
              /* Reach into the wrapper instance to find Action/Trigger children */
              var srcWrapInst = srcComp.findOne(function(n) { return n.type === 'INSTANCE'; });
              if (!srcWrapInst) continue;
              var srcAction  = srcWrapInst.findOne(function(n) { return n.name === 'Action'; });
              var srcTrigger = srcWrapInst.findOne(function(n) { return n.name === 'Trigger'; });

              if (srcAction && (actionHover || actionPressed)) {
                var rxA = [];
                if (actionHover) {
                  rxA.push({ trigger: { type: 'ON_HOVER' }, actions: [{ type: 'NODE', destinationId: actionHover.id, navigation: 'CHANGE_TO',
                    transition: { type: 'DISSOLVE', duration: 0.15, easing: { type: 'EASE_IN_AND_OUT' } } }] });
                  stats.reactions++;
                }
                if (actionPressed) {
                  rxA.push({ trigger: { type: 'ON_PRESS' }, actions: [{ type: 'NODE', destinationId: actionPressed.id, navigation: 'CHANGE_TO',
                    transition: { type: 'DISSOLVE', duration: 0.05, easing: { type: 'EASE_IN_AND_OUT' } } }] });
                  stats.reactions++;
                }
                try { await srcAction.setReactionsAsync(rxA); }
                catch (re) { log('Action reactions failed (' + familyName + '/' + rType + '/' + stateNamesForRx[sx] + '): ' + re.message); }
              }

              if (srcTrigger && (triggerHover || triggerPressed)) {
                var rxT = [];
                if (triggerHover) {
                  rxT.push({ trigger: { type: 'ON_HOVER' }, actions: [{ type: 'NODE', destinationId: triggerHover.id, navigation: 'CHANGE_TO',
                    transition: { type: 'DISSOLVE', duration: 0.15, easing: { type: 'EASE_IN_AND_OUT' } } }] });
                  stats.reactions++;
                }
                if (triggerPressed) {
                  rxT.push({ trigger: { type: 'ON_PRESS' }, actions: [{ type: 'NODE', destinationId: triggerPressed.id, navigation: 'CHANGE_TO',
                    transition: { type: 'DISSOLVE', duration: 0.05, easing: { type: 'EASE_IN_AND_OUT' } } }] });
                  stats.reactions++;
                }
                try { await srcTrigger.setReactionsAsync(rxT); }
                catch (re) { log('Trigger reactions failed (' + familyName + '/' + rType + '/' + stateNamesForRx[sx] + '): ' + re.message); }
              }
            }
          }
        }
      } else {
      for (var ri = 0; ri < famTypes.length; ri++) {
        var rType = famTypes[ri];
        for (var rri = 0; rri < roundedValues.length; rri++) {
          var rRounded = roundedValues[rri];
          var defaultComp = null, hoverComp = null, pressedComp = null;

          for (var rj = 0; rj < components.length; rj++) {
            if (components[rj].type !== rType) continue;
            if (components[rj].rounded !== rRounded) continue;
            if (components[rj].state === 'Default') defaultComp = components[rj].component;
            if (components[rj].state === 'Hover')   hoverComp = components[rj].component;
            if (components[rj].state === 'Pressed') pressedComp = components[rj].component;
          }

          if (defaultComp) {
            var reactions = [];
            if (hoverComp) {
              reactions.push({
                trigger: { type: 'ON_HOVER' },
                actions: [{
                  type: 'NODE',
                  destinationId: hoverComp.id,
                  navigation: 'CHANGE_TO',
                  transition: { type: 'DISSOLVE', duration: 0.15, easing: { type: 'EASE_IN_AND_OUT' } }
                }]
              });
              stats.reactions++;
            }
            if (pressedComp) {
              reactions.push({
                trigger: { type: 'ON_PRESS' },
                actions: [{
                  type: 'NODE',
                  destinationId: pressedComp.id,
                  navigation: 'CHANGE_TO',
                  transition: { type: 'DISSOLVE', duration: 0.05, easing: { type: 'EASE_IN_AND_OUT' } }
                }]
              });
              stats.reactions++;
            }
            if (reactions.length > 0) {
              try {
                await defaultComp.setReactionsAsync(reactions);
              } catch (re) {
                log('Reaction wiring failed for ' + familyName + '/' + rType + '/Rounded=' + rRounded + ': ' + re.message);
                stats.errors.push('Reactions ' + familyName + '/' + rType + ': ' + re.message);
              }
            }
          }
        }
      }
      } /* end legacy/wrapper reactions branch */


      allComponentSets.push(componentSet);

      /* ── Position inside variant section with styled labels ── */

      /* Sub-heading card for this family + master combo */
      var setHeadingCard = createCard({
        name: 'heading-' + familyName + '-' + mName,
        fill: COLOR_HEADER_BG,
        radius: 10,
        padX: 20,
        padY: 12,
        gap: 0,
        direction: 'HORIZONTAL'
      });
      setHeadingCard.counterAxisAlignItems = 'CENTER';
      setHeadingCard.itemSpacing = 12;
      setHeadingCard.appendChild(createLabel(familyName + ' · ' + mName, 14, true, COLOR_HEADING));
      var slotLabel = (BP.masters[mName].slots && BP.masters[mName].slots.join(' + '))
                   || (BP.masters[mName].buttonMaster ? 'action + chevron' : '');
      var slotBadge = createBadge(slotLabel, COLOR_CM_BG, COLOR_DIMMED);
      setHeadingCard.appendChild(slotBadge);
      variantSec.section.appendChild(setHeadingCard);
      setHeadingCard.x = variantSec.innerX;
      setHeadingCard.y = varSecContentY;
      varSecContentY += setHeadingCard.height + 20;

      /* Bind sub-heading to surface tokens */
      if (t2Col && brightModeId) {
        try {
          setHeadingCard.setExplicitVariableModeForCollection(t2Col, brightModeId);
          tryBindFill(setHeadingCard, t2Vars['default/surfaces/strong']);
          if (setHeadingCard.children.length > 0) tryBindFill(setHeadingCard.children[0], t2Vars['default/content/strong']);
          tryBindFill(slotBadge, t2Vars['default/component/bg-default']);
          if (slotBadge.children.length > 0) tryBindFill(slotBadge.children[0], t2Vars['default/content/subtle']);
        } catch (e) {}
      }

      /* Component set X offset (leave room for row labels) */
      var csX = variantSec.innerX + ROW_LABEL_WIDTH;
      var csY = varSecContentY + COL_HEADER_HEIGHT;

      /* Column header bar */
      var colHeaderBar = figma.createFrame();
      colHeaderBar.name = 'col-headers-' + familyName + '-' + mName;
      colHeaderBar.resize(totalW, 34);
      colHeaderBar.cornerRadius = 8;
      colHeaderBar.fills = [{ type: 'SOLID', color: COLOR_HEADER_BG }];
      colHeaderBar.clipsContent = false;

      for (var chi = 0; chi < famStates.length; chi++) {
        var colH = createLabel(famStates[chi], 11, true, COLOR_DIMMED);
        colHeaderBar.appendChild(colH);
        colH.x = padX + chi * colSpacing;
        colH.y = 10;
        tryBindFill(colH, t2Vars['default/content/subtle']);
      }
      variantSec.section.appendChild(colHeaderBar);
      colHeaderBar.x = csX;
      colHeaderBar.y = varSecContentY;
      tryBindFill(colHeaderBar, t2Vars['default/surfaces/strong']);

      /* Row labels — printed twice: once for the Rounded=False block (top
         half) and again for the Rounded=True block (bottom half). A small
         section sub-header marks each block so the static layout reads
         clearly even though the variant property panel already exposes
         a "Rounded" toggle. */
      var halfBlockOffset = blockHeight + roundedBlockGap;

      /* Sub-header above each block */
      var squareHdr = createLabel('Square (Default)', 10, true, COLOR_DIMMED);
      variantSec.section.appendChild(squareHdr);
      squareHdr.x = variantSec.innerX + 4;
      squareHdr.y = csY + 6;
      tryBindFill(squareHdr, t2Vars['default/content/subtle']);

      var pillHdr = createLabel('Pill (Rounded=True)', 10, true, COLOR_DIMMED);
      variantSec.section.appendChild(pillHdr);
      pillHdr.x = variantSec.innerX + 4;
      pillHdr.y = csY + halfBlockOffset + 6;
      tryBindFill(pillHdr, t2Vars['default/content/subtle']);

      for (var rhi = 0; rhi < famTypes.length; rhi++) {
        /* Square block label */
        var rowLabel = createLabel(famTypes[rhi], 11, false, COLOR_BODY);
        variantSec.section.appendChild(rowLabel);
        rowLabel.x = variantSec.innerX + 4;
        rowLabel.y = csY + padY + rhi * rowSpacing + 8;
        tryBindFill(rowLabel, t2Vars['default/content/default']);

        /* Pill block label (same type name, offset down by one block) */
        var rowLabelPill = createLabel(famTypes[rhi], 11, false, COLOR_BODY);
        variantSec.section.appendChild(rowLabelPill);
        rowLabelPill.x = variantSec.innerX + 4;
        rowLabelPill.y = csY + padY + rhi * rowSpacing + 8 + halfBlockOffset;
        tryBindFill(rowLabelPill, t2Vars['default/content/default']);
      }

      /* Place the component set */
      variantSec.section.appendChild(componentSet);
      componentSet.x = csX;
      componentSet.y = csY;
      varSecContentY = csY + totalH + 40;

      /* Separator line between groups (except very last family of last master) */
      var isLastFamily = (famI === familyNames.length - 1);
      var isLastMaster = (mci === masterNames.length - 1);
      if (!(isLastFamily && isLastMaster)) {
        var groupDiv = createDivider(SECTION_W - 80);
        variantSec.section.appendChild(groupDiv);
        groupDiv.x = variantSec.innerX;
        groupDiv.y = varSecContentY;
        tryBindFill(groupDiv, t2Vars['default/surfaces/separator']);
        varSecContentY += 24;
      }

      log('Created component set: ' + setDisplayName + ' (' + components.length + ' variants)');
    } /* end families loop */
  }

  /* Finalize variant section size and append to page */
  var varSecH = varSecContentY + 40;
  try { variantSec.section.resize(SECTION_W, varSecH); } catch (e) {}
  page.appendChild(variantSec.section);
  variantSec.section.x = PAGE_X;
  variantSec.section.y = cursorY;
  cursorY += varSecH + SECTION_GAP;

  /* ── Step 9: Store version metadata ────────────────────── */
  var existingVersions = {};
  try {
    existingVersions = JSON.parse(figma.root.getPluginData('dtf-component-versions') || '{}');
  } catch (e) { /* ignore */ }
  existingVersions[blueprint.name.toLowerCase()] = {
    version: '2.0.0',
    nodeIds: allComponentSets.map(function(cs) { return cs.id; }),
    masterFrameId: masterFrame.id,
    generatedAt: new Date().toISOString(),
    families: Object.keys(BP.families || {}),
    types: (function(){ var n=0; var ks=Object.keys(BP.families||{}); for (var i=0;i<ks.length;i++) { var f=BP.families[ks[i]]; n += (f.types&&f.types.length)||0; } return n; })(),
    states: (function(){ var rs=(BP.states&&BP.states.length)||0; var m=0; var ks=Object.keys(BP.families||{}); for (var i=0;i<ks.length;i++) { var f=BP.families[ks[i]]; var L=(f.states&&f.states.length)||rs; if (L>m) m=L; } return m; })(),
    totalComponents: stats.components,
    architecture: 'two-tier-master-instance'
  };
  figma.root.setPluginData('dtf-component-versions', JSON.stringify(existingVersions));

  log('Gen complete: ' + stats.components + ' components, ' + stats.bindings + ' bindings, ' + stats.reactions + ' reactions');
  return stats;
}

/* ── Available blueprints registry ───────────────────────── */

var COMPONENT_BLUEPRINTS = {
  button: BUTTON_BLUEPRINT,
  'split-button': SPLIT_BUTTON_BLUEPRINT
};

/* ── Auto-wire prototype interactions on every COMPONENT_SET on the
   current page. Idempotent — re-running overwrites prior reactions.

   For each set:
     1. Group child variants by every variant prop EXCEPT 'State'.
     2. In each group, find Default and wire ON_HOVER → Hover (150ms)
        and ON_PRESS → Pressed (50ms) sibling variants.
     3. Sub-zone pass: if Default contains a top-level INSTANCE with
        named children (e.g. split-button Action/Trigger), wire those
        children to sibling variants named "<Zone> Hover" / "<Zone> Pressed".

   Returns: { sets, defaults, reactions, subzones, skipped, errors[] } */
async function wireReactionsForCurrentPage() {
  /* State → reaction mapping. Order in this map determines wiring priority
     when multiple states exist (top entries win the trigger slot if
     conflicting). Triggers explained:
       Hover    → ON_HOVER       auto-reverts on mouse-out
       Pressed  → ON_PRESS       auto-reverts on mouse-up
       Selected → ON_CLICK       persists (toggle-style)
       Loading  → AFTER_TIMEOUT  used to simulate async transitions
     Focus / Disabled are intentionally NOT mapped — Figma has no
     :focus-visible trigger and Disabled is a terminal state. */
  var stateMap = {
    'Hover':    { trigger: 'ON_HOVER',       duration: 0.15 },
    'Pressed':  { trigger: 'ON_PRESS',       duration: 0.05 },
    'Selected': { trigger: 'ON_CLICK',       duration: 0.10 },
    'Loading':  { trigger: 'AFTER_TIMEOUT',  duration: 0.20, timeout: 1.0 }
  };
  var stats = { sets: 0, defaults: 0, reactions: 0, subzones: 0, skipped: 0, errors: [] };

  function buildRx(destId, duration, triggerType, opts) {
    var triggerObj = { type: triggerType };
    /* AFTER_TIMEOUT requires a `timeout` field (seconds). */
    if (triggerType === 'AFTER_TIMEOUT' && opts && opts.timeout !== undefined) {
      triggerObj.timeout = opts.timeout;
    }
    return {
      trigger: triggerObj,
      actions: [{
        type: 'NODE',
        destinationId: destId,
        navigation: 'CHANGE_TO',
        transition: { type: 'DISSOLVE', duration: duration, easing: { type: 'EASE_IN_AND_OUT' } }
      }]
    };
  }

  var sets = figma.currentPage.findAllWithCriteria({ types: ['COMPONENT_SET'] });

  for (var si = 0; si < sets.length; si++) {
    var cs = sets[si];
    stats.sets++;

    /* Group child variants by every variant property EXCEPT State */
    var groups = {};
    for (var ci = 0; ci < cs.children.length; ci++) {
      var v = cs.children[ci];
      if (v.type !== 'COMPONENT') continue;
      var vp = v.variantProperties || {};
      if (!vp.State) continue;  /* set has no State axis — skip silently */
      var keyParts = [];
      var keys = Object.keys(vp).sort();
      for (var ki = 0; ki < keys.length; ki++) {
        if (keys[ki] === 'State') continue;
        keyParts.push(keys[ki] + '=' + vp[keys[ki]]);
      }
      var groupKey = keyParts.join('|') || '_default';
      if (!groups[groupKey]) groups[groupKey] = {};
      groups[groupKey][vp.State] = v;
    }

    var groupKeys = Object.keys(groups);
    if (groupKeys.length === 0) {
      stats.skipped++;
      continue;
    }

    for (var gi = 0; gi < groupKeys.length; gi++) {
      var byState = groups[groupKeys[gi]];
      var defaultV = byState['Default'];
      if (!defaultV) {
        var stateNames = Object.keys(byState);
        if (stateNames.length === 0) continue;
        defaultV = byState[stateNames[0]];
      }

      /* ── Top-level reactions on the Default variant ── */
      var rx = [];
      var stateNamesAll = Object.keys(stateMap);
      for (var sni = 0; sni < stateNamesAll.length; sni++) {
        var sName = stateNamesAll[sni];
        var dest = byState[sName];
        if (!dest || dest.id === defaultV.id) continue;
        rx.push(buildRx(dest.id, stateMap[sName].duration, stateMap[sName].trigger, stateMap[sName]));
      }

      if (rx.length > 0) {
        try {
          await defaultV.setReactionsAsync(rx);
          stats.defaults++;
          stats.reactions += rx.length;
        } catch (re) {
          stats.errors.push(cs.name + ' / ' + groupKeys[gi] + ': ' + re.message);
        }
      }

      /* ── Sub-zone reactions (e.g. split-button Action / Trigger) ── */
      var hostInst = defaultV.findOne(function(n) { return n.type === 'INSTANCE'; });
      if (!hostInst || hostInst.children.length === 0) continue;

      for (var zi = 0; zi < hostInst.children.length; zi++) {
        var zone = hostInst.children[zi];
        if (!zone.name) continue;
        var zoneRx = [];
        for (var sji = 0; sji < stateNamesAll.length; sji++) {
          var zSName = stateNamesAll[sji];
          var zoneStateName = zone.name + ' ' + zSName;
          var zoneDestVariant = byState[zoneStateName];
          if (!zoneDestVariant) continue;
          var zoneDestInst = zoneDestVariant.findOne(function(n) { return n.type === 'INSTANCE'; });
          if (!zoneDestInst) continue;
          var destZone = zoneDestInst.findOne(function(n) { return n.name === zone.name; });
          if (!destZone) continue;
          zoneRx.push(buildRx(zoneDestVariant.id, stateMap[zSName].duration, stateMap[zSName].trigger, stateMap[zSName]));
        }
        if (zoneRx.length > 0) {
          try {
            await zone.setReactionsAsync(zoneRx);
            stats.subzones++;
            stats.reactions += zoneRx.length;
          } catch (re) {
            stats.errors.push(cs.name + ' / zone ' + zone.name + ': ' + re.message);
          }
        }
      }
    }
  }

  return stats;
}

/* ── Message handler ─────────────────────────────────────── */

figma.ui.onmessage = async function(msg) {

  if (msg.type === 'scan') {
    try {
      var cols = await findDTFCollections();
      var varCount = 0;
      var colNames = [];
      for (var i = 0; i < cols.length; i++) {
        varCount += cols[i].variableIds.length;
        colNames.push(cols[i].name);
      }
      var savedHash = figma.root.getPluginData('dtf-hash') || '';
      var savedVarCount = parseInt(figma.root.getPluginData('dtf-var-count') || '0', 10);
      var savedProject = figma.root.getPluginData('dtf-project') || '';

      /* ── Stale state cleanup ──────────────────────────────────
         If all DTF collections are gone (user deleted them) but
         saved sync state still exists, clear it so the plugin
         starts fresh instead of showing "up to date". Also
         clear the ID map — those variable IDs are all dead. */
      if (varCount === 0 && savedHash) {
        log('Stale state detected: 0 variables but savedHash=' + savedHash + ' — clearing document sync state');
        figma.root.setPluginData('dtf-hash', '');
        figma.root.setPluginData('dtf-var-count', '0');
        saveIdMap({});
        savedHash = '';
        savedVarCount = 0;
      }

      figma.ui.postMessage({
        type: 'scan-result',
        found: cols.length > 0,
        colNames: colNames,
        varCount: varCount,
        savedHash: savedHash,
        savedVarCount: savedVarCount,
        savedProject: savedProject
      });
    } catch (e) {
      figma.ui.postMessage({ type: 'scan-result', found: false, colNames: [], varCount: 0, savedHash: '', savedVarCount: 0 });
    }
  }

  /* Lightweight verify — just check if DTF variables still exist */
  if (msg.type === 'verify') {
    try {
      var cols = await findDTFCollections();
      var varCount = 0;
      for (var i = 0; i < cols.length; i++) {
        varCount += cols[i].variableIds.length;
      }
      figma.ui.postMessage({ type: 'verify-result', varCount: varCount });
    } catch (e) {
      /* Report error instead of false zero — prevents false undo detection */
      figma.ui.postMessage({ type: 'verify-result', varCount: -1, error: e.message });
    }
  }

  if (msg.type === 'sync') {
    try {
      figma.ui.postMessage({ type: 'progress', text: '[' + CODE_VERSION + '] Syncing T0 → T1 → T2/T3...' });
      var stats = await syncAll(msg.data);
      var syncHash = msg.hash || '';
      /* Persist sync state to this document */
      figma.root.setPluginData('dtf-hash', syncHash);
      figma.root.setPluginData('dtf-var-count', String(stats.variables));
      if (msg.project) figma.root.setPluginData('dtf-project', msg.project);
      figma.ui.postMessage({ type: 'done', stats: stats, hash: syncHash });
      figma.notify(
        'DTF: ' + stats.variables + ' vars (' + stats.updated + ' updated, ' +
        stats.created + ' created' +
        (stats.renamed > 0 ? ', ' + stats.renamed + ' renamed' : '') +
        (stats.orphansRemoved > 0 ? ', ' + stats.orphansRemoved + ' orphans removed' : '') +
        '), ' + stats.aliases + ' aliases' +
        (stats.errors.length > 0 ? ' (' + stats.errors.length + ' errors)' : '')
      );
    } catch (e) {
      figma.ui.postMessage({ type: 'error', error: e.message });
    }
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }

  /* UI requests user info (in case the initial delayed message was missed) */
  if (msg.type === 'get-user-info') {
    sendUserInfo();
  }

  /* Reset ID map — useful when rename state is corrupted */
  if (msg.type === 'reset-idmap') {
    saveIdMap({});
    figma.root.setPluginData('dtf-hash', '');
    log('ID map and hash cleared — next sync will use name-based matching');
    figma.ui.postMessage({ type: 'progress', text: 'ID map cleared. Click sync to re-sync fresh.' });
    figma.notify('DTF: ID map cleared — press Sync to apply fresh');
  }

  /* Persist URL to clientStorage when user changes it in UI */
  if (msg.type === 'save-server-url' && msg.url) {
    figma.clientStorage.setAsync('dtf-server-url', msg.url).catch(function() {});
  }

  /* ── Component Generation ─────────────────────────────── */

  if (msg.type === 'generate-components') {
    try {
      var requested = msg.components || ['button'];
      /* Ensure dependencies are generated first. Split-button instances the
         button master, so button must run earlier in the same dispatch. */
      var depOrder = { 'button': 0, 'split-button': 1 };
      requested.sort(function(a, b) {
        var oa = depOrder[a.toLowerCase()]; if (oa === undefined) oa = 99;
        var ob = depOrder[b.toLowerCase()]; if (ob === undefined) ob = 99;
        return oa - ob;
      });
      var allStats = { components: 0, bindings: 0, reactions: 0, errors: [] };

      for (var gci = 0; gci < requested.length; gci++) {
        var compName = requested[gci].toLowerCase();
        var blueprint = COMPONENT_BLUEPRINTS[compName];
        if (!blueprint) {
          allStats.errors.push('Unknown component: ' + compName);
          continue;
        }
        log('Generating component: ' + blueprint.name);
        var cStats = await generateComponentFromBlueprint(blueprint);
        allStats.components += cStats.components;
        allStats.bindings += cStats.bindings;
        allStats.reactions += cStats.reactions;
        for (var ei = 0; ei < cStats.errors.length; ei++) {
          allStats.errors.push(cStats.errors[ei]);
        }
      }

      /* Auto-wire any component sets on the page that don't already have
         hover/press reactions. Idempotent — safe to call after every
         generation. Catches sets where state-name conventions weren't
         covered by the per-blueprint wiring loop. */
      figma.ui.postMessage({ type: 'gen-progress', text: 'Auto-wiring prototype interactions…' });
      try {
        var wireStats = await wireReactionsForCurrentPage();
        allStats.reactions += wireStats.reactions;
        for (var wei = 0; wei < wireStats.errors.length; wei++) {
          allStats.errors.push('Wire: ' + wireStats.errors[wei]);
        }
        log('Auto-wired ' + wireStats.reactions + ' reactions across ' +
          wireStats.sets + ' sets (' + wireStats.defaults + ' defaults, ' +
          wireStats.subzones + ' sub-zones)');
      } catch (we) {
        log('Auto-wire pass failed: ' + we.message);
        allStats.errors.push('Auto-wire: ' + we.message);
      }

      figma.ui.postMessage({ type: 'gen-done', stats: allStats });
      figma.notify(
        'DTF: Generated ' + allStats.components + ' component variants, ' +
        allStats.bindings + ' variable bindings, ' +
        allStats.reactions + ' reactions' +
        (allStats.errors.length > 0 ? ' (' + allStats.errors.length + ' errors)' : '')
      );
    } catch (e) {
      figma.ui.postMessage({ type: 'gen-error', error: e.message });
      log('Component gen error: ' + e.message);
    }
  }

  /* ── Auto-wire Prototype Interactions ────────────────────
     Defined as a module-level helper (wireReactionsForCurrentPage)
     and invoked automatically at the end of every component-generation
     pass — see the 'generate-components' handler above. No manual
     trigger needed. */

  /* Check prerequisite status for component generation */
  if (msg.type === 'check-gen-prereqs') {
    try {
      var csMap = await buildCollectionVarMap('comp size');
      var t2Map = await buildCollectionVarMap('T2 Surface Context Tokens');
      var t3Map = await buildCollectionVarMap('T3 Status Context Tokens');
      var versions = {};
      try {
        versions = JSON.parse(figma.root.getPluginData('dtf-component-versions') || '{}');
      } catch (e) { /* ignore */ }
      figma.ui.postMessage({
        type: 'gen-prereqs',
        compSizeCount: Object.keys(csMap).length,
        t2Count: Object.keys(t2Map).length,
        t3Count: Object.keys(t3Map).length,
        versions: versions
      });
    } catch (e) {
      figma.ui.postMessage({ type: 'gen-prereqs', compSizeCount: 0, t2Count: 0, t3Count: 0, versions: {} });
    }
  }
};
