const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });

  console.log('### DESKTOP 1440');
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);

  const flag = await page.locator('.cz-flag').count();
  const heroImg = await page.locator('img[src^="/hero/"]').count();
  const strip = await page.locator('text=Made in India').count();
  const searchInHeader = await page.locator('header input[aria-label="Search Cronyzo"]').count();
  const stats = await page.locator('text=live courses').count();
  const pillars = await page.locator('text=Everything a learner actually needs').count();
  const popular = await page.locator('text=Popular:').count();
  console.log('  flag:', flag, '| hero images:', heroImg, '| strip:', strip);
  console.log('  header search:', searchInHeader, '| stats:', stats, '| pillars heading:', pillars, '| popular tags:', popular);

  // Sign in CTA uniqueness
  const headerText = await page.locator('header').innerText();
  console.log('  header has "Sign in":', headerText.includes('Sign in'), '| has "Get started":', headerText.includes('Get started'));

  await page.screenshot({ path: '/home/user/cronyzo/docs/screens/30-landing-desktop.png', fullPage: false });
  await page.screenshot({ path: '/home/user/cronyzo/docs/screens/31-landing-full.png', fullPage: true });

  console.log('\n### MOBILE 390');
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  const mErrors = [];
  m.on('console', (x) => { if (x.type() === 'error') mErrors.push(x.text().slice(0, 160)); });
  m.on('pageerror', (e) => mErrors.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await m.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  await m.waitForTimeout(2000);
  const bottomNav = await m.locator('nav[aria-label="Bottom navigation"]').count();
  const bottomButtons = await m.locator('nav[aria-label="Bottom navigation"] button').count();
  const labels = await m.locator('nav[aria-label="Bottom navigation"] button').allInnerTexts();
  console.log('  bottom nav:', bottomNav, '| buttons:', bottomButtons, '| labels:', labels.join(', '));
  await m.screenshot({ path: '/home/user/cronyzo/docs/screens/32-landing-mobile.png', fullPage: false });

  // mobile search overlay
  await m.locator('nav[aria-label="Bottom navigation"] button', { hasText: 'Search' }).click();
  await m.waitForTimeout(700);
  const overlay = await m.locator('text=Search Cronyzo').count();
  console.log('  search overlay opens:', overlay);
  await m.screenshot({ path: '/home/user/cronyzo/docs/screens/33-mobile-search.png' });

  console.log('\n### LOGIN');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const googleBtn = await page.locator('button:has-text("Continue with Google")').count();
  const dashBtn = await page.locator('text=Go to dashboard').count();
  console.log('  google button:', googleBtn, '| dashboard shortcut:', dashBtn);
  await page.screenshot({ path: '/home/user/cronyzo/docs/screens/34-login-google.png' });

  console.log('\n### ERRORS (desktop)');
  console.log(errors.length ? errors.slice(0, 10).join('\n') : '  none 🎉');
  console.log('### ERRORS (mobile)');
  console.log(mErrors.length ? mErrors.slice(0, 10).join('\n') : '  none 🎉');

  await browser.close();
})();
