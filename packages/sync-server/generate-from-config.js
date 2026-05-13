/* ═══════════════════════════════════════════════════════════════
   Design Token Forge — Config-to-Tokens Generator

   Generates parseCSSTokens-compatible token objects from a
   project's config.json, using the palette engine to resolve
   key hex → 22 steps → individual token hex values.

   Used by build-static.js to make config.json the authoritative
   source of truth for the build pipeline.
   ═══════════════════════════════════════════════════════════════ */

import { generatePalette, STEP_NAMES } from '../generator/src/palette-engine.js';

// ── Constants (must match color-system.html) ──────────────────
//
// Note: 'primary' was renamed to 'brand' across the system in May 2026.
// 'brand' is now the canonical name for the project's main UI color and
// derives from the monochromatic palette. The standalone 'brand' palette
// key was dropped — projects only define one source palette ('monochromatic')
// and the brand role inherits from it. See docs/decisions/adrs.md.

const TOKEN_ROLES = ['brand', 'danger', 'warning', 'info', 'success'];

const ROLE_TO_PALETTE_KEY = {
  brand: 'monochromatic', danger: 'danger',
  warning: 'warning', info: 'info', success: 'success',
  greyscale: 'greyscale', desaturated: 'desaturated'
};

const PALETTE_KEY_TO_ROLE = {
  monochromatic: 'brand', danger: 'danger',
  warning: 'warning', info: 'info', success: 'success',
  greyscale: 'greyscale', desaturated: 'desaturated'
};

const SURFACE_NAMES = [
  'bright', 'base', 'dim', 'deep', 'accent',
  'container', 'over-container', 'float', 'inverse'
];

const SURF_PROP_ORDER = [
  'bg', 'subtle', 'strong', 'outline', 'separator',
  'ct-default', 'ct-strong', 'ct-subtle', 'ct-faint',
  'cm-bg', 'cm-bg-hover', 'cm-bg-pressed',
  'cm-outline', 'cm-outline-hover', 'cm-outline-pressed', 'cm-separator'
];

// Default surface maps — used when config has no surfaceMap
const DEFAULT_SURF_L = {
  bright:           {bg:'white',subtle:'25',strong:'50',outline:'150',separator:'150','ct-default':'900','ct-strong':'black','ct-subtle':'600','ct-faint':'400','cm-bg':'25','cm-bg-hover':'50','cm-bg-pressed':'75','cm-outline':'150','cm-outline-hover':'200','cm-outline-pressed':'250','cm-separator':'150'},
  base:             {bg:'25',subtle:'50',strong:'75',outline:'150',separator:'175','ct-default':'900','ct-strong':'black','ct-subtle':'600','ct-faint':'400','cm-bg':'white','cm-bg-hover':'25','cm-bg-pressed':'50','cm-outline':'150','cm-outline-hover':'200','cm-outline-pressed':'250','cm-separator':'175'},
  dim:              {bg:'50',subtle:'75',strong:'100',outline:'175',separator:'175','ct-default':'900','ct-strong':'black','ct-subtle':'600','ct-faint':'400','cm-bg':'25','cm-bg-hover':'50','cm-bg-pressed':'75','cm-outline':'175','cm-outline-hover':'200','cm-outline-pressed':'300','cm-separator':'175'},
  deep:             {bg:'75',subtle:'100',strong:'150',outline:'175',separator:'200','ct-default':'900','ct-strong':'black','ct-subtle':'600','ct-faint':'450','cm-bg':'50','cm-bg-hover':'75','cm-bg-pressed':'100','cm-outline':'200','cm-outline-hover':'250','cm-outline-pressed':'300','cm-separator':'200'},
  container:        {bg:'white',subtle:'25',strong:'50',outline:'150',separator:'150','ct-default':'900','ct-strong':'black','ct-subtle':'600','ct-faint':'400','cm-bg':'25','cm-bg-hover':'50','cm-bg-pressed':'75','cm-outline':'150','cm-outline-hover':'200','cm-outline-pressed':'250','cm-separator':'150'},
  'over-container': {bg:'white',subtle:'25',strong:'50',outline:'150',separator:'175','ct-default':'900','ct-strong':'black','ct-subtle':'600','ct-faint':'400','cm-bg':'50','cm-bg-hover':'75','cm-bg-pressed':'100','cm-outline':'175','cm-outline-hover':'200','cm-outline-pressed':'250','cm-separator':'175'},
  float:            {bg:'white',subtle:'25',strong:'50',outline:'150',separator:'175','ct-default':'900','ct-strong':'black','ct-subtle':'550','ct-faint':'400','cm-bg':'50','cm-bg-hover':'75','cm-bg-pressed':'100','cm-outline':'175','cm-outline-hover':'250','cm-outline-pressed':'300','cm-separator':'175'},
  inverse:          {bg:'900',subtle:'850',strong:'800',outline:'700',separator:'700','ct-default':'25','ct-strong':'white','ct-subtle':'250','ct-faint':'400','cm-bg':'850','cm-bg-hover':'800','cm-bg-pressed':'750','cm-outline':'600','cm-outline-hover':'550','cm-outline-pressed':'500','cm-separator':'700'}
};

