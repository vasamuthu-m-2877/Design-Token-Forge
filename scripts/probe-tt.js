const { chromium } = require('@playwright/test');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 1440, height: 800 } }).then(c => c.newPage());
  await page.addInitScript(() => {
    localStorage.setItem('dtf-gh-pat','x'); localStorage.setItem('dtf-gh-user','p');
    localStorage.setItem('dtf-session-epoch','2'); sessionStorage.setItem('dtf-auth-ok','1');
  });
  await page.goto('file://' + path.resolve('demo/editor-v2/index.html'));
  await page.click('button.ev2-tier[data-tier="tt"]');
  await page.waitForSelector('.ev2-typo-install-sticky');
  await page.screenshot({ path: 'scripts/tt-1440x800.png' });
  console.log('800h: panel children:');
  console.log(await page.evaluate(() => {
    const panel = document.querySelector('.ev2-typo-panel');
    return Array.from(panel.children).map((el, i) => {
      const r = el.getBoundingClientRect();
      return `  ${i}: ${el.className.split(' ')[0]} top=${Math.round(r.top)} bot=${Math.round(r.bottom)}`;
    }).join('\n');
  }));
  await browser.close();
})();
