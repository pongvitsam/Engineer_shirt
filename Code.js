// =====================================================================
// PEACE Engineer Club — Shirt Sales System (Apps Script back-end)
// RBAC + Multi-size orders + Speed optimizations
// =====================================================================

// === Web app entry =====================================================
function doGet() {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("ระบบจัดการขายเสื้อชมรมวิศวกร กฟภ.")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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
const CACHE_KEY_BOOTSTRAP = "bootstrap_v2";
const SHEETS_READY_KEY = "SHEETS_READY_V4";

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

const STOCK_SIZES = ["XS", "S", "M", "L", "XL", "2L", "3L", "5L", "7L"];

const DEFAULT_DELIVERED = {
  XS: 0, S: 0, M: 38, L: 60, XL: 56, "2L": 32, "3L": 8, "5L": 3, "7L": 3
};

const DEFAULT_SIZE_CHART = [
  ["XS", 36, 25], ["S", 38, 26], ["M", 40, 27], ["L", 42, 28],
  ["XL", 44, 29], ["2L", 46, 30], ["3L", 48, 31], ["5L", 52, 32], ["7L", 56, 33]
];

const PICKUP_STATUS = ["รอโอน", "รอรับ", "รับแล้ว"];
const ORDER_STATUS_ORDERED = "สั่งออเดอร์แล้ว";
const ADMIN_ORDER_STATUS = [ORDER_STATUS_ORDERED].concat(PICKUP_STATUS);
const CHANGE_REQUEST_STATUS = {
  NONE: "none",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
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
  ["user_hq", "Peace@2569", "user",  "สำนักงานใหญ่", "ผู้ใช้งานสำนักงานใหญ่"]
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

function verifySession_(token) {
  const s = readSession_(token);
  if (!s) throw new Error("กรุณาเข้าสู่ระบบใหม่");
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

// Region access guard (fail-closed). Admins and the wildcard region "*" may
// access every region; a non-admin session WITHOUT a concrete region is denied
// access to all rows instead of silently bypassing region scoping.
function sessionCanAccessRegion_(session, rowRegion) {
  if (!session) return false;
  if (session.role === "admin" || session.region === "*") return true;
  if (!session.region) return false; // fail closed: user without region sees nothing
  return String(rowRegion) === String(session.region);
}

// === Auth: public endpoints ===========================================
function login(username, password) {
  ensureSheetsInitialized_();
  const u = String(username || "").trim();
  const p = String(password || "");
  if (!u || !p) throw new Error("กรอกชื่อผู้ใช้และรหัสผ่าน");

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(USERS_SHEET);
  const rows = getDataRows_(sheet, 6);
  const hash = hashPassword_(p);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]).trim() === u && String(r[1]) === hash) {
      const role = String(r[2] || "user");
      const region = String(r[3] || "");
      const display = String(r[4] || u);
      const active = r[5] === false || String(r[5]).toLowerCase() === "false" ? false : true;
      if (!active) throw new Error("บัญชีนี้ถูกระงับ");
      const token = genToken_();
      const session = {
        username: u,
        role: role,
        region: region,
        displayName: display,
        loginAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString()
      };
      saveSession_(token, session);
      return { ok: true, token: token, username: u, role: role, region: region, displayName: display };
    }
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
  return {
    ok: true,
    username: s.username,
    role: s.role,
    region: s.region,
    displayName: s.displayName || s.username
  };
}

