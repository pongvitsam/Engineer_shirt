#!/usr/bin/env node
/**
 * Delete old Apps Script versions to stay under the 200-version limit.
 * Keeps versions referenced by active deployments and recent versions.
 */
const fs = require("fs");
const path = require("path");

const SCRIPT_ID = "1X9SPQXcEdaYk9qkyIy7eHDCFq2cCtPbXo_Ng-Fcfk78liJFvmwz7AL2Q";
const DEPLOYMENT_VERSIONS = [112, 119, 120, 146, 187, 188, 189, 190, 191, 193, 195, 200];
const KEEP_RECENT_FROM = 175;

function loadToken() {
  const claspPath = path.join(process.env.USERPROFILE || process.env.HOME || "", ".clasprc.json");
  const clasp = JSON.parse(fs.readFileSync(claspPath, "utf8"));
  return clasp.tokens?.default?.access_token || clasp.token?.access_token;
}

function buildKeepSet() {
  const keep = new Set(DEPLOYMENT_VERSIONS);
  for (let v = KEEP_RECENT_FROM; v <= 200; v++) keep.add(v);
  return keep;
}

async function deleteVersion(token, versionNumber) {
  const url = `https://script.googleapis.com/v1/projects/${SCRIPT_ID}/versions/${versionNumber}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.ok || res.status === 404) return true;
  const body = await res.text();
  console.error(`Failed to delete v${versionNumber}: ${res.status} ${body}`);
  return false;
}

async function main() {
  const token = loadToken();
  if (!token) {
    console.error("No clasp access token found. Run: npx clasp login");
    process.exit(1);
  }
  const keep = buildKeepSet();
  let deleted = 0;
  let failed = 0;
  for (let v = 1; v < KEEP_RECENT_FROM; v++) {
    if (keep.has(v)) continue;
    const ok = await deleteVersion(token, v);
    if (ok) deleted++;
    else failed++;
    if (deleted % 25 === 0 && deleted > 0) process.stdout.write(`  deleted ${deleted}...\n`);
    await new Promise((r) => setTimeout(r, 80));
  }
  console.log(`Done. Deleted: ${deleted}, failed: ${failed}, kept: ${keep.size} pinned`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
