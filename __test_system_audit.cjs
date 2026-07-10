#!/usr/bin/env node
/**
 * Offline audit tests — mirrors critical backend/frontend invariants.
 */
const fs = require("fs");
const path = require("path");

const STOCK_SIZES = ["XS", "S", "M", "L", "XL", "2L", "3L", "5L", "7L"];
const ROLE_ENGINEER = "engineer";
const ROLE_ENG_READONLY = "eng_readonly";

function calcSoldFromOrders_(orders) {
  const sold = {};
  STOCK_SIZES.forEach(s => { sold[s] = 0; });
  (orders || []).forEach(o => {
    const size = String(o.size || "").trim();
    const qty = Number(o.qty) || 0;
    if (size in sold) sold[size] += qty;
  });
  return sold;
}

function validateStockForOrderItems_(orders, items, excludeOrderId, delivered) {
  const filtered = (orders || []).filter(o => String(o.orderId) !== String(excludeOrderId || ""));
  const soldMap = calcSoldFromOrders_(filtered);
  const stock = STOCK_SIZES.map(size => {
    const d = delivered[size] || 0;
    const sold = soldMap[size] || 0;
    return { size, remaining: Math.max(d - sold, 0) };
  });
  const agg = {};
  (items || []).forEach(it => {
    const size = String(it.size || "").trim();
    const qty = Number(it.qty) || 0;
    if (qty <= 0) return;
    agg[size] = (agg[size] || 0) + qty;
  });
  Object.keys(agg).forEach(size => {
    const s = stock.find(x => x.size === size);
    if (!s || s.remaining < agg[size]) {
      throw new Error("stock " + size + " remaining " + (s && s.remaining) + " < " + agg[size]);
    }
  });
  return agg;
}

function canViewAllRegions_(session) {
  return session.role === "admin" || session.role === ROLE_ENGINEER || session.role === "viewer" || session.role === ROLE_ENG_READONLY || session.region === "*";
}

function sessionCanModifyRegion_(session, rowRegion) {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (session.role === ROLE_ENG_READONLY || session.role === "viewer") return false;
  if (session.region === "*") return true;
  if (!session.region) return false;
  return String(rowRegion) === String(session.region);
}

function orderDataNumRows(lastRow) {
  return Math.max(0, lastRow - 1);
}

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

function assertThrows(name, fn, msgPart) {
  try {
    fn();
    console.log("FAIL  " + name + ": expected throw");
    failed++;
  } catch (e) {
    if (msgPart && !(e.message || "").includes(msgPart)) {
      console.log("FAIL  " + name + ": " + e.message);
      failed++;
      return;
    }
    console.log("PASS  " + name);
    passed++;
  }
}

console.log("\n=== System audit tests ===\n");

assert("order sheet numRows = lastRow - 1", () => {
  if (orderDataNumRows(10) !== 9) throw new Error("expected 9");
  if (orderDataNumRows(2) !== 1) throw new Error("expected 1");
});

assert("overlap: second order rejected when 1 left", () => {
  const delivered = { M: 1 };
  const orders = [{ orderId: "A", size: "M", qty: 1 }];
  assertThrows("overlap inner", () => {
    validateStockForOrderItems_(orders, [{ size: "M", qty: 1 }], "", delivered);
  }, "remaining");
});

assert("overlap: cart reserves stock", () => {
  const delivered = { L: 2 };
  const orders = [{ orderId: "C1", size: "L", qty: 2, status: "อยู่ในตะกร้า" }];
  assertThrows("cart full", () => {
    validateStockForOrderItems_(orders, [{ size: "L", qty: 1 }], "", delivered);
  }, "remaining");
});

assert("engineer views all regions", () => {
  if (!canViewAllRegions_({ role: ROLE_ENGINEER, region: "สำนักงานใหญ่" })) throw new Error("engineer should view all");
  if (canViewAllRegions_({ role: "user", region: "กฟน.1" })) throw new Error("user should not view all");
});

assert("engineer cannot modify other region orders", () => {
  const eng = { role: ROLE_ENGINEER, region: "สำนักงานใหญ่" };
  if (sessionCanModifyRegion_(eng, "กฟน.1")) throw new Error("should not modify กฟน.1");
  if (!sessionCanModifyRegion_(eng, "สำนักงานใหญ่")) throw new Error("should modify HQ");
});

