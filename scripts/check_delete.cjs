const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:5173";

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
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 160)));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes("/api/"))
      errs.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`);
  });

  await login(page, "seller@examos.local", "seller123");
  await page.goto(BASE + "/sell/products", { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);

  const before = (await mainText(page)).match(/My products (\d+)/);
  console.log(`  before delete: ${before ? before[1] : "?"} products`);

  // first click → confirm prompt appears, nothing deleted yet
  const trash = page.locator('button[aria-label^="Remove"]').first();
  await trash.click();
  await page.waitForTimeout(700);
  const promptShown = await page.getByRole("button", { name: /^Yes$/ }).count();
  const afterClick = (await mainText(page)).match(/My products (\d+)/);
  console.log(`  after 1st click → confirm shown: ${promptShown > 0 ? "YES ✓" : "NO ✗"}`);
  console.log(`  count unchanged: ${afterClick ? afterClick[1] : "?"} (should equal before)`);
  await page.screenshot({ path: "/home/user/cronyzo/docs/screens/19-delete-confirm.png" });

  // click "No" → cancels
  await page.getByRole("button", { name: /^No$/ }).click();
  await page.waitForTimeout(800);
  const promptGone = await page.getByRole("button", { name: /^Yes$/ }).count();
  const afterNo = (await mainText(page)).match(/My products (\d+)/);
  console.log(`  after "No" → prompt gone: ${promptGone === 0 ? "YES ✓" : "NO ✗"}, count: ${afterNo ? afterNo[1] : "?"}`);

  // real delete of a throwaway listing
  console.log("\n  --- publish → delete round trip ---");
  await page.goto(BASE + "/sell/products/new", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const title = "ZZ Temp " + Date.now();
  const fill = (labelMatch, value) =>
    page.evaluate(
      ({ labelMatch, value }) => {
        const els = [...document.querySelectorAll("input, textarea")];
        const el = els.find((e) =>
          (e.closest("label")?.innerText || e.getAttribute("placeholder") || e.name || "")
            .toLowerCase()
            .includes(labelMatch.toLowerCase())
        );
        if (!el) return false;
        const proto =
          el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      },
      { labelMatch, value }
    );
  await fill("title", title);
  await fill("description", "temp");
  await fill("selling price", "999");
  await fill("stock", "1");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /publish product/i }).first().click();
  await page.waitForTimeout(2400);

  await page.goto(BASE + "/sell/products", { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  const withTemp = (await mainText(page)).match(/My products (\d+)/);
  console.log(`  after publish: ${withTemp ? withTemp[1] : "?"} products`);

  const target = page.locator(`button[aria-label="Remove ${title}"]`).first();
  console.log(`  temp row delete button found: ${(await target.count()) > 0 ? "YES ✓" : "NO ✗"}`);
  await target.click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /^Yes$/ }).click();
  await page.waitForTimeout(2500);
  const after = (await mainText(page)).match(/My products (\d+)/);
  console.log(`  after delete: ${after ? after[1] : "?"} products (list auto-refreshed)`);
  const gone = !(await mainText(page)).includes(title);
  console.log(`  temp item removed from list: ${gone ? "YES ✓" : "NO ✗"}`);

  await browser.close();
  console.log("\n=== ERRORS ===");
  const noisy = errs.filter((e) => !/\/auth\/me|notifications/.test(e));
  console.log(noisy.length ? noisy.join("\n") : "  none 🎉");
})();
