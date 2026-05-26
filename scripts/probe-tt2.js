const { chromium } = require('@playwright/test');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newContext({ viewport:{width:1440,height:800}}).then(c=>c.newPage());
  await p.addInitScript(()=>{localStorage.setItem('dtf-gh-pat','x');localStorage.setItem('dtf-gh-user','p');localStorage.setItem('dtf-session-epoch','2');sessionStorage.setItem('dtf-auth-ok','1');});
  await p.goto('file://'+path.resolve('demo/editor-v2/index.html'));
  await p.click('button.ev2-tier[data-tier="tt"]');
  await p.waitForSelector('#ttStickyMount .ev2-typo-install-sticky');
  console.log(await p.evaluate(()=>{
    const lb = document.getElementById('tokenListBody').getBoundingClientRect();
    const sm = document.getElementById('ttStickyMount').getBoundingClientRect();
    const dens = document.querySelectorAll('.ev2-typo-section')[1].getBoundingClientRect();
    return JSON.stringify({listBody:lb,stickyMount:sm,density:dens},null,2);
  }));
  await p.screenshot({path:'scripts/tt-1440x800.png'});
  await b.close();
})();
