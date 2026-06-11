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
  head = head.replace(/<meta[^>]*name=["']peace-build["'][^>]*>/gi, "");
  return head.trim();
}

function buildBootGuardScript_(build, apiUrl) {
  const v = build || readBuildFromCodeJs();
  const api = JSON.stringify(apiUrl || GAS_WEB_APP_URL);
  return (
    "<script>\n" +
    "(function(){\n" +
    "var EXPECTED=" + JSON.stringify(v) + ";\n" +
    "var API=" + api + ";\n" +
    "var p=new URLSearchParams(location.search);\n" +
    "var ra=parseInt(p.get(\"_ra\")||\"0\",10)||0;\n" +
    "function retry(target){\n" +
    "if(ra>=6)return;\n" +
    "try{Object.keys(sessionStorage).forEach(function(k){if(/^peace_/.test(k))sessionStorage.removeItem(k);});}catch(_){}\n" +
    "var u=new URL(location.href);u.search=\"\";\n" +
    "u.searchParams.set(\"_b\",target);\n" +
    "u.searchParams.set(\"_t\",String(Date.now()));\n" +
    "u.searchParams.set(\"_ra\",String(ra+1));\n" +
    "location.replace(u.toString());\n" +
    "}\n" +
    "function pingServer(){\n" +
    "return new Promise(function(resolve){\n" +
    "var cb=\"peaceGate_\"+Date.now();\n" +
    "var timer=setTimeout(function(){cleanup();resolve(null);},8000);\n" +
    "var s=null;\n" +
    "function cleanup(){clearTimeout(timer);try{delete window[cb];}catch(_){}if(s&&s.parentNode)s.parentNode.removeChild(s);}\n" +
    "window[cb]=function(r){cleanup();resolve(r&&r.build?String(r.build):null);};\n" +
    "var payload=encodeURIComponent(JSON.stringify({method:\"getRpcPing\",params:[]}));\n" +
    "s=document.createElement(\"script\");\n" +
    "s.src=API+(API.indexOf(\"?\")>=0?\"&\":\"?\")+\"rpc=1&callback=\"+encodeURIComponent(cb)+\"&payload=\"+payload;\n" +
    "s.onerror=function(){cleanup();resolve(null);};\n" +
    "document.head.appendChild(s);\n" +
    "});\n" +
    "}\n" +
    "var meta=document.querySelector('meta[name=\"peace-build\"]');\n" +
    "var hb=meta&&meta.content?String(meta.content):\"\";\n" +
    "if(hb&&hb!==EXPECTED)retry(EXPECTED);\n" +
    "pingServer().then(function(sb){\n" +
    "if(!sb||sb===EXPECTED)return;\n" +
    "if(hb===sb)return;\n" +
    "retry(sb);\n" +
    "});\n" +
    "})();\n" +
    "</script>"
  );
}

function expandHtmlIncludes_(html) {
  return String(html || "").replace(/<\?!=\s*include\("([^"]+)"\);\s*\?>/g, function (_m, name) {
    let file = path.join(ROOT, name);
    if (!fs.existsSync(file) && !/\.html$/i.test(name)) file = path.join(ROOT, name + ".html");
    if (!fs.existsSync(file)) throw new Error("Missing include: " + name);
    return fs.readFileSync(file, "utf8").trim();
  });
}

function patchIndexPatches(html) {
  return expandHtmlIncludes_(html).replace(
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

function buildIndexHtml(bodyInner, headExtras, build, deployStamp) {
  const v = build || readBuildFromCodeJs();
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
  <link id="peace-app-css" rel="stylesheet" href="assets/app.b${v}.css">
  ${headExtras}
</head>
<body>
${buildBootGuardScript_(v)}
${bodyInner}
  <script src="config.b${v}.js"></script>
  <script src="assets/app.b${v}.js"></script>
</body>
</html>
`;
}

function main() {
  fs.mkdirSync(ASSETS, { recursive: true });

  const build = readBuildFromCodeJs();
  const stamp = String(Date.now());
  const css = stripTag(read("CSS.html"), "style");
  const js = stripTag(read("JavaScript.html"), "script");
  const cfg = buildConfigJs(stamp);

  fs.writeFileSync(path.join(ASSETS, "app.css"), css, "utf8");
  fs.writeFileSync(path.join(ASSETS, "app.b" + build + ".css"), css, "utf8");
  fs.writeFileSync(path.join(ASSETS, "app.js"), js, "utf8");
  fs.writeFileSync(path.join(ASSETS, "app.b" + build + ".js"), js, "utf8");
  fs.writeFileSync(path.join(DOCS, "config.js"), cfg, "utf8");
  fs.writeFileSync(path.join(DOCS, "config.b" + build + ".js"), cfg, "utf8");

  let indexSrc = read("Index.html");
  let body = patchIndexPatches(extractIndexBody(indexSrc));
  const headExtras = extractIndexHeadExtras(indexSrc);
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