function getGuestStockData() {
  ensureSheetsInitialized_();
  const data = buildBootstrapData_();
  return {
    regions: [],
    round: data.round,
    stockSizes: data.stockSizes,
    stock: data.stock,
    sizeChart: [],
    orders: [],
    unitPrice: data.unitPrice,
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
function listUsers(token) {
  requireAdmin_(token);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const rows = getDataRows_(ss.getSheetByName(USERS_SHEET), 6);
  return rows.map(r => ({
    username: String(r[0] || ""),
    role: String(r[2] || "user"),
    region: String(r[3] || ""),
    displayName: String(r[4] || ""),
    active: r[5] === false || String(r[5]).toLowerCase() === "false" ? false : true
  })).filter(u => u.username);
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
  if (role !== "admin" && role !== "user") throw new Error("ตำแหน่งไม่ถูกต้อง");

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(USERS_SHEET);
  const rows = getDataRows_(sheet, 6);
  if (rows.some(r => String(r[0]).trim() === username)) {
    throw new Error("มีชื่อผู้ใช้นี้แล้ว");
  }
  sheet.appendRow([username, hashPassword_(password), role, region, displayName, true]);
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
  if (String(me.username) === String(username)) throw new Error("ห้ามลบบัญชีของตัวเอง");
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(USERS_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(username).trim()) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  throw new Error("ไม่พบผู้ใช้ " + username);
}

function resetPassword(token, username, newPassword) {
  requireAdmin_(token);
  const np = String(newPassword || "");
  if (np.length < 4) throw new Error("รหัสผ่านต้องอย่างน้อย 4 ตัว");
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(USERS_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(username).trim()) {
      sheet.getRange(i + 1, 2).setValue(hashPassword_(np));
      return { ok: true };
    }
  }
  throw new Error("ไม่พบผู้ใช้ " + username);
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
    data = buildBootstrapData_();
    try { cache.put(CACHE_KEY_BOOTSTRAP, JSON.stringify(data), CACHE_TTL_SEC); } catch (e) {}
  }
  // Scope orders by region for non-admin users
  const out = {
    regions: data.regions,
    round: data.round,
    stockSizes: data.stockSizes,
    stock: data.stock,
    sizeChart: data.sizeChart,
    orders: data.orders,
    unitPrice: data.unitPrice,
    pickupStatus: data.pickupStatus,
    generatedAt: data.generatedAt,
    me: {
      username: session.username,
      role: session.role,
      region: session.region,
      displayName: session.displayName || session.username
    }
  };
  if (session.role !== "admin" && session.region !== "*") {
    // Fail closed: a non-admin without a concrete region must not see any orders.
    out.orders = session.region
      ? data.orders.filter(o => o.region === session.region)
      : [];
  }
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
    generatedAt: new Date().toISOString()
  };
}

function invalidateDataCache_() {
  CacheService.getScriptCache().remove(CACHE_KEY_BOOTSTRAP);
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

    const stock = getStockSummary_(ss);
    Object.keys(agg).forEach(size => {
      const s = stock.find(x => x.size === size);
      if (!s) throw new Error("ไม่พบไซส์ " + size);
      if (s.remaining < agg[size]) {
        throw new Error("ไซส์ " + size + " คงเหลือ " + s.remaining + " ตัว (สั่ง " + agg[size] + ")");
      }
    });

    const payDate = String(payload.payDate || "").trim();
    const payTime = String(payload.payTime || "").trim();
    const requestedStatus = String(payload.status || "").trim();
    const status = resolveNewOrderStatus_(session, requestedStatus);
    const unitPrice = Number(payload.unitPrice) || getRoundInfo_(ss).unitPrice;

    const now = new Date();
    const orderId = "ORD" + now.getTime() + Math.floor(Math.random() * 1000);

    let slipName = "";
    let slipUrl = "";
    let slipWarning = "";
    if (payload.slipBase64) {
      try {
        const slip = saveSlipFile_(payload.slipBase64, "Slip_" + orderId);
        slipName = slip.name || "";
        slipUrl = slip.url || "";
      } catch (e) {
        // Slip is optional: if Drive is blocked, allow order creation to continue.
        slipName = "";
        slipUrl = "";
        slipWarning = "บันทึกออเดอร์สำเร็จ แต่แนบสลิปไม่สำเร็จ (สิทธิ์ Google Drive ยังไม่พร้อม)";
      }
    }

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
        "",
        now,
        slipName,
        slipUrl,
        session.username,
        "",
        CHANGE_REQUEST_STATUS.NONE,
        ""
      ]);
    });
    orderSheet.getRange(orderSheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);

    invalidateDataCache_();
    return { ok: true, orderId: orderId, totalQty: totalQty, rows: rowsToAppend.length, warning: slipWarning };
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
    slipBase64: payload.slipBase64,
    unitPrice: payload.price && payload.qty ? Number(payload.price) / Number(payload.qty) : undefined,
    items: [{ size: payload.size, qty: Number(payload.qty) || 0 }]
  });
}

function resolveNewOrderStatus_(session, incomingStatus) {
  if (session && session.role === "admin") {
    if (!incomingStatus) return ORDER_STATUS_ORDERED;
    if (!ADMIN_ORDER_STATUS.includes(incomingStatus)) throw new Error("สถานะไม่ถูกต้อง");
    return incomingStatus;
  }
  return ORDER_STATUS_ORDERED;
}