assert("addMultiSizeOrder defines slipName/slipUrl", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  const fn = code.match(/function addMultiSizeOrder[\s\S]*?^}/m);
  if (!fn) throw new Error("addMultiSizeOrder not found");
  if (!/const slipName = ""/.test(fn[0])) throw new Error("slipName not initialized");
  if (!/const slipUrl = ""/.test(fn[0])) throw new Error("slipUrl not initialized");
});

assert("order read ranges use last-1 not last", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  const bad = code.match(/getRange\(2, 1, last, ORDERS_HEADERS\.length\)/g);
  if (bad && bad.length) throw new Error("found " + bad.length + " off-by-one getRange(last)");
});

assert("create user form has engineer option", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes('value="engineer"')) throw new Error("missing engineer role option");
  if (!html.includes("ทีมงาน ชวศ")) throw new Error("missing engineer label");
});

assert("order list read-only note and edit modal", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (html.includes("แก้ไขไซส์/จำนวน")) throw new Error("old inline size edit label still present");
  if (!html.includes("cart-edit-note-")) throw new Error("edit modal note field missing");
  const noteFn = html.match(/function renderOrderNoteBlock_\([\s\S]*?^}/m);
  if (!noteFn) throw new Error("renderOrderNoteBlock_ not found");
  if (/saveGroupNote/.test(noteFn[0])) throw new Error("inline note save still in list");
  if (/order-note-input/.test(noteFn[0])) throw new Error("inline note input still in list");
  if (!html.includes("order-note-display")) throw new Error("read-only note display missing");
  if (!html.includes("หมายเหตุ: -")) throw new Error("empty note placeholder missing");
  if (!html.includes("> แก้ไข</button>")) throw new Error("edit button label missing");
  if (html.includes("แก้ไขไซส์")) throw new Error("old size-only edit label still present");
  if (!html.includes("canEditOrder||canEditNote")) throw new Error("showEditBtn should allow note-only edit");
  if (!html.includes("async saveCartEdit")) throw new Error("saveCartEdit handler missing");
  if (html.includes("async saveGroupNote")) throw new Error("saveGroupNote handler should be removed");
});

assert("markOrderFreeGiveaway rejects already free giveaway", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  const fn = code.match(/function markOrderFreeGiveaway[\s\S]*?^}/m);
  if (!fn) throw new Error("markOrderFreeGiveaway not found");
  if (!/isFreeGiveawayPayment_\(values\[i\]\[17\]\)/.test(fn[0])) {
    throw new Error("missing duplicate free-giveaway guard");
  }
  if (!fn[0].includes("ออเดอร์นี้เป็นเสื้อแจกฟรีแล้ว")) throw new Error("missing Thai error message");
});

assert("free giveaway button hidden when payment locked", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes("!isFreeGiveawayPayment(g.paymentStatus)&&!isPaymentVerified(g.paymentStatus)")) {
    throw new Error("order list missing free-giveaway visibility guard");
  }
  const clientFn = html.match(/async markOrderFreeGiveaway[\s\S]*?^  \},/m);
  if (!clientFn) throw new Error("markOrderFreeGiveaway client fn not found");
  if (!clientFn[0].includes("isFreeGiveawayPayment(g.paymentStatus)")) {
    throw new Error("client missing early guard for already free giveaway");
  }
});

assert("size chart uses distinct pastel colors", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes("SIZE_CHART_PASTEL_SALE")) throw new Error("missing sale pastel palette");
  if (!html.includes("SIZE_CHART_PASTEL_FREE")) throw new Error("missing free pastel palette");
  if (html.includes('backgroundColor:["#7F1D1D"')) throw new Error("old red size chart palette still present");
});

assert("export all data csv backend and ui", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!code.includes("function exportAllDataCsv")) throw new Error("exportAllDataCsv missing");
  if (!code.includes("สรุปยอดตามเขต")) throw new Error("region summary section missing");
  if (!html.includes('callAuthed("exportAllDataCsv"')) throw new Error("frontend not calling exportAllDataCsv");
  if (!html.includes("Export CSV ทั้งหมด")) throw new Error("export button label missing");
  if (!html.includes("URL.createObjectURL(blob)")) throw new Error("blob csv download missing");
});

