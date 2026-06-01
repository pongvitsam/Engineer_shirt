// =====================================================================
// PEACE Engineer Club — Shirt Sales System (Apps Script back-end)
// RBAC + Multi-size orders + Speed optimizations
// =====================================================================

// === Web app entry =====================================================
/** Public GitHub Pages frontend (repo: Engineer_shirt) */
const GITHUB_PAGES_URL = "https://pongvitsam.github.io/Engineer_shirt/";

const RPC_PUBLIC_METHODS_ = {
  login: true,
  logout: true,
  verifySession: true,
  getGuestStockData: true,
  getImageProxy: true,
  getRpcPing: true
};

function doGet(e) {
  e = e || {};
  const params = e.parameter || {};
  const asset = String(params.asset || "").toLowerCase();

  // GitHub Pages / external frontend — JSONP (no CORS preflight)
  if (String(params.rpc || "") === "1") {
    return handleRpcGet_(params);
  }

  if (asset === "js") {
    return ContentService
      .createTextOutput(getClientJs_())
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  // Default GAS URL → GitHub Pages (primary app)
  if (String(params.gas || "") !== "1") {
    return redirectToGithubPages_();
  }

  // ?gas=1 → legacy GAS-hosted UI (admin login only)
  const tpl = HtmlService.createTemplateFromFile("Index");
  tpl.assetBaseUrl = ScriptApp.getService().getUrl();
  tpl.assetVersion = APP_BUILD;
  tpl.gasAdminOnly = true;

  return tpl.evaluate()
    .setTitle("ระบบจัดการขายเสื้อชมรมวิศวกร กฟภ. (แอดมิน GAS)")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
}

function doPost(e) {
  return handleRpcPost_(e);
}

function redirectToGithubPages_() {
  const url = getGithubPagesUrl_();
  const html = "<!DOCTYPE html><html lang=\"th\"><head><meta charset=\"utf-8\">" +
    "<meta http-equiv=\"refresh\" content=\"0;url=" + url + "\">" +
    "<script>location.replace(" + JSON.stringify(url) + ");</script></head>" +
    "<body style=\"font-family:sans-serif;text-align:center;padding:2rem\">" +
    "<p>กำลังไปยังแอปหลัก… <a href=\"" + url + "\">คลิกที่นี่</a></p>" +
    "<p style=\"font-size:.85rem;opacity:.7\">แอดมิน GAS: เพิ่ม <code>?gas=1</code> ที่ท้าย URL</p>" +
    "</body></html>";
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getGithubPagesUrl_() {
  return GITHUB_PAGES_URL;
}

function getGasWebAppUrl_() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (err) {
    return "";
  }
}

function jsonRpcOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpRpcOutput_(callback, payload) {
  const safeCb = String(callback || "peaceRpcCb").replace(/[^a-zA-Z0-9_]/g, "") || "peaceRpcCb";
  return ContentService.createTextOutput(safeCb + "(" + JSON.stringify(payload) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function parseRpcBody_(payloadRaw) {
  const raw = String(payloadRaw || "").trim();
  if (!raw) throw new Error("ไม่มี payload");
  return JSON.parse(raw);
}

function handleRpcGet_(params) {
  try {
    const body = parseRpcBody_(params.payload);
    const method = String(body.method || "").trim();
    const args = Array.isArray(body.args) ? body.args : [];
    const gasAdminOnly = body.gasAdminOnly === true;
    if (!method) throw new Error("ไม่ระบุ method");
    const result = invokeRpc_(method, args, { gasAdminOnly: gasAdminOnly });
    const envelope = { ok: true, result: result };
    const callback = String(params.callback || "").trim();
    if (callback) return jsonpRpcOutput_(callback, envelope);
    return jsonRpcOutput_(envelope);
  } catch (err) {
    const envelope = { ok: false, error: String(err && err.message ? err.message : err) };
    const callback = String(params.callback || "").trim();
    if (callback) return jsonpRpcOutput_(callback, envelope);
    return jsonRpcOutput_(envelope);
  }
}

function handleRpcPost_(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    const body = JSON.parse(raw);
    const method = String(body.method || "").trim();
    const args = Array.isArray(body.args) ? body.args : [];
    const gasAdminOnly = body.gasAdminOnly === true;
    if (!method) throw new Error("ไม่ระบุ method");
    const result = invokeRpc_(method, args, { gasAdminOnly: gasAdminOnly });
    return jsonRpcOutput_({ ok: true, result: result });
  } catch (err) {
    return jsonRpcOutput_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function invokeRpc_(method, args, options) {
  options = options || {};
  if (!RPC_PUBLIC_METHODS_[method]) {
    const token = args[0];
    if (!readSession_(token)) {
      throw new Error("กรุณาเข้าสู่ระบบใหม่");
    }
  }
  const fn = {
    login: login,
    logout: logout,
    verifySession: verifySession,
    getGuestStockData: getGuestStockData,
    getRpcPing: getRpcPing,
    getBootstrapData: getBootstrapData,
    addMultiSizeOrder: addMultiSizeOrder,
    updateOrderStatusByOrderId: updateOrderStatusByOrderId,
    updateOrderNoteByOrderId: updateOrderNoteByOrderId,
    uploadOrderImage: uploadOrderImage,
    deleteOrderImage: deleteOrderImage,
    getOrderImage: getOrderImage,
    deleteOrderByOrderId: deleteOrderByOrderId,
    updateCartOrderByOrderId: updateCartOrderByOrderId,
    submitCartOrderToAdmin: submitCartOrderToAdmin,
    acceptOrderPayment: acceptOrderPayment,
    markOrderFreeGiveaway: markOrderFreeGiveaway,
    getImageProxy: getImageProxy,
    listUsers: listUsers,
    createUser: createUser,
    getUserPassword: getUserPassword,
    resetPassword: resetPassword,
    changeOwnPassword: changeOwnPassword,
    deleteUser: deleteUser,
    uploadShirtImage: uploadShirtImage,
    saveRoundConfig: saveRoundConfig,
    saveStockDelivered: saveStockDelivered,
    resetAllData: resetAllData,
    exportAllDataCsv: exportAllDataCsv,
    exportOrdersCsv: exportOrdersCsv
  }[method];
  if (!fn) throw new Error("ไม่รองรับ method: " + method);
  const result = fn.apply(null, args);
  if (method === "login" && options.gasAdminOnly) {
    assertGasAdminLogin_(result);
  }
  return result;
}

function assertGasAdminLogin_(loginResult) {
  const role = loginResult && loginResult.role ? String(loginResult.role).trim() : "";
  if (role !== "admin") {
    if (loginResult && loginResult.token) {
      try {
        PropertiesService.getScriptProperties().deleteProperty(sessionKey_(loginResult.token));
      } catch (_) {}
    }
    throw new Error("โหมด GAS ใช้ได้เฉพาะแอดมิน — ผู้ใช้ทั่วไปให้ใช้งานผ่าน " + getGithubPagesUrl_());
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getClientJs_() {
  const raw = HtmlService.createHtmlOutputFromFile("JavaScript").getContent();
  return stripSingleTag_(raw, "script");
}

function stripSingleTag_(html, tagName) {
  const re = new RegExp("<" + tagName + "[^>]*>([\\s\\S]*)<\\/" + tagName + ">", "i");
  const m = String(html || "").match(re);
  return m ? m[1] : String(html || "");
}

// === Configuration =====================================================
const SHEET_ID = "1b0JU3SP1ggxVjxRcdGiZVAudr84UkxK7oIb0kPvZsec";
const ROUND_SHEET = "Round";
const STOCK_SHEET = "Stock";
const SIZE_CHART_SHEET = "SizeChart";
const ORDER_SHEET = "Orders";
const SETTINGS_SHEET = "Settings";
const USERS_SHEET = "Users";

const DRIVE_FOLDER_ID = "1WeczG1IR0uhIuLHXUMRpnHGBBIWO_OLq";
const SLIP_FOLDER_ID = "1DEVjMCddEwMINp3suq1PkoOB6ZprNdJL";

const DEFAULT_UNIT_PRICE = 350;
const DEFAULT_ROUND = "2569";
const DEFAULT_IMAGE = "https://placehold.co/600x400/7F1D1D/FFFFFF?text=PEACE+Engineer+Club";
const ROUND_HEADERS = ["รอบปี", "ชื่อสินค้า", "ราคาต่อตัว", "รูปภาพ", "Active", "รูปย่อ(base64)"];
const MAX_THUMB_BYTES = 20000;

const CACHE_TTL_SEC = 90;
const CACHE_KEY_BOOTSTRAP = "bootstrap_v6";
const APP_BUILD = "117";
const ROLE_ENGINEER = "engineer";
const ROLE_ENGINEER_LABEL = "ทีมงาน ชวศ";
const SHEETS_READY_KEY = "SHEETS_READY_V5";

const SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 7 days
const SESSION_PREFIX = "sess_";
const PASSWORD_SALT = "::peace_pea_engineer_club";

const PEA_REGIONS = [
  "กฟน.1", "กฟน.2", "กฟน.3",
  "กฟฉ.1", "กฟฉ.2", "กฟฉ.3",
  "กฟต.1", "กฟต.2", "กฟต.3",
  "กฟก.1", "กฟก.2", "กฟก.3",
  "สำนักงานใหญ่"
];

/** Order notes from this region are hidden from admin viewers. */
const ADMIN_NOTE_HIDDEN_REGION = "สำนักงานใหญ่";

function isAdminHiddenNoteRegion_(region) {
  return String(region || "").trim() === ADMIN_NOTE_HIDDEN_REGION;
}

const STOCK_SIZES = ["XS", "S", "M", "L", "XL", "2L", "3L", "5L", "7L"];

const DEFAULT_DELIVERED = {
  XS: 0, S: 0, M: 38, L: 60, XL: 56, "2L": 32, "3L": 8, "5L": 3, "7L": 3
};

const DEFAULT_SIZE_CHART = [
  ["XS", 36, 25], ["S", 38, 26], ["M", 40, 27], ["L", 42, 28],
  ["XL", 44, 29], ["2L", 46, 30], ["3L", 48, 31], ["5L", 52, 32], ["7L", 56, 33]
];

const PICKUP_STATUS = ["รอโอน", "รอส่ง", "จัดส่งแล้ว", "รอรับ", "รับแล้ว"];
const ORDER_STATUS_CART = "อยู่ในตะกร้า";
const ORDER_STATUS_ORDERED = "สั่งออเดอร์แล้ว";
const USER_EDITABLE_STATUSES = [ORDER_STATUS_ORDERED, "รอโอน"];
const USER_LOCKED_STATUSES = ["รอส่ง", "จัดส่งแล้ว", "รอรับ", "รับแล้ว"];
const ADMIN_ORDER_STATUS = [ORDER_STATUS_ORDERED].concat(PICKUP_STATUS);
const SUBMITTED_ORDER_STATUSES = ADMIN_ORDER_STATUS.slice();
const CHANGE_REQUEST_STATUS = {
  NONE: "none",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
};

const PAYMENT_STATUS = {
  NONE: "",
  PENDING_REVIEW: "รอตรวจสลิป",
  VERIFIED: "ชำระเงินแล้ว",
  FREE_GIVEAWAY: "เสื้อแจกฟรี"
};

const DEFAULT_USERS = [
  ["admin1",  "Admin@2569", "admin", "*",            "ผู้ดูแลระบบ 1"],
  ["admin2",  "Admin@2569", "admin", "*",            "ผู้ดูแลระบบ 2"],
  ["user_n1", "Peace@2569", "user",  "กฟน.1",        "ผู้ใช้งานเขต กฟน.1"],
  ["user_n2", "Peace@2569", "user",  "กฟน.2",        "ผู้ใช้งานเขต กฟน.2"],
  ["user_n3", "Peace@2569", "user",  "กฟน.3",        "ผู้ใช้งานเขต กฟน.3"],
  ["user_c1", "Peace@2569", "user",  "กฟฉ.1",        "ผู้ใช้งานเขต กฟฉ.1"],
  ["user_c2", "Peace@2569", "user",  "กฟฉ.2",        "ผู้ใช้งานเขต กฟฉ.2"],
  ["user_c3", "Peace@2569", "user",  "กฟฉ.3",        "ผู้ใช้งานเขต กฟฉ.3"],
  ["user_s1", "Peace@2569", "user",  "กฟต.1",        "ผู้ใช้งานเขต กฟต.1"],
  ["user_s2", "Peace@2569", "user",  "กฟต.2",        "ผู้ใช้งานเขต กฟต.2"],
  ["user_s3", "Peace@2569", "user",  "กฟต.3",        "ผู้ใช้งานเขต กฟต.3"],
  ["user_e1", "Peace@2569", "user",  "กฟก.1",        "ผู้ใช้งานเขต กฟก.1"],
  ["user_e2", "Peace@2569", "user",  "กฟก.2",        "ผู้ใช้งานเขต กฟก.2"],
  ["user_e3", "Peace@2569", "user",  "กฟก.3",        "ผู้ใช้งานเขต กฟก.3"],
  ["user_hq", "Peace@2569", "user",  "สำนักงานใหญ่", "ผู้ใช้งานสำนักงานใหญ่"],
  ["team_eng", "Peace@2569", "engineer", "สำนักงานใหญ่", "ทีมงาน ชวศ"],
  ["viewer", "Peace@2569", "viewer", "*", "ผู้ดูข้อมูล (อ่านอย่างเดียว)"]
];

// === Auth: hashing / sessions =========================================
function hashPassword_(plain) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(plain) + PASSWORD_SALT,
    Utilities.Charset.UTF_8
  );
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] & 0xff;
    hex += (b < 16 ? "0" : "") + b.toString(16);
  }
  return hex;
}

function isSha256Hex_(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || "").trim());
}

/** ตรวจรหัสผ่าน — รองรับ hash ปกติ, คอลัมน์ PasswordPlain และแถวเก่าที่เก็บ plain ในคอลัมน์ hash */
function passwordMatchesUserRow_(row, password) {
  const p = String(password || "");
  const hash = hashPassword_(p);
  const storedHash = String(row[1] || "").trim();
  if (storedHash && storedHash === hash) return { ok: true, repair: false };
  const plainCol = String(row[6] || "").trim();
  if (plainCol && plainCol === p) return { ok: true, repair: true };
  if (storedHash && !isSha256Hex_(storedHash) && storedHash === p) {
    return { ok: true, repair: true };
  }
  return { ok: false, repair: false };
}