function updateOrderStatus(token, no, status) {
  requireAdmin_(token);
  ensureSheetsInitialized_();
  if (!ADMIN_ORDER_STATUS.includes(status)) throw new Error("สถานะไม่ถูกต้อง");
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const values = orderSheet.getDataRange().getValues();
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
  const values = orderSheet.getDataRange().getValues();
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
  const values = orderSheet.getDataRange().getValues();
  const safeNote = String(note == null ? "" : note).trim();
  let changed = 0;
  for (let i = 1; i < values.length; i++) {
    const rowOrderId = String(values[i][1] || values[i][0]);
    if (rowOrderId === String(orderId)) {
      if (!sessionCanAccessRegion_(session, values[i][2])) continue;
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

// Upload an image for an order that does NOT already have one. Rejects when a
// slip is already attached (caller must delete first).
function uploadOrderImage(token, orderId, base64, filename) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const targetOrderId = String(orderId || "").trim();
  if (!targetOrderId) throw new Error("กรุณาระบุ orderId");
  if (!base64) throw new Error("กรุณาเลือกรูปก่อนอัปโหลด");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("ระบบกำลังบันทึก กรุณาลองใหม่อีกครั้ง");
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orderSheet = ss.getSheetByName(ORDER_SHEET);
    const values = orderSheet.getDataRange().getValues();
    const targetRows = [];
    let alreadyHasImage = false;
    for (let i = 1; i < values.length; i++) {
      const rowOrderId = String(values[i][1] || values[i][0]);
      if (rowOrderId !== targetOrderId) continue;
      if (!sessionCanAccessRegion_(session, values[i][2])) {
        throw new Error("ไม่มีสิทธิ์จัดการรูปของออเดอร์นี้");
      }
      targetRows.push(i + 1);
      if (String(values[i][12] || "").trim()) alreadyHasImage = true;
    }
    if (targetRows.length === 0) throw new Error("ไม่พบออเดอร์ " + targetOrderId);
    if (alreadyHasImage) {
      throw new Error("ออเดอร์นี้มีรูปแนบอยู่แล้ว กรุณาลบรูปเดิมก่อนจึงจะอัปโหลดใหม่ได้");
    }

    const saved = saveSlipFile_(base64, "Slip_" + targetOrderId);
    const slipName = (saved && saved.name) || "";
    const slipUrl = (saved && saved.url) || "";
    if (!slipUrl) {
      throw new Error("อัปโหลดรูปไม่สำเร็จ: สิทธิ์ Google Drive ยังไม่พร้อม");
    }
    targetRows.forEach(row => {
      orderSheet.getRange(row, 12).setValue(slipName);
      orderSheet.getRange(row, 13).setValue(slipUrl);
    });
    invalidateDataCache_();
    return {
      ok: true,
      orderId: targetOrderId,
      slipName: slipName,
      slipUrl: slipUrl,
      fileId: extractDriveFileId_(slipUrl),
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
    const values = orderSheet.getDataRange().getValues();
    const targetRows = [];
    const fileIds = {};
    for (let i = 1; i < values.length; i++) {
      const rowOrderId = String(values[i][1] || values[i][0]);
      if (rowOrderId !== targetOrderId) continue;
      if (!sessionCanAccessRegion_(session, values[i][2])) {
        throw new Error("ไม่มีสิทธิ์จัดการรูปของออเดอร์นี้");
      }
      targetRows.push(i + 1);
      const id = extractDriveFileId_(values[i][12]);
      if (id) fileIds[id] = true;
    }
    if (targetRows.length === 0) throw new Error("ไม่พบออเดอร์ " + targetOrderId);

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
  const values = orderSheet.getDataRange().getValues();
  let slipUrl = "";
  let found = false;
  for (let i = 1; i < values.length; i++) {
    const rowOrderId = String(values[i][1] || values[i][0]);
    if (rowOrderId !== targetOrderId) continue;
    if (!sessionCanAccessRegion_(session, values[i][2])) {
      throw new Error("ไม่มีสิทธิ์ดูรูปของออเดอร์นี้");
    }
    found = true;
    const ref = String(values[i][12] || "").trim();
    if (ref) { slipUrl = ref; break; }
  }
  if (!found) throw new Error("ไม่พบออเดอร์ " + targetOrderId);
  if (!slipUrl) return { ok: false, warning: "ออเดอร์นี้ยังไม่มีรูปแนบ" };
  const fileId = extractDriveFileId_(slipUrl);
  const proxy = getImageProxy(fileId);
  if (proxy && proxy.ok && proxy.dataUrl) {
    return { ok: true, orderId: targetOrderId, fileId: fileId, dataUrl: proxy.dataUrl, slipUrl: slipUrl };
  }
  return {
    ok: false,
    orderId: targetOrderId,
    fileId: fileId,
    slipUrl: slipUrl,
    warning: (proxy && proxy.warning) || "โหลดรูปไม่สำเร็จ"
  };
}

function deleteOrder(token, no) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const values = orderSheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (Number(values[i][0]) === Number(no)) {
      if (!sessionCanAccessRegion_(session, values[i][2])) {
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
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const values = orderSheet.getDataRange().getValues();
  const rowsToDelete = [];
  for (let i = 1; i < values.length; i++) {
    const rowOrderId = String(values[i][1] || values[i][0]);
    if (rowOrderId === String(orderId)) {
      if (!sessionCanAccessRegion_(session, values[i][2])) continue;
      rowsToDelete.push(i + 1);
    }
  }
  if (rowsToDelete.length === 0) throw new Error("ไม่พบออเดอร์ " + orderId);
  // delete from bottom up to keep indices stable
  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    orderSheet.deleteRow(rowsToDelete[i]);
  }
  renumberOrders_(orderSheet);
  invalidateDataCache_();
  return { ok: true, deleted: rowsToDelete.length };
}

function requestOrderChange(token, orderId, items, reason) {
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const values = orderSheet.getDataRange().getValues();
  const targetRows = [];
  const orderItems = [];
  const targetOrderId = String(orderId || "").trim();
  if (!targetOrderId) throw new Error("กรุณาระบุ orderId");

  for (let i = 1; i < values.length; i++) {
    const rowOrderId = String(values[i][1] || values[i][0]);
    if (rowOrderId !== targetOrderId) continue;
    const rowRegion = String(values[i][2] || "");
    if (!sessionCanAccessRegion_(session, rowRegion)) {
      throw new Error("ไม่มีสิทธิ์ส่งคำขอแก้ไขออเดอร์นี้");
    }
    targetRows.push(i + 1);
    orderItems.push({
      size: String(values[i][3] || ""),
      qty: Number(values[i][4]) || 0
    });
  }
  if (targetRows.length === 0) throw new Error("ไม่พบออเดอร์ " + targetOrderId);

  const normalizedItems = normalizeChangeRequestItems_(items);
  if (normalizedItems.length === 0) throw new Error("กรุณาระบุจำนวนใหม่อย่างน้อย 1 ไซส์");

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
  targetRows.forEach(row => {
    orderSheet.getRange(row, 15).setValue(requestedJson);
    orderSheet.getRange(row, 16).setValue(CHANGE_REQUEST_STATUS.PENDING);
    orderSheet.getRange(row, 17).setValue("");
  });
  invalidateDataCache_();
  return { ok: true, orderId: targetOrderId, status: CHANGE_REQUEST_STATUS.PENDING };
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
  if (session.role === "admin") return filtered;
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
    const values = orderSheet.getDataRange().getValues();
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
          ""
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
  const session = requireUserOrAdmin_(token);
  ensureSheetsInitialized_();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const values = orderSheet.getDataRange().getDisplayValues();
  let filtered = values;
  if (session.role !== "admin" && session.region !== "*") {
    // Fail closed: a non-admin without a concrete region exports headers only.
    filtered = session.region
      ? [values[0]].concat(values.slice(1).filter(r => r[2] === session.region))
      : [values[0]];
  } else if (region && region !== "all") {
    filtered = [values[0]].concat(values.slice(1).filter(r => r[2] === region));
  }
  return filtered;
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
      const generatedThumb = generateImageThumbDataUrl_(payload.imageBase64);
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
  return {
    ok: true,
    imageUrl: imageUrl,
    imageDataThumb: imageDataThumb,
    imageDisplayUrl: display.imageDisplayUrl,
    imageSourceMode: display.imageSourceMode,
    warning: warning
  };
}

function uploadShirtImage(token, imageBase64) {
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
    imageDataThumb = generateImageThumbDataUrl_(imageBase64);
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
  return {
    ok: true,
    imageUrl: imageUrl,
    imageDataThumb: imageDataThumb,
    imageDisplayUrl: display.imageDisplayUrl,
    imageSourceMode: display.imageSourceMode,
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
  "requestedChange", "changeRequestStatus", "changeRequestNote"
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
  createSheetIfMissing_(ss, USERS_SHEET, ["Username", "PasswordHash", "Role", "Region", "DisplayName", "Active"]);

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
    const seeded = DEFAULT_USERS.map(u => [u[0], hashPassword_(u[1]), u[2], u[3], u[4], true]);
    usersSheet.getRange(2, 1, seeded.length, 6).setValues(seeded);
  }

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
  const isLatestSchema = hasOrderId &&
    hasNoteColumn &&
    hasRequestedChange &&
    hasChangeRequestStatus &&
    hasChangeRequestNote &&
    sheet.getLastColumn() >= ORDERS_HEADERS.length;
  if (isLatestSchema) return;

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
        ""                             // changeRequestNote
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
      String(r[baseChangeIdx + 2] || "")                 // changeRequestNote
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

function sanitizeImageUrl_(value) {
  const s = String(value || "").trim();
  // Prevent oversized data URLs from ever flowing back into sheet writes.
  if (!s) return DEFAULT_IMAGE;
  if (/^data:/i.test(s)) return DEFAULT_IMAGE;
  if (s.length > 1800) return DEFAULT_IMAGE;
  return normalizeDriveImageUrl_(s);
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
  // Apps Script has no built-in image-resize service (there is no global
  // "ImagesService"), so server-side thumbnail generation is not possible.
  // The previous implementation referenced ImagesService and therefore always
  // threw a ReferenceError that was swallowed, returning "" on every call.
  // Returning "" directly preserves that behaviour while removing dead code;
  // image display still works via the Drive proxy / URL / placeholder chain.
  return "";
}

function buildRoundDisplayPayload_(imageUrl, imageDataThumb) {
  const url = sanitizeImageUrl_(imageUrl);
  const thumb = sanitizeThumbDataUrl_(imageDataThumb);
  const id = extractDriveFileId_(url);
  if (id) {
    const proxy = getImageProxy(id);
    if (proxy && proxy.ok && proxy.dataUrl) {
      return { imageDisplayUrl: proxy.dataUrl, imageSourceMode: "proxy" };
    }
  }
  if (url && url !== DEFAULT_IMAGE && !/^drivefile:/i.test(url)) {
    return { imageDisplayUrl: url, imageSourceMode: "url" };
  }
  if (thumb) {
    return { imageDisplayUrl: thumb, imageSourceMode: "thumb" };
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
function isProxyAllowedFileId_(id) {
  if (!id) return false;
  // (1) The round image stored in the sheet is always allowed. This also covers
  //     the case where uploads fell back to an owned folder other than the
  //     configured one.
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ROUND_SHEET);
    if (sheet && extractDriveFileId_(sheet.getRange(2, 4).getValue()) === id) return true;
  } catch (e) {}
  // (2) Any file inside the configured shirt or slip upload folders.
  try {
    const parents = DriveApp.getFileById(id).getParents();
    while (parents.hasNext()) {
      const pid = parents.next().getId();
      if (pid === DRIVE_FOLDER_ID || pid === SLIP_FOLDER_ID) return true;
    }
  } catch (e) {}
  return false;
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
    const dataUrl = "data:" + mime + ";base64," + Utilities.base64Encode(blob.getBytes());
    // Cache only if payload is safely below per-entry limit.
    if (dataUrl.length < 90000) {
      try { cache.put(cacheKey, dataUrl, 600); } catch (e) {}
    }
    return {
      ok: true,
      fileId: id,
      dataUrl: dataUrl,
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
  return values.map(r => ({
    no: Number(r[0]) || 0,
    orderId: String(r[1] || ("ORD-" + r[0])),
    region: String(r[2] || ""),
    size: String(r[3] || ""),
    qty: Number(r[4]) || 0,
    price: Number(r[5]) || 0,
    payDate: String(r[6] || ""),
    payTime: String(r[7] || ""),
    orderStatus: String(r[8] || ORDER_STATUS_ORDERED),
    status: String(r[8] || ORDER_STATUS_ORDERED),
    note: String(r[9] || ""),
    timestamp: r[10],
    slipName: String(r[11] || ""),
    slipUrl: String(r[12] || ""),
    createdBy: String(r[13] || ""),
    requestedChange: String(r[14] || ""),
    changeRequestStatus: String(r[15] || CHANGE_REQUEST_STATUS.NONE),
    changeRequestNote: String(r[16] || "")
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

function saveBase64File_(base64, prefix) {
  // w400 instead of w1200 — 9x smaller payload for browser
  const saved = saveBase64ToFolder_(base64, prefix, DRIVE_FOLDER_ID, "w400", false);
  if (saved && saved.fileId) {
    saved.url = buildDriveImageRef_(saved.fileId);
  }
  return saved;
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
