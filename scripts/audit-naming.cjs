#!/usr/bin/env node
/**
 * Canonical naming audit.
 * Source of truth: packages/figma-plugin/code.js
 *   Roles:    brand | danger | warning | info | success | neutral
 *   Variants: filled | outlined | soft | ghost
 *   Token role prefix: --brand-*  (NEVER --primary-*)
 *   Component variant prefix: --{comp}-filled-* (NEVER --{comp}-primary-*)
 *
 * Fails (exit 1) if any legacy name appears in tracked source files.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['demo', 'packages/components/src', 'packages/tokens/src', 'projects'];
const EXTS = new Set(['.html', '.css', '.js', '.json']);
const SKIP = /node_modules|dist|\.git|\.old$|\.prev$|\.backup$/;

// [pattern, message, optional file-extension restriction]
const RULES = [
  // Role tokens
  [/--primary-(?!on-component\b)[\w-]*/g, 'legacy --primary-* token (use --brand-*)'],
  [/--secondary-[\w-]*/g, 'legacy --secondary-* token'],
  [/--tertiary-[\w-]*/g, 'legacy --tertiary-* token'],

  // Component variant tokens
  [/--(?:btn|split-btn|menu-btn|icon-btn)-(?:primary|secondary|tertiary)-[\w-]*/g,
    'legacy component variant token (use -filled-/-outlined-/-soft-)'],

  // HTML data attributes (legacy variant values)
  [/data-variant="(primary|secondary|tertiary)"/g,
    'legacy data-variant value (use filled|outlined|soft)'],
  [/data-ctrl-role="primary"/g, 'legacy data-ctrl-role="primary" (use brand)'],
  [/data-role="primary"/g, 'legacy data-role="primary" (use brand)'],

  // Visible labels in role contexts
  [/data-ctrl-role="brand"[^>]*>Primary</g, 'role pill labeled "Primary" (use Brand)'],
  [/<option value="brand"[^>]*>Primary</g, 'option labeled "Primary" with value=brand'],

  // CSS selectors
  [/\[data-variant=["'](primary|secondary|tertiary)["']\]/g, 'legacy data-variant CSS selector'],

  // Role-list documentation strings (comments, snippets, doc tables)
  // Canonical role list: brand | danger | warning | info | success | neutral
  [/\bprimary\s*\|\s*danger\b/gi, 'role-list comment starts with "primary" (use "brand")'],
  [/\bdanger\s*\|\s*success\s*\|\s*warning\s*\|\s*brand\b/gi, 'role-list duplicates brand+primary (drop "primary")'],

  // Variant-list documentation strings
  // Canonical: filled | outlined | soft | ghost
  [/\bprimary\s*\|\s*secondary\s*\|\s*tertiary\b/gi, 'legacy variant-list (use filled | outlined | soft | ghost)'],

  // data-ctrl-variant in HTML pill bars (button-family only): role names should not appear as variants
  [/data-ctrl-variant="(primary|secondary|tertiary)"/g,
    'data-ctrl-variant uses legacy primary/secondary/tertiary (use filled|outlined|soft)',
    { ext: '.html' }],

  // Visible variant-pill labels: pill button with canonical variant attr but legacy text
  [/data-ctrl-variant="(filled|outlined|soft|ghost)"[^>]*>(Primary|Secondary|Tertiary)</g,
    'variant pill labeled with legacy "Primary/Secondary/Tertiary" (use Filled/Outlined/Soft)',
    { ext: '.html' }],

  // pg-variant-label legacy text
  [/<span class="pg-variant-label">(Primary|Secondary|Tertiary)</g,
    'pg-variant-label uses legacy term (use Filled/Outlined/Soft)',
    { ext: '.html' }],

  // Hardcoded "Primary" UI strings in JS (Color Editor template literals)
  [/['"](?:from |Auto-derived from )Primary[^'"]*['"]/g,
    'JS UI string says "Primary" (use "Brand")'],

  // State-suffix vocabulary: pressed state must use -pressed (matches semantic + Figma + sync server).
  // The CSS pseudo-class :active stays as-is; only the TOKEN NAME suffix is constrained.
  // See docs/decisions/naming-charter.md.
  [/--[a-z][a-z0-9-]+-active(?![a-z0-9-])/g,
    'token uses legacy -active suffix (use -pressed; see naming-charter.md)',
    { ext: '.css' }],
  [/--[a-z][a-z0-9-]+-active(?![a-z0-9-])/g,
    'token uses legacy -active suffix (use -pressed; see naming-charter.md)',
    { ext: '.html' }],

  // Variant vocabulary: "outline" → "outlined". See naming-charter.md §3.
  // Forbid the HTML attribute value, the CSS selector, and the variant token prefix.
  // Exclusions: focus-outline-*, component-outline-*, cm-outline-*, and
  // CSS focus-ring properties (-outline-style|width|offset|color).
  [/data-variant="outline"/g,
    'legacy data-variant="outline" (use "outlined"; see naming-charter.md)'],
  [/data-ctrl-variant="outline"/g,
    'legacy data-ctrl-variant="outline" (use "outlined")',
    { ext: '.html' }],
  [/\[data-variant="outline"\]/g,
    'legacy CSS selector [data-variant="outline"] (use "outlined")',
    { ext: '.css' }],
  [/(?<!focus|component|cm)-outline-(?!style|width|offset|color)(bg|fg|border|opacity|box|track|thumb|fill|content)/g,
    'token uses legacy -outline- variant segment (use -outlined-; see naming-charter.md)',
    { ext: '.css' }],

  // State vocabulary: "error" → "invalid". See naming-charter.md §State.
  // Token-name suffix everywhere.
  [/(?<=[a-z0-9])-error(?=[-)\s,:;"'\]}])/g,
    'token uses legacy -error suffix (use -invalid; see naming-charter.md §State)'],
  // CSS selector hook
  [/\[data-error(="[^"]*")?\]/g,
    'legacy [data-error] CSS selector (use [aria-invalid="true"])',
    { ext: '.css' }],
  // HTML attribute
  [/\bdata-error="[^"]*"/g,
    'legacy data-error="..." HTML attribute (use aria-invalid="...")',
    { ext: '.html' }],
  // JS dataset accessor
  [/\.dataset\.error\b/g,
    'legacy el.dataset.error JS access (use el.getAttribute/setAttribute("aria-invalid", ...))'],

  // Charter §State mandates aria-invalid="true" — `data-invalid` is NOT canonical.
  // Catches both selectors and HTML attributes.
  [/\[data-invalid(="[^"]*")?\]/g,
    'non-canonical [data-invalid] selector (use [aria-invalid="true"]; see naming-charter.md)',
    { ext: '.css' }],
  [/\bdata-invalid(?=[\s>/="])/g,
    'non-canonical data-invalid HTML attribute (use aria-invalid="true")',
    { ext: '.html' }],
  [/\.dataset\.invalid\b/g,
    'non-canonical el.dataset.invalid (use el.getAttribute("aria-invalid"))'],
  [/['"]data-invalid['"]/g,
    'non-canonical "data-invalid" string in JS (use "aria-invalid")',
    { ext: '.js' }],
];

const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (SKIP.test(full)) continue;
    if (entry.isDirectory()) walk(full);
    else if (EXTS.has(path.extname(entry.name))) scan(full);
  }
}

function scan(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const ext = path.extname(file);
  for (const rule of RULES) {
    const [pattern, msg, opts] = rule;
    if (opts && opts.ext && opts.ext !== ext) continue;
    const re = new RegExp(pattern.source, pattern.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      const lineNo = text.slice(0, m.index).split('\n').length;
      violations.push({
        file: path.relative(ROOT, file),
        line: lineNo,
        match: m[0].slice(0, 80),
        msg,
        context: lines[lineNo - 1].trim().slice(0, 120),
      });
    }
  }
}

// Dedup pill counts: every demo should have exactly one Brand role pill
function checkBrandPillUniqueness() {
  const demoDir = path.join(ROOT, 'demo');
  for (const f of fs.readdirSync(demoDir)) {
    if (!f.endsWith('.html')) continue;
    const text = fs.readFileSync(path.join(demoDir, f), 'utf8');
    const matches = text.match(/data-ctrl-role="brand"[^>]*>Brand</g) || [];
    if (matches.length > 1) {
      violations.push({
        file: `demo/${f}`,
        line: 0,
        match: `${matches.length} Brand pills`,
        msg: 'duplicate Brand role pill',
        context: '',
      });
    }
  }
}

for (const d of SCAN_DIRS) {
  const full = path.join(ROOT, d);
  if (fs.existsSync(full)) walk(full);
}
checkBrandPillUniqueness();

if (violations.length === 0) {
  console.log('✅ Naming audit passed — no legacy primary/secondary/tertiary names found.');
  process.exit(0);
}

console.log(`❌ Naming audit found ${violations.length} violation(s):\n`);
const byFile = {};
for (const v of violations) (byFile[v.file] ||= []).push(v);
for (const [file, vs] of Object.entries(byFile)) {
  console.log(`  ${file}`);
  for (const v of vs) {
    console.log(`    L${v.line}  [${v.msg}]`);
    console.log(`           → ${v.match}`);
  }
  console.log();
}
process.exit(1);