function findUserRowIndex_(username) {
  const uLower = String(username || "").trim().toLowerCase();
  if (!uLower) return -1;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return -1;
  const width = Math.max(sheet.getLastColumn(), 7);
  const rows = getDataRows_(sheet, width);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim().toLowerCase() === uLower) return i;
  }
  return -1;
}

function genToken_() {
  return Utilities.getUuid().replace(/-/g, "") + Date.now().toString(36);
}

function sessionKey_(token) { return SESSION_PREFIX + token; }

function saveSession_(token, payload) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(sessionKey_(token), JSON.stringify(payload));
}

function readSession_(token) {
  if (!token) return null;
  const raw = PropertiesService.getScriptProperties().getProperty(sessionKey_(token));
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) {
      PropertiesService.getScriptProperties().deleteProperty(sessionKey_(token));
      return null;
    }
    return s;
  } catch (e) {
    return null;
  }
}

const DEFAULT_ADMIN_USERNAMES = DEFAULT_USERS
  .filter(function (u) { return String(u[2]).toLowerCase() === "admin"; })
  .map(function (u) { return String(u[0]).trim().toLowerCase(); });

function normalizeRoleRegion_(username, roleValue, regionValue) {
  const uname = String(username || "").trim().toLowerCase();
  const roleRaw = String(roleValue || "").trim();
  const regionRaw = String(regionValue || "").trim();
  let role = String(roleRaw || "user").trim().toLowerCase();
  let region = String(regionRaw || "").trim();
  const regionNorm = region.toLowerCase();
  const isDefaultAdmin = DEFAULT_ADMIN_USERNAMES.indexOf(uname) > -1;
  const looksLegacySwappedAdmin =
    (role === "*" && regionNorm === "admin") ||
    (isDefaultAdmin && role === "user" && regionNorm === "admin");
  if (looksLegacySwappedAdmin) {
    role = "admin";
    region = "*";
  }
  const roleLooksRegion = PEA_REGIONS.indexOf(roleRaw) > -1;
  if (!looksLegacySwappedAdmin && roleLooksRegion && regionNorm === "user") {
    role = "user";
    region = roleRaw;
  }
  if (role === "admin" && !region) region = "*";
  if (role === ROLE_ENGINEER && !region) region = "สำนักงานใหญ่";
  if (role !== "admin" && role !== "user" && role !== "guest" && role !== ROLE_ENGINEER && role !== "viewer") role = "user";
  return { role: role, region: region };
}

function isEngineerRole_(session) {
  return !!session && session.role === ROLE_ENGINEER;
}

function isViewerRole_(session) {
  return !!session && session.role === "viewer";
}

function canViewAllRegions_(session) {
  if (!session) return false;
  return session.role === "admin" || isEngineerRole_(session) || isViewerRole_(session) || session.region === "*";
}

function sessionCanViewRegion_(session, rowRegion) {
  if (!session) return false;
  if (session.role === "admin" || session.region === "*") return true;
  if (isEngineerRole_(session)) return true;
  if (!session.region) return false;
  return String(rowRegion) === String(session.region);
}

function sessionCanModifyRegion_(session, rowRegion) {
  if (!session) return false;
  if (isViewerRole_(session)) return false;
  if (session.role === "admin" || session.region === "*") return true;
  if (!session.region) return false;
  return String(rowRegion) === String(session.region);
}

function verifySession_(token) {
  const s = readSession_(token);
  if (!s) throw new Error("กรุณาเข้าสู่ระบบใหม่");
  const normalized = normalizeRoleRegion_(s.username, s.role, s.region);
  if (s.role !== normalized.role || s.region !== normalized.region) {
    s.role = normalized.role;
    s.region = normalized.region;
    saveSession_(token, s);
  }
  return s;
}

function requireAdmin_(token) {
  const s = verifySession_(token);
  if (s.role !== "admin") throw new Error("ต้องเป็นแอดมินเท่านั้น");
  return s;
}

function requireUserOrAdmin_(token) {
  return verifySession_(token);
}

// Region view guard (fail-closed). Admins, engineer team, and "*" see every region.
function sessionCanAccessRegion_(session, rowRegion) {
  return sessionCanViewRegion_(session, rowRegion);
}

// === Auth: public endpoints ===========================================
function login(username, password) {
  ensureSheetsInitialized_();
  const u = String(username || "").trim();
  const p = String(password || "");
  if (!u || !p) throw new Error("กรอกชื่อผู้ใช้และรหัสผ่าน");

  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureUsersSheetMigrated_(ss);
  ensureDefaultViewerUser_(ss);
  const sheet = ss.getSheetByName(USERS_SHEET);
  const width = Math.max(sheet.getLastColumn(), 7);
  const rows = getDataRows_(sheet, width);
  const uLower = u.toLowerCase();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const uname = String(r[0] || "").trim();
    if (!uname || uname.toLowerCase() !== uLower) continue;
    const check = passwordMatchesUserRow_(r, p);
    if (!check.ok) continue;
    if (check.repair) {
      sheet.getRange(i + 2, 2).setValue(hashPassword_(p));
      sheet.getRange(i + 2, 7).setValue(p);
    }
    const normalized = normalizeRoleRegion_(uname, r[2], r[3]);
    const role = normalized.role;
    const region = normalized.region;
    const display = String(r[4] || uname);
    const active = r[5] === false || String(r[5]).toLowerCase() === "false" ? false : true;
    if (!active) throw new Error("บัญชีนี้ถูกระงับ — ติดต่อแอดมิน");
    const token = genToken_();
    const session = {
      username: uname,
      role: role,
      region: region,
      displayName: display,
      loginAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString()
    };
    saveSession_(token, session);
    return {
      ok: true,
      token: token,
      username: uname,
      role: role,
      region: region,
      displayName: display
    };
  }
  if (repairDefaultUserCredentials_(sheet, u, p)) {
    return login(u, p);
  }
  if (findUserRowIndex_(u) >= 0) {
    throw new Error("รหัสผ่านไม่ถูกต้อง");
  }
  throw new Error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
}

function logout(token) {
  if (token) {
    PropertiesService.getScriptProperties().deleteProperty(sessionKey_(token));
  }
  return { ok: true };
}

function verifySession(token) {
  const s = readSession_(token);
  if (!s) return { ok: false };
  const normalized = normalizeRoleRegion_(s.username, s.role, s.region);
  if (s.role !== normalized.role || s.region !== normalized.region) {
    s.role = normalized.role;
    s.region = normalized.region;
    saveSession_(token, s);
  }
  return {
    ok: true,
    username: s.username,
    role: s.role,
    region: s.region,
    displayName: s.displayName || s.username
  };
}

function getRpcPing() {
  return {
    ok: true,
    build: APP_BUILD,
    time: new Date().toISOString()
  };
}

/** ลดขนาด JSONP — ไม่ส่ง data URL ขนาดใหญ่ ให้ฝั่งเว็บโหลดรูปผ่าน getImageProxy */
function slimRoundPayloadForExternal_(round) {
  const src = round || {};
  const imageUrl = String(src.imageUrl || "").trim();
  const out = {
    year: src.year,
    name: src.name,
    unitPrice: src.unitPrice,
    imageUrl: imageUrl,
    imageRef: imageUrl
  };
  const disp = String(src.imageDisplayUrl || "").trim();
  if (disp && !/^data:/i.test(disp) && disp.length < 2000) {
    out.imageDisplayUrl = disp;
    out.imageSourceMode = String(src.imageSourceMode || "url");
  } else if (extractDriveFileId_(imageUrl)) {
    out.imageDisplayUrl = "";
    out.imageSourceMode = "lazy";
  } else {
    out.imageDisplayUrl = disp || DEFAULT_IMAGE;
    out.imageSourceMode = String(src.imageSourceMode || "placeholder");
  }
  const thumb = sanitizeThumbDataUrl_(src.imageDataThumb || "");
  if (thumb) out.imageDataThumb = thumb;
  return out;
}

function slimRoundImageRpcFields_(imageUrl, display) {
  const slim = slimRoundPayloadForExternal_({
    imageUrl: imageUrl,
    imageDisplayUrl: display && display.imageDisplayUrl,
    imageSourceMode: display && display.imageSourceMode
  });
  return {
    imageUrl: slim.imageUrl,
    imageDisplayUrl: slim.imageDisplayUrl,
    imageSourceMode: slim.imageSourceMode
  };
}

function getGuestStockData() {
  ensureSheetsInitialized_();
  const data = buildBootstrapData_();
  const round = slimRoundPayloadForExternal_(data.round || {});
  return {
    regions: [],
    round: round,
    stockSizes: data.stockSizes,
    stock: (data.stock || []).map(s => ({
      size: s.size,
      remaining: s.remaining
    })),
    sizeChart: data.sizeChart || [],
    orders: [],
    unitPrice: 0,
    pickupStatus: [],
    generatedAt: data.generatedAt,
    me: {
      username: "guest",
      role: "guest",
      region: "",
      displayName: "Guest"
    }
  };
}

// === Admin user management ============================================
function ensureUsersSheetMigrated_(ss) {
  migrateUsersPasswordPlainColumn_(ss);
}

function ensureDefaultEngineerUser_(ss) {
  ensureDefaultUserByUsername_(ss, "team_eng");
}

function ensureDefaultViewerUser_(ss) {
  ensureDefaultUserByUsername_(ss, "viewer");
}

function ensureDefaultUserByUsername_(ss, username) {
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return;
  const uname = String(username || "").trim();
  const rows = getDataRows_(sheet, 7);
  if (rows.some(function (r) { return String(r[0] || "").trim().toLowerCase() === uname.toLowerCase(); })) return;
  const def = DEFAULT_USERS.filter(function (u) { return String(u[0]) === uname; })[0];
  if (!def) return;
  sheet.appendRow([def[0], hashPassword_(def[1]), def[2], def[3], def[4], true, def[1]]);
}

/** ถ้ามีแถวผู้ใช้มาตรฐานแต่ hash/plain เพี้ยน — ซ่อมเมื่อกรอกรหัสตาม DEFAULT_USERS */
function repairDefaultUserCredentials_(sheet, username, password) {
  const uLower = String(username || "").trim().toLowerCase();
  const p = String(password || "");
  const def = DEFAULT_USERS.filter(function (u) {
    return String(u[0] || "").trim().toLowerCase() === uLower;
  })[0];
  if (!def || String(def[1]) !== p) return false;
  const idx = findUserRowIndex_(username);
  if (idx < 0) return false;
  sheet.getRange(idx + 2, 2).setValue(hashPassword_(p));
  sheet.getRange(idx + 2, 7).setValue(p);
  sheet.getRange(idx + 2, 3, 1, 3).setValues([[def[2], def[3], def[4]]]);
  sheet.getRange(idx + 2, 6).setValue(true);
  return true;
}

function migrateUsersPasswordPlainColumn_(ss) {
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return;
  const header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  if (String(header[6] || "").trim() !== "PasswordPlain") {
    sheet.getRange(1, 7).setValue("PasswordPlain");
  }
  const defaultPlainByUser = {};
  DEFAULT_USERS.forEach(function (u) {
    defaultPlainByUser[String(u[0]).trim()] = String(u[1] || "");
  });
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const width = Math.max(sheet.getLastColumn(), 7);
  const rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  for (let i = 0; i < rows.length; i++) {
    const uname = String(rows[i][0] || "").trim();
    if (!uname) continue;
    if (String(rows[i][6] || "").trim()) continue;
    const plain = defaultPlainByUser[uname];
    if (plain) sheet.getRange(i + 2, 7).setValue(plain);
  }
}

function getUserPassword(token, username) {
  requireAdmin_(token);
  ensureSheetsInitialized_();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureUsersSheetMigrated_(ss);
  const u = String(username || "").trim();
  if (!u) throw new Error("ระบุชื่อผู้ใช้");
  const sheet = ss.getSheetByName(USERS_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === u) {
      const plain = String(values[i][6] || "").trim();
      return {
        username: u,
        region: String(values[i][3] || ""),
        password: plain,
        hasPassword: !!plain
      };
    }
  }
  throw new Error("ไม่พบผู้ใช้ " + u);
}

function listUsers(token) {
  requireAdmin_(token);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureUsersSheetMigrated_(ss);
  const sheet = ss.getSheetByName(USERS_SHEET);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const width = Math.max(sheet.getLastColumn(), 7);
  const rows = sheet.getRange(2, 1, last - 1, width).getValues();
  const seen = {};
  const out = [];
  rows.forEach(function (r) {
    const username = String(r[0] || "").trim();
    if (!username) return;
    const key = username.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    const normalized = normalizeRoleRegion_(username, r[2], r[3]);
    out.push({
      username: username,
      role: normalized.role,
      region: normalized.region,
      displayName: String(r[4] || username),
      active: r[5] === false || String(r[5]).toLowerCase() === "false" ? false : true
    });
  });
  return out;
}

function createUser(token, payload) {
  requireAdmin_(token);
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "");
  const role = String(payload.role || "user");
  const region = String(payload.region || "");
  const displayName = String(payload.displayName || username);
  if (!username || !password) throw new Error("กรอกชื่อผู้ใช้และรหัสผ่าน");
  if (password.length < 4) throw new Error("รหัสผ่านต้องอย่างน้อย 4 ตัว");
  if (role !== "admin" && role !== "user" && role !== ROLE_ENGINEER && role !== "viewer") {
    throw new Error("ตำแหน่งไม่ถูกต้อง");
  }
  if (role === ROLE_ENGINEER) {
    if (!region || region === "*") region = "สำนักงานใหญ่";
    if (!region || region === "*") {
      throw new Error(ROLE_ENGINEER_LABEL + " ต้องเลือกเขตที่ใช้สั่งเสื้อ (เช่น สำนักงานใหญ่) — ไม่ใช่ * ทุกเขต");
    }
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureUsersSheetMigrated_(ss);
  const sheet = ss.getSheetByName(USERS_SHEET);
  const rows = getDataRows_(sheet, 7);
  if (rows.some(r => String(r[0] || "").trim().toLowerCase() === username.toLowerCase())) {
    throw new Error("มีชื่อผู้ใช้นี้แล้ว");
  }
  sheet.appendRow([username, hashPassword_(password), role, region, displayName, true, password]);
  return { ok: true };
}

function updateUser(token, username, payload) {
  requireAdmin_(token);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(USERS_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(username).trim()) {
      const role = payload.role || values[i][2];
      const region = payload.region !== undefined ? payload.region : values[i][3];
      const displayName = payload.displayName !== undefined ? payload.displayName : values[i][4];
      const active = payload.active !== undefined ? !!payload.active : (values[i][5] === false ? false : true);
      sheet.getRange(i + 1, 3, 1, 4).setValues([[role, region, displayName, active]]);
      return { ok: true };
    }
  }
  throw new Error("ไม่พบผู้ใช้ " + username);
}

