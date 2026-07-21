const { chromium } = require('playwright-core');
(async () => {
  const cp = require('child_process');
  const exe = cp.execSync("find /opt/pw-browsers -path '*chrome-linux/chrome' | head -1").toString().trim();
  const b = await chromium.launch({ executablePath: exe, args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:1280,height:820} });
  await p.goto('http://localhost:8199/', { waitUntil:'networkidle' });
  await p.waitForTimeout(700);
  await p.screenshot({ path:'scratch_hero_v2.png' });
  await b.close(); console.log('ok');
})().catch(e=>{console.error(e.message);process.exit(1);});