const DEFAULT_SURF_D = {
  bright:           {bg:'850',subtle:'800',strong:'750',outline:'700',separator:'700','ct-default':'50','ct-strong':'white','ct-subtle':'250','ct-faint':'450','cm-bg':'800','cm-bg-hover':'750','cm-bg-pressed':'700','cm-outline':'600','cm-outline-hover':'550','cm-outline-pressed':'500','cm-separator':'700'},
  base:             {bg:'900',subtle:'850',strong:'800',outline:'750',separator:'700','ct-default':'50','ct-strong':'white','ct-subtle':'250','ct-faint':'450','cm-bg':'850','cm-bg-hover':'800','cm-bg-pressed':'750','cm-outline':'600','cm-outline-hover':'550','cm-outline-pressed':'500','cm-separator':'700'},
  dim:              {bg:'900',subtle:'850',strong:'800',outline:'750',separator:'750','ct-default':'75','ct-strong':'white','ct-subtle':'250','ct-faint':'450','cm-bg':'850','cm-bg-hover':'800','cm-bg-pressed':'750','cm-outline':'600','cm-outline-hover':'550','cm-outline-pressed':'500','cm-separator':'750'},
  deep:             {bg:'black',subtle:'900',strong:'850',outline:'800',separator:'750','ct-default':'75','ct-strong':'white','ct-subtle':'300','ct-faint':'450','cm-bg':'900','cm-bg-hover':'850','cm-bg-pressed':'800','cm-outline':'700','cm-outline-hover':'600','cm-outline-pressed':'550','cm-separator':'750'},
  container:        {bg:'850',subtle:'800',strong:'750',outline:'700',separator:'700','ct-default':'50','ct-strong':'white','ct-subtle':'250','ct-faint':'450','cm-bg':'800','cm-bg-hover':'750','cm-bg-pressed':'700','cm-outline':'600','cm-outline-hover':'550','cm-outline-pressed':'500','cm-separator':'700'},
  'over-container': {bg:'800',subtle:'750',strong:'700',outline:'600',separator:'600','ct-default':'50','ct-strong':'white','ct-subtle':'200','ct-faint':'400','cm-bg':'750','cm-bg-hover':'700','cm-bg-pressed':'600','cm-outline':'550','cm-outline-hover':'500','cm-outline-pressed':'450','cm-separator':'600'},
  float:            {bg:'750',subtle:'700',strong:'600',outline:'550',separator:'550','ct-default':'25','ct-strong':'white','ct-subtle':'200','ct-faint':'300','cm-bg':'700','cm-bg-hover':'600','cm-bg-pressed':'550','cm-outline':'500','cm-outline-hover':'450','cm-outline-pressed':'400','cm-separator':'550'},
  inverse:          {bg:'900',subtle:'850',strong:'800',outline:'700',separator:'700','ct-default':'25','ct-strong':'white','ct-subtle':'250','ct-faint':'400','cm-bg':'850','cm-bg-hover':'800','cm-bg-pressed':'750','cm-outline':'600','cm-outline-hover':'550','cm-outline-pressed':'500','cm-separator':'700'}
};

const DEFAULT_SURF_LA = {bg:'25',subtle:'50',strong:'75',outline:'175',separator:'175','ct-default':'800','ct-strong':'900','ct-subtle':'700','ct-faint':'500','cm-bg':'white','cm-bg-hover':'25','cm-bg-pressed':'50','cm-outline':'175','cm-outline-hover':'200','cm-outline-pressed':'250','cm-separator':'175'};
const DEFAULT_SURF_DA = {bg:'900',subtle:'850',strong:'800',outline:'750',separator:'750','ct-default':'75','ct-strong':'white','ct-subtle':'150','ct-faint':'400','cm-bg':'850','cm-bg-hover':'800','cm-bg-pressed':'750','cm-outline':'600','cm-outline-hover':'550','cm-outline-pressed':'500','cm-separator':'750'};

