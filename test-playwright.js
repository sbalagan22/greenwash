const { chromium } = require('playwright');
const path = require('path');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER CONSOLE ERROR:', msg.text());
    }
  });

  page.on('pageerror', err => {
    console.log('BROWSER PAGE ERROR:', err.message);
  });

  page.on('response', async res => {
    if (res.status() === 500) {
      console.log('NETWORK 500 ERROR ON:', res.url());
      try {
        console.log('BODY:', await res.text());
      } catch (e) {}
    }
  });

  console.log("Navigating...");
  await page.goto('http://localhost:3000');

  console.log("Uploading file...");
  const filePath = path.resolve('test_report.pdf');
  const fileChooserPromise = page.waitForEvent('filechooser');
  
  // Click dropzone
  await page.evaluate(() => {
    const dz = document.querySelector('.upload-zone input');
    if(dz) dz.click();
  });
  
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);

  console.log("Waiting for network response...");
  await page.waitForTimeout(4000);

  await browser.close();
}

run();