function deleteUser(token, username) {
  const me = requireAdmin_(token);
  const target = String(username || "").trim().toLowerCase();
  if (!target) throw new Error("ระบุชื่อผู้ใช้");
  if (String(me.username || "").trim().toLowerCase() === target) {
    throw new Error("ห้ามลบบัญชีของตัวเอง");
  }
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(USERS_SHEET);
  const last = sheet.getLastRow();
  if (last < 2) throw new Error("ไม่พบผู้ใช้ " + username);
  const width = Math.max(sheet.getLastColumn(), 7);
  const values = sheet.getRange(2, 1, last - 1, width).getValues();
  const rowsToDelete = [];
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim().toLowerCase() === target) {
      rowsToDelete.push(i + 2);
    }
  }
  if (rowsToDelete.length === 0) throw new Error("ไม่พบผู้ใช้ " + username);
  rowsToDelete.sort(function (a, b) { return b - a; }).forEach(function (row) {
    sheet.deleteRow(row);
  });
  SpreadsheetApp.flush();
  return { ok: true, deleted: rowsToDelete.length };
}

function resetPassword(token, username, newPassword) {
  requireAdmin_(token);
  const np = String(newPassword || "");
  if (np.length < 4) throw new Error("รหัสผ่านต้องอย่างน้อย 4 ตัว");
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureUsersSheetMigrated_(ss);
  const sheet = ss.getSheetByName(USERS_SHEET);
  const values = sheet.getDataRange().getValues();
  const uLower = String(username || "").trim().toLowerCase();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || "").trim().toLowerCase() === uLower) {
      sheet.getRange(i + 1, 2).setValue(hashPassword_(np));
      sheet.getRange(i + 1, 7).setValue(np);
      return { ok: true };
    }
  }
  throw new Error("ไม่พบผู้ใช้ " + username);
}

/** ผู้ใช้แต่ละเขต (และแอดมิน) เปลี่ยนรหัสผ่านของตัวเอง — ต้องใส่รหัสเดิมถูกต้อง */
function changeOwnPassword(token, currentPassword, newPassword) {
  const session = requireUserOrAdmin_(token);
  const cur = String(currentPassword || "");
  const np = String(newPassword || "");
  if (!cur || !np) throw new Error("กรอกรหัสผ่านปัจจุบันและรหัสใหม่");
  if (np.length < 4) throw new Error("รหัสผ่านใหม่ต้องอย่างน้อย 4 ตัว");
  if (cur === np) throw new Error("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม");

  const username = String(session.username || "").trim();
  const hashCur = hashPassword_(cur);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureUsersSheetMigrated_(ss);
  const sheet = ss.getSheetByName(USERS_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === username) {
      if (String(values[i][1]) !== hashCur) {
        throw new Error("รหัสผ่านปัจจุบันไม่ถูกต้อง");
      }
      sheet.getRange(i + 1, 2).setValue(hashPassword_(np));
      sheet.getRange(i + 1, 7).setValue(np);
      return { ok: true };
    }
  }
  throw new Error("ไม่พบบัญชีผู้ใช้");
}

// === Bootstrap (single round-trip endpoint) ============================
function getBootstrapData(token) {
  const session = verifySession_(token);
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY_BOOTSTRAP);
  let data;
  if (cached) {
    try { data = JSON.parse(cached); } catch (e) { data = null; }
  }
  if (!data) {
    data = buildBootstrapDataForCache_();
    try { cache.put(CACHE_KEY_BOOTSTRAP, JSON.stringify(data), CACHE_TTL_SEC); } catch (e) {}
  }
  // Scope orders by region for non-admin users
  const out = {
    regions: data.regions,
    round: slimRoundPayloadForExternal_(data.round),
    stockSizes: data.stockSizes,
    stock: data.stock,
    sizeChart: data.sizeChart,
    orders: data.orders,
    unitPrice: data.unitPrice,
    pickupStatus: data.pickupStatus,
    cartStatus: ORDER_STATUS_CART,
    generatedAt: data.generatedAt,
    me: {
      username: session.username,
      role: session.role,
      region: session.region,
      displayName: session.displayName || session.username
    }
  };
  if (!canViewAllRegions_(session)) {
    // Fail closed: a scoped user without a concrete region must not see any orders.
    out.orders = session.region
      ? data.orders.filter(o => o.region === session.region)
      : [];
  }
  // Hide free-giveaway orders from non-admin users so giveaway data never
  // reaches the client (only main admin1/admin2 can see those rows).
  if (session.role !== "admin") {
    out.orders = out.orders.filter(function (o) {
      return !isFreeGiveawayPayment_(o.paymentStatus);
    });
  }
  out.orders = (out.orders || []).map(function (o) {
    return sanitizeOrderForViewer_(o, session);
  });
  return out;
}

function buildBootstrapData_() {
  const ss = getSpreadsheet_();
  const round = getRoundInfo_(ss);
  const orders = getOrders_(ss);
  const soldMap = calcSoldFromOrders_(orders);
  const stock = getStockSummaryWithSold_(ss, soldMap);
  const sizeChart = getSizeChart_(ss);
  return {
    regions: PEA_REGIONS,
    round: round,
    stockSizes: STOCK_SIZES,
    stock: stock,
    sizeChart: sizeChart,
    orders: orders,
    unitPrice: round.unitPrice,
    pickupStatus: ADMIN_ORDER_STATUS,
    cartStatus: ORDER_STATUS_CART,
    generatedAt: new Date().toISOString()
  };
}

/** Bootstrap cache — ไม่เก็บ data URL ขนาดใหญ่ */
function buildBootstrapDataForCache_() {
  const data = buildBootstrapData_();
  data.round = slimRoundPayloadForExternal_(data.round);
  return data;
}

function invalidateDataCache_() {
  CacheService.getScriptCache().remove(CACHE_KEY_BOOTSTRAP);
}

function refreshBootstrapCache_() {
  const cache = CacheService.getScriptCache();
  try {
    cache.put(CACHE_KEY_BOOTSTRAP, JSON.stringify(buildBootstrapDataForCache_()), CACHE_TTL_SEC);
  } catch (e) {
    try { cache.remove(CACHE_KEY_BOOTSTRAP); } catch (e2) {}
  }
}

// === Orders ============================================================
function addMultiSizeOrder(token, payload) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error("ระบบกำลังบันทึก กรุณาลองใหม่อีกครั้ง");
  }
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orderSheet = ss.getSheetByName(ORDER_SHEET);

    let region = String(payload.region || "").trim();
    if (session.role !== "admin") {
      if (!session.region || session.region === "*") throw new Error("บัญชีผู้ใช้ต้องมีเขต");
      region = session.region;
    }
    if (!region) throw new Error("กรุณาเลือกเขตที่สั่ง");

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) throw new Error("กรุณาเพิ่มไซส์อย่างน้อย 1 รายการ");

    // Aggregate per size + validate stock
    const agg = {};
    let totalQty = 0;
    items.forEach(it => {
      const size = String(it.size || "").trim();
      const qty = Number(it.qty) || 0;
      if (!STOCK_SIZES.includes(size)) throw new Error("ไซส์ไม่ถูกต้อง: " + size);
      if (qty <= 0) return;
      agg[size] = (agg[size] || 0) + qty;
      totalQty += qty;
    });
    if (totalQty <= 0) throw new Error("จำนวนต้องมากกว่า 0");

    validateStockForOrderItems_(ss, items, "");

    const now = new Date();
    const orderDt = orderDateTimeParts_(now);
    const payDate = orderDt.payDate;
    const payTime = orderDt.payTime;
    const note = String(payload.note || "").trim().substring(0, 120);
    const requestedStatus = String(payload.status || "").trim();
    const status = resolveNewOrderStatus_(session, requestedStatus);
    const unitPrice = Number(payload.unitPrice) || getRoundInfo_(ss).unitPrice;

    const orderId = "ORD" + now.getTime() + Math.floor(Math.random() * 1000);
    const slipName = "";
    const slipUrl = "";

    const startNo = orderSheet.getLastRow();
    const rowsToAppend = [];
    let counter = 0;
    Object.keys(agg).forEach(size => {
      counter++;
      const qty = agg[size];
      rowsToAppend.push([
        startNo + counter,
        orderId,
        region,
        size,
        qty,
        qty * unitPrice,
        payDate,
        payTime,
        status,
        note,
        now,
        slipName,
        slipUrl,
        session.username,
        "",
        CHANGE_REQUEST_STATUS.NONE,
        "",
        PAYMENT_STATUS.NONE
      ]);
    });
    orderSheet.getRange(orderSheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);

    invalidateDataCache_();
    return {
      ok: true,
      orderId: orderId,
      totalQty: totalQty,
      rows: rowsToAppend.length,
      slipName: "",
      slipUrl: "",
      region: region,
      status: status,
      note: note,
      payDate: payDate,
      payTime: payTime,
      timestamp: now.toISOString(),
      unitPrice: unitPrice,
      paymentStatus: PAYMENT_STATUS.NONE
    };
  } finally {
    lock.releaseLock();
  }
}

function updateCartOrderByOrderId(token, orderId, payload) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("ระบบกำลังบันทึก กรุณาลองใหม่อีกครั้ง");
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orderSheet = ss.getSheetByName(ORDER_SHEET);
    const meta = getOrderGroupMeta_(orderSheet, orderId, session);
    assertUserCanModifyOwnOrder_(session, meta.status, meta.paymentStatus);
    const preserveStatus = meta.status;
    const items = Array.isArray(payload && payload.items) ? payload.items : [];
    const agg = validateStockForOrderItems_(ss, items, orderId);
    const values = getOrderSheetValues_(orderSheet);
    const templateRow = values[meta.rows[0].row - 1];
    const payDate = String(payload && payload.payDate != null ? payload.payDate : templateRow[6] || "").trim();
    const payTime = String(payload && payload.payTime != null ? payload.payTime : templateRow[7] || "").trim();
    const note = String(payload && payload.note != null ? payload.note : templateRow[9] || "").trim().substring(0, 120);
    const slipName = String(templateRow[11] || "");
    const slipUrl = String(templateRow[12] || "");
    const createdBy = String(templateRow[13] || session.username);
    const paymentStatus = String(templateRow[17] || PAYMENT_STATUS.NONE);
    const unitPrice = Number(payload && payload.unitPrice) || getRoundInfo_(ss).unitPrice;
    const rowsToDelete = meta.rows.map(r => r.row).sort((a, b) => b - a);
    rowsToDelete.forEach(r => orderSheet.deleteRow(r));
    const startNo = orderSheet.getLastRow();
    const rowsToAppend = [];
    let counter = 0;
    Object.keys(agg).forEach(size => {
      counter++;
      const qty = agg[size];
      rowsToAppend.push([
        startNo + counter,
        meta.orderId,
        meta.region,
        size,
        qty,
        qty * unitPrice,
        payDate,
        payTime,
        preserveStatus,
        note,
        new Date(),
        slipName,
        slipUrl,
        createdBy,
        "",
        CHANGE_REQUEST_STATUS.NONE,
        "",
        paymentStatus
      ]);
    });
    orderSheet.getRange(orderSheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
    renumberOrders_(orderSheet);
    invalidateDataCache_();
    return { ok: true, orderId: meta.orderId, totalQty: Object.keys(agg).reduce((s, k) => s + agg[k], 0), status: preserveStatus };
  } finally {
    lock.releaseLock();
  }
}

function submitCartOrderToAdmin(token, orderId) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("ระบบกำลังบันทึก กรุณาลองใหม่อีกครั้ง");
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orderSheet = ss.getSheetByName(ORDER_SHEET);
    const meta = getOrderGroupMeta_(orderSheet, orderId, session);
    if (!isCartOrderStatus_(meta.status)) {
      throw new Error("ออเดอร์นี้ถูกส่งไปยังแอดมินแล้ว");
    }
    let totalQty = 0;
    const cartItems = meta.rows.map(function (r) {
      totalQty += r.qty;
      return { size: r.size, qty: r.qty };
    });
    if (totalQty <= 0) throw new Error("ออเดอร์ว่าง ไม่สามารถส่งได้");
    validateStockForOrderItems_(ss, cartItems, orderId);
    meta.rows.forEach(r => {
      orderSheet.getRange(r.row, 9).setValue(ORDER_STATUS_ORDERED);
    });
    invalidateDataCache_();
    return { ok: true, orderId: meta.orderId, status: ORDER_STATUS_ORDERED };
  } finally {
    lock.releaseLock();
  }
}

// Back-compat single-size wrapper
function addOrder(token, payload) {
  return addMultiSizeOrder(token, {
    region: payload.region,
    payDate: payload.payDate,
    payTime: payload.payTime,
    status: payload.status,
    note: payload.note,
    slipBase64: payload.slipBase64,
    unitPrice: payload.price && payload.qty ? Number(payload.price) / Number(payload.qty) : undefined,
    items: [{ size: payload.size, qty: Number(payload.qty) || 0 }]
  });
}

function isCartOrderStatus_(status) {
  return String(status || "").trim() === ORDER_STATUS_CART;
}

function isSubmittedOrderStatus_(status) {
  const s = String(status || "").trim();
  return SUBMITTED_ORDER_STATUSES.indexOf(s) > -1;
}

function isUserEditableOrderStatus_(status) {
  if (isCartOrderStatus_(status)) return true;
  const s = String(status || "").trim();
  return USER_EDITABLE_STATUSES.indexOf(s) > -1;
}

function orderDateTimeParts_(d) {
  const dt = d || new Date();
  const tz = Session.getScriptTimeZone() || "Asia/Bangkok";
  return {
    payDate: Utilities.formatDate(dt, tz, "yyyy-MM-dd"),
    payTime: Utilities.formatDate(dt, tz, "HH:mm")
  };
}

function isUserLockedOrderStatus_(status) {
  const s = String(status || "").trim();
  return USER_LOCKED_STATUSES.indexOf(s) > -1;
}

function isPaymentVerified_(paymentStatus) {
  return String(paymentStatus || "").trim() === PAYMENT_STATUS.VERIFIED;
}

function isFreeGiveawayPayment_(paymentStatus) {
  return String(paymentStatus || "").trim() === PAYMENT_STATUS.FREE_GIVEAWAY;
}

