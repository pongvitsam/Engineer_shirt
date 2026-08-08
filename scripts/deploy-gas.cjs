#!/usr/bin/env node
/**
 * Push + redeploy the production GAS web app used by GitHub Pages.
 * Requires: npx clasp login (local) or CLASPRC_JSON secret (CI).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PRODUCTION_DEPLOYMENT_ID =
  process.env.PEACE_GAS_DEPLOYMENT_ID ||
  "AKfycbzLmPIIVSrQqecIWBEF6fCiyKGm0nwqVWKVNBG-TmOtOOgpb1ZXEVx1Pgu9bgGPCSSI0w";

function readBuild_() {
  const code = fs.readFileSync(path.join(ROOT, "Code.js"), "utf8");
  const m = code.match(/const APP_BUILD = "(\d+)"/);
  return m ? m[1] : "0";
}

function run_(args) {
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["clasp", ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (r.error) {
    console.error("clasp failed:", r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status || 1);
}

const build = readBuild_();
const description = "Build " + build;

console.log("Deploying GAS web app →", PRODUCTION_DEPLOYMENT_ID);
console.log("Description:", description, "\n");

run_(["push"]);
run_(["deploy", "-i", PRODUCTION_DEPLOYMENT_ID, "-d", description]);

console.log("\nGAS deploy OK (build " + build + ").");
