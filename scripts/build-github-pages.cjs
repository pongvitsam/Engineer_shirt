#!/usr/bin/env node
/**
 * Build static GitHub Pages site into docs/ from GAS HTML sources.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const ASSETS = path.join(DOCS, "assets");

/** Must match clasp deployment used by GitHub Pages (re-deploy after clasp push). */
const GAS_WEB_APP_URL =
  process.env.PEACE_GAS_API_URL ||
  "https://script.google.com/macros/s/AKfycbxNr1MJ0ym_X0lIjvk_UvgoBbgVaXxd_1zG0Eq-I-SBCMyB8dR6jdYAlDvwnd57Ywze0g/exec";
const GITHUB_PAGES_URL =
  process.env.PEACE_GITHUB_PAGES_URL ||
  "https://pongvitsam.github.io/Engineer_shirt/";

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

function stripTag(html, tag) {
  const re = new RegExp("<" + tag + "[^>]*>([\\s\\S]*)<\\/" + tag + ">", "i");
  const m = String(html || "").match(re);
  return m ? m[1].trim() : String(html || "").trim();
}

function extractIndexBody(indexHtml) {
  const m = String(indexHtml).match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1] : "";
}

function extractIndexHeadExtras(indexHtml) {
  const headM = String(indexHtml).match(/<head[^>]*>([\s\S]*)<\/head>/i);
  if (!headM) return "";
  let head = headM[1];
  head = head.replace(/<title[\s\S]*?<\/title>/gi, "");
  head = head.replace(/<\?[\s\S]*?\?>/g, "");
  head = head.replace(/<link[^>]*fonts\.googleapis[^>]*>/gi, "");
  head = head.replace(/<link[^>]*font-awesome[^>]*>/gi, "");
  head = head.replace(/<link[^>]*preload[^>]*>/gi, "");
  head = head.replace(/<style>[\s\S]*?<\/style>/gi, "");
  return head.trim();
}

function patchIndexPatches(html) {
  return html.replace(
    /<script src="[^"]*\?asset=js[^"]*"><\/script>\s*/i,
    ""
  ).replace(
    /<script>\s*window\.PEACE_GAS_ADMIN_ONLY[\s\S]*?<\/script>\s*/i,
    ""
  );
}

function buildConfigJs(deployStamp) {
  const pagesBase = GITHUB_PAGES_URL.endsWith("/")
    ? GITHUB_PAGES_URL
    : GITHUB_PAGES_URL + "/";
  const build = readBuildFromCodeJs();
  const stamp = deployStamp || String(Date.now());
  return (
    "/* PEACE Engineer Club — GitHub Pages config (generated) */\n" +
    "window.PEACE_CONFIG = {\n" +
    "  apiUrl: " + JSON.stringify(GAS_WEB_APP_URL) + ",\n" +
    "  githubPagesUrl: " + JSON.stringify(GITHUB_PAGES_URL) + ",\n" +
    "  userGuideHtml: " + JSON.stringify(pagesBase + "guides/user-guide-user.html") + ",\n" +
    "  userGuidePdf: " + JSON.stringify(pagesBase + "guides/user-guide.pdf") + ",\n" +
    "  build: " + JSON.stringify(build) + ",\n" +
    "  deployStamp: " + JSON.stringify(stamp) + "\n" +
    "};\n" +
    "window.PEACE_GAS_ADMIN_ONLY = false;\n"
  );
}

function copyUserGuides_() {
  const srcDir = path.join(ROOT, "docs", "guides");
  const outDir = path.join(DOCS, "guides");
  fs.mkdirSync(outDir, { recursive: true });
  const htmlSrc = path.join(srcDir, "user-guide-user.html");
  if (fs.existsSync(htmlSrc)) {
    fs.copyFileSync(htmlSrc, path.join(outDir, "user-guide-user.html"));
  }
  const pdfCandidates = [
    path.join(srcDir, "คู่มือผู้ใช้-PEACE-Eng-Club-landscape.pdf"),
    path.join(srcDir, "คู่มือผู้ใช้-PEACE-Eng-Club.pdf")
  ];
  const pdfOut = path.join(outDir, "user-guide.pdf");
  for (const p of pdfCandidates) {
    if (fs.existsSync(p)) {
      fs.copyFileSync(p, pdfOut);
      break;
    }
  }
}