function isPaymentLocked_(paymentStatus) {
  return isPaymentVerified_(paymentStatus) || isFreeGiveawayPayment_(paymentStatus);
}

function countsAsSaleRevenue_(paymentStatus) {
  return !isFreeGiveawayPayment_(paymentStatus);
}

function assertUserCanModifyOwnOrder_(session, groupStatus, paymentStatus) {
  if (!session || session.role === "admin") return;
  if (isPaymentLocked_(paymentStatus)) {
    throw new Error("ออเดอร์ถูกปิดแล้ว แก้ไข/ลบได้เฉพาะแอดมิน");
  }
  const st = String(groupStatus || "").trim();
  if (!isUserEditableOrderStatus_(st)) {
    throw new Error("ออเดอร์ถูกล็อกแล้ว แก้ไข/ลบได้เฉพาะแอดมิน");
  }
}

function assertUserCanDeleteOwnOrder_(session, groupStatus, paymentStatus) {
  assertUserCanModifyOwnOrder_(session, groupStatus, paymentStatus);
}

function resolveNewOrderStatus_(session, incomingStatus) {
  if (session && session.role === "admin") {
    if (!incomingStatus) return ORDER_STATUS_ORDERED;
    if (!ADMIN_ORDER_STATUS.includes(incomingStatus)) throw new Error("สถานะไม่ถูกต้อง");
    return incomingStatus;
  }
  return ORDER_STATUS_CART;
}

function getOrderGroupMeta_(orderSheet, orderId, session) {
  const values = getOrderSheetValues_(orderSheet);
  const targetOrderId = String(orderId || "").trim();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const rowOrderId = String(values[i][1] || values[i][0]);
    if (rowOrderId !== targetOrderId) continue;
    if (!sessionCanModifyRegion_(session, values[i][2])) {
      throw new Error("ไม่มีสิทธิ์จัดการออเดอร์นี้");
    }
    rows.push({
      row: i + 1,
      region: String(values[i][2] || ""),
      size: String(values[i][3] || ""),
      qty: Number(values[i][4]) || 0,
      status: String(values[i][8] || ORDER_STATUS_ORDERED)
    });
  }
  if (rows.length === 0) throw new Error("ไม่พบออเดอร์ " + targetOrderId);
  const firstRow = values[rows[0].row - 1];
  return {
    orderId: targetOrderId,
    rows: rows,
    status: rows[0].status,
    region: rows[0].region,
    paymentStatus: String(firstRow[17] || PAYMENT_STATUS.NONE).trim()
  };
}

function validateStockForOrderItems_(ss, items, excludeOrderId) {
  const orders = getOrders_(ss).filter(o => String(o.orderId) !== String(excludeOrderId || ""));
  const soldMap = calcSoldFromOrders_(orders);
  const stock = getStockSummaryWithSold_(ss, soldMap);
  const agg = {};
  (Array.isArray(items) ? items : []).forEach(it => {
    const size = String(it.size || "").trim();
    const qty = Number(it.qty) || 0;
    if (!STOCK_SIZES.includes(size)) throw new Error("ไซส์ไม่ถูกต้อง: " + size);
    if (qty <= 0) return;
    agg[size] = (agg[size] || 0) + qty;
  });
  let totalQty = 0;
  Object.keys(agg).forEach(size => {
    totalQty += agg[size];
    const s = stock.find(x => x.size === size);
    if (!s) throw new Error("ไม่พบไซส์ " + size);
    if (s.remaining < agg[size]) {
      throw new Error("ไซส์ " + size + " คงเหลือ " + s.remaining + " ตัว (สั่ง " + agg[size] + ")");
    }
  });
  if (totalQty <= 0) throw new Error("กรุณาเพิ่มไซส์อย่างน้อย 1 รายการ");
  return agg;
}

function updateOrderStatus(token, no, status) {
  requireAdmin_(token);
  ensureSheetsInitialized_();
  if (!ADMIN_ORDER_STATUS.includes(status)) throw new Error("สถานะไม่ถูกต้อง");
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const values = getOrderSheetValues_(orderSheet);
  for (let i = 1; i < values.length; i++) {
    if (Number(values[i][0]) === Number(no)) {
      orderSheet.getRange(i + 1, 9).setValue(status);
      invalidateDataCache_();
      return { ok: true };
    }
  }
  throw new Error("ไม่พบรายการลำดับที่ " + no);
}

function updateOrderStatusByOrderId(token, orderId, status) {
  requireAdmin_(token);
  ensureSheetsInitialized_();
  if (!ADMIN_ORDER_STATUS.includes(status)) throw new Error("สถานะไม่ถูกต้อง");
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const values = getOrderSheetValues_(orderSheet);
  let changed = 0;
  for (let i = 1; i < values.length; i++) {
    const rowOrderId = String(values[i][1] || values[i][0]);
    if (rowOrderId === String(orderId)) {
      orderSheet.getRange(i + 1, 9).setValue(status);
      changed++;
    }
  }
  if (changed === 0) throw new Error("ไม่พบออเดอร์ " + orderId);
  invalidateDataCache_();
  return { ok: true, changed: changed };
}

function updateOrderNoteByOrderId(token, orderId, note) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const meta = getOrderGroupMeta_(orderSheet, orderId, session);
  if (session.role === "admin" && isAdminHiddenNoteRegion_(meta.region)) {
    throw new Error("ไม่มีสิทธิ์ดู/แก้หมายเหตุเขตสำนักงานใหญ่");
  }
  assertUserCanModifyOwnOrder_(session, meta.status, meta.paymentStatus);
  const values = getOrderSheetValues_(orderSheet);
  const safeNote = String(note == null ? "" : note).trim();
  let changed = 0;
  for (let i = 1; i < values.length; i++) {
    const rowOrderId = String(values[i][1] || values[i][0]);
    if (rowOrderId === String(orderId)) {
      if (!sessionCanModifyRegion_(session, values[i][2])) continue;
      orderSheet.getRange(i + 1, 10).setValue(safeNote);
      changed++;
    }
  }
  if (changed === 0) throw new Error("ไม่พบออเดอร์ " + orderId);
  invalidateDataCache_();
  return { ok: true, changed: changed, note: safeNote };
}

// === Per-order attached image (slip) management ========================
// The Orders sheet already stores a per-order slip reference in columns
// 12 (สลิป ชื่อ / slipName) and 13 (สลิป URL / slipUrl); all rows that share an
// OrderId carry the same reference. These endpoints let users add an image
// AFTER the order was created, view it, or delete it. Region-scoped RBAC:
// admins manage any order; non-admins only orders in their own region.

// Upload/replace slip image. Saves under Drive subfolder per region; filename =
// {region}_{datetime}_{amount}.ext. Older files remain in Drive; sheet shows latest only.
function uploadOrderImage(token, orderId, base64, payDate, payTime, filename) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const targetOrderId = String(orderId || "").trim();
  if (!targetOrderId) throw new Error("กรุณาระบุ orderId");
  if (!base64) throw new Error("กรุณาเลือกรูปก่อนอัปโหลด");
  const transferDate = String(payDate || "").trim();
  const transferTime = String(payTime || "").trim();
  if (!transferDate) throw new Error("กรุณาระบุวันที่โอน");
  if (!transferTime) throw new Error("กรุณาระบุเวลาโอน");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("ระบบกำลังบันทึก กรุณาลองใหม่อีกครั้ง");
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orderSheet = ss.getSheetByName(ORDER_SHEET);
    const ctx = getOrderSlipContext_(orderSheet, targetOrderId, session);
    if (!ctx.targetRows.length) throw new Error("ไม่พบออเดอร์ " + targetOrderId);
    assertUserCanModifyOwnOrder_(session, ctx.orderStatus, ctx.paymentStatus);

    const saved = saveSlipFileForOrder_(base64, {
      region: ctx.region,
      payDate: transferDate,
      payTime: transferTime,
      amount: ctx.totalAmount,
      uniqueSuffix: ctx.hadSlip
    });
    const slipName = (saved && saved.name) || "";
    const slipUrl = (saved && saved.url) || "";
    if (!slipUrl) {
      throw new Error("อัปโหลดรูปไม่สำเร็จ: สิทธิ์ Google Drive ยังไม่พร้อม");
    }
    ctx.targetRows.forEach(row => {
      orderSheet.getRange(row, 7, 1, 2).setValues([[transferDate, transferTime]]);
      orderSheet.getRange(row, 12).setValue(slipName);
      orderSheet.getRange(row, 13).setValue(slipUrl);
      orderSheet.getRange(row, 18).setValue(PAYMENT_STATUS.PENDING_REVIEW);
    });
    invalidateDataCache_();
    return {
      ok: true,
      orderId: targetOrderId,
      slipName: slipName,
      slipUrl: slipUrl,
      payDate: transferDate,
      payTime: transferTime,
      paymentStatus: PAYMENT_STATUS.PENDING_REVIEW,
      fileId: extractDriveFileId_(slipUrl),
      rows: ctx.targetRows.length,
      replaced: ctx.hadSlip
    };
  } finally {
    lock.releaseLock();
  }
}

function acceptOrderPayment(token, orderId) {
  requireAdmin_(token);
  ensureSheetsInitialized_();
  const targetOrderId = String(orderId || "").trim();
  if (!targetOrderId) throw new Error("กรุณาระบุ orderId");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("ระบบกำลังบันทึก กรุณาลองใหม่อีกครั้ง");
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orderSheet = ss.getSheetByName(ORDER_SHEET);
    const last = orderSheet.getLastRow();
    if (last <= 1) throw new Error("ไม่พบออเดอร์ " + targetOrderId);
    const values = orderSheet.getRange(2, 1, last - 1, ORDERS_HEADERS.length).getValues();
    const targetRows = [];
    let hasSlip = false;
    for (let i = 0; i < values.length; i++) {
      const rowOrderId = String(values[i][1] || values[i][0]);
      if (rowOrderId !== targetOrderId) continue;
      if (isFreeGiveawayPayment_(values[i][17])) {
        throw new Error("ออเดอร์นี้เป็นเสื้อแจกฟรีแล้ว");
      }
      targetRows.push(i + 2);
      if (String(values[i][12] || "").trim() || String(values[i][13] || "").trim()) hasSlip = true;
    }
    if (targetRows.length === 0) throw new Error("ไม่พบออเดอร์ " + targetOrderId);
    if (!hasSlip) throw new Error("ยังไม่มีสลิปแนบ ไม่สามารถยอมรับการชำระได้");
    targetRows.forEach(row => {
      orderSheet.getRange(row, 18).setValue(PAYMENT_STATUS.VERIFIED);
    });
    invalidateDataCache_();
    return { ok: true, orderId: targetOrderId, paymentStatus: PAYMENT_STATUS.VERIFIED, rows: targetRows.length };
  } finally {
    lock.releaseLock();
  }
}

function markOrderFreeGiveaway(token, orderId) {
  requireAdmin_(token);
  ensureSheetsInitialized_();
  const targetOrderId = String(orderId || "").trim();
  if (!targetOrderId) throw new Error("กรุณาระบุ orderId");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("ระบบกำลังบันทึก กรุณาลองใหม่อีกครั้ง");
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orderSheet = ss.getSheetByName(ORDER_SHEET);
    const last = orderSheet.getLastRow();
    if (last <= 1) throw new Error("ไม่พบออเดอร์ " + targetOrderId);
    const values = orderSheet.getRange(2, 1, last - 1, ORDERS_HEADERS.length).getValues();
    const targetRows = [];
    for (let i = 0; i < values.length; i++) {
      const rowOrderId = String(values[i][1] || values[i][0]);
      if (rowOrderId !== targetOrderId) continue;
      if (isPaymentVerified_(values[i][17])) {
        throw new Error("ออเดอร์ชำระเงินแล้ว ไม่สามารถเปลี่ยนเป็นแจกฟรีได้");
      }
      if (isFreeGiveawayPayment_(values[i][17])) {
        throw new Error("ออเดอร์นี้เป็นเสื้อแจกฟรีแล้ว");
      }
      targetRows.push(i + 2);
    }
    if (targetRows.length === 0) throw new Error("ไม่พบออเดอร์ " + targetOrderId);
    targetRows.forEach(function (row) {
      orderSheet.getRange(row, 18).setValue(PAYMENT_STATUS.FREE_GIVEAWAY);
    });
    invalidateDataCache_();
    return {
      ok: true,
      orderId: targetOrderId,
      paymentStatus: PAYMENT_STATUS.FREE_GIVEAWAY,
      rows: targetRows.length
    };
  } finally {
    lock.releaseLock();
  }
}

// Delete the attached image of an order: clears slipName/slipUrl on every row
// of the order and best-effort trashes the Drive file so the upload slot frees up.
function deleteOrderImage(token, orderId) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const targetOrderId = String(orderId || "").trim();
  if (!targetOrderId) throw new Error("กรุณาระบุ orderId");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("ระบบกำลังบันทึก กรุณาลองใหม่อีกครั้ง");
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orderSheet = ss.getSheetByName(ORDER_SHEET);
    const values = getOrderSheetValues_(orderSheet);
    const targetRows = [];
    const fileIds = {};
    for (let i = 1; i < values.length; i++) {
      const rowOrderId = String(values[i][1] || values[i][0]);
      if (rowOrderId !== targetOrderId) continue;
      if (!sessionCanModifyRegion_(session, values[i][2])) {
        throw new Error("ไม่มีสิทธิ์จัดการรูปของออเดอร์นี้");
      }
      targetRows.push(i + 1);
      const id = extractDriveFileId_(values[i][12]);
      if (id) fileIds[id] = true;
    }
    if (targetRows.length === 0) throw new Error("ไม่พบออเดอร์ " + targetOrderId);
    const payStatus = String(values[targetRows[0] - 1][17] || PAYMENT_STATUS.NONE).trim();
    const orderStatus = String(values[targetRows[0] - 1][8] || ORDER_STATUS_ORDERED);
    assertUserCanModifyOwnOrder_(session, orderStatus, payStatus);

    // Best-effort: trash the Drive file(s). Tolerate permission errors so the
    // sheet reference is always cleared even if Drive cleanup fails.
    Object.keys(fileIds).forEach(id => {
      try {
        DriveApp.getFileById(id).setTrashed(true);
        CacheService.getScriptCache().remove("img_proxy_" + id);
      } catch (e) {}
    });
    targetRows.forEach(row => {
      orderSheet.getRange(row, 12).setValue("");
      orderSheet.getRange(row, 13).setValue("");
      orderSheet.getRange(row, 18).setValue(PAYMENT_STATUS.NONE);
    });
    invalidateDataCache_();
    return { ok: true, orderId: targetOrderId, deletedRows: targetRows.length };
  } finally {
    lock.releaseLock();
  }
}

