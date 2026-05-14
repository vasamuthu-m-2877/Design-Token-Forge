#!/usr/bin/env node
/**
 * Audit: every var(--<extras-prefix>-N) reference in component .tokens.css
 * MUST resolve to an actual primitive in primitives-numbers. Bad references
 * cause sync-server to silently drop comp-size variables (or, after the
 * recent fix, fall back to literal values + emit a warning).
 *
 * Run:  node scripts/audit-primitive-aliases.cjs
 * Exit: 0 if clean, 1 if any broken references found.
 */
const fs = require('fs');
const path = require('path');

(async () => {
  const m = await import('../packages/sync-server/server.js');
  const data = m.runExport();

  const primSet = new Set();
  for (const c of data.collections) {
    if (c.name === 'primitives-numbers') c.variables.forEach(v => primSet.add(v.name));
  }

  const COMP_DIR = path.join(__dirname, '..', 'packages', 'components', 'src');
  const PFX = ['spacing', 'radius', 'shadow', 'opacity', 'z', 'duration', 'easing'];
  const offenders = [];

  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.tokens.css')) {
        const css = fs.readFileSync(p, 'utf-8');
        const re = /var\(--([a-zA-Z0-9_-]+)\)/g;
        let mm;
        while ((mm = re.exec(css)) !== null) {
          const nm = mm[1];
          const pfx = nm.split('-')[0];
          if (!PFX.includes(pfx)) continue;
          const rest = nm.slice(pfx.length + 1);
          const extras = pfx + '/' + rest;
          if (!primSet.has(extras)) {
            offenders.push(p.replace(/^.*src\//, '') + ' -> var(--' + nm + ')');
          }
        }
      }
    }
  }
  walk(COMP_DIR);

  const uniq = [...new Set(offenders)];
  if (uniq.length === 0) {
    console.log('OK: all component CSS aliases resolve to existing primitives');
    process.exit(0);
  }
  console.error('FAIL: ' + uniq.length + ' broken primitive references:');
  uniq.forEach(o => console.error('  ' + o));
  process.exit(1);
})();
