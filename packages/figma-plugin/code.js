/* ═══════════════════════════════════════════════════════════════
   Design Token Forge — Figma Plugin (Live Sync Edition)
   Connects to DTF Sync Server for real-time token updates.
   Uses async Figma APIs for compatibility with Figma 2025+.
   ═══════════════════════════════════════════════════════════════ */

figma.showUI(__html__, { width: 480, height: 560 });

var CODE_VERSION = '2026-05-13-v27';
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
    'Text button': {
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

  /* Variant axes */
  types:  ['Fill', 'outlined', 'ghost', 'Fill & Outline'],
  states: ['default', 'hover', 'pressed', 'pressed (themed)', 'focus', 'disabled'],

  /* Color overrides per Type × State applied on the INSTANCE inside each variant.
     String values = T2 Surface Context path.
     { t3: path } = T3 Status Context path.
     text/icon overrides only needed when differing from master default.        */
  stateOverrides: {
    'Fill': {
      'default':          { fill: 'default/component/bg' },
      'hover':            { fill: 'default/component/bg-hover' },
      'pressed':          { fill: 'default/component/bg-pressed' },
      'pressed (themed)': { fill: { t3: 'container/bg' }, stroke: { t3: 'component/outline-default' }, strokeWeight: 1,
                            text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
      'focus':            { fill: 'default/component/bg', stroke: { t3: 'component/outline-default' }, strokeWeight: 2 },
      'disabled':         { fill: 'default/component/bg', componentOpacity: 0.3 }
    },
    'outlined': {
      'default':          { stroke: 'default/component/outline', strokeWeight: 1 },
      'hover':            { fill: 'default/component/bg-hover', stroke: 'default/component/outline', strokeWeight: 1 },
      'pressed':          { fill: 'default/component/bg-pressed', stroke: 'default/component/outline', strokeWeight: 1 },
      'pressed (themed)': { fill: { t3: 'container/bg' }, stroke: { t3: 'component/outline-default' }, strokeWeight: 1,
                            text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
      'focus':            { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 },
      'disabled':         { stroke: 'default/component/outline', strokeWeight: 1, componentOpacity: 0.3 }
    },
    'ghost': {
      'default':          {},
      'hover':            { fill: 'default/component/bg-hover' },
      'pressed':          { fill: 'default/component/bg-pressed' },
      'pressed (themed)': { fill: { t3: 'container/bg' }, stroke: { t3: 'component/outline-default' }, strokeWeight: 1,
                            text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
      'focus':            { stroke: { t3: 'component/outline-default' }, strokeWeight: 2 },
      'disabled':         { componentOpacity: 0.3 }
    },
    'Fill & Outline': {
      'default':          { fill: 'default/component/bg', stroke: 'default/component/outline', strokeWeight: 1 },
      'hover':            { fill: 'default/component/bg-hover', stroke: 'default/component/outline', strokeWeight: 1 },
      'pressed':          { fill: 'default/component/bg-pressed', stroke: 'default/component/outline', strokeWeight: 1 },
      'pressed (themed)': { fill: { t3: 'container/bg' }, stroke: { t3: 'component/outline-default' }, strokeWeight: 1,
                            text: { t3: 'oncontainer-content/default' }, icon: { t3: 'oncontainer-content/default' } },
      'focus':            { fill: 'default/component/bg', stroke: { t3: 'component/outline-default' }, strokeWeight: 2 },
      'disabled':         { fill: 'default/component/bg', stroke: 'default/component/outline', strokeWeight: 1, componentOpacity: 0.3 }
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

  var csCount = Object.keys(compSizeVars).length;
  var t2Count = Object.keys(t2Vars).length;
  var t3Count = Object.keys(t3Vars).length;
  log('Variables: ' + csCount + ' comp-size, ' + t2Count + ' T2, ' + t3Count + ' T3');

  /* ── Step 2b: Create/find Typography variable collection ─── */
  figma.ui.postMessage({ type: 'gen-progress', text: 'Setting up typography variables…' });
  var typoVars = {};
  var typoCol = null;
  var typoColName = 'DTF Typography';
  var allColsTypo = await figma.variables.getLocalVariableCollectionsAsync();
  for (var tci = 0; tci < allColsTypo.length; tci++) {
    if (allColsTypo[tci].name === typoColName) {
      typoCol = allColsTypo[tci];
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
    /* Font weights (FLOAT — Figma uses numeric weights) */
    { name: 'font-weight/regular', type: 'FLOAT', value: 400 },
    { name: 'font-weight/medium',  type: 'FLOAT', value: 500 },
    { name: 'font-weight/semibold', type: 'FLOAT', value: 600 },
    { name: 'font-weight/bold',    type: 'FLOAT', value: 700 },
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
    { name: 'button/icon wrapper padding R', defaultVal: 8 }
  ];

  var allCols = await figma.variables.getLocalVariableCollectionsAsync();
  var csCol = allCols.find(function(c) { return c.name === 'comp size'; });

  if (csCol) {
    var csModeId = csCol.modes[0].modeId;
    for (var rvi = 0; rvi < requiredVars.length; rvi++) {
      var reqName = requiredVars[rvi].name;
      /* Check both short and long forms */
      if (!compSizeVars[reqName] && !compSizeVars[reqName.replace('button/', 'button/default/')]) {
        try {
          var newVar = figma.variables.createVariable(reqName, csCol, 'FLOAT');
          newVar.setValueForMode(csModeId, requiredVars[rvi].defaultVal);
          compSizeVars[reqName] = newVar;
          /* Also create alias */
          compSizeVars[reqName.replace('button/', 'button/default/')] = newVar;
          log('Created missing variable: ' + reqName + ' = ' + requiredVars[rvi].defaultVal);
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
    if (figma.root.children[pi].name === 'DTF Components') {
      page = figma.root.children[pi];
      break;
    }
  }
  if (!page) {
    page = figma.createPage();
    page.name = 'DTF Components';
  }
  await figma.setCurrentPageAsync(page);

  /* ── Step 4: Clean up existing ─────────────────────────── */
  for (var ci2 = page.children.length - 1; ci2 >= 0; ci2--) {
    var child = page.children[ci2];
    /* Remove DTF sections (contain all presentation) */
    if ((child.type === 'SECTION' || child.type === 'FRAME') && child.name.indexOf('DTF /') === 0) {
      child.remove();
      log('Removed existing section: ' + child.name);
      continue;
    }
    /* Remove legacy loose nodes from older versions */
    if (child.name === 'Master/ Buttons/ ' + BP.name) {
      child.remove(); continue;
    }
    if (child.type === 'COMPONENT_SET' && child.name.indexOf('button/') === 0) {
      child.remove(); continue;
    }
    if (child.type === 'COMPONENT' && child.name === 'DTF/Icon/Placeholder') {
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
  var primaryModeId = t3Modes['primary'] || null;

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
  var COLOR_ACCENT   = (await resolveVarColor(t3Vars['component/bg-default'], primaryModeId))     || { r: 0.22, g: 0.42, b: 0.95 };
  var COLOR_PRIMARY_CT = (await resolveVarColor(t3Vars['content/default'], primaryModeId))        || { r: 0.17, g: 0.36, b: 0.89 };
  var COLOR_ON_COMP  = (await resolveVarColor(t3Vars['oncomponent-content/default'], primaryModeId)) || { r: 1, g: 1, b: 1 };
  var COLOR_PRIMARY_CONTAINER = (await resolveVarColor(t3Vars['container/bg'], primaryModeId))    || { r: 0.92, g: 0.95, b: 1 };

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
  var SECTION_W = 1200;
  var CARD_W = SECTION_W - 80; /* card width inside sections */
  var cursorY = 100;

  /* Pre-compute master names for use in hero section stats */
  var masterNames = Object.keys(BP.masters);

  /* ── Step 5a: Create Icon placeholder component ─────────
     A tiny 20×20 component with a vector child that scales.
     This lives on the page and acts as the INSTANCE_SWAP default.
     Users swap it with their own icon library components.        */
  figma.ui.postMessage({ type: 'gen-progress', text: 'Building icon placeholder…' });

  var iconPlaceholder = figma.createComponent();
  iconPlaceholder.name = 'DTF/Icon/Placeholder';
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

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     PRESENTATION: Page Header — Hero Card (absolute positioning)
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  var headerSec = createSection('DTF / ' + BP.name + ' — Overview', SECTION_W);

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

  /* Stat badges */
  var statBadges = [
    createBadge('Tier 1: ' + masterNames.length + ' Masters', COLOR_HERO_CARD, COLOR_HERO_SUB),
    createBadge('Tier 2: ' + BP.types.length + ' Types \u00d7 ' + BP.states.length + ' States', COLOR_HERO_CARD, COLOR_HERO_SUB),
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
  if (t3Col && primaryModeId) {
    try {
      heroBg.setExplicitVariableModeForCollection(t3Col, primaryModeId);
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
  var iconSec = createSection('DTF / Icon Primitive', 480);

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

  /* Icon preview box */
  var icPreview = figma.createFrame();
  icPreview.name = 'icon-preview';
  icPreview.resize(64, 64);
  icPreview.cornerRadius = 8;
  icPreview.fills = [{ type: 'SOLID', color: COLOR_SURFACE_BG }];
  icPreview.strokes = [{ type: 'SOLID', color: COLOR_OUTLINE }];
  icPreview.strokeWeight = 1; icPreview.strokeAlign = 'INSIDE';
  icPreview.dashPattern = [4, 4];
  icPreview.clipsContent = false;
  iconCard.appendChild(icPreview);
  icPreview.x = 24; icPreview.y = 82;
  icPreview.appendChild(iconPlaceholder);
  iconPlaceholder.x = 22; iconPlaceholder.y = 22;

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
  var iconSecH = iconSec.innerY + 160 + 32;
  try { iconSec.section.resize(480, iconSecH); } catch (e) {}
  page.appendChild(iconSec.section);
  iconSec.section.x = PAGE_X;
  iconSec.section.y = cursorY;
  cursorY += iconSecH + SECTION_GAP;

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     PRESENTATION: Tier 1 — Master Components (absolute positioning)
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  figma.ui.postMessage({ type: 'gen-progress', text: 'Building master components…' });

  var masterSec = createSection('DTF / Tier 1 — Masters', SECTION_W);

  /* Header bar — plain frame with absolute text */
  var mHeaderBar = figma.createFrame();
  mHeaderBar.name = 'tier1-header';
  mHeaderBar.resize(CARD_W, 88);
  mHeaderBar.cornerRadius = 12;
  mHeaderBar.fills = [{ type: 'SOLID', color: COLOR_CARD_BG }];
  mHeaderBar.clipsContent = false;

  var mhBadge = createBadge('TIER 1', COLOR_PRIMARY_CONTAINER, COLOR_PRIMARY_CT);
  mHeaderBar.appendChild(mhBadge); mhBadge.x = 28; mhBadge.y = 16;
  var mhTitle = createLabel('Master Components', 20, true, COLOR_HEADING);
  mHeaderBar.appendChild(mhTitle); mhTitle.x = 28; mhTitle.y = 42;
  var mhDesc = createLabel('Structure + spacing \u00b7 Bound to comp-size variables \u00b7 No color (inherited from Tier 2)', 12, false, COLOR_BODY);
  mHeaderBar.appendChild(mhDesc); mhDesc.x = 28; mhDesc.y = 66;

  masterSec.section.appendChild(mHeaderBar);
  mHeaderBar.x = masterSec.innerX;
  mHeaderBar.y = masterSec.innerY;

  /* Bind master header to surface-bright tokens */
  if (t2Col && brightModeId) {
    try {
      mHeaderBar.setExplicitVariableModeForCollection(t2Col, brightModeId);
      tryBindFill(mHeaderBar, t2Vars['default/surfaces/subtle']);
      tryBindFill(mhTitle, t2Vars['default/content/strong']);
      tryBindFill(mhDesc, t2Vars['default/content/default']);
    } catch (mhBindErr) {
      log('Master header binding skipped: ' + mhBindErr.message);
    }
  }
  /* Bind tier-1 badge to primary container tokens */
  if (t3Col && primaryModeId) {
    try {
      mhBadge.setExplicitVariableModeForCollection(t3Col, primaryModeId);
      tryBindFill(mhBadge, t3Vars['container/bg']);
      /* Bind badge label text */
      if (mhBadge.children.length > 0) tryBindFill(mhBadge.children[0], t3Vars['content/default']);
    } catch (e) {}
  }

  var masterFrame = figma.createFrame();
  masterFrame.name = 'Master/ Buttons/ ' + BP.name;
  masterFrame.fills = [];
  masterFrame.resize(600, 80);
  masterFrame.clipsContent = false;

  var masterComponents = {};
  /* masterNames already defined before hero section */

  for (var mi = 0; mi < masterNames.length; mi++) {
    var masterName = masterNames[mi];
    var masterCfg = BP.masters[masterName];
    var slots = masterCfg.slots;

    /* Create master component */
    var master = figma.createComponent();
    master.name = masterName;
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

        /* Icon wrapper: ALWAYS bind both padL + padR.
           In icon+text masters, padR acts as the icon-to-text gap. */
        var iwPadLVar = compSizeVars[BP.sizeBindings.iconWrapperPadL];
        if (iwPadLVar) { await tryBindVar(iconWrapper, 'paddingLeft', iwPadLVar); stats.bindings++; }
        var iwPadRVar = compSizeVars[BP.sizeBindings.iconWrapperPadR];
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
    master.x = mi * 240;
    master.y = 0;

    /* Simple label for this master (no preview cards) */
    var masterLabel = createLabel(masterName, 13, true, COLOR_HEADING);
    masterSec.section.appendChild(masterLabel);
    masterLabel.x = masterSec.innerX;
    masterLabel.y = masterSec.innerY + mHeaderBar.height + 24 + mi * 28;
    tryBindFill(masterLabel, t2Vars['default/content/strong']);

    var masterSlotBadge = createBadge(masterCfg.slots.join(' + '), COLOR_CM_BG, COLOR_DIMMED);
    masterSec.section.appendChild(masterSlotBadge);
    masterSlotBadge.x = masterSec.innerX + masterLabel.width + 12;
    masterSlotBadge.y = masterSec.innerY + mHeaderBar.height + 22 + mi * 28;
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

  /* Place master frame in section (below header + labels) */
  var masterFrameY = masterSec.innerY + mHeaderBar.height + 24 + masterNames.length * 28 + 16;
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

  var variantSec = createSection('DTF / Tier 2 — Variants', SECTION_W);

  /* Header bar — plain frame, absolute children */
  var vHeaderBar = figma.createFrame();
  vHeaderBar.name = 'tier2-header';
  vHeaderBar.resize(CARD_W, 88);
  vHeaderBar.cornerRadius = 12;
  vHeaderBar.fills = [{ type: 'SOLID', color: COLOR_CARD_BG }];
  vHeaderBar.clipsContent = false;

  var vhBadge = createBadge('TIER 2', COLOR_SUCCESS_CONTAINER, COLOR_SUCCESS_CT);
  vHeaderBar.appendChild(vhBadge); vhBadge.x = 28; vhBadge.y = 16;
  var vhTitle = createLabel('Variant Component Sets', 20, true, COLOR_HEADING);
  vHeaderBar.appendChild(vhTitle); vhTitle.x = 28; vhTitle.y = 42;
  var vhDesc = createLabel('Color + state overrides \u00b7 Each variant wraps a Tier 1 master instance with token-bound fills, strokes, and content colors', 12, false, COLOR_BODY);
  vHeaderBar.appendChild(vhDesc); vhDesc.x = 28; vhDesc.y = 66;

  variantSec.section.appendChild(vHeaderBar);
  vHeaderBar.x = variantSec.innerX;
  vHeaderBar.y = variantSec.innerY;

  /* Bind variant header to surface-bright tokens */
  if (t2Col && brightModeId) {
    try {
      vHeaderBar.setExplicitVariableModeForCollection(t2Col, brightModeId);
      tryBindFill(vHeaderBar, t2Vars['default/surfaces/subtle']);
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
    var setDisplayName = 'button/ ' + mName.toLowerCase();

    var components = []; /* { component, type, state } */

    for (var ti = 0; ti < BP.types.length; ti++) {
      var typeName = BP.types[ti];
      for (var sti = 0; sti < BP.states.length; sti++) {
        var stateName = BP.states[sti];
        var overrides = BP.stateOverrides[typeName][stateName];
        if (!overrides) continue;

        /* Create variant component — thin wrapper, NO padding or layout of its own.
           All structure comes from the master instance inside it. */
        var varComp = figma.createComponent();
        varComp.name = 'Type=' + typeName + ', State=' + stateName;
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

        /* Disabled opacity lives on the COMPONENT (not the instance) */
        if (overrides.componentOpacity !== undefined) {
          varComp.opacity = overrides.componentOpacity;
        }

        /* Create instance of master component */
        var instance = masterComp.createInstance();
        varComp.appendChild(instance);
        instance.layoutSizingHorizontal = 'HUG';
        instance.layoutSizingVertical = 'FIXED';

        /* ── Apply color overrides on the INSTANCE ── */

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

        components.push({ component: varComp, type: typeName, state: stateName });
        stats.components++;
      }
    }

    /* ── Combine into ComponentSet ── */
    figma.ui.postMessage({ type: 'gen-progress', text: 'Combining ' + setDisplayName + '…' });

    var allComps = [];
    for (var ai = 0; ai < components.length; ai++) {
      allComps.push(components[ai].component);
    }
    var componentSet = figma.combineAsVariants(allComps, page);
    componentSet.name = setDisplayName;

    /* Grid layout: types as rows, states as columns.
       Row/column labels positioned outside the component set. */
    var colCount = BP.states.length;
    var rowCount = BP.types.length;
    var padX = 20;
    var padY = 27;
    var colSpacing = 155;
    var rowSpacing = 70;
    for (var gi = 0; gi < components.length; gi++) {
      var row = Math.floor(gi / colCount);
      var col = gi % colCount;
      components[gi].component.x = padX + col * colSpacing;
      components[gi].component.y = padY + row * rowSpacing;
    }
    var totalW = padX * 2 + (colCount - 1) * colSpacing + 120;
    var totalH = padY + (rowCount - 1) * rowSpacing + 32 + padY;
    try { componentSet.resize(totalW, totalH); } catch (e) { /* auto-size */ }

    /* ── Row/column label constants ── */
    var ROW_LABEL_WIDTH = 100;
    var COL_HEADER_HEIGHT = 40;

    /* ── Step 7: Component properties ──
       TEXT and INSTANCE_SWAP are already wired on the MASTER component.
       They propagate through instances automatically.
       No additional wiring needed at the component set level. */
    figma.ui.postMessage({ type: 'gen-progress', text: 'Properties propagated from masters…' });

    /* ── Step 8: Wire interactive reactions ── */
    figma.ui.postMessage({ type: 'gen-progress', text: 'Wiring interactions…' });

    for (var ri = 0; ri < BP.types.length; ri++) {
      var rType = BP.types[ri];
      var defaultComp = null, hoverComp = null, pressedComp = null;

      for (var rj = 0; rj < components.length; rj++) {
        if (components[rj].type !== rType) continue;
        if (components[rj].state === 'default') defaultComp = components[rj].component;
        if (components[rj].state === 'hover')   hoverComp = components[rj].component;
        if (components[rj].state === 'pressed') pressedComp = components[rj].component;
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
            log('Reaction wiring failed for ' + rType + ': ' + re.message);
            stats.errors.push('Reactions ' + rType + ': ' + re.message);
          }
        }
      }
    }

    allComponentSets.push(componentSet);

    /* ── Position inside variant section with styled labels ── */

    /* Sub-heading card for this master type */
    var setHeadingCard = createCard({
      name: 'heading-' + mName,
      fill: COLOR_HEADER_BG,
      radius: 10,
      padX: 20,
      padY: 12,
      gap: 0,
      direction: 'HORIZONTAL'
    });
    setHeadingCard.counterAxisAlignItems = 'CENTER';
    setHeadingCard.itemSpacing = 12;
    setHeadingCard.appendChild(createLabel(mName, 14, true, COLOR_HEADING));
    var slotBadge = createBadge(BP.masters[mName].slots.join(' + '), COLOR_CM_BG, COLOR_DIMMED);
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
        tryBindFill(slotBadge, t2Vars['default/component/bg']);
        if (slotBadge.children.length > 0) tryBindFill(slotBadge.children[0], t2Vars['default/content/subtle']);
      } catch (e) {}
    }

    /* Component set X offset (leave room for row labels) */
    var csX = variantSec.innerX + ROW_LABEL_WIDTH;
    var csY = varSecContentY + COL_HEADER_HEIGHT;

    /* Column header bar — plain frame, positioned text nodes */
    var colHeaderBar = figma.createFrame();
    colHeaderBar.name = 'col-headers-' + mName;
    colHeaderBar.resize(totalW, 34);
    colHeaderBar.cornerRadius = 8;
    colHeaderBar.fills = [{ type: 'SOLID', color: COLOR_HEADER_BG }];
    colHeaderBar.clipsContent = false;

    for (var chi = 0; chi < BP.states.length; chi++) {
      var colH = createLabel(BP.states[chi], 11, true, COLOR_DIMMED);
      colHeaderBar.appendChild(colH);
      colH.x = padX + chi * colSpacing;
      colH.y = 10;
      /* Bind col header text */
      tryBindFill(colH, t2Vars['default/content/subtle']);
    }
    variantSec.section.appendChild(colHeaderBar);
    colHeaderBar.x = csX;
    colHeaderBar.y = varSecContentY;
    /* Bind col header bar bg */
    tryBindFill(colHeaderBar, t2Vars['default/surfaces/strong']);

    /* Row labels — simple text nodes */
    for (var rhi = 0; rhi < BP.types.length; rhi++) {
      var rowLabel = createLabel(BP.types[rhi], 11, false, COLOR_BODY);
      variantSec.section.appendChild(rowLabel);
      rowLabel.x = variantSec.innerX + 4;
      rowLabel.y = csY + padY + rhi * rowSpacing + 8;
      /* Bind row label text */
      tryBindFill(rowLabel, t2Vars['default/content/default']);
    }

    /* Place the component set */
    variantSec.section.appendChild(componentSet);
    componentSet.x = csX;
    componentSet.y = csY;
    varSecContentY = csY + totalH + 40;

    /* Separator line between variant groups (except last) */
    if (mci < masterNames.length - 1) {
      var groupDiv = createDivider(SECTION_W - 80);
      variantSec.section.appendChild(groupDiv);
      groupDiv.x = variantSec.innerX;
      groupDiv.y = varSecContentY;
      tryBindFill(groupDiv, t2Vars['default/surfaces/separator']);
      varSecContentY += 24;
    }

    log('Created component set: ' + setDisplayName + ' (' + components.length + ' variants)');
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
    types: BP.types.length,
    states: BP.states.length,
    totalComponents: stats.components,
    architecture: 'two-tier-master-instance'
  };
  figma.root.setPluginData('dtf-component-versions', JSON.stringify(existingVersions));

  log('Gen complete: ' + stats.components + ' components, ' + stats.bindings + ' bindings, ' + stats.reactions + ' reactions');
  return stats;
}

/* ── Available blueprints registry ───────────────────────── */

var COMPONENT_BLUEPRINTS = {
  button: BUTTON_BLUEPRINT
};

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