const DEFAULT_LIGHT_MAP = {
  'content-default':'550','content-strong':'600','content-subtle':'350','content-faint':'200',
  'component-bg-default':'500','component-bg-hover':'550','component-bg-pressed':'600',
  'component-outline-default':'300','component-outline-hover':'350','component-outline-pressed':'450',
  'component-separator':'100',
  'container-bg':'50','container-hover':'75','container-pressed':'100','container-outline':'200','container-separator':'100',
  'on-component':'fixed-white','on-container':'600'
};

const DEFAULT_DARK_MAP = {
  'content-default':'150','content-strong':'100','content-subtle':'200','content-faint':'350',
  'component-bg-default':'450','component-bg-hover':'350','component-bg-pressed':'300',
  'component-outline-default':'450','component-outline-hover':'350','component-outline-pressed':'300',
  'component-separator':'750',
  'container-bg':'800','container-hover':'750','container-pressed':'700','container-outline':'550','container-separator':'750',
  'on-component':'fixed-white','on-container':'100'
};

/**
 * Normalize a semantic map — converts legacy integer indices to step name strings.
 * This ensures backward compatibility with config.json files that used the old format.
 */
function normalizeSemanticMap(map) {
  if (!map) return map;
  const normalized = {};
  for (const [key, val] of Object.entries(map)) {
    if (typeof val === 'number') {
      normalized[key] = val === -1 ? 'fixed-white' : STEP_NAMES[val];
    } else {
      normalized[key] = val;
    }
  }
  return normalized;
}

// ── Palette generation ────────────────────────────────────────

function buildPalettes(paletteKeys) {
  const palettes = {};
  for (const [key, hex] of Object.entries(paletteKeys)) {
    // Drop legacy standalone 'brand' palette key — the brand role is
    // now derived from the monochromatic palette via ROLE_TO_PALETTE_KEY.
    if (key === 'brand') continue;
    palettes[key] = generatePalette(hex);
  }
  return palettes;
}

// Build a step-name → hex lookup for a palette
function stepLookup(palette) {
  const map = {};
  for (const step of palette.steps) {
    map[step.name] = step.hex;
  }
  return map;
}

// ── Token generators ──────────────────────────────────────────

/**
 * Generate primitive color tokens from palettes.
 * Returns { light: { 'prim-monochromatic-white': '#FFFFFF', ... } }
 * (primitives have no dark block — all values are in :root)
 */
function generatePrimitiveTokens(palettes) {
  const light = {};
  // Palette prefix mapping: palette key → CSS prefix
  for (const [key, palette] of Object.entries(palettes)) {
    for (const step of palette.steps) {
      light[`prim-${key}-${step.name}`] = step.hex;
    }
  }
  return { light, dark: {} };
}

/**
 * Generate semantic tokens from semantic map + palettes.
 * Returns { light: { 'primary-content-default': '#hex', ... }, dark: { ... } }
 *
 * @param {Object} semanticMap — { light: {...}, dark: {...} }
 * @param {Object} palettes — generated palette objects keyed by palette name
 * @param {Array} [customRoles] — custom roles from config (already migrated)
 */
function generateSemanticTokens(semanticMap, palettes, customRoles) {
  const lightMap = normalizeSemanticMap(semanticMap.light) || DEFAULT_LIGHT_MAP;
  const darkMap  = normalizeSemanticMap(semanticMap.dark)  || DEFAULT_DARK_MAP;
  const light = {};
  const dark = {};

  // Include built-in roles + any custom roles from config
  const allRoles = [...TOKEN_ROLES];
  if (customRoles) {
    for (const cr of customRoles) {
      if (cr.id && !allRoles.includes(cr.id)) {
        allRoles.push(cr.id);
      }
    }
  }

  for (const role of allRoles) {
    const palKey = ROLE_TO_PALETTE_KEY[role] || role;
    const palette = palettes[palKey];
    if (!palette) continue;
    const look = stepLookup(palette);

    for (const [prop, stepName] of Object.entries(lightMap)) {
      light[`${role}-${prop}`] = stepName === 'fixed-white' ? '#FFFFFF' : (look[stepName] || '#000000');
    }
    for (const [prop, stepName] of Object.entries(darkMap)) {
      dark[`${role}-${prop}`] = stepName === 'fixed-white' ? '#FFFFFF' : (look[stepName] || '#000000');
    }
  }

  return { light, dark };
}

/**
 * Generate surface tokens from surface map + palettes.
 * Respects surfacePaletteSrc to pick the correct palette per surface.
 * Returns { light: { 'surface-bright-bg': '#hex', ... }, dark: { ... },
 *           paletteSrc: { 'surface-bright-bg': 'desaturated', ... } }
 */
