/**
 * Build script for @design-token-forge/foundation-mobile
 * Mirrors packages/components/build.mjs
 *   1. All-in-one dist/index.css (from src/index.css)
 *   2. Per-pattern dist/{name}/index.css bundles
 */
import { readdir, stat, writeFile, mkdir, unlink } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const SRC = 'src';
const DIST = 'dist';

execSync(`rm -rf ${DIST}`);
await mkdir(DIST, { recursive: true });

console.log('  src/index.css → dist/index.css');
execSync(`npx postcss ${SRC}/index.css --no-map -o ${DIST}/index.css`, { stdio: 'inherit' });

const entries = await readdir(SRC);
let count = 0;

for (const entry of entries) {
  const srcDir = join(SRC, entry);
  const s = await stat(srcDir);
  if (!s.isDirectory()) continue;

  const outDir = join(DIST, entry);
  await mkdir(outDir, { recursive: true });

  const hasIndex = await stat(join(srcDir, 'index.css')).then(() => true, () => false);
  const name = entry;

  let inputFile;
  let tmpEntry;
  if (hasIndex) {
    inputFile = join(srcDir, 'index.css');
  } else {
    tmpEntry = join(srcDir, '_entry.tmp.css');
    await writeFile(tmpEntry, `@import './${name}.tokens.css';\n@import './${name}.css';\n`);
    inputFile = tmpEntry;
  }

  const outFile = join(outDir, 'index.css');
  console.log(`  ${inputFile} → ${outFile}`);
  execSync(`npx postcss ${inputFile} --no-map -o ${outFile}`, { stdio: 'inherit' });

  if (tmpEntry) await unlink(tmpEntry);
  count++;
}

console.log(`\n✔ Built ${count} foundation pattern${count === 1 ? '' : 's'}.`);
