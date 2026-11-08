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

  // ── catalogue counts ───────────────────────────────────────────
  for (const [path, label] of [
    ["/sell/products", "products"],
    ["/sell/books", "books"],
    ["/sell/courses", "courses"],
  ]) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    const t = await mainText(page);
    const m = t.match(/(\d+)\s+(published|listed|courses|books|products)/i);
    console.log(`  ${label.padEnd(9)} -> ${t.slice(0, 90)}`);
  }

  // ── actually publish a product ─────────────────────────────────
  console.log("\n--- publishing a product as the seller ---");
  await page.goto(BASE + "/sell/products/new", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const fields = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("input, textarea, select").forEach((el, i) => {
      const label =
        el.closest("label")?.innerText?.trim().split("\n")[0] ||
        el.getAttribute("placeholder") ||
        el.name ||
        el.id ||
        "";
      out.push({ i, tag: el.tagName, type: el.type || "", label: String(label).slice(0, 34) });
    });
    return out;
  });
  fields.forEach((f) => console.log(`   [${f.i}] ${f.tag}/${f.type} :: ${f.label}`));

  const fill = async (labelMatch, value) => {
    const ok = await page.evaluate(
      ({ labelMatch, value }) => {
        const els = [...document.querySelectorAll("input, textarea")];
        const el = els.find((e) => {
          const l = (
            e.closest("label")?.innerText ||
            e.getAttribute("placeholder") ||
            e.name ||
            ""
          )
            .toLowerCase();
          return l.includes(labelMatch.toLowerCase());
        });
        if (!el) return false;
        const setter = Object.getOwnPropertyDescriptor(
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype,
          "value"
        ).set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      },
      { labelMatch, value }
    );
    return ok;
  };

  const title = "Cronyzo QA Test Product " + Date.now();
  console.log(`   fill title       : ${await fill("title", title)}`);
  console.log(`   fill description : ${await fill("description", "Temporary QA listing created by the automated publish check.")}`);
  console.log(`   fill brand       : ${await fill("brand", "QABrand")}`);
  console.log(`   fill price       : ${await fill("selling price", "1499")}`);
  console.log(`   fill mrp         : ${await fill("mrp", "1999")}`);
  console.log(`   fill stock       : ${await fill("stock", "7")}`);

  await page.waitForTimeout(400);
  await page.screenshot({ path: "/home/user/cronyzo/docs/screens/17-create-filled.png" });

  const publish = page.getByRole("button", { name: /publish product/i }).first();
  if (await publish.count()) {
    await publish.click();
    await page.waitForTimeout(2600);
    console.log(`   after publish -> ${page.url().replace(BASE, "")}`);
  } else {
    console.log("   !! Publish button not found");
  }

  // ── confirm it is now in the seller's catalogue ────────────────
  await page.goto(BASE + "/sell/products", { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  const cat = await mainText(page);
  const present = cat.includes(title);
  console.log(`\n  new product visible in "My products": ${present ? "YES ✓" : "NO ✗"}`);
  console.log(`  catalogue head: ${cat.slice(0, 140)}`);
  await page.screenshot({ path: "/home/user/cronyzo/docs/screens/18-sell-products-after.png" });

  // ── delete it again so the seed stays clean ────────────────────
  const del = page.locator('button[aria-label*="Delete" i], button:has-text("Delete")').first();
  if (present && (await del.count())) {
    await del.click();
    await page.waitForTimeout(600);
    const confirm = page.getByRole("button", { name: /delete|confirm|yes/i }).last();
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(2000);
    console.log(`  deleted test product; catalogue now: ${(await mainText(page)).slice(0, 80)}`);
  }

  await browser.close();
  console.log("\n=== ERRORS ===");
  const noisy = errs.filter((e) => !/\/auth\/me|notifications/.test(e));
  console.log(noisy.length ? noisy.join("\n") : "  none 🎉");
})();
