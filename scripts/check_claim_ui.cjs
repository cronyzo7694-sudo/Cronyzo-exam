const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:5173";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|DevTools/i.test(m.text()))
      errs.push("CONSOLE " + m.text().slice(0, 160));
  });

  const count = async (re) => (await page.getByText(re).count()) > 0;

  console.log("── signed-out visitor ──");
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  console.log("  guest button shown:      ", (await count(/continue as guest/i)) ? "YES ✓" : "NO ✗");
  console.log("  sign-in form shown:      ", (await count(/sign in with email/i)) ? "YES ✓" : "NO ✗");
  console.log("  claim panel NOT shown:   ", !(await count(/guest session/i)) ? "YES ✓" : "NO ✗");
  await page.screenshot({ path: "/home/user/cronyzo/docs/screens/23-login-signedout.png" });

  console.log("\n── guest session ──");
  await page.getByRole("button", { name: /continue as guest/i }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const emailFields = await page.locator('input[type="email"]').count();
  const passwordFields = await page.locator('input[type="password"]').count();
  console.log("  claim panel shown:       ", (await count(/guest session/i)) ? "YES ✓" : "NO ✗");
  console.log("  'Save my progress':      ", (await count(/save my progress/i)) ? "YES ✓" : "NO ✗");
  console.log("  competing sign-in form:  ", (await count(/sign in with email/i)) ? "YES ✗ duplicate" : "NO ✓ clean");
  console.log(`  email inputs on page:    ${emailFields} (expect 1)`);
  console.log(`  password inputs on page: ${passwordFields} (expect 1)`);
  await page.screenshot({ path: "/home/user/cronyzo/docs/screens/24-claim-panel.png" });

  console.log("\n── 'Sign in instead' reveals the normal form ──");
  await page.getByRole("button", { name: /sign in instead/i }).first().click();
  await page.waitForTimeout(800);
  console.log("  sign-in form shown:      ", (await count(/sign in with email/i)) ? "YES ✓" : "NO ✗");
  console.log("  claim panel hidden:      ", !(await count(/save my progress/i)) ? "YES ✓" : "NO ✗");
  await page.screenshot({ path: "/home/user/cronyzo/docs/screens/25-signin-instead.png" });

  await browser.close();
  console.log("\n=== ERRORS ===");
  console.log(errs.length ? errs.join("\n") : "  none 🎉");
})();
