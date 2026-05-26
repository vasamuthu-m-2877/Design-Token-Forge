#!/usr/bin/env node
/**
 * One-shot rename: variant "outline" -> "outlined".
 *
 * Scope:
 *   1. HTML attribute values:   data-variant="outline"      -> data-variant="outlined"
 *                               data-ctrl-variant="outline" -> data-ctrl-variant="outlined"
 *   2. CSS selectors:           [data-variant="outline"]    -> [data-variant="outlined"]
 *                               [data-ctrl-variant="outline"] -> [data-ctrl-variant="outlined"]
 *   3. CSS custom-property names that contain `-outline-` as the variant segment,
 *      and var() consumers of same. We rewrite `-outline-` -> `-outlined-` EXCEPT
 *      when the preceding word is one of the legitimate property prefixes:
 *        focus-outline    (CSS focus ring)
 *        component-outline (semantic visible-neutral border)
 *   4. specs/components/*.yaml: variants list values "outline" -> "outlined"
 *      and token references --*-outline-* (same exclusions).
 *   5. tokens.json sidecars: string values "outline" inside variants arrays.
 *
 * What we DON'T touch:
 *   - CSS property `outline`, `outline-offset`, `outline-width`, `outline-style`,
 *     `outline-color` (these never contain a leading hyphen in our regex)
 *   - Tooltip / slider role-shaped variants
 *
 * Run from repo root: node scripts/rename-variant-outline.cjs [--dry]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY  = process.argv.includes('--dry');

const SCAN_DIRS = ['demo', 'packages/components/src', 'packages/tokens/src', 'specs', 'docs/components'];
const EXTS = new Set(['.html', '.css', '.js', '.json', '.yaml', '.yml']);
const SKIP = /node_modules|dist|\.git|playwright-report|test-results|\.old$|\.prev$|\.backup$/;

// Variable lookbehind supported in Node 10+
// Exclude:
//   focus-outline-     (focus ring tokens)
//   component-outline- (semantic visible-neutral border)
//   cm-outline-        (surface container-modifier outline)
// Exclude when followed by focus-ring CSS property names (style/width/offset/color).
const TOKEN_RE = /(?<!focus|component|cm)-outline-(?!style|width|offset|color)/g;

const REPLACEMENTS = [
  // HTML attribute values (literal strings, safe)
  [/data-variant="outline"/g,       'data-variant="outlined"'],
  [/data-ctrl-variant="outline"/g,  'data-ctrl-variant="outlined"'],
  // CSS selectors
  [/\[data-variant="outline"\]/g,      '[data-variant="outlined"]'],
  [/\[data-ctrl-variant="outline"\]/g, '[data-ctrl-variant="outlined"]'],
  // Token names + var() consumers (the lookbehind protects focus-outline-* and component-outline-*)
  [TOKEN_RE, '-outlined-'],
];

const YAML_VARIANT_LIST_LINE = /^(\s*-\s*)outline(\s*(?:#.*)?)$/gm; // bullet item in variants:
const JSON_STRING_OUTLINE    = /"outline"/g;

let changed = 0, scanned = 0;
const fileChanges = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (SKIP.test(full)) continue;
    if (e.isDirectory()) walk(full);
    else if (EXTS.has(path.extname(e.name))) processFile(full);
  }
}

function processFile(file) {
  scanned++;
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  const ext = path.extname(file);

  for (const [re, rep] of REPLACEMENTS) {
    text = text.replace(re, rep);
  }

  // YAML: variants:\n  - outline  ->  - outlined  (only in variant-list bullets)
  if (ext === '.yaml' || ext === '.yml') {
    // Only inside a `variants:` block — scope by finding the block
    text = text.replace(/(\bvariants:[^\n]*\n(?:\s*-[^\n]*\n)*)/g, (block) =>
      block.replace(YAML_VARIANT_LIST_LINE, '$1outlined$2')
    );
  }

  // JSON: only touch "outline" strings that appear in known variant arrays
  if (ext === '.json' && /tokens\.json$/.test(file)) {
    // narrow: only in lines containing variantsSupported / variants
    text = text.replace(/("variants(?:Supported)?"\s*:\s*\[[^\]]*\])/g, (arr) =>
      arr.replace(JSON_STRING_OUTLINE, '"outlined"')
    );
  }

  if (text !== before) {
    const diffCount = countDiffs(before, text);
    fileChanges.push({ file: path.relative(ROOT, file), edits: diffCount });
    changed++;
    if (!DRY) fs.writeFileSync(file, text);
  }
}

function countDiffs(a, b) {
  // crude: count number of substitutions by re-running each pattern on `a`
  let n = 0;
  for (const [re] of REPLACEMENTS) {
    const m = a.match(new RegExp(re.source, re.flags));
    if (m) n += m.length;
  }
  return n;
}

for (const d of SCAN_DIRS) {
  const full = path.join(ROOT, d);
  if (fs.existsSync(full)) walk(full);
}

console.log(`${DRY ? '[DRY RUN] ' : ''}Scanned ${scanned} files, modified ${changed}.`);
for (const c of fileChanges.sort((a, b) => b.edits - a.edits)) {
  console.log(`  ${c.edits.toString().padStart(4)}  ${c.file}`);
}
if (DRY) console.log('\nRun without --dry to apply.');