// Region-scoped image fetch for viewing: returns a data URL for the order's
// attached image. Non-admins can only view orders in their own region.
function getOrderImage(token, orderId) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const targetOrderId = String(orderId || "").trim();
  if (!targetOrderId) throw new Error("กรุณาระบุ orderId");
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const values = getOrderSheetValues_(orderSheet);
  let slipUrl = "";
  let found = false;
  for (let i = 1; i < values.length; i++) {
    const rowOrderId = String(values[i][1] || values[i][0]);
    if (rowOrderId !== targetOrderId) continue;
    if (!sessionCanAccessRegion_(session, values[i][2])) {
      throw new Error("ไม่มีสิทธิ์ดูรูปของออเดอร์นี้");
    }
    found = true;
    const ref = String(values[i][12] || values[i][11] || "").trim();
    if (ref) { slipUrl = ref; break; }
  }
  if (!found) throw new Error("ไม่พบออเดอร์ " + targetOrderId);
  if (!slipUrl) return { ok: false, warning: "ออเดอร์นี้ยังไม่มีรูปแนบ" };
  const fileId = extractDriveFileId_(slipUrl);
  const proxy = getImageProxy(fileId);
  const viewUrl = slipUrl || ("https://drive.google.com/uc?export=view&id=" + fileId);
  const thumbUrl = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1000";
  if (proxy && proxy.ok && proxy.dataUrl) {
    return {
      ok: true,
      orderId: targetOrderId,
      fileId: fileId,
      dataUrl: proxy.dataUrl,
      slipUrl: viewUrl,
      thumbnailUrl: thumbUrl
    };
  }
  if (proxy && proxy.ok && proxy.thumbnailUrl) {
    return {
      ok: true,
      orderId: targetOrderId,
      fileId: fileId,
      dataUrl: "",
      thumbnailUrl: proxy.thumbnailUrl,
      slipUrl: viewUrl,
      warning: proxy.warning || ""
    };
  }
  return {
    ok: false,
    orderId: targetOrderId,
    fileId: fileId,
    slipUrl: viewUrl,
    thumbnailUrl: thumbUrl,
    warning: (proxy && proxy.warning) || "โหลดรูปไม่สำเร็จ"
  };
}

function deleteOrder(token, no) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const values = getOrderSheetValues_(orderSheet);
  for (let i = 1; i < values.length; i++) {
    if (Number(values[i][0]) === Number(no)) {
      if (!sessionCanModifyRegion_(session, values[i][2])) {
        throw new Error("ไม่มีสิทธิ์ลบออเดอร์นี้");
      }
      orderSheet.deleteRow(i + 1);
      renumberOrders_(orderSheet);
      invalidateDataCache_();
      return { ok: true };
    }
  }
  throw new Error("ไม่พบรายการลำดับที่ " + no);
}

function deleteOrderByOrderId(token, orderId) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("ระบบกำลังบันทึก กรุณาลองใหม่อีกครั้ง");
  try {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const last = orderSheet.getLastRow();
  if (last <= 1) throw new Error("ไม่พบออเดอร์ " + orderId);
  const values = orderSheet.getRange(2, 1, last - 1, ORDERS_HEADERS.length).getValues();
  const rowsToDelete = [];
  let groupStatus = "";
  let paymentStatus = PAYMENT_STATUS.NONE;
  const targetOrderId = String(orderId || "").trim();
  for (let i = 0; i < values.length; i++) {
    const rowOrderId = String(values[i][1] || values[i][0]);
    if (rowOrderId !== targetOrderId) continue;
    if (!sessionCanModifyRegion_(session, values[i][2])) continue;
    if (!groupStatus) groupStatus = String(values[i][8] || ORDER_STATUS_ORDERED);
    if (!paymentStatus || paymentStatus === PAYMENT_STATUS.NONE) {
      paymentStatus = String(values[i][17] || PAYMENT_STATUS.NONE).trim();
    }
    rowsToDelete.push(i + 2);
  }
  if (rowsToDelete.length === 0) {
    throw new Error(session.role === "admin" ? "ไม่พบออเดอร์ " + targetOrderId : "ไม่มีสิทธิ์ลบออเดอร์นี้");
  }
  assertUserCanDeleteOwnOrder_(session, groupStatus, paymentStatus);
  // delete from bottom up to keep indices stable
  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    orderSheet.deleteRow(rowsToDelete[i]);
  }
  renumberOrders_(orderSheet);
  invalidateDataCache_();
  return { ok: true, deleted: rowsToDelete.length, orderId: targetOrderId };
  } finally {
    lock.releaseLock();
  }
}

function requestOrderChange(token, orderId, items, reason) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("ระบบกำลังบันทึก กรุณาลองใหม่อีกครั้ง");
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orderSheet = ss.getSheetByName(ORDER_SHEET);
    const last = orderSheet.getLastRow();
    if (last <= 1) throw new Error("ไม่พบออเดอร์");
    const values = orderSheet.getRange(2, 1, last - 1, ORDERS_HEADERS.length).getValues();
    const targetRows = [];
    const orderItems = [];
    const targetOrderId = String(orderId || "").trim();
    if (!targetOrderId) throw new Error("กรุณาระบุ orderId");

    for (let i = 0; i < values.length; i++) {
      const rowOrderId = String(values[i][1] || values[i][0]);
      if (rowOrderId !== targetOrderId) continue;
      const rowRegion = String(values[i][2] || "");
      if (!sessionCanModifyRegion_(session, rowRegion)) {
        throw new Error("ไม่มีสิทธิ์ส่งคำขอแก้ไขออเดอร์นี้");
      }
      const reqStatus = String(values[i][15] || CHANGE_REQUEST_STATUS.NONE).trim();
      if (reqStatus === CHANGE_REQUEST_STATUS.PENDING) {
        throw new Error("มีคำขอแก้ไขรออนุมัติอยู่แล้ว");
      }
      targetRows.push(i + 2);
      orderItems.push({
        size: String(values[i][3] || ""),
        qty: Number(values[i][4]) || 0
      });
    }
    if (targetRows.length === 0) throw new Error("ไม่พบออเดอร์ " + targetOrderId);
    const orderStatus = String(values[targetRows[0] - 2][8] || ORDER_STATUS_ORDERED);
    if (isCartOrderStatus_(orderStatus)) {
      throw new Error("ออเดอร์ยังอยู่ในตะกร้า แก้ไขจำนวนได้โดยตรง หรือกดยืนยันส่งออเดอร์ก่อน");
    }
    if (!isSubmittedOrderStatus_(orderStatus) && session.role !== "admin") {
      throw new Error("สถานะออเดอร์ไม่รองรับการขอแก้ไข");
    }

    const normalizedItems = normalizeChangeRequestItems_(items);
    if (!normalizedItems.some(it => it.qty > 0)) {
      throw new Error("ต้องมีอย่างน้อย 1 ไซส์ที่จำนวนมากกว่า 0");
    }

    const requestPayload = {
      orderId: targetOrderId,
      requestedBy: session.username,
      requestedRole: session.role,
      requestedAt: new Date().toISOString(),
      reason: String(reason || "").trim(),
      items: normalizedItems,
      currentItems: orderItems
    };

    const requestedJson = JSON.stringify(requestPayload);
    const pendingStatus = CHANGE_REQUEST_STATUS.PENDING;
    targetRows.forEach(row => {
      orderSheet.getRange(row, 15, 1, 3).setValues([[requestedJson, pendingStatus, ""]]);
    });
    invalidateDataCache_();
    return { ok: true, orderId: targetOrderId, status: pendingStatus };
  } finally {
    lock.releaseLock();
  }
}

function listPendingChangeRequests(token) {
  requireAdmin_(token);
  ensureSheetsInitialized_();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const last = orderSheet.getLastRow();
  if (last <= 1) return [];
  const values = orderSheet.getRange(2, 1, last - 1, ORDERS_HEADERS.length).getValues();
  const map = {};
  values.forEach(r => {
    const orderId = String(r[1] || r[0]);
    const reqStatus = String(r[15] || CHANGE_REQUEST_STATUS.NONE).trim();
    if (reqStatus !== CHANGE_REQUEST_STATUS.PENDING) return;
    if (!map[orderId]) {
      map[orderId] = {
        orderId: orderId,
        region: String(r[2] || ""),
        status: String(r[8] || ORDER_STATUS_ORDERED),
        requestStatus: reqStatus,
        requestNote: String(r[16] || ""),
        requestedChange: parseRequestedChange_(r[14]),
        currentItems: []
      };
    }
    map[orderId].currentItems.push({
      size: String(r[3] || ""),
      qty: Number(r[4]) || 0,
      price: Number(r[5]) || 0
    });
  });
  return Object.keys(map).map(k => map[k]);
}

function getMyOrderStatus(token, year) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const all = getBootstrapData(token).orders || [];
  const filtered = all.filter(o => {
    const y = String(year || "").trim();
    if (!y) return true;
    return String(o.payDate || "").indexOf(y) > -1 || String((o.timestamp || "")).indexOf(y) > -1;
  });
  if (canViewAllRegions_(session)) return filtered;
  return filtered.filter(o => String(o.region || "") === String(session.region || ""));
}

function reviewOrderChangeRequest(token, orderId, action, note) {
  requireAdmin_(token);
  ensureSheetsInitialized_();
  const act = String(action || "").trim().toLowerCase();
  if (act !== CHANGE_REQUEST_STATUS.APPROVED && act !== CHANGE_REQUEST_STATUS.REJECTED) {
    throw new Error("action ต้องเป็น approved หรือ rejected");
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("ระบบกำลังประมวลผล กรุณาลองใหม่");
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orderSheet = ss.getSheetByName(ORDER_SHEET);
    const values = getOrderSheetValues_(orderSheet);
    const targetOrderId = String(orderId || "").trim();
    if (!targetOrderId) throw new Error("กรุณาระบุ orderId");

    const rowsMeta = [];
    let requestedChange = null;
    for (let i = 1; i < values.length; i++) {
      const rowOrderId = String(values[i][1] || values[i][0]);
      if (rowOrderId !== targetOrderId) continue;
      const reqStatus = String(values[i][15] || CHANGE_REQUEST_STATUS.NONE).trim();
      if (reqStatus !== CHANGE_REQUEST_STATUS.PENDING) continue;
      rowsMeta.push({
        row: i + 1,
        size: String(values[i][3] || ""),
        qty: Number(values[i][4]) || 0
      });
      if (!requestedChange) {
        requestedChange = parseRequestedChange_(values[i][14]);
      }
    }
    if (rowsMeta.length === 0) throw new Error("ไม่พบคำขอที่รออนุมัติสำหรับออเดอร์ " + targetOrderId);
    if (!requestedChange || !Array.isArray(requestedChange.items)) throw new Error("คำขอแก้ไขไม่สมบูรณ์");

    const requestItems = normalizeChangeRequestItems_(requestedChange.items);
    const requestMap = {};
    requestItems.forEach(it => { requestMap[it.size] = it.qty; });
    const currentMap = {};
    rowsMeta.forEach(meta => { currentMap[meta.size] = meta.qty; });

    const safeNote = String(note || "").trim();
    let rowsToDelete = [];
    if (act === CHANGE_REQUEST_STATUS.APPROVED) {
      validateApprovedChangeAgainstStock_(ss, currentMap, requestMap);
      const unitPrice = getRoundInfo_(ss).unitPrice;
      rowsToDelete = [];
      rowsMeta.forEach(meta => {
        const nextQty = requestMap[meta.size] !== undefined ? requestMap[meta.size] : 0;
        if (nextQty <= 0) {
          rowsToDelete.push(meta.row);
          return;
        }
        orderSheet.getRange(meta.row, 5).setValue(nextQty);
        orderSheet.getRange(meta.row, 6).setValue(nextQty * unitPrice);
      });
      // Allow new size rows in approved request.
      const existingSizes = {};
      rowsMeta.forEach(meta => { existingSizes[meta.size] = true; });
      const row0 = values[rowsMeta[0].row - 1];
      const now = new Date();
      const extraRows = [];
      requestItems.forEach(it => {
        if (existingSizes[it.size] || it.qty <= 0) return;
        extraRows.push([
          0,
          targetOrderId,
          row0[2],
          it.size,
          it.qty,
          it.qty * unitPrice,
          row0[6],
          row0[7],
          row0[8] || ORDER_STATUS_ORDERED,
          row0[9] || "",
          now,
          row0[11] || "",
          row0[12] || "",
          row0[13] || "",
          "",
          CHANGE_REQUEST_STATUS.NONE,
          "",
          String(row0[17] || PAYMENT_STATUS.NONE)
        ]);
      });
      if (extraRows.length > 0) {
        orderSheet.getRange(orderSheet.getLastRow() + 1, 1, extraRows.length, ORDERS_HEADERS.length).setValues(extraRows);
      }
    }

    rowsMeta.forEach(meta => {
      if (rowsToDelete.indexOf(meta.row) > -1) return;
      orderSheet.getRange(meta.row, 16).setValue(act);
      orderSheet.getRange(meta.row, 17).setValue(safeNote);
      orderSheet.getRange(meta.row, 15).setValue("");
    });
    if (rowsToDelete.length > 0) {
      rowsToDelete.sort((a, b) => b - a).forEach(rowNo => orderSheet.deleteRow(rowNo));
    }
    renumberOrders_(orderSheet);
    invalidateDataCache_();
    return { ok: true, orderId: targetOrderId, action: act, changedRows: rowsMeta.length };
  } finally {
    lock.releaseLock();
  }
}

function normalizeChangeRequestItems_(items) {
  const list = Array.isArray(items) ? items : [];
  const map = {};
  list.forEach(it => {
    const size = String(it && it.size || "").trim();
    const qty = Number(it && it.qty);
    if (!size) return;
    if (!STOCK_SIZES.includes(size)) throw new Error("ไซส์ไม่ถูกต้อง: " + size);
    if (!isFinite(qty) || qty < 0) throw new Error("จำนวนไม่ถูกต้องสำหรับไซส์ " + size);
    map[size] = Math.floor(qty);
  });
  return Object.keys(map).map(size => ({ size: size, qty: map[size] }));
}

function parseRequestedChange_(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { return null; }
}

