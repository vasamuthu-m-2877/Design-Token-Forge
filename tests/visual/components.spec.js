// @ts-check
/**
 * Design Token Forge — Visual Regression Test Suite
 *
 * Captures per-section screenshots of every component demo page,
 * then diffs against committed baselines.
 *
 * This catches ANY visual bug — alignment, overflow, clipping,
 * wrong spacing, color issues, font rendering — without manual review.
 *
 * Workflow:
 *   1. First run  → `npm run vrt:update` to create baselines
 *   2. After edits → `npm run vrt` to detect regressions
 *   3. If diff is intentional → `npm run vrt:update` to accept
 */
const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

/* ── Demo directory ────────────────────────────────────────────── */
const DEMO_DIR = path.resolve(__dirname, "../../demo");

/* ── Component demos to test ───────────────────────────────────
   Each component gets:
   • A full-page screenshot (catches layout, spacing, overall look)
   • A per-section screenshot for every <section id="sec-*">
     (granular diffs — pinpoints exactly which section regressed)
   ──────────────────────────────────────────────────────────────── */
const COMPONENTS = [
  "alert",
  "avatar",
  "badge",
  "button",
  "checkbox",
  "datepicker",
  "file-upload",
  "icon-button",
  "input",
  "menu-button",
  "progress-bar",
  "progress-circle",
  "radio",
  "select",
  "slider",
  "split-button",
  "textarea",
  "toast",
  "toggle",
  "tooltip",
];

/* ── Sections to SKIP screenshots for (non-visual / dynamic) ── */
const SKIP_SECTIONS = new Set([
  "sec-framework", // code snippets — text-only, not visual
  "sec-a11y",      // documentation, not visual output
]);

/* ── Helpers ───────────────────────────────────────────────────── */

/**
 * Resolve file:// URL from an HTML filename.
 */
function demoURL(name) {
  return `file://${path.join(DEMO_DIR, name + ".html")}`;
}

/**
 * Bypass auth-gate for local visual snapshots.
 * Must run before page scripts execute.
 */
async function seedAuthState(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("dtf-session-epoch", "2");
      localStorage.setItem("dtf-gh-pat", "ghp_visual_snapshot_token");
      localStorage.setItem("dtf-gh-user", "visual-snapshot");
      localStorage.setItem("dtf-gh-owner", "visual-snapshot");
      sessionStorage.setItem("dtf-auth-ok", "1");
      localStorage.setItem("dtf-active-project", "pearl");
      localStorage.setItem(
        "dtf-known-projects",
        JSON.stringify([{ id: "pearl", name: "Pearl", owner: "visual-snapshot" }])
      );
    } catch (_) {}
  });
}

/**
 * Wait for all demo JS to finish rendering (fonts, dynamic content).
 * Demos use DOMContentLoaded / load handlers to populate sections.
 */
async function waitForDemoReady(page) {
  await page.waitForLoadState("load");
  // Allow any requestAnimationFrame-based rendering to settle
  await page.waitForTimeout(500);
}

/* ── Tests ─────────────────────────────────────────────────────── */

for (const component of COMPONENTS) {
  test.describe(component, () => {
    test(`full page`, async ({ page }) => {
      await seedAuthState(page);
      await page.goto(demoURL(component));
      await waitForDemoReady(page);

      await expect(page).toHaveScreenshot(`${component}-full.png`, {
        fullPage: true,
      });
    });

    test(`sections`, async ({ page }) => {
      await seedAuthState(page);
      await page.goto(demoURL(component));
      await waitForDemoReady(page);

      // Discover all <section id="sec-*"> in the page
      const sections = await page.$$eval(
        'section[id^="sec-"]',
        (els) => els.map((el) => el.id)
      );

      for (const sectionId of sections) {
        if (SKIP_SECTIONS.has(sectionId)) continue;

        const section = page.locator(`#${sectionId}`);
        const isVisible = await section.isVisible();
        if (!isVisible) continue;

        await expect(section).toHaveScreenshot(
          `${component}-${sectionId}.png`,
          {
            // Capture just this section
            animations: "disabled",
          }
        );
      }
    });
  });
}