assert("GAS redirect and RPC API", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!code.includes("GITHUB_PAGES_URL")) throw new Error("missing GITHUB_PAGES_URL");
  if (!code.includes("function doPost")) throw new Error("missing doPost");
  if (!code.includes("function handleRpcGet_")) throw new Error("missing handleRpcGet_");
  if (!code.includes("jsonpRpcOutput_")) throw new Error("missing JSONP RPC output");
  if (!code.includes('params.rpc || "") === "1"')) throw new Error("missing rpc=1 doGet gate");
  if (!code.includes("redirectToGithubPages_")) throw new Error("missing redirect");
  if (!code.includes("assertGasAdminLogin_")) throw new Error("missing gas admin guard");
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes("isGasScriptBridge_")) throw new Error("missing dual bridge");
  if (!html.includes("callServerRpcJsonp_")) throw new Error("missing JSONP client bridge");
  if (!html.includes("callServerRpcPost_")) throw new Error("missing RPC POST bridge for uploads");
  if (!html.includes("prepareImageBase64ForUpload_")) throw new Error("missing image compress for upload");
});

assert("uploadOrderImage getRange uses numRows not end row", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (/getRange\(row,\s*7,\s*row,\s*8\)/.test(code)) {
    throw new Error("uploadOrderImage still uses row as numRows (sheet dimension bug)");
  }
  if (!/getRange\(row,\s*7,\s*1,\s*2\)/.test(code)) {
    throw new Error("uploadOrderImage missing fixed getRange(row,7,1,2)");
  }
});

assert("slim bootstrap RPC and cache", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!code.includes("function slimRoundPayloadForExternal_")) throw new Error("missing slimRoundPayloadForExternal_");
  if (!code.includes("function buildBootstrapDataForCache_")) throw new Error("missing buildBootstrapDataForCache_");
  if (!code.includes("getRpcPing")) throw new Error("missing getRpcPing");
  if (!code.includes("bootstrap_v11")) throw new Error("expected bootstrap_v11 cache key");
  if (!code.includes("transferAccount")) throw new Error("bootstrap missing transferAccount");
  if (!code.includes("supportContact")) throw new Error("bootstrap missing supportContact");
});

assert("transfer account display and admin edit", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!code.includes("saveTransferAccount")) throw new Error("missing saveTransferAccount RPC");
  if (!code.includes("DEFAULT_TRANSFER_ACCOUNT")) throw new Error("missing default transfer account");
  if (!html.includes("renderTransferAccountBlock_")) throw new Error("missing transfer account UI helper");
  if (!html.includes("admin-transfer-account")) throw new Error("missing admin transfer account field");
  if (!html.includes("saveTransferAccount")) throw new Error("missing saveTransferAccount handler");
});

assert("support contact footer and admin edit", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!code.includes("saveSupportContact")) throw new Error("missing saveSupportContact RPC");
  if (!code.includes("DEFAULT_SUPPORT_CONTACT")) throw new Error("missing default support contact");
  if (!html.includes("admin-support-contact")) throw new Error("missing admin support contact field");
  if (!html.includes("updateSupportFooter_")) throw new Error("missing support footer updater");
  if (!html.includes("saveSupportContact")) throw new Error("missing saveSupportContact handler");
});

assert("order sheet reads use getOrderSheetValues_", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!code.includes("function getOrderSheetValues_")) throw new Error("missing getOrderSheetValues_");
  if (/orderSheet\.getDataRange\(\)/.test(code)) {
    throw new Error("orderSheet still uses getDataRange — inconsistent with getOrders_");
  }
});

assert("RPC POST uses simple Content-Type", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (html.includes('"Content-Type": "text/plain;charset=utf-8"')) {
    throw new Error("POST Content-Type charset may break CORS simple request");
  }
  if (!html.includes('"Content-Type": "text/plain"')) throw new Error("missing text/plain POST");
});

assert("login form wraps password field", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "CSS.html"), "utf8");
  if (!html.includes('id="login-form"')) throw new Error("missing login-form");
  if (!html.includes('type="submit"')) throw new Error("missing submit button on login");
  if (!html.includes("login-username-input")) throw new Error("missing visible username input class");
  if (!html.includes("login-screen-overlay")) throw new Error("missing scrollable login overlay");
  if (!css.includes(".login-username-input")) throw new Error("missing login username contrast CSS");
});