function validateApprovedChangeAgainstStock_(ss, currentMap, requestMap) {
  const stock = getStockSummary_(ss);
  const stockMap = {};
  stock.forEach(s => { stockMap[s.size] = s; });
  STOCK_SIZES.forEach(size => {
    const currentQty = Number(currentMap[size] || 0);
    const requestedQty = Number(requestMap[size] || 0);
    const delta = requestedQty - currentQty;
    if (delta <= 0) return;
    const s = stockMap[size];
    if (!s) throw new Error("ไม่พบไซส์ " + size);
    if (s.remaining < delta) {
      throw new Error("อนุมัติไม่ได้: ไซส์ " + size + " คงเหลือ " + s.remaining + " ต้องเพิ่มอีก " + delta);
    }
  });
}

function exportOrdersCsv(token, region) {
  return exportAllDataCsv(token, region);
}

function csvPushSection_(out, title, headerRow, dataRows) {
  out.push(["# " + title]);
  if (headerRow && headerRow.length) {
    out.push(headerRow.slice());
  }
  (dataRows || []).forEach(function (row) {
    out.push((row || []).map(serializeSheetValue_));
  });
  out.push([]);
}

function orderToCsvRow_(order, session) {
  const o = sanitizeOrderForViewer_(order, session);
  return [
    o.no, o.orderId, o.region, o.size, o.qty, o.price,
    o.payDate, o.payTime, o.status, o.note, o.timestamp,
    o.slipName, o.slipUrl, o.createdBy,
    o.requestedChange, o.changeRequestStatus, o.changeRequestNote,
    o.paymentStatus
  ];
}

function exportAllDataCsv(token, region) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const out = [];
  const now = new Date();
  out.push(["# PEACE Engineer Club — ส่งออกข้อมูลทั้งหมด"]);
  out.push(["# สร้างเมื่อ", serializeSheetValue_(now)]);
  out.push(["# ผู้ส่งออก", session.username, session.role, session.region || ""]);
  out.push([]);

  let allOrders = getOrders_(ss).filter(function (o) {
    return sessionCanViewRegion_(session, o.region);
  });
  if (canViewAllRegions_(session) && region && region !== "all") {
    allOrders = allOrders.filter(function (o) {
      return String(o.region) === String(region);
    });
  }
  // Hide free-giveaway orders from non-admin CSV export
  if (session.role !== "admin") {
    allOrders = allOrders.filter(function (o) {
      return !isFreeGiveawayPayment_(o.paymentStatus);
    });
  }

  csvPushSection_(out, "รายการสั่งซื้อ (Orders)", ORDERS_HEADERS,
    allOrders.map(function (o) { return orderToCsvRow_(o, session); }));

  const stock = getStockSummary_(ss);
  csvPushSection_(out, "สต็อก", ["ไซส์", "จำนวนที่มาส่ง", "ขายแล้ว (รวมตะกร้า)", "คงเหลือ"],
    stock.map(function (s) { return [s.size, s.delivered, s.sold, s.remaining]; }));

  const round = getRoundInfo_(ss);
  csvPushSection_(out, "รอบสินค้า", ["รอบปี", "ชื่อสินค้า", "ราคาต่อตัว", "รูปภาพ", "เปิดใช้งาน"],
    [[round.year, round.name, round.unitPrice, round.imageRef || round.imageUrl || "", round.active !== false]]);

  const sizeChart = getSizeChart_(ss);
  csvPushSection_(out, "ตารางไซส์", ["ขนาด", "รอบอก(นิ้ว)", "ยาว(นิ้ว)"],
    sizeChart.map(function (r) { return [r.size, r.chest, r.length]; }));

  const regionMap = {};
  allOrders.forEach(function (o) {
    if (isCartOrderStatus_(o.status || o.orderStatus)) return;
    const reg = String(o.region || "").trim() || "?";
    if (!regionMap[reg]) {
      regionMap[reg] = { saleQty: 0, saleAmount: 0, freeQty: 0, freeLoss: 0 };
    }
    const qty = Number(o.qty) || 0;
    const price = Number(o.price) || 0;
    if (isFreeGiveawayPayment_(o.paymentStatus)) {
      regionMap[reg].freeQty += qty;
      regionMap[reg].freeLoss += price;
    } else {
      regionMap[reg].saleQty += qty;
      regionMap[reg].saleAmount += price;
    }
  });
  const regionRows = Object.keys(regionMap).sort().map(function (reg) {
    const x = regionMap[reg];
    // Non-admin CSV never includes free giveaway data, so only output sale columns
    if (session.role !== "admin") {
      return [reg, x.saleQty, x.saleAmount];
    }
    return [reg, x.saleQty, x.saleAmount, x.freeQty, x.freeLoss];
  });
  if (session.role !== "admin") {
    csvPushSection_(out, "สรุปยอดตามเขต", ["เขต", "ขาย (ตัว)", "ยอดขาย (฿)"], regionRows);
  } else {
    csvPushSection_(out, "สรุปยอดตามเขต", ["เขต", "ขาย (ตัว)", "ยอดขาย (฿)", "แจกฟรี (ตัว)", "ขาดทุนแจก (฿)"], regionRows);
  }

  if (session.role === "admin") {
    ensureUsersSheetMigrated_(ss);
    const userSheet = ss.getSheetByName(USERS_SHEET);
    const last = userSheet.getLastRow();
    const userRows = [];
    if (last >= 2) {
      const width = Math.max(userSheet.getLastColumn(), 7);
      const values = userSheet.getRange(2, 1, last - 1, width).getValues();
      const seen = {};
      values.forEach(function (r) {
        const username = String(r[0] || "").trim();
        if (!username) return;
        const key = username.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        const normalized = normalizeRoleRegion_(username, r[2], r[3]);
        userRows.push([
          username,
          normalized.role,
          normalized.region,
          String(r[4] || username),
          r[5] === false || String(r[5]).toLowerCase() === "false" ? false : true,
          String(r[6] || "")
        ]);
      });
    }
    csvPushSection_(out, "ผู้ใช้ (Users)", ["Username", "Role", "Region", "DisplayName", "Active", "PasswordPlain"], userRows);
  }

  return out;
}

// === Round / Stock / Admin =============================================
function saveStockDelivered(token, stockUpdates) {
  requireAdmin_(token);
  ensureSheetsInitialized_();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const stockSheet = ss.getSheetByName(STOCK_SHEET);
  const incoming = Array.isArray(stockUpdates) ? stockUpdates : [];
  incoming.forEach(item => {
    const size = String(item.size || "").trim();
    const delivered = Number(item.delivered) || 0;
    if (!STOCK_SIZES.includes(size)) return;
    const rows = getDataRows_(stockSheet, 2);
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === size) {
        stockSheet.getRange(i + 2, 2).setValue(delivered);
        return;
      }
    }
    stockSheet.appendRow([size, delivered]);
  });
  invalidateDataCache_();
  return { ok: true };
}

function saveRoundConfig(token, payload) {
  requireAdmin_(token);
  ensureSheetsInitialized_();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const roundSheet = ss.getSheetByName(ROUND_SHEET);
  const current = getRoundInfo_(ss);
  const year = String(payload.year || DEFAULT_ROUND).trim();
  const unitPrice = Number(payload.unitPrice) || DEFAULT_UNIT_PRICE;
  const name = String(payload.name || "เสื้อโปโลชมรมวิศวกร กฟภ.").trim();
  let imageUrl = String(current.imageUrl || DEFAULT_IMAGE).trim();
  let imageDataThumb = sanitizeThumbDataUrl_(current.imageDataThumb || "");
  let warning = "";
  const requestedImageUrl = String(payload.imageUrl || "").trim();
  // Never store base64 data URLs in Sheets (can exceed 50,000 chars per cell).
  if (requestedImageUrl && !/^data:/i.test(requestedImageUrl)) {
    imageUrl = sanitizeImageUrl_(requestedImageUrl);
  }
  if (payload.imageBase64) {
    try {
      const file = saveBase64File_(payload.imageBase64, "ShirtImage_" + new Date().getTime());
      if (file.url) imageUrl = sanitizeImageUrl_(file.url);
      const generatedThumb = generateImageThumbFromDriveFile_(file.fileId) ||
        generateImageThumbDataUrl_(payload.imageBase64);
      if (generatedThumb) imageDataThumb = generatedThumb;
      if (file.warning) warning = file.warning;
      else if (!file.url) warning = "บันทึกข้อมูลสำเร็จ แต่ไม่สามารถอัปโหลดรูปไป Google Drive ได้";
    } catch (e) {
      warning = "บันทึกข้อมูลสำเร็จ แต่ไม่สามารถอัปโหลดรูปไป Google Drive ได้";
    }
  }
  roundSheet.getRange(2, 1, 1, 6).setValues([[year, name, unitPrice, imageUrl, true, imageDataThumb]]);
  invalidateDataCache_();
  const display = buildRoundDisplayPayload_(imageUrl, imageDataThumb);
  const slimImg = slimRoundImageRpcFields_(imageUrl, display);
  return {
    ok: true,
    imageUrl: slimImg.imageUrl,
    imageDataThumb: "",
    imageDisplayUrl: slimImg.imageDisplayUrl,
    imageSourceMode: slimImg.imageSourceMode,
    warning: warning
  };
}

function uploadShirtImage(token, imageBase64, imageThumbBase64) {
  requireAdmin_(token);
  ensureSheetsInitialized_();
  if (!imageBase64) throw new Error("กรุณาเลือกรูปภาพก่อนอัปโหลด");
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const roundSheet = ss.getSheetByName(ROUND_SHEET);
  const current = getRoundInfo_(ss);
  let imageUrl = "";
  let imageDataThumb = "";
  let warning = "";
  try {
    const file = saveBase64File_(imageBase64, "ShirtImage_" + new Date().getTime());
    imageUrl = sanitizeImageUrl_(file.url || "");
    imageDataThumb = generateImageThumbFromDriveFile_(file.fileId) ||
      generateImageThumbDataUrl_(imageThumbBase64) ||
      generateImageThumbDataUrl_(imageBase64);
    warning = String(file.warning || "");
  } catch (e) {
    imageUrl = "";
  }
  if (!imageUrl) {
    return {
      ok: false,
      imageUrl: current.imageUrl,
      imageDataThumb: current.imageDataThumb || "",
      warning: "อัปโหลดรูปไม่สำเร็จ: สิทธิ์ Google Drive ยังไม่พร้อม"
    };
  }
  roundSheet.getRange(2, 1, 1, 6).setValues([[
    current.year, current.name, current.unitPrice, imageUrl, true, imageDataThumb
  ]]);
  invalidateDataCache_();
  const display = buildRoundDisplayPayload_(imageUrl, imageDataThumb);
  const slimImg = slimRoundImageRpcFields_(imageUrl, display);
  return {
    ok: true,
    imageUrl: slimImg.imageUrl,
    imageDataThumb: "",
    imageDisplayUrl: slimImg.imageDisplayUrl,
    imageSourceMode: slimImg.imageSourceMode,
    warning: warning
  };
}

function resetAllData(token) {
  requireAdmin_(token);
  initializeSheets_();
  const ss = SpreadsheetApp.openById(SHEET_ID);

  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  clearSheetData_(orderSheet, ORDERS_HEADERS);

  const stockSheet = ss.getSheetByName(STOCK_SHEET);
  clearSheetData_(stockSheet, ["ไซส์", "จำนวนที่มาส่ง"]);
  const stockRows = STOCK_SIZES.map(size => [size, DEFAULT_DELIVERED[size] || 0]);
  stockSheet.getRange(2, 1, stockRows.length, 2).setValues(stockRows);

  const roundSheet = ss.getSheetByName(ROUND_SHEET);
  roundSheet.getRange(2, 1, 1, 6).setValues([[
    DEFAULT_ROUND,
    "เสื้อโปโลชมรมวิศวกร กฟภ. รอบปี " + DEFAULT_ROUND,
    DEFAULT_UNIT_PRICE,
    DEFAULT_IMAGE,
    true,
    ""
  ]]);

  const sizeSheet = ss.getSheetByName(SIZE_CHART_SHEET);
  clearSheetData_(sizeSheet, ["ขนาด", "รอบอก(นิ้ว)", "ยาว(นิ้ว)"]);
  sizeSheet.getRange(2, 1, DEFAULT_SIZE_CHART.length, 3).setValues(DEFAULT_SIZE_CHART);

  invalidateDataCache_();
  return { ok: true, message: "ล้างข้อมูลและตั้งค่าเริ่มต้นเรียบร้อย (รอบปี " + DEFAULT_ROUND + ")" };
}

// === Sheet bootstrap / readers =========================================
const ORDERS_HEADERS = [
  "ลำดับ", "OrderId", "เขตที่สั่ง", "ไซส์", "จำนวน(ตัว)", "ราคา",
  "วันที่โอน", "เวลาโอน", "สถานะรับสินค้า", "หมายเหตุเพิ่มเติม", "Timestamp", "สลิป (ชื่อ)", "สลิป (URL)", "ผู้บันทึก",
  "requestedChange", "changeRequestStatus", "changeRequestNote", "สถานะชำระเงิน"
];

function ensureSheetsInitialized_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(SHEETS_READY_KEY) === "1") return;
  initializeSheets_();
  props.setProperty(SHEETS_READY_KEY, "1");
}

function getSpreadsheet_() {
  ensureSheetsInitialized_();
  return SpreadsheetApp.openById(SHEET_ID);
}

