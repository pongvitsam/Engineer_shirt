#!/usr/bin/env node
/**
 * Browser E2E smoke tests on GitHub Pages (Playwright).
 */
const fs = require("fs");
const path = require("path");

const PAGES_URL = process.env.PEACE_PAGES_URL || "https://pongvitsam.github.io/Engineer_shirt/";
const TIMEOUT = 60000;

let passed = 0;
let failed = 0;

function assert(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log("PASS  " + name);
      passed++;
    })
    .catch((e) => {
      console.log("FAIL  " + name + ": " + (e && e.message ? e.message : e));
      failed++;
    });
}

function readExpectedBuild_() {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  const m = code.match(/const APP_BUILD = "(\d+)"/);
  return m ? m[1] : "";
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (e) {
    console.error("Install playwright: npm install");
    process.exit(1);
  }

  const build = readExpectedBuild_();
  console.log("\n=== Browser E2E smoke tests ===\n");
  console.log("URL:", PAGES_URL);
  console.log("Expected build:", build, "\n");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

  await assert("login page loads without build mismatch banner", async () => {
    await page.goto(PAGES_URL, { waitUntil: "networkidle" });
    const mismatch = page.locator("text=เบราว์เซอร์ใช้ build");
    if (await mismatch.count()) {
      const txt = await mismatch.first().textContent();
      throw new Error(txt || "build mismatch banner visible");
    }
    await page.waitForSelector("#login-form");
  });

  await assert("guest login shows stock module", async () => {
    await page.click('button:has-text("Guest")');
    await page.waitForSelector("text=โหมด Guest", { timeout: TIMEOUT });
    const stockNav = page.locator('button:has-text("สต็อก"), a:has-text("สต็อก")');
    if (!(await stockNav.count())) throw new Error("stock nav missing after guest login");
  });

  await assert("viewer login opens order list nav", async () => {
    await page.goto(PAGES_URL, { waitUntil: "networkidle" });
    await page.fill("#login-username", "viewer");
    await page.fill("#login-password", "Peace@2569");
    await page.click("#login-btn");
    await page.waitForSelector("text=ผู้ดูข้อมูล", { timeout: TIMEOUT });
    const listNav = page.locator('button:has-text("รายการสั่งซื้อ")');
    if (!(await listNav.count())) throw new Error("order list nav missing");
    await listNav.first().click();
    await page.waitForSelector("text=รายการสั่งซื้อ", { timeout: TIMEOUT });
  });

  await assert("guide module embeds user guide iframe", async () => {
    const guideNav = page.locator('button:has-text("คู่มือ")');
    if (!(await guideNav.count())) throw new Error("guide nav missing");
    await guideNav.first().click();
    await page.waitForSelector("text=คู่มือผู้ใช้ (User)", { timeout: TIMEOUT });
    const frame = page.locator('iframe.guide-frame, iframe[title*="คู่มือผู้ใช้"]');
    if (!(await frame.count())) throw new Error("guide iframe missing");
    const src = await frame.first().getAttribute("src");
    if (!src || !src.includes("user-guide-user.html")) {
      throw new Error("guide iframe src unexpected: " + src);
    }
  });

  await assert("region user can open order form", async () => {
    await page.context().clearCookies();
    await page.evaluate(() => {
      try { localStorage.clear(); } catch (_) {}
      try { sessionStorage.clear(); } catch (_) {}
    });
    await page.goto(PAGES_URL, { waitUntil: "networkidle" });
    await page.waitForSelector("#login-username", { timeout: TIMEOUT });
    await page.fill("#login-username", "user_n1");
    await page.fill("#login-password", "Peace@2569");
    await page.click("#login-btn");
    await page.waitForSelector("text=กฟน.1", { timeout: TIMEOUT });
    const orderNav = page.locator('button:has-text("สั่งซื้อเสื้อ")');
    if (!(await orderNav.count())) throw new Error("order nav missing");
    await orderNav.first().click();
    await page.waitForSelector("text=สั่งซื้อเสื้อ (สั่งหลายไซส์)", { timeout: TIMEOUT });
    if (!(await page.locator("text=เพิ่มลงตะกร้า").count())) {
      throw new Error("add to cart UI missing");
    }
  });

  await browser.close();

  console.log("\n" + passed + "/" + (passed + failed) + " passed\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