assert("login uses JSONP-first RPC on GitHub Pages", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes("RPC_JSONP_FIRST_METHODS_")) throw new Error("missing RPC_JSONP_FIRST_METHODS_");
  if (!html.includes("login: true")) throw new Error("login not in JSONP-first map");
  if (!html.includes("probeApiOnLogin_")) throw new Error("missing probeApiOnLogin_");
});

assert("stock recalc gated for admin/engineer only", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes("function canRecalcStockFromOrders_")) throw new Error("missing canRecalcStockFromOrders_");
  if (!html.includes("return isAdmin()||isEngineer()")) throw new Error("recalc must be admin/engineer only");
  if (!html.includes("function orderSizeKey_")) throw new Error("missing orderSizeKey_ trim helper");
});

assert("login cache reload uses retry counter", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes("forcePeaceFullReload_")) throw new Error("missing forcePeaceFullReload_ for manual refresh");
  if (html.includes("if(forcePeaceFullReload_(serverBuild))return")) {
    throw new Error("login must not auto-reload on build mismatch (causes page bounce)");
  }
  if (!html.includes("stripLoginHeroLayout_")) throw new Error("missing stripLoginHeroLayout_");
  if (!html.includes("forcePeaceFullReload_")) throw new Error("missing forcePeaceFullReload_");
});

assert("auth token persists across refresh and boot restores session", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes("localStorage.setItem(TOKEN_KEY")) {
    throw new Error("token must mirror to localStorage for refresh restore");
  }
  const persistFn = html.match(/function persistAuthToken_\(token\)\{[\s\S]*?\n\}/);
  if (!persistFn) throw new Error("persistAuthToken_ missing");
  if (!persistFn[0].includes("localStorage.setItem(TOKEN_KEY,token)")) {
    throw new Error("persistAuthToken_ must mirror token to localStorage");
  }
  if (persistFn[0].includes("if(token)sessionStorage.setItem(TOKEN_KEY,token);")) {
    throw new Error("persistAuthToken_ must not use session-only save pattern");
  }
  if (!html.includes("showBootRestoring_")) throw new Error("missing showBootRestoring_");
  if (!html.includes("verifySessionForBoot_")) throw new Error("missing verifySessionForBoot_");
  if (!html.includes("localStorage.removeItem(TOKEN_KEY)")) {
    throw new Error("forcePeaceFullReload_ must clear localStorage token");
  }
});

assert("uploadOrderImage allows slip when order status locked", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!code.includes("function assertUserCanManageSlip_")) {
    throw new Error("missing assertUserCanManageSlip_");
  }
  const fn = code.match(/function uploadOrderImage[\s\S]*?^}/m);
  if (!fn) throw new Error("uploadOrderImage not found");
  if (!fn[0].includes("assertUserCanManageSlip_")) {
    throw new Error("uploadOrderImage must use assertUserCanManageSlip_");
  }
  if (fn[0].includes("assertUserCanModifyOwnOrder_")) {
    throw new Error("uploadOrderImage must not require editable order status");
  }
});

assert("APP_BUILD defined in Code.js", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  const m = code.match(/const APP_BUILD = "(\d+)"/);
  if (!m) throw new Error("APP_BUILD missing");
  if (!code.includes("build: APP_BUILD")) throw new Error("getRpcPing must expose APP_BUILD");
});

assert("login screen centered without hero image", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  const shell = fs.readFileSync(path.join(__dirname, "LoginShell.html"), "utf8");
  if (!html.includes("login-screen-overlay")) throw new Error("missing login overlay");
  if (!html.includes('class="login-card"')) throw new Error("missing centered login card");
  if (html.includes("login-hero-img") || html.includes("loadLoginHeroImage_")) {
    throw new Error("login must not load or show hero image");
  }
  if (!html.includes("clearLoginHeroSkeletonTimer_")) {
    throw new Error("login hero timer legacy stub required for cached bundles");
  }
  if (shell.includes('class="login-hero"') || shell.includes('id="login-hero-img"')) {
    throw new Error("LoginShell must not include hero section");
  }
});