function initializeSheets_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  createSheetIfMissing_(ss, ROUND_SHEET, ROUND_HEADERS);
  createSheetIfMissing_(ss, STOCK_SHEET, ["ไซส์", "จำนวนที่มาส่ง"]);
  createSheetIfMissing_(ss, SIZE_CHART_SHEET, ["ขนาด", "รอบอก(นิ้ว)", "ยาว(นิ้ว)"]);
  createSheetIfMissing_(ss, ORDER_SHEET, ORDERS_HEADERS);
  createSheetIfMissing_(ss, SETTINGS_SHEET, ["Key", "Value"]);
  createSheetIfMissing_(ss, USERS_SHEET, ["Username", "PasswordHash", "Role", "Region", "DisplayName", "Active", "PasswordPlain"]);

  // Migrate Orders sheet if it has the old schema (11 cols without OrderId)
  migrateOrdersSheet_(ss);
  migrateRoundSheet_(ss);

  const roundSheet = ss.getSheetByName(ROUND_SHEET);
  if (roundSheet.getLastRow() < 2) {
    roundSheet.getRange(2, 1, 1, 6).setValues([[
      DEFAULT_ROUND,
      "เสื้อโปโลชมรมวิศวกร กฟภ. รอบปี " + DEFAULT_ROUND,
      DEFAULT_UNIT_PRICE,
      DEFAULT_IMAGE,
      true,
      ""
    ]]);
  }

  const stockSheet = ss.getSheetByName(STOCK_SHEET);
  if (stockSheet.getLastRow() < 2) {
    const stockRows = STOCK_SIZES.map(size => [size, DEFAULT_DELIVERED[size] || 0]);
    stockSheet.getRange(2, 1, stockRows.length, 2).setValues(stockRows);
  } else {
    ensureStockSizesSeeded_(stockSheet);
  }

  const sizeSheet = ss.getSheetByName(SIZE_CHART_SHEET);
  if (sizeSheet.getLastRow() < 2) {
    sizeSheet.getRange(2, 1, DEFAULT_SIZE_CHART.length, 3).setValues(DEFAULT_SIZE_CHART);
  }

  // Seed default users if Users sheet empty
  const usersSheet = ss.getSheetByName(USERS_SHEET);
  if (usersSheet.getLastRow() < 2) {
    const seeded = DEFAULT_USERS.map(u => [u[0], hashPassword_(u[1]), u[2], u[3], u[4], true, u[1]]);
    usersSheet.getRange(2, 1, seeded.length, 7).setValues(seeded);
  }
  migrateUsersPasswordPlainColumn_(ss);
  ensureDefaultEngineerUser_(ss);
  ensureDefaultViewerUser_(ss);

  PropertiesService.getScriptProperties().setProperty(SHEETS_READY_KEY, "1");
}

// Append any STOCK_SIZES rows missing from an existing Stock sheet (delivered=0)
// without modifying or wiping any existing stock values.
function ensureStockSizesSeeded_(stockSheet) {
  if (!stockSheet) return;
  const rows = getDataRows_(stockSheet, 2);
  const existing = {};
  rows.forEach(r => {
    const size = String(r[0] || "").trim();
    if (size) existing[size] = true;
  });
  const missing = STOCK_SIZES.filter(size => !existing[size]);
  if (missing.length === 0) return;
  const toAppend = missing.map(size => [size, DEFAULT_DELIVERED[size] || 0]);
  stockSheet.getRange(stockSheet.getLastRow() + 1, 1, toAppend.length, 2).setValues(toAppend);
}

function migrateOrdersSheet_(ss) {
  const sheet = ss.getSheetByName(ORDER_SHEET);
  if (!sheet) return;
  const headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const hasOrderId = headerRow.indexOf("OrderId") > -1;
  const hasNoteColumn = headerRow.some(h => {
    const n = String(h || "").trim();
    return n === "หมายเหตุเพิ่มเติม" || /^note$/i.test(n);
  });
  const hasRequestedChange = headerRow.indexOf("requestedChange") > -1;
  const hasChangeRequestStatus = headerRow.indexOf("changeRequestStatus") > -1;
  const hasChangeRequestNote = headerRow.indexOf("changeRequestNote") > -1;
  const hasPaymentStatus = headerRow.some(h => String(h || "").trim() === "สถานะชำระเงิน");
  const isLatestSchema = hasOrderId &&
    hasNoteColumn &&
    hasRequestedChange &&
    hasChangeRequestStatus &&
    hasChangeRequestNote &&
    hasPaymentStatus &&
    sheet.getLastColumn() >= ORDERS_HEADERS.length;
  if (isLatestSchema) return;

  if (hasOrderId && hasNoteColumn && hasRequestedChange && hasChangeRequestStatus && hasChangeRequestNote && !hasPaymentStatus) {
    const payCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, payCol).setValue("สถานะชำระเงิน").setFontWeight("bold");
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, payCol, lastRow - 1, 1).setValue("");
    }
    return;
  }

  // If sheet only has the original schema or old OrderId schema, migrate to latest columns
  if (sheet.getLastRow() <= 1) {
    sheet.clear();
    sheet.getRange(1, 1, 1, ORDERS_HEADERS.length).setValues([ORDERS_HEADERS]);
    sheet.getRange(1, 1, 1, ORDERS_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    return;
  }

  // Migrate existing data into:
  // ลำดับ, OrderId, เขต, ไซส์, qty, price, payDate, payTime, status, note, timestamp, slipName, slipUrl, createdBy
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const oldRows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  if (oldRows.length === 0) return;

  const migrated = oldRows.map(r => {
    if (!hasOrderId) {
      // Legacy 11-col: no OrderId / no createdBy / no note
      return [
        r[0],                          // ลำดับ
        "ORD-LEGACY-" + r[0],          // OrderId (synthesize)
        r[1],                          // เขต
        r[2],                          // ไซส์
        r[3],                          // qty
        r[4],                          // price
        r[5],                          // payDate
        r[6],                          // payTime
        r[7],                          // status
        "",                            // note
        r[8],                          // timestamp
        r[9],                          // slipName
        r[10],                         // slipUrl
        "",                            // ผู้บันทึก (unknown)
        "",                            // requestedChange
        CHANGE_REQUEST_STATUS.NONE,    // changeRequestStatus
        "",                            // changeRequestNote
        PAYMENT_STATUS.NONE            // paymentStatus
      ];
    }
    const baseChangeIdx = hasNoteColumn ? 14 : 13;
    return [
      r[0],                                               // ลำดับ
      String(r[1] || ("ORD-LEGACY-" + r[0])),            // OrderId
      r[2],                                               // เขต
      r[3],                                               // ไซส์
      r[4],                                               // qty
      r[5],                                               // price
      r[6],                                               // payDate
      r[7],                                               // payTime
      r[8],                                               // status
      hasNoteColumn ? String(r[9] || "") : "",           // note
      hasNoteColumn ? r[10] : r[9],                      // timestamp
      hasNoteColumn ? r[11] : r[10],                     // slipName
      hasNoteColumn ? r[12] : r[11],                     // slipUrl
      hasNoteColumn ? String(r[13] || "") : String(r[12] || ""), // createdBy
      String(r[baseChangeIdx] || ""),                    // requestedChange
      String(r[baseChangeIdx + 1] || CHANGE_REQUEST_STATUS.NONE), // changeRequestStatus
      String(r[baseChangeIdx + 2] || ""),                // changeRequestNote
      String(r[baseChangeIdx + 3] || PAYMENT_STATUS.NONE) // paymentStatus
    ];
  });

  sheet.clear();
  sheet.getRange(1, 1, 1, ORDERS_HEADERS.length).setValues([ORDERS_HEADERS]);
  sheet.getRange(1, 1, 1, ORDERS_HEADERS.length).setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.getRange(2, 1, migrated.length, ORDERS_HEADERS.length).setValues(migrated);
}

