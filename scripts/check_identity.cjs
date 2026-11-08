const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:5173";

const mainText = (page) =>
  page.evaluate(() => {
    const m = document.querySelector("main") || document.querySelector("#root");
    return (m ? m.innerText : document.body.innerText).replace(/\s+/g, " ").trim();
  });

let step = 0;
const T = (s) => console.log(`\n[${++step}] ${s}`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 180)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|DevTools/i.test(m.text()))
      errs.push("CONSOLE " + m.text().slice(0, 180));
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes("/api/"))
      errs.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`);
  });

  const email = `identity.${Date.now()}@unified.local`;

  // ── 1. start as a guest ───────────────────────────────────────────
  T("Start as guest");
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const guestBtn = page.getByRole("button", { name: /continue as guest/i }).first();
  await guestBtn.click();
  await page.waitForTimeout(2500);
  console.log(`    -> ${page.url().replace(BASE, "")}`);
  const guestInfo = await page.evaluate(() => {
    const raw = localStorage.getItem("access_token");
    return { hasToken: !!raw };
  });
  console.log(`    guest token stored: ${guestInfo.hasToken}`);

  // ── 2. guest uses commerce AND exams (one account, all pillars) ───
  T("Guest adds a product to the cart");
  await page.goto(BASE + "/shop", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const card = page.locator('a[href^="/shop/"]').first();
  await card.click();
  await page.waitForTimeout(1800);
  const add = page.getByRole("button", { name: /add to cart/i }).first();
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(1600);
  }
  await page.goto(BASE + "/cart", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const cartText = await mainText(page);
  console.log(`    cart: ${cartText.match(/Your cart [^·]*· *\d+ units?/)?.[0] || cartText.slice(0, 60)}`);

  T("Guest takes an exam");
  await page.goto(BASE + "/exams", { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  console.log(`    exams page: ${(await mainText(page)).slice(0, 90)}`);

  // ── 3. claim the guest session ────────────────────────────────────
  T("Go to /login — the guest session should be offered for claiming");
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const claimBanner = await page.getByText(/guest session/i).count();
  console.log(`    claim panel visible: ${claimBanner > 0 ? "YES ✓" : "NO ✗"}`);
  const saveBtn = page.getByRole("button", { name: /save my progress/i }).first();
  console.log(`    "Save my progress" button: ${(await saveBtn.count()) > 0 ? "YES ✓" : "NO ✗"}`);
  await page.screenshot({ path: "/home/user/cronyzo/docs/screens/20-claim-guest.png" });

  T("Fill in email + password and save");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill("IdentityPass123!");
  await saveBtn.click();
  await page.waitForTimeout(3000);
  console.log(`    -> ${page.url().replace(BASE, "")}`);

  // ── 4. one account: cart + session survived ──────────────────────
  T("Verify the same account kept everything");
  await page.goto(BASE + "/cart", { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  const after = await mainText(page);
  console.log(`    cart after claim: ${after.match(/Your cart [^·]*· *\d+ units?/)?.[0] || after.slice(0, 60)}`);

  const session = await page.evaluate(async () => {
    const res = await fetch("/api/auth/session", {
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
    });
    return res.json();
  });
  console.log(`    session: role=${session.role} is_guest=${session.is_guest} email=${session.user.email}`);
  console.log(`    capabilities: ${JSON.stringify(session.capabilities)}`);

  // ── 5. student -> teacher, then publish immediately ───────────────
  T("Become a teacher (student → teacher) from /sell");
  await page.goto(BASE + "/sell", { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  console.log(`    sell page: ${(await mainText(page)).slice(0, 100)}`);
  await page.screenshot({ path: "/home/user/cronyzo/docs/screens/21-sell-landing.png" });

  const teacherBtn = page.getByRole("button", { name: /^teacher$/i }).first();
  if (await teacherBtn.count()) await teacherBtn.click();
  await page.waitForTimeout(500);
  const goBtn = page.getByRole("button", { name: /start selling|get started|continue|become/i }).first();
  if (await goBtn.count()) {
    await goBtn.click();
    await page.waitForTimeout(3000);
  }
  console.log(`    after onboarding -> ${page.url().replace(BASE, "")}`);

  const session2 = await page.evaluate(async () => {
    const res = await fetch("/api/auth/session", {
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
    });
    return res.json();
  });
  console.log(`    session now: role=${session2.role} creator_type=${session2.creator_type}`);
  console.log(`    can publish: ${session2.capabilities.can_publish_courses}`);

  T("Publish a course immediately as the new teacher");
  await page.goto(BASE + "/sell/courses/new", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
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
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      },
      { labelMatch, value }
    );
  console.log(`    title filled: ${await fill("course title", "Unified Identity Course")}`);
  console.log(`    promise filled: ${await fill("one-line promise", "One account across learn, read, shop and test")}`);
  await page.getByRole("button", { name: /create course/i }).first().click();
  await page.waitForTimeout(3000);
  console.log(`    -> ${page.url().replace(BASE, "")}`);

  const created = await page.evaluate(async () => {
    const res = await fetch("/api/courses?mine=true&per_page=50", {
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
    });
    const d = await res.json();
    return (d.items || []).map((c) => c.title);
  });
  console.log(`    my courses: ${JSON.stringify(created)}`);

  await page.screenshot({ path: "/home/user/cronyzo/docs/screens/22-after-promotion.png" });

  await browser.close();
  console.log("\n=== ERRORS ===");
  const noisy = errs.filter((e) => !/\/auth\/me|notifications/.test(e));
  console.log(noisy.length ? noisy.join("\n") : "  none 🎉");
})();