function generateSurfaceTokens(surfaceMap, palettes, surfacePaletteSrc) {
  const monoPal = palettes.monochromatic;
  if (!monoPal) return null;

  // Default palette source: accent → monochromatic, all others → greyscale
  const defaultSrc = {};
  for (const sn of SURFACE_NAMES) defaultSrc[sn] = sn === 'accent' ? 'monochromatic' : 'greyscale';
  const srcMap = { ...defaultSrc, ...(surfacePaletteSrc || {}) };

  // Map role names used in color-system editor to actual palette keys
  const roleToKey = { ...ROLE_TO_PALETTE_KEY };

  const surfL  = surfaceMap?.light       || DEFAULT_SURF_L;
  const surfD  = surfaceMap?.dark        || DEFAULT_SURF_D;
  const surfLA = surfaceMap?.lightAccent || DEFAULT_SURF_LA;
  const surfDA = surfaceMap?.darkAccent  || DEFAULT_SURF_DA;

  const light = {};
  const dark = {};
  const palSrc = {};  // track which palette each token came from

  for (const name of SURFACE_NAMES) {
    const isAccent = name === 'accent';
    const lMap  = isAccent ? surfLA : surfL[name];
    const dMap  = isAccent ? surfDA : surfD[name];

    // Resolve the palette for this surface
    const srcRole = srcMap[name] || 'greyscale';
    const palKey  = roleToKey[srcRole] || srcRole;
    const palette = palettes[palKey] || palettes.greyscale;
    const look    = stepLookup(palette);

    if (!lMap || !dMap) continue;

    for (const prop of SURF_PROP_ORDER) {
      const cssName = `surface-${name}-${prop}`;
      light[cssName] = look[lMap[prop]] || '#000000';
      dark[cssName]  = look[dMap[prop]] || '#000000';
      palSrc[cssName] = palKey;
    }
  }

  return { light, dark, paletteSrc: palSrc };
}

// ── Main export ───────────────────────────────────────────────

/**
 * Generate token override objects from a project config.
 * Each returned object has the same shape as parseCSSTokens():
 *   { light: { cssVarName: hexValue }, dark: { ... } }
 *
 * Fields not present in config are omitted (caller should fall
 * back to CSS-parsed values for those).
 *
 * @param {Object} config — project config.json contents
 * @param {Object} basePrimitiveTokens — existing parsed primitives
 *   (non-color tokens like spacing/font are preserved from here)
 * @returns {{ primitiveTokens?, semanticTokens?, surfaceTokens? }}
 */
export function generateTokenOverrides(config, basePrimitiveTokens) {
  if (!config?.paletteKeys) return {};

  // ── Migrate stale custom-N palette keys → label slugs ─────────
  // The editor sometimes saves 'custom-1' instead of the label slug.
  // Fix it here so the build always produces the correct variable names.
  if (config.customRoles) {
    for (const cr of config.customRoles) {
      if (/^custom-\d+$/.test(cr.id) && cr.label) {
        const oldId = cr.id;
        const newId = cr.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
        if (config.paletteKeys[oldId]) {
          config.paletteKeys[newId] = config.paletteKeys[oldId];
          delete config.paletteKeys[oldId];
        }
        if (config.surfacePaletteSrc) {
          for (const sn of Object.keys(config.surfacePaletteSrc)) {
            if (config.surfacePaletteSrc[sn] === oldId) config.surfacePaletteSrc[sn] = newId;
          }
        }
        cr.id = newId;
      }
    }
  }

  const palettes = buildPalettes(config.paletteKeys);
  const result = {};

  // Primitives: overlay config-derived colors onto existing tokens
  // (preserves spacing, font-size, font-weight, etc. from CSS)
  // Strip all prim-* color tokens from base — they are fully regenerated from config.
  // This prevents stale palette names (e.g. custom-1) from persisting.
  const baseLight = {};
  const baseDark = {};
  for (const [k, v] of Object.entries(basePrimitiveTokens.light || {})) {
    if (!k.startsWith('prim-')) baseLight[k] = v;
  }
  for (const [k, v] of Object.entries(basePrimitiveTokens.dark || {})) {
    if (!k.startsWith('prim-')) baseDark[k] = v;
  }
  const colorTokens = generatePrimitiveTokens(palettes);
  result.primitiveTokens = {
    light: { ...baseLight, ...colorTokens.light },
    dark:  { ...baseDark,  ...colorTokens.dark }
  };

  // Semantics: full replacement if config has semanticMap
  if (config.semanticMap) {
    result.semanticTokens = generateSemanticTokens(config.semanticMap, palettes, config.customRoles);
  }

  // Surfaces: full replacement if config has surfaceMap, defaults if not
  result.surfaceTokens = generateSurfaceTokens(
    config.surfaceMap || null, palettes, config.surfacePaletteSrc || null
  );

  return result;
}
