#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DOCS = path.join(__dirname, "docs");
let passed = 0;
let failed = 0;

function assert(name, fn) {
  try {
    fn();
    console.log("PASS  " + name);
    passed++;
  } catch (e) {
    console.log("FAIL  " + name + ": " + (e && e.message));
    failed++;
  }
}

function read(p) {
  return fs.readFileSync(path.join(DOCS, p), "utf8");
}

console.log("\n=== GitHub Pages build tests ===\n");

assert("docs/index.html exists", () => {
  if (!fs.existsSync(path.join(DOCS, "index.html"))) throw new Error("missing");
});

assert("index loads versioned config and app assets", () => {
  const html = read("index.html");
  const m = html.match(/peace-build" content="(\d+)"/);
  if (!m) throw new Error("peace-build meta missing");
  const build = m[1];
  if (!html.includes("config.b" + build + ".js")) throw new Error("versioned config.js missing");
  if (!html.includes("assets/app.b" + build + ".js")) throw new Error("versioned app.js missing");
  if (!html.includes("assets/app.b" + build + ".css")) throw new Error("versioned app.css missing");
  if (!html.includes("peaceGate_")) throw new Error("boot guard script missing");
  if (html.includes("google.script.run")) throw new Error("should not use GAS bridge in static HTML");
  if (!fs.existsSync(path.join(DOCS, "config.b" + build + ".js"))) throw new Error("config.b file missing");
  if (!fs.existsSync(path.join(DOCS, "assets", "app.b" + build + ".js"))) throw new Error("app.b file missing");
});

assert("index ships static login shell for flicker-free boot", () => {
  const html = read("index.html");
  if (!html.includes('id="login-form"')) throw new Error("static login form missing");
  if (!html.includes("peace-login-active")) throw new Error("peace-login-active missing");
  if (!html.includes('class="login-card"')) throw new Error("static centered login card missing");
  if (html.includes('id="login-hero-img"')) throw new Error("login hero image should be removed");
  if (html.includes('id="pre-skeleton"')) throw new Error("pre-skeleton should be removed");
});

assert("build number synced across Code, Pages index, versioned config", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  const m = code.match(/const APP_BUILD = "(\d+)"/);
  if (!m) throw new Error("APP_BUILD missing in Code.js");
  const build = m[1];
  const html = read("index.html");
  const hm = html.match(/peace-build" content="(\d+)"/);
  if (!hm || hm[1] !== build) throw new Error("index peace-build mismatch: " + (hm && hm[1]) + " vs " + build);
  const headM = html.match(/<head[^>]*>([\s\S]*)<\/head>/i);
  const head = headM ? headM[1] : html;
  const metaCount = (head.match(/<meta[^>]*name="peace-build"[^>]*>/gi) || []).length;
  if (metaCount !== 1) throw new Error("expected 1 peace-build meta in head, got " + metaCount);
  const cfg = read("config.b" + build + ".js");
  if (!new RegExp('build:\\s*"' + build + '"').test(cfg)) throw new Error("versioned config build mismatch");
});

assert("versioned app bundle matches source build", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  const m = code.match(/const APP_BUILD = "(\d+)"/);
  const build = m[1];
  const bundled = read("assets/app.b" + build + ".js");
  if (!bundled.includes('searchParams.set("_ra"')) throw new Error("bundled app missing reload guard");
  if (bundled.includes("loadLoginHeroImage_")) throw new Error("bundled app still has login hero loader");
});

assert("config has apiUrl and githubPagesUrl", () => {
  const cfg = read("config.js");
  if (!cfg.includes("apiUrl")) throw new Error("apiUrl");
  if (!cfg.includes("githubPagesUrl")) throw new Error("githubPagesUrl");
  if (cfg.includes("PEACE_GAS_ADMIN_ONLY = true")) throw new Error("pages must not be admin-only");
});

assert("app.js uses JSONP RPC when no google.script", () => {
  const js = read("assets/app.js");
  if (!js.includes("callServerRpcJsonp_")) throw new Error("JSONP bridge");
  if (!js.includes("rpc=1")) throw new Error("rpc=1 query");
  if (!js.includes("isGasScriptBridge_")) throw new Error("dual bridge");
  if (!js.includes("callServerRpcPost_")) throw new Error("RPC POST bridge for uploads");
  if (!js.includes("prepareImageBase64ForUpload_")) throw new Error("image compress helper");
});

assert("app.js built from source (pastel chart)", () => {
  const js = read("assets/app.js");
  if (!js.includes("SIZE_CHART_PASTEL_SALE")) throw new Error("stale build");
});

assert("user guide shipped for Pages", () => {
  const js = read("assets/app.js");
  if (!js.includes('id:"guide"')) throw new Error("guide nav missing in app.js");
  if (!fs.existsSync(path.join(DOCS, "guides", "user-guide-user.html"))) {
    throw new Error("guides/user-guide-user.html missing");
  }
  const cfg = read("config.js");
  if (!cfg.includes("userGuideHtml")) throw new Error("userGuideHtml in config");
});

console.log("\n" + passed + "/" + (passed + failed) + " passed\n");
process.exit(failed ? 1 : 0);
