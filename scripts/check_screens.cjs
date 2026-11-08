const { chromium } = require("playwright");
const fs = require("fs");

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = "/home/user/cronyzo/docs/screens";
fs.mkdirSync(OUT, { recursive: true });

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`  saved ${name}.png`);
};

// main-content text, excluding sidebar/bottom-nav chrome
const mainText = (page) =>
  page.evaluate(() => {
    const m = document.querySelector("main") || document.querySelector("#root");
    return (m ? m.innerText : document.body.innerText).replace(/\s+/g, " ").trim();
  });

async function login(page, email, password) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();

  // ── Public pages ────────────────────────────────────────────────
  for (const [path, name] of [
    ["/", "01-landing"],
    ["/courses", "02-courses"],
    ["/books", "03-books"],
    ["/shop", "04-shop"],
    ["/stores", "05-stores"],
    ["/sell", "06-sell"],
  ]) {
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1200);
    await shot(page, name);
  }

  // ── Legal (must be public now) ──────────────────────────────────
  await page.goto(BASE + "/terms", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const onLogin = await page.locator('input[type="password"]').count();
  console.log(`\n/terms -> password-field present? ${onLogin > 0 ? "YES (still guarded!)" : "no (public ✓)"}`);
  await shot(page, "07-terms");

  // ── Student journey ─────────────────────────────────────────────
  await login(page, "student@examos.local", "student123");
  await page.goto(BASE + "/cart", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  console.log("\nCART:\n  " + (await mainText(page)).slice(0, 700));
  await shot(page, "08-cart");

  await page.goto(BASE + "/checkout", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  console.log("\nCHECKOUT:\n  " + (await mainText(page)).slice(0, 800));
  await shot(page, "09-checkout");

  await page.goto(BASE + "/my-courses", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  console.log("\nMY COURSES:\n  " + (await mainText(page)).slice(0, 500));
  await shot(page, "10-my-courses");

  await page.goto(BASE + "/orders", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  console.log("\nORDERS:\n  " + (await mainText(page)).slice(0, 600));
  await shot(page, "11-orders");

  // ── Seller journey ──────────────────────────────────────────────
  await page.evaluate(() => localStorage.clear());
  await login(page, "seller@examos.local", "seller123");
  await page.goto(BASE + "/sell/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  console.log("\nSELLER DASHBOARD:\n  " + (await mainText(page)).slice(0, 900));
  await shot(page, "12-seller-dashboard");

  await page.goto(BASE + "/sell/earnings", { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  console.log("\nEARNINGS:\n  " + (await mainText(page)).slice(0, 800));
  await shot(page, "13-earnings");

  await page.goto(BASE + "/sell/products", { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  console.log("\nSELL PRODUCTS:\n  " + (await mainText(page)).slice(0, 600));
  await shot(page, "14-sell-products");

  await page.goto(BASE + "/sell/products/new", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  console.log("\nCREATE PRODUCT:\n  " + (await mainText(page)).slice(0, 600));
  await shot(page, "15-create-product");

  await page.goto(BASE + "/sell/courses/new", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  console.log("\nCREATE COURSE:\n  " + (await mainText(page)).slice(0, 600));
  await shot(page, "16-create-course");

  await browser.close();
  console.log("\nDONE");
})();
