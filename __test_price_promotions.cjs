#!/usr/bin/env node
/**
 * Static tests for price promotions + per-order unit price (build 231).
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
let passed = 0;
let failed = 0;

function assert(name, fn) {
  try {
    fn();
    passed++;
    console.log("PASS  " + name);
  } catch (e) {
    failed++;
    console.log("FAIL  " + name);
    console.log("      " + (e && e.message ? e.message : e));
  }
}

const code = fs.readFileSync(path.join(ROOT, "Code.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "JavaScript.html"), "utf8");

console.log("\n=== Price promotions tests ===\n");

assert("APP_BUILD 231", () => {
  const m = code.match(/const APP_BUILD = "(\d+)"/);
  if (!m || m[1] !== "231") throw new Error("expected APP_BUILD 231, got " + (m && m[1]));
});

assert("resolveUnitPrice picks lowest active promo", () => {
  const fn = code.match(/function resolveUnitPrice_[\s\S]*?^}/m);
  if (!fn) throw new Error("resolveUnitPrice_ not found");
  if (!fn[0].includes("a.promoPrice - b.promoPrice")) {
    throw new Error("resolveUnitPrice_ must sort by lowest promoPrice");
  }
});

assert("addMultiSizeOrder stores unitPrice and priceSource", () => {
  const fn = code.match(/function addMultiSizeOrder[\s\S]*?^}/m);
  if (!fn) throw new Error("addMultiSizeOrder not found");
  if (!fn[0].includes("buildOrderRowArray_")) throw new Error("must use buildOrderRowArray_");
  if (!fn[0].includes("resolveUnitPrice_")) throw new Error("must resolve price at order time");
});

assert("sanitizeOrderForClient exposes unitPrice", () => {
  const fn = code.match(/function sanitizeOrderForClient_[\s\S]*?^}/m);
  if (!fn) throw new Error("sanitizeOrderForClient_ not found");
  if (!fn[0].includes("unitPrice")) throw new Error("missing unitPrice in client order");
  if (!fn[0].includes("priceSource")) throw new Error("missing priceSource in client order");
});

assert("getAdminPanelExtras includes pricePromotions", () => {
  const fn = code.match(/function getAdminPanelExtras[\s\S]*?^}/m);
  if (!fn) throw new Error("getAdminPanelExtras not found");
  if (!fn[0].includes("pricePromotions")) throw new Error("must return pricePromotions");
});

assert("client groupOrdersByOrderId tracks unitPrice", () => {
  const fn = html.match(/function groupOrdersByOrderId[\s\S]*?^}/m);
  if (!fn) throw new Error("groupOrdersByOrderId not found");
  if (!fn[0].includes("unitPrice")) throw new Error("group must carry unitPrice");
});

assert("admin can edit unit price in cart modal", () => {
  if (!html.includes("applyCurrentPromoPriceToCartEdit")) throw new Error("missing promo price button");
  if (!html.includes("isAdminEditingCompletedOrder_")) throw new Error("missing completed-order guard");
  if (!html.includes("auditReason")) throw new Error("saveCartEdit must send auditReason");
});

assert("ensureAdminExtrasLoaded loads pricePromotions", () => {
  const fn = html.match(/async function ensureAdminExtrasLoaded_[\s\S]*?^}/m);
  if (!fn) throw new Error("ensureAdminExtrasLoaded_ not found");
  if (!fn[0].includes("pricePromotions")) throw new Error("must sync pricePromotions");
});

console.log("\n" + passed + "/" + (passed + failed) + " passed\n");
process.exit(failed ? 1 : 0);
