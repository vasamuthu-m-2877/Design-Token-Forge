#!/usr/bin/env node
/**
 * One-shot rename: state "error" -> "invalid" (per naming-charter.md §State).
 *
 * Two related changes that must ship together to avoid mid-flight drift:
 *
 *   PASS A — Token-name suffix `-error` -> `-invalid`
 *     `--checkbox-box-border-color-error`         -> `--checkbox-box-border-color-invalid`
 *     `--checkbox-box-bg-on-error-hover`          -> `--checkbox-box-bg-on-invalid-hover`
 *     `var(--input-border-color-error)`           -> `var(--input-border-color-invalid)`
 *     (incl. yaml token refs and tokens.json sidecar entries)
 *
 *   PASS B — HTML/CSS attribute hook `data-error` -> `aria-invalid="true"`
 *     `[data-error]` selector                     -> `[aria-invalid="true"]`
 *     `<input data-error="true">` HTML            -> `<input aria-invalid="true">`
 *     `el.dataset.error = '...'` JS               -> `el.setAttribute('aria-invalid', '...')`
 *     `el.removeAttribute('data-error')` JS       -> `el.removeAttribute('aria-invalid')`
 *
 * What we DON'T touch:
 *   - Strings containing `error` that aren't tokens/attrs (console.error, error messages,
 *     JS try/catch err variables, etc.). Regexes are bounded so prose stays intact.
 *   - Status role `--danger-*` (charter: invalid is a STATE, danger is the ROLE).
 *
 * Run from repo root:
 *   node scripts/rename-error-invalid.cjs --dry      # preview
 *   node scripts/rename-error-invalid.cjs            # write
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY  = process.argv.includes('--dry');

const SCAN_DIRS = ['demo', 'packages/components/src', 'packages/tokens/src', 'specs', 'docs/components'];
const EXTS = new Set(['.html', '.css', '.js', '.json', '.yaml', '.yml']);
const SKIP = /node_modules|dist|\.git|playwright-report|test-results|\.old$|\.prev$|\.backup$/;

/* ── PASS A — token-name `-error` -> `-invalid` ────────────────
 * Matches `-error` only when preceded by an identifier char (so it must be a
 * suffix on a longer name like `-color-error` or `-bg-on-error`), and only
 * when followed by `-`, end-of-name boundary characters, or end of identifier.
 * Boundary chars: `)` `,` `:` whitespace `;` `"` `'` `]`
 * This protects: standalone word "error" in prose, console.error, etc.
 * It also protects: --danger- (the role), errno, etc.
 */
const TOKEN_ERROR_RE = /(?<=[a-z0-9])-error(?=[-)\s,:;"'\]}])/g;

/* ── PASS B regexes ──────────────────────────────────────────── */
// HTML/CSS attribute selectors and literal attribute usage
const ATTR_SELECTOR_RE = /\[data-error(="[^"]*")?\]/g;        // [data-error]  or  [data-error="true"]
const ATTR_HTML_RE     = /\bdata-error="([^"]*)"/g;            // data-error="..."  in HTML/JSX
const ATTR_HTML_BARE   = /\bdata-error(?=[\s>])/g;             // data-error  with no value (HTML)

// JS dataset / setAttribute / removeAttribute / getAttribute / hasAttribute
const JS_DATASET_RE        = /\.dataset\.error\b/g;
const JS_SETATTR_RE        = /\.setAttribute\(\s*(['"])data-error\1/g;
const JS_REMOVEATTR_RE     = /\.removeAttribute\(\s*(['"])data-error\1\s*\)/g;
const JS_GETATTR_RE        = /\.getAttribute\(\s*(['"])data-error\1\s*\)/g;
const JS_HASATTR_RE        = /\.hasAttribute\(\s*(['"])data-error\1\s*\)/g;
const JS_TOGGLEATTR_RE     = /\.toggleAttribute\(\s*(['"])data-error\1/g;

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
  const ext = path.extname(file);

  /* ── PASS A — token suffix everywhere ─────────────────────── */
  text = text.replace(TOKEN_ERROR_RE, '-invalid');

  /* ── PASS B — attribute hook ──────────────────────────────── */
  // Selectors:  [data-error] -> [aria-invalid="true"]
  //             [data-error="false"] -> [aria-invalid="false"]
  text = text.replace(ATTR_SELECTOR_RE, (_m, val) => {
    if (!val) return '[aria-invalid="true"]';
    // val = '="true"' or '="false"' etc. Pass value through.
    return `[aria-invalid${val}]`;
  });

  // HTML attr with value:  data-error="true" -> aria-invalid="true"
  if (ext === '.html' || ext === '.js') {
    text = text.replace(ATTR_HTML_RE, (_m, v) => `aria-invalid="${v}"`);
    // Bare attribute (rare):  <input data-error> -> <input aria-invalid="true">
    text = text.replace(ATTR_HTML_BARE, 'aria-invalid="true"');
  }

  // JS dataset.error -> use semantic attribute access
  // .dataset.error = 'x'  -> .setAttribute('aria-invalid', 'x')   (handled by JS regexes below first)
  // bare .dataset.error read: el.dataset.error  ->  el.getAttribute('aria-invalid')
  if (ext === '.js') {
    text = text.replace(JS_SETATTR_RE,    '.setAttribute($1aria-invalid$1');
    text = text.replace(JS_REMOVEATTR_RE, ".removeAttribute($1aria-invalid$1)");
    text = text.replace(JS_GETATTR_RE,    ".getAttribute($1aria-invalid$1)");
    text = text.replace(JS_HASATTR_RE,    ".hasAttribute($1aria-invalid$1)");
    text = text.replace(JS_TOGGLEATTR_RE, '.toggleAttribute($1aria-invalid$1');
    // dataset.error pattern — replace last, conservatively
    text = text.replace(JS_DATASET_RE, ".getAttribute('aria-invalid')");
  }

  if (text !== before) {
    const diffCount = countDiffs(before, text);
    fileChanges.push({ file: path.relative(ROOT, file), edits: diffCount });
    changed++;
    if (!DRY) fs.writeFileSync(file, text);
  }
}

function countDiffs(a, b) {
  // crude — count differing 64-char chunks. Good enough for a summary.
  if (a === b) return 0;
  let i = 0, hits = 0;
  while (i < Math.max(a.length, b.length)) {
    const ca = a.slice(i, i + 64), cb = b.slice(i, i + 64);
    if (ca !== cb) hits++;
    i += 64;
  }
  return hits;
}

for (const d of SCAN_DIRS) walk(path.join(ROOT, d));

console.log(`\nrename-error-invalid: ${DRY ? 'DRY RUN — no writes' : 'WROTE files'}`);
console.log(`  scanned: ${scanned}    changed: ${changed}`);
if (fileChanges.length) {
  console.log('\nFiles changed:');
  fileChanges.sort((a, b) => b.edits - a.edits).forEach(({ file, edits }) => {
    console.log(`  ${edits.toString().padStart(3)} edits   ${file}`);
  });
}
console.log('');
