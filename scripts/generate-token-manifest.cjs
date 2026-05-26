#!/usr/bin/env node
/**
 * generate-token-manifest.cjs
 *
 * Reads <comp>.tokens.css + <comp>.archetype.json, emits <comp>.tokens.json.
 *
 * The .tokens.json manifest is the machine contract consumed by:
 *   - the future component editor (token inspector / picker UI)
 *   - the gold-standard audit (per-archetype rule checks)
 *   - the Figma sync server (variable shape introspection)
 *
 * Run:
 *   node scripts/generate-token-manifest.cjs <component-dir>
 *   node scripts/generate-token-manifest.cjs --all
 */

const fs = require('fs');
const path = require('path');

const COMP_ROOT = path.resolve(__dirname, '..', 'packages/components/src');

// Section headers in .tokens.css are marked with emoji+name. Map them to axis keys.
const AXIS_HEADERS = [
  { re: /📐\s*SHAPE/i,           axis: 'shape' },
  { re: /📏\s*DIMENSION/i,       axis: 'dimension' },
  { re: /🎨\s*SURFACE/i,         axis: 'surface' },
  { re: /✏️?\s*TYPOGRAPHY/i,     axis: 'typography' },
  { re: /🧩\s*SLOTS/i,           axis: 'slots' },
  { re: /⚡\s*MOTION/i,          axis: 'motion' },
  { re: /♿\s*ACCESSIBILITY/i,   axis: 'a11y' },
];

const STATE_SUFFIXES   = ['hover','pressed','disabled','checked','focus','focus-visible','strong','readonly','invalid','loading','open','selected'];
const SIZE_SUFFIXES    = ['micro','tiny','small','base','medium','large','big','huge','mega','ultra'];
const VARIANT_GROUPS   = ['filled','outlined','soft','ghost','underline'];
const ROLE_GROUPS      = ['brand','danger','warning','info','success','neutral'];

/**
 * Parse a token name like `--btn-filled-bg-hover` into structured fields.
 *   prefix:   'btn'
 *   group:    'filled'  (variant or role; null for global tokens)
 *   property: 'bg'
 *   state:    'hover'   (null if no state suffix)
 *   size:     null      (size suffix, mutually exclusive with state for most cases)
 */
function classifyToken(name, prefix) {
  const stripped = name.replace(/^--/, '').replace(new RegExp('^' + prefix + '-?'), '');
  if (!stripped) return null;
  const parts = stripped.split('-');

  let group = null, size = null, state = null;

  // Trailing state? (compound suffixes win first)
  const tail = parts[parts.length - 1];
  if (STATE_SUFFIXES.includes(tail)) {
    state = parts.pop();
  } else if (parts.length >= 2 && STATE_SUFFIXES.includes(parts.slice(-2).join('-'))) {
    state = parts.splice(-2).join('-');
  }

  // Trailing size (after state strip)?
  const tail2 = parts[parts.length - 1];
  if (SIZE_SUFFIXES.includes(tail2)) {
    size = parts.pop();
  }

  // Leading group (variant or role)?
  if (parts.length >= 2 && (VARIANT_GROUPS.includes(parts[0]) || ROLE_GROUPS.includes(parts[0]))) {
    group = parts.shift();
  }

  const property = parts.join('-') || null;
  return { property, group, size, state };
}

