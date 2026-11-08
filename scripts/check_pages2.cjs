const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5173';

const PUBLIC = ['/', '/courses', '/books', '/shop', '/stores', '/sell', '/login', '/register',
  '/help', '/contact', '/about', '/terms', '/privacy', '/refund'];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let fails = 0;

  for (const path of PUBLIC) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 120)));
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().includes('/favicon')) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 90)}`);
    });
    let status = 0;
    try {
      const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
      status = res ? res.status() : 0;
      await page.waitForTimeout(900);
    } catch (e) {
      errors.push('NAV: ' + e.message.slice(0, 80));
    }
    const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 90);
    const ok = status === 200 && errors.length === 0;
    if (!ok) fails++;
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${status} ${path.padEnd(12)} ${errors.slice(0,2).join(' | ') || text}`);
    await page.close();
  }

  // Admin + creator surfaces
  const admin = await ctx.newPage();
  await admin.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await admin.fill('input[type="email"]', 'admin@examos.local');
  await admin.fill('input[type="password"]', 'admin123');
  await admin.click('button[type="submit"]');
  await admin.waitForTimeout(2500);
  const adminPaths = ['/admin/site', '/admin/support', '/dashboard', '/chat'];
  for (const path of adminPaths) {
    const errs = [];
    admin.on('pageerror', (e) => errs.push(e.message.slice(0, 100)));
    let st = 0;
    try {
      const r = await admin.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
      st = r ? r.status() : 0;
      await admin.waitForTimeout(1200);
    } catch (e) { errs.push(e.message.slice(0, 80)); }
    const body = (await admin.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 90);
    const ok = st === 200 && errs.length === 0;
    if (!ok) fails++;
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${st} ${path.padEnd(16)} ${errs.slice(0,2).join(' | ') || body}`);
  }

  console.log(fails === 0 ? '\nALL PAGES PASSED' : `\n${fails} FAILURE(S)`);
  await browser.close();
})();
