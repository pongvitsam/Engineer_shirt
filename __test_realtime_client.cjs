#!/usr/bin/env node
/**
 * Deep static tests for instant/realtime client patterns.
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

const codeJs = fs.readFileSync(path.join(ROOT, "Code.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "JavaScript.html"), "utf8");

console.log("\n=== Realtime / optimistic client tests ===\n");

assert("server lazy-invalidates bootstrap cache on writes", () => {
  if (!/function invalidateDataCache_\(\) \{\s*[\s\S]*?cache\.remove\(CACHE_KEY_BOOTSTRAP\)/.test(codeJs)) {
    throw new Error("invalidateDataCache_ must remove bootstrap cache key");
  }
  if (/function invalidateDataCache_\(\) \{\s*refreshBootstrapCache_\(\);/.test(codeJs)) {
    throw new Error("invalidateDataCache_ must not synchronously warm cache on every write");
  }
});

assert("bootstrap cache key v12", () => {
  if (!codeJs.includes("bootstrap_v13")) throw new Error("expected bootstrap_v13");
});

assert("getBootstrapData uses POST on GitHub Pages", () => {
  if (!html.includes("getBootstrapData: true")) throw new Error("getBootstrapData must be in RPC_POST_METHODS_");
});

assert("ensureAppData single-flight dedupe", () => {
  if (!html.includes("let ensureAppDataInFlight = null")) throw new Error("missing ensureAppDataInFlight");
  if (!/function ensureAppData[\s\S]*ensureAppDataInFlight/.test(html)) {
    throw new Error("ensureAppData must dedupe concurrent fetches");
  }
});

assert("round shirt image upgrades in background", () => {
  if (!html.includes("function scheduleRoundImageUpgrade_")) throw new Error("missing scheduleRoundImageUpgrade_");
  if (!html.includes("function applyRoundDisplayFast_")) throw new Error("missing applyRoundDisplayFast_");
  const core = html.match(/function ensureAppDataCore_[\s\S]*?^}/m);
  if (!core) throw new Error("ensureAppDataCore_ not found");
  if (core[0].includes("await resolveRoundImageForDisplay")) {
    throw new Error("bootstrap must not await resolveRoundImageForDisplay");
  }
  if (!html.includes("function upgradeRoundImageDisplay_")) throw new Error("missing upgradeRoundImageDisplay_");
});

assert("boot skips extra verifySession round-trip", () => {
  const m = html.match(/function bootEntry\(\)\{[\s\S]*?^}/m);
  if (!m) throw new Error("bootEntry not found");
  if (m[0].includes("verifySessionForBoot_")) {
    throw new Error("bootEntry must not call verifySessionForBoot_ (bootstrap returns me)");
  }
  if (!m[0].includes("bootApp()")) throw new Error("bootEntry must call bootApp directly");
});

assert("removeOrderGroup refreshes list row only", () => {
  const m = html.match(/async removeOrderGroup[\s\S]*?showSlipModalMsg/);
  if (!m) throw new Error("removeOrderGroup block not found");
  if (!m[0].includes("refreshAfterOrderListMutation_")) {
    throw new Error("removeOrderGroup must use refreshAfterOrderListMutation_");
  }
  if (!m[0].includes("removed:true")) throw new Error("removeOrderGroup must pass removed:true");
});

assert("slip preview uses smaller Drive thumb", () => {
  const m = html.match(/async viewOrderImage[\s\S]*?async upgradeOrderImagePreview_/);
  if (!m) throw new Error("viewOrderImage block not found");
  if (!m[0].includes("slipDriveThumbUrl_(fileId,400)")) {
    throw new Error("viewOrderImage must use 400px Drive thumb for fast open");
  }
});

assert("fast background sync debounce", () => {
  if (!html.includes("BOOTSTRAP_SYNC_DEBOUNCE_MS = 50")) throw new Error("missing 50ms debounce");
  if (html.includes(", 1200);")) throw new Error("still using 1200ms bootstrap debounce");
});

assert("runBackgroundBootstrapSync refreshes current view", () => {
  if (!html.includes("function runBackgroundBootstrapSync_")) throw new Error("missing runBackgroundBootstrapSync_");
  if (!/runBackgroundBootstrapSync_[\s\S]*refreshCurrentView_/.test(html)) {
    throw new Error("background sync must refresh current view");
  }
});

assert("realtime polling enabled", () => {
  if (!html.includes("function startRealtimePoll_")) throw new Error("missing startRealtimePoll_");
  if (!html.includes("REALTIME_POLL_MS = 30000")) throw new Error("missing poll interval");
  if (!html.includes("startRealtimePoll_();")) throw new Error("poll not started on boot");
});

assert("realtime polling paused on list dashboard report", () => {
  if (!html.includes("REALTIME_POLL_PAUSED_MODULES_")) throw new Error("missing paused modules map");
  if (!html.includes("list: true, dashboard: true, report: true")) throw new Error("expected list/dashboard/report paused");
  if (!html.includes("function updateRealtimePollForModule_")) throw new Error("missing updateRealtimePollForModule_");
  if (!html.includes("updateRealtimePollForModule_(module)")) throw new Error("navigate must update poll by module");
});

assert("report keepLocal skips repaint on paused pages", () => {
  const block = html.match(/async refreshCurrentView_[\s\S]*?^  \},/m);
  if (!block) throw new Error("refreshCurrentView_ not found");
  const body = block[0];
  if (!body.includes('m==="report"')) throw new Error("missing report branch");
  if (!body.includes("report-paid-transfer-table-host")) throw new Error("report must skip keepLocal repaint");
  if (!html.includes("if(isRealtimePollPausedForModule_(mod))return")) throw new Error("scheduleBackgroundBootstrapSync must skip paused modules");
});

assert("snapshot rollback helpers", () => {
  if (!html.includes("function snapshotOrderGroup_")) throw new Error("missing snapshotOrderGroup_");
  if (!html.includes("function restoreOrderGroupSnapshot_")) throw new Error("missing restoreOrderGroupSnapshot_");
});

assert("acceptOrderPayment optimistic before server", () => {
  const m = html.match(/async acceptOrderPayment[\s\S]*?async markOrderFreeGiveaway/);
  if (!m) throw new Error("acceptOrderPayment block not found");
  const block = m[0];
  const applyIdx = block.indexOf('applyLocalOrderPaymentStatus_(orderId,"ชำระเงินแล้ว")');
  const awaitIdx = block.indexOf("await runSaving");
  if (applyIdx < 0 || awaitIdx < 0 || applyIdx > awaitIdx) {
    throw new Error("acceptOrderPayment must apply local status before await runSaving");
  }
});

assert("markOrderFreeGiveaway optimistic before server", () => {
  const m = html.match(/async markOrderFreeGiveaway[\s\S]*?async deleteOrderImage/);
  if (!m) throw new Error("markOrderFreeGiveaway block not found");
  const block = m[0];
  const applyIdx = block.indexOf("applyLocalOrderPaymentStatus_(orderId,PAYMENT_FREE_GIVEAWAY)");
  const awaitIdx = block.indexOf("await runSaving");
  if (applyIdx < 0 || awaitIdx < 0 || applyIdx > awaitIdx) {
    throw new Error("markOrderFreeGiveaway must apply local before await");
  }
});

assert("deleteOrderImage optimistic before server", () => {
  const m = html.match(/async deleteOrderImage[\s\S]*?async viewOrderImage/);
  if (!m) throw new Error("deleteOrderImage block not found");
  const block = m[0];
  const applyIdx = block.indexOf('applyLocalOrderSlipUpdate_(orderId,{slipUrl:""');
  const awaitIdx = block.indexOf("await runSaving");
  if (applyIdx < 0 || awaitIdx < 0 || applyIdx > awaitIdx) {
    throw new Error("deleteOrderImage must apply local before await");
  }
});

assert("submitSlipUpload closes modal before upload", () => {
  const m = html.match(/async submitSlipUpload[\s\S]*?async openPaymentReviewModal/);
  if (!m) throw new Error("submitSlipUpload block not found");
  const block = m[0];
  const closeIdx = block.indexOf("closeSlipUploadModal()");
  const uploadIdx = block.indexOf("uploadOrderImage");
  if (closeIdx < 0 || uploadIdx < 0 || closeIdx > uploadIdx) {
    throw new Error("submitSlipUpload must close modal before uploadOrderImage");
  }
});

assert("submitSlipUpload uses runSaving only for busy toast", () => {
  const m = html.match(/async submitSlipUpload[\s\S]*?async openPaymentReviewModal/);
  if (!m) throw new Error("submitSlipUpload block not found");
  const block = m[0];
  if (/\bshowBusy\s*\(/.test(block)) {
    throw new Error("submitSlipUpload must not call showBusy directly (ref-count leak with runSaving)");
  }
  if (!block.includes("await runSaving")) throw new Error("submitSlipUpload must wrap upload in runSaving");
});

assert("admin background sync skips user list repaint", () => {
  const block = html.match(/async refreshCurrentView_[\s\S]*?^  \},/m);
  if (!block) throw new Error("refreshCurrentView_ not found");
  const body = block[0];
  if (!body.includes('m==="admin"')) throw new Error("missing admin branch");
  if (/keepLocal[\s\S]*admin-users-list[\s\S]*loadUserList/.test(body)) {
    throw new Error("admin keepLocal must not reload user list");
  }
  if (!/keepLocal[\s\S]*admin-users-list[\s\S]*return/.test(body)) {
    throw new Error("admin keepLocal must skip refresh when panel mounted");
  }
  if (!/paintModule\(m\)[\s\S]*initAdmin/.test(body)) {
    throw new Error("admin full refresh must call initAdmin after paint");
  }
});

assert("notification bell and order diff helpers", () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, "Index.html"), "utf8");
  if (!indexHtml.includes("notify-bell-btn")) throw new Error("missing notify bell button");
  if (!html.includes("function processOrderNotifications_")) throw new Error("missing processOrderNotifications_");
  if (!html.includes("function detectOrderNotifications_")) throw new Error("missing detectOrderNotifications_");
  if (!html.includes("order_submit")) throw new Error("missing order_submit notification type");
  if (!html.includes("status_change")) throw new Error("missing status_change notification type");
  if (!html.includes('muteNotifyForOrder_(orderId,120000,"user")')) throw new Error("user-scoped notify mute missing");
});

assert("viewOrderImage opens slip instantly without busy toast", () => {
  const m = html.match(/async viewOrderImage[\s\S]*?async upgradeOrderImagePreview_/);
  if (!m) throw new Error("viewOrderImage block not found");
  const block = m[0];
  if (!block.includes("slipDriveThumbUrl_")) throw new Error("viewOrderImage must use Drive thumbnail fast path");
  if (!block.includes("toast:false")) throw new Error("viewOrderImage must not show global busy toast");
  if (!block.includes("openImageLightbox")) throw new Error("viewOrderImage must open lightbox immediately");
});

assert("submitMultiSizeOrder slip path does not double showBusy", () => {
  const m = html.match(/async submitMultiSizeOrder[\s\S]*?^  \},/m);
  if (!m) throw new Error("submitMultiSizeOrder block not found");
  const slip = m[0].match(/if\(slipFile\)\{[\s\S]*?\}catch\(slipErr\)/);
  if (!slip) throw new Error("slip upload section not found");
  if (/\bshowBusy\s*\(/.test(slip[0])) {
    throw new Error("slip path must not call showBusy inside runSaving");
  }
});

assert("removeOrderGroup optimistic delete", () => {
  const m = html.match(/async removeOrderGroup[\s\S]*?showSlipModalMsg/);
  if (!m) throw new Error("removeOrderGroup block not found");
  const block = m[0];
  if (!block.includes("applyLocalOrderDelete_(orderId)")) throw new Error("missing optimistic delete");
  if (block.indexOf("applyLocalOrderDelete_") > block.indexOf("deleteOrderByOrderId")) {
    throw new Error("delete must be local before server call");
  }
});

assert("applyLocalMutationRefresh recalcs stock", () => {
  if (!html.includes("function applyLocalMutationRefresh_")) throw new Error("missing helper");
  if (!/applyLocalMutationRefresh_[\s\S]*recalcStockFromOrders/.test(html)) {
    throw new Error("mutation refresh must recalc stock");
  }
});

assert("changeGroupStatus still optimistic", () => {
  const m = html.match(/async changeGroupStatus[\s\S]*?async removeOrderGroup/);
  if (!m) throw new Error("changeGroupStatus not found");
  const block = m[0];
  if (block.indexOf("applyLocalOrderStatusUpdate_") > block.indexOf("updateOrderStatusByOrderId")) {
    throw new Error("changeGroupStatus local update must precede server call");
  }
});

assert("order timestamp uses Bangkok formatter on server", () => {
  if (!codeJs.includes("function formatOrderTimestampFromSheet_")) {
    throw new Error("missing formatOrderTimestampFromSheet_");
  }
  if (!/timestamp: String\(formatOrderTimestampFromSheet_/.test(codeJs)) {
    throw new Error("sanitizeOrderForClient_ must use formatOrderTimestampFromSheet_");
  }
  if (codeJs.includes("timestamp: now.toISOString()")) {
    throw new Error("addMultiSizeOrder must not return UTC toISOString timestamp");
  }
});

assert("client converts legacy UTC order timestamps", () => {
  if (!html.includes("function bangkokPartsFromInstant_")) {
    throw new Error("missing bangkokPartsFromInstant_");
  }
  if (!/formatOrderTimestampCell[\s\S]*Z\$\/i\.test/.test(html)) {
    throw new Error("formatOrderTimestampCell must handle Z-suffixed ISO");
  }
  if (/timestamp:.*toISOString|const now=new Date\(\)\.toISOString/.test(html)) {
    throw new Error("optimistic order updates must not use toISOString");
  }
});

assert("slip upload uses canManageOrderSlip not order edit gate", () => {
  if (!html.includes("function canManageOrderSlip_")) throw new Error("missing canManageOrderSlip_");
  const modal = html.match(/_openSlipUploadModalNow_[\s\S]*?closeSlipUploadModal\(\)/);
  if (!modal) throw new Error("_openSlipUploadModalNow_ block not found");
  if (!modal[0].includes("canManageOrderSlip_")) {
    throw new Error("slip modal must gate with canManageOrderSlip_");
  }
  if (modal[0].includes("canUserEditOrderGroup")) {
    throw new Error("slip modal must not use canUserEditOrderGroup");
  }
});

assert("order list filter supports region payment and search", () => {
  if (!html.includes('id="list-payment-filter"')) {
    throw new Error("missing payment filter select");
  }
  if (!html.includes("data-payment-status")) {
    throw new Error("missing payment status row attribute");
  }
  if (!html.includes("ไม่พบออเดอร์ตามตัวกรองที่เลือก")) {
    throw new Error("missing advanced filter empty message");
  }
  if (!html.includes("function buildOrderSearchHaystack_")) throw new Error("missing search haystack");
  if (!html.includes('id="list-search"')) throw new Error("missing list-search input");
});

console.log("\n" + passed + "/" + (passed + failed) + " passed\n");
process.exit(failed ? 1 : 0);
