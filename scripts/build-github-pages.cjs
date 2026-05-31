#!/usr/bin/env node
/**
 * Build static GitHub Pages site into docs/ from GAS HTML sources.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const ASSETS = path.join(DOCS, "assets");

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

function buildConfigJs() {
  return (
    "/* PEACE Engineer Club — GitHub Pages config (generated) */\n" +
    "window.PEACE_CONFIG = {\n" +
    "  apiUrl: " + JSON.stringify(GAS_WEB_APP_URL) + ",\n" +
    "  githubPagesUrl: " + JSON.stringify(GITHUB_PAGES_URL) + ",\n" +
    "  build: " + JSON.stringify(readBuildFromCodeJs()) + "\n" +
    "};\n" +
    "window.PEACE_GAS_ADMIN_ONLY = false;\n"
  );
}

function readBuildFromCodeJs() {
  const code = read("Code.js");
  const m = code.match(/const APP_BUILD = "(\d+)"/);
  return m ? m[1] : "0";
}

function buildIndexHtml(bodyInner, headExtras, build) {
  const v = build || readBuildFromCodeJs();
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="peace-build" content="${v}">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <title>ระบบจัดการขายเสื้อชมรมวิศวกร กฟภ.</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%237F1D1D'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-size='18' fill='%23F59E0B'%3EP%3C/text%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
  <link rel="stylesheet" href="assets/app.css?v=${v}">
  ${headExtras}
</head>
<body>
${bodyInner}
  <script src="config.js?v=${v}"></script>
  <script src="assets/app.js?v=${v}"></script>
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

  fs.writeFileSync(path.join(DOCS, "config.js"), buildConfigJs(), "utf8");

  let indexSrc = read("Index.html");
  let body = patchIndexPatches(extractIndexBody(indexSrc));
  const headExtras = extractIndexHeadExtras(indexSrc);
  const build = readBuildFromCodeJs();
  fs.writeFileSync(path.join(DOCS, "index.html"), buildIndexHtml(body, headExtras, build), "utf8");

  const nojekyll = path.join(DOCS, ".nojekyll");
  if (!fs.existsSync(nojekyll)) fs.writeFileSync(nojekyll, "", "utf8");

  console.log("Built GitHub Pages → docs/");
  console.log("  API:", GAS_WEB_APP_URL);
  console.log("  Pages:", GITHUB_PAGES_URL);
  console.log("  Build:", readBuildFromCodeJs());
}

main();