function migrateRoundSheet_(ss) {
  const sheet = ss.getSheetByName(ROUND_SHEET);
  if (!sheet) return;
  const lastCol = Math.max(sheet.getLastColumn(), ROUND_HEADERS.length);
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let changed = false;
  for (let i = 0; i < ROUND_HEADERS.length; i++) {
    if (String(header[i] || "").trim() !== ROUND_HEADERS[i]) {
      sheet.getRange(1, i + 1).setValue(ROUND_HEADERS[i]);
      changed = true;
    }
  }
  if (sheet.getLastColumn() < ROUND_HEADERS.length) {
    changed = true;
  }
  if (changed) {
    sheet.getRange(1, 1, 1, ROUND_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function getRoundInfo_(ss) {
  const sheet = ss.getSheetByName(ROUND_SHEET);
  ensureRoundImageThumb_(ss);
  const row = getDataRows_(sheet, 6)[0] || [];
  const safeImageUrl = sanitizeImageUrl_(row[3]);
  const thumb = sanitizeThumbDataUrl_(row[5]);
  const display = buildRoundDisplayPayload_(safeImageUrl, thumb);
  return {
    year: String(row[0] || DEFAULT_ROUND),
    name: String(row[1] || "เสื้อโปโลชมรมวิศวกร กฟภ."),
    unitPrice: Number(row[2]) || DEFAULT_UNIT_PRICE,
    imageUrl: safeImageUrl,
    imageDataThumb: thumb,
    imageDisplayUrl: display.imageDisplayUrl,
    imageSourceMode: display.imageSourceMode
  };
}

/** ซ่อม thumbnail จาก Drive หรือย้าย data URL เก่าในคอลัมน์รูป → คอลัมน์ย่อ */
function ensureRoundImageThumb_(ss) {
  const sheet = ss.getSheetByName(ROUND_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return "";
  const row = sheet.getRange(2, 1, 1, 6).getValues()[0];
  const rawUrl = String(row[3] || "").trim();
  let thumb = sanitizeThumbDataUrl_(row[5]);
  if (!thumb && /^data:image\//i.test(rawUrl)) {
    thumb = sanitizeThumbDataUrl_(rawUrl);
    if (thumb) {
      sheet.getRange(2, 6).setValue(thumb);
      if (extractDriveFileId_(rawUrl)) {
        sheet.getRange(2, 4).setValue(buildDriveImageRef_(extractDriveFileId_(rawUrl)));
      }
      invalidateDataCache_();
      return thumb;
    }
  }
  const fileId = extractDriveFileId_(rawUrl);
  if (!thumb && fileId) {
    thumb = generateImageThumbFromDriveFile_(fileId);
    if (thumb) {
      sheet.getRange(2, 6).setValue(thumb);
      invalidateDataCache_();
    }
  }
  return thumb || "";
}

function sanitizeImageUrl_(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^data:/i.test(s)) return "";
  if (s.length > 1800) return "";
  const normalized = normalizeDriveImageUrl_(s);
  return normalized || "";
}

function normalizeDriveImageUrl_(url) {
  const s = String(url || "").trim();
  const id = extractDriveFileId_(s);
  if (!id) return s;
  return buildDriveImageRef_(id);
}

function extractDriveFileId_(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  const ref = s.match(/^drivefile:([a-zA-Z0-9_-]+)/i);
  if (ref && ref[1]) return ref[1];
  const q = s.match(/[?&]id=([^&]+)/i);
  if (q && q[1]) return q[1];
  const d = s.match(/\/d\/([^/?#]+)/i);
  if (d && d[1]) return d[1];
  const uc = s.match(/\/uc\?(?:[^#]*&)?id=([^&]+)/i);
  if (uc && uc[1]) return uc[1];
  return "";
}

function buildDriveImageRef_(fileId) {
  return fileId ? "drivefile:" + fileId : "";
}

function sanitizeThumbDataUrl_(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(s)) return "";
  if (s.length > 30000) return "";
  return s;
}

function generateImageThumbDataUrl_(base64) {
  const s = String(base64 || "").trim();
  if (!s || !/^data:image\//i.test(s)) return "";
  return sanitizeThumbDataUrl_(s);
}

function generateImageThumbFromDriveFile_(fileId) {
  const id = extractDriveFileId_(fileId);
  if (!id || !isProxyAllowedFileId_(id)) return "";
  try {
    const resp = UrlFetchApp.fetch(
      "https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w400",
      { muteHttpExceptions: true, followRedirects: true }
    );
    if (resp.getResponseCode() !== 200) return "";
    const blob = resp.getBlob();
    const mime = blob.getContentType() || "image/jpeg";
    const dataUrl = "data:" + mime + ";base64," + Utilities.base64Encode(blob.getBytes());
    return sanitizeThumbDataUrl_(dataUrl);
  } catch (e) {
    return "";
  }
}

function buildRoundDisplayPayload_(imageUrl, imageDataThumb) {
  const url = sanitizeImageUrl_(imageUrl);
  const thumb = sanitizeThumbDataUrl_(imageDataThumb);
  const id = extractDriveFileId_(url);
  if (thumb) {
    return { imageDisplayUrl: thumb, imageSourceMode: "thumb" };
  }
  if (id) {
    const proxy = getImageProxy(id);
    if (proxy && proxy.ok && proxy.dataUrl) {
      return { imageDisplayUrl: proxy.dataUrl, imageSourceMode: "proxy" };
    }
    if (proxy && proxy.ok && proxy.thumbnailUrl) {
      return { imageDisplayUrl: proxy.thumbnailUrl, imageSourceMode: "thumb-url" };
    }
  }
  if (url && !/^drivefile:/i.test(url)) {
    return { imageDisplayUrl: url, imageSourceMode: "url" };
  }
  return { imageDisplayUrl: DEFAULT_IMAGE, imageSourceMode: "placeholder" };
}

function getRoundImageCellDebug(token) {
  requireAdmin_(token);
  ensureSheetsInitialized_();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(ROUND_SHEET);
  const row = sheet.getRange(2, 1, 1, 6).getValues()[0];
  return {
    year: String(row[0] || ""),
    imageCellRaw: String(row[3] || ""),
    imageThumbRaw: String(row[5] || ""),
    imageCellType: extractDriveFileId_(row[3]) ? "drivefile" : (String(row[3] || "").trim() ? "url" : "blank"),
    imageThumbSize: String(row[5] || "").length,
    resolved: buildRoundDisplayPayload_(row[3], row[5])
  };
}


// Only allow the public/guest image proxy to resolve files the system actually
// uses: the currently-configured round image, or files living inside the
// shirt/slip upload folders. This stops the (anonymously callable) endpoint from
// being used to read arbitrary Drive files the deploying account can access.
function isFileUnderAllowedDriveFolders_(fileId) {
  if (!fileId) return false;
  const allowed = [DRIVE_FOLDER_ID, SLIP_FOLDER_ID].filter(Boolean);
  if (!allowed.length) return false;
  const seen = {};
  const queue = [];
  try {
    const parents = DriveApp.getFileById(fileId).getParents();
    while (parents.hasNext()) queue.push(parents.next().getId());
    while (queue.length) {
      const pid = queue.shift();
      if (!pid || seen[pid]) continue;
      seen[pid] = true;
      if (allowed.indexOf(pid) > -1) return true;
      try {
        const up = DriveApp.getFolderById(pid).getParents();
        while (up.hasNext()) queue.push(up.next().getId());
      } catch (e2) {}
    }
  } catch (e) {}
  return false;
}

function isProxyAllowedFileId_(id) {
  if (!id) return false;
  // (1) The round image stored in the sheet is always allowed. This also covers
  //     the case where uploads fell back to an owned folder other than the
  //     configured one.
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ROUND_SHEET);
    if (sheet && extractDriveFileId_(sheet.getRange(2, 4).getValue()) === id) return true;
  } catch (e) {}
  // (2) Any file under configured shirt/slip folders (including region subfolders).
  return isFileUnderAllowedDriveFolders_(id);
}

function getImageProxy(imageRef) {
  const id = extractDriveFileId_(imageRef);
  if (!id) {
    return { ok: false, warning: "ไม่พบรหัสไฟล์ภาพ" };
  }
  if (!isProxyAllowedFileId_(id)) {
    return { ok: false, fileId: id, warning: "ไม่อนุญาตให้เข้าถึงไฟล์นี้" };
  }
  const cacheKey = "img_proxy_" + id;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    return {
      ok: true,
      fileId: id,
      dataUrl: cached,
      cached: true
    };
  }
  try {
    const file = DriveApp.getFileById(id);
    const blob = file.getBlob();
    const mime = blob.getContentType() || "image/jpeg";
    const bytes = blob.getBytes();
    const dataUrl = "data:" + mime + ";base64," + Utilities.base64Encode(bytes);
    const thumbUrl = "https://drive.google.com/thumbnail?id=" + id + "&sz=w1000";
    // google.script.run payload limit — very large slips use thumbnail URL on client.
    if (dataUrl.length >= 95000) {
      return {
        ok: true,
        fileId: id,
        dataUrl: "",
        thumbnailUrl: thumbUrl,
        cached: false,
        warning: "ใช้ภาพย่อ (ไฟล์ใหญ่)"
      };
    }
    if (dataUrl.length < 90000) {
      try { cache.put(cacheKey, dataUrl, 600); } catch (e) {}
    }
    return {
      ok: true,
      fileId: id,
      dataUrl: dataUrl,
      thumbnailUrl: thumbUrl,
      cached: false
    };
  } catch (e) {
    return {
      ok: false,
      fileId: id,
      warning: "โหลดรูปจาก Google Drive ไม่สำเร็จ",
      error: String(e && e.message ? e.message : e)
    };
  }
}

function calcSoldFromOrders_(orders) {
  const sold = {};
  STOCK_SIZES.forEach(s => { sold[s] = 0; });
  orders.forEach(o => {
    const size = String(o.size || "").trim();
    const qty = Number(o.qty) || 0;
    if (size in sold) sold[size] += qty;
  });
  return sold;
}

function getStockSummary_(ss) {
  return getStockSummaryWithSold_(ss, calcSoldFromOrders_(getOrders_(ss)));
}

function getStockSummaryWithSold_(ss, soldMap) {
  const stockSheet = ss.getSheetByName(STOCK_SHEET);
  const rows = getDataRows_(stockSheet, 2);
  const deliveredMap = {};
  rows.forEach(r => {
    const size = String(r[0] || "").trim();
    if (size) deliveredMap[size] = Number(r[1]) || 0;
  });
  return STOCK_SIZES.map(size => {
    const delivered = deliveredMap[size] !== undefined
      ? deliveredMap[size]
      : (DEFAULT_DELIVERED[size] || 0);
    const sold = soldMap[size] || 0;
    return {
      size: size,
      delivered: delivered,
      sold: sold,
      remaining: Math.max(delivered - sold, 0)
    };
  });
}

function getSizeChart_(ss) {
  const sheet = ss.getSheetByName(SIZE_CHART_SHEET);
  return getDataRows_(sheet, 3).map(r => ({
    size: String(r[0] || ""),
    chest: Number(r[1]) || 0,
    length: Number(r[2]) || 0
  })).filter(r => r.size);
}

function serializeSheetValue_(value) {
  if (value == null || value === "") return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return isNaN(value.getTime()) ? "" : value.toISOString();
  }
  return value;
}

function sanitizeOrderForClient_(order) {
  if (!order) return order;
  return {
    no: Number(order.no) || 0,
    orderId: String(order.orderId || ""),
    region: String(order.region || ""),
    size: String(order.size || ""),
    qty: Number(order.qty) || 0,
    price: Number(order.price) || 0,
    payDate: String(serializeSheetValue_(order.payDate) || ""),
    payTime: String(serializeSheetValue_(order.payTime) || ""),
    orderStatus: String(order.orderStatus || order.status || ORDER_STATUS_ORDERED),
    status: String(order.status || order.orderStatus || ORDER_STATUS_ORDERED),
    note: String(order.note || ""),
    timestamp: String(serializeSheetValue_(order.timestamp) || ""),
    slipName: String(order.slipName || ""),
    slipUrl: String(order.slipUrl || ""),
    createdBy: String(order.createdBy || ""),
    requestedChange: String(order.requestedChange || ""),
    changeRequestStatus: String(order.changeRequestStatus || CHANGE_REQUEST_STATUS.NONE),
    changeRequestNote: String(order.changeRequestNote || ""),
    paymentStatus: String(order.paymentStatus || PAYMENT_STATUS.NONE)
  };
}

function sanitizeOrderForViewer_(order, session) {
  const out = sanitizeOrderForClient_(order);
  if (session && session.role === "admin" && isAdminHiddenNoteRegion_(out.region)) {
    out.note = "";
  }
  return out;
}

function getOrders_(ss) {
  const sheet = ss.getSheetByName(ORDER_SHEET);
  if (!sheet) return [];
  const last = sheet.getLastRow();
  if (last <= 1) return [];
  // Clamp the read width to the sheet's actual column count so this never
  // throws a range error (which would blank the whole app on bootstrap).
  // Short rows are tolerated because r[idx] is undefined-safe below.
  const maxCols = sheet.getMaxColumns();
  const width = Math.min(ORDERS_HEADERS.length, maxCols);
  const values = sheet.getRange(2, 1, last - 1, width).getValues();
  return values.map(r => sanitizeOrderForClient_({
    no: Number(r[0]) || 0,
    orderId: String(r[1] || ("ORD-" + r[0])),
    region: String(r[2] || ""),
    size: String(r[3] || ""),
    qty: Number(r[4]) || 0,
    price: Number(r[5]) || 0,
    payDate: r[6],
    payTime: r[7],
    orderStatus: String(r[8] || ORDER_STATUS_ORDERED),
    status: String(r[8] || ORDER_STATUS_ORDERED),
    note: String(r[9] || ""),
    timestamp: r[10],
    slipName: String(r[11] || ""),
    slipUrl: String(r[12] || ""),
    createdBy: String(r[13] || ""),
    requestedChange: String(r[14] || ""),
    changeRequestStatus: String(r[15] || CHANGE_REQUEST_STATUS.NONE),
    changeRequestNote: String(r[16] || ""),
    paymentStatus: String(r[17] || PAYMENT_STATUS.NONE)
  }));
}

// === Utilities =========================================================
function renumberOrders_(orderSheet) {
  const last = orderSheet.getLastRow();
  if (last <= 1) return;
  const count = last - 1;
  const nums = [];
  for (let i = 1; i <= count; i++) nums.push([i]);
  orderSheet.getRange(2, 1, count, 1).setValues(nums);
}

function clearSheetData_(sheet, headers) {
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function createSheetIfMissing_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function getDataRows_(sheet, width) {
  const last = sheet.getLastRow();
  if (last <= 1) return [];
  return sheet.getRange(2, 1, last - 1, width).getValues();
}

/** อ่าน Orders แบบเดียวกับ getOrders_ (มี header แถวที่ 1, ไม่รวมแถวสรุปท้ายชีต) */
function getOrderSheetValues_(orderSheet) {
  const last = orderSheet.getLastRow();
  const width = Math.min(ORDERS_HEADERS.length, orderSheet.getMaxColumns());
  const header = orderSheet.getRange(1, 1, 1, width).getValues()[0];
  if (last <= 1) return [header];
  const data = orderSheet.getRange(2, 1, last - 1, width).getValues();
  return [header].concat(data);
}

function saveBase64File_(base64, prefix) {
  // w400 instead of w1200 — 9x smaller payload for browser
  const saved = saveBase64ToFolder_(base64, prefix, DRIVE_FOLDER_ID, "w400", false);
  if (saved && saved.fileId) {
    saved.url = buildDriveImageRef_(saved.fileId);
  }
  return saved;
}

function sanitizeDriveSegment_(value) {
  return String(value || "unknown")
    .trim()
    .replace(/[\\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 80) || "unknown";
}

function formatSlipDateTime_(payDate, payTime) {
  let d = new Date();
  const pd = String(payDate || "").trim();
  if (pd) {
    if (/^\d{4}-\d{2}-\d{2}/.test(pd)) {
      d = new Date(pd + (pd.length === 10 ? "T12:00:00" : ""));
    } else {
      const tryD = new Date(pd);
      if (!isNaN(tryD.getTime())) d = tryD;
    }
  }
  let hh = d.getHours();
  let mm = d.getMinutes();
  const pt = String(payTime || "").trim();
  const tm = pt.match(/(\d{1,2}):(\d{2})/);
  if (tm) {
    hh = Number(tm[1]);
    mm = Number(tm[2]);
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return y + mo + da + "_" + String(hh).padStart(2, "0") + String(mm).padStart(2, "0");
}

function buildSlipFileBaseName_(region, payDate, payTime, amount, uniqueSuffix) {
  let dt = formatSlipDateTime_(payDate, payTime);
  if (uniqueSuffix) {
    const n = new Date();
    dt += String(n.getSeconds()).padStart(2, "0") + String(n.getMilliseconds()).padStart(3, "0");
  }
  return sanitizeDriveSegment_(region) + "_" + dt + "_" + Math.round(Number(amount) || 0);
}

function getSlipSubfolderForRegion_(region) {
  const root = getWritableFolder_(SLIP_FOLDER_ID, "PEACE-Slip-Uploads");
  const folderName = sanitizeDriveSegment_(region);
  const it = root.getFoldersByName(folderName);
  if (it.hasNext()) return it.next();
  return root.createFolder(folderName);
}

function getOrderSlipContext_(orderSheet, orderId, session) {
  const values = getOrderSheetValues_(orderSheet);
  const targetOrderId = String(orderId || "").trim();
  const targetRows = [];
  let region = "";
  let payDate = "";
  let payTime = "";
  let totalAmount = 0;
  let hadSlip = false;
  let orderStatus = "";
  let paymentStatus = PAYMENT_STATUS.NONE;
  for (let i = 1; i < values.length; i++) {
    const rowOrderId = String(values[i][1] || values[i][0]);
    if (rowOrderId !== targetOrderId) continue;
    if (!sessionCanModifyRegion_(session, values[i][2])) {
      throw new Error("ไม่มีสิทธิ์จัดการรูปของออเดอร์นี้");
    }
    targetRows.push(i + 1);
    if (!region) {
      region = String(values[i][2] || "");
      orderStatus = String(values[i][8] || ORDER_STATUS_ORDERED);
    }
    if (!paymentStatus || paymentStatus === PAYMENT_STATUS.NONE) {
      paymentStatus = String(values[i][17] || PAYMENT_STATUS.NONE).trim();
    }
    if (!payDate) payDate = String(values[i][6] || "");
    if (!payTime) payTime = String(values[i][7] || "");
    totalAmount += Number(values[i][5]) || 0;
    if (String(values[i][12] || "").trim()) hadSlip = true;
  }
  return {
    region: region,
    payDate: payDate,
    payTime: payTime,
    totalAmount: totalAmount,
    targetRows: targetRows,
    hadSlip: hadSlip,
    orderStatus: orderStatus || ORDER_STATUS_ORDERED,
    paymentStatus: paymentStatus
  };
}

function saveSlipFileForOrder_(base64, opts) {
  opts = opts || {};
  const folder = getSlipSubfolderForRegion_(opts.region);
  const baseName = buildSlipFileBaseName_(opts.region, opts.payDate, opts.payTime, opts.amount, !!opts.uniqueSuffix);
  return saveBase64ToFolder_(base64, baseName, folder.getId(), "w400", true);
}

function saveSlipFile_(base64, prefix) {
  return saveBase64ToFolder_(base64, prefix, SLIP_FOLDER_ID, "w400", true);
}

function saveBase64ToFolder_(base64, prefix, folderId, sizeParam, includeViewUrl) {
  if (!base64) return { name: "", url: "" };
  const raw = String(base64);
  const commaIdx = raw.indexOf(",");
  const header = commaIdx > -1 ? raw.substring(0, commaIdx) : "";
  const dataPart = commaIdx > -1 ? raw.substring(commaIdx + 1) : raw;
  if (!dataPart) return { name: "", url: "" };

  let mime = "image/jpeg";
  let ext = ".jpg";
  const m = header.match(/data:([^;]+);base64/i);
  if (m && m[1]) {
    mime = m[1];
    if (/png/i.test(mime)) ext = ".png";
    else if (/webp/i.test(mime)) ext = ".webp";
    else if (/gif/i.test(mime)) ext = ".gif";
  }

  let file;
  try {
    const folder = getWritableFolder_(folderId, includeViewUrl ? "PEACE-Slip-Uploads" : "PEACE-Shirt-Uploads");
    const fileName = prefix + ext;
    const blob = Utilities.newBlob(Utilities.base64Decode(dataPart), mime, fileName);
    file = folder.createFile(blob);
  } catch (e) {
    throw new Error("ระบบยังไม่ได้รับสิทธิ์ Google Drive หรือโฟลเดอร์ปลายทางเข้าไม่ถึง กรุณาให้แอดมินอนุญาตสิทธิ์ Drive แล้วลองใหม่");
  }
  const result = {
    name: file.getName(),
    fileId: file.getId(),
    url: "https://drive.google.com/uc?export=view&id=" + file.getId()
  };
  if (includeViewUrl) {
    result.viewUrl = "https://drive.google.com/file/d/" + file.getId() + "/view";
  }
  return result;
}

function testDriveAccess_() {
  // NOTE: This helper is intended to be run manually in Apps Script editor as script owner.
  // Underscore suffix makes it a private function, so it is NOT exposed to anonymous
  // google.script.run callers (which would otherwise leak Drive folder IDs/names).
  const shirtFolder = getWritableFolder_(DRIVE_FOLDER_ID, "PEACE-Shirt-Uploads");
  const slipFolder = getWritableFolder_(SLIP_FOLDER_ID, "PEACE-Slip-Uploads");
  return {
    ok: true,
    shirtFolderId: shirtFolder.getId(),
    shirtFolderName: shirtFolder.getName(),
    slipFolderId: slipFolder.getId(),
    slipFolderName: slipFolder.getName()
  };
}

function getWritableFolder_(preferredFolderId, fallbackFolderName) {
  // Try configured folder first; fallback to/create an owned folder if access is denied.
  if (preferredFolderId) {
    try {
      const folder = DriveApp.getFolderById(preferredFolderId);
      folder.getName(); // access smoke-test
      return folder;
    } catch (e) {
      // use fallback folder below
    }
  }
  const it = DriveApp.getFoldersByName(fallbackFolderName);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(fallbackFolderName);
}