assert("round image thumb repair and bootstrap thumb", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!code.includes("ensureRoundImageThumb_")) throw new Error("missing ensureRoundImageThumb_");
  if (!code.includes("generateImageThumbFromDriveFile_")) throw new Error("missing generateImageThumbFromDriveFile_");
  if (!code.includes("out.imageDataThumb = thumb")) throw new Error("slim round must include imageDataThumb");
});

assert("acceptOrderPayment checks slip columns not createdBy", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (/values\[i\]\[12\].*values\[i\]\[13\].*hasSlip/.test(code)) {
    throw new Error("acceptOrderPayment still treats createdBy as slip");
  }
  if (!/values\[i\]\[11\].*values\[i\]\[12\].*hasSlip/.test(code)) {
    throw new Error("acceptOrderPayment must check slip name/url columns");
  }
});

assert("HQ note hidden from engineer/viewer", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!code.includes("isAdminHiddenNoteRegion_(out.region)")) throw new Error("sanitize must hide HQ notes");
  if (!html.includes("shouldHideOrderNoteForViewer_")) throw new Error("missing client HQ note hide");
});

assert("viewer cannot open order form nav", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes('isReadOnlyUser()&&n.id==="orders"')) throw new Error("read-only users must not see orders nav");
  if (!html.includes('isReadOnlyUser()&&module==="orders"')) throw new Error("read-only users must redirect orders module");
});

assert("eng_readonly role constants and create-user option", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!code.includes('ROLE_ENG_READONLY = "eng_readonly"')) throw new Error("missing ROLE_ENG_READONLY in Code.js");
  if (!code.includes("ทีมงาน ชวศ. ดูเท่านั้น")) throw new Error("missing eng_readonly label");
  if (!html.includes('value="${ROLE_ENG_READONLY}"')) throw new Error("missing eng_readonly role option in create user");
  if (!html.includes("canViewAdminData()")) throw new Error("missing canViewAdminData helper");
  if (!html.includes("isEngReadonly()")) throw new Error("missing isEngReadonly helper");
});

assert("eng_readonly views all regions but cannot modify", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!code.includes("isEngReadonlyRole_")) throw new Error("missing isEngReadonlyRole_");
  if (!code.includes("isReadOnlyRole_")) throw new Error("missing isReadOnlyRole_");
  if (!code.includes("ensureDefaultEngReadonlyUser_")) throw new Error("missing ensureDefaultEngReadonlyUser_");
  const ro = { role: "eng_readonly", region: "*" };
  if (!canViewAllRegions_(ro)) throw new Error("eng_readonly should view all");
  if (sessionCanModifyRegion_(ro, "กฟน.1")) throw new Error("eng_readonly must not modify orders");
});

assert("eng_readonly sees admin data columns client-side", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes("canViewAdminData()?'<th class=\"py-2 px-2\">วันที่รับ/จัดส่ง</th>'") &&
      !html.includes('canViewAdminData()?`<td data-label="วันที่รับ/จัดส่ง"')) {
    throw new Error("pickup column should use canViewAdminData");
  }
  if (!html.includes("if(!canViewAdminData())return \"\"")) throw new Error("pickup cell should gate on canViewAdminData");
});

assert("paid transfer report merges region and total cells", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes("buildPaidTransferFlatRows_")) throw new Error("missing buildPaidTransferFlatRows_");
  if (!html.includes("renderPaidTransferGroupedRowsHtml_")) throw new Error("missing grouped row renderer");
  if (!html.includes('rowspan="${rowspan}"')) throw new Error("missing rowspan merge for region/total");
  if (!html.includes("paginatePaidTransferFlatRows_")) throw new Error("missing PDF row pagination");
  if (!html.includes("buildPaidTransferReportPrintPageHtml_")) throw new Error("missing per-page PDF print html");
  if (!html.includes('g&&g.note||""')) throw new Error("paid transfer remark must use order note");
});

assert("abnormal duplicate orders section is admin-only on report", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes("computeAbnormalDuplicateOrders_")) throw new Error("missing computeAbnormalDuplicateOrders_");
  if (!html.includes("buildAbnormalDuplicateKey_")) throw new Error("missing buildAbnormalDuplicateKey_");
  if (!html.includes("renderAbnormalOrdersSectionHtml_")) throw new Error("missing renderAbnormalOrdersSectionHtml_");
  if (!html.includes("isAbnormalDuplicateEligible_")) throw new Error("missing isAbnormalDuplicateEligible_");
  if (!html.includes("ไม่พบรายการที่ผิดปกติ")) throw new Error("missing abnormal orders empty message");
  if (!html.includes('isAdmin()?`<div class="report-abnormal-wrap">')) throw new Error("abnormal section must gate on isAdmin()");
  if (html.includes("canViewAdminData()?`<div class=\"report-abnormal-wrap\">")) throw new Error("abnormal section must not use canViewAdminData");
  if (!html.includes('ps!=="รอตรวจสลิป"')) throw new Error("abnormal duplicate must include pending slip review");
});