function inferRole(classified) {
  // Convention: --{prefix}-{...}-{bg|fg|border-color|outline-color|shadow|color}
  const p = classified.property || '';
  if (/(^|-)(bg|background|background-color)$/.test(p))            return 'surface-bg';
  if (/(^|-)(fg|color|foreground|text-color)$/.test(p))            return 'surface-fg';
  if (/(^|-)border-color$/.test(p))                                return 'surface-border';
  if (/(^|-)border-width(-[trbl])?$/.test(p))                      return 'border-width';
  if (/(^|-)border-style$/.test(p))                                return 'border-style';
  if (/(^|-)outline-(color|width|style|offset)$/.test(p))          return 'outline';
  if (/(^|-)shadow$/.test(p))                                      return 'shadow';
  if (/(^|-)opacity$/.test(p))                                     return 'opacity';
  if (/(^|-)radius$/.test(p))                                      return 'radius';
  if (/(^|-)(height|min-height|max-height|width|min-width|max-width|inline-size|block-size|size)$/.test(p)) return 'dimension';
  if (/(^|-)(padding|padding-x|padding-y|padding-block|padding-inline|gap|margin)/.test(p)) return 'spacing';
  if (/(^|-)(icon-size|icon-color|icon-gap|icon-pad|loader-color|thumb-size)/.test(p)) return 'slot';
  if (/(^|-)(font-family|font-size|font-weight|line-height|letter-spacing|text-transform|white-space)/.test(p)) return 'typography';
  if (/(^|-)(transition-property|transition-duration|transition-easing|animation|duration|easing|speed)/.test(p)) return 'motion';
  if (/(^|-)(min-tap-target|focus-outline)/.test(p))               return 'a11y';
  if (/(^|-)(clip-path|overflow)/.test(p))                         return 'shape';
  return 'unclassified';
}

function parseTokensCss(css, prefix) {
  const lines = css.split('\n');
  const tokens = {};
  let currentAxis = 'unclassified';

  // First pass: build axis ranges via emoji headers.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { re, axis } of AXIS_HEADERS) {
      if (re.test(line)) { currentAxis = axis; break; }
    }
    // token declaration: `  --foo: value;`
    const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*(.+?);(?:\s*\/\*.*?\*\/)?\s*$/i);
    if (!m) continue;
    const [, name, rawValue] = m;
    if (!name.startsWith(`--${prefix}-`) && name !== `--${prefix}`) continue;
    const classified = classifyToken(name, prefix);
    if (!classified) continue;
    const valueRef = (rawValue.match(/var\((--[a-z0-9-]+)/i) || [])[1] || null;
    tokens[name] = {
      name,
      axis: currentAxis,
      role: inferRole(classified),
      group: classified.group,
      size: classified.size,
      state: classified.state,
      property: classified.property,
      value: rawValue.trim(),
      aliasOf: valueRef,         // upstream primitive (or null if literal)
      literal: !valueRef,
    };
  }
  return tokens;
}

function buildManifest(comp, archetype, tokens, remapRoles = new Set()) {
  // Axis presence: an axis is present if any token reports it.
  const axes = {};
  Object.values(tokens).forEach(t => { axes[t.axis] = (axes[t.axis] || 0) + 1; });

  // Variant / role / state / size enumerations actually used.
  const variants = new Set(), roles = new Set(), states = new Set(), sizes = new Set();
  Object.values(tokens).forEach(t => {
    if (t.group) {
      if (VARIANT_GROUPS.includes(t.group)) variants.add(t.group);
      else if (ROLE_GROUPS.includes(t.group)) roles.add(t.group);
    }
    if (t.state) states.add(t.state);
    if (t.size)  sizes.add(t.size);
  });

  // Auto-derive fillSurfaces from surface-bg tokens (states default + hover + pressed/active).
  const prefix = archetype.tokenPrefix || comp;
  const fillSurfaceMap = new Map();
  Object.values(tokens).forEach(t => {
    if (t.role !== 'surface-bg' || !t.group) return;
    const baseName = `--${prefix}-${t.group}-${t.property}`;
    if (!fillSurfaceMap.has(baseName)) fillSurfaceMap.set(baseName, { fillToken: baseName, group: t.group, states: new Set() });
    fillSurfaceMap.get(baseName).states.add(t.state || 'default');
  });
  const fillSurfaces = [...fillSurfaceMap.values()].map(f => ({ ...f, states: [...f.states].sort() }));

  // Archetype parity: declared vs present.
  // Defaults are inherent: `brand` role and `filled` variant don't require
  // a dedicated --{prefix}-{role|variant}-* token group; they're served by
  // the unprefixed/`:not([data-variant])` token set reading semantic --brand-*
  // tokens directly. Treat them as always present.
  const DEFAULT_ROLES    = new Set(['brand']);
  const DEFAULT_VARIANTS = new Set(['filled']);
  const declaredRoles = new Set(archetype.rolesSupported || []);
  const presentRoles = new Set([...roles, ...remapRoles, ...DEFAULT_ROLES]);
  const missingRoles = [...declaredRoles].filter(r => !presentRoles.has(r));
  const remapOnlyRoles = [...remapRoles].filter(r => !roles.has(r));
  const declaredVariants = new Set(archetype.variantsSupported || []);
  const presentVariants = new Set([...variants, ...DEFAULT_VARIANTS]);
  const missingVariants = [...declaredVariants].filter(v => !presentVariants.has(v));
  const gaps = {
    missingRoles,
    missingVariants,
    remapOnlyRoles,  // roles supported via data-role remap but no token group (informational)
  };

  return {
    $schema: 'https://design-token-forge.dev/schema/component-manifest.v1.json',
    component: comp,
    archetype: archetype.archetype,
    axes: {
      declared: archetype.axes || [],
      present: Object.keys(axes).filter(k => k !== 'unclassified').sort(),
      tokenCountByAxis: axes,
    },
    enumerations: {
      variants: [...variants].sort(),
      roles: [...roles].sort(),
      states: [...states].sort(),
      sizes: [...sizes].sort(),
    },
    fillSurfaces,
    onComponentTokens: archetype.onComponentTokens || [],
    editorExposure: archetype.editorExposureOverrides || {},
    figma: {
      bindingPrefix: archetype.figmaBindingPrefix || `${comp}/`,
    },
    gaps,
    tokenCount: Object.keys(tokens).length,
    tokens,
  };
}

