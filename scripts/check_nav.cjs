const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:5173";

async function login(page, email, password) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in with email/i }).first().click();
  await page.waitForTimeout(2800);
}

const navText = (page) =>
  page.evaluate(() => {
    const nav = document.querySelector("aside") || document.querySelector("nav");
    return (nav ? nav.innerText : "").replace(/\s+/g, " ");
  });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();

  const cases = [
    ["student", "student@examos.local", "student123"],
    ["seller", "seller@examos.local", "seller123"],
    ["teacher", "teacher@examos.local", "teacher123"],
    ["admin", "admin@examos.local", "admin123"],
  ];

  for (const [label, email, password] of cases) {
    await page.goto(BASE + "/login", { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await login(page, email, password);
    await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const nav = await navText(page);
    const has = (t) => nav.includes(t);
    console.log(`\n### ${label}`);
    console.log(`  Start Selling:   ${has("Start Selling") ? "YES" : "no "}`);
    console.log(`  Seller Studio:   ${has("Seller Studio") ? "YES" : "no "}`);
    console.log(`  List a Product:  ${has("List a Product") ? "YES" : "no "}`);
    console.log(`  Create a Course: ${has("Create a Course") ? "YES" : "no "}`);
    console.log(`  Subjects (admin):${has("Subjects") ? "YES" : "no "}`);
    console.log(`  My Learning:     ${has("My Learning") ? "YES" : "no "}`);
    console.log(`  Cart:            ${has("Cart") ? "YES" : "no "}`);
    console.log(`  Exams:           ${has("Exams") ? "YES" : "no "}`);
  }

  await browser.close();
})();