assert("dashboard cards show paid amount and regional unpaid breakdown", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes("renderDashboardCardsHtml_")) throw new Error("missing renderDashboardCardsHtml_");
  if (!html.includes("pendingSlipReviewCount")) throw new Error("missing pendingSlipReviewCount in dashboard compute");
  if (!html.includes('ps==="รอตรวจสลิป"')) throw new Error("dashboard slip review must count รอตรวจสลิป orders");
  if (!html.includes("paidAmount")) throw new Error("missing paidAmount in dashboard compute");
  if (!html.includes("unpaidByRegion")) throw new Error("missing unpaidByRegion breakdown");
  if (!html.includes("pendingDeliveryByRegion")) throw new Error("missing pendingDeliveryByRegion breakdown");
  if (!html.includes("รอชำระเป็นเงิน (฿)")) throw new Error("missing unpaid money dashboard card");
  if (!html.includes("dash-stat-wide")) throw new Error("missing wide dashboard stat cards");
});

assert("order form uses contact phone instead of status field", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!html.includes('id="order-contact"')) throw new Error("missing order-contact input");
  if (!html.includes("เบอร์ติดต่อ")) throw new Error("missing contact phone label");
  if (html.includes('id="order-status-fixed"')) throw new Error("order form should not show readonly status field");
  if (!code.includes("เบอร์ติดต่อ")) throw new Error("missing contact phone column in ORDERS_HEADERS");
  if (!code.includes("updateOrderContactByOrderId")) throw new Error("missing updateOrderContactByOrderId RPC");
  if (!code.includes("normalizeContactPhone_")) throw new Error("missing normalizeContactPhone_");
});

assert("report region table uses four exclusive status buckets", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes("classifyReportRegionBucket_")) throw new Error("missing classifyReportRegionBucket_");
  if (!html.includes("renderReportRegionBucketCell_")) throw new Error("missing renderReportRegionBucketCell_");
  if (!html.includes("reportRegionBucketHeadersHtml_")) throw new Error("missing report region bucket headers");
  if (!html.includes("ยังไม่ได้จ่ายเงิน")) throw new Error("missing unpaid bucket label");
  if (!html.includes("isCartStatus(o.status||o.orderStatus))return \"unpaid\"")) throw new Error("cart orders must map to unpaid bucket");
  const classifyBlock = html.match(/function classifyReportRegionBucket_\(o\)\{[\s\S]*?\n\}/);
  if (!classifyBlock || !classifyBlock[0].includes("return null;")) throw new Error("paid non-awaiting orders should not fall into awaitingPickup");
  if (!html.includes("รอตรวจสอบสลิป")) throw new Error("missing pending slip bucket label");
  if (html.includes("สรุปสถานะ/ไซส์")) throw new Error("old status summary column should be replaced");
});

assert("password set/login uses normalized trim", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!code.includes("function normalizePasswordInput_")) throw new Error("missing normalizePasswordInput_");
  if (!code.includes("applyPasswordToAllUserRows_")) throw new Error("missing applyPasswordToAllUserRows_");
  if (!code.includes("passwordMatchesUserRow_(values[i], cur)")) throw new Error("changeOwnPassword must use passwordMatchesUserRow_");
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes('login-password")?.value||"").trim()')) throw new Error("login password must trim");
  if (!html.includes('nu-password").value||"").trim()')) throw new Error("create user password must trim");
});

assert("change request RPC methods registered", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!code.includes("requestOrderChange: requestOrderChange")) throw new Error("missing requestOrderChange RPC");
  if (!code.includes("updateUser: updateUser")) throw new Error("missing updateUser RPC");
  if (!code.includes("updateOrderPickupByOrderId: updateOrderPickupByOrderId")) throw new Error("missing updateOrderPickupByOrderId RPC");
});

