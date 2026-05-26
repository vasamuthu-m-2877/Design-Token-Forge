#!/usr/bin/env node
/**
 * Corrective sweep: `data-invalid` -> `aria-invalid="true"`.
 *
 * Background: The first pass of rename-error-invalid.cjs had an ordering bug —
 * the generic TOKEN_ERROR_RE `(?<=[a-z0-9])-error(?=[-)\s,:;"'\]}])`
 * matched the `-error` segment of `data-error` (since `]`, ` `, etc. are in
 * the boundary set) BEFORE the dedicated attribute-conversion passes could
 * convert `[data-error]` -> `[aria-invalid="true"]`.
 *
 * Result: 93 sites ended up as `data-invalid` / `[data-invalid]` instead of
 * the charter-canonical `aria-invalid="true"` / `[aria-invalid="true"]`.
 *
 * This script reverses that. `data-invalid` was NEVER a charter convention
 * (verified vs `git show HEAD` — zero pre-sweep hits), so every occurrence
 * is by definition the bug.
 *
 * Run from repo root:
 *   node scripts/fix-data-invalid-to-aria.cjs --dry
 *   node scripts/fix-data-invalid-to-aria.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY  = process.argv.includes('--dry');

const SCAN_DIRS = ['demo', 'packages/components/src', 'packages/tokens/src', 'specs', 'docs/components'];
const EXTS = new Set(['.html', '.css', '.js', '.json', '.yaml', '.yml']);
const SKIP = /node_modules|dist|\.git|playwright-report|test-results|\.old$|\.prev$|\.backup$/;

// Order matters: most specific first.
const REPLACEMENTS = [
  // CSS selector with explicit value:  [data-invalid="x"]  ->  [aria-invalid="x"]
  [/\[data-invalid(="[^"]*")\]/g, '[aria-invalid$1]'],
  // CSS selector bare:                 [data-invalid]       ->  [aria-invalid="true"]
  [/\[data-invalid\]/g,           '[aria-invalid="true"]'],

  // JS attribute methods
  [/\.setAttribute\(\s*(['"])data-invalid\1/g,    '.setAttribute($1aria-invalid$1'],
  [/\.removeAttribute\(\s*(['"])data-invalid\1\s*\)/g, '.removeAttribute($1aria-invalid$1)'],
  [/\.getAttribute\(\s*(['"])data-invalid\1\s*\)/g,    '.getAttribute($1aria-invalid$1)'],
  [/\.hasAttribute\(\s*(['"])data-invalid\1\s*\)/g,    '.hasAttribute($1aria-invalid$1)'],
  [/\.toggleAttribute\(\s*(['"])data-invalid\1/g, '.toggleAttribute($1aria-invalid$1'],
  [/\.dataset\.invalid\b/g, ".getAttribute('aria-invalid')"],

  // HTML attribute with value:        data-invalid="x"     ->  aria-invalid="x"
  [/\bdata-invalid="([^"]*)"/g, 'aria-invalid="$1"'],
  // HTML attribute bare (must be followed by whitespace, `>`, or `/`):
  //   <div data-invalid>             ->  <div aria-invalid="true">
  //   <div data-invalid style="…">   ->  <div aria-invalid="true" style="…">
  [/\bdata-invalid(?=[\s>/])/g, 'aria-invalid="true"'],
];

let scanned = 0, changed = 0;
const fileChanges = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
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
  let edits = 0;
  for (const [re, rep] of REPLACEMENTS) {
    const prev = text;
    text = text.replace(re, rep);
    if (text !== prev) {
      // Count: a crude diff — number of substitutions in this pattern
      const m = prev.match(re);
      if (m) edits += m.length;
    }
  }
  if (text !== before) {
    fileChanges.push({ file: path.relative(ROOT, file), edits });
    changed++;
    if (!DRY) fs.writeFileSync(file, text);
  }
}

for (const d of SCAN_DIRS) walk(path.join(ROOT, d));

console.log(`\nfix-data-invalid-to-aria: ${DRY ? 'DRY RUN — no writes' : 'WROTE files'}`);
console.log(`  scanned: ${scanned}    changed: ${changed}`);
if (fileChanges.length) {
  console.log('\nFiles changed:');
  fileChanges.sort((a, b) => b.edits - a.edits).forEach(({ file, edits }) => {
    console.log(`  ${edits.toString().padStart(3)} replacements   ${file}`);
  });
}
console.log('');
