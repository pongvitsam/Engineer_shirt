/**
 * Generate User Guide PDF from docs/guides/user-guide-user.html
 * Requires: playwright (devDependency)
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const HTML = path.join(ROOT, "docs", "guides", "user-guide-user.html");
const OUT = path.join(ROOT, "docs", "guides", "คู่มือผู้ใช้-PEACE-Eng-Club.pdf");

async function main() {
  if (!fs.existsSync(HTML)) {
    console.error("Missing:", HTML);
    process.exit(1);
  }

  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (e) {
    console.error("Install playwright: npm install");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  // A4 landscape @ 96dpi — matches CSS 297×210mm
  await page.setViewportSize({ width: 1123, height: 794 });
  const fileUrl = "file:///" + HTML.replace(/\\/g, "/").replace(/ /g, "%20");

  await page.goto(fileUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmpOut = OUT + ".tmp.pdf";
  await page.pdf({
    path: tmpOut,
    width: "297mm",
    height: "210mm",
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    preferCSSPageSize: true
  });

  await browser.close();
  try {
    fs.unlinkSync(OUT);
  } catch (_) {}
  try {
    fs.renameSync(tmpOut, OUT);
  } catch (e) {
    if (e.code === "EBUSY" || e.code === "EPERM") {
      const alt = OUT.replace(/\.pdf$/i, "-landscape.pdf");
      fs.renameSync(tmpOut, alt);
      console.warn("PDF เปิดอยู่ — บันทึกที่:", alt);
      console.log("OK:", alt);
      const stat = fs.statSync(alt);
      console.log("Size:", Math.round(stat.size / 1024) + " KB");
      return;
    }
    throw e;
  }
  const stat = fs.statSync(OUT);
  console.log("OK:", OUT);
  console.log("Size:", Math.round(stat.size / 1024) + " KB");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