function processComponent(compDir) {
  const comp = path.basename(compDir);
  const cssPath       = path.join(compDir, `${comp}.tokens.css`);
  const compCssPath   = path.join(compDir, `${comp}.css`);
  const archetypePath = path.join(compDir, `${comp}.archetype.json`);
  const outPath       = path.join(compDir, `${comp}.tokens.json`);

  if (!fs.existsSync(cssPath))       { console.warn(`⏭️  ${comp}: no tokens.css`); return null; }
  if (!fs.existsSync(archetypePath)) { console.warn(`⏭️  ${comp}: no archetype.json — skipping`); return null; }

  const css       = fs.readFileSync(cssPath, 'utf8');
  const compCss   = fs.existsSync(compCssPath) ? fs.readFileSync(compCssPath, 'utf8') : '';
  const archetype = JSON.parse(fs.readFileSync(archetypePath, 'utf8'));
  // Allow archetype.json to override the CSS prefix (e.g. icon-button uses --icon-btn-*).
  const prefix    = archetype.tokenPrefix || comp;
  const tokens    = parseTokensCss(css, prefix);

  // Roles can be supported by remap selector (data-role="X") even without a --{prefix}-{role}-* token group.
  const remapRoles = new Set();
  const remapRe = /\[data-role="([a-z]+)"\]/gi;
  let match;
  while ((match = remapRe.exec(compCss)) !== null) remapRoles.add(match[1]);

  const manifest  = buildManifest(comp, archetype, tokens, remapRoles);

  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✅ ${comp}: ${manifest.tokenCount} tokens → ${path.relative(process.cwd(), outPath)}`);
  return manifest;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/generate-token-manifest.cjs <component-dir|--all>');
    process.exit(1);
  }
  if (args[0] === '--all') {
    const dirs = fs.readdirSync(COMP_ROOT)
      .map(n => path.join(COMP_ROOT, n))
      .filter(p => fs.statSync(p).isDirectory());
    let ok = 0, skipped = 0;
    dirs.forEach(d => { if (processComponent(d)) ok++; else skipped++; });
    console.log(`\n📦 Generated ${ok} manifest(s), skipped ${skipped}.`);
  } else {
    const dir = path.isAbsolute(args[0]) ? args[0] : path.resolve(process.cwd(), args[0]);
    processComponent(dir);
  }
}

if (require.main === module) main();
module.exports = { parseTokensCss, classifyToken, inferRole, buildManifest };
