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
