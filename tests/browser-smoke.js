const { chromium } = require('/tmp/giftagram-pw/node_modules/playwright-core');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page = await browser.newPage({viewport:{width:1440,height:1100}, deviceScaleFactor:1});
  const errors=[];
  page.on('console',m=>{ if(m.type()==='error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});

  assert.equal(await page.locator('#modelKpis .kpi').count(),5);
  const before=await page.locator('#modelKpis .kpi').nth(4).textContent();
  await page.locator('[data-model="reactivation.unitsPerMonth"]').fill('2000');
  const after=await page.locator('#modelKpis .kpi').nth(4).textContent();
  assert.notEqual(before,after,'revenue output should react to TOF input');
  await page.locator('[data-period="12"]').click();
  assert.equal(await page.locator('#periodLabel').textContent(),'12 months');
  await page.screenshot({path:'/tmp/giftagram-model-desktop.png',fullPage:true});

  await page.locator('[data-view="goal"]').click();
  await page.locator('#goalRevenue').fill('500000');
  assert.match(await page.locator('#goalFormula').textContent(),/Required monthly TOF volume/);

  await page.locator('[data-view="segment"]').click();
  await page.locator('#sampleCsv').click();
  assert.equal(await page.locator('#segmentWorkspace').isVisible(),true);
  const counts=await page.locator('#segmentCounts .count b').allTextContents();
  assert.equal(counts.map(Number).reduce((a,b)=>a+b,0),8);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#downloadSegmented').click();
  const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'giftagram-hubspot-segments.csv');
  await page.screenshot({path:'/tmp/giftagram-segment-desktop.png',fullPage:true});

  await page.locator('[data-view="signal"]').click();
  await page.locator('#loadAzz').click();
  assert.match(await page.locator('#sigBrief').textContent(),/AZZ Inc\./);
  assert.ok(Number(await page.locator('#sigScore').textContent())>=50);

  await page.locator('[data-view="campaign"]').click();
  await page.locator('#cellBuyer').fill('VP, People Operations');
  assert.match(await page.locator('#cellOutput').textContent(),/VP, People Operations/);

  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-view="model"]').click();
  await page.screenshot({path:'/tmp/giftagram-model-mobile.png',fullPage:true});
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({status:'PASS',initialRevenue:before.trim(),updatedRevenue:after.trim(),segmentCounts:counts,signalScore:await page.locator('#sigScore').textContent(),consoleErrors:errors},null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