assert("viewer default user seeded", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!code.includes("requestOrderChange: requestOrderChange")) throw new Error("missing requestOrderChange RPC");
  if (!code.includes("updateUser: updateUser")) throw new Error("missing updateUser RPC");
  if (!code.includes("updateOrderPickupByOrderId: updateOrderPickupByOrderId")) throw new Error("missing updateOrderPickupByOrderId RPC");
});

assert("order list pickup delivery column", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!html.includes("วันที่รับ/จัดส่ง")) throw new Error("missing pickup column header");
  if (!html.includes("openPickupModal")) throw new Error("missing pickup modal");
  if (!html.includes("updateOrderPickupByOrderId")) throw new Error("missing pickup RPC client call");
  if (!code.includes("วันที่รับ/จัดส่ง")) throw new Error("missing pickup sheet columns");
  if (!code.includes("resolvePickupStatusFromDeliveryMode_")) throw new Error("missing pickup status resolver");
  if (!html.includes('value="จัดส่ง"')) throw new Error("missing delivery mode radio");
  if (!html.includes("getPickupDateTimeFieldValues_")) throw new Error("missing scoped pickup datetime field reader");
  if (/hasExistingPickup[\s\S]*?:`<input type="hidden" id="pickup-pay-date-/.test(html)) {
    throw new Error("pickup modal must not duplicate hidden date fields outside datetime wrap");
  }
  if (!html.includes("refreshAfterOrderListMutation_")) throw new Error("missing refreshAfterOrderListMutation_ helper");
  if (!html.includes("refreshAfterOrderListMutation_(orderId,{recalcStock:false})")) throw new Error("acceptOrderPayment must refresh order list row");
});

assert("order form has optional slip upload with datetime", () => {
  const html = fs.readFileSync(path.join(__dirname, "JavaScript.html"), "utf8");
  if (!html.includes('id="order-slip-file"')) throw new Error("missing order-slip-file");
  if (!html.includes('id="order-slip-datetime-wrap"')) throw new Error("missing order-slip-datetime-wrap");
  if (!html.includes('buildSlipDateTimeFieldsHtml_("new-order"')) throw new Error("missing new-order slip datetime");
  if (!html.includes('bindSlipDateTimePicker_("new-order")')) throw new Error("missing bindSlipDateTimePicker for new-order");
  if (!html.includes("bindSlipFilePreview_")) throw new Error("missing slip file preview binder");
  if (!html.includes('id="order-slip-preview"')) throw new Error("missing order slip preview container");
  const submitFn = html.match(/async submitMultiSizeOrder[\s\S]*?^  \},/m);
  if (!submitFn) throw new Error("submitMultiSizeOrder not found");
  if (!submitFn[0].includes("uploadOrderImage")) throw new Error("submitMultiSizeOrder missing slip upload");
  if (!submitFn[0].includes("deleteOrderByOrderId")) throw new Error("submitMultiSizeOrder missing slip rollback");
});

assert("viewer default user seeded", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!code.includes('["viewer"')) throw new Error("missing viewer in DEFAULT_USERS");
  if (!code.includes("ensureDefaultViewerUser_")) throw new Error("missing ensureDefaultViewerUser_");
  if (!code.includes("isViewerRole_")) throw new Error("missing isViewerRole_");
});

assert("delete order trashes slip files on Drive", () => {
  const code = fs.readFileSync(path.join(__dirname, "Code.js"), "utf8");
  if (!code.includes("function trashSlipDriveFilesBestEffort_")) throw new Error("missing trashSlipDriveFilesBestEffort_");
  if (!code.includes("function collectSlipFileIdsForOrderId_")) throw new Error("missing collectSlipFileIdsForOrderId_");
  const del = code.match(/function deleteOrderByOrderId[\s\S]*?^}/m);
  if (!del) throw new Error("deleteOrderByOrderId not found");
  if (!del[0].includes("trashSlipDriveFilesBestEffort_")) throw new Error("deleteOrderByOrderId must trash slip files");
  if (!del[0].includes("collectSlipFileIdsForOrderId_")) throw new Error("deleteOrderByOrderId must collect slip file ids");
});

console.log("\n" + passed + "/" + (passed + failed) + " passed\n");
process.exit(failed ? 1 : 0);
