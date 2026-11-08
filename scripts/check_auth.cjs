const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:5173";

const ACCOUNTS = [
  {
    label: "student",
    email: "student@examos.local",
    password: "student123",
    pages: [
      ["/dashboard", "Dashboard"],
      ["/exams", "Exams"],
      ["/attempts", "Attempts"],
      ["/analytics", "Analytics"],
      ["/profile", "Profile"],
      ["/settings", "Settings"],
      ["/cart", "Cart"],
      ["/checkout", "Checkout"],
      ["/my-courses", "MyCourses"],
      ["/orders", "Orders"],
    ],
  },
  {
    label: "seller",
    email: "seller@examos.local",
    password: "seller123",
    pages: [
      ["/sell/dashboard", "SellerDashboard"],
      ["/sell/earnings", "Earnings"],
      ["/sell/courses", "SellCourses"],
      ["/sell/books", "SellBooks"],
      ["/sell/products", "SellProducts"],
      ["/sell/products/new", "CreateProduct"],
      ["/sell/courses/new", "CreateCourse"],
      ["/sell/books/new", "CreateBook"],
    ],
  },
  {
    label: "teacher",
    email: "teacher@examos.local",
    password: "teacher123",
    pages: [["/sell/dashboard", "TeacherDashboard"], ["/sell/courses/new", "TeacherCreateCourse"]],
  },
  {
    label: "admin",
    email: "admin@examos.local",
    password: "admin123",
    pages: [
      ["/admin/subjects", "AdminSubjects"],
      ["/admin/questions", "AdminQuestions"],
      ["/admin/exams", "AdminExams"],
      ["/admin/users", "AdminUsers"],
      ["/admin/messages", "AdminMessages"],
      ["/admin/import", "AdminImport"],
      ["/admin/file-bank", "AdminFileBank"],
    ],
  },
];

async function login(page, email, password) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(600);
  const emailSel = 'input[type="email"], input[name="email"]';
  const passSel = 'input[type="password"]';
  if ((await page.locator(emailSel).count()) === 0) return false;
  await page.locator(emailSel).first().fill(email);
  await page.locator(passSel).first().fill(password);
  const submit = page.locator('button[type="submit"]').first();
  if ((await submit.count()) === 0) return false;
  await submit.click();
  await page.waitForTimeout(2500);
  return true;
}

(async () => {
  const browser = await chromium.launch();
  let fails = 0;

  for (const acc of ACCOUNTS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const ok = await login(page, acc.email, acc.password);
    if (!ok) {
      console.log(`\n### ${acc.label}: LOGIN FORM NOT FOUND — aborting`);
      fails++;
      await ctx.close();
      continue;
    }
    const urlNow = page.url();
    const token = await page.evaluate(() => localStorage.getItem("access_token"));
    console.log(`\n### ${acc.label} (${acc.email})`);
    console.log(`    login -> ${urlNow.replace(BASE, "")}  token=${token ? "yes" : "NO"}`);

    for (const [path, label] of acc.pages) {
      const errs = [];
      const onErr = (e) => errs.push(e.message.slice(0, 200));
      const onCon = (m) => {
        if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200));
      };
      page.on("pageerror", onErr);
      page.on("console", onCon);

      let status = "?";
      try {
        const r = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 25000 });
        status = r ? r.status() : "null";
      } catch (e) {
        errs.push("NAV: " + e.message.slice(0, 150));
      }
      await page.waitForTimeout(700);

      const info = await page.evaluate(() => {
        const root = document.getElementById("root");
        const txt = (root ? root.innerText : "") || "";
        return {
          nodes: root ? root.querySelectorAll("*").length : 0,
          chars: txt.replace(/\s+/g, " ").trim().length,
          head: txt.replace(/\s+/g, " ").trim().slice(0, 80),
        };
      });

      const bad = errs.filter((e) => !/favicon|DevTools/i.test(e));
      const redirected = !page.url().includes(path);
      const problem = bad.length || redirected || info.chars < 120;
      if (problem) fails++;
      console.log(
        `  [${problem ? "FAIL" : " ok "}] ${String(status).padEnd(4)} ${path.padEnd(22)} nodes=${String(info.nodes).padEnd(5)} chars=${String(info.chars).padEnd(5)} :: ${info.head}`
      );
      if (redirected) console.log(`        ↳ REDIRECTED to ${page.url().replace(BASE, "")}`);
      bad.slice(0, 3).forEach((e) => console.log(`        ↳ ${e}`));

      page.off("pageerror", onErr);
      page.off("console", onCon);
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${fails === 0 ? "ALL CHECKS PASSED" : fails + " PROBLEM(S) FOUND"}`);
})();
