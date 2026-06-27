#!/usr/bin/env node
/**
 * Live integration tests — GAS RPC + GitHub Pages config/build sync.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const ROOT = __dirname;
const DOCS = path.join(ROOT, "docs");
const PAGES_URL = "https://pongvitsam.github.io/Engineer_shirt/";
const TIMEOUT_MS = 45000;

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

function readApiUrl_() {
  const cfg = fs.readFileSync(path.join(DOCS, "config.js"), "utf8");
  const m = cfg.match(/apiUrl:\s*"([^"]+)"/);
  if (!m) throw new Error("apiUrl missing in docs/config.js");
  return m[1];
}

function readExpectedBuild_() {
  const code = fs.readFileSync(path.join(ROOT, "Code.js"), "utf8");
  const m = code.match(/const APP_BUILD = "(\d+)"/);
  if (!m) throw new Error("APP_BUILD missing");
  return m[1];
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { timeout: TIMEOUT_MS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error("HTTP " + res.statusCode + " for " + url));
          return;
        }
        resolve(body);
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout " + url));
    });
  });
}

function rpcGet_(apiUrl, method, args, extra) {
  const payload = JSON.stringify({
    method: method,
    args: args || [],
    gasAdminOnly: !!(extra && extra.gasAdminOnly)
  });
  const u = new URL(apiUrl);
  u.searchParams.set("rpc", "1");
  u.searchParams.set("payload", payload);
  return fetchText(u.toString()).then((raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error("invalid JSON from " + method + ": " + String(raw).slice(0, 120));
    }
    if (!data.ok) throw new Error(method + " failed: " + (data.error || "unknown"));
    return data.result;
  });
}

function rpcAuthed_(apiUrl, token, method, args) {
  const payload = JSON.stringify({
    method: method,
    args: [token].concat(args || [])
  });
  const u = new URL(apiUrl);
  u.searchParams.set("rpc", "1");
  u.searchParams.set("payload", payload);
  return fetchText(u.toString()).then((raw) => {
    const data = JSON.parse(raw);
    if (!data.ok) throw new Error(method + " failed: " + (data.error || "unknown"));
    return data.result;
  });
}

async function main() {
  console.log("\n=== Live integration tests ===\n");
  const apiUrl = readApiUrl_();
  const build = readExpectedBuild_();
  console.log("API:", apiUrl);
  console.log("Expected build:", build, "\n");

  await assert("getRpcPing returns expected build", async () => {
    const r = await rpcGet_(apiUrl, "getRpcPing", []);
    if (String(r.build) !== build) {
      throw new Error("API build " + r.build + " != " + build);
    }
    if (!r.ok) throw new Error("ping not ok");
  });

  await assert("getGuestStockData returns stock payload", async () => {
    const r = await rpcGet_(apiUrl, "getGuestStockData", []);
    if (!r || !Array.isArray(r.stock)) throw new Error("stock array missing");
    if (!r.round || !r.round.name) throw new Error("round missing");
  });

  await assert("getGuestLoginPreview returns preview", async () => {
    const r = await rpcGet_(apiUrl, "getGuestLoginPreview", []);
    if (!r || !r.round) throw new Error("preview round missing");
  });

  await assert("viewer login + verifySession + getBootstrapData", async () => {
    const login = await rpcGet_(apiUrl, "login", ["viewer", "Peace@2569"]);
    if (!login || !login.token) throw new Error("login token missing");
    const verify = await rpcAuthed_(apiUrl, login.token, "verifySession", []);
    if (!verify || !verify.ok) throw new Error("verifySession failed");
    const boot = await rpcAuthed_(apiUrl, login.token, "getBootstrapData", []);
    if (!boot || !Array.isArray(boot.orders)) throw new Error("bootstrap orders missing");
    if (!boot.transferAccount) throw new Error("transferAccount missing");
    if (!boot.supportContact) throw new Error("supportContact missing");
    await rpcAuthed_(apiUrl, login.token, "logout", []);
  });

  await assert("region user login succeeds", async () => {
    const login = await rpcGet_(apiUrl, "login", ["user_n1", "Peace@2569"]);
    if (!login || !login.token) throw new Error("user_n1 login failed");
    if (String(login.region) !== "กฟน.1") throw new Error("region mismatch: " + login.region);
    await rpcAuthed_(apiUrl, login.token, "logout", []);
  });

  await assert("invalid login rejected", async () => {
    try {
      await rpcGet_(apiUrl, "login", ["viewer", "wrong-password"]);
      throw new Error("expected login failure");
    } catch (e) {
      if ((e.message || "").includes("expected login failure")) throw e;
    }
  });

  await assert("live GitHub Pages config build matches repo", async () => {
    const cfg = await fetchText(PAGES_URL + "config.js?t=" + Date.now());
    const bm = cfg.match(/build:\s*"(\d+)"/);
    if (!bm || bm[1] !== build) {
      throw new Error("Pages build " + (bm && bm[1]) + " != " + build);
    }
    const am = cfg.match(/apiUrl:\s*"([^"]+)"/);
    if (!am || am[1] !== apiUrl) {
      throw new Error("Pages apiUrl mismatch with docs/config.js");
    }
  });

  await assert("live user guide HTML reachable", async () => {
    const html = await fetchText(PAGES_URL + "guides/user-guide-user.html?t=" + Date.now());
    if (!html.includes("คู่มือผู้ใช้")) throw new Error("guide title missing");
    const local = fs.readFileSync(path.join(DOCS, "guides", "user-guide-user.html"), "utf8");
    const localBuild = (local.match(/Build (\d+)/) || [])[1] || "";
    const liveBuild = (html.match(/Build (\d+)/) || [])[1] || "";
    if (localBuild && liveBuild && localBuild !== liveBuild) {
      throw new Error("live guide build " + liveBuild + " != repo " + localBuild + " — wait for GitHub Pages or push");
    }
    if (local.includes("รอแอดมินตรวจ") && html.includes("รอ HQ")) {
      throw new Error("live guide stale — push docs/guides/user-guide-user.html");
    }
  });

  console.log("\n" + passed + "/" + (passed + failed) + " passed\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