function readBuildFromCodeJs() {
  const code = read("Code.js");
  const m = code.match(/const APP_BUILD = "(\d+)"/);
  return m ? m[1] : "0";
}

function buildEarlyCacheBustScript(build) {
  return (
    "<script>\n" +
    "(function(){\n" +
    "  var fallback=" + JSON.stringify(String(build)) + ";\n" +
    "  function metaBuild(){var m=document.querySelector('meta[name=\"peace-build\"]');return m&&m.content?String(m.content):fallback;}\n" +
    "  try{\n" +
    "    var b=metaBuild();\n" +
    "    var l=document.getElementById('peace-app-css');\n" +
    "    if(l)l.href='assets/app.css?v='+encodeURIComponent(b)+'&t='+Date.now();\n" +
    "  }catch(e){}\n" +
    "})();\n" +
    "</script>"
  );
}

function buildAssetLoaderScript(build) {
  return (
    "<script>\n" +
    "(function(){\n" +
    "  var fallback=" + JSON.stringify(String(build)) + ";\n" +
    "  function metaBuild(){var m=document.querySelector('meta[name=\"peace-build\"]');return m&&m.content?String(m.content):fallback;}\n" +
    "  function bust(){return Date.now();}\n" +
    "  function loadScript(url,next){\n" +
    "    var s=document.createElement('script');\n" +
    "    s.src=url;\n" +
    "    s.async=false;\n" +
    "    s.onload=function(){next&&next();};\n" +
    "    s.onerror=function(){next&&next();};\n" +
    "    (document.head||document.body).appendChild(s);\n" +
    "  }\n" +
    "  function loadAssets(attempt){\n" +
    "    var b=metaBuild();\n" +
    "    var t=bust();\n" +
    "    loadScript('config.js?v='+encodeURIComponent(b)+'&t='+t,function(){\n" +
    "      var cfg=window.PEACE_CONFIG&&window.PEACE_CONFIG.build;\n" +
    "      if(String(cfg||'')!==String(b)&&(attempt||0)<2){loadAssets((attempt||0)+1);return;}\n" +
    "      loadScript('assets/app.js?v='+encodeURIComponent(b)+'&t='+bust(),null);\n" +
    "    });\n" +
    "  }\n" +
    "  loadAssets(0);\n" +
    "})();\n" +
    "</script>"
  );
}

function buildIndexHtml(bodyInner, headExtras, build, deployStamp) {
  const v = build || readBuildFromCodeJs();
  const ts = deployStamp || String(Date.now());
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="peace-build" content="${v}">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>ระบบสั่งซื้อเสื้อชมรมวิศวกร การไฟฟ้าส่วนภูมิภาค</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%237F1D1D'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-size='18' fill='%23F59E0B'%3EP%3C/text%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
  <link id="peace-app-css" rel="stylesheet" href="assets/app.css?v=${v}&amp;t=${ts}">
  ${headExtras}
</head>
<body>
${buildEarlyCacheBustScript(v)}
${bodyInner}
${buildAssetLoaderScript(v)}
</body>
</html>
`;
}

function main() {
  fs.mkdirSync(ASSETS, { recursive: true });

  const css = stripTag(read("CSS.html"), "style");
  fs.writeFileSync(path.join(ASSETS, "app.css"), css, "utf8");

  const js = stripTag(read("JavaScript.html"), "script");
  fs.writeFileSync(path.join(ASSETS, "app.js"), js, "utf8");

  let indexSrc = read("Index.html");
  let body = patchIndexPatches(extractIndexBody(indexSrc));
  const headExtras = extractIndexHeadExtras(indexSrc);
  const build = readBuildFromCodeJs();
  const stamp = String(Date.now());
  fs.writeFileSync(path.join(DOCS, "config.js"), buildConfigJs(stamp), "utf8");
  fs.writeFileSync(path.join(DOCS, "index.html"), buildIndexHtml(body, headExtras, build, stamp), "utf8");

  const nojekyll = path.join(DOCS, ".nojekyll");
  if (!fs.existsSync(nojekyll)) fs.writeFileSync(nojekyll, "", "utf8");

  copyUserGuides_();

  console.log("Built GitHub Pages → docs/");
  console.log("  API:", GAS_WEB_APP_URL);
  console.log("  Pages:", GITHUB_PAGES_URL);
  console.log("  Build:", readBuildFromCodeJs());
}

main();
