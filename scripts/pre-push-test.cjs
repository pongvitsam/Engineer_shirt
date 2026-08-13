#!/usr/bin/env node
/**
 * Pre-push gate: run all test suites by area.
 * Phase 1 (parallel): stock, system audit, realtime client
 * Phase 2 (sequential): GitHub Pages build → Pages verify
 */
const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const PARALLEL_SUITES = [
  { id: "stock", label: "Stock consistency", file: "__test_stock_consistency.cjs" },
  { id: "audit", label: "System audit", file: "__test_system_audit.cjs" },
  { id: "realtime", label: "Realtime / optimistic UI", file: "__test_realtime_client.cjs" },
  { id: "promo", label: "Price promotions", file: "__test_price_promotions.cjs" },
];

const SEQUENTIAL_SUITES = [
  { id: "build", label: "GitHub Pages build", file: "scripts/build-github-pages.cjs" },
  { id: "pages", label: "GitHub Pages verify", file: "__test_github_pages.cjs" },
  { id: "live", label: "Live API + Pages integration", file: "__test_live_integration.cjs" },
  { id: "e2e", label: "Browser E2E smoke", file: "__test_browser_e2e.cjs" },
];

function runSuite(suite) {
  return new Promise((resolve) => {
    const filePath = path.join(ROOT, suite.file);
    console.log("\n[" + suite.id + "] " + suite.label + "\n");
    const child = spawn(process.execPath, [filePath], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => {
      resolve({ ...suite, ok: code === 0, code: code || 0 });
    });
    child.on("error", (err) => {
      console.error("[" + suite.id + "] spawn error:", err.message);
      resolve({ ...suite, ok: false, code: 1 });
    });
  });
}

async function main() {
  console.log("\n========================================");
  console.log("  PEACE pre-push test (multi-area)");
  console.log("========================================");

  const results = [];

  console.log("\n--- Phase 1: parallel (stock | audit | realtime) ---");
  const parallel = await Promise.all(PARALLEL_SUITES.map(runSuite));
  results.push(...parallel);

  console.log("\n--- Phase 2: sequential (build → pages) ---");
  for (const suite of SEQUENTIAL_SUITES) {
    results.push(await runSuite(suite));
    if (!results[results.length - 1].ok) break;
  }

  console.log("\n========================================");
  console.log("  Summary");
  console.log("========================================\n");
  let failed = 0;
  for (const r of results) {
    console.log((r.ok ? "PASS" : "FAIL") + "  [" + r.id + "] " + r.label);
    if (!r.ok) failed++;
  }
  const passed = results.length - failed;
  console.log("\n" + passed + "/" + results.length + " suites passed\n");

  if (failed) {
    console.error("Pre-push test FAILED — fix errors before push/deploy.\n");
    process.exit(1);
  }
  console.log("Pre-push test OK — safe to push/deploy.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
