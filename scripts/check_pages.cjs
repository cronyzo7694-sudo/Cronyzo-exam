const { chromium } = require("playwright");

const PAGES = [
  ["/", "Landing"],
  ["/courses", "Courses"],
  ["/books", "Books"],
  ["/shop", "Shop"],
  ["/stores", "Stores"],
  ["/sell", "Sell"],
  ["/login", "Login"],
  ["/register", "Register"],
  ["/cart", "Cart (guard)"],
  ["/checkout", "Checkout (guard)"],
  ["/my-courses", "MyCourses (guard)"],
  ["/orders", "Orders (guard)"],
  ["/sell/dashboard", "SellerDashboard (guard)"],
  ["/sell/earnings", "Earnings (guard)"],
  ["/sell/courses", "SellCourses (guard)"],
  ["/help", "Help"],
  ["/about", "About"],
  ["/terms", "Terms"],
  ["/privacy", "Privacy"],
  ["/refund", "Refund"],
];

const BASE = process.env.BASE || "http://127.0.0.1:5173";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  ctx.on("weberror", (e) => errors.push("weberror: " + e.error().message));

  for (const [path, label] of PAGES) {
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error") pageErrors.push(m.text().slice(0, 220));
    });
    page.on("pageerror", (e) => pageErrors.push("PAGEERROR: " + e.message.slice(0, 220)));
    page.on("requestfailed", (r) => {
      const u = r.url();
      if (u.startsWith(BASE)) pageErrors.push("REQFAIL: " + u.slice(0, 120));
    });

    let status = "?";
    try {
      const resp = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 25000 });
      status = resp ? resp.status() : "null";
    } catch (e) {
      pageErrors.push("NAV: " + e.message.slice(0, 160));
    }
    await page.waitForTimeout(900);

    const info = await page.evaluate(() => {
      const root = document.getElementById("root");
      const txt = (root ? root.innerText : "") || "";
      return {
        nodes: root ? root.querySelectorAll("*").length : 0,
        chars: txt.replace(/\s+/g, " ").trim().length,
        title: (document.title || "").slice(0, 60),
        head: txt.replace(/\s+/g, " ").trim().slice(0, 90),
      };
    });

    const noisy = pageErrors.filter(
      (e) => !/favicon|DevTools|Download the React DevTools/i.test(e)
    );
    const bad = noisy.length ? "FAIL" : " ok ";
    console.log(
      `[${bad}] ${String(status).padEnd(4)} ${path.padEnd(18)} nodes=${String(info.nodes).padEnd(5)} chars=${String(info.chars).padEnd(5)} :: ${info.head}`
    );
    noisy.slice(0, 4).forEach((e) => console.log(`        ↳ ${e}`));
    await page.close();
  }

  await browser.close();
})();
