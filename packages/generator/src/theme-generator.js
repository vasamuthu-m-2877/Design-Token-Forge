/**
 * Design Token Forge — Theme Generator
 *
 * Input:  one hex color
 * Output: a complete CSS override file that rebrands the entire system
 */
import { generatePalette, certifyPalette, STEP_NAMES } from './palette-engine.js';
import { writeFile } from 'node:fs/promises';

/**
 * Generate a CSS palette block for one role
 * @param {string} roleName - Token prefix (e.g., 'brand', 'primary')
 * @param {{ name: string, hex: string }[]} steps - Palette steps
 * @returns {string} CSS text
 */
function paletteToCss(roleName, steps) {
  return steps.map(step =>
    `  --prim-${roleName}-${step.name}: ${step.hex};`
  ).join('\n');
}

/**
 * Generate a complete brand theme CSS file
 * @param {{ color: string, name?: string, output?: string }} options
 */
export async function generateTheme({ color, name, output = './brand-theme.css' }) {
  // Validate hex
  const hexMatch = color.match(/^#?([0-9a-fA-F]{6})$/);
  if (!hexMatch) {
    throw new Error(`Invalid hex color: "${color}". Expected format: #RRGGBB`);
  }
  const hex = `#${hexMatch[1]}`;

  // Generate the 21-step palette
  const result = generatePalette(hex);
  const cert = certifyPalette(result);
  const steps = result.steps;

  if (!cert.pass) {
    console.warn(`⚠️  Palette has contrast warnings:`);
    cert.failures.forEach(f => console.warn(`   ${f}`));
  }

  // Build CSS
  const selector = name ? `[data-product="${name}"]` : ':root';
  const date = new Date().toISOString();

  const css = `/* ════════════════════════════════════════════════════════════════
   Design Token Forge — Brand Theme${name ? `: ${name}` : ''}
   Generated from: ${hex}
   Date: ${date}
   ════════════════════════════════════════════════════════════════ */

${selector} {
  /* ── Brand Palette (${steps.length} steps) ── */
${paletteToCss('brand', steps)}
}
`;

  await writeFile(output, css, 'utf8');

  console.log(`✓ Theme generated: ${output}`);
  console.log(`  Brand color: ${hex}`);
  console.log(`  Selector: ${selector}`);
  console.log(`  Steps: ${steps.length}`);
  console.log(`  WCAG certified: ${cert.pass ? 'yes' : 'warnings (see above)'}`);
}
