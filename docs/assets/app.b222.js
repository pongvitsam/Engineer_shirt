// ===== PEACE Engineer Club — front-end (RBAC + multi-size + speed) =====

// ── Boot error trap + watchdog (shows real errors on screen since the
//    GAS sandbox console is not readable) ─────────────────────────────
(function(){
  function showBoot(label, detail){
    var b=document.getElementById("app-container")||document.body;
    if(!b)return;
    var ph=document.getElementById("pre-header"); if(ph)ph.style.display="none";
    var ps=document.getElementById("pre-skeleton"); if(ps)ps.style.display="none";
    b.innerHTML='<pre style="white-space:pre-wrap;color:#fff;background:#7f1d1d;padding:12px;border-radius:8px;font-size:12px;margin:12px;border:1px solid rgba(255,255,255,.3)">'
      +label+': '+String(detail||"unknown").replace(/[<>&]/g,function(c){return c==="<"?"&lt;":c===">"?"&gt;":"&amp;";})
      +'<br><br><button onclick="try{renderLogin()}catch(e){location.reload()}" style="background:#fff;color:#7f1d1d;border:0;border-radius:6px;padding:8px 14px;font-weight:700;cursor:pointer">ไปหน้าเข้าสู่ระบบ</button></pre>';
  }
  window.addEventListener("error",function(ev){
    showBoot("BOOT ERROR",(ev.error&&ev.error.stack)||ev.message);
  });
  window.addEventListener("unhandledrejection",function(ev){
    showBoot("PROMISE ERROR",(ev.reason&&(ev.reason.stack||ev.reason.message))||ev.reason);
  });
  // Watchdog: if JS never booted, hydrate the static login shell or show error.
  window.__bootWatchdog=setTimeout(function(){
    if(window.__peaceBootStarted)return;
    if(document.getElementById("login-form")){
      try{
        if(typeof hydrateLoginScreen_==="function")hydrateLoginScreen_("โหลดนานผิดปกติ กรุณาเข้าสู่ระบบใหม่");
        else if(typeof renderLogin==="function")renderLogin("โหลดนานผิดปกติ กรุณาเข้าสู่ระบบใหม่");
      }catch(e){}
      return;
    }
    showBoot("โหลดนานผิดปกติ","ระบบไม่ตอบสนอง (อาจเชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ)");
  },8000);
})();

// ── State ────────────────────────────────────────────────────────────
let appData = null;
let appDataStale = true;
let prefetchPromise = null;
let ensureAppDataInFlight = null;
let roundImageUpgradeInFlight = null;
let me = null;
let authToken = null;
let guestMode = false;

let regionChart = null;
let giveawayChart = null;
let sizeChart = null;
let chartJsLoading = null;

let listFilterTimer = null;
let pendingImageBase64 = "";
const imageProxyCache = {};
const imageProxyCacheOrder = [];
const IMAGE_PROXY_CACHE_MAX = 20;
let activeDropdown = null;
const dropdownRegistry = {};

const FILTER_DEBOUNCE_MS = 200;
const BOOTSTRAP_SYNC_DEBOUNCE_MS = 50;
const REALTIME_POLL_MS = 20000;
const REALTIME_POLL_PAUSED_MODULES_ = { list: true, dashboard: true, report: true };
const NOTIFY_STORE_KEY = "peace_notif_v1";
const NOTIFY_READ_KEY = "peace_notif_read_v1";
const NOTIFY_MAX = 80;
let orderNotifySnapshot_ = null;
let notifyBaselineReady_ = false;
let notifyItems_ = [];
let notifyPanelOpen_ = false;
const notifyMuteUntil_ = {};
let loadUserListGen_ = 0;
const TOKEN_KEY = "peace_token_v1";
function persistAuthToken_(token){
  try{
    if(token){
      sessionStorage.setItem(TOKEN_KEY,token);
      try{localStorage.setItem(TOKEN_KEY,token);}catch(_){}
    }else{
      sessionStorage.removeItem(TOKEN_KEY);
      try{localStorage.removeItem(TOKEN_KEY);}catch(_){}
    }
  }catch(_){}
}
function readAuthToken_(){
  try{
    let t=sessionStorage.getItem(TOKEN_KEY);
    if(!t){t=localStorage.getItem(TOKEN_KEY);if(t)persistAuthToken_(t);}
    return t||null;
  }catch(_){return null;}
}
function clearAuthToken_(){
  persistAuthToken_(null);
}
const APP_BRAND_FULL = "สั่งซื้อเสื้อชมรมวิศวกร การไฟฟ้าส่วนภูมิภาค";
const APP_BRAND_LINE1 = "สั่งซื้อเสื้อชมรมวิศวกร";
const APP_BRAND_LINE2 = "การไฟฟ้าส่วนภูมิภาค";
const APP_BRAND_SHORT = "สั่งซื้อเสื้อชมรม กฟภ.";
const APP_PAGE_TITLE = "ระบบสั่งซื้อเสื้อชมรมวิศวกร การไฟฟ้าส่วนภูมิภาค";
const SHIRT_PLACEHOLDER_URL = "https://placehold.co/600x400/7F1D1D/FFFFFF?text=Engineer+Club+Shirt";
const DEFAULT_SUPPORT_CONTACT = "แจ้งปัญหาการใช้งาน โทร 02-009-6703";
let emailNotifyDraft_ = null;

function defaultEmailNotifyDraft_(){
  return {enabled:false,events:{orderSubmitted:true,paymentSlip:true,shipped:true},recipients:[]};
}
function normalizeEmailNotifyDraft_(cfg){
  const c=cfg||{};
  const events=c.events||{};
  return {
    enabled:!!c.enabled,
    events:{
      orderSubmitted:events.orderSubmitted!==false,
      paymentSlip:events.paymentSlip!==false,
      shipped:events.shipped!==false
    },
    recipients:Array.isArray(c.recipients)?c.recipients.slice():[]
  };
}
function isValidEmailNotifyInput_(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||"").trim());
}

function supportContactText_(){
  return String(appData&&appData.supportContact||DEFAULT_SUPPORT_CONTACT).trim()||DEFAULT_SUPPORT_CONTACT;
}
function formatSupportContactHtml_(text){
  const raw=String(text||"").trim();
  if(!raw)return "";
  return escHtml(raw).replace(/(\d{2}-\d{3,4}-\d{4,})/g,function(m){
    const digits=m.replace(/\D/g,"");
    const tel=digits.startsWith("0")?"+66"+digits.slice(1):"+66"+digits;
    return `<a href="tel:${tel}" style="color:#FDE68A;text-decoration:underline;font-weight:600">${escHtml(m)}</a>`;
  });
}
function supportContactInlineHtml_(){
  return formatSupportContactHtml_(supportContactText_());
}
function updateSupportFooter_(){
  const el=document.getElementById("app-support-footer");
  if(!el)return;
  const wrap=el.querySelector("div");
  if(wrap)wrap.innerHTML=formatSupportContactHtml_(supportContactText_());
}
function setSupportFooterVisible_(show){
  const el=document.getElementById("app-support-footer");
  if(el)el.classList.toggle("hidden",!show);
  if(show)updateSupportFooter_();
}

function syncAppBranding_(){
  try{ document.title = APP_PAGE_TITLE; }catch(_){}
  const pre=document.querySelector("#pre-header span");
  if(pre) pre.textContent = APP_BRAND_SHORT;
  const hdr=document.querySelector(".glass-header-title span");
  if(hdr){
    hdr.textContent = APP_BRAND_SHORT;
    const wrap = hdr.parentElement;
    if(wrap) wrap.title = APP_BRAND_FULL;
  }
}

const NAV = [
  { id:"stock", label:"สต็อก", icon:"fa-boxes" },
  { id:"orders", label:"สั่งซื้อเสื้อ", icon:"fa-plus-circle" },
  { id:"list", label:"รายการสั่งซื้อ", icon:"fa-list" },
  { id:"dashboard", label:"แดชบอร์ด", icon:"fa-chart-pie" },
  { id:"report", label:"รายงาน", icon:"fa-file-alt" },
  { id:"guide", label:"คู่มือ", icon:"fa-book", guestOk:true },
  { id:"admin", label:"แอดมิน", icon:"fa-cog", adminOnly:true }
];

// ── Server bridge (GAS iframe OR GitHub Pages → JSONP RPC) ────────────
const RPC_JSONP_MAX_PAYLOAD = 1800;
const RPC_JSONP_TIMEOUT_MS = 120000;
const RPC_POST_TIMEOUT_MS = 180000;
const RPC_POST_METHODS_ = { uploadOrderImage: true, uploadShirtImage: true, getBootstrapData: true };
/** GitHub Pages: JSONP ก่อน (POST ผ่าน redirect มักล้มในเบราว์เซอร์) แล้วค่อย POST */
const RPC_JSONP_FIRST_METHODS_ = {
  login: true,
  verifySession: true,
  getRpcPing: true,
  getGuestStockData: true
};
const UPLOAD_MAX_RAW_BYTES = 28 * 1024 * 1024;
const UPLOAD_TARGET_B64_MAX = 2800000;
const SLIP_IMAGE_MAX_EDGE = 2400;
const SLIP_IMAGE_JPEG_QUALITY = 0.85;
const SHIRT_IMAGE_MAX_EDGE = 3200;
const SHIRT_IMAGE_JPEG_QUALITY = 0.92;

function hasOpenModal_() {
  return !!document.querySelector(".login-overlay");
}
function showAppToast_(msg, type) {
  let host = document.getElementById("app-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "app-toast-host";
    host.className = "app-toast-host";
    host.setAttribute("role", "alert");
    document.body.appendChild(host);
  }
  const isWarn = type === "warning";
  const cls = type === "success" || isWarn ? "glass-msg-success" : "glass-msg-error";
  const text = isWarn ? "⚠️ " + msg : msg;
  host.innerHTML = "<div class=\"app-toast fade-in " + cls + "\">" + escHtml(text) + "</div>";
  host.style.display = "block";
  if (host._t) clearTimeout(host._t);
  host._t = setTimeout(function () {
    host.style.display = "none";
    host.innerHTML = "";
  }, type === "error" ? 9000 : 4500);
}
function notifyUser_(msg, type) {
  if (hasOpenModal_()) showAppToast_(msg, type);
}
function isGasScriptBridge_() {
  return typeof google !== "undefined" && google.script && google.script.run;
}
function getRpcApiUrl_() {
  return (window.PEACE_CONFIG && window.PEACE_CONFIG.apiUrl) || "";
}
function getGithubPagesUrl_() {
  return (window.PEACE_CONFIG && window.PEACE_CONFIG.githubPagesUrl) ||
    "https://pongvitsam.github.io/Engineer_shirt/";
}
function peacePagesBaseUrl_() {
  const cfg = window.PEACE_CONFIG || {};
  const base = cfg.githubPagesUrl || getGithubPagesUrl_();
  return base.endsWith("/") ? base : base + "/";
}
function getUserGuideHtmlUrl_() {
  const cfg = window.PEACE_CONFIG || {};
  if (cfg.userGuideHtml) return cfg.userGuideHtml;
  if (!isGasScriptBridge_() && typeof location !== "undefined") {
    try {
      return new URL("guides/user-guide-user.html", location.href).href;
    } catch (_) {}
  }
  return new URL("guides/user-guide-user.html", peacePagesBaseUrl_()).href;
}
function getUserGuidePdfUrl_() {
  const cfg = window.PEACE_CONFIG || {};
  if (cfg.userGuidePdf) return cfg.userGuidePdf;
  if (!isGasScriptBridge_() && typeof location !== "undefined") {
    try {
      return new URL("guides/user-guide.pdf", location.href).href;
    } catch (_) {}
  }
  return new URL("guides/user-guide.pdf", peacePagesBaseUrl_()).href;
}
function openUserGuideInNewTab_() {
  window.open(getUserGuideHtmlUrl_(), "_blank", "noopener");
}
function isGasAdminOnlyHost_() {
  return window.PEACE_GAS_ADMIN_ONLY === true;
}
function shouldUseRpcPost_(method, payloadLen) {
  if (RPC_POST_METHODS_[method]) return true;
  return payloadLen > RPC_JSONP_MAX_PAYLOAD;
}
function callServerRpcPost_(apiUrl, envelope, timeoutMs) {
  const ms = Math.max(30000, Number(timeoutMs) || RPC_POST_TIMEOUT_MS);
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  let tid = null;
  if (ac) {
    tid = setTimeout(function () { ac.abort(); }, ms);
  }
  return fetch(apiUrl, {
    method: "POST",
    mode: "cors",
    cache: "no-store",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(envelope),
    signal: ac ? ac.signal : undefined
  }).then(function (res) {
    return res.text().then(function (text) {
      if (!res.ok) {
        throw new Error("เชื่อมต่อ API ไม่สำเร็จ (HTTP " + res.status + ")");
      }
      var data;
      try { data = JSON.parse(text); } catch (e) {
        throw new Error("เซิร์ฟเวอร์ตอบรูปแบบไม่ถูกต้อง — ลองรีเฟรชหรือลองใหม่");
      }
      if (!data || !data.ok) {
        throw new Error((data && data.error) || "เกิดข้อผิดพลาด");
      }
      return data.result;
    });
  }).catch(function (err) {
    if (err && err.name === "AbortError") {
      throw new Error("อัปโหลดใช้เวลานานเกินไป — ลองย่อรูปหรือใช้ Wi-Fi ที่เสถียรกว่า");
    }
    if (err && err.message) throw err;
    throw new Error("เชื่อมต่อ API ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  }).finally(function () {
    if (tid) clearTimeout(tid);
  });
}
function rpcApiUnreachableMessage_() {
  const cfgBuild = (window.PEACE_CONFIG && window.PEACE_CONFIG.build) || "?";
  const api = getRpcApiUrl_();
  return "เชื่อมต่อ API ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ต ปิด AdBlock แล้วกด Ctrl+Shift+R (build " + cfgBuild + ")" +
    " · ถ้า build เก่ากว่าเวอร์ชันล่าสุด ให้รอ GitHub Pages อัปเดตหรือเปิดลิงก์แอปใหม่" +
    (api ? " · API: " + api : "");
}
function forcePeaceFullReload_(serverBuild){
  const build=String(serverBuild||"").trim();
  const u=new URL(location.href);
  const ra=(parseInt(u.searchParams.get("_ra")||"0",10)||0)+1;
  if(ra>6)return false;
  try{
    Object.keys(sessionStorage).forEach(function(k){
      if(/^peace_/.test(k))sessionStorage.removeItem(k);
    });
    try{localStorage.removeItem(TOKEN_KEY);}catch(_){}
  }catch(_){}
  if(typeof caches!=="undefined"&&caches.keys){
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){return caches.delete(k);}));
    }).catch(function(){});
  }
  u.search="";
  if(build)u.searchParams.set("_b",build);
  u.searchParams.set("_t",String(Date.now()));
  u.searchParams.set("_ra",String(ra));
  location.replace(u.toString());
  return true;
}
window.forcePeaceFullReload_=forcePeaceFullReload_;

function probeApiOnLogin_() {
  const msg = document.getElementById("login-msg");
  if (!getRpcApiUrl_() || isGasScriptBridge_()) return;
  if (msg && msg.dataset.peaceBuildWarn === "1") return;
  callServer("getRpcPing").then(function (r) {
    const serverBuild = r && r.build ? String(r.build) : "";
    const cfgBuild = (window.PEACE_CONFIG && window.PEACE_CONFIG.build) || "";
    const htmlEl = document.querySelector('meta[name="peace-build"]');
    const htmlBuild = htmlEl && htmlEl.content ? String(htmlEl.content) : "";
    if (!serverBuild) return;
    if (cfgBuild === serverBuild && (!htmlBuild || htmlBuild === serverBuild)) return;
    if (!msg) return;
    if (msg.dataset.peaceBuildWarn === "1") return;
    msg.dataset.peaceBuildWarn = "1";
    const shownBuild = cfgBuild || htmlBuild || "?";
    msg.innerHTML = "<span style=\"color:#FDE68A\">เบราว์เซอร์ใช้ build " + escHtml(shownBuild) +
      " แต่ API เป็น build " + escHtml(serverBuild) +
      " — </span><button type=\"button\" class=\"glass-btn-secondary text-xs\" style=\"padding:.35rem .65rem;margin-top:.35rem\" onclick=\"forcePeaceFullReload_(" +
      JSON.stringify(serverBuild) + ")\"><i class=\"fas fa-sync-alt mr-1\"></i>โหลดเวอร์ชันล่าสุด</button>";
  }).catch(function () {});
}
function callServerRpcJsonp_(apiUrl, envelope, attempt) {
  const tryNo = Number(attempt) || 1;
  return new Promise(function (resolve, reject) {
    const payload = JSON.stringify(envelope);
    if (payload.length > RPC_JSONP_MAX_PAYLOAD) {
      reject(new Error("ข้อมูลคำขอใหญ่เกินไป — ระบบจะส่งแบบ POST อัตโนมัติ กรุณาลองใหม่"));
      return;
    }
    const cb = "peaceRpc_" + Date.now() + "_" + Math.floor(Math.random() * 1e9);
    const sep = apiUrl.indexOf("?") >= 0 ? "&" : "?";
    const bust = tryNo > 1 ? "&_t=" + Date.now() : "";
    const url = apiUrl + sep + "rpc=1&callback=" + encodeURIComponent(cb) +
      "&payload=" + encodeURIComponent(payload) + bust;
    let script = null;
    let timeoutId = null;
    function cleanup() {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = null;
      try { delete window[cb]; } catch (_) {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
      script = null;
    }
    timeoutId = setTimeout(function () {
      cleanup();
      reject(new Error("เซิร์ฟเวอร์ตอบช้าเกินไป กรุณาลองใหม่"));
    }, RPC_JSONP_TIMEOUT_MS);
    window[cb] = function (data) {
      cleanup();
      if (!data || !data.ok) {
        reject(new Error((data && data.error) || "เกิดข้อผิดพลาด"));
        return;
      }
      resolve(data.result);
    };
    script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onerror = function () {
      cleanup();
      if (tryNo < 3) {
        callServerRpcJsonp_(apiUrl, envelope, tryNo + 1).then(resolve).catch(reject);
        return;
      }
      reject(new Error(rpcApiUnreachableMessage_()));
    };
    script.crossOrigin = "anonymous";
    (document.body || document.head).appendChild(script);
  });
}
function callServer(method) {
  const args = Array.prototype.slice.call(arguments, 1);
  if (isGasScriptBridge_()) {
    return new Promise((resolve, reject) => {
      google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[method].apply(null, args);
    });
  }
  const apiUrl = getRpcApiUrl_();
  if (!apiUrl) return Promise.reject(new Error("ไม่พบ API URL — ตรวจสอบ config.js"));
  const envelope = { method: method, args: args };
  if (isGasAdminOnlyHost_()) envelope.gasAdminOnly = true;
  const payloadLen = JSON.stringify(envelope).length;
  const postMs = RPC_POST_METHODS_[method] ? RPC_POST_TIMEOUT_MS : RPC_JSONP_TIMEOUT_MS;
  const jsonpFirst = !isGasScriptBridge_() &&
    RPC_JSONP_FIRST_METHODS_[method] &&
    payloadLen <= RPC_JSONP_MAX_PAYLOAD &&
    !shouldUseRpcPost_(method, payloadLen);
  if (jsonpFirst) {
    return callServerRpcJsonp_(apiUrl, envelope).catch(function () {
      return callServerRpcPost_(apiUrl, envelope, postMs);
    });
  }
  if (shouldUseRpcPost_(method, payloadLen)) {
    return callServerRpcPost_(apiUrl, envelope, postMs);
  }
  return callServerRpcJsonp_(apiUrl, envelope);
}

function callAuthed(method) {
  const args = Array.prototype.slice.call(arguments, 1);
  return callServer.apply(null, [method, authToken].concat(args));
}

function callAuthedWithTimeout(ms, method) {
  const args = Array.prototype.slice.call(arguments, 2);
  const call = callAuthed.apply(null, [method].concat(args));
  const limit = Math.max(5000, Number(ms) || 90000);
  return Promise.race([
    call,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("เซิร์ฟเวอร์ตอบช้าเกินไป กรุณาลองใหม่")), limit);
    })
  ]);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function compressDataUrlForUpload_(dataUrl, maxEdge, quality, targetMaxLen) {
  const cap = targetMaxLen || UPLOAD_TARGET_B64_MAX;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function () {
      let w = img.width;
      let h = img.height;
      const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      let q = quality;
      let out = canvas.toDataURL("image/jpeg", q);
      while (out.length > cap && q > 0.38) {
        q -= 0.06;
        out = canvas.toDataURL("image/jpeg", q);
      }
      resolve(out);
    };
    img.onerror = () => reject(new Error("อ่านรูปไม่สำเร็จ — ลองบันทึกเป็น JPG/PNG แล้วอัปโหลดใหม่"));
    img.src = dataUrl;
  });
}

function formatUploadSize_(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

async function compressShirtThumbForSheet_(dataUrl) {
  try {
    return await compressDataUrlForUpload_(dataUrl, 480, 0.8, 28000);
  } catch (_) {
    return "";
  }
}

async function prepareShirtImageBase64ForUpload_(file, onProgress) {
  if (!file) throw new Error("ไม่พบไฟล์รูป");
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP ฯลฯ)");
  }
  if (file.size > UPLOAD_MAX_RAW_BYTES) {
    throw new Error("ไฟล์ใหญ่เกินไป (สูงสุด ~28 MB)");
  }
  if (onProgress) onProgress("กำลังอ่านไฟล์ " + formatUploadSize_(file.size) + "…");
  const dataUrl = await fileToBase64(file);
  if (onProgress) onProgress("กำลังเตรียมรูปเสื้อความละเอียดสูง…");
  let out = await compressDataUrlForUpload_(dataUrl, SHIRT_IMAGE_MAX_EDGE, SHIRT_IMAGE_JPEG_QUALITY);
  if (out.length > UPLOAD_TARGET_B64_MAX) {
    out = await compressDataUrlForUpload_(dataUrl, 2600, 0.88);
  }
  if (out.length > UPLOAD_TARGET_B64_MAX) {
    out = await compressDataUrlForUpload_(dataUrl, 2200, 0.85);
  }
  if (out.length > UPLOAD_TARGET_B64_MAX) {
    out = await compressDataUrlForUpload_(dataUrl, 1800, 0.8);
  }
  return out;
}

async function prepareImageBase64ForUpload_(file, onProgress) {
  if (!file) throw new Error("ไม่พบไฟล์รูป");
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP ฯลฯ)");
  }
  if (file.size > UPLOAD_MAX_RAW_BYTES) {
    throw new Error("ไฟล์ใหญ่เกินไป (สูงสุด ~28 MB) — ระบบจะย่อให้อัตโนมัติ แต่ไฟล์นี้ใหญ่เกินไป");
  }
  if (onProgress) onProgress("กำลังอ่านไฟล์ " + formatUploadSize_(file.size) + "…");
  const dataUrl = await fileToBase64(file);
  if (onProgress) onProgress("กำลังย่อรูปเพื่ออัปโหลด…");
  let out = await compressDataUrlForUpload_(dataUrl, SLIP_IMAGE_MAX_EDGE, SLIP_IMAGE_JPEG_QUALITY);
  if (out.length > UPLOAD_TARGET_B64_MAX) {
    out = await compressDataUrlForUpload_(dataUrl, 1800, 0.78);
  }
  if (out.length > UPLOAD_TARGET_B64_MAX) {
    out = await compressDataUrlForUpload_(dataUrl, 1400, 0.62);
  }
  if (out.length > UPLOAD_TARGET_B64_MAX) {
    out = await compressDataUrlForUpload_(dataUrl, 1100, 0.5);
  }
  if (out.length > UPLOAD_TARGET_B64_MAX) {
    throw new Error("รูปใหญ่เกินไปแม้ย่อแล้ว — crop ให้เหลือเฉพาะสลิปแล้วลองใหม่");
  }
  if (onProgress) {
    onProgress("ย่อแล้วเหลือประมาณ " + formatUploadSize_(Math.round(out.length * 0.75)) + " — กำลังส่ง…");
  }
  return out;
}

function invalidateClientCache() { appDataStale = true; }

function applyLocalOrderSlipUpdate_(orderId, result) {
  if (!appData || !result || !orderId) return;
  (appData.orders || []).forEach(function (o) {
    if (String(o.orderId) !== String(orderId)) return;
    if (result.payDate != null) o.payDate = result.payDate;
    if (result.payTime != null) o.payTime = result.payTime;
    if (result.slipUrl != null) o.slipUrl = result.slipUrl;
    if (result.slipName != null) o.slipName = result.slipName;
    if (result.paymentStatus != null) o.paymentStatus = result.paymentStatus;
  });
}

function applyLocalOrderDelete_(orderId) {
  if (!appData || !orderId) return;
  appData.orders = (appData.orders || []).filter(function (o) {
    return String(o.orderId) !== String(orderId);
  });
}

function applyLocalOrderPaymentStatus_(orderId, paymentStatus) {
  if (!appData || !orderId) return;
  (appData.orders || []).forEach(function (o) {
    if (String(o.orderId) === String(orderId)) o.paymentStatus = paymentStatus;
  });
}

function applyLocalOrderNoteUpdate_(orderId, note) {
  if (!appData || !orderId) return;
  const safe = String(note == null ? "" : note).trim();
  (appData.orders || []).forEach(function (o) {
    if (String(o.orderId) === String(orderId)) o.note = safe;
  });
}

function applyLocalOrderContactUpdate_(orderId, contactPhone) {
  if (!appData || !orderId) return;
  const safe = normalizeContactPhoneInput_(contactPhone);
  (appData.orders || []).forEach(function (o) {
    if (String(o.orderId) === String(orderId)) o.contactPhone = safe;
  });
}

function applyLocalOrderStatusUpdate_(orderId, status) {
  if (!appData || !orderId) return;
  const st = String(status || "");
  (appData.orders || []).forEach(function (o) {
    if (String(o.orderId) === String(orderId)) {
      o.status = st;
      o.orderStatus = st;
    }
  });
}

function applyLocalOrderPickupUpdate_(orderId, result) {
  if (!appData || !result || !orderId) return;
  (appData.orders || []).forEach(function (o) {
    if (String(o.orderId) !== String(orderId)) return;
    if (result.pickupDate != null) o.pickupDate = result.pickupDate;
    if (result.pickupTime != null) o.pickupTime = result.pickupTime;
    if (result.pickupNote != null) o.pickupNote = result.pickupNote;
    if (result.status != null) {
      o.status = result.status;
      o.orderStatus = result.status;
    }
  });
}

function snapshotOrderGroup_(orderId) {
  return (appData && appData.orders ? appData.orders : [])
    .filter(function (o) { return String(o.orderId) === String(orderId); })
    .map(function (o) { return Object.assign({}, o); });
}

function restoreOrderGroupSnapshot_(orderId, snap) {
  if (!appData || !snap || !snap.length) return;
  appData.orders = (appData.orders || [])
    .filter(function (o) { return String(o.orderId) !== String(orderId); })
    .concat(snap.map(function (o) { return Object.assign({}, o); }));
}

function getOrderGroupPaymentStatus_(orderId) {
  const o = (appData && appData.orders ? appData.orders : []).find(function (x) {
    return String(x.orderId) === String(orderId);
  });
  return o ? String(o.paymentStatus || "") : "";
}

function applyLocalMutationRefresh_() {
  recalcStockFromOrders();
  const mod=(typeof app!=="undefined"&&app)?app.currentModule:"";
  if(isRealtimePollPausedForModule_(mod))return;
  if (typeof app !== "undefined" && app && typeof app.refreshCurrentView_ === "function") {
    Promise.resolve(app.refreshCurrentView_({ keepLocal: true })).catch(function () {});
  }
}

function removeOrderListGroupRow_(orderId){
  if(!orderId)return;
  const tbody=document.getElementById("order-tbody");
  if(!tbody)return;
  const oid=String(orderId);
  const rows=tbody.querySelectorAll("tr[data-order-id]");
  for(let i=0;i<rows.length;i++){
    if(rows[i].getAttribute("data-order-id")===oid){
      rows[i].remove();
      break;
    }
  }
  updateOrderListSummary_();
  if(typeof app!=="undefined"&&app&&typeof app.applyListFilter==="function")app.applyListFilter();
}

function refreshOrderListGroupRow_(orderId){
  if(!orderId||typeof app==="undefined"||!app||typeof app.orderGroupRowHtml!=="function")return;
  const tbody=document.getElementById("order-tbody");
  if(!tbody)return;
  const oid=String(orderId);
  const g=groupOrdersByOrderId(appData?.orders||[]).find(function(x){return String(x.orderId)===oid;});
  if(!g)return;
  const rows=tbody.querySelectorAll("tr[data-order-id]");
  for(let i=0;i<rows.length;i++){
    if(rows[i].getAttribute("data-order-id")!==oid)continue;
    const prevDisplay=rows[i].style.display;
    let rowHtml;
    try{rowHtml=app.orderGroupRowHtml(g);}catch(_){return;}
    const temp=document.createElement("tbody");
    temp.innerHTML=rowHtml;
    const newTr=temp.firstElementChild;
    if(!newTr)return;
    if(prevDisplay)newTr.style.display=prevDisplay;
    rows[i].replaceWith(newTr);
    return;
  }
}

function runBackgroundBootstrapSyncForListMutation_(){
  if(bootstrapSyncInFlight)return Promise.resolve();
  bootstrapSyncInFlight=true;
  return ensureAppData(true,{skipImageResolve:true}).then(function(){
    appDataStale=false;
  }).catch(function(){
    appDataStale=true;
  }).finally(function(){
    bootstrapSyncInFlight=false;
  });
}

function refreshAfterOrderListMutation_(orderId,opts){
  opts=opts||{};
  if(opts.recalcStock!==false)recalcStockFromOrders();
  const mod=(typeof app!=="undefined"&&app)?app.currentModule:"";
  const tbody=document.getElementById("order-tbody");
  if(mod==="list"&&tbody&&typeof app!=="undefined"&&app){
    if(opts.removed&&orderId){
      removeOrderListGroupRow_(orderId);
    }else if(opts.removed||!orderId){
      if(typeof app.fillOrderListBody==="function")app.fillOrderListBody();
      if(typeof app.applyListFilter==="function")app.applyListFilter();
    }else{
      refreshOrderListGroupRow_(orderId);
    }
    if(opts.syncServer&&orderId&&!opts.removed){
      runBackgroundBootstrapSyncForListMutation_().then(function(){
        refreshOrderListGroupRow_(orderId);
      });
    }
    return;
  }
  refreshAfterMutation_(opts);
}

let bootstrapSyncTimer = null;
let bootstrapSyncInFlight = false;
let realtimePollTimer = null;

function runBackgroundBootstrapSync_() {
  if (bootstrapSyncInFlight) return Promise.resolve();
  const pausedMod=(typeof app!=="undefined"&&app)?app.currentModule:"";
  const skipView=isRealtimePollPausedForModule_(pausedMod);
  bootstrapSyncInFlight = true;
  return ensureAppData(true, { skipImageResolve: true }).then(function () {
    appDataStale = false;
    if (skipView) return;
    if (typeof app !== "undefined" && app && typeof app.refreshCurrentView_ === "function") {
      return app.refreshCurrentView_({ keepLocal: true });
    }
  }).catch(function () {
    appDataStale = true;
    if (typeof app !== "undefined" && app && typeof app.showMsg === "function") {
      app.showMsg("ซิงค์ข้อมูลพื้นหลังไม่สำเร็จ — กรุณารีเฟรชหน้า", "warning");
    }
  }).finally(function () {
    bootstrapSyncInFlight = false;
  });
}

function scheduleBackgroundBootstrapSync_() {
  appDataStale = true;
  if (bootstrapSyncTimer) clearTimeout(bootstrapSyncTimer);
  const mod=(typeof app!=="undefined"&&app)?app.currentModule:"";
  if(isRealtimePollPausedForModule_(mod))return;
  bootstrapSyncTimer = setTimeout(function () {
    bootstrapSyncTimer = null;
    runBackgroundBootstrapSync_();
  }, BOOTSTRAP_SYNC_DEBOUNCE_MS);
}

function isRealtimePollPausedForModule_(module){
  return !!(module&&REALTIME_POLL_PAUSED_MODULES_[module]);
}

function updateRealtimePollForModule_(module){
  if(isRealtimePollPausedForModule_(module)){
    stopRealtimePoll_();
    if(bootstrapSyncTimer){clearTimeout(bootstrapSyncTimer);bootstrapSyncTimer=null;}
  }else{
    if(authToken&&!guestMode)startRealtimePoll_();
    if(appDataStale)scheduleBackgroundBootstrapSync_();
  }
}

function startRealtimePoll_() {
  stopRealtimePoll_();
  realtimePollTimer = setInterval(function () {
    if (document.hidden || guestMode || !authToken) return;
    if (bootstrapSyncInFlight || bootstrapSyncTimer) return;
    const mod=(typeof app!=="undefined"&&app)?app.currentModule:"";
    if(isRealtimePollPausedForModule_(mod))return;
    runBackgroundBootstrapSync_();
  }, REALTIME_POLL_MS);
}

function stopRealtimePoll_() {
  if (realtimePollTimer) {
    clearInterval(realtimePollTimer);
    realtimePollTimer = null;
  }
}

async function refreshAfterMutation_(opts) {
  opts = opts || {};
  if (opts.keepLocal && appData) {
    applyLocalMutationRefresh_();
    scheduleBackgroundBootstrapSync_();
    return;
  }
  invalidateClientCache();
  try {
    await ensureAppData(true);
  } catch (e) {
    if (!(await verifySessionAlive_())) throw e;
  }
  if (typeof app !== "undefined" && app && app.refreshCurrentView_) {
    await app.refreshCurrentView_(opts);
  }
}

const TH_MONTHS_FULL=["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const TH_DAYS_FULL=["วันอาทิตย์","วันจันทร์","วันอังคาร","วันพุธ","วันพฤหัสบดี","วันศุกร์","วันเสาร์"];

function parseIsoDateParts_(s){
  const m=String(s||"").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m)return null;
  return{y:+m[1],m:+m[2],d:+m[3]};
}
function daysInMonthCe_(y,m){return new Date(y,m,0).getDate()}
function buildIsoDateFromParts_(y,m,d){return y+"-"+pad2(m)+"-"+pad2(d)}
function parseTimeParts_(t){
  const m=String(t||"").trim().match(/^(\d{1,2}):(\d{2})/);
  return m?{h:+m[1],min:+m[2]}:{h:0,min:0};
}
function formatThaiDateLong(isoDate){
  const p=parseIsoDateParts_(isoDate);
  if(!p||p.y<1900)return "—";
  const dt=new Date(p.y,p.m-1,p.d);
  if(isNaN(dt.getTime()))return "—";
  return TH_DAYS_FULL[dt.getDay()]+"ที่ "+p.d+" "+TH_MONTHS_FULL[p.m-1]+" "+(p.y+543);
}
function slipDtDayOptions_(y,m,selDay){
  const max=daysInMonthCe_(y,m);
  let h="";
  for(let d=1;d<=max;d++)h+=`<option value="${d}"${d===selDay?" selected":""}>${d}</option>`;
  return h;
}
function slipDtMonthOptions_(selMonth){
  let h="";
  for(let i=0;i<12;i++)h+=`<option value="${i+1}"${i+1===selMonth?" selected":""}>${TH_MONTHS_FULL[i]}</option>`;
  return h;
}
function slipDtYearOptions_(selYear){
  const now=new Date().getFullYear();
  let yMin=now-1,yMax=now+1;
  if(selYear<yMin)yMin=selYear;
  if(selYear>yMax)yMax=selYear;
  let h="";
  for(let y=yMin;y<=yMax;y++)h+=`<option value="${y}"${y===selYear?" selected":""}>${y+543}</option>`;
  return h;
}
function slipDtHourOptions_(selHour){
  let h="";
  for(let i=0;i<24;i++)h+=`<option value="${pad2(i)}"${i===selHour?" selected":""}>${pad2(i)}</option>`;
  return h;
}
function slipDtMinuteOptions_(selMinute){
  let h="";
  for(let i=0;i<60;i++)h+=`<option value="${pad2(i)}"${i===selMinute?" selected":""}>${pad2(i)}</option>`;
  return h;
}

function buildDateTimePickerFieldsHtml_(safeOid, initDate, initTime, opts) {
  opts = opts || {};
  const prefix = opts.prefix || "slip";
  const icon = opts.icon || "fa-receipt";
  const labelDate = opts.labelDate || "เลือกวันที่โอน *";
  const labelTime = opts.labelTime || "เลือกเวลาโอน *";
  const iso = initDate || todayStr();
  const tp = parseTimeParts_(initTime || nowTimeStr());
  const dp = parseIsoDateParts_(iso) || parseIsoDateParts_(todayStr());
  const y = dp.y, m = dp.m, d = Math.min(dp.d, daysInMonthCe_(dp.y, dp.m));
  const isoVal = buildIsoDateFromParts_(y, m, d);
  const timeVal = pad2(tp.h) + ":" + pad2(tp.min);
  const heroDate = formatThaiDateLong(isoVal);
  const heroTime = timeVal + " น.";
  return `<div class="glass-datetime-panel">
    <div class="glass-datetime-hero">
      <div class="glass-datetime-hero-icon"><i class="fas ${icon}"></i></div>
      <div id="${prefix}-dt-preview-date-${safeOid}" class="glass-datetime-hero-date">${escHtml(heroDate)}</div>
      <div id="${prefix}-dt-preview-time-${safeOid}" class="glass-datetime-hero-time">${escHtml(heroTime)}</div>
    </div>
    <div class="glass-datetime-section">
      <div class="glass-datetime-label"><i class="fas fa-calendar-day"></i> ${labelDate}</div>
      <div class="glass-datetime-selects">
        <div class="glass-datetime-select-wrap">
          <span class="glass-datetime-select-hint">วัน</span>
          <select id="${prefix}-dt-day-${safeOid}" class="glass-select glass-datetime-select" aria-label="วัน">${slipDtDayOptions_(y, m, d)}</select>
        </div>
        <div class="glass-datetime-select-wrap glass-datetime-select-month">
          <span class="glass-datetime-select-hint">เดือน</span>
          <select id="${prefix}-dt-month-${safeOid}" class="glass-select glass-datetime-select" aria-label="เดือน">${slipDtMonthOptions_(m)}</select>
        </div>
        <div class="glass-datetime-select-wrap">
          <span class="glass-datetime-select-hint">ปี พ.ศ.</span>
          <select id="${prefix}-dt-year-${safeOid}" class="glass-select glass-datetime-select" aria-label="ปี พ.ศ.">${slipDtYearOptions_(y)}</select>
        </div>
      </div>
    </div>
    <div class="glass-datetime-section">
      <div class="glass-datetime-label"><i class="fas fa-clock"></i> ${labelTime}</div>
      <div class="glass-datetime-selects glass-datetime-time-selects">
        <div class="glass-datetime-select-wrap">
          <span class="glass-datetime-select-hint">ชั่วโมง</span>
          <select id="${prefix}-dt-hour-${safeOid}" class="glass-select glass-datetime-select" aria-label="ชั่วโมง">${slipDtHourOptions_(tp.h)}</select>
        </div>
        <span class="glass-datetime-colon" aria-hidden="true">:</span>
        <div class="glass-datetime-select-wrap">
          <span class="glass-datetime-select-hint">นาที</span>
          <select id="${prefix}-dt-minute-${safeOid}" class="glass-select glass-datetime-select" aria-label="นาที">${slipDtMinuteOptions_(tp.min)}</select>
        </div>
      </div>
    </div>
    <input type="hidden" id="${prefix}-pay-date-${safeOid}" value="${escAttr(isoVal)}">
    <input type="hidden" id="${prefix}-pay-time-${safeOid}" value="${escAttr(timeVal)}">
  </div>`;
}

function buildSlipDateTimeFieldsHtml_(safeOid, initDate, initTime) {
  return buildDateTimePickerFieldsHtml_(safeOid, initDate, initTime, {
    prefix: "slip",
    icon: "fa-receipt",
    labelDate: "เลือกวันที่โอน *",
    labelTime: "เลือกเวลาโอน *"
  });
}

function buildPickupDateTimeFieldsHtml_(safeOid, initDate, initTime) {
  return buildDateTimePickerFieldsHtml_(safeOid, initDate, initTime, {
    prefix: "pickup",
    icon: "fa-truck",
    labelDate: "วันที่เข้ามารับ/จัดส่ง (ไม่บังคับ)",
    labelTime: "เวลารับ/จัดส่ง (ไม่บังคับ)"
  });
}

function buildPayReviewDateTimeFieldsHtml_(safeOid, initDate, initTime) {
  return buildDateTimePickerFieldsHtml_(safeOid, initDate, initTime, {
    prefix: "payrev",
    icon: "fa-receipt",
    labelDate: "วันที่โอน *",
    labelTime: "เวลาโอน *"
  });
}

function updatePaymentReviewPayDateView_(safeOid, payDate, payTime) {
  const el = document.getElementById("payrev-dt-view-text-" + safeOid);
  if (el) el.innerHTML = formatThaiDateTimeCell(payDate, payTime);
}

function bindDateTimePicker_(safeOid, prefix) {
  prefix = prefix || "slip";
  const dayEl = document.getElementById(prefix + "-dt-day-" + safeOid);
  const monthEl = document.getElementById(prefix + "-dt-month-" + safeOid);
  const yearEl = document.getElementById(prefix + "-dt-year-" + safeOid);
  const hourEl = document.getElementById(prefix + "-dt-hour-" + safeOid);
  const minEl = document.getElementById(prefix + "-dt-minute-" + safeOid);
  const hidDate = document.getElementById(prefix + "-pay-date-" + safeOid);
  const hidTime = document.getElementById(prefix + "-pay-time-" + safeOid);
  const prevDate = document.getElementById(prefix + "-dt-preview-date-" + safeOid);
  const prevTime = document.getElementById(prefix + "-dt-preview-time-" + safeOid);
  if (!dayEl || !monthEl || !yearEl) return;
  function rebuildDays() {
    const y = +yearEl.value, m = +monthEl.value;
    let sel = +dayEl.value;
    const max = daysInMonthCe_(y, m);
    if (sel > max) sel = max;
    const cur = dayEl.value;
    dayEl.innerHTML = slipDtDayOptions_(y, m, sel);
    if (cur && +cur <= max) dayEl.value = cur;
  }
  function sync() {
    rebuildDays();
    const y = +yearEl.value, m = +monthEl.value, d = +dayEl.value;
    const iso = buildIsoDateFromParts_(y, m, d);
    const h = hourEl ? hourEl.value : "00";
    const mi = minEl ? minEl.value : "00";
    const time = h + ":" + mi;
    if (hidDate) hidDate.value = iso;
    if (hidTime) hidTime.value = time;
    if (prevDate) prevDate.textContent = formatThaiDateLong(iso);
    if (prevTime) prevTime.textContent = time + " น.";
  }
  [dayEl, monthEl, yearEl, hourEl, minEl].forEach(function (el) {
    if (el) el.addEventListener("change", sync);
  });
  sync();
}

function bindSlipDateTimePicker_(safeOid) {
  bindDateTimePicker_(safeOid, "slip");
}

function bindPickupDateTimePicker_(safeOid) {
  bindDateTimePicker_(safeOid, "pickup");
}

function getPickupDateTimeFieldValues_(safeOid){
  const modal=document.getElementById("pickup-modal");
  const root=modal||document;
  const dateEl=root.querySelector("#pickup-pay-date-"+safeOid);
  const timeEl=root.querySelector("#pickup-pay-time-"+safeOid);
  return {
    date:String(dateEl&&dateEl.value||"").trim(),
    time:String(timeEl&&timeEl.value||"").trim()
  };
}

const slipPreviewUrls_ = {};
function revokeSlipPreviewUrl_(key){
  if(slipPreviewUrls_[key]){
    URL.revokeObjectURL(slipPreviewUrls_[key]);
    delete slipPreviewUrls_[key];
  }
}
function bindSlipFilePreview_(fileInputId,previewWrapId,onFileChange){
  const input=document.getElementById(fileInputId);
  const wrap=document.getElementById(previewWrapId);
  if(!input||!wrap)return;
  const key=previewWrapId;
  const handler=function(){
    revokeSlipPreviewUrl_(key);
    const file=input.files&&input.files[0];
    if(!file||!String(file.type||"").startsWith("image/")){
      wrap.style.display="none";
      wrap.innerHTML="";
      if(onFileChange)onFileChange(false);
      return;
    }
    const url=URL.createObjectURL(file);
    slipPreviewUrls_[key]=url;
    wrap.innerHTML=`<div class="slip-upload-preview glass-image-wrap p-2">
      <img src="${escAttr(url)}" alt="ตัวอย่างสลิป" class="slip-preview-img cursor-zoom-in" onclick="app.openImageLightbox(this.src)">
      <p class="text-xs text-glass-dim text-center mt-2 mb-0"><i class="fas fa-search-plus mr-1"></i>ดูวันที่/เวลาบนสลิปแล้วกรอกด้านล่าง · แตะรูปเพื่อขยาย</p>
    </div>`;
    wrap.style.display="block";
    if(onFileChange)onFileChange(true);
  };
  input.addEventListener("change",handler);
  handler();
}

function syncWindowSession_() {
  try {
    window.me = me;
    window.authToken = authToken;
    window.app = app;
    window.normalizeMeClient_ = normalizeMeClient_;
  } catch (_) {}
}

function sleepMs(ms) { return new Promise(r => setTimeout(r, ms)); }

function isSessionReloginMessage(msg) {
  return /เข้าสู่ระบบใหม่/.test(String(msg || ""));
}

async function verifySessionAlive_() {
  if (guestMode) return true;
  if (!authToken) return false;
  try {
    const r = await callServer("verifySession", authToken);
    return !!(r && r.ok);
  } catch (_) {
    return false;
  }
}

async function fetchBootstrapAuthed_(attempts) {
  const tries = Math.max(1, attempts || 3);
  let last = null;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleepMs(450 * i);
    last = await callAuthed("getBootstrapData");
    if (last) return last;
  }
  return null;
}

// ── Saving / loading indicators ──────────────────────────────────────
// Floating glassmorphism "กำลังบันทึก…" toast (ref-counted so overlapping
// async actions don't hide each other early) + per-button spinner + a
// double-submit guard. Purely additive UI; never touches RBAC/me logic.
let busyCount = 0;
function showBusy(text){
  busyCount++;
  let el=document.getElementById("global-busy");
  if(!el){
    el=document.createElement("div");
    el.id="global-busy";
    el.className="glass-busy";
    el.setAttribute("role","status");
    el.setAttribute("aria-live","polite");
    el.innerHTML='<span class="glass-busy-spinner" aria-hidden="true"></span><span class="glass-busy-text"></span>';
    document.body.appendChild(el);
  }
  const t=el.querySelector(".glass-busy-text");
  if(t)t.textContent=text||"กำลังบันทึก…";
  // force reflow so the entrance transition runs even on rapid re-show
  void el.offsetWidth;
  el.classList.add("show");
  return el;
}
function hideBusy(force){
  busyCount=force?0:Math.max(0,busyCount-1);
  if(busyCount>0)return;
  const el=document.getElementById("global-busy");
  if(el)el.classList.remove("show");
}
function setBtnLoading(btn,loading,text){
  if(!btn||typeof btn!=="object")return;
  if(loading){
    if(btn.dataset.busy==="1")return;
    btn.dataset.busy="1";
    btn.dataset.origHtml=btn.innerHTML;
    if(btn.disabled)btn.dataset.wasDisabled="1";
    btn.disabled=true;
    btn.classList.add("is-loading");
    btn.setAttribute("aria-busy","true");
    const label=(text===undefined||text===null)?"กำลังบันทึก…":text;
    btn.innerHTML='<span class="btn-spinner" aria-hidden="true"></span>'+(label?('<span>'+escHtml(label)+'</span>'):'');
  }else{
    if(btn.dataset.busy!=="1")return;
    btn.classList.remove("is-loading");
    btn.removeAttribute("aria-busy");
    if(btn.dataset.origHtml!==undefined)btn.innerHTML=btn.dataset.origHtml;
    btn.disabled=btn.dataset.wasDisabled==="1";
    delete btn.dataset.busy;
    delete btn.dataset.origHtml;
    delete btn.dataset.wasDisabled;
  }
}
// Wrap an async backend action with: double-submit guard, button spinner,
// and the floating busy toast. Returns the action's resolved value (or
// undefined when a duplicate submit is blocked). Errors propagate so the
// caller's existing catch/showMsg behaviour stays intact.
async function runSaving(opts, fn){
  opts=opts||{};
  const btn=(opts.btn&&typeof opts.btn==="object")?opts.btn:null;
  if(btn&&btn.dataset.busy==="1")return;
  const busyText=opts.busyText||"กำลังบันทึก…";
  const showToast=opts.toast!==false;
  setBtnLoading(btn,true,(opts.btnText!==undefined)?opts.btnText:busyText);
  if(showToast)showBusy(busyText);
  try{
    return await fn();
  }finally{
    if(showToast)hideBusy();
    setBtnLoading(btn,false);
  }
}

function ensureAppData(force, opts) {
  opts = opts || {};
  if (!force && appData && !appDataStale) return Promise.resolve(appData);
  if (ensureAppDataInFlight) return ensureAppDataInFlight;
  ensureAppDataInFlight = ensureAppDataCore_(force, opts).finally(function () {
    ensureAppDataInFlight = null;
  });
  return ensureAppDataInFlight;
}

function applyRoundDisplayFast_(round, data, opts) {
  const imageRef = String(round.imageUrl || "").trim();
  round.imageRef = imageRef;
  round.imageDataThumb = String(round.imageDataThumb || "");
  let displayUrl = "";
  let sourceMode = "";
  let warning = "";
  if (opts.skipImageResolve && appData && appData.round) {
    round.imageDisplayUrl = appData.round.imageDisplayUrl || SHIRT_PLACEHOLDER_URL;
    round.imageDisplaySrc = appData.round.imageDisplaySrc || round.imageDisplayUrl;
    round.imageSourceMode = appData.round.imageSourceMode || "cached";
    round.imageWarning = appData.round.imageWarning || "";
    round.imageDebug = appData.round.imageDebug || "";
    return;
  }
  if (round.imageDisplayUrl && !isPlaceholderImage(round.imageDisplayUrl) && round.imageSourceMode !== "thumb") {
    displayUrl = String(round.imageDisplayUrl);
    sourceMode = String(round.imageSourceMode || "proxy");
  }
  if (!displayUrl && round.imageDataThumb && isDataUrl(round.imageDataThumb)) {
    displayUrl = round.imageDataThumb;
    sourceMode = "thumb";
  }
  if (!displayUrl && isValidRoundUrl(imageRef)) {
    displayUrl = imageRef;
    sourceMode = "url";
  } else if (!displayUrl) {
    displayUrl = SHIRT_PLACEHOLDER_URL;
    sourceMode = "placeholder";
  }
  round.imageDisplayUrl = displayUrl;
  round.imageSourceMode = sourceMode;
  round.imageWarning = warning;
  round.imageDebug = "mode=" + sourceMode + (warning ? (" | " + warning) : "");
  round.imageDisplaySrc = withCacheBust(displayUrl, data.generatedAt || Date.now());
}

async function upgradeRoundImageDisplay_(force) {
  if (!appData || !appData.round) return;
  const round = appData.round;
  const imageRef = String(round.imageRef || round.imageUrl || "").trim();
  if (!extractDriveFileId(imageRef)) return;
  try {
    const resolved = await resolveRoundImageForDisplay(imageRef, !!force);
    if (!resolved.url || isPlaceholderImage(resolved.url)) return;
    round.imageDisplayUrl = resolved.url;
    round.imageSourceMode = "proxy";
    round.imageWarning = resolved.warning || "";
    round.imageDebug = "mode=proxy" + (resolved.warning ? (" | " + resolved.warning) : "");
    round.imageDisplaySrc = withCacheBust(resolved.url, appData.generatedAt || Date.now());
    updateRoundImageElements(resolved.url, imageRef, appData.generatedAt || Date.now());
    if (resolved.warning) setImageDebug(resolved.warning);
  } catch (_) {}
}

function scheduleRoundImageUpgrade_(force) {
  if (roundImageUpgradeInFlight) return roundImageUpgradeInFlight;
  roundImageUpgradeInFlight = upgradeRoundImageDisplay_(force).finally(function () {
    roundImageUpgradeInFlight = null;
  });
  return roundImageUpgradeInFlight;
}

function ensureAppDataCore_(force, opts) {
  opts = opts || {};
  const loader = guestMode ? callServer("getGuestStockData") : fetchBootstrapAuthed_(force ? 2 : 3);
  return Promise.resolve(loader).then(async data => {
    if (!data) {
      appDataStale = true;
      if (!guestMode && authToken && await verifySessionAlive_()) {
        if (appData) {
          appDataStale = true;
          return appData;
        }
        throw new Error("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่");
      }
      throw new Error("กรุณาเข้าสู่ระบบใหม่");
    }
    // Round-image resolution must NEVER be able to reject the whole bootstrap:
    // a single bad image ref would otherwise blank every module (list/admin/…).
    let needsDriveUpgrade = false;
    try {
      if (data && data.round) {
        applyRoundDisplayFast_(data.round, data, opts);
        const imageRef = String(data.round.imageRef || data.round.imageUrl || "").trim();
        needsDriveUpgrade = !opts.skipImageResolve && !!extractDriveFileId(imageRef);
      }
    } catch (imgErr) {
      if (data && data.round) {
        data.round.imageDisplayUrl = SHIRT_PLACEHOLDER_URL;
        data.round.imageSourceMode = "placeholder";
        data.round.imageDisplaySrc = SHIRT_PLACEHOLDER_URL;
        data.round.imageWarning = "โหลดรูปไม่สำเร็จ";
      }
    }
    appData = data;
    appDataStale = false;
    // Update the signed-in identity, but NEVER downgrade/clear a known role:
    // a malformed me (missing role) must not hide the admin tab or scope away data.
    if (data && data.me) {
      if (data.me.role) { me = normalizeMeClient_(data.me); }
      else if (me && me.role) { me = normalizeMeClient_(Object.assign({}, data.me, { role: me.role })); }
      else { me = normalizeMeClient_(data.me); }
    }
    syncWindowSession_();
    try { updateSupportFooter_(); } catch (_) {}
    try { processOrderNotifications_(data.orders); } catch (_) {}
    if (needsDriveUpgrade) scheduleRoundImageUpgrade_(!!force);
    return appData;
  });
}

function shortOrderLabel_(orderId){
  const raw=String(orderId||"").trim();
  if(!raw)return "?";
  if(/^ORD-LEGACY-/i.test(raw))return "L"+raw.replace(/^ORD-LEGACY-/i,"");
  const s=raw.replace(/^ORD-?/i,"");
  if(/^\d{10,}$/.test(s))return s.slice(-10);
  if(s.length<=12)return s;
  return s.slice(-10);
}
function muteNotifyForOrder_(orderId,ms,scope){
  if(!orderId)return;
  const key=String(scope||"all")+":"+String(orderId);
  notifyMuteUntil_[key]=Date.now()+(ms||90000);
}
function isNotifyMuted_(orderId,scope){
  const keys=["all:"+String(orderId)];
  if(scope)keys.push(String(scope)+":"+String(orderId));
  for(let i=0;i<keys.length;i++){
    const t=notifyMuteUntil_[keys[i]];
    if(t&&Date.now()<t)return true;
    if(t)delete notifyMuteUntil_[keys[i]];
  }
  return false;
}
function notifyIsAdminReceiver_(){
  return isAdmin()||isEngineer();
}
function notifyIsUserReceiver_(g){
  if(isGuest()||isReadOnlyUser()||isAdmin())return false;
  return ownsOrderRegion(g);
}
function loadNotifyList_(){
  try{
    const raw=sessionStorage.getItem(NOTIFY_STORE_KEY);
    if(raw)notifyItems_=JSON.parse(raw)||[];
  }catch(_){notifyItems_=[];}
}
function saveNotifyList_(){
  try{sessionStorage.setItem(NOTIFY_STORE_KEY,JSON.stringify(notifyItems_.slice(0,NOTIFY_MAX)));}catch(_){}
}
function getNotifyReadSet_(){
  try{return new Set(JSON.parse(sessionStorage.getItem(NOTIFY_READ_KEY)||"[]"));}catch(_){return new Set();}
}
function saveNotifyReadSet_(set){
  try{sessionStorage.setItem(NOTIFY_READ_KEY,JSON.stringify([...set].slice(-300)));}catch(_){}
}
function resetNotifyState_(){
  orderNotifySnapshot_=null;
  notifyBaselineReady_=false;
  notifyItems_=[];
  notifyPanelOpen_=false;
  try{sessionStorage.removeItem(NOTIFY_STORE_KEY);sessionStorage.removeItem(NOTIFY_READ_KEY);}catch(_){}
  renderNotifyBell_();
}
function buildOrderNotifySnapshot_(orders){
  const snap={};
  groupOrdersByOrderId(orders).forEach(function(g){
    snap[g.orderId]={
      status:String(g.status||"").trim(),
      paymentStatus:String(g.paymentStatus||"").trim(),
      totalQty:Number(g.totalQty)||0,
      totalPrice:Number(g.totalPrice)||0,
      region:String(g.region||"").trim()
    };
  });
  return snap;
}
function makeOrderNotifyItem_(type,orderId,g,title,body){
  return{
    id:type+":"+orderId+":"+Date.now()+":"+Math.floor(Math.random()*1e5),
    type:type,
    orderId:orderId,
    title:title,
    body:body,
    at:Date.now(),
    read:false
  };
}
function orderNotifySummary_(g){
  const oid=shortOrderLabel_(g.orderId);
  const qty=Number(g.totalQty)||0;
  const amt=fmtMoney(g.totalPrice);
  return "เขต "+String(g.region||"-")+" · #"+oid+" · "+qty+" ตัว · "+amt+" ฿";
}
function detectOrderNotifications_(prev,next){
  const out=[];
  Object.keys(next).forEach(function(orderId){
    const g=Object.assign({orderId:orderId},next[orderId]);
    const p=prev[orderId];
    if(notifyIsAdminReceiver_()&&!isNotifyMuted_(orderId,"admin")){
      if(!p){
        if(!isCartStatus(g.status)){
          out.push(makeOrderNotifyItem_("order_new",orderId,g,"ออเดอร์ใหม่",orderNotifySummary_(g)));
        }
      }else if(isCartStatus(p.status)&&!isCartStatus(g.status)){
        out.push(makeOrderNotifyItem_("order_submit",orderId,g,"ยืนยันส่งออเดอร์",orderNotifySummary_(g)));
      }
    }
    if(notifyIsUserReceiver_(g)&&p&&!isNotifyMuted_(orderId,"user")){
      if(p.status!==g.status){
        out.push(makeOrderNotifyItem_("status_change",orderId,g,"อัปเดตสถานะออเดอร์","#"+shortOrderLabel_(orderId)+" → "+String(g.status||"-")));
      }
      if(p.paymentStatus!==g.paymentStatus&&String(g.paymentStatus||"").trim()){
        out.push(makeOrderNotifyItem_("payment_change",orderId,g,"อัปเดตการชำระเงิน","#"+shortOrderLabel_(orderId)+" → "+paymentStatusLabel(g.paymentStatus)));
      }
    }
  });
  return out;
}
function pushNotification_(item){
  if(!item)return;
  notifyItems_.unshift(item);
  if(notifyItems_.length>NOTIFY_MAX)notifyItems_.length=NOTIFY_MAX;
  saveNotifyList_();
}
function processOrderNotifications_(orders){
  if(guestMode||!authToken||!me)return;
  const snap=buildOrderNotifySnapshot_(orders);
  if(!notifyBaselineReady_){
    orderNotifySnapshot_=snap;
    notifyBaselineReady_=true;
    renderNotifyBell_();
    return;
  }
  const prev=orderNotifySnapshot_||{};
  orderNotifySnapshot_=snap;
  const added=detectOrderNotifications_(prev,snap);
  if(!added.length)return;
  added.forEach(pushNotification_);
  renderNotifyBell_();
  const latest=added[added.length-1];
  const toastText=latest.title+(latest.body?(" — "+latest.body):"");
  showAppToast_(toastText,"success");
}
function notifyUnreadCount_(){
  const read=getNotifyReadSet_();
  return notifyItems_.filter(function(n){return n&&n.id&&!read.has(n.id);}).length;
}
function renderNotifyBell_(){
  const wrap=document.getElementById("notify-wrap");
  const badge=document.getElementById("notify-badge");
  const panel=document.getElementById("notify-panel");
  if(!wrap||!badge)return;
  if(isGuest()||!authToken){
    wrap.classList.add("hidden");
    if(panel)panel.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  const unread=notifyUnreadCount_();
  if(unread>0){
    badge.textContent=unread>99?"99+":String(unread);
    badge.classList.remove("hidden");
  }else{
    badge.classList.add("hidden");
  }
  if(panel&&notifyPanelOpen_)renderNotifyPanel_();
}
function renderNotifyPanel_(){
  const panel=document.getElementById("notify-panel");
  if(!panel)return;
  const read=getNotifyReadSet_();
  const items=notifyItems_.slice(0,NOTIFY_MAX);
  let listHtml;
  if(!items.length){
    listHtml='<div class="notify-empty">ยังไม่มีการแจ้งเตือน</div>';
  }else{
    listHtml=items.map(function(n){
      const isRead=read.has(n.id);
      const when=new Date(n.at||Date.now());
      const timeStr=isNaN(when.getTime())?"":when.toLocaleString("th-TH",{hour:"2-digit",minute:"2-digit",day:"numeric",month:"short"});
      return '<button type="button" class="notify-item'+(isRead?"":" unread")+'" data-notify-id="'+escAttr(n.id)+'" onclick="openNotifyItem_(this.getAttribute(\'data-notify-id\'))">'
        +'<div class="notify-item-title">'+escHtml(n.title||"แจ้งเตือน")+'</div>'
        +'<div class="notify-item-body">'+escHtml(n.body||"")+'</div>'
        +(timeStr?'<div class="notify-item-time">'+escHtml(timeStr)+'</div>':"")
        +'</button>';
    }).join("");
  }
  panel.innerHTML='<div class="notify-panel-head"><span><i class="fas fa-bell mr-1"></i> แจ้งเตือน</span>'
    +'<button type="button" onclick="markAllNotificationsRead_()">อ่านทั้งหมด</button></div>'
    +'<div class="notify-panel-list">'+listHtml+'</div>';
}
function toggleNotifyPanel_(){
  const panel=document.getElementById("notify-panel");
  const btn=document.getElementById("notify-bell-btn");
  if(!panel)return;
  notifyPanelOpen_=!notifyPanelOpen_;
  if(notifyPanelOpen_){
    panel.classList.remove("hidden");
    renderNotifyPanel_();
    if(btn)btn.setAttribute("aria-expanded","true");
  }else{
    panel.classList.add("hidden");
    if(btn)btn.setAttribute("aria-expanded","false");
  }
}
function markAllNotificationsRead_(){
  const read=getNotifyReadSet_();
  notifyItems_.forEach(function(n){if(n&&n.id)read.add(n.id);});
  saveNotifyReadSet_(read);
  renderNotifyBell_();
}
function openNotifyItem_(id){
  const read=getNotifyReadSet_();
  read.add(id);
  saveNotifyReadSet_(read);
  const item=notifyItems_.find(function(n){return n.id===id;});
  notifyPanelOpen_=false;
  const panel=document.getElementById("notify-panel");
  if(panel)panel.classList.add("hidden");
  const btn=document.getElementById("notify-bell-btn");
  if(btn)btn.setAttribute("aria-expanded","false");
  renderNotifyBell_();
  if(item&&item.orderId&&typeof app!=="undefined"&&app&&typeof app.navigate==="function"){
    app.navigate("list");
  }
}
function initNotifyPanelDismiss_(){
  if(document._notifyDismissInit)return;
  document._notifyDismissInit=true;
  document.addEventListener("click",function(e){
    if(!notifyPanelOpen_)return;
    const wrap=document.getElementById("notify-wrap");
    if(wrap&&wrap.contains(e.target))return;
    notifyPanelOpen_=false;
    const panel=document.getElementById("notify-panel");
    if(panel)panel.classList.add("hidden");
    const btn=document.getElementById("notify-bell-btn");
    if(btn)btn.setAttribute("aria-expanded","false");
  });
}

function prefetchAppData() {
  if (!prefetchPromise) prefetchPromise = ensureAppData(false);
  return prefetchPromise;
}

function loadChartJs() {
  if (window.Chart) return Promise.resolve();
  if (chartJsLoading) return chartJsLoading;
  chartJsLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js";
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("โหลด Chart.js ไม่สำเร็จ"));
    document.head.appendChild(s);
  });
  return chartJsLoading;
}

// ── Helpers ──────────────────────────────────────────────────────────
function isPlaceholderImage(url){return !url || String(url).indexOf("placehold.co")>-1}
function isDataUrl(url){return /^data:/i.test(String(url||"").trim())}
function sizeClass(s){return "size-"+String(s).replace(/\s/g,"")}
function orderCartStatus(){return (appData&&appData.cartStatus)||"อยู่ในตะกร้า"}
function isCartStatus(s){return String(s||"").trim()===orderCartStatus()}
const ORDER_STATUS_ORDERED = "สั่งออเดอร์แล้วรอตรวจสอบการชำระ";
const ORDER_STATUS_AWAITING = "รอจัดส่ง/เข้ามารับ";
const ORDER_STATUS_SHIPPED = "จัดส่งแล้ว";
const ORDER_STATUS_RECEIVED = "ได้รับแล้ว";
const ORDER_STATUS_LEGACY_MAP_ = {
  "สั่งออเดอร์แล้ว": ORDER_STATUS_ORDERED,
  "รอโอน": ORDER_STATUS_ORDERED,
  "รอส่ง": ORDER_STATUS_AWAITING,
  "รอรับ": ORDER_STATUS_AWAITING,
  "รับแล้ว": ORDER_STATUS_RECEIVED
};
function normalizeOrderStatus_(status){
  const s=String(status||"").trim();
  if(!s)return ORDER_STATUS_ORDERED;
  if(ORDER_STATUS_LEGACY_MAP_[s])return ORDER_STATUS_LEGACY_MAP_[s];
  return s;
}
function isUserEditableOrderStatus(s){
  if(isCartStatus(s))return true;
  return normalizeOrderStatus_(s)===ORDER_STATUS_ORDERED;
}
function isUserLockedOrderStatus(s){
  const v=normalizeOrderStatus_(s);
  return v===ORDER_STATUS_AWAITING||v===ORDER_STATUS_SHIPPED||v===ORDER_STATUS_RECEIVED;
}
const ADMIN_NOTE_HIDDEN_REGION="สำนักงานใหญ่";
function isAdminHiddenNoteRegion(region){
  return String(region||"").trim()===ADMIN_NOTE_HIDDEN_REGION;
}
const PAYMENT_FREE_GIVEAWAY="เสื้อแจกฟรี";
/** Pastel palette per size (XS→7L) for dashboard size doughnut */
const SIZE_CHART_PASTEL_SALE=["#FDA4AF","#FDBA74","#FDE68A","#86EFAC","#7DD3FC","#C4B5FD","#F9A8D4","#5EEAD4","#93C5FD"];
const SIZE_CHART_PASTEL_FREE=["#FECDD3","#FED7AA","#FEF08A","#BBF7D0","#BAE6FD","#DDD6FE","#FBCFE8","#99F6E4","#BFDBFE"];
const SIZE_CHART_SEGMENT_BORDER="rgba(255,255,255,.35)";
function sizeChartPastels_(count,variant){
  const src=variant==="free"?SIZE_CHART_PASTEL_FREE:SIZE_CHART_PASTEL_SALE;
  const n=Math.max(0,Number(count)||0);
  if(n<=src.length)return src.slice(0,n);
  const out=src.slice();
  while(out.length<n)out.push(src[out.length%src.length]);
  return out;
}
function sizeChartDataset_(label,data,variant){
  const colors=sizeChartPastels_(data.length,variant);
  return {label:label,data:data,backgroundColor:colors,borderColor:SIZE_CHART_SEGMENT_BORDER,borderWidth:1};
}

function sortRegionChartData_(labels,qtys,freeQtys){
  const free=Array.isArray(freeQtys)?freeQtys:[];
  const items=(Array.isArray(labels)?labels:[]).map(function(label,i){
    const sale=Number(qtys&&qtys[i])||0;
    const give=Number(free[i])||0;
    return {label:label,sale:sale,give:give,total:sale+give};
  });
  items.sort(function(a,b){
    if(b.total!==a.total)return b.total-a.total;
    return String(a.label||"").localeCompare(String(b.label||""),"th");
  });
  return {
    labels:items.map(function(x){return x.label;}),
    qtys:items.map(function(x){return x.sale;}),
    freeQtys:items.map(function(x){return x.give;})
  };
}
function isPaymentVerified(s){
  return String(s||"").trim()==="ชำระเงินแล้ว";
}
function isFreeGiveawayPayment(s){
  return String(s||"").trim()===PAYMENT_FREE_GIVEAWAY;
}
function isPaymentLocked(s){
  return isPaymentVerified(s)||isFreeGiveawayPayment(s);
}
function canManageOrderSlip_(g,ownsOrder){
  return !isFreeGiveawayPayment(g&&g.paymentStatus)&&
    (isAdmin()||(ownsOrder&&!isPaymentLocked(g&&g.paymentStatus)));
}
function countsAsSaleRevenue(s){
  return !isFreeGiveawayPayment(s);
}
function shouldCountInDashboard_(o){
  return !isCartStatus(o.status||o.orderStatus);
}
function shouldCountInSalesReport_(o){
  if(isFreeGiveawayPayment(o.paymentStatus))return shouldCountInDashboard_(o);
  return true;
}
function canEditOrderNote_(g,ownsOrder){
  if(isReadOnlyUser())return false;
  if(canViewAllRegions()&&!isAdmin()&&!ownsOrder)return false;
  if(isAdmin())return true;
  if(isPaymentLocked(g&&g.paymentStatus))return false;
  return !!ownsOrder;
}
function canEditNoteInModal_(g,ownsOrder){
  if(isReadOnlyUser())return false;
  if(isAdmin())return true;
  if(canViewAllRegions()&&!ownsOrder)return false;
  if(isPaymentLocked(g&&g.paymentStatus))return false;
  return !!ownsOrder;
}
function copyTransferAccountNo_(btn){
  const t=btn&&(btn.dataset.copy||"").trim()||(btn.textContent||"").trim();
  if(!t)return;
  const done=()=>{if(typeof app!=="undefined"&&app.showMsg)app.showMsg("คัดลอกเลขบัญชีแล้ว","success");};
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(done).catch(()=>{});
    return;
  }
  const ta=document.createElement("textarea");
  ta.value=t;document.body.appendChild(ta);ta.select();
  try{document.execCommand("copy");done();}catch(_){}
  ta.remove();
}
function renderTransferAccountBlock_(opts){
  opts=opts||{};
  const raw=String(appData&&appData.transferAccount||"").trim();
  if(!raw)return "";
  const lines=raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(!lines.length)return "";
  const compact=!!opts.compact;
  const cardCls="transfer-account-card"+(compact?" transfer-account-card--compact":"");
  const acctNo=lines[0]||"";
  const bank=lines[1]||"";
  const acctName=lines.slice(2).join(" ");
  let metaHtml="";
  if(bank)metaHtml+=`<div class="transfer-account-bank">${escHtml(bank)}</div>`;
  if(acctName)metaHtml+=`<div class="transfer-account-name">${escHtml(acctName)}</div>`;
  return `<div class="${cardCls}">
    <div class="transfer-account-title"><i class="fas fa-university"></i> บัญชีสำหรับการโอนเงิน</div>
    <div class="transfer-account-body">
      <div class="transfer-account-row transfer-account-row--no">
        <button type="button" class="transfer-account-no" onclick="copyTransferAccountNo_(this)" data-copy="${escAttr(acctNo)}" title="แตะเพื่อคัดลอกเลขบัญชี">
          <span class="transfer-account-no-text">${escHtml(acctNo)}</span>
          <i class="fas fa-copy transfer-account-copy-icon" aria-hidden="true"></i>
        </button>
      </div>${metaHtml?`<div class="transfer-account-row transfer-account-row--meta">${metaHtml}</div>`:""}
    </div>
  </div>`;
}

function shouldHideOrderNoteForViewer_(g){
  return canViewAllRegions()&&!canViewAdminData()&&isAdminHiddenNoteRegion(g&&g.region);
}
function renderPickupDeliveryCell_(g){
  if(!canViewAdminData())return "";
  const hasPickup=!!(String(g.pickupDate||"").trim()||String(g.pickupTime||"").trim());
  const note=String(g.pickupNote||"").trim();
  let display=hasPickup
    ?`<div class="text-xs">${formatThaiDateTimeCell(g.pickupDate,g.pickupTime)}</div>`
    :(note?"":`<span class="text-glass-dim text-xs">-</span>`);
  if(note)display+=`<div class="order-pickup-note text-xs text-glass-dim mt-1">${escHtml(note)}</div>`;
  return `<div class="order-pickup-cell">${display}</div>`;
}

function orderListRowCanEditCart_(g){
  if(!g)return false;
  if(!isAdmin()&&!canCreateNewOrders_())return false;
  const owns=ownsOrderRegion(g);
  return canUserEditOrderGroup(g,owns)||canEditOrderNote_(g,owns);
}

function closeOrderListEditMenu_(){
  const menu=document.getElementById("order-list-edit-menu");
  if(menu)menu.remove();
  if(window._orderListEditMenuDismiss){
    document.removeEventListener("mousedown",window._orderListEditMenuDismiss,true);
    document.removeEventListener("keydown",window._orderListEditMenuDismiss,true);
    window._orderListEditMenuDismiss=null;
  }
}

function showOrderListEditMenu_(orderId,anchorEl){
  closeOrderListEditMenu_();
  const menu=document.createElement("div");
  menu.id="order-list-edit-menu";
  menu.className="order-list-edit-menu glass-card fade-in";
  menu.innerHTML=`<button type="button" class="order-list-edit-menu-item" data-action="cart"><i class="fas fa-pencil-alt"></i> แก้ไขออเดอร์</button>
    <button type="button" class="order-list-edit-menu-item" data-action="pickup"><i class="fas fa-truck"></i> วันที่รับ/จัดส่ง</button>`;
  menu.addEventListener("click",function(e){
    const btn=e.target.closest("[data-action]");
    if(!btn)return;
    closeOrderListEditMenu_();
    if(btn.dataset.action==="pickup")app.openPickupModal(orderId);
    else app.openCartEditModal(orderId);
  });
  document.body.appendChild(menu);
  const rect=(anchorEl&&anchorEl.getBoundingClientRect)?anchorEl.getBoundingClientRect():{right:12,bottom:12};
  const mw=menu.offsetWidth||176;
  let left=Math.max(8,rect.right-mw);
  let top=rect.bottom+6;
  if(top+menu.offsetHeight>window.innerHeight-8)top=Math.max(8,rect.top-menu.offsetHeight-6);
  menu.style.left=left+"px";
  menu.style.top=top+"px";
  window._orderListEditMenuDismiss=function(ev){
    if(ev.type==="keydown"&&ev.key!=="Escape")return;
    if(ev.type==="mousedown"&&menu.contains(ev.target))return;
    closeOrderListEditMenu_();
  };
  setTimeout(function(){
    document.addEventListener("mousedown",window._orderListEditMenuDismiss,true);
    document.addEventListener("keydown",window._orderListEditMenuDismiss,true);
  },0);
}

function openOrderListRowEdit_(orderId,anchorEl){
  const g=groupOrdersByOrderId(appData?.orders||[]).find(function(x){return String(x.orderId)===String(orderId);});
  if(!g||typeof app==="undefined"||!app)return;
  const canCart=orderListRowCanEditCart_(g);
  const canPickup=isAdmin()&&canViewAdminData();
  if(canCart&&canPickup){
    showOrderListEditMenu_(orderId,anchorEl);
    return;
  }
  if(canPickup){app.openPickupModal(orderId);return;}
  if(canCart){app.openCartEditModal(orderId);return;}
}

function orderListColSpan_(){
  return canViewAdminData()?10:9;
}

function normalizeContactPhoneInput_(v){
  return String(v==null?"":v).trim().substring(0,30);
}

function renderOrderContactBlock_(g){
  const phone=String(g&&g.contactPhone||"").trim();
  if(!phone)return "";
  return `<div class="order-contact-display mt-1 text-xs"><span class="opacity-70">เบอร์:</span> <span class="font-semibold">${escHtml(phone)}</span></div>`;
}

function renderOrderNoteBlock_(g,ownsOrder){
  if(shouldHideOrderNoteForViewer_(g))return `<div class="mt-1 text-xs text-glass-dim opacity-60">หมายเหตุ: -</div>`;
  const note=String(g&&g.note||"").trim();
  if(canViewAllRegions()&&!canViewAdminData()&&!ownsOrderRegion(g)&&!note)return "";
  return note
    ?`<div class="order-note-display mt-1 text-xs"><span class="opacity-70">หมายเหตุ:</span> <span class="font-semibold">${escHtml(note)}</span></div>`
    :`<div class="mt-1 text-xs text-glass-dim opacity-60">หมายเหตุ: -</div>`;
}
function canUserEditOrderGroup(g,ownsOrder){
  if(isAdmin())return true;
  if(isPaymentLocked(g&&g.paymentStatus))return false;
  return !!ownsOrder&&isUserEditableOrderStatus(g&&g.status);
}
function canUserDeleteOrderGroup(g,ownsOrder){
  if(isAdmin())return true;
  if(isPaymentLocked(g&&g.paymentStatus))return false;
  return !!ownsOrder&&isUserEditableOrderStatus(g&&g.status);
}
function statusClass(s){
  if(isCartStatus(s))return "status-ตะกร้า";
  const v=normalizeOrderStatus_(s);
  if(v===ORDER_STATUS_RECEIVED)return "status-ได้รับแล้ว";
  if(v===ORDER_STATUS_ORDERED)return "status-รอตรวจชำระ";
  if(v===ORDER_STATUS_SHIPPED)return "status-จัดส่งแล้ว";
  if(v===ORDER_STATUS_AWAITING)return "status-รอจัดส่ง";
  return "status-รอจัดส่ง";
}
function regionShort(r){return String(r||"").trim()}
function fmtMoney(n){return Number(n||0).toLocaleString()}
function localTodayStr_(){
  const d=new Date();
  return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
}
function localNowTimeStr_(){
  const d=new Date();
  return pad2(d.getHours())+":"+pad2(d.getMinutes());
}
function todayStr(){return localTodayStr_()}
function nowTimeStr(){return localNowTimeStr_()}

function normalizePayDateForInput_(v){
  const s=String(v||"").trim();
  let m=s.match(/^(\d{4}-\d{2}-\d{2})/);
  if(m)return m[1];
  m=s.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/);
  if(m){
    const mo=EN_MONTHS_ABBR.indexOf(m[1]);
    if(mo>=0)return (+m[3])+"-"+pad2(mo+1)+"-"+pad2(+m[2]);
  }
  return "";
}
function normalizePayTimeForInput_(v){
  const m=String(v||"").trim().match(/(\d{1,2}):(\d{2})/);
  return m?pad2(+m[1])+":"+m[2]:"";
}

// ── Thai date/time formatting (Buddhist year = CE+543) ────────────────
// Backend sends payDate/payTime as raw String(cell): a date cell becomes a
// JS Date.toString() like "Fri May 29 2026 00:00:00 GMT+0700 (Indochina Time)",
// while a time-only cell serializes with the Sheets epoch "Sat Dec 30 1899 08:57:00".
// We parse defensively, avoid timezone shifts by reading literal parts, and
// treat the 1899 epoch (year < 1900) as "no real date".
const TH_MONTHS_ABBR=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const EN_MONTHS_ABBR=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function pad2(n){return ("0"+n).slice(-2)}
function formatThaiDate(v){
  if(v instanceof Date){if(isNaN(v.getTime())||v.getFullYear()<1900)return "-";return v.getDate()+" "+TH_MONTHS_ABBR[v.getMonth()]+" "+(v.getFullYear()+543)}
  const s=String(v==null?"":v).trim();
  if(!s)return "-";
  // ISO date (YYYY-MM-DD[...]) — read literally to avoid TZ off-by-one
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m){const y=+m[1];if(y<1900)return "-";return (+m[3])+" "+TH_MONTHS_ABBR[(+m[2])-1]+" "+(y+543)}
  // JS Date.toString() form: "Fri May 29 2026 ..." — read literally
  m=s.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/);
  if(m){const mo=EN_MONTHS_ABBR.indexOf(m[1]);if(mo<0)return "-";const y=+m[3];if(y<1900)return "-";return (+m[2])+" "+TH_MONTHS_ABBR[mo]+" "+(y+543)}
  // Fallback: native parse
  const d=new Date(s);
  if(isNaN(d.getTime())||d.getFullYear()<1900)return "-";
  return d.getDate()+" "+TH_MONTHS_ABBR[d.getMonth()]+" "+(d.getFullYear()+543);
}
function formatThaiTime(v){
  if(v instanceof Date){if(isNaN(v.getTime()))return "";return pad2(v.getHours())+":"+pad2(v.getMinutes())+" น."}
  const s=String(v==null?"":v).trim();
  if(!s)return "";
  // Grab HH:MM literally (handles "08:57", "08:57:00", and the 1899 epoch string)
  const m=s.match(/(\d{1,2}):(\d{2})/);
  if(m)return pad2(+m[1])+":"+m[2]+" น.";
  return "";
}
function bangkokPartsFromInstant_(d){
  if(!(d instanceof Date)||isNaN(d.getTime()))return null;
  return {
    date:d.toLocaleDateString("en-CA",{timeZone:"Asia/Bangkok"}),
    time:d.toLocaleTimeString("en-GB",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit",hour12:false})
  };
}
function formatBangkokTimestampLiteral_(d){
  const parts=bangkokPartsFromInstant_(d instanceof Date?d:new Date());
  return parts?parts.date+"T"+parts.time:"";
}
// Combined two-line (date / time) cell for the order list
function formatOrderTimestampCell(ts){
  const s=String(ts||"").trim();
  if(!s)return "-";
  // Legacy UTC ISO from bootstrap (Z suffix or explicit offset) — convert to Bangkok
  if(/Z$/i.test(s)||/[+-]\d{2}:\d{2}$/.test(s)){
    const parts=bangkokPartsFromInstant_(new Date(s));
    if(parts)return formatThaiDateTimeCell(parts.date,parts.time);
  }
  const iso=s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if(iso)return formatThaiDateTimeCell(iso[1],iso[2]);
  return formatThaiDateTimeCell(s,"");
}
function formatOrderListItemsPlain_(items){
  const bySize={};
  (Array.isArray(items)?items:[]).forEach(function(it){
    const size=String(it&&it.size||"").trim();
    const qty=Number(it&&it.qty)||0;
    if(!size||qty<=0)return;
    bySize[size]=(bySize[size]||0)+qty;
  });
  const order=appData?.stockSizes||[];
  const keys=order.length
    ?order.filter(function(s){return bySize[s]>0;}).concat(Object.keys(bySize).filter(function(s){return order.indexOf(s)<0;}).sort())
    :Object.keys(bySize).sort();
  if(!keys.length)return '<span class="text-glass-dim">-</span>';
  return '<div class="order-list-items-plain">'+keys.map(function(s){return escHtml(s)+"="+bySize[s];}).join("<br>")+"</div>";
}
function buildOrderSearchHaystack_(g){
  const parts=[];
  const oid=String(g&&g.orderId||"");
  if(oid){
    parts.push(oid);
    parts.push(oid.replace(/^ORD-?/i,""));
    parts.push(shortOrderLabel_(oid));
  }
  const phone=String(g&&g.contactPhone||"").trim();
  if(phone)parts.push(phone);
  const ts=String(g&&g.timestamp||"").trim();
  if(ts){
    parts.push(ts);
    let datePart=ts;
    if(/Z$/i.test(ts)||/[+-]\d{2}:\d{2}$/.test(ts)){
      const p=bangkokPartsFromInstant_(new Date(ts));
      if(p)datePart=p.date;
    }else{
      const m=ts.match(/^(\d{4}-\d{2}-\d{2})/);
      if(m)datePart=m[1];
    }
    const thai=formatThaiDate(datePart);
    if(thai&&thai!=="-")parts.push(thai);
    const iso=String(datePart).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso){
      parts.push(iso[1],iso[2],iso[3]);
      parts.push(String(+iso[3]),String(+iso[2]));
    }
  }
  return parts.join(" ").toLowerCase();
}

function paymentStatusLabel(s){
  const v=String(s||"").trim();
  if(v==="ชำระเงินแล้ว")return v;
  if(v===PAYMENT_FREE_GIVEAWAY)return v;
  if(v==="รอตรวจสลิป")return v;
  return v? v : "ยังไม่ชำระ";
}

function orderListPaymentFilterOptionsHtml_(){
  const opts=[
    {value:"all",label:"การชำระทั้งหมด"},
    {value:"ยังไม่ชำระ",label:"ยังไม่ชำระ"},
    {value:"รอตรวจสลิป",label:"รอตรวจสลิป"},
    {value:"ชำระเงินแล้ว",label:"ชำระเงินแล้ว"},
    {value:PAYMENT_FREE_GIVEAWAY,label:PAYMENT_FREE_GIVEAWAY}
  ];
  return opts.map(function(opt){
    return `<option value="${escAttr(opt.value)}">${escHtml(opt.label)}</option>`;
  }).join("");
}

function computeOrderListSummary_(orders){
  const sizes=appData?.stockSizes||[];
  const bySize={};
  sizes.forEach(function(s){bySize[s]=0;});
  let totalQty=0,totalMoney=0,receivedQty=0,waitingQty=0,notPaidQty=0;
  (Array.isArray(orders)?orders:[]).forEach(function(o){
    if(!shouldCountInDashboard_(o))return;
    const qty=Number(o.qty)||0;
    const price=Number(o.price)||0;
    const size=String(o.size||"").trim();
    const ps=String(o.paymentStatus||"").trim();
    const st=normalizeOrderStatus_(o.status||o.orderStatus);
    if(size){
      if(bySize[size]===undefined)bySize[size]=0;
      bySize[size]+=qty;
    }
    totalQty+=qty;
    if(!isFreeGiveawayPayment(ps))totalMoney+=price;
    if(!isPaymentVerified(ps)&&!isFreeGiveawayPayment(ps))notPaidQty+=qty;
    else if(st===ORDER_STATUS_RECEIVED)receivedQty+=qty;
    else waitingQty+=qty;
  });
  return {sizes:sizes,bySize:bySize,totalQty:totalQty,totalMoney:totalMoney,receivedQty:receivedQty,waitingQty:waitingQty,notPaidQty:notPaidQty};
}

function renderOrderListSummaryHtml_(summary){
  summary=summary||{};
  const colSpan=orderListColSpan_();
  const sizeParts=(summary.sizes||[]).map(function(s){
    const q=Number(summary.bySize&&summary.bySize[s])||0;
    return q>0?`<span class="order-list-summary-size"><span class="size-badge ${sizeClass(s)}">${escHtml(s)}</span> ${q} ตัว</span>`:"";
  }).filter(Boolean);
  const sizeLine=sizeParts.length
    ?`<div class="order-list-summary-line"><span class="order-list-summary-label">แยกไซส์:</span> ${sizeParts.join('<span class="order-list-summary-sep"> · </span>')}</div>`
    :"";
  return `<tr class="order-list-summary-row"><td colspan="${colSpan}" class="order-list-summary-cell">
    <div class="order-list-summary">
      <div class="order-list-summary-title"><i class="fas fa-calculator mr-1"></i>สรุปรายการที่แสดง</div>
      ${sizeLine}
      <div class="order-list-summary-line order-list-summary-totals">
        <span><b>รวม</b> ${summary.totalQty||0} ตัว</span>
        <span class="order-list-summary-sep">·</span>
        <span><b>ยอด</b> ${fmtMoney(summary.totalMoney||0)} ฿</span>
        <span class="order-list-summary-sep">·</span>
        <span><b>รับแล้ว</b> ${summary.receivedQty||0} ตัว</span>
        <span class="order-list-summary-sep">·</span>
        <span><b>รอรับ</b> ${summary.waitingQty||0} ตัว</span>
        <span class="order-list-summary-sep">·</span>
        <span><b>ยังไม่โอน</b> ${summary.notPaidQty||0} ตัว</span>
      </div>
    </div>
  </td></tr>`;
}

function updateOrderListSummary_(){
  const tfoot=document.getElementById("order-list-summary");
  if(!tfoot)return;
  const visibleIds={};
  document.querySelectorAll("#order-table tbody tr[data-order-id]").forEach(function(tr){
    if(tr.style.display==="none")return;
    const oid=tr.getAttribute("data-order-id");
    if(oid)visibleIds[oid]=true;
  });
  const ids=Object.keys(visibleIds);
  if(!ids.length){
    tfoot.innerHTML="";
    tfoot.style.display="none";
    return;
  }
  const orders=(appData?.orders||[]).filter(function(o){return visibleIds[String(o.orderId)];});
  tfoot.innerHTML=renderOrderListSummaryHtml_(computeOrderListSummary_(orders));
  tfoot.style.display="";
}

function orderImageDisplaySrc(res){
  if(!res)return "";
  if(res.dataUrl)return String(res.dataUrl);
  if(res.thumbnailUrl)return String(res.thumbnailUrl);
  return "";
}

function paymentStatusBadgeClass(s){
  const v=String(s||"").trim();
  if(v==="ชำระเงินแล้ว")return "status-รับแล้ว";
  if(v===PAYMENT_FREE_GIVEAWAY)return "status-แจกฟรี";
  if(v==="รอตรวจสลิป")return "status-รอโอน";
  return "status-ตะกร้า";
}

function formatThaiDateTimeCell(dateVal,timeVal){
  const d=formatThaiDate(dateVal);
  const t=formatThaiTime(timeVal);
  if(d==="-"&&!t)return '<span class="text-glass-dim">-</span>';
  const dateLine=d==="-"?'<span class="text-glass-dim">-</span>':escHtml(d);
  const timeLine=t?`<div class="text-xs text-glass-muted">${escHtml(t)}</div>`:"";
  return `<div>${dateLine}</div>${timeLine}`;
}
const DEFAULT_ADMIN_USERNAMES_RE = /^(admin1|admin2)$/i;

function normalizeMeClient_(userMe) {
  if (!userMe || typeof userMe !== "object") return userMe;
  const uname = String(userMe.username || "").trim().toLowerCase();
  const roleRaw = String(userMe.role || "").trim();
  let role = roleRaw.toLowerCase() || "user";
  let region = String(userMe.region || "").trim();
  const regionNorm = region.toLowerCase();
  const regions = (appData && Array.isArray(appData.regions)) ? appData.regions : [];
  const looksLegacySwappedAdmin =
    (role === "*" && regionNorm === "admin") ||
    (DEFAULT_ADMIN_USERNAMES_RE.test(uname) && role === "user" && regionNorm === "admin");
  if (looksLegacySwappedAdmin) {
    return Object.assign({}, userMe, { role: "admin", region: "*" });
  }
  if (!looksLegacySwappedAdmin && regions.indexOf(roleRaw) > -1 && regionNorm === "user") {
    return Object.assign({}, userMe, { role: "user", region: roleRaw });
  }
  if (DEFAULT_ADMIN_USERNAMES_RE.test(uname) && role !== "admin") {
    return Object.assign({}, userMe, { role: "admin", region: region || "*" });
  }
  return userMe;
}

const ROLE_ENGINEER="engineer";
const ROLE_ENGINEER_LABEL="ทีมงาน ชวศ";
const ROLE_ENG_READONLY="eng_readonly";
const ROLE_ENG_READONLY_LABEL="ทีมงาน ชวศ. ดูเท่านั้น";
function isAdmin(){
  if (me) me = normalizeMeClient_(me);
  return me && me.role === "admin";
}
function isEngineer(){
  if (me) me = normalizeMeClient_(me);
  return !!(me&&me.role===ROLE_ENGINEER);
}
function isViewer(){
  if (me) me = normalizeMeClient_(me);
  return !!(me && me.role === "viewer");
}
function isEngReadonly(){
  if (me) me = normalizeMeClient_(me);
  return !!(me && me.role === ROLE_ENG_READONLY);
}
function isReadOnlyUser(){
  return isViewer() || isEngReadonly();
}
function isRegionalOrderUser_(){
  if(isGuest()||isReadOnlyUser()||isAdmin())return false;
  return !!(me&&(me.role==="user"||me.role===ROLE_ENGINEER));
}
function canCreateNewOrders_(){
  if(isGuest()||isReadOnlyUser())return false;
  if(isAdmin())return true;
  if(!isRegionalOrderUser_())return false;
  if(appData&&appData.orderingGlobalEnabled===false)return false;
  return me&&me.orderingEnabled!==false;
}
function canViewAdminData(){
  return isAdmin() || isEngReadonly();
}
function canViewAllRegions(){
  return isAdmin() || isEngineer() || isViewer() || isEngReadonly();
}
function ownsOrderRegion(g){
  return !isGuest()&&!!(me&&String(me.region)===String(g&&g.region));
}
function isGuest(){return me&&me.role==="guest"}
function escHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function escAttr(s){return escHtml(s).replace(/`/g,"&#96;")}

function extractDriveFileId(ref){
  const s=String(ref||"").trim();
  if(!s)return "";
  const marker=s.match(/^drivefile:([a-zA-Z0-9_-]+)/i);
  if(marker&&marker[1])return marker[1];
  const q=s.match(/[?&]id=([^&]+)/i);
  if(q&&q[1])return q[1];
  const d=s.match(/\/d\/([^/?#]+)/i);
  if(d&&d[1])return d[1];
  return "";
}
function slipDriveThumbUrl_(fileId,sz){
  if(!fileId)return "";
  const w=Math.max(400,Number(sz)||1200);
  return "https://drive.google.com/thumbnail?id="+encodeURIComponent(fileId)+"&sz=w"+w;
}
function slipDriveViewUrl_(slipUrl,fileId){
  const s=String(slipUrl||"").trim();
  if(s&&/^https?:\/\//i.test(s))return s;
  if(fileId)return "https://drive.google.com/uc?export=view&id="+encodeURIComponent(fileId);
  return s;
}

function imageProxyCacheSet_(fileId,dataUrl){
  if(!fileId)return;
  if(imageProxyCache[fileId]){
    const idx=imageProxyCacheOrder.indexOf(fileId);
    if(idx>=0)imageProxyCacheOrder.splice(idx,1);
  }
  imageProxyCache[fileId]=dataUrl;
  imageProxyCacheOrder.push(fileId);
  while(imageProxyCacheOrder.length>IMAGE_PROXY_CACHE_MAX){
    const old=imageProxyCacheOrder.shift();
    delete imageProxyCache[old];
  }
}
function clearRoundImageProxyCache(imageRef){
  const id=extractDriveFileId(imageRef);
  if(!id)return;
  delete imageProxyCache[id];
  const idx=imageProxyCacheOrder.indexOf(id);
  if(idx>=0)imageProxyCacheOrder.splice(idx,1);
}

async function resolveRoundImageForDisplay(imageRef, bustCache){
  const raw=String(imageRef||"").trim();
  if(!raw)return {url:SHIRT_PLACEHOLDER_URL};
  if(isDataUrl(raw))return {url:raw};
  const fileId=extractDriveFileId(raw);
  if(!fileId)return {url:raw};
  if(!bustCache&&imageProxyCache[fileId])return {url:imageProxyCache[fileId],cached:true};
  try{
    const res=guestMode
      ? await callServer("getImageProxy",fileId)
      : await callAuthed("getImageProxy",fileId);
    if(res&&res.ok&&res.dataUrl){
      imageProxyCacheSet_(fileId,res.dataUrl);
      return {url:res.dataUrl,cached:!!res.cached};
    }
    if(res&&res.ok&&res.thumbnailUrl){
      return {url:res.thumbnailUrl,warning:res.warning||""};
    }
    const serverErr=res&&res.error?(" ("+res.error+")"):"";
    return {url:SHIRT_PLACEHOLDER_URL,warning:((res&&res.warning)||"โหลดรูปไม่สำเร็จ")+serverErr};
  }catch(e){
    return {url:SHIRT_PLACEHOLDER_URL,warning:e&&e.message?e.message:"โหลดรูปไม่สำเร็จ"};
  }
}

function withCacheBust(url, stamp){
  const raw=String(url||"").trim();
  if(!raw||isDataUrl(raw))return raw;
  const t=encodeURIComponent(String(stamp||Date.now()));
  return raw+(raw.indexOf("?")>-1?"&":"?")+"t="+t;
}

function pickRoundDisplayImage_(round){
  const r=round||{};
  const stamp=(appData&&appData.generatedAt)||Date.now();
  if(r.imageDisplaySrc&&!isPlaceholderImage(r.imageDisplaySrc))return r.imageDisplaySrc;
  if(r.imageDisplayUrl&&!isPlaceholderImage(r.imageDisplayUrl)&&r.imageSourceMode!=="thumb"){
    return isDataUrl(r.imageDisplayUrl)?r.imageDisplayUrl:withCacheBust(r.imageDisplayUrl,stamp);
  }
  if(isValidRoundUrl(r.imageUrl))return withCacheBust(r.imageUrl,stamp);
  if(r.imageDataThumb&&isDataUrl(r.imageDataThumb))return r.imageDataThumb;
  return SHIRT_PLACEHOLDER_URL;
}

function isValidRoundUrl(url){
  const s=String(url||"").trim();
  if(!s)return false;
  if(isPlaceholderImage(s))return false;
  if(/^drivefile:/i.test(s))return false;
  return /^https?:\/\//i.test(s)||isDataUrl(s);
}

function setImageDebug(message){
  if(!isAdmin())return;
  const text=String(message||"").trim();
  if(appData&&appData.round)appData.round.imageDebug=text;
  const el=document.getElementById("admin-image-debug");
  if(el){
    const mode=(appData&&appData.round&&appData.round.imageSourceMode)||"placeholder";
    el.textContent="mode="+mode+(text?(" | "+text):"");
  }
}

function updateRoundImageElements(displayUrl, sourceRef, bustStamp){
  const src=withCacheBust(displayUrl, bustStamp||Date.now());
  const ref=String(sourceRef||"");
  const stockImg=document.getElementById("stock-shirt-image");
  const adminImg=document.getElementById("admin-image-preview");
  if(stockImg){
    stockImg.setAttribute("data-image-ref",ref);
    stockImg.src=src||SHIRT_PLACEHOLDER_URL;
  }
  if(adminImg){
    adminImg.setAttribute("data-image-ref",ref);
    adminImg.src=src||SHIRT_PLACEHOLDER_URL;
  }
  return src||SHIRT_PLACEHOLDER_URL;
}

const PICKUP_STATUS_OPTS=[ORDER_STATUS_AWAITING,ORDER_STATUS_SHIPPED,ORDER_STATUS_RECEIVED];
const ADMIN_ORDER_STATUS_OPTS=[ORDER_STATUS_ORDERED].concat(PICKUP_STATUS_OPTS);
function statusOptions(selected){
  return (appData?.pickupStatus||ADMIN_ORDER_STATUS_OPTS).map(s=>
    `<option value="${s}" ${selected===s?"selected":""}>${s}</option>`).join("");
}

function ddSafeId(s){return String(s||"").replace(/[^a-zA-Z0-9_-]/g,"_")}

// Custom glass dropdown: in-DOM host holds a hidden input + toggle button.
// The options panel is created on open and appended to <body> as position:fixed,
// so it is never clipped by glass-card overflow and never clashes with the submit bar.
function buildGlassDropdown(config){
  const ddId=config.ddId;
  dropdownRegistry[ddId]={options:config.options||[],compact:!!config.compact,onSelect:config.onSelect||null};
  const compactCls=config.compact?"glass-dd-compact":"";
  const statusCls=config.statusCls||"";
  return `<div class="glass-dd ${compactCls} ${statusCls}" id="${ddId}">
    <input type="hidden" id="${config.valueInputId}" value="${escHtml(config.value)}">
    <button type="button" class="glass-dd-toggle" aria-haspopup="listbox" aria-expanded="false" onclick="app.toggleDropdown('${ddId}',event)">
      <span class="glass-dd-label" id="${ddId}-label">${escHtml(config.value)}</span>
      <i class="fas fa-chevron-down glass-dd-caret" aria-hidden="true"></i>
    </button>
  </div>`;
}

function skeletonHtml(module){
  const blocks = (module==="dashboard"||module==="report")
    ? `<div class="skeleton skeleton-stat"></div><div class="skeleton skeleton-stat"></div><div class="skeleton skeleton-chart"></div><div class="skeleton skeleton-chart"></div>`
    : `<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-table"></div>`;
  return `<div class="skeleton-wrap space-y-4 fade-in">${blocks}</div>`;
}

function orderSizeKey_(size){
  return String(size||"").trim();
}
function canRecalcStockFromOrders_(){
  // Only roles that receive the full order list for stock math (viewers hide free-giveaway rows).
  return isAdmin()||isEngineer()||isEngReadonly();
}
function recalcStockFromOrders(){
  if(!appData?.stock||!appData?.orders)return;
  if(!canRecalcStockFromOrders_())return;
  const sold={};
  appData.stockSizes.forEach(s=>{sold[s]=0});
  appData.orders.forEach(o=>{
    const size=orderSizeKey_(o.size);
    if(size in sold)sold[size]+=Number(o.qty||0);
  });
  appData.stock.forEach(s=>{s.sold=sold[s.size]||0;s.remaining=Math.max(s.delivered-s.sold,0)});
}

function stockRemainingForSize(size){
  const s=appData?.stock?.find(x=>x.size===size);
  return Math.max(0,Number(s&&s.remaining)||0);
}

function stockRemainingDisplay_(remaining){
  const n=Math.max(0,Number(remaining)||0);
  if(n<=0)return '<span class="text-red-glass">สินค้าหมด</span>';
  return String(n);
}

function qtyInOrderForSize(orderId,size){
  const want=orderSizeKey_(size);
  return (appData?.orders||[]).filter(o=>String(o.orderId)===String(orderId)&&orderSizeKey_(o.size)===want)
    .reduce((sum,o)=>sum+Number(o.qty||0),0);
}

function maxEditableQtyForOrder(orderId,size){
  return stockRemainingForSize(size)+qtyInOrderForSize(orderId,size);
}

function applyLocalOrderCreate_(result,payload,items){
  if(!appData||!result||!result.orderId||!Array.isArray(items)||items.length===0)return;
  if(!Array.isArray(appData.orders))appData.orders=[];
  const unitPrice=Number(result.unitPrice||appData.unitPrice||0);
  const status=String(result.status||payload.status||(isAdmin()?ORDER_STATUS_ORDERED:orderCartStatus()));
  const note=String(result.note||payload.note||"");
  const contactPhone=normalizeContactPhoneInput_(result.contactPhone||payload.contactPhone||"");
  const now=result.timestamp||formatBangkokTimestampLiteral_(new Date());
  let nextNo=appData.orders.reduce((m,o)=>Math.max(m,Number(o.no)||0),0);
  items.forEach(it=>{
    nextNo+=1;
    appData.orders.push({
      no:nextNo,
      orderId:result.orderId,
      region:result.region||payload.region,
      size:it.size,
      qty:it.qty,
      price:it.qty*unitPrice,
      payDate:result.payDate||payload.payDate||"",
      payTime:result.payTime||payload.payTime||"",
      orderStatus:status,
      status:status,
      note:note,
      contactPhone:contactPhone,
      timestamp:now,
      slipName:String(result.slipName||""),
      slipUrl:String(result.slipUrl||""),
      createdBy:(me&&me.username)||"",
      requestedChange:"",
      changeRequestStatus:"none",
      changeRequestNote:"",
      paymentStatus:""
    });
  });
  recalcStockFromOrders();
}

function applyLocalOrderCartUpdate_(orderId,result,items,orderGroup,savedNote,savedContactPhone){
  if(!appData||!orderId||!Array.isArray(items)||items.length===0||!orderGroup)return;
  if(!Array.isArray(appData.orders))appData.orders=[];
  const unitPrice=Number(appData.unitPrice||0)||(orderGroup.totalQty?orderGroup.totalPrice/orderGroup.totalQty:0);
  const status=String(result&&result.status||orderGroup.status||"");
  const note=savedNote!=null?String(savedNote).trim():String(orderGroup.note||"");
  const contactPhone=savedContactPhone!=null?normalizeContactPhoneInput_(savedContactPhone):normalizeContactPhoneInput_(orderGroup.contactPhone||"");
  appData.orders=appData.orders.filter(o=>o.orderId!==orderId);
  let nextNo=appData.orders.reduce((m,o)=>Math.max(m,Number(o.no)||0),0);
  items.forEach(it=>{
    nextNo+=1;
    appData.orders.push({
      no:nextNo,
      orderId:orderId,
      region:orderGroup.region,
      size:it.size,
      qty:it.qty,
      price:it.qty*unitPrice,
      payDate:orderGroup.payDate||"",
      payTime:orderGroup.payTime||"",
      orderStatus:status,
      status:status,
      note:note,
      contactPhone:contactPhone,
      timestamp:orderGroup.timestamp||formatBangkokTimestampLiteral_(new Date()),
      slipName:orderGroup.slipName||"",
      slipUrl:orderGroup.slipUrl||"",
      createdBy:(me&&me.username)||"",
      requestedChange:orderGroup.requestedChange||"",
      changeRequestStatus:orderGroup.changeRequestStatus||"none",
      changeRequestNote:orderGroup.changeRequestNote||"",
      paymentStatus:orderGroup.paymentStatus||""
    });
  });
  recalcStockFromOrders();
}

function groupOrdersByOrderId(orders){
  const map={};
  const order=[];
  (Array.isArray(orders)?orders:[]).forEach(o=>{
    if(!o)return;
    const oid=o.orderId||("ORD-"+o.no);
    if(!map[oid]){
      map[oid]={
        orderId:oid,
        region:o.region,
        payDate:o.payDate,
        payTime:o.payTime,
        status:o.orderStatus||o.status,
        note:o.note||"",
        contactPhone:o.contactPhone||"",
        requestedChange:o.requestedChange||"",
        changeRequestStatus:o.changeRequestStatus||"none",
        changeRequestNote:o.changeRequestNote||"",
        slipName:o.slipName,
        slipUrl:o.slipUrl,
        timestamp:o.timestamp,
        paymentStatus:o.paymentStatus||"",
        pickupDate:o.pickupDate||"",
        pickupTime:o.pickupTime||"",
        pickupNote:o.pickupNote||"",
        items:[],
        totalQty:0,
        totalPrice:0,
        firstNo:o.no
      };
      order.push(oid);
    }
    map[oid].items.push({size:o.size,qty:o.qty,no:o.no,price:o.price});
    map[oid].totalQty+=o.qty;
    map[oid].totalPrice+=o.price;
    if(o.no<map[oid].firstNo)map[oid].firstNo=o.no;
  });
  return order.map(id=>map[id]);
}

function sortOrderGroupsForList_(groups){
  const arr=Array.isArray(groups)?groups.slice():[];
  arr.reverse();
  const active=[];
  const received=[];
  arr.forEach(function(g){
    if(normalizeOrderStatus_(g&&g.status)===ORDER_STATUS_RECEIVED)received.push(g);
    else active.push(g);
  });
  return active.concat(received);
}

// ── Dashboard / report compute ──────────────────────────────────────
function renderDashRegionLinesHtml_(items, lineFn){
  if(!items||!items.length)return "";
  return `<div class="dash-region-lines">${items.map(function(x){return `<div class="dash-region-line">${lineFn(x)}</div>`;}).join("")}</div>`;
}

function renderDashboardCardsHtml_(dash, regionFilter){
  const showBreakdown=!regionFilter||regionFilter==="all";
  const unpaidQtyLines=showBreakdown?renderDashRegionLinesHtml_(dash.unpaidByRegion,function(x){
    return `<span class="dash-region-name">${escHtml(regionShort(x.region))}</span><span class="dash-region-val">${x.qty} ตัว</span>`;
  }):"";
  const unpaidMoneyLines=showBreakdown?renderDashRegionLinesHtml_(dash.unpaidByRegion,function(x){
    return `<span class="dash-region-name">${escHtml(regionShort(x.region))}</span><span class="dash-region-val">${fmtMoney(x.amount)} ฿</span>`;
  }):"";
  const deliveryLines=showBreakdown?renderDashRegionLinesHtml_(dash.pendingDeliveryByRegion,function(x){
    return `<span class="dash-region-name">${escHtml(regionShort(x.region))}</span><span class="dash-region-val">${x.qty} ตัว</span>`;
  }):"";
  const adminCards=canViewAdminData()?`
    <div class="glass-stat" style="background:linear-gradient(135deg,rgba(109,40,217,.35),rgba(79,70,229,.25))"><div class="glass-stat-label">แจกฟรี (ตัว)</div><div class="glass-stat-value">${dash.freeGiveawayQty||0}</div></div>
    <div class="glass-stat" style="background:linear-gradient(135deg,rgba(109,40,217,.45),rgba(127,29,29,.2))"><div class="glass-stat-label">ขาดทุนแจก (฿)</div><div class="glass-stat-value text-2xl">${fmtMoney(dash.freeGiveawayLoss||0)}</div></div>`:"";
  return `
    <div class="glass-stat glass-stat-purple"><div class="glass-stat-label">ยอดสั่งซื้อ (ตัว)</div><div class="glass-stat-value">${dash.totalShirts}</div></div>
    <div class="glass-stat glass-stat-green"><div class="glass-stat-label">ชำระแล้ว (฿)</div><div class="glass-stat-value text-2xl">${fmtMoney(dash.paidAmount||0)}</div></div>
    <div class="glass-stat glass-stat-blue"><div class="glass-stat-label">รอตรวจสอบการชำระ</div><div class="glass-stat-value text-2xl">${dash.pendingSlipReviewCount||0}</div><div class="glass-stat-sub">ออเดอร์</div></div>
    ${adminCards}
    <div class="glass-stat dash-stat-wide glass-stat-orange"><div class="dash-stat-wide-head"><div class="glass-stat-label">รอชำระ (ตัว)</div><div class="glass-stat-value text-2xl">${dash.unpaidQty||0}</div></div>${unpaidQtyLines}</div>
    <div class="glass-stat dash-stat-wide" style="background:linear-gradient(135deg,rgba(239,68,68,.32),rgba(127,29,29,.28))"><div class="dash-stat-wide-head"><div class="glass-stat-label">รอชำระเป็นเงิน (฿)</div><div class="glass-stat-value text-2xl">${fmtMoney(dash.unpaidAmount||0)}</div></div>${unpaidMoneyLines}</div>
    <div class="glass-stat dash-stat-wide glass-stat-yellow"><div class="dash-stat-wide-head"><div class="glass-stat-label">รอจัดส่ง (ตัว)</div><div class="glass-stat-value text-2xl">${dash.pendingDeliveryQty||0}</div></div>${deliveryLines}</div>`;
}

function computeDashboard(regionFilter){
  const all=appData?.orders||[];
  const orders=(regionFilter&&regionFilter!=="all")?all.filter(o=>o.region===regionFilter):all;
  const regions=appData?.regions||[];
  const byRegion={};
  const byRegionFree={};
  const byRegionFreeLoss={};
  const byRegionUnpaid={};
  const byRegionDelivery={};
  regions.forEach(r=>{
    byRegion[r]={qty:0,amount:0};
    byRegionFree[r]={qty:0,loss:0};
    byRegionFreeLoss[r]=0;
    byRegionUnpaid[r]={qty:0,amount:0};
    byRegionDelivery[r]={qty:0};
  });
  const bySize={};
  const bySizeFree={};
  (appData?.stockSizes||[]).forEach(s=>{bySize[s]=0;bySizeFree[s]=0});
  let saleQty=0,saleMoney=0,freeGiveawayQty=0,freeGiveawayLoss=0;
  let paidAmount=0,unpaidQty=0,unpaidAmount=0,pendingDeliveryQty=0;
  const slipReviewOrderIds={};
  const orderIdSet={};
  for(let i=0;i<orders.length;i++){
    const o=orders[i];
    if(!shouldCountInDashboard_(o))continue;
    const isFree=isFreeGiveawayPayment(o.paymentStatus);
    const price=Number(o.price)||0;
    const qty=Number(o.qty)||0;
    const oid=o.orderId||o.no;
    orderIdSet[oid]=1;
    if(isFree){
      freeGiveawayQty+=qty;
      freeGiveawayLoss+=price;
      if(byRegionFree[o.region]){byRegionFree[o.region].qty+=qty;byRegionFree[o.region].loss+=price}
      if(bySizeFree[o.size]!==undefined)bySizeFree[o.size]+=qty;
    }else{
      saleQty+=qty;
      saleMoney+=price;
      if(!byRegion[o.region])byRegion[o.region]={qty:0,amount:0};
      byRegion[o.region].qty+=qty;
      byRegion[o.region].amount+=price;
      if(bySize[o.size]!==undefined)bySize[o.size]+=qty;
      const ps=String(o.paymentStatus||"").trim();
      if(isPaymentVerified(ps)){
        paidAmount+=price;
      }else{
        unpaidQty+=qty;
        unpaidAmount+=price;
        if(byRegionUnpaid[o.region]){
          byRegionUnpaid[o.region].qty+=qty;
          byRegionUnpaid[o.region].amount+=price;
        }
      }
      if(ps==="รอตรวจสลิป")slipReviewOrderIds[oid]=1;
      if(normalizeOrderStatus_(o.status)===ORDER_STATUS_AWAITING){
        pendingDeliveryQty+=qty;
        if(byRegionDelivery[o.region])byRegionDelivery[o.region].qty+=qty;
      }
    }
  }
  return {
    totalShirts:saleQty,
    totalMoney:saleMoney,
    paidAmount,
    unpaidQty,
    unpaidAmount,
    unpaidByRegion:regions.map(function(r){return {region:r,qty:byRegionUnpaid[r].qty,amount:byRegionUnpaid[r].amount};}).filter(function(x){return x.qty>0;}),
    pendingSlipReviewCount:Object.keys(slipReviewOrderIds).length,
    pendingDeliveryQty,
    pendingDeliveryByRegion:regions.map(function(r){return {region:r,qty:byRegionDelivery[r].qty};}).filter(function(x){return x.qty>0;}),
    freeGiveawayQty,
    freeGiveawayLoss,
    orderCount:Object.keys(orderIdSet).length,
    regionLabels:regions,
    regionQtys:regions.map(r=>byRegion[r].qty),
    regionFreeQtys:regions.map(r=>byRegionFree[r].qty),
    regionFreeLoss:regions.map(r=>byRegionFree[r].loss),
    regionAmounts:regions.map(r=>byRegion[r].amount),
    sizeLabels:appData?.stockSizes||[],
    sizeQtys:(appData?.stockSizes||[]).map(s=>bySize[s]||0),
    sizeFreeQtys:(appData?.stockSizes||[]).map(s=>bySizeFree[s]||0),
    stock:appData?.stock||[],
    unitPrice:appData?.unitPrice||0
  };
}

function computeSalesReport(){
  const orders=appData?.orders||[];
  const regions=appData?.regions||[];
  const sizes=appData?.stockSizes||[];
  const regionAcc={};
  const regionFreeAcc={};
  regions.forEach(r=>{
    const bs={};const bf={};sizes.forEach(s=>{bs[s]=0;bf[s]=0});
    regionAcc[r]={totalQty:0,totalAmount:0,orderIds:{},bySize:bs,reportBuckets:emptyReportRegionBuckets_()};
    regionFreeAcc[r]={totalQty:0,totalLoss:0,orderIds:{},bySize:bf};
  });
  const totalReportBuckets=emptyReportRegionBuckets_();
  let totalQty=0,totalAmount=0,freeQty=0,freeLoss=0,pendingCount=0,pendingQty=0;
  const allOrderIds={};
  for(let i=0;i<orders.length;i++){
    const o=orders[i];
    if(!shouldCountInSalesReport_(o))continue;
    const oid=o.orderId||o.no;
    allOrderIds[oid]=1;
    const acc=regionAcc[o.region];
    const accFree=regionFreeAcc[o.region];
    if(isFreeGiveawayPayment(o.paymentStatus)){
      freeQty+=o.qty;
      freeLoss+=o.price;
      if(accFree){
        accFree.totalQty+=o.qty;
        accFree.totalLoss+=o.price;
        accFree.orderIds[oid]=1;
        if(accFree.bySize[o.size]!==undefined)accFree.bySize[o.size]+=o.qty;
      }
    }else{
      totalQty+=o.qty;
      totalAmount+=o.price;
      if(normalizeOrderStatus_(o.status)===ORDER_STATUS_ORDERED){pendingCount++;pendingQty+=o.qty}
      if(acc){
        acc.totalQty+=o.qty;
        acc.totalAmount+=o.price;
        acc.orderIds[oid]=1;
        if(acc.bySize[o.size]!==undefined)acc.bySize[o.size]+=o.qty;
        const bucketKey=classifyReportRegionBucket_(o);
        if(bucketKey){
          addToReportRegionBucket_(acc.reportBuckets[bucketKey],o.qty,o.price,o.size);
          addToReportRegionBucket_(totalReportBuckets[bucketKey],o.qty,o.price,o.size);
        }
      }
    }
  }
  const byRegion=regions.map(r=>({
    region:r,shortName:r,
    totalQty:regionAcc[r].totalQty,
    totalAmount:regionAcc[r].totalAmount,
    freeQty:regionFreeAcc[r].totalQty,
    freeLoss:regionFreeAcc[r].totalLoss,
    orderCount:Object.keys(regionAcc[r].orderIds).length,
    freeOrderCount:Object.keys(regionFreeAcc[r].orderIds).length,
    bySize:regionAcc[r].bySize,
    bySizeFree:regionFreeAcc[r].bySize,
    reportBuckets:regionAcc[r].reportBuckets
  }));
  const stock=appData?.stock||[];
  return {byRegion,stock,
    stockTotalRemaining:stock.reduce((s,x)=>s+x.remaining,0),
    pendingPayment:{count:pendingCount,totalQty:pendingQty},
    totals:{totalQty,totalAmount,freeQty,freeLoss,orderCount:Object.keys(allOrderIds).length,regionCount:regions.length,reportBuckets:totalReportBuckets},
    unitPrice:appData?.unitPrice||0};
}

const REPORT_REGION_BUCKET_KEYS_=["received","awaitingPickup","pendingSlip","unpaid"];
const REPORT_REGION_BUCKET_LABELS_={
  received:"รับแล้ว",
  awaitingPickup:"รอเข้ามารับ",
  pendingSlip:"รอตรวจสอบสลิป",
  unpaid:"ยังไม่ได้จ่ายเงิน"
};

function emptyReportRegionBucket_(){
  return {qty:0,amount:0,bySize:{}};
}

function emptyReportRegionBuckets_(){
  const buckets={};
  REPORT_REGION_BUCKET_KEYS_.forEach(function(k){buckets[k]=emptyReportRegionBucket_();});
  return buckets;
}

function classifyReportRegionBucket_(o){
  if(isFreeGiveawayPayment(o.paymentStatus))return null;
  if(isCartStatus(o.status||o.orderStatus))return "unpaid";
  const st=normalizeOrderStatus_(o.status||o.orderStatus);
  const ps=String(o.paymentStatus||"").trim();
  if(st===ORDER_STATUS_RECEIVED)return "received";
  if(st===ORDER_STATUS_AWAITING)return "awaitingPickup";
  if(ps==="รอตรวจสลิป")return "pendingSlip";
  if(!isPaymentVerified(ps))return "unpaid";
  return null;
}

function addToReportRegionBucket_(bucket,qty,amount,size){
  if(!bucket)return;
  const q=Number(qty)||0;
  const a=Number(amount)||0;
  bucket.qty+=q;
  bucket.amount+=a;
  const sz=String(size||"").trim();
  if(sz){
    if(bucket.bySize[sz]===undefined)bucket.bySize[sz]=0;
    bucket.bySize[sz]+=q;
  }
}

function renderReportRegionBucketSizeHtml_(bySize){
  const sizes=appData?.stockSizes||[];
  const sizeKeys=sizes.length?sizes.filter(function(s){return(bySize[s]||0)>0}):Object.keys(bySize||{}).filter(function(s){return(bySize[s]||0)>0});
  if(!sizeKeys.length)return "";
  return `<div class="order-items report-bucket-sizes">${sizeKeys.map(function(s){
    return `<span class="order-item"><span class="size-badge ${sizeClass(s)}">${escHtml(s)}</span><span class="order-item-qty">${bySize[s]}</span></span>`;
  }).join("")}</div>`;
}

function renderReportRegionBucketCell_(bucket){
  bucket=bucket||emptyReportRegionBucket_();
  const qty=Number(bucket.qty)||0;
  const amount=Number(bucket.amount)||0;
  if(qty<=0)return '<span class="text-glass-dim">-</span>';
  return `<div class="report-bucket-cell">
    <div class="report-bucket-total"><span class="font-bold">${qty}</span> ตัว</div>
    <div class="report-bucket-money">${fmtMoney(amount)} ฿</div>
    ${renderReportRegionBucketSizeHtml_(bucket.bySize)}
  </div>`;
}

function reportRegionBucketHeadersHtml_(){
  return REPORT_REGION_BUCKET_KEYS_.map(function(k){
    return `<th class="py-2 px-2 text-left report-bucket-col">${escHtml(REPORT_REGION_BUCKET_LABELS_[k])}</th>`;
  }).join("");
}

function reportRegionBucketCellsHtml_(buckets){
  buckets=buckets||emptyReportRegionBuckets_();
  return REPORT_REGION_BUCKET_KEYS_.map(function(k){
    return `<td data-label="${escAttr(REPORT_REGION_BUCKET_LABELS_[k])}" class="py-2 px-2 align-top report-bucket-col">${renderReportRegionBucketCell_(buckets[k])}</td>`;
  }).join("");
}

function paidTransferReportTitle_(){
  return "ยอดสั่งซื้อเสื้อเขต";
}

function isUnpaidTransferOrderGroup_(g){
  if(!g||isCartStatus(g.status))return false;
  if(isFreeGiveawayPayment(g.paymentStatus))return false;
  return !isPaymentVerified(g.paymentStatus);
}

function isAbnormalDuplicateEligible_(g){
  if(!g||!shouldCountInDashboard_(g))return false;
  if(isFreeGiveawayPayment(g.paymentStatus))return false;
  const ps=String(g.paymentStatus||"").trim();
  if(!isPaymentVerified(ps)&&ps!=="รอตรวจสลิป")return false;
  const amount=Number(g.totalPrice)||0;
  const qty=Number(g.totalQty)||0;
  if(amount<=0||qty<=0)return false;
  if(!normalizePayDateForInput_(g.payDate)||!normalizePayTimeForInput_(g.payTime))return false;
  return true;
}

function buildAbnormalDuplicateKey_(g){
  const amount=Number(g.totalPrice)||0;
  const qty=Number(g.totalQty)||0;
  const payDate=normalizePayDateForInput_(g.payDate)||"";
  const payTime=normalizePayTimeForInput_(g.payTime)||"";
  return amount+"|"+payDate+"|"+payTime+"|"+qty;
}

function computeAbnormalDuplicateOrders_(){
  const groups=groupOrdersByOrderId(appData?.orders||[]).filter(isAbnormalDuplicateEligible_);
  const byKey={};
  groups.forEach(function(g){
    const key=buildAbnormalDuplicateKey_(g);
    if(!byKey[key]){
      byKey[key]={
        amount:Number(g.totalPrice)||0,
        qty:Number(g.totalQty)||0,
        payDate:g.payDate,
        payTime:g.payTime,
        orders:[]
      };
    }
    byKey[key].orders.push(g);
  });
  return Object.values(byKey).filter(function(b){return b.orders.length>=2;}).sort(function(a,b){
    const da=normalizePayDateForInput_(a.payDate)||"",db=normalizePayDateForInput_(b.payDate)||"";
    if(da!==db)return da.localeCompare(db);
    const ta=normalizePayTimeForInput_(a.payTime)||"",tb=normalizePayTimeForInput_(b.payTime)||"";
    if(ta!==tb)return ta.localeCompare(tb);
    return (Number(b.amount)||0)-(Number(a.amount)||0);
  });
}

function renderAbnormalOrdersSectionHtml_(){
  const groups=computeAbnormalDuplicateOrders_();
  if(!groups.length){
    return `<p class="report-abnormal-empty text-sm text-glass-dim">ไม่พบรายการที่ผิดปกติ</p>`;
  }
  const blocks=groups.map(function(grp,idx){
    const dateLabel=formatThaiDate(grp.payDate);
    const timeLabel=formatThaiTime(grp.payTime);
    const summary=fmtMoney(grp.amount)+" ฿ · "+dateLabel+(timeLabel?" "+timeLabel:"")+" · "+grp.qty+" ตัว";
    const rows=grp.orders.map(function(g){
      const payCls=paymentStatusBadgeClass(g.paymentStatus);
      const payLabel=paymentStatusLabel(g.paymentStatus);
      return `<tr>
        <td data-label="ออเดอร์" class="py-2 px-2 font-semibold">#${escHtml(shortOrderLabel_(g.orderId))}</td>
        <td data-label="เขต" class="py-2 px-2">${escHtml(regionShort(g.region))}</td>
        <td data-label="การชำระ" class="py-2 px-2"><span class="status-badge ${payCls}">${escHtml(payLabel)}</span></td>
        <td data-label="วันที่/เวลาโอน" class="py-2 px-2">${formatThaiDateTimeCell(g.payDate,g.payTime)}</td>
        <td data-label="จำนวน" class="py-2 px-2 text-center font-bold">${g.totalQty}</td>
        <td data-label="ยอด" class="py-2 px-2 text-right">${fmtMoney(g.totalPrice)}</td>
      </tr>`;
    }).join("");
    return `<div class="report-abnormal-group">
      <div class="report-abnormal-group-head">กลุ่ม ${idx+1}: ${escHtml(summary)} · ${grp.orders.length} ออเดอร์</div>
      <div class="overflow-x-auto glass-table-wrap">
        <table class="glass-table report-abnormal-table w-full text-xs">
          <thead><tr>
            <th class="py-2 px-2 text-left">ออเดอร์</th>
            <th class="py-2 px-2 text-left">เขต</th>
            <th class="py-2 px-2 text-left">การชำระ</th>
            <th class="py-2 px-2 text-left">วันที่/เวลาโอน</th>
            <th class="py-2 px-2 text-center">จำนวน</th>
            <th class="py-2 px-2 text-right">ยอด (฿)</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join("");
  return `<div class="report-abnormal-groups">${blocks}</div>`;
}

function formatPaidTransferReportRemark_(g){
  if(shouldHideOrderNoteForViewer_(g))return "";
  return String(g&&g.note||"").trim();
}

function paidTransferShowPickupCol_(){
  return canViewAdminData();
}

function formatPaidTransferPickupCellHtml_(row,opts){
  opts=opts||{};
  if(!row)return opts.print?"-":"<span class=\"text-glass-dim\">-</span>";
  const hasPickup=!!(String(row.pickupDate||"").trim()||String(row.pickupTime||"").trim());
  const note=String(row.pickupNote||"").trim();
  if(!hasPickup&&!note)return opts.print?"-":"<span class=\"text-glass-dim\">-</span>";
  if(opts.print){
    const parts=[];
    if(hasPickup)parts.push(formatThaiDateTimeCell(row.pickupDate,row.pickupTime));
    if(note)parts.push(note);
    return escHtml(parts.join(" · "));
  }
  let display=hasPickup
    ?`<div class="text-xs">${formatThaiDateTimeCell(row.pickupDate,row.pickupTime)}</div>`
    :"";
  if(note)display+=`<div class="order-pickup-note text-xs text-glass-dim${hasPickup?" mt-1":""}">${escHtml(note)}</div>`;
  return display||"<span class=\"text-glass-dim\">-</span>";
}

function comparePaidTransferRows_(a,b){
  if(!!a.unpaid!==!!b.unpaid)return a.unpaid?1:-1;
  if(a.unpaid&&b.unpaid){
    const ta=String(a.sortKey||""),tb=String(b.sortKey||"");
    return ta.localeCompare(tb);
  }
  const da=normalizePayDateForInput_(a.payDate)||"",db=normalizePayDateForInput_(b.payDate)||"";
  if(da!==db)return da.localeCompare(db);
  const ta=normalizePayTimeForInput_(a.payTime)||"",tb=normalizePayTimeForInput_(b.payTime)||"";
  if(ta!==tb)return ta.localeCompare(tb);
  return String(a.sortKey||"").localeCompare(String(b.sortKey||""));
}

function computePaidTransferReport_(includeUnpaid){
  const regions=appData?.regions||[];
  const groups=groupOrdersByOrderId(appData?.orders||[]).filter(function(g){
    return shouldCountInDashboard_(g)&&!isFreeGiveawayPayment(g.paymentStatus);
  });
  let grandTotal=0;
  const byRegion=regions.map(function(region){
    const inRegion=groups.filter(function(g){return g.region===region;});
    const rows=[];
    inRegion.forEach(function(g){
      if(isPaymentVerified(g.paymentStatus)){
        rows.push({
          qty:g.totalQty||0,
          payDate:g.payDate||"",
          payTime:g.payTime||"",
          amount:g.totalPrice||0,
          remark:formatPaidTransferReportRemark_(g),
          pickupDate:g.pickupDate||"",
          pickupTime:g.pickupTime||"",
          pickupNote:g.pickupNote||"",
          unpaid:false,
          sortKey:String(g.timestamp||g.orderId||"")
        });
      }else if(includeUnpaid&&isUnpaidTransferOrderGroup_(g)){
        rows.push({
          qty:g.totalQty||0,
          payDate:"",
          payTime:"",
          amount:0,
          remark:formatPaidTransferReportRemark_(g),
          pickupDate:g.pickupDate||"",
          pickupTime:g.pickupTime||"",
          pickupNote:g.pickupNote||"",
          unpaid:true,
          sortKey:String(g.timestamp||g.orderId||"")
        });
      }
    });
    rows.sort(comparePaidTransferRows_);
    const totalAmount=rows.filter(function(r){return !r.unpaid;}).reduce(function(s,r){return s+(Number(r.amount)||0);},0);
    grandTotal+=totalAmount;
    return {region:region,shortName:regionShort(region),rows:rows,totalAmount:totalAmount};
  });
  return {title:paidTransferReportTitle_(),byRegion:byRegion,grandTotal:grandTotal,includeUnpaid:!!includeUnpaid};
}

function buildPaidTransferFlatRows_(data){
  const flat=[];
  (data.byRegion||[]).forEach(function(block){
    const rows=block.rows||[];
    const regionLabel=block.shortName||block.region||"";
    const totalAmount=Number(block.totalAmount)||0;
    const regionKey=String(block.region||regionLabel);
    if(!rows.length){
      flat.push({
        regionKey:regionKey,
        regionLabel:regionLabel,
        totalAmount:totalAmount,
        regionRowIndex:0,
        regionRowCount:1,
        row:null,
        empty:true
      });
      return;
    }
    rows.forEach(function(row,i){
      flat.push({
        regionKey:regionKey,
        regionLabel:regionLabel,
        totalAmount:totalAmount,
        regionRowIndex:i,
        regionRowCount:rows.length,
        row:row,
        empty:false
      });
    });
  });
  return flat;
}

function paginatePaidTransferFlatRows_(flatRows,rowsPerPage){
  const per=Math.max(1,Number(rowsPerPage)||20);
  const pages=[];
  for(let i=0;i<flatRows.length;i+=per){
    pages.push(flatRows.slice(i,i+per));
  }
  if(!pages.length)pages.push([]);
  return pages;
}

function renderPaidTransferRowCells_(item,opts){
  opts=opts||{};
  const row=item.row;
  const regionLabel=escHtml(item.regionLabel||"");
  const totalAmount=Number(item.totalAmount)||0;
  const rowspan=Math.max(1,Number(item.regionRowspan)||1);
  const showRegion=!!item.showRegion;
  const showTotal=!!item.showTotal;
  const showPickup=paidTransferShowPickupCol_();
  const alt=!!item.alt;
  const unpaid=row&&row.unpaid;
  const pickupCell=function(){
    if(!showPickup)return "";
    if(opts.print){
      return `<td ${pdfPrintCellStyle_({center:true,alt:alt})}>${item.empty?"-":formatPaidTransferPickupCellHtml_(row,{print:true})}</td>`;
    }
    return `<td class="report-transfer-pickup">${item.empty?"-":formatPaidTransferPickupCellHtml_(row)}</td>`;
  };
  if(opts.print){
    let html="";
    if(showRegion){
      html+=`<td ${pdfPrintCellStyle_({region:true,alt:alt,rowspan:rowspan})}>${regionLabel}</td>`;
    }
    if(item.empty){
      html+=`<td ${pdfPrintCellStyle_({center:true,alt:alt})}>0</td>
        <td ${pdfPrintCellStyle_({center:true,alt:alt})}>-</td>
        <td ${pdfPrintCellStyle_({center:true,alt:alt})}>-</td>
        <td ${pdfPrintCellStyle_({right:true,alt:alt})}>-</td>`;
    }else{
      html+=`<td ${pdfPrintCellStyle_({center:true,bold:unpaid,alt:alt})}>${row.qty||0}</td>
        <td ${pdfPrintCellStyle_({center:true,alt:alt})}>${unpaid?"-":escHtml(formatThaiDate(row.payDate))}</td>
        <td ${pdfPrintCellStyle_({center:true,alt:alt})}>${unpaid?"-":escHtml(formatThaiTime(row.payTime)||"-")}</td>
        <td ${pdfPrintCellStyle_({right:true,alt:alt})}>${unpaid?"-":fmtMoney(row.amount||0)}</td>`;
    }
    if(showTotal){
      html+=`<td ${pdfPrintCellStyle_({right:true,bold:true,alt:alt,rowspan:rowspan})}>${fmtMoney(totalAmount)}</td>`;
    }
    html+=pickupCell();
    if(item.empty){
      html+=`<td ${pdfPrintCellStyle_({alt:alt})}>-</td>`;
    }else{
      html+=`<td ${pdfPrintCellStyle_({alt:alt})}>${row.remark?escHtml(row.remark):""}</td>`;
    }
    return html;
  }
  let html="";
  if(showRegion){
    html+=`<td class="report-transfer-region" rowspan="${rowspan}">${regionLabel}</td>`;
  }
  if(item.empty){
    html+=`<td class="report-transfer-num">0</td>
      <td class="report-transfer-date">-</td>
      <td class="report-transfer-time">-</td>
      <td class="report-transfer-money report-transfer-num">-</td>`;
  }else{
    const qtyCls=unpaid?" report-transfer-qty-unpaid":"";
    html+=`<td class="report-transfer-num${qtyCls}">${row.qty||0}</td>
      <td class="report-transfer-date">${unpaid?"-":escHtml(formatThaiDate(row.payDate))}</td>
      <td class="report-transfer-time">${unpaid?"-":escHtml(formatThaiTime(row.payTime)||"-")}</td>
      <td class="report-transfer-money report-transfer-num">${unpaid?"-":fmtMoney(row.amount||0)}</td>`;
  }
  if(showTotal){
    html+=`<td class="report-transfer-total report-transfer-num" rowspan="${rowspan}">${fmtMoney(totalAmount)}</td>`;
  }
  html+=pickupCell();
  if(item.empty){
    html+=`<td class="report-transfer-remark">-</td>`;
  }else{
    html+=`<td class="report-transfer-remark">${row.remark?escHtml(row.remark):""}</td>`;
  }
  return html;
}

function renderPaidTransferGroupedRowsHtml_(rowItems,opts){
  opts=opts||{};
  const parts=[];
  let g=0;
  while(g<rowItems.length){
    const key=rowItems[g].regionKey;
    let span=1;
    while(g+span<rowItems.length&&rowItems[g+span].regionKey===key)span++;
    const group=rowItems.slice(g,g+span);
    group.forEach(function(item,i){
      const altCls=opts.print?"":((g+i)%2===1?" report-transfer-row-alt":"");
      const cells=renderPaidTransferRowCells_(Object.assign({},item,{
        regionRowspan:group.length,
        showRegion:i===0,
        showTotal:i===0,
        alt:opts.print?((g+i)%2===1):false
      }),opts);
      parts.push(`<tr class="report-transfer-row${altCls}">${cells}</tr>`);
    });
    g+=span;
  }
  return parts.join("");
}

function renderPaidTransferReportRowsHtml_(data,opts){
  opts=opts||{};
  return renderPaidTransferGroupedRowsHtml_(buildPaidTransferFlatRows_(data),opts);
}

function pdfPrintCellStyle_(opts){
  opts=opts||{};
  const styles={
    border:"1px solid #444",
    padding:"6px 8px",
    color:"#000000",
    background:opts.alt?"#f3f4f6":"#ffffff",
    fontFamily:"Sarabun,sans-serif",
    fontSize:"12px",
    verticalAlign:"middle"
  };
  if(opts.region){styles.fontWeight="700";styles.textAlign="center";styles.background="#eceff1";}
  if(opts.header){styles.fontWeight="700";styles.textAlign="center";styles.background="#e2efda";}
  if(opts.center)styles.textAlign="center";
  if(opts.right)styles.textAlign="right";
  if(opts.bold)styles.fontWeight="700";
  let attr='style="'+Object.keys(styles).map(function(k){
    const v=styles[k];
    const key=k.replace(/[A-Z]/g,function(m){return "-"+m.toLowerCase();});
    return key+":"+v;
  }).join(";")+'"';
  if(opts.rowspan)attr+=' rowspan="'+opts.rowspan+'"';
  return attr;
}

function paidTransferReportGrandQty_(data){
  let grandQty=0;
  (data.byRegion||[]).forEach(function(block){
    (block.rows||[]).forEach(function(row){
      if(!row.unpaid)grandQty+=Number(row.qty)||0;
    });
  });
  return grandQty;
}

function renderPaidTransferReportFootHtml_(data,opts){
  opts=opts||{};
  const grandQty=paidTransferReportGrandQty_(data);
  const grandTotal=Number(data.grandTotal)||0;
  const showPickup=paidTransferShowPickupCol_();
  const pickupFoot=showPickup
    ?(opts.print?`<td ${pdfPrintCellStyle_({center:true,header:true})}>-</td>`:`<td class="report-transfer-pickup">-</td>`)
    :"";
  if(opts.print){
    return `<tr>
      <td ${pdfPrintCellStyle_({header:true})}>รวมทั้งหมด</td>
      <td ${pdfPrintCellStyle_({header:true,center:true})}>${grandQty}</td>
      <td ${pdfPrintCellStyle_({center:true,header:true})}>-</td>
      <td ${pdfPrintCellStyle_({center:true,header:true})}>-</td>
      <td ${pdfPrintCellStyle_({right:true,header:true})}>-</td>
      <td ${pdfPrintCellStyle_({right:true,bold:true,header:true})}>${fmtMoney(grandTotal)}</td>
      ${pickupFoot}
      <td ${pdfPrintCellStyle_({header:true})}>-</td>
    </tr>`;
  }
  return `<tr class="report-transfer-foot">
    <td class="report-transfer-foot-label">รวมทั้งหมด</td>
    <td class="report-transfer-num report-transfer-foot-qty">${grandQty}</td>
    <td class="report-transfer-date">-</td>
    <td class="report-transfer-time">-</td>
    <td class="report-transfer-money">-</td>
    <td class="report-transfer-total report-transfer-num">${fmtMoney(grandTotal)}</td>
    ${pickupFoot}
    <td class="report-transfer-remark">-</td>
  </tr>`;
}

function renderPaidTransferReportTableHtml_(data,opts){
  opts=opts||{};
  data=data||{};
  const title=escHtml(data.title||paidTransferReportTitle_());
  const showPickup=paidTransferShowPickupCol_();
  const pickupHead=showPickup?(opts.print?`<th ${pdfPrintCellStyle_({header:true})}>วันที่รับ/จัดส่ง</th>`:`<th class="report-transfer-col-pickup">วันที่รับ/จัดส่ง</th>`):"";
  if(opts.print){
    const headCell=function(label){
      return `<th ${pdfPrintCellStyle_({header:true})}>${label}</th>`;
    };
    return `<table style="width:100%;border-collapse:collapse;border:1px solid #444;background:#ffffff;color:#000000;font-family:Sarabun,sans-serif;table-layout:fixed;">
      <thead><tr>
        ${headCell(title)}
        ${headCell("จำนวนที่สั่ง(ตัว)")}
        ${headCell("วันที่โอนตามสลิป")}
        ${headCell("เวลาที่โอน")}
        ${headCell("จำนวนเงิน(บาท)")}
        ${headCell("รวมยอด (บาท)")}
        ${pickupHead}
        ${headCell("หมายเหตุ")}
      </tr></thead>
      <tbody>${renderPaidTransferReportRowsHtml_(data,{print:true})}</tbody>
      <tfoot>${renderPaidTransferReportFootHtml_(data,{print:true})}</tfoot>
    </table>`;
  }
  const body=renderPaidTransferReportRowsHtml_(data);
  return `<table class="report-transfer-table">
    <thead><tr>
      <th class="report-transfer-col-region">${title}</th>
      <th class="report-transfer-col-qty">จำนวนที่สั่ง(ตัว)</th>
      <th class="report-transfer-col-date">วันที่โอนตามสลิป</th>
      <th class="report-transfer-col-time">เวลาที่โอน</th>
      <th class="report-transfer-col-money">จำนวนเงิน(บาท)</th>
      <th class="report-transfer-col-total">รวมยอด (บาท)</th>
      ${pickupHead}
      <th class="report-transfer-col-remark">หมายเหตุ</th>
    </tr></thead>
    <tbody>${body}</tbody>
    <tfoot>${renderPaidTransferReportFootHtml_(data)}</tfoot>
  </table>`;
}

function buildPaidTransferReportPrintPageHtml_(data,pageRows,pageIndex,pageCount){
  const generated=formatThaiDate(new Date())+" "+(formatThaiTime(new Date())||"");
  const black='color:#000000;font-family:Sarabun,sans-serif;';
  const pageLabel=pageCount>1?` · หน้า ${pageIndex}/${pageCount}`:"";
  const body=renderPaidTransferGroupedRowsHtml_(pageRows,{print:true});
  const headCell=function(label){
    return `<th ${pdfPrintCellStyle_({header:true})}>${label}</th>`;
  };
  const showPickup=paidTransferShowPickupCol_();
  const pickupHead=showPickup?headCell("วันที่รับ/จัดส่ง"):"";
  const table=`<table style="width:100%;border-collapse:collapse;border:1px solid #444;background:#ffffff;color:#000000;font-family:Sarabun,sans-serif;table-layout:fixed;">
      <thead><tr>
        ${headCell(data.title||paidTransferReportTitle_())}
        ${headCell("จำนวนที่สั่ง(ตัว)")}
        ${headCell("วันที่โอนตามสลิป")}
        ${headCell("เวลาที่โอน")}
        ${headCell("จำนวนเงิน(บาท)")}
        ${headCell("รวมยอด (บาท)")}
        ${pickupHead}
        ${headCell("หมายเหตุ")}
      </tr></thead>
      <tbody>${body}</tbody>
      ${pageIndex===pageCount?`<tfoot>${renderPaidTransferReportFootHtml_(data,{print:true})}</tfoot>`:""}
    </table>`;
  return `<div style="background:#ffffff;${black}padding:8px;">
    <div style="font-size:18px;font-weight:700;margin-bottom:4px;${black}">สรุปยอดโอนแล้ว · ${escHtml(data.title||paidTransferReportTitle_())}${escHtml(pageLabel)}</div>
    <div style="font-size:12px;margin-bottom:10px;${black}">พิมพ์เมื่อ ${escHtml(generated)}${data.includeUnpaid?" · รวมรายการที่ยังไม่โอน":""}</div>
    ${table}
  </div>`;
}

function buildPaidTransferReportPrintHtml_(data){
  const flat=buildPaidTransferFlatRows_(data);
  return buildPaidTransferReportPrintPageHtml_(data,flat,1,1);
}

function loadExternalScript_(url,id){
  if(id&&document.getElementById(id))return Promise.resolve();
  return new Promise(function(resolve,reject){
    const s=document.createElement("script");
    if(id)s.id=id;
    s.src=url;
    s.onload=resolve;
    s.onerror=function(){reject(new Error("โหลดไม่สำเร็จ: "+url));};
    document.head.appendChild(s);
  });
}

async function ensurePdfExportLibs_(){
  await loadExternalScript_("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js","lib-html2canvas");
  await loadExternalScript_("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js","lib-jspdf");
}

async function exportPaidTransferReportPdf_(btn){
  const includeUnpaid=!!document.getElementById("report-show-unpaid")?.checked;
  const data=computePaidTransferReport_(includeUnpaid);
  const host=document.getElementById("report-paid-transfer-print-host");
  if(!host)throw new Error("ไม่พบพื้นที่สร้าง PDF");
  await ensurePdfExportLibs_();
  const flat=buildPaidTransferFlatRows_(data);
  const pages=paginatePaidTransferFlatRows_(flat,20);
  const jsPDF=window.jspdf&&window.jspdf.jsPDF;
  if(!jsPDF)throw new Error("ไม่พบ jsPDF");
  const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  const pageW=pdf.internal.pageSize.getWidth();
  const pageH=pdf.internal.pageSize.getHeight();
  const margin=8;
  const maxW=pageW-margin*2;
  const maxHmm=pageH-margin*2;
  host.className="report-transfer-print-root";
  host.style.cssText="position:fixed;left:-10000px;top:0;width:1120px;background:#ffffff;color:#000000;padding:16px;z-index:-1;";
  host.setAttribute("aria-hidden","false");
  if(document.fonts&&document.fonts.ready)await document.fonts.ready;
  for(let pi=0;pi<pages.length;pi++){
    host.innerHTML=buildPaidTransferReportPrintPageHtml_(data,pages[pi],pi+1,pages.length);
    await new Promise(function(r){setTimeout(r,120);});
    const canvas=await html2canvas(host,{
      scale:2,
      backgroundColor:"#ffffff",
      useCORS:true,
      logging:false,
      onclone:function(doc){
        const root=doc.getElementById("report-paid-transfer-print-host");
        if(!root)return;
        root.style.background="#ffffff";
        root.style.color="#000000";
        root.querySelectorAll("th,td,div,span,table").forEach(function(el){
          el.style.color="#000000";
          el.style.webkitTextFillColor="#000000";
        });
      }
    });
    const imgW=maxW;
    let imgH=canvas.height/canvas.width*imgW;
    if(imgH>maxHmm)imgH=maxHmm;
    if(pi>0)pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/png"),"PNG",margin,margin,imgW,imgH);
  }
  host.innerHTML="";
  host.className="hidden";
  host.style.cssText="";
  host.setAttribute("aria-hidden","true");
  const stamp=new Date().toISOString().slice(0,10).replace(/-/g,"");
  pdf.save("peace_transfer_"+String(appData?.round?.year||"report")+"_"+stamp+".pdf");
}

// ── Login screen ─────────────────────────────────────────────────────
var clearLoginHeroSkeletonTimer_=clearLoginHeroSkeletonTimer_||function(){};
window.clearLoginHeroSkeletonTimer_=clearLoginHeroSkeletonTimer_;
function hideBootShell_(){
  const ph=document.getElementById("pre-header");
  const ps=document.getElementById("pre-skeleton");
  if(ph)ph.style.display="none";
  if(ps)ps.style.display="none";
}

function showBootRestoring_(){
  if(window.__bootWatchdog){clearTimeout(window.__bootWatchdog);window.__bootWatchdog=null;}
  hideBootShell_();
  document.body.classList.remove("peace-login-active");
  document.querySelector("main")?.classList.remove("peace-login-active");
  const appC=document.getElementById("app-container");
  if(appC){
    appC.classList.remove("login-app-container");
    appC.classList.add("max-w-4xl","mx-auto","p-4");
    appC.innerHTML=skeletonHtml("stock");
  }
  document.getElementById("app-header")?.classList.remove("hidden");
  setSupportFooterVisible_(true);
}

async function verifySessionForBoot_(token, attempts){
  const tries=Math.max(1,attempts||3);
  for(let i=0;i<tries;i++){
    if(i>0)await sleepMs(400*i);
    try{
      const r=await callServer("verifySession",token);
      if(r&&r.ok)return r;
      return null;
    }catch(_){}
  }
  throw new Error("verifySession unreachable");
}

function bindLoginFormEvents_(){
  const p=document.getElementById("login-password");
  if(p&&!p.dataset.peaceBound){
    p.dataset.peaceBound="1";
    p.addEventListener("keydown",e=>{if(e.key==="Enter")doLogin()});
  }
}

function stripLoginHeroLayout_(){
  document.querySelectorAll(".login-hero").forEach(el=>el.remove());
  const shell=document.querySelector(".login-shell");
  if(shell){
    shell.style.display="flex";
    shell.style.justifyContent="center";
    shell.style.maxWidth="min(92vw,30rem)";
    shell.style.margin="0 auto";
    shell.style.gridTemplateColumns="1fr";
  }
}
function hydrateLoginScreen_(errMsg){
  if(window.__bootWatchdog){clearTimeout(window.__bootWatchdog);window.__bootWatchdog=null;}
  const form=document.getElementById("login-form");
  const already=!!(form&&document.body.classList.contains("peace-login-active"));
  if(!already){
    stripLoginHeroLayout_();
    syncAppBranding_();
    document.body.classList.add("peace-login-active");
    document.querySelector("main")?.classList.add("peace-login-active");
    document.getElementById("app-header")?.classList.add("hidden");
    const c=document.getElementById("app-container");
    if(c){
      c.classList.add("login-app-container");
      c.classList.remove("max-w-4xl","mx-auto","p-4");
    }
    const supportLine=document.getElementById("login-support-line");
    if(supportLine)supportLine.innerHTML=supportContactInlineHtml_();
  }
  setSupportFooterVisible_(false);
  if(errMsg){
    const msgEl=document.getElementById("login-msg");
    if(msgEl)msgEl.innerHTML=`<span style="color:#FCA5A5">${escHtml(errMsg)}</span>`;
  }
  bindLoginFormEvents_();
  if(!window.__peaceLoginProbed_){
    window.__peaceLoginProbed_=true;
    requestAnimationFrame(()=>{try{probeApiOnLogin_();}catch(_){}});
  }
}
window.hydrateLoginScreen_=hydrateLoginScreen_;

function renderLogin(errMsg){
  const gasOnly=isGasAdminOnlyHost_();
  if(document.getElementById("login-form")&&!gasOnly){
    hydrateLoginScreen_(errMsg);
    hideBootShell_();
    return;
  }
  if(window.__bootWatchdog){clearTimeout(window.__bootWatchdog);window.__bootWatchdog=null;}
  syncAppBranding_();
  document.body.classList.add("peace-login-active");
  document.querySelector("main")?.classList.add("peace-login-active");
  document.getElementById("app-header").classList.add("hidden");
  setSupportFooterVisible_(false);
  const ghUrl=getGithubPagesUrl_();
  const c=document.getElementById("app-container");
  c.classList.add("login-app-container");
  c.classList.remove("max-w-4xl","mx-auto","p-4");
  c.innerHTML=`
    <div class="login-overlay login-screen-overlay">
      <div class="login-card">
        <div class="login-brand-block">
          <div class="login-brand-icon" aria-hidden="true"><i class="fas fa-tshirt"></i></div>
          <h1 class="login-brand-name">
            <span class="login-brand-line">${escHtml(APP_BRAND_LINE1)}</span>
            <span class="login-brand-line">${escHtml(APP_BRAND_LINE2)}</span>
          </h1>
        </div>
        <div class="login-sub">${gasOnly?"โหมดแอดมิน GAS — เฉพาะบัญชีแอดมิน":"ระบบสั่งซื้อเสื้อออนไลน์"}</div>
        ${gasOnly?`<p class="text-xs text-center mb-2 opacity-80">ผู้ใช้ทั่วไป <a href="${escHtml(ghUrl)}" style="color:#FDE68A;text-decoration:underline">เปิดแอปหลัก (GitHub Pages)</a></p>`:""}
        <form id="login-form" class="space-y-3" autocomplete="on" onsubmit="event.preventDefault();doLogin();return false;">
          <div>
            <label class="glass-label" for="login-username">ชื่อผู้ใช้</label>
            <input id="login-username" name="username" class="glass-input login-username-input" autocomplete="username" spellcheck="false" autocapitalize="off" placeholder="${gasOnly?"admin1":"เช่น admin1, user_n1 หรือ viewer"}">
          </div>
          <div>
            <label class="glass-label" for="login-password">รหัสผ่าน</label>
            <input id="login-password" name="password" type="password" class="glass-input" autocomplete="current-password" placeholder="••••••••">
          </div>
          <button id="login-btn" type="submit" class="glass-btn-primary w-full" style="padding:.75rem">
            <i class="fas fa-sign-in-alt mr-1"></i> เข้าสู่ระบบ
          </button>
          ${gasOnly?"":`<button type="button" onclick="doGuestLogin()" class="glass-btn-secondary w-full" style="padding:.75rem">
            <i class="fas fa-user-clock mr-1"></i> Log in as Guest
          </button>`}
          <p class="text-xs text-center pt-1">
            <button type="button" onclick="openUserGuideFromLogin()" class="glass-btn-secondary w-full" style="padding:.55rem">
              <i class="fas fa-book mr-1"></i> คู่มือการใช้งาน
            </button>
          </p>
          <p class="text-xs text-center login-support-line">${supportContactInlineHtml_()}</p>
          <div id="login-msg" class="text-xs text-center">${errMsg?`<span style="color:#FCA5A5">${escHtml(errMsg)}</span>`:''}</div>
        </form>
      </div>
    </div>`;
  stripLoginHeroLayout_();
  bindLoginFormEvents_();
  if(!window.__peaceLoginProbed_){
    window.__peaceLoginProbed_=true;
    requestAnimationFrame(()=>{try{probeApiOnLogin_();}catch(_){}});
  }
}

function openUserGuideFromLogin(){
  if(typeof app!=="undefined"&&app&&me&&!document.getElementById("app-header").classList.contains("hidden")){
    app.navigate("guide");
    return;
  }
  openUserGuideInNewTab_();
}

async function doLogin(){
  const u=(document.getElementById("login-username")?.value||"").trim();
  const p=(document.getElementById("login-password")?.value||"").trim();
  const btn=document.getElementById("login-btn");
  const msg=document.getElementById("login-msg");
  if(!u||!p){if(msg)msg.innerHTML='<span style="color:#FCA5A5">กรอกชื่อผู้ใช้และรหัสผ่าน</span>';return}
  if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin mr-1"></i> กำลังเข้าสู่ระบบ...'}
  try{
    const res=await callServer("login",u,p);
    if(isGasAdminOnlyHost_()&&String(res.role||"").trim()!=="admin"){
      throw new Error("โหมด GAS ใช้ได้เฉพาะแอดมิน — ผู้ใช้ทั่วไปให้ใช้งานผ่าน GitHub Pages");
    }
    guestMode=false;
    authToken=res.token;
    me=normalizeMeClient_({username:res.username,role:res.role,region:res.region,displayName:res.displayName});
    syncWindowSession_();
    persistAuthToken_(authToken);
    bootApp();
  }catch(e){
    if(msg)msg.innerHTML=`<span style="color:#FCA5A5">${escHtml(e.message||"เข้าสู่ระบบไม่สำเร็จ")}</span>`;
    if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-sign-in-alt mr-1"></i> เข้าสู่ระบบ'}
  }
}

function doGuestLogin(){
  guestMode=true;
  authToken=null;
  me={username:"guest",role:"guest",region:"",displayName:"Guest"};
  clearAuthToken_();
  bootApp();
}

function openChangePasswordModal(){
  if(isGuest()||!authToken)return;
  const existing=document.getElementById("change-password-modal");
  if(existing)existing.remove();
  const html=`
    <div class="login-overlay" id="change-password-modal">
      <div class="login-card" style="max-width:400px">
        <div class="login-title"><i class="fas fa-key mr-1" style="color:#F59E0B"></i>เปลี่ยนรหัสผ่าน</div>
        <p class="login-sub text-xs">บัญชี: ${escHtml(me&&me.username||"")} · แต่ละเขตเปลี่ยนรหัสของตัวเองได้</p>
        <div class="space-y-2">
          <div>
            <label class="glass-label">รหัสผ่านปัจจุบัน *</label>
            <input id="pwd-change-current" type="password" class="glass-input" autocomplete="current-password">
          </div>
          <div>
            <label class="glass-label">รหัสผ่านใหม่ *</label>
            <input id="pwd-change-new" type="password" class="glass-input" autocomplete="new-password" placeholder="อย่างน้อย 4 ตัว">
          </div>
          <div>
            <label class="glass-label">ยืนยันรหัสผ่านใหม่ *</label>
            <input id="pwd-change-confirm" type="password" class="glass-input" autocomplete="new-password">
          </div>
          <div class="grid grid-cols-2 gap-2 mt-2">
            <button type="button" onclick="closeChangePasswordModal()" class="glass-btn-secondary py-2">ยกเลิก</button>
            <button type="button" id="pwd-change-submit" onclick="submitChangePassword(this)" class="glass-btn-primary py-2">บันทึก</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML("beforeend",html);
  setTimeout(()=>document.getElementById("pwd-change-current")?.focus(),50);
}

function closeChangePasswordModal(){
  const m=document.getElementById("change-password-modal");
  if(m)m.remove();
}

async function submitChangePassword(btn){
  const cur=String(document.getElementById("pwd-change-current")?.value||"").trim();
  const np=String(document.getElementById("pwd-change-new")?.value||"").trim();
  const cf=String(document.getElementById("pwd-change-confirm")?.value||"").trim();
  if(!cur||!np||!cf){
    if(typeof app!=="undefined"&&app.showMsg)app.showMsg("กรอกข้อมูลให้ครบ","error");
    else alert("กรอกข้อมูลให้ครบ");
    return;
  }
  if(np.length<4){
    if(typeof app!=="undefined"&&app.showMsg)app.showMsg("รหัสผ่านใหม่ต้องอย่างน้อย 4 ตัว","error");
    else alert("รหัสผ่านใหม่ต้องอย่างน้อย 4 ตัว");
    return;
  }
  if(np!==cf){
    if(typeof app!=="undefined"&&app.showMsg)app.showMsg("รหัสผ่านใหม่กับยืนยันไม่ตรงกัน","error");
    else alert("รหัสผ่านใหม่กับยืนยันไม่ตรงกัน");
    return;
  }
  try{
    await runSaving({btn:btn,busyText:"กำลังบันทึก…"},()=>callAuthed("changeOwnPassword",cur,np));
    closeChangePasswordModal();
    if(typeof app!=="undefined"&&app.showMsg)app.showMsg("เปลี่ยนรหัสผ่านแล้ว — ครั้งถัดไปใช้รหัสใหม่","success");
    else alert("เปลี่ยนรหัสผ่านแล้ว");
  }catch(e){
    const msg=e&&e.message||"เปลี่ยนรหัสผ่านไม่สำเร็จ";
    if(typeof app!=="undefined"&&app.showMsg)app.showMsg(msg,"error");
    else alert(msg);
  }
}

async function doLogout(){
  if(!confirm("ออกจากระบบ?"))return;
  const t=authToken;
  stopRealtimePoll_();
  guestMode=false;
  authToken=null;me=null;appData=null;appDataStale=true;prefetchPromise=null;
  resetNotifyState_();
  clearAuthToken_();
  try{await callServer("logout",t)}catch(_){}
  renderLogin();
}

function bootApp(){
  if(typeof clearLoginHeroSkeletonTimer_!=="function"){
    clearLoginHeroSkeletonTimer_=function(){};
    window.clearLoginHeroSkeletonTimer_=clearLoginHeroSkeletonTimer_;
  }
  if(window.__bootWatchdog){clearTimeout(window.__bootWatchdog);window.__bootWatchdog=null;}
  hideBootShell_();
  document.body.classList.remove("peace-login-active");
  document.querySelector("main")?.classList.remove("peace-login-active");
  const appC=document.getElementById("app-container");
  if(appC){
    appC.classList.remove("login-app-container");
    appC.classList.add("max-w-4xl","mx-auto","p-4");
  }
  document.getElementById("app-header").classList.remove("hidden");
  syncAppBranding_();
  setSupportFooterVisible_(true);
  notifyBaselineReady_=false;
  orderNotifySnapshot_=null;
  loadNotifyList_();
  initNotifyPanelDismiss_();
  renderUserChip();
  app.renderNav();
  app.container.innerHTML=skeletonHtml("stock");
  appDataStale=true;prefetchPromise=null;
  startRealtimePoll_();
  prefetchAppData().then(()=>app.navigate("stock"))
    .catch(async e=>{
      if(isSessionReloginMessage(e&&e.message)){
        if(await verifySessionAlive_()){
          app.container.innerHTML=`<div class="glass-msg-error text-center font-semibold">${escHtml(e&&e.message||"โหลดข้อมูลไม่สำเร็จ")}</div>`;
          return;
        }
        authToken=null;me=null;appData=null;appDataStale=true;prefetchPromise=null;
        syncWindowSession_();
        clearAuthToken_();
        renderLogin("กรุณาเข้าสู่ระบบใหม่");
        return;
      }
      app.container.innerHTML=`<div class="glass-msg-error text-center font-semibold">${escHtml(e&&e.message||"โหลดข้อมูลไม่สำเร็จ")}</div>`;
    });
}

function renderUserChip(){
  const chip=document.getElementById("user-info-chip");
  if(!chip||!me)return;
  const roleCls=me.role==="admin"?"role-badge-admin":(isEngineer()?"role-badge-engineer":(isEngReadonly()?"role-badge-eng-readonly":(isViewer()?"role-badge-user":(isGuest()?"role-badge-guest":"role-badge-user"))));
  const roleLabel=me.role==="admin"?"แอดมิน":(isEngineer()?`${ROLE_ENGINEER_LABEL} (แอดมินรอง)`:(isEngReadonly()?ROLE_ENG_READONLY_LABEL:(isViewer()?"ผู้ดูข้อมูล":(isGuest()?"Guest":"ผู้ใช้"))));
  const regionLabel=canViewAllRegions()?(isEngineer()?`ดูทุกเขต · สั่ง ${me.region||""}`:(isEngReadonly()?`ดูทุกเขต (${ROLE_ENG_READONLY_LABEL})`:(isViewer()?"ดูทุกเขต (อ่านอย่างเดียว)":"ทุกเขต"))):(isGuest()?"ดูสต็อกเท่านั้น":me.region);
  chip.className="user-chip";
  const pwdBtn=!isGuest()&&authToken
    ?`<button onclick="openChangePasswordModal()" title="เปลี่ยนรหัสผ่าน" class="chip-logout" type="button"><i class="fas fa-key"></i></button>`
    :"";
  chip.innerHTML=`<span class="${roleCls}">${roleLabel}</span><span class="chip-name" style="font-weight:700">${escHtml(me.displayName||me.username)}</span><span class="chip-region">${escHtml(regionLabel)}</span>${pwdBtn}<button onclick="doLogout()" title="ออกจากระบบ" class="chip-logout" type="button"><i class="fas fa-sign-out-alt"></i></button>`;
  renderNotifyBell_();
}

// ── App controller ───────────────────────────────────────────────────
const app = {
  container: null,
  currentModule: "stock",

  renderNav(){
    const nav=document.getElementById("nav-tabs");
    if(!nav)return;
    nav.innerHTML=NAV.filter(n=>{
      if(isGuest())return n.id==="stock"||n.guestOk;
      if(isReadOnlyUser()&&n.id==="orders")return false;
      if(n.id==="orders"&&!canCreateNewOrders_())return false;
      return !n.adminOnly||isAdmin();
    }).map(n=>
      `<button class="nav-tab ${this.currentModule===n.id?"active":""}" onclick="app.navigate('${n.id}')"><i class="fas ${n.icon} mr-1"></i>${n.label}</button>`).join("");
  },

  async navigate(module, forceRefresh){
    if(isGuest()&&module!=="stock"&&module!=="guide")module="stock";
    if(isReadOnlyUser()&&module==="orders")module="list";
    if(module==="orders"&&!canCreateNewOrders_()){
      this.showMsg("ปิดรับสั่งซื้อชั่วคราว — ดูรายการและแนบสลิปออเดอร์เดิมได้","warning");
      module="list";
    }
    if(module==="admin"&&!isAdmin())module="stock";
    if(module==="guide"){
      this.currentModule=module;
      updateRealtimePollForModule_(module);
      this.renderNav();
      this.paintModule(module);
      return;
    }
    this.currentModule=module;
    updateRealtimePollForModule_(module);
    this.renderNav();
    const fresh=appData&&!appDataStale&&!forceRefresh;
    if(!fresh)this.container.innerHTML=skeletonHtml(module);
    try{
      await ensureAppData(forceRefresh);
    }catch(e){
      if(isSessionReloginMessage(e.message)){
        if(await verifySessionAlive_()){
          this.container.innerHTML=`<div class="glass-msg-error text-center font-semibold">${escHtml(e.message||"โหลดข้อมูลไม่สำเร็จ")}</div>`;
          return;
        }
        authToken=null;me=null;
        syncWindowSession_();
        clearAuthToken_();
        renderLogin("กรุณาเข้าสู่ระบบใหม่");
        return;
      }
      this.container.innerHTML=`<div class="glass-msg-error text-center font-semibold">${escHtml(e.message||"โหลดข้อมูลไม่สำเร็จ")}</div>`;
      return;
    }
    // Paint + per-module init are isolated so a single module's failure can
    // never blank the nav (admin/settings tabs) or the whole app shell.
    try{ this.paintModule(module); }
    catch(e){ this.container.innerHTML=`<div class="glass-msg-error text-center font-semibold">${escHtml(e.message||"แสดงผลไม่สำเร็จ")}</div>`; }
    try{
      if(module==="orders")this.initOrderForm();
      else if(module==="list")this.fillOrderListBody();
      else if(module==="dashboard")await this.initDashboard();
      else if(module==="report")this.initReport();
      else if(module==="admin")await this.initAdmin();
    }catch(e){
      this.showMsg&&this.showMsg(e.message||"เกิดข้อผิดพลาดในการแสดงผล","error");
    }
  },

  paintModule(module){
    this.closeDropdownPanel();
    const content=document.createElement("div");
    content.className="fade-in space-y-4";
    switch(module){
      case "stock":content.innerHTML=this.renderStock();break;
      case "orders":content.innerHTML=this.renderOrderForm();break;
      case "list":content.innerHTML=this.renderOrderList();break;
      case "dashboard":content.innerHTML=this.renderDashboard();break;
      case "report":content.innerHTML=this.renderReport();break;
      case "admin":content.innerHTML=this.renderAdmin();break;
      case "guide":content.innerHTML=this.renderGuide();break;
      default:content.innerHTML=this.renderStock();
    }
    this.container.innerHTML="";
    this.container.appendChild(content);
  },

  renderGuide(){
    const htmlUrl=escHtml(getUserGuideHtmlUrl_());
    const pdfUrl=escHtml(getUserGuidePdfUrl_());
    return `
      <div class="glass-card p-4">
        <div class="flex flex-wrap justify-between items-center gap-2 mb-3 border-b glass-divider pb-2">
          <h2 class="text-lg font-bold glass-section-title"><i class="fas fa-book mr-1"></i>คู่มือผู้ใช้ (User)</h2>
          <div class="flex flex-wrap gap-2 text-xs">
            <button type="button" onclick="openUserGuideInNewTab_()" class="glass-btn-secondary py-2 px-3"><i class="fas fa-external-link-alt mr-1"></i>เปิดแท็บใหม่</button>
            <a href="${pdfUrl}" target="_blank" rel="noopener" class="glass-btn-primary py-2 px-3" style="text-decoration:none;display:inline-flex;align-items:center"><i class="fas fa-file-pdf mr-1"></i>ดาวน์โหลด PDF</a>
          </div>
        </div>
        <p class="text-xs text-glass-dim mb-2">ตั้งแต่เข้าสู่ระบบ → สั่งเสื้อ → ชำระเงิน · เปลี่ยนรหัสผ่านได้ที่ปุ่ม 🔑 มุมขวาบน</p>
        <iframe class="guide-frame" title="คู่มือผู้ใช้ ${escAttr(APP_BRAND_FULL)}" src="${htmlUrl}"></iframe>
      </div>
      <div id="msg-box"></div>`;
  },

  // ── Stock view ─────────────────────────────────────────────────────
  renderGuestStock(){
    const round=appData.round, stock=appData.stock||[], sizeChartRows=appData.sizeChart||[];
    const displayImage=pickRoundDisplayImage_(round);
    const stockHeader=stock.map(s=>`<th class="stock-cell"><span class="size-badge ${sizeClass(s.size)}">${s.size}</span></th>`).join("");
    const remainRow=stock.map(s=>{
      const cls=s.remaining<=5?"text-red-glass font-bold":"text-green-glass font-bold";
      const out=s.remaining<=0;
      return `<td class="stock-cell ${cls}">${out?'<span class="text-red-glass">หมด</span>':s.remaining}</td>`;
    }).join("");
    const chartRows=sizeChartRows.map(r=>`<tr><td class="py-2 px-3"><span class="size-badge ${sizeClass(r.size)}">${r.size}</span></td><td class="py-2 px-3 text-center">${r.chest}</td><td class="py-2 px-3 text-center">${r.length}</td></tr>`).join("");
    const stockMobileCards=stock.map(s=>{
      const low=s.remaining<=5;
      const remainCls=low?"text-red-glass":"text-green-glass";
      const out=s.remaining<=0;
      return `<div class="stock-mobile-card ${low?'low':''}">
        <div class="flex justify-between items-center"><span class="size-badge ${sizeClass(s.size)}">${s.size}</span><span class="font-bold ${remainCls}" style="font-size:1.1rem">${out?'หมด':s.remaining}</span></div>
      </div>`;
    }).join("");
    const totalRemain=stock.reduce((sum,s)=>sum+Number(s.remaining||0),0);
    return `
      <div class="glass-card p-4 mb-3">
        <div class="text-sm text-glass"><i class="fas fa-eye mr-1"></i> โหมด Guest — ดูได้เฉพาะ <b>รูปเสื้อ</b>, <b>จำนวนคงเหลือ</b> และ <b>ตารางไซส์</b> <button onclick="renderLogin()" class="glass-btn-secondary text-xs ml-2" style="padding:.25rem .5rem">เข้าสู่ระบบ</button></div>
      </div>
      <div class="glass-card">
        <div class="glass-card-header stock-card-header stock-card-header--solo">
          <h1 class="text-lg font-bold">${escHtml(round.name||"เสื้อชมรมวิศวกร")}</h1>
        </div>
        <div class="p-4">
          <div class="stock-image-section">
            <div class="stock-image-wrap glass-image-wrap">
              ${isPlaceholderImage(displayImage)
                ? `<div class="stock-image-placeholder flex flex-col items-center justify-center py-8 text-glass" style="opacity:.8"><i class="fas fa-tshirt text-6xl mb-2"></i><p class="text-sm font-semibold">ยังไม่มีรูปเสื้อ</p></div>`
                : `<img id="stock-shirt-image" data-image-ref="${escHtml(round.imageRef||round.imageUrl||"")}" src="${displayImage}" alt="เสื้อ" loading="lazy" onload="app.onShirtImageLoaded(this,false)" onerror="app.onShirtImageError(this,false)" class="stock-shirt-img">`}
            </div>
          </div>
        </div>
      </div>
      <div class="glass-card p-4">
        <h2 class="font-bold glass-section-title mb-3"><i class="fas fa-boxes mr-1"></i> จำนวนเสื้อคงเหลือ (รวม ${totalRemain} ตัว)</h2>
        <div class="stock-desktop-view overflow-x-auto glass-table-wrap">
          <table class="stock-table w-full text-sm">
            <thead><tr><th class="text-left px-2">ไซส์</th>${stockHeader}</tr></thead>
            <tbody><tr class="glass-row-remain"><td class="px-2 font-bold text-green-glass whitespace-nowrap">คงเหลือ</td>${remainRow}</tr></tbody>
          </table>
        </div>
        <div class="stock-mobile-grid">${stockMobileCards}</div>
      </div>
      <div class="glass-card p-4">
        <h2 class="font-bold glass-section-title mb-3"><i class="fas fa-ruler mr-1"></i> ตารางไซส์ (Warrix)</h2>
        <div class="overflow-x-auto glass-table-wrap">
          <table class="glass-table w-full text-sm">
            <thead><tr><th class="py-2 px-3 text-left">ขนาด</th><th class="py-2 px-3 text-center">รอบอก</th><th class="py-2 px-3 text-center">ยาว</th></tr></thead>
            <tbody>${chartRows||'<tr><td colspan="3" class="text-center py-4 text-glass-dim">ไม่มีข้อมูลตารางไซส์</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div id="msg-box"></div>`;
  },

  renderStock(){
    if(isGuest())return this.renderGuestStock();
    const round=appData.round, stock=appData.stock, sizeChartRows=appData.sizeChart;
    const displayImage=pickRoundDisplayImage_(round);
    const stockHeader=stock.map(s=>`<th class="stock-cell"><span class="size-badge ${sizeClass(s.size)}">${s.size}</span></th>`).join("");
    const deliveredRow=stock.map(s=>`<td class="stock-cell font-semibold">${s.delivered}</td>`).join("");
    const soldRow=stock.map(s=>`<td class="stock-cell text-orange-glass">${s.sold}</td>`).join("");
    const remainRow=stock.map(s=>{
      const out=s.remaining<=0;
      const cls=out||s.remaining<=5?"text-red-glass font-bold":"text-green-glass font-bold";
      return `<td class="stock-cell ${cls}">${stockRemainingDisplay_(s.remaining)}</td>`;
    }).join("");
    const chartRows=sizeChartRows.map(r=>`<tr><td class="py-2 px-3"><span class="size-badge ${sizeClass(r.size)}">${r.size}</span></td><td class="py-2 px-3 text-center">${r.chest}</td><td class="py-2 px-3 text-center">${r.length}</td></tr>`).join("");
    const stockMobileCards=stock.map(s=>{
      const out=s.remaining<=0;
      const low=out||s.remaining<=5;
      const remainCls=low?"text-red-glass":"text-green-glass";
      return `<div class="stock-mobile-card ${low?'low':''}">
        <div class="flex justify-between items-center" style="margin-bottom:.35rem"><span class="size-badge ${sizeClass(s.size)}">${s.size}</span><span class="font-bold ${remainCls}" style="font-size:1.1rem">${stockRemainingDisplay_(s.remaining)}${out?"":`<span class="text-xs opacity-70">/${s.delivered}</span>`}</span></div>
        <div class="row"><span class="lbl">มาส่ง</span><span class="val">${s.delivered}</span></div>
        <div class="row"><span class="lbl">สั่งแล้ว</span><span class="val text-orange-glass">${s.sold}</span></div>
        <div class="row"><span class="lbl">คงเหลือ</span><span class="val ${remainCls}">${stockRemainingDisplay_(s.remaining)}</span></div>
      </div>`;
    }).join("");
    const adminUpload=isAdmin()?`<label for="stock-shirt-upload" class="stock-header-upload glass-btn-primary text-xs cursor-pointer"><i class="fas fa-camera"></i> <span class="hidden sm:inline">เปลี่ยนรูป</span></label><input id="stock-shirt-upload" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,image/bmp" class="hidden" onchange="app.uploadShirtImageInline(this)">`:"";
    const guestNote=isGuest()?`<div class="glass-card p-4"><div class="text-sm text-glass"><i class="fas fa-info-circle mr-1"></i> โหมด Guest: ดูจำนวนเสื้อคงเหลือได้เท่านั้น</div></div>`:"";
    const guestActions=isGuest()?"":`<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${canCreateNewOrders_()?`<button onclick="app.navigate('orders')" class="glass-btn-primary py-3"><i class="fas fa-plus-circle mr-1"></i> สั่งซื้อเสื้อ</button>`:""}
        <button onclick="app.navigate('list')" class="glass-btn-secondary py-3"><i class="fas fa-list mr-1"></i> ดูรายการ (${appData.orders.length})</button>
      </div>`;
    const orderingClosedNote=!isGuest()&&!canCreateNewOrders_()&&isRegionalOrderUser_()
      ?`<div class="glass-card p-4"><div class="text-sm text-glass"><i class="fas fa-lock mr-1"></i> ปิดรับสั่งซื้อชั่วคราว — ดูข้อมูลและแนบสลิปออเดอร์เดิมที่ยังไม่ชำระได้ตามปกติ</div></div>`
      :"";
    const guestSizeChart=isGuest()?"":`<div class="glass-card p-4">
        <h2 class="font-bold glass-section-title mb-3"><i class="fas fa-ruler mr-1"></i> ตารางไซส์ (Warrix)</h2>
        <div class="overflow-x-auto glass-table-wrap">
          <table class="glass-table w-full text-sm">
            <thead><tr><th class="py-2 px-3 text-left">ขนาด</th><th class="py-2 px-3 text-center">รอบอก</th><th class="py-2 px-3 text-center">ยาว</th></tr></thead>
            <tbody>${chartRows}</tbody>
          </table>
        </div>
      </div>`;
    return `
      ${guestNote}
      ${orderingClosedNote}
      <div class="glass-card">
        <div class="glass-card-header stock-card-header">
          <div class="stock-card-title"><div class="text-xs opacity-80">รอบปี ${round.year}</div><h1 class="text-lg font-bold">${escHtml(round.name)}</h1></div>
          <div class="stock-card-meta">
            <div class="stock-card-price"><div class="text-xs opacity-80">ราคา</div><div class="text-xl font-bold">${fmtMoney(round.unitPrice)} ฿</div></div>
            ${adminUpload}
          </div>
        </div>
        <div class="p-4">
          <div class="stock-image-section">
            <div class="stock-image-wrap glass-image-wrap">
              ${isPlaceholderImage(displayImage)
                ? `<div class="stock-image-placeholder flex flex-col items-center justify-center py-8 text-glass" style="opacity:.8"><i class="fas fa-tshirt text-6xl mb-2"></i><p class="text-sm font-semibold">ยังไม่มีรูปเสื้อ</p></div>`
                : `<img id="stock-shirt-image" data-image-ref="${escHtml(round.imageRef||round.imageUrl||"")}" src="${displayImage}" alt="เสื้อ" loading="lazy" onload="app.onShirtImageLoaded(this,false)" onerror="app.onShirtImageError(this,false)" class="stock-shirt-img">`}
            </div>
          </div>
        </div>
      </div>
      <div class="glass-card p-4">
        <h2 class="font-bold glass-section-title mb-3"><i class="fas fa-boxes mr-1"></i> สรุปสต็อก รอบปี ${round.year}</h2>
        <div class="stock-desktop-view overflow-x-auto glass-table-wrap">
          <table class="stock-table w-full text-sm">
            <thead><tr><th class="text-left px-2">รายการ</th>${stockHeader}</tr></thead>
            <tbody>
              <tr><td class="px-2 font-semibold text-glass-muted whitespace-nowrap">จำนวนที่มาส่ง</td>${deliveredRow}</tr>
              <tr><td class="px-2 font-semibold text-glass-muted whitespace-nowrap">สั่งแล้ว</td>${soldRow}</tr>
              <tr class="glass-row-remain"><td class="px-2 font-bold text-green-glass whitespace-nowrap">คงเหลือ</td>${remainRow}</tr>
            </tbody>
          </table>
        </div>
        <div class="stock-mobile-grid">${stockMobileCards}</div>
      </div>
      ${guestSizeChart}
      ${guestActions}
      <div id="msg-box"></div>`;
  },

  // ── Order form (multi-size) ────────────────────────────────────────
  renderOrderForm(){
    const isAdm=isAdmin();
    if(!canCreateNewOrders_()){
      return `<div class="glass-card p-5">
        <h2 class="text-lg font-bold glass-section-title mb-3"><i class="fas fa-lock mr-1"></i>ปิดรับสั่งซื้อชั่วคราว</h2>
        <p class="text-sm text-glass">ไม่สามารถสั่งซื้อใหม่ได้ในขณะนี้ — เปิดหน้า <button type="button" class="glass-btn-secondary text-xs" style="padding:.25rem .5rem" onclick="app.navigate('list')">รายการสั่งซื้อ</button> เพื่อดูออเดอร์เดิมและแนบสลิป</p>
      </div><div id="msg-box"></div>`;
    }
    let regionField;
    if(isAdm){
      let opts='<option value="">-- เลือกเขตที่สั่ง --</option>';
      appData.regions.forEach(r=>{opts+=`<option value="${escHtml(r)}">${escHtml(r)}</option>`});
      regionField=`<select id="order-region" class="glass-select">${opts}</select>`;
    }else{
      regionField=`<input id="order-region" class="glass-input glass-input-readonly" value="${escHtml(me.region)}" readonly><input id="order-region-hidden" type="hidden" value="${escHtml(me.region)}">`;
    }
    const sizeRows=appData.stock.map(s=>{
      const out=s.remaining<=0;
      return `<tr>
        <td><span class="size-badge ${sizeClass(s.size)}">${s.size}</span></td>
        <td>${out?'<span class="text-red-glass">หมด</span>':s.remaining}</td>
        <td>
          <button class="qty-btn" onclick="app.changeMultiQty('${s.size}',-1)" ${out?'disabled':''}>−</button>
          <span class="qty-value" id="mq-${s.size}">0</span>
          <button class="qty-btn" onclick="app.changeMultiQty('${s.size}',1)" ${out?'disabled':''}>+</button>
        </td>
        <td><span id="mp-${s.size}">0</span></td>
      </tr>`;
    }).join("");
    return `
      <div class="glass-card p-5">
        <h2 class="text-lg font-bold glass-section-title mb-4 border-b glass-divider pb-2"><i class="fas fa-plus-circle mr-1"></i>สั่งซื้อเสื้อ (สั่งหลายไซส์)</h2>
        ${renderTransferAccountBlock_()}
        <div class="space-y-3">
          <div>
            <label class="glass-label">เขตที่สั่ง *</label>
            ${regionField}
          </div>
          <div>
            <label class="glass-label">เลือกไซส์และจำนวน *</label>
            <div class="glass-table-wrap">
              <table class="order-size-table">
                <thead><tr><th>ไซส์</th><th>คงเหลือ</th><th>จำนวน</th><th>ราคา (฿)</th></tr></thead>
                <tbody>${sizeRows}</tbody>
                <tfoot>
                  <tr style="background:rgba(127,29,29,.3);font-weight:700">
                    <td colspan="2" style="text-align:right;padding-right:.75rem">รวมทั้งหมด:</td>
                    <td><span id="multi-total-qty">0</span> ตัว</td>
                    <td><span id="multi-total-price">0</span> ฿</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <p class="text-xs text-glass-dim">วันที่/เวลาสั่งซื้อบันทึกอัตโนมัติ</p>
          <div>
            <label class="glass-label">เบอร์ติดต่อ</label>
            <input id="order-contact" type="tel" class="glass-input text-sm" maxlength="30" inputmode="tel" placeholder="เช่น 081-234-5678">
          </div>
          ${isAdm?"":`<p class="text-xs text-glass-dim -mt-1">เพิ่มลงตะกร้าก่อน แล้วไปแก้ไข/ยืนยันส่งออเดอร์ที่รายการสั่งซื้อ</p>`}
          <div>
            <label class="glass-label">สลิปโอนเงิน (อัพโหลดตามหลังได้ในหน้ารายการสั่งซื้อ)</label>
            <input id="order-slip-file" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,image/bmp" class="glass-input p-2 text-xs">
            <div id="order-slip-preview" class="mt-2" style="display:none"></div>
            <div id="order-slip-datetime-wrap" class="mt-2" style="display:none">
              ${buildSlipDateTimeFieldsHtml_("new-order",todayStr(),nowTimeStr())}
            </div>
            <p class="text-xs text-glass-dim mt-1">แนบสลิปพร้อมวันที่/เวลาโอนได้เลย หรือแนบทีหลังที่รายการสั่งซื้อ</p>
          </div>
          <div>
            <label class="glass-label">หมายเหตุ (ไม่บังคับ)</label>
            <input id="order-note" type="text" class="glass-input text-sm" maxlength="120" placeholder="เช่น ชื่อผู้รับ, รายละเอียดเพิ่มเติม">
          </div>
          <div class="submit-bar">
            <button onclick="app.submitMultiSizeOrder(this)" class="w-full glass-btn-primary py-3">
              <i class="fas fa-${isAdm?"save":"cart-plus"} mr-1"></i> ${isAdm?"ยืนยันสั่งซื้อ":"เพิ่มลงตะกร้า"}
            </button>
          </div>
        </div>
      </div>
      <div id="msg-box"></div>`;
  },

  initOrderForm(){
    this.multiQtys={};
    appData.stockSizes.forEach(s=>{this.multiQtys[s]=0});
    this.updateMultiTotals();
    bindSlipDateTimePicker_("new-order");
    const dtWrap=document.getElementById("order-slip-datetime-wrap");
    bindSlipFilePreview_("order-slip-file","order-slip-preview",function(hasFile){
      if(dtWrap)dtWrap.style.display=hasFile?"block":"none";
    });
  },

  changeMultiQty(size,delta){
    if(!this.multiQtys)this.multiQtys={};
    const s=appData.stock.find(x=>x.size===size);
    if(!s)return;
    const cur=this.multiQtys[size]||0;
    const next=Math.max(0,Math.min(s.remaining,cur+delta));
    this.multiQtys[size]=next;
    const qEl=document.getElementById("mq-"+size);
    if(qEl)qEl.textContent=next;
    const pEl=document.getElementById("mp-"+size);
    if(pEl)pEl.textContent=fmtMoney(next*(appData.unitPrice||0));
    this.updateMultiTotals();
  },

  updateMultiTotals(){
    let q=0,p=0;
    const u=appData?.unitPrice||0;
    Object.keys(this.multiQtys||{}).forEach(s=>{q+=this.multiQtys[s];p+=this.multiQtys[s]*u});
    const qEl=document.getElementById("multi-total-qty");
    const pEl=document.getElementById("multi-total-price");
    if(qEl)qEl.textContent=q;
    if(pEl)pEl.textContent=fmtMoney(p);
  },

  async submitMultiSizeOrder(btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    if(!canCreateNewOrders_())return this.showMsg("ปิดรับสั่งซื้อชั่วคราว","warning");
    try{
      const items=Object.keys(this.multiQtys||{}).filter(s=>this.multiQtys[s]>0).map(s=>({size:s,qty:this.multiQtys[s]}));
      if(items.length===0)return this.showMsg("กรุณาเลือกอย่างน้อย 1 ไซส์","error");
      const region=isAdmin()
        ? document.getElementById("order-region").value
        : (document.getElementById("order-region-hidden")?.value||me.region);
      if(!region||region==="*")return this.showMsg("กรุณาเลือกเขต","error");
      const payload={
        region:region,
        items:items,
        note:(document.getElementById("order-note")?.value||"").trim(),
        contactPhone:normalizeContactPhoneInput_(document.getElementById("order-contact")?.value||"")
      };
      const slipFile=document.getElementById("order-slip-file")?.files?.[0];
      let payDate="",payTime="";
      if(slipFile){
        payDate=String(document.getElementById("slip-pay-date-new-order")?.value||"").trim();
        payTime=String(document.getElementById("slip-pay-time-new-order")?.value||"").trim();
        if(!payDate||!payTime)return this.showMsg("กรุณากรอกวันที่และเวลาโอน","error");
      }
      const total=items.reduce((s,x)=>s+x.qty,0);
      const result=await runSaving({btn:btn,busyText:"กำลังบันทึกออเดอร์…"},async()=>{
        const r=await callAuthed("addMultiSizeOrder",payload);
        if(r&&r.orderId)muteNotifyForOrder_(r.orderId,120000,isAdmin()?"admin":"user");
        if(slipFile){
          try{
            const base64=await prepareImageBase64ForUpload_(slipFile);
            const slipRes=await callAuthedWithTimeout(RPC_POST_TIMEOUT_MS,"uploadOrderImage",r.orderId,base64,payDate,payTime,slipFile.name);
            applyLocalOrderCreate_(r,payload,items);
            applyLocalOrderSlipUpdate_(r.orderId,slipRes);
            appDataStale=false;
            return Object.assign({},r,slipRes);
          }catch(slipErr){
            try{await callAuthed("deleteOrderByOrderId",r.orderId);}catch(_){}
            applyLocalOrderDelete_(r.orderId);
            throw slipErr;
          }
        }
        applyLocalOrderCreate_(r,payload,items);
        appDataStale=false;
        return r;
      });
      let okMsg=isAdmin()
        ?`บันทึกออเดอร์ #${shortOrderLabel_(result&&result.orderId||"")} ${total} ตัว (${items.length} ไซส์) เรียบร้อย`
        :`เพิ่มลงตะกร้า #${shortOrderLabel_(result&&result.orderId||"")} ${total} ตัว (${items.length} ไซส์) แล้ว — ไปรายการสั่งซื้อเพื่อแก้ไขหรือยืนยันส่งออเดอร์`;
      if(slipFile)okMsg+=" · บันทึกสลิปแล้ว รอแอดมินตรวจสอบ";
      this.showMsg(okMsg,"success");
      if(result&&result.warning){
        setTimeout(()=>this.showMsg(result.warning,"warning"),900);
      }
      refreshAfterMutation_({ keepLocal: true });
      app.navigate("list");
    }catch(e){
      const msg=e&&e.message||"บันทึกไม่สำเร็จ";
      if(isSessionReloginMessage(msg) && await verifySessionAlive_()){
        this.showMsg("บันทึกออเดอร์แล้ว แต่รีเฟรชข้อมูลไม่สำเร็จ กรุณาเปิดรายการสั่งซื้ออีกครั้ง","warning");
        return;
      }
      this.showMsg(msg,"error");
    }
  },

  // ── Order list (grouped by orderId) ─────────────────────────────────
  renderOrderList(){
    const grouped=sortOrderGroupsForList_(groupOrdersByOrderId((appData&&Array.isArray(appData.orders))?appData.orders:[]));
    let filterOpts='<option value="all">ทุกเขต</option>';
    appData.regions.forEach(r=>{filterOpts+=`<option value="${escHtml(r)}">${escHtml(r)}</option>`});
    const showFilter=canViewAllRegions();
    const canAdd=canCreateNewOrders_();
    const body=grouped.length===0
      ? '<tr><td colspan="'+orderListColSpan_()+'" class="text-center py-8 text-glass-dim">ยังไม่มีรายการสั่งซื้อ</td></tr>'
      : "";
    const searchHtml=`<input id="list-search" type="search" class="glass-input order-list-search p-2 text-sm" placeholder="เลขออเดอร์ / วันที่สั่ง" oninput="app.filterList()" aria-label="ค้นหาออเดอร์">`;
    const paymentFilterHtml=`<select id="list-payment-filter" onchange="app.filterList()" class="glass-select order-list-filter p-2 text-sm" aria-label="กรองตามการชำระเงิน">${orderListPaymentFilterOptionsHtml_()}</select>`;
    const filterHtml=showFilter
      ?`<select id="list-filter" onchange="app.filterList()" class="glass-select order-list-filter p-2 text-sm">${filterOpts}</select>`
      :"";
    const addBtn=canAdd
      ?`<button type="button" onclick="app.navigate('orders')" class="order-list-add glass-btn-primary text-xs"><i class="fas fa-plus"></i><span>เพิ่ม</span></button>`
      :"";
    return `
      <div class="glass-card p-4 order-list-card">
        <div class="order-list-toolbar border-b glass-divider pb-3 mb-3">
          <div class="order-list-heading">
            <h2 class="text-lg font-bold glass-section-title order-list-title"><i class="fas fa-list mr-1"></i>รายการสั่งซื้อ</h2>
            <span class="order-list-count">${grouped.length} ออเดอร์</span>
          </div>
          <div class="order-list-actions">${searchHtml}${filterHtml}${paymentFilterHtml}${addBtn}</div>
        </div>
        <div class="order-list-table-wrap overflow-x-auto glass-table-wrap">
          <table class="glass-table w-full text-xs" id="order-table">
            <thead><tr>
              <th class="py-2 px-2">ออเดอร์</th>
              <th class="py-2 px-2">เขต</th>
              <th class="py-2 px-2">รายการ</th>
              <th class="py-2 px-2">รวม</th>
              <th class="py-2 px-2">วันที่สั่ง</th>
              <th class="py-2 px-2">สถานะ</th>
              <th class="py-2 px-2">สลิปชำระ</th>
              <th class="py-2 px-2">ชำระเงิน</th>
              ${canViewAdminData()?'<th class="py-2 px-2">วันที่รับ/จัดส่ง</th>':""}
              <th class="py-2 px-1"></th>
            </tr></thead>
            <tbody id="order-tbody">${body}</tbody>
            <tfoot id="order-list-summary"></tfoot>
          </table>
        </div>
        ${renderTransferAccountBlock_({compact:true})}
      </div>
      <div id="msg-box"></div>`;
  },

  async refreshCurrentView_(opts){
    opts=opts||{};
    const m=this.currentModule;
    if(m==="list"){
      if(opts.keepLocal&&document.getElementById("order-tbody"))return;
      if(!document.getElementById("order-tbody")){
        this.paintModule("list");
      }
      this.fillOrderListBody();
      this.applyListFilter();
      return;
    }
    if(m==="guide"){
      if(opts.keepLocal)return;
      this.paintModule(m);
      return;
    }
    if(m==="orders"){
      if(opts.keepLocal&&document.getElementById("order-region"))return;
      this.paintModule(m);
      this.initOrderForm();
      return;
    }
    if(m==="admin"){
      if(opts.keepLocal&&document.getElementById("admin-users-list"))return;
      this.paintModule(m);
      if(isAdmin())await this.initAdmin();
      return;
    }
    if(m==="stock"){
      this.paintModule(m);
      return;
    }
    if(m==="dashboard"){
      if(opts.keepLocal&&document.getElementById("dash-cards"))return;
      this.paintModule("dashboard");
      await this.initDashboard();
      return;
    }
    if(m==="report"){
      if(opts.keepLocal&&document.getElementById("report-paid-transfer-table-host"))return;
      if(!document.getElementById("report-cards")){
        this.paintModule("report");
      }
      await this.initReport();
      return;
    }
  },

  fillOrderListBody(){
    const tbody=document.getElementById("order-tbody");
    if(!tbody)return;
    const orders=(appData&&Array.isArray(appData.orders))?appData.orders:[];
    const grouped=sortOrderGroupsForList_(groupOrdersByOrderId(orders));
    if(grouped.length===0){
      tbody.innerHTML='<tr><td colspan="'+orderListColSpan_()+'" class="text-center py-8 text-glass-dim">ยังไม่มีรายการสั่งซื้อ</td></tr>';
      updateOrderListSummary_();
      return;
    }
    // Render each order group independently so one malformed order can never
    // blank the entire list (a single thrown row would otherwise empty it).
    tbody.innerHTML=grouped.map(g=>{
      try{return this.orderGroupRowHtml(g);}
      catch(e){
        const oid=escHtml((g&&g.orderId)||"?");
        return `<tr data-region="${escHtml((g&&g.region)||"")}" data-order-search="${escAttr(buildOrderSearchHaystack_(g))}"><td colspan="${orderListColSpan_()}" class="py-2 px-2 text-xs text-red-glass">#${oid} แสดงผลไม่สำเร็จ</td></tr>`;
      }
    }).join("");
    this.applyListFilter();
  },

  orderGroupRowHtml(g){
    const inCart=isCartStatus(g.status);
    const statusCls=statusClass(g.status);
    const canEditStatus=isAdmin();
    const ownsOrder=ownsOrderRegion(g);
    const canEditOrder=canUserEditOrderGroup(g,ownsOrder);
    const canEditNote=canEditOrderNote_(g,ownsOrder);
    const canDeleteOrder=canUserDeleteOrderGroup(g,ownsOrder);
    const showEditBtn=canEditOrder||canEditNote;
    const itemsLabel=formatOrderListItemsPlain_(g.items);
    const canManageSlip=canManageOrderSlip_(g,ownsOrder);
    const slipSafeId=ddSafeId(g.orderId);
    let slipCell;
    if(g.slipUrl){
      slipCell=`<div class="order-slip-actions">
        <button class="glass-btn-secondary text-xs" style="padding:.3rem .55rem" onclick="app.viewOrderImage('${escHtml(g.orderId)}',this)"><i class="fas fa-eye"></i> ดูสลิป</button>
        ${canManageSlip?`<button class="glass-btn-secondary text-xs" style="padding:.3rem .55rem" onclick="app.openSlipUploadModal('${escHtml(g.orderId)}',true)"><i class="fas fa-upload"></i> เปลี่ยนสลิป</button>`:""}
        <div class="text-xs text-glass-dim mt-1">โอน: ${formatThaiDateTimeCell(g.payDate,g.payTime)}</div>
      </div>`;
    }else if(canManageSlip){
      slipCell=`<button class="glass-btn-secondary text-xs" style="padding:.3rem .55rem" onclick="app.openSlipUploadModal('${escHtml(g.orderId)}',false)"><i class="fas fa-upload"></i> แนบสลิป+วันที่โอน</button>`;
    }else{
      slipCell='<span class="text-glass-dim text-xs">-</span>';
    }
    const payCls=paymentStatusBadgeClass(g.paymentStatus);
    const payLabel=paymentStatusLabel(g.paymentStatus);
    let paymentCell=`<span class="inline-block px-2 py-1 rounded-lg text-xs ${payCls}" style="border:1px solid rgba(255,255,255,.25)">${escHtml(payLabel)}</span>`;
    if(isAdmin()&&!isFreeGiveawayPayment(g.paymentStatus)&&!isPaymentVerified(g.paymentStatus)){
      paymentCell+=`<div class="mt-1 flex flex-wrap gap-1 justify-center">
        ${g.slipUrl?`<button class="glass-btn-secondary text-xs" style="padding:.3rem .55rem" onclick="app.openPaymentReviewModal('${escHtml(g.orderId)}')"><i class="fas fa-${String(g.paymentStatus||"")==="รอตรวจสลิป"?"check-double":"search"}"></i> ${String(g.paymentStatus||"")==="รอตรวจสลิป"?"ตรวจ/ยอมรับ":"ตรวจสอบ"}</button>`:""}
        <button class="glass-btn text-xs" style="padding:.3rem .55rem;background:rgba(109,40,217,.45)" onclick="app.markOrderFreeGiveaway('${escHtml(g.orderId)}',this)" title="ผู้บริหาร/แจกฟรี — ไม่รวมยอดสั่งซื้อ"><i class="fas fa-gift"></i> เสื้อแจกฟรี</button>
      </div>`;
    }
    const noteBlock=renderOrderNoteBlock_(g,ownsOrder);
    const contactBlock=renderOrderContactBlock_(g);
    const cartConfirmBtn=inCart&&canEditOrder&&canCreateNewOrders_()
      ?`<div class="mt-2 flex flex-wrap gap-1 justify-center">
          <button class="glass-btn-primary text-xs" style="padding:.35rem .55rem" onclick="app.submitCartToAdmin('${escHtml(g.orderId)}',this)"><i class="fas fa-paper-plane"></i> ยืนยันส่งออเดอร์</button>
        </div>`
      :"";
    const canEditOrderRow=showEditBtn&&(isAdmin()||canCreateNewOrders_());
    const showPickupEdit=isAdmin()&&canViewAdminData();
    const showRowEditBtn=canEditOrderRow||showPickupEdit;
    const canDeleteRow=canDeleteOrder&&(isAdmin()||canCreateNewOrders_());
    const orderStatusHints=!showEditBtn
      ?(isPaymentLocked(g.paymentStatus)?`<div class="mt-1 text-xs text-glass-dim">${isFreeGiveawayPayment(g.paymentStatus)?"เสื้อแจกฟรี — แก้ไข/ลบได้เฉพาะแอดมิน":"ชำระเงินแล้ว — แก้ไข/ลบได้เฉพาะแอดมิน"}</div>`
        :(isUserLockedOrderStatus(g.status)?`<div class="mt-1 text-xs text-glass-dim">ล็อกแล้ว — ติดต่อแอดมิน</div>`:""))
      :"";
    const editBtn=showRowEditBtn
      ?`<button type="button" onclick="openOrderListRowEdit_('${escHtml(g.orderId)}',this)" class="glass-btn-secondary" title="แก้ไข" style="padding:.35rem .55rem"><i class="fas fa-pencil-alt"></i></button>`
      :"";
    const deleteBtn=canDeleteRow
      ?`<button onclick="app.removeOrderGroup('${escHtml(g.orderId)}',${inCart?"true":"false"},this)" class="glass-btn-danger" title="ลบออเดอร์" style="padding:.35rem .55rem"><i class="fas fa-trash"></i></button>`
      :"";
    const rowActions=(editBtn||deleteBtn)
      ?`<div class="order-row-actions flex flex-wrap gap-1 justify-center items-center">${editBtn}${deleteBtn}</div>`
      :`<span class="text-glass-dim text-xs">-</span>`;
    const shortId=shortOrderLabel_(g.orderId);
    return `
      <tr data-region="${escHtml(g.region)}" data-order-id="${escAttr(g.orderId)}" data-order-search="${escAttr(buildOrderSearchHaystack_(g))}" data-payment-status="${escAttr(paymentStatusLabel(g.paymentStatus).toLowerCase())}">
        <td data-label="ออเดอร์" class="py-2 px-2 text-center font-bold" title="${escAttr(g.orderId)}">#${escHtml(shortId)}</td>
        <td data-label="เขต" class="py-2 px-2">${escHtml(regionShort(g.region))}</td>
        <td data-label="รายการ" class="py-2 px-2">${itemsLabel}</td>
        <td data-label="รวม" class="py-2 px-2 text-center"><div class="font-bold">${g.totalQty} ตัว</div>${isFreeGiveawayPayment(g.paymentStatus)?`<div class="text-xs" style="color:#C4B5FD">แจกฟรี (ไม่รวมยอดสั่งซื้อ)</div>`:`<div class="text-xs opacity-80">${fmtMoney(g.totalPrice)} ฿</div>`}</td>
        <td data-label="วันที่สั่ง" class="py-2 px-2 text-center text-xs">${formatOrderTimestampCell(g.timestamp)}</td>
        <td data-label="สถานะ" class="py-2 px-2 text-center">
          ${canEditStatus
            ? buildGlassDropdown({ddId:"order-status-dd-"+ddSafeId(g.orderId),valueInputId:"order-status-val-"+ddSafeId(g.orderId),value:normalizeOrderStatus_(g.status)||ORDER_STATUS_ORDERED,options:(appData?.pickupStatus||ADMIN_ORDER_STATUS_OPTS),compact:true,statusCls:statusCls,onSelect:(val)=>app.changeGroupStatus(g.orderId,val)})
            : `<span class="inline-block px-2 py-1 rounded-lg text-xs ${statusCls}" style="border:1px solid rgba(255,255,255,.25)">${escHtml(g.status||orderCartStatus())}</span>`}
          ${contactBlock}
          ${noteBlock}
          ${cartConfirmBtn}
          ${orderStatusHints}
        </td>
        <td data-label="สลิปชำระ" class="py-2 px-2 text-center">${slipCell}</td>
        <td data-label="ชำระเงิน" class="py-2 px-2 text-center">${paymentCell}</td>
        ${canViewAdminData()?`<td data-label="วันที่รับ/จัดส่ง" class="py-2 px-2 text-center">${renderPickupDeliveryCell_(g)}</td>`:""}
        <td data-label="จัดการ" class="py-2 px-1 text-center">${rowActions}</td>
      </tr>`;
  },

  filterList(){
    clearTimeout(listFilterTimer);
    listFilterTimer=setTimeout(()=>this.applyListFilter(),FILTER_DEBOUNCE_MS);
  },

  applyListFilter(){
    const regionEl=document.getElementById("list-filter");
    const region=regionEl?regionEl.value:"all";
    const payment=String(document.getElementById("list-payment-filter")?.value||"all").trim().toLowerCase();
    const query=(document.getElementById("list-search")?.value||"").trim().toLowerCase();
    const rows=document.querySelectorAll("#order-table tbody tr[data-region]");
    let visible=0;
    rows.forEach(tr=>{
      const matchRegion=region==="all"||tr.getAttribute("data-region")===region;
      const matchPayment=payment==="all"||(tr.getAttribute("data-payment-status")||"")===payment;
      const haystack=tr.getAttribute("data-order-search")||"";
      const matchSearch=!query||haystack.indexOf(query)>-1;
      const show=matchRegion&&matchPayment&&matchSearch;
      tr.style.display=show?"":"none";
      if(show)visible++;
    });
    const tbody=document.getElementById("order-tbody");
    if(!tbody)return;
    let emptyRow=document.getElementById("order-list-filter-empty");
    const filteredOut=rows.length>0&&visible===0;
    if(filteredOut){
      if(!emptyRow){
        emptyRow=document.createElement("tr");
        emptyRow.id="order-list-filter-empty";
        tbody.appendChild(emptyRow);
      }
      const hasAdvancedFilter=region!=="all"||payment!=="all";
      emptyRow.innerHTML='<td colspan="'+orderListColSpan_()+'" class="text-center py-8 text-glass-dim">'+
        (query?"ไม่พบออเดอร์ที่ค้นหา":(hasAdvancedFilter?"ไม่พบออเดอร์ตามตัวกรองที่เลือก":"ไม่พบออเดอร์"))+'</td>';
      emptyRow.style.display="";
    }else if(emptyRow){
      emptyRow.remove();
    }
    updateOrderListSummary_();
  },

  async changeGroupStatus(orderId,status){
    if(!isAdmin()){
      this.showMsg("เฉพาะแอดมินเท่านั้นที่เปลี่ยนสถานะได้","error");
      return;
    }
    const ordersInGroup=(appData?.orders||[]).filter(o=>o.orderId===orderId);
    const prev=ordersInGroup.length?(ordersInGroup[0].orderStatus||ordersInGroup[0].status):status;
    applyLocalOrderStatusUpdate_(orderId,status);
    refreshAfterOrderListMutation_(orderId,{recalcStock:false});
    try{
      await runSaving({busyText:"กำลังอัปเดตสถานะ…",toast:false},()=>callAuthed("updateOrderStatusByOrderId",orderId,status));
      this.showMsg("อัปเดตสถานะออเดอร์แล้ว","success");
      refreshAfterOrderListMutation_(orderId,{recalcStock:false,syncServer:true});
    }catch(e){
      applyLocalOrderStatusUpdate_(orderId,prev);
      refreshAfterOrderListMutation_(orderId,{recalcStock:false});
      this.showMsg(e.message,"error");
    }
  },

  async removeOrderGroup(orderId,inCart,btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    const msg=inCart===true||inCart==="true"
      ?"ลบออเดอร์ในตะกร้านี้ทั้งหมด?"
      :"ลบออเดอร์นี้ทั้งหมด? (ไม่สามารถกู้คืนได้)";
    if(!confirm(msg))return;
    const snap=snapshotOrderGroup_(orderId);
    applyLocalOrderDelete_(orderId);
    recalcStockFromOrders();
    refreshAfterOrderListMutation_(orderId,{recalcStock:false,removed:true});
    try{
      await runSaving({btn:btn,btnText:"",busyText:"กำลังลบออเดอร์…"},()=>callAuthed("deleteOrderByOrderId",orderId));
      this.showMsg("ลบออเดอร์แล้ว","success");
      scheduleBackgroundBootstrapSync_();
    }catch(e){
      restoreOrderGroupSnapshot_(orderId,snap);
      recalcStockFromOrders();
      refreshAfterOrderListMutation_(orderId,{recalcStock:false});
      this.showMsg(e.message,"error");
    }
  },

  // ── Per-order slip + transfer date/time ─────────────────────────────
  showSlipModalMsg(msg,type){
    notifyUser_(msg,type);
    const el=document.getElementById("slip-modal-msg");
    if(!el){this.showMsg(msg,type);return;}
    el.className="text-sm text-center mt-2 font-semibold fade-in modal-inline-msg " +
      (type==="success"?"glass-msg-success":(type==="warning"?"glass-msg-success":"glass-msg-error"));
    el.style.display="block";
    el.textContent=type==="warning"?"⚠️ "+msg:msg;
  },

  clearSlipModalMsg(){
    const el=document.getElementById("slip-modal-msg");
    if(el){el.style.display="none";el.textContent="";}
  },

  openSlipUploadModal(orderId,isReplace){
    const self=this;
    setTimeout(function(){self._openSlipUploadModalNow_(orderId,isReplace);},0);
  },
  _openSlipUploadModalNow_(orderId,isReplace){
    if(typeof app!=="undefined"&&app&&typeof app.closeDropdownPanel==="function")app.closeDropdownPanel();
    const orderGroup=groupOrdersByOrderId(appData?.orders||[]).find(g=>g.orderId===orderId);
    if(!orderGroup)return this.showMsg("ไม่พบออเดอร์","error");
    const ownsOrder=ownsOrderRegion(orderGroup);
    if(!canManageOrderSlip_(orderGroup,ownsOrder)){
      const msg=isPaymentLocked(orderGroup.paymentStatus)
        ?"ออเดอร์ชำระเงินแล้ว แก้ไขสลิปได้เฉพาะแอดมิน"
        :"ไม่มีสิทธิ์แก้ไขสลิปของออเดอร์นี้";
      return this.showMsg(msg,"warning");
    }
    this.closeSlipUploadModal();
    const safeOid=ddSafeId(orderId);
    const initDate=normalizePayDateForInput_(orderGroup.payDate)||todayStr();
    const initTime=normalizePayTimeForInput_(orderGroup.payTime)||nowTimeStr();
    const html=`
      <div class="login-overlay slip-upload-overlay" id="slip-upload-modal" onclick="if(event.target===this)app.closeSlipUploadModal()">
        <div class="login-card slip-upload-card" style="max-width:520px" onclick="event.stopPropagation()">
          <div class="login-title">${isReplace?"เปลี่ยนสลิป":"แนบสลิปชำระเงิน"} #${escHtml(shortOrderLabel_(orderId))}</div>
          <p class="login-sub text-xs">วันที่สั่ง: ${formatOrderTimestampCell(orderGroup.timestamp)} · กรอกวันที่/เวลาที่โอนตามสลิป</p>
          <div class="slip-upload-body space-y-2">
            <div><label class="glass-label">รูปสลิป *</label><input id="slip-file-${safeOid}" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,image/bmp" class="glass-input p-2 text-xs"></div>
            <p class="text-xs text-glass-dim">รองรับไฟล์ใหญ่ (สูงสุด ~28 MB) — ระบบย่อรูปอัตโนมัติก่อนส่ง · แนะนำ JPG/PNG</p>
            <div id="slip-preview-${safeOid}" style="display:none"></div>
            ${buildSlipDateTimeFieldsHtml_(safeOid,initDate,initTime)}
            <div id="slip-modal-msg" class="modal-inline-msg text-sm text-center mt-2 font-semibold" style="display:none" role="alert"></div>
          </div>
          <div class="slip-modal-actions grid grid-cols-2 gap-2">
            <button type="button" onclick="app.closeSlipUploadModal()" class="glass-btn-secondary py-2">ยกเลิก</button>
            <button type="button" onclick="app.submitSlipUpload('${escHtml(orderId)}',this)" class="glass-btn-primary py-2">บันทึกสลิป</button>
          </div>
        </div>
      </div>`;
    const wrap=document.createElement("div");
    wrap.innerHTML=html;
    document.body.appendChild(wrap.firstElementChild);
    const escHandler=function(e){if(e.key==="Escape")app.closeSlipUploadModal();};
    document.addEventListener("keydown",escHandler);
    const m=document.getElementById("slip-upload-modal");
    if(m){
      m._escHandler=escHandler;
      m._previewKey="slip-preview-"+safeOid;
    }
    bindSlipDateTimePicker_(safeOid);
    bindSlipFilePreview_("slip-file-"+safeOid,"slip-preview-"+safeOid);
  },

  closeSlipUploadModal(){
    const m=document.getElementById("slip-upload-modal");
    if(m&&m._previewKey)revokeSlipPreviewUrl_(m._previewKey);
    if(m&&m._escHandler)document.removeEventListener("keydown",m._escHandler);
    if(m)m.remove();
  },

  openPickupModal(orderId){
    if(!isAdmin())return this.showMsg("เฉพาะแอดมินเท่านั้น","warning");
    if(typeof app!=="undefined"&&app&&typeof app.closeDropdownPanel==="function")app.closeDropdownPanel();
    const self=this;
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){self._openPickupModalNow_(orderId);});
    });
  },
  _openPickupModalNow_(orderId){
    const orderGroup=groupOrdersByOrderId(appData?.orders||[]).find(g=>g.orderId===orderId);
    if(!orderGroup)return this.showMsg("ไม่พบออเดอร์","error");
    this.closePickupModal();
    const safeOid=ddSafeId(orderId);
    const hasExistingPickup=!!(String(orderGroup.pickupDate||"").trim()||String(orderGroup.pickupTime||"").trim());
    const initDate=hasExistingPickup?(normalizePayDateForInput_(orderGroup.pickupDate)||""):"";
    const initTime=hasExistingPickup?(normalizePayTimeForInput_(orderGroup.pickupTime)||""):"";
    const initNote=String(orderGroup.pickupNote||"");
    const deliveryModeDefault=normalizeOrderStatus_(orderGroup.status)===ORDER_STATUS_SHIPPED?"จัดส่ง":"มารับ";
    const dtFieldsHtml=hasExistingPickup
      ?`<div id="pickup-dt-wrap-${safeOid}">${buildPickupDateTimeFieldsHtml_(safeOid,initDate,initTime)}</div>`
      :`<div id="pickup-dt-wrap-${safeOid}" style="display:none"></div>
            <button type="button" id="pickup-dt-toggle-${safeOid}" onclick="app.showPickupDateTimeFields('${escHtml(orderId)}')" class="glass-btn-secondary text-xs py-2 w-full"><i class="fas fa-calendar-plus"></i> ระบุวันที่/เวลา (ไม่บังคับ)</button>`;
    const html=`
      <div class="login-overlay slip-upload-overlay" id="pickup-modal">
        <div class="login-card slip-upload-card" style="max-width:520px" onclick="event.stopPropagation()">
          <div class="login-title">วันที่เข้ามารับ/จัดส่ง #${escHtml(shortOrderLabel_(orderId))}</div>
          <p class="login-sub text-xs">บันทึกหมายเหตุอย่างเดียวได้ · ถ้าระบุวันที่/เวลา ระบบจะตั้งสถานะเป็น <b>จัดส่งแล้ว</b> หรือ <b>ได้รับแล้ว</b> อัตโนมัติ</p>
          <div class="slip-upload-body space-y-2">
            <div>
              <span class="glass-label">ประเภท</span>
              <div class="grid grid-cols-2 gap-2 mt-1">
                <label class="glass-radio-card"><input type="radio" name="pickup-mode-${safeOid}" value="มารับ"${deliveryModeDefault==="มารับ"?" checked":""}> เข้ามารับ</label>
                <label class="glass-radio-card"><input type="radio" name="pickup-mode-${safeOid}" value="จัดส่ง"${deliveryModeDefault==="จัดส่ง"?" checked":""}> จัดส่ง</label>
              </div>
            </div>
            ${dtFieldsHtml}
            <div>
              <label class="glass-label" for="pickup-note-${safeOid}">หมายเหตุ (ไม่บังคับ)</label>
              <textarea id="pickup-note-${safeOid}" class="glass-input text-sm cart-edit-note-input" rows="3" placeholder="เช่น ผู้มารับ, จุดส่ง, EMS tracking">${escHtml(initNote)}</textarea>
            </div>
            <div id="pickup-modal-msg" class="modal-inline-msg text-sm text-center mt-2 font-semibold" style="display:none" role="alert"></div>
          </div>
          <div class="slip-modal-actions grid grid-cols-2 gap-2">
            <button type="button" onclick="app.closePickupModal()" class="glass-btn-secondary py-2">ยกเลิก</button>
            <button type="button" onclick="app.submitPickupDelivery('${escHtml(orderId)}',this)" class="glass-btn-primary py-2">บันทึก</button>
          </div>
        </div>
      </div>`;
    const wrap=document.createElement("div");
    wrap.innerHTML=html;
    document.body.appendChild(wrap.firstElementChild);
    const escHandler=function(e){if(e.key==="Escape")app.closePickupModal();};
    document.addEventListener("keydown",escHandler);
    const m=document.getElementById("pickup-modal");
    if(m){
      m._escHandler=escHandler;
      m._openedAt=Date.now();
      m.addEventListener("click",function(e){
        if(e.target!==m)return;
        if(Date.now()-m._openedAt<400)return;
        app.closePickupModal();
      });
    }
    if(hasExistingPickup)bindPickupDateTimePicker_(safeOid);
  },
  showPickupDateTimeFields(orderId){
    if(!isAdmin())return;
    const safeOid=ddSafeId(orderId);
    const wrap=document.getElementById("pickup-dt-wrap-"+safeOid);
    const toggle=document.getElementById("pickup-dt-toggle-"+safeOid);
    if(!wrap||wrap.querySelector(".glass-datetime-panel"))return;
    wrap.style.display="block";
    wrap.innerHTML=buildPickupDateTimeFieldsHtml_(safeOid,todayStr(),nowTimeStr());
    if(toggle)toggle.style.display="none";
    bindPickupDateTimePicker_(safeOid);
  },
  closePickupModal(){
    const m=document.getElementById("pickup-modal");
    if(m&&m._escHandler)document.removeEventListener("keydown",m._escHandler);
    if(m)m.remove();
  },
  showPickupModalMsg(msg,type){
    const el=document.getElementById("pickup-modal-msg");
    if(!el)return;
    el.style.display="block";
    el.className="modal-inline-msg text-sm text-center mt-2 font-semibold "+(type==="error"?"text-red-glass":"text-green-glass");
    el.textContent=msg;
  },
  async submitPickupDelivery(orderId,btn){
    if(!isAdmin())return;
    const safeOid=ddSafeId(orderId);
    const pickupFields=getPickupDateTimeFieldValues_(safeOid);
    const pickupDate=pickupFields.date;
    const pickupTime=pickupFields.time;
    const pickupNote=String(document.getElementById("pickup-note-"+safeOid)?.value||"").trim();
    const deliveryMode=String(document.querySelector('input[name="pickup-mode-'+safeOid+'"]:checked')?.value||"มารับ").trim();
    const hasDateTime=!!(pickupDate&&pickupTime);
    if(!hasDateTime&&!pickupNote)return this.showPickupModalMsg("กรุณาระบุหมายเหตุ หรือวันที่และเวลา","error");
    const snap=snapshotOrderGroup_(orderId);
    const nextStatus=hasDateTime?(deliveryMode==="จัดส่ง"?ORDER_STATUS_SHIPPED:ORDER_STATUS_RECEIVED):null;
    const localPatch=hasDateTime
      ?{pickupDate:pickupDate,pickupTime:pickupTime,pickupNote:pickupNote,status:nextStatus}
      :{pickupNote:pickupNote};
    applyLocalOrderPickupUpdate_(orderId,localPatch);
    this.closePickupModal();
    refreshAfterOrderListMutation_(orderId,{recalcStock:false});
    await new Promise(function(r){setTimeout(r,0);});
    try{
      const res=await runSaving({btn:btn,busyText:"กำลังบันทึก…"},async()=>{
        return await callAuthed("updateOrderPickupByOrderId",orderId,pickupDate,pickupTime,pickupNote,deliveryMode);
      });
      applyLocalOrderPickupUpdate_(orderId,res);
      refreshAfterOrderListMutation_(orderId,{recalcStock:false,syncServer:true});
      this.showMsg(hasDateTime
        ?("บันทึกวันที่รับ/จัดส่งแล้ว · สถานะ: "+escHtml(res.status||nextStatus))
        :"บันทึกหมายเหตุรับ/จัดส่งแล้ว","success");
    }catch(e){
      restoreOrderGroupSnapshot_(orderId,snap);
      refreshAfterOrderListMutation_(orderId,{recalcStock:false});
      this.showMsg(e.message||"บันทึกไม่สำเร็จ","error");
    }
  },

  async submitSlipUpload(orderId,btn){
    const safeOid=ddSafeId(orderId);
    const file=document.getElementById("slip-file-"+safeOid)?.files?.[0];
    const payDate=String(document.getElementById("slip-pay-date-"+safeOid)?.value||"").trim();
    const payTime=String(document.getElementById("slip-pay-time-"+safeOid)?.value||"").trim();
    this.clearSlipModalMsg();
    if(!file)return this.showSlipModalMsg("กรุณาเลือกรูปสลิป","error");
    if(!payDate||!payTime)return this.showSlipModalMsg("กรุณากรอกวันที่และเวลาโอน","error");
    muteNotifyForOrder_(orderId,120000,"user");
    const snap=snapshotOrderGroup_(orderId);
    applyLocalOrderSlipUpdate_(orderId,{payDate:payDate,payTime:payTime,paymentStatus:"รอตรวจสลิป"});
    this.closeSlipUploadModal();
    refreshAfterOrderListMutation_(orderId,{recalcStock:false});
    await new Promise(function(r){setTimeout(r,0);});
    try{
      const res=await runSaving({btn:btn,busyText:"กำลังบันทึกสลิป…"},async()=>{
        const base64=await prepareImageBase64ForUpload_(file,function(status){
          if(typeof app!=="undefined"&&app&&app.showMsg)app.showMsg(status,"warning");
        });
        return await callAuthedWithTimeout(RPC_POST_TIMEOUT_MS,"uploadOrderImage",orderId,base64,payDate,payTime,file.name);
      });
      applyLocalOrderSlipUpdate_(orderId,res);
      refreshAfterOrderListMutation_(orderId,{recalcStock:false,syncServer:true});
      this.showMsg("บันทึกสลิปแล้ว รอแอดมินตรวจสอบ","success");
    }catch(e){
      restoreOrderGroupSnapshot_(orderId,snap);
      refreshAfterOrderListMutation_(orderId,{recalcStock:false});
      this.showMsg(e.message||"บันทึกสลิปไม่สำเร็จ","error");
    }
  },

  async openPaymentReviewModal(orderId){
    const g=groupOrdersByOrderId(appData?.orders||[]).find(x=>x.orderId===orderId);
    if(!g)return this.showMsg("ไม่พบออเดอร์","error");
    const safeOid=ddSafeId(orderId);
    const initDate=normalizePayDateForInput_(g.payDate)||todayStr();
    const initTime=normalizePayTimeForInput_(g.payTime)||nowTimeStr();
    let imgHtml='<div class="text-xs text-glass-dim py-4 text-center">กำลังโหลดรูป…</div>';
    const html=`
      <div class="login-overlay slip-upload-overlay" id="payment-review-modal" onclick="if(event.target===this)app.closePaymentReviewModal()">
        <div class="login-card slip-upload-card" style="max-width:520px" onclick="event.stopPropagation()">
          <div class="login-title">ตรวจสอบการชำระ #${escHtml(shortOrderLabel_(orderId))}</div>
          <div class="slip-upload-body space-y-3">
            <div class="text-xs space-y-1">
              <div><b>วันที่สั่ง:</b> ${formatOrderTimestampCell(g.timestamp)}</div>
              <div><b>ยอด:</b> ${fmtMoney(g.totalPrice)} ฿ · <b>จำนวน:</b> ${g.totalQty} ตัว · <b>เขต:</b> ${escHtml(g.region||"")}</div>
            </div>
            <div class="payment-review-paydt-section">
              <div class="text-sm font-semibold mb-2"><i class="fas fa-clock mr-1"></i>วันเวลาที่โอน</div>
              <div id="payrev-dt-view-${safeOid}" class="payment-review-paydt-view">
                <div id="payrev-dt-view-text-${safeOid}" class="text-sm">${formatThaiDateTimeCell(g.payDate,g.payTime)}</div>
                <button type="button" onclick="app.startPaymentReviewPayDateEdit('${escHtml(orderId)}')" class="glass-btn-secondary text-xs mt-2" style="padding:.3rem .55rem"><i class="fas fa-edit"></i> แก้ไข</button>
              </div>
              <div id="payrev-dt-edit-${safeOid}" class="payment-review-paydt-edit" style="display:none">
                ${buildPayReviewDateTimeFieldsHtml_(safeOid,initDate,initTime)}
                <div class="payment-review-paydt-edit-actions grid grid-cols-2 gap-2 mt-2">
                  <button type="button" onclick="app.savePaymentReviewPayDateTime('${escHtml(orderId)}',this)" class="glass-btn-secondary py-2"><i class="fas fa-save mr-1"></i>บันทึก</button>
                  <button type="button" onclick="app.cancelPaymentReviewPayDateEdit('${escHtml(orderId)}')" class="glass-btn-secondary py-2">ยกเลิก</button>
                </div>
              </div>
              <div id="payment-review-msg" class="modal-inline-msg text-sm text-center mt-2" style="display:none" role="alert"></div>
            </div>
            <div id="payment-review-img" class="payment-review-img">${imgHtml}</div>
            <p class="text-xs text-glass-dim">เสื้อแจกฟรี: ไม่รวมยอดสั่งซื้อ · แสดงเป็นขาดทุนในแดชบอร์ด</p>
          </div>
          <div class="slip-modal-actions grid grid-cols-1 gap-2">
            <button onclick="app.closePaymentReviewModal()" class="glass-btn-secondary py-2">ปิด</button>
            <button id="payment-accept-btn" onclick="app.acceptOrderPayment('${escHtml(orderId)}',this)" class="glass-btn-primary py-2" ${String(g.paymentStatus||"")==="ชำระเงินแล้ว"||isFreeGiveawayPayment(g.paymentStatus)?"disabled":""}>ยอมรับการชำระ</button>
            <button onclick="app.markOrderFreeGiveaway('${escHtml(orderId)}',this)" class="glass-btn py-2" style="background:rgba(109,40,217,.5)" ${isFreeGiveawayPayment(g.paymentStatus)?"disabled":""}><i class="fas fa-gift mr-1"></i>เสื้อแจกฟรี</button>
          </div>
        </div>
      </div>`;
    const wrap=document.createElement("div");
    wrap.innerHTML=html;
    document.body.appendChild(wrap.firstElementChild);
    try{
      const res=await callAuthed("getOrderImage",orderId);
      const box=document.getElementById("payment-review-img");
      const src=orderImageDisplaySrc(res);
      if(box&&res&&res.ok&&src){
        const warn=res.warning?`<div class="text-xs text-glass-dim mb-1">${escHtml(res.warning)}</div>`:"";
        box.innerHTML=warn+`<img src="${src}" class="slip-preview-img w-full rounded-lg glass-image-wrap" alt="สลิป" style="cursor:zoom-in" onerror="app.onSlipImgError(this,'${escHtml(orderId)}')">
          <div class="text-xs text-glass-dim text-center mt-1"><i class="fas fa-search-plus mr-1"></i>แตะรูปเพื่อดูภาพใหญ่</div>`;
        const zoomImg=box.querySelector("img");
        if(zoomImg)zoomImg.addEventListener("click",function(){app.openImageLightbox(src,res.slipUrl||src);});
      }else if(box&&res&&res.slipUrl){
        box.innerHTML=`<div class="text-xs text-glass-dim mb-2">${escHtml(res.warning||"เปิดสลิปในแท็บใหม่")}</div>
          <a href="${escHtml(res.slipUrl)}" target="_blank" rel="noopener" class="glass-btn-secondary text-xs inline-block py-2 px-3">เปิดสลิปใน Google Drive</a>`;
      }else if(box){
        box.innerHTML='<div class="text-xs text-red-glass">โหลดรูปไม่สำเร็จ</div>';
      }
    }catch(e){
      const box=document.getElementById("payment-review-img");
      if(box)box.innerHTML='<div class="text-xs text-red-glass">'+escHtml(e.message||"โหลดรูปไม่สำเร็จ")+'</div>';
    }
  },

  onSlipImgError(img,orderId){
    if(!img||img.dataset.fallback==="1")return;
    img.dataset.fallback="1";
    callAuthed("getOrderImage",orderId).then(function(res){
      if(res&&res.slipUrl){img.style.display="none";img.parentElement.innerHTML+='<a href="'+escHtml(res.slipUrl)+'" target="_blank" rel="noopener" class="glass-btn-secondary text-xs py-2 px-3">เปิดสลิปใน Drive</a>';}
    }).catch(function(){});
  },

  closePaymentReviewModal(){
    const m=document.getElementById("payment-review-modal");
    if(m)m.remove();
  },

  showPaymentReviewModalMsg(msg,type){
    const el=document.getElementById("payment-review-msg");
    if(!el){this.showMsg(msg,type);return;}
    el.className="text-sm text-center font-semibold fade-in modal-inline-msg " +
      (type==="success"?"glass-msg-success":(type==="warning"?"glass-msg-success":"glass-msg-error"));
    el.style.display="block";
    el.textContent=type==="warning"?"⚠️ "+msg:msg;
  },

  clearPaymentReviewModalMsg(){
    const el=document.getElementById("payment-review-msg");
    if(el){el.style.display="none";el.textContent="";}
  },

  startPaymentReviewPayDateEdit(orderId){
    if(!isAdmin())return this.showPaymentReviewModalMsg("เฉพาะแอดมินเท่านั้น","error");
    const safeOid=ddSafeId(orderId);
    const viewEl=document.getElementById("payrev-dt-view-"+safeOid);
    const editEl=document.getElementById("payrev-dt-edit-"+safeOid);
    if(!viewEl||!editEl)return;
    this.clearPaymentReviewModalMsg();
    viewEl.style.display="none";
    editEl.style.display="block";
    bindDateTimePicker_(safeOid,"payrev");
  },

  cancelPaymentReviewPayDateEdit(orderId){
    const safeOid=ddSafeId(orderId);
    const g=groupOrdersByOrderId(appData?.orders||[]).find(x=>x.orderId===orderId);
    const viewEl=document.getElementById("payrev-dt-view-"+safeOid);
    const editEl=document.getElementById("payrev-dt-edit-"+safeOid);
    if(!viewEl||!editEl)return;
    if(g)updatePaymentReviewPayDateView_(safeOid,g.payDate,g.payTime);
    editEl.style.display="none";
    viewEl.style.display="block";
    this.clearPaymentReviewModalMsg();
  },

  async savePaymentReviewPayDateTime(orderId,btn){
    if(!isAdmin())return this.showPaymentReviewModalMsg("เฉพาะแอดมินเท่านั้น","error");
    const safeOid=ddSafeId(orderId);
    const payDate=String(document.getElementById("payrev-pay-date-"+safeOid)?.value||"").trim();
    const payTime=String(document.getElementById("payrev-pay-time-"+safeOid)?.value||"").trim();
    this.clearPaymentReviewModalMsg();
    if(!payDate||!payTime)return this.showPaymentReviewModalMsg("กรุณาเลือกวันที่และเวลาโอน","error");
    const snap=snapshotOrderGroup_(orderId);
    applyLocalOrderSlipUpdate_(orderId,{payDate:payDate,payTime:payTime});
    refreshAfterOrderListMutation_(orderId,{recalcStock:false});
    try{
      const res=await runSaving({btn:btn,busyText:"กำลังบันทึก…"},async()=>{
        return await callAuthed("updateOrderPayDateTimeByOrderId",orderId,payDate,payTime);
      });
      applyLocalOrderSlipUpdate_(orderId,res);
      updatePaymentReviewPayDateView_(safeOid,payDate,payTime);
      const viewEl=document.getElementById("payrev-dt-view-"+safeOid);
      const editEl=document.getElementById("payrev-dt-edit-"+safeOid);
      if(viewEl&&editEl){editEl.style.display="none";viewEl.style.display="block";}
      this.showPaymentReviewModalMsg("บันทึกวันเวลาโอนแล้ว","success");
      refreshAfterOrderListMutation_(orderId,{recalcStock:false,syncServer:true});
    }catch(e){
      restoreOrderGroupSnapshot_(orderId,snap);
      refreshAfterOrderListMutation_(orderId,{recalcStock:false});
      this.showPaymentReviewModalMsg(e.message||"บันทึกไม่สำเร็จ","error");
    }
  },

  async acceptOrderPayment(orderId,btn){
    if(!confirm("ยอมรับว่าชำระเงินถูกต้องแล้ว?"))return;
    const prevPay=getOrderGroupPaymentStatus_(orderId);
    const snap=snapshotOrderGroup_(orderId);
    const prevStatus=snap&&snap[0]?String(snap[0].status||snap[0].orderStatus||""):"";
    applyLocalOrderPaymentStatus_(orderId,"ชำระเงินแล้ว");
    applyLocalOrderStatusUpdate_(orderId,ORDER_STATUS_AWAITING);
    this.closePaymentReviewModal();
    refreshAfterOrderListMutation_(orderId,{recalcStock:false});
    try{
      await runSaving({btn:btn,busyText:"กำลังบันทึก…"},async()=>{
        await callAuthed("acceptOrderPayment",orderId);
      });
      refreshAfterOrderListMutation_(orderId,{recalcStock:false,syncServer:true});
      this.showMsg("ยอมรับการชำระเงินแล้ว","success");
    }catch(e){
      applyLocalOrderPaymentStatus_(orderId,prevPay);
      applyLocalOrderStatusUpdate_(orderId,prevStatus);
      refreshAfterOrderListMutation_(orderId,{recalcStock:false});
      this.showMsg(e.message||"บันทึกไม่สำเร็จ","error");
    }
  },

  async markOrderFreeGiveaway(orderId,btn){
    if(!isAdmin())return this.showMsg("เฉพาะแอดมินเท่านั้น","error");
    const g=groupOrdersByOrderId(appData?.orders||[]).find(x=>x.orderId===orderId);
    if(g&&isFreeGiveawayPayment(g.paymentStatus))return this.showMsg("ออเดอร์นี้เป็นเสื้อแจกฟรีแล้ว","warning");
    if(g&&isPaymentVerified(g.paymentStatus))return this.showMsg("ออเดอร์ชำระเงินแล้ว ไม่สามารถเปลี่ยนเป็นแจกฟรีได้","warning");
    if(!confirm("บันทึกเป็นเสื้อแจกฟรี (ผู้บริหาร)?\nยอดนี้จะไม่รวมกับเสื้อที่สั่งซื้อ และแสดงเป็นขาดทุนในแดชบอร์ด"))return;
    const prevPay=getOrderGroupPaymentStatus_(orderId);
    const snap=snapshotOrderGroup_(orderId);
    const prevStatus=snap&&snap[0]?String(snap[0].status||snap[0].orderStatus||""):"";
    applyLocalOrderPaymentStatus_(orderId,PAYMENT_FREE_GIVEAWAY);
    applyLocalOrderStatusUpdate_(orderId,ORDER_STATUS_AWAITING);
    this.closePaymentReviewModal();
    refreshAfterOrderListMutation_(orderId);
    try{
      await runSaving({btn:btn,busyText:"กำลังบันทึก…"},async()=>{
        await callAuthed("markOrderFreeGiveaway",orderId);
      });
      refreshAfterOrderListMutation_(orderId,{syncServer:true});
      this.showMsg("บันทึกเป็นเสื้อแจกฟรีแล้ว (ไม่รวมยอดสั่งซื้อ)","success");
    }catch(e){
      applyLocalOrderPaymentStatus_(orderId,prevPay);
      applyLocalOrderStatusUpdate_(orderId,prevStatus);
      refreshAfterOrderListMutation_(orderId);
      this.showMsg(e.message||"บันทึกไม่สำเร็จ","error");
    }
  },

  async deleteOrderImage(orderId,btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    if(!confirm("ลบรูปแนบของออเดอร์นี้? (ต้องลบก่อนจึงจะแนบรูปใหม่ได้)"))return;
    const snap=snapshotOrderGroup_(orderId);
    applyLocalOrderSlipUpdate_(orderId,{slipUrl:"",slipName:"",payDate:"",payTime:"",paymentStatus:""});
    refreshAfterMutation_({ keepLocal: true });
    try{
      await runSaving({btn:btn,btnText:"",busyText:"กำลังลบรูป…"},async()=>{
        await callAuthed("deleteOrderImage",orderId);
      });
      this.showMsg("ลบรูปแนบแล้ว","success");
      scheduleBackgroundBootstrapSync_();
    }catch(e){
      restoreOrderGroupSnapshot_(orderId,snap);
      refreshAfterMutation_({ keepLocal: true });
      this.showMsg(e.message||"ลบรูปไม่สำเร็จ","error");
    }
  },

  async viewOrderImage(orderId,btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    const g=groupOrdersByOrderId(appData?.orders||[]).find(x=>x.orderId===orderId);
    const slipUrl=g?String(g.slipUrl||"").trim():"";
    const fileId=slipUrl?extractDriveFileId(slipUrl):"";
    if(fileId){
      const preview=imageProxyCache[fileId]||slipDriveThumbUrl_(fileId,400);
      this.openImageLightbox(preview,slipDriveViewUrl_(slipUrl,fileId));
      if(!imageProxyCache[fileId])this.upgradeOrderImagePreview_(orderId,fileId);
      return;
    }
    try{
      const res=await runSaving({btn:btn,btnText:"",busyText:"กำลังโหลดรูป…",toast:false},()=>
        callAuthedWithTimeout(90000,"getOrderImage",orderId)
      );
      const src=orderImageDisplaySrc(res);
      if(res&&res.ok&&src){
        const rid=extractDriveFileId(res.slipUrl||slipUrl);
        if(res.dataUrl&&rid)imageProxyCacheSet_(rid,res.dataUrl);
        this.openImageLightbox(src,res.slipUrl||src);
        return;
      }
      if(res&&res.slipUrl){
        window.open(res.slipUrl,"_blank","noopener");
        return;
      }
      this.showMsg((res&&res.warning)||"โหลดรูปไม่สำเร็จ","warning");
    }catch(e){
      this.showMsg(e.message||"โหลดรูปไม่สำเร็จ","error");
    }
  },

  async upgradeOrderImagePreview_(orderId,fileId){
    try{
      const res=await callAuthedWithTimeout(90000,"getOrderImage",orderId);
      const src=orderImageDisplaySrc(res);
      if(!res||!res.ok||!src)return;
      if(res.dataUrl)imageProxyCacheSet_(fileId,res.dataUrl);
      const box=document.getElementById("image-lightbox");
      if(!box)return;
      const img=box.querySelector(".image-lightbox-img");
      if(img)img.src=src;
      const link=box.querySelector(".image-lightbox-open");
      if(link&&res.slipUrl)link.href=res.slipUrl;
    }catch(_){}
  },

  openImageLightbox(src,fullHref){
    this.closeImageLightbox();
    const href=fullHref||src;
    const wrap=document.createElement("div");
    wrap.id="image-lightbox";
    wrap.className="image-lightbox-overlay fade-in";
    wrap.innerHTML=`<div class="image-lightbox-card">
      <button class="image-lightbox-close" onclick="app.closeImageLightbox()" aria-label="ปิด"><i class="fas fa-times"></i></button>
      <img src="${escAttr(src)}" alt="รูปแนบออเดอร์" class="image-lightbox-img">
      <a href="${escAttr(href)}" target="_blank" rel="noopener" class="image-lightbox-open"><i class="fas fa-external-link-alt mr-1"></i> เปิดในแท็บใหม่</a>
    </div>`;
    wrap.addEventListener("click",e=>{if(e.target===wrap)app.closeImageLightbox()});
    document.body.appendChild(wrap);
    if(!this._lightboxKeyHandler){
      this._lightboxKeyHandler=e=>{if(e.key==="Escape")app.closeImageLightbox()};
    }
    document.addEventListener("keydown",this._lightboxKeyHandler,true);
  },

  closeImageLightbox(){
    const m=document.getElementById("image-lightbox");
    if(m)m.remove();
    if(this._lightboxKeyHandler)document.removeEventListener("keydown",this._lightboxKeyHandler,true);
  },

  cartMaxQtyForSize(orderId,size){
    return maxEditableQtyForOrder(orderId,size);
  },

  openCartEditModal(orderId){
    const orderGroup=groupOrdersByOrderId(appData?.orders||[]).find(g=>g.orderId===orderId);
    if(!orderGroup)return this.showMsg("ไม่พบออเดอร์","error");
    const ownsOrder=ownsOrderRegion(orderGroup);
    const canEditOrder=canUserEditOrderGroup(orderGroup,ownsOrder);
    const canEditNote=canEditOrderNote_(orderGroup,ownsOrder);
    const canEditNoteInModal=canEditNoteInModal_(orderGroup,ownsOrder);
    if(!canEditOrder&&!canEditNote&&!canEditNoteInModal)return this.showMsg("ออเดอร์ถูกล็อกแล้ว แก้ไขได้เฉพาะแอดมิน","warning");
    const inCart=isCartStatus(orderGroup.status);
    const safeId=ddSafeId(orderId);
    const sizes=appData?.stockSizes||[];
    const itemRows=sizes.map(size=>{
      const it=orderGroup.items.find(x=>x.size===size);
      const remainQty=stockRemainingForSize(size);
      const maxQty=maxEditableQtyForOrder(orderId,size);
      const cur=it?it.qty:0;
      const remainLabel=remainQty<=0?'<span class="text-red-glass">หมด</span>':remainQty;
      const qtyCell=canEditOrder
        ?`<input id="cart-${safeId}-${size}" type="number" min="0" max="${maxQty}" class="glass-input p-1 text-xs" value="${cur}">`
        :`<span class="font-bold">${cur}</span>`;
      if(!canEditOrder&&cur<=0)return "";
      return `<tr>
        <td><span class="size-badge ${sizeClass(size)}">${size}</span></td>
        <td>${remainLabel}</td>
        <td>${qtyCell}</td>
      </tr>`;
    }).filter(Boolean).join("");
    const noteValue=escHtml(String(orderGroup.note||""));
    const contactValue=escHtml(String(orderGroup.contactPhone||""));
    const contactField=`<div class="cart-edit-note-block">
          <label class="glass-label text-sm font-bold" for="cart-edit-contact-${safeId}"><i class="fas fa-phone mr-1"></i>เบอร์ติดต่อ</label>
          <input id="cart-edit-contact-${safeId}" type="tel" class="glass-input text-sm" maxlength="30" inputmode="tel"
            placeholder="เช่น 081-234-5678" value="${contactValue}" ${canEditNoteInModal?"":"readonly"}>
        </div>`;
    const noteField=`<div class="cart-edit-note-block">
          <label class="glass-label text-sm font-bold" for="cart-edit-note-${safeId}"><i class="fas fa-sticky-note mr-1"></i>หมายเหตุ</label>
          <textarea id="cart-edit-note-${safeId}" class="glass-input text-sm cart-edit-note-input" maxlength="120" rows="2"
            placeholder="เพิ่มหมายเหตุ เช่น ชื่อผู้รับ, รายละเอียดเพิ่มเติม" ${canEditNoteInModal?"":"readonly"}>${noteValue}</textarea>
        </div>`;
    const html=`
      <div class="login-overlay" id="cart-edit-modal">
        <div class="login-card" style="max-width:560px">
          <div class="login-title">${inCart?"แก้ไขตะกร้า":"แก้ไขออเดอร์"} #${escHtml(shortOrderLabel_(orderId))}</div>
          <p class="login-sub text-xs">${canEditOrder
            ?(inCart?"แก้ไขหมายเหตุ ไซส์ และจำนวนได้จนกว่าจะยืนยันส่งออเดอร์":"แก้ไขหมายเหตุ ไซส์ และจำนวนได้จนกว่าแอดมินจะล็อกสถานะ")
            :"เพิ่มหมายเหตุได้จนกว่าจะชำระเงินแล้ว (ไซส์/จำนวนล็อกแล้ว)"}<br><span class="opacity-80">${canEditOrder?"คอลัมน์ «คงเหลือ» = ตามหน้าสต็อก · ช่องจำนวนปรับได้สูงสุด = คงเหลือ + จำนวนเดิมในออเดอร์นี้":""}</span></p>
          <div class="space-y-2">
            ${contactField}
            ${noteField}
            <div class="glass-table-wrap">
              <table class="order-size-table text-xs">
                <thead><tr><th>ไซส์</th><th>คงเหลือ</th><th>จำนวน</th></tr></thead>
                <tbody>${itemRows}</tbody>
              </table>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <button onclick="app.closeCartEditModal()" class="glass-btn-secondary py-2">ยกเลิก</button>
              <button onclick="app.saveCartEdit('${escHtml(orderId)}',this)" class="glass-btn-primary py-2">${inCart?"บันทึกตะกร้า":"บันทึก"}</button>
            </div>
          </div>
        </div>
      </div>`;
    const wrap=document.createElement("div");
    wrap.innerHTML=html;
    document.body.appendChild(wrap.firstElementChild);
  },

  closeCartEditModal(){
    const m=document.getElementById("cart-edit-modal");
    if(m)m.remove();
  },

  async saveCartEdit(orderId,btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    const orderGroup=groupOrdersByOrderId(appData?.orders||[]).find(g=>g.orderId===orderId);
    if(!orderGroup){this.showMsg("ไม่พบออเดอร์","error");return;}
    const ownsOrder=ownsOrderRegion(orderGroup);
    const canEditOrder=canUserEditOrderGroup(orderGroup,ownsOrder);
    const canEditNote=canEditOrderNote_(orderGroup,ownsOrder);
    const canEditNoteInModal=canEditNoteInModal_(orderGroup,ownsOrder);
    const safeId=ddSafeId(orderId);
    const noteEl=document.getElementById("cart-edit-note-"+safeId);
    const contactEl=document.getElementById("cart-edit-contact-"+safeId);
    const note=noteEl?String(noteEl.value||"").trim():String(orderGroup.note||"");
    const contactPhone=contactEl?normalizeContactPhoneInput_(contactEl.value||""):normalizeContactPhoneInput_(orderGroup.contactPhone||"");
    const inCart=isCartStatus(orderGroup.status);
    if(!canEditOrder&&canEditNoteInModal){
      const ordersInGroup=(appData?.orders||[]).filter(o=>o.orderId===orderId);
      const prevNote=ordersInGroup.length?String(ordersInGroup[0].note||""):"";
      const prevContact=ordersInGroup.length?String(ordersInGroup[0].contactPhone||""):"";
      applyLocalOrderNoteUpdate_(orderId,note);
      applyLocalOrderContactUpdate_(orderId,contactPhone);
      try{
        await runSaving({btn:btn,busyText:"กำลังบันทึก…"},async()=>{
          await callAuthed("updateOrderNoteByOrderId",orderId,note);
          await callAuthed("updateOrderContactByOrderId",orderId,contactPhone);
        });
        this.closeCartEditModal();
        this.showMsg("บันทึกแล้ว","success");
        refreshAfterMutation_({ keepLocal: true });
      }catch(e){
        applyLocalOrderNoteUpdate_(orderId,prevNote);
        applyLocalOrderContactUpdate_(orderId,prevContact);
        this.fillOrderListBody();
        this.showMsg(e.message||"บันทึกไม่สำเร็จ","error");
      }
      return;
    }
    const sizes=appData?.stockSizes||[];
    const items=sizes.map(size=>{
      const val=Number(document.getElementById("cart-"+safeId+"-"+size)?.value||0);
      return {size:size,qty:Math.max(0,Math.floor(val))};
    }).filter(it=>it.qty>0);
    if(items.length===0){this.showMsg("กรุณาเลือกอย่างน้อย 1 ไซส์","warning");return;}
    const snap=snapshotOrderGroup_(orderId);
    applyLocalOrderNoteUpdate_(orderId,note);
    applyLocalOrderContactUpdate_(orderId,contactPhone);
    applyLocalOrderCartUpdate_(orderId,{status:orderGroup.status},items,orderGroup,note,contactPhone);
    this.closeCartEditModal();
    refreshAfterMutation_({ keepLocal: true });
    try{
      await runSaving({btn:btn,busyText:inCart?"กำลังบันทึกตะกร้า…":"กำลังบันทึก…"},async()=>{
        const r=await callAuthed("updateCartOrderByOrderId",orderId,{items:items,note:note,contactPhone:contactPhone});
        applyLocalOrderNoteUpdate_(orderId,note);
        applyLocalOrderContactUpdate_(orderId,contactPhone);
        applyLocalOrderCartUpdate_(orderId,r,items,orderGroup,note,contactPhone);
        return r;
      });
      this.showMsg(inCart?"บันทึกตะกร้าแล้ว":"บันทึกจำนวนแล้ว","success");
      scheduleBackgroundBootstrapSync_();
    }catch(e){
      restoreOrderGroupSnapshot_(orderId,snap);
      refreshAfterMutation_({ keepLocal: true });
      this.showMsg(e.message||"บันทึกไม่สำเร็จ","error");
    }
  },

  async submitCartToAdmin(orderId,btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    if(!canCreateNewOrders_())return this.showMsg("ปิดรับสั่งซื้อชั่วคราว","warning");
    if(!confirm("ยืนยันส่งออเดอร์นี้ไปยังแอดมิน? หลังส่งแล้วยังแก้จำนวนได้จนกว่าแอดมินจะล็อกสถานะ"))return;
    muteNotifyForOrder_(orderId,120000,"user");
    const orderedStatus=(appData&&appData.pickupStatus&&appData.pickupStatus[0])||ORDER_STATUS_ORDERED;
    const ordersInGroup=(appData?.orders||[]).filter(o=>o.orderId===orderId);
    const prev=ordersInGroup.length?(ordersInGroup[0].orderStatus||ordersInGroup[0].status):"";
    applyLocalOrderStatusUpdate_(orderId,orderedStatus);
    refreshAfterMutation_({ keepLocal: true });
    try{
      await runSaving({btn:btn,busyText:"กำลังส่งออเดอร์…"},async()=>{
        await callAuthed("submitCartOrderToAdmin",orderId);
      });
      this.showMsg("ส่งออเดอร์ไปยังแอดมินแล้ว","success");
      scheduleBackgroundBootstrapSync_();
    }catch(e){
      applyLocalOrderStatusUpdate_(orderId,prev);
      refreshAfterMutation_({ keepLocal: true });
      this.showMsg(e.message||"ส่งออเดอร์ไม่สำเร็จ","error");
    }
  },

  // ── Dashboard view ─────────────────────────────────────────────────
  renderDashboard(){
    let opts='<option value="all">ทุกเขต</option>';
    (appData?.regions||[]).forEach(r=>{opts+=`<option value="${escHtml(r)}">${escHtml(r)}</option>`});
    return `
      <div class="glass-card p-4">
        <h2 class="text-lg font-bold glass-section-title mb-4 border-b glass-divider pb-2"><i class="fas fa-chart-pie mr-1"></i>แดชบอร์ด</h2>
        ${canViewAllRegions()?`<select id="dash-region" onchange="app.initDashboard()" class="glass-select p-2 mb-4 text-sm w-full">${opts}</select>`:""}
        <div class="mb-4" id="dash-cards"></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div class="glass-chart-box"><canvas id="regionChart"></canvas></div>
          <div class="glass-chart-box"><canvas id="sizeChart"></canvas></div>
        </div>
      ${canViewAdminData()?`<div class="grid grid-cols-1 gap-4 mb-4">
        <div class="glass-chart-box"><canvas id="giveawayChart"></canvas></div>
      </div>`:""}
        <div id="dash-stock"></div>
      </div>`;
  },

  async initDashboard(){
    const region=document.getElementById("dash-region")?.value||"all";
    const dash=computeDashboard(region);
    const cardsEl=document.getElementById("dash-cards");
    if(cardsEl){
      cardsEl.innerHTML=renderDashboardCardsHtml_(dash,region);
    }
    const stockHtml=dash.stock.map(s=>
      `<div class="glass-stock-cell ${s.remaining<=5?'low':''}"><span class="size-badge ${sizeClass(s.size)}">${s.size}</span><div class="text-xs mt-1 text-glass-muted">เหลือ <b class="${s.remaining<=5?'text-red-glass':'text-green-glass'}">${s.remaining}</b>/${s.delivered}</div></div>`
    ).join("");
    const stockEl=document.getElementById("dash-stock");
    if(stockEl){
      stockEl.innerHTML=`<h3 class="text-sm font-bold glass-section-title mb-2">สต็อกคงเหลือ</h3><div class="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2">${stockHtml}</div>`;
    }
    await loadChartJs();
    this.upsertRegionChart(dash);
    this.upsertGiveawayChart(dash);
    this.upsertSizeChart(dash);
  },

  upsertRegionChart(dash){
    const canvas=document.getElementById("regionChart");
    if(!canvas)return;
    const sorted=sortRegionChartData_(dash.regionLabels,dash.regionQtys,dash.regionFreeQtys);
    const datasets=[
      {label:"สั่งซื้อ (ตัว)",data:sorted.qtys,backgroundColor:"#7F1D1D",borderRadius:4,maxBarThickness:40},
    ];
    if(canViewAdminData()){
      datasets.push({label:"แจกฟรี (ตัว)",data:sorted.freeQtys,backgroundColor:"#6D28D9",borderRadius:4,maxBarThickness:40});
    }
    const chartTitle=canViewAdminData()?"จำนวนเสื้อตามเขต (สั่งซื้อ vs แจกฟรี)":"จำนวนเสื้อตามเขต";
    if(regionChart&&regionChart.canvas===canvas&&document.body.contains(canvas)){
      regionChart.data.labels=sorted.labels;
      regionChart.data.datasets=datasets;
      regionChart.update();return;
    }
    if(regionChart)try{regionChart.destroy()}catch(_){}
    regionChart=new Chart(canvas.getContext("2d"),{type:"bar",data:{labels:sorted.labels,datasets:datasets},options:{maintainAspectRatio:false,animation:{duration:280},plugins:{legend:{display:true,labels:{color:"#fff",font:{family:"'Sarabun',sans-serif"}}},title:{display:true,text:chartTitle,color:"#fff",font:{size:15,weight:"700",family:"'Sarabun',sans-serif"}}},scales:{x:{stacked:true,ticks:{color:"rgba(255,255,255,.85)",font:{size:10,family:"'Sarabun',sans-serif"}},grid:{color:"rgba(255,255,255,.1)"}},y:{stacked:true,beginAtZero:true,ticks:{color:"rgba(255,255,255,.85)",font:{family:"'Sarabun',sans-serif"}},grid:{color:"rgba(255,255,255,.1)"}}}}});
  },

  upsertGiveawayChart(dash){
    const canvas=document.getElementById("giveawayChart");
    if(!canvas)return;
    const lossData=dash.regionFreeLoss||[];
    if(giveawayChart&&giveawayChart.canvas===canvas&&document.body.contains(canvas)){
      giveawayChart.data.labels=dash.regionLabels;
      giveawayChart.data.datasets[0].data=lossData;
      giveawayChart.update();return;
    }
    if(giveawayChart)try{giveawayChart.destroy()}catch(_){}
    giveawayChart=new Chart(canvas.getContext("2d"),{type:"bar",data:{labels:dash.regionLabels,datasets:[{label:"ขาดทุนแจก (฿)",data:lossData,backgroundColor:"#8B5CF6",borderRadius:6,maxBarThickness:48}]},options:{maintainAspectRatio:false,animation:{duration:280},plugins:{legend:{display:false},title:{display:true,text:"มูลค่าขาดทุนจากการแจกฟรี (ไม่รวมยอดสั่งซื้อ)",color:"#fff",font:{size:15,weight:"700",family:"'Sarabun',sans-serif"}}},scales:{x:{ticks:{color:"rgba(255,255,255,.85)",font:{size:10,family:"'Sarabun',sans-serif"}},grid:{color:"rgba(255,255,255,.1)"}},y:{beginAtZero:true,ticks:{color:"rgba(255,255,255,.85)",font:{family:"'Sarabun',sans-serif"}},grid:{color:"rgba(255,255,255,.1)"}}}}});
  },

  upsertSizeChart(dash){
    const canvas=document.getElementById("sizeChart");
    if(!canvas)return;
    const sizeDatasets=[
      sizeChartDataset_("สั่งซื้อ",dash.sizeQtys,"sale"),
    ];
    if(canViewAdminData()){
      sizeDatasets.push(sizeChartDataset_("แจกฟรี",dash.sizeFreeQtys,"free"));
    }
    const chartTitle=canViewAdminData()?"จำนวนตามไซส์ (สั่งซื้อ vs แจกฟรี)":"จำนวนตามไซส์";
    if(sizeChart&&sizeChart.canvas===canvas&&document.body.contains(canvas)){
      sizeChart.data.labels=dash.sizeLabels;
      sizeChart.data.datasets=sizeDatasets;
      sizeChart.update();return;
    }
    if(sizeChart)try{sizeChart.destroy()}catch(_){}
    sizeChart=new Chart(canvas.getContext("2d"),{type:"doughnut",data:{labels:dash.sizeLabels,datasets:sizeDatasets},options:{maintainAspectRatio:false,animation:{duration:280},plugins:{legend:{position:"bottom",labels:{usePointStyle:true,pointStyle:"circle",padding:14,boxWidth:10,boxHeight:10,color:"#fff",font:{size:12,family:"'Sarabun',sans-serif"}}},title:{display:true,text:chartTitle,color:"#fff",font:{size:15,weight:"700",family:"'Sarabun',sans-serif"}}}}});
  },

  // ── Report view ────────────────────────────────────────────────────
  renderReport(){
    return `
      <div class="glass-card p-4 space-y-4">
        <h2 class="text-lg font-bold glass-section-title border-b glass-divider pb-2"><i class="fas fa-file-alt mr-1"></i>รายงาน</h2>
        ${isAdmin()?`<div class="report-abnormal-wrap">
          <h3 class="text-sm font-bold glass-section-title mb-2"><i class="fas fa-exclamation-triangle mr-1"></i> รายการที่ผิดปกติ</h3>
          <p class="text-xs text-glass-dim mb-2">ออเดอร์ที่มียอด วันเวลาโอน และจำนวนเสื้อตรงกัน (ชำระแล้วหรือรอตรวจสลิป) — อาจเป็นสลิปซ้ำ</p>
          <div id="report-abnormal-host"></div>
        </div>`:""}
        <div id="report-cards"></div>
        <div>
          <h3 class="text-sm font-bold glass-section-title mb-2"><i class="fas fa-map-marker-alt mr-1"></i> ยอดสั่งตามเขต</h3>
          <div class="overflow-x-auto glass-table-wrap">
            <table class="glass-table report-table w-full text-xs" id="report-region-table">
              <thead><tr>
                <th class="py-2 px-2 text-left">เขต</th>
                <th class="py-2 px-2 text-center">สั่งซื้อ (ตัว)</th>
                <th class="py-2 px-2 text-right">ยอดสั่งซื้อ (฿)</th>
                ${canViewAdminData()?`<th class="py-2 px-2 text-center">แจกฟรี</th>
                <th class="py-2 px-2 text-right">ขาดทุนแจก</th>`:""}
                <th class="py-2 px-2 text-left">ไซส์ (สั่งซื้อ)</th>
                ${reportRegionBucketHeadersHtml_()}
              </tr></thead>
              <tbody id="report-region-body"></tbody>
              <tfoot id="report-region-foot"></tfoot>
            </table>
          </div>
        </div>
        <div>
          <div class="report-transfer-toolbar mb-2">
            <h3 class="text-sm font-bold glass-section-title"><i class="fas fa-table mr-1"></i> สรุปยอดโอนแล้ว</h3>
            <div class="report-transfer-actions">
              <label class="report-transfer-toggle text-xs">
                <input type="checkbox" id="report-show-unpaid" checked onchange="app.toggleReportUnpaid(this.checked)">
                <span>แสดงรายการที่ยังไม่โอน (ตัวเลขสีแดง)</span>
              </label>
              <button type="button" onclick="app.exportPaidTransferPdf(this)" class="glass-btn-primary text-xs report-transfer-pdf-btn"><i class="fas fa-file-pdf mr-1"></i> ดาวน์โหลด PDF</button>
            </div>
          </div>
          <p class="text-xs text-glass-dim mb-2">แสดงออเดอร์ที่ชำระเงินแล้ว · หมายเหตุ จากที่ user กรอกตอนสั่งเสื้อ · รวมยอดนับเฉพาะที่โอนแล้ว</p>
          <div class="overflow-x-auto report-transfer-table-wrap glass-table-wrap">
            <div id="report-paid-transfer-table-host"></div>
          </div>
          <div id="report-paid-transfer-print-host" class="hidden" aria-hidden="true"></div>
        </div>
        <div>
          <h3 class="text-sm font-bold glass-section-title mb-2"><i class="fas fa-boxes mr-1"></i> สต็อกคงเหลือ</h3>
          <div id="report-stock"></div>
        </div>
        <button onclick="app.exportCSV(this)" class="w-full glass-btn-blue py-2 text-sm"><i class="fas fa-file-csv mr-1"></i> Export CSV ทั้งหมด</button>
      </div>`;
  },

  initReport(){
    const r=computeSalesReport();
    const t=r.totals, p=r.pendingPayment;
    if(isAdmin()){
      const abHost=document.getElementById("report-abnormal-host");
      if(abHost)abHost.innerHTML=renderAbnormalOrdersSectionHtml_();
    }
    document.getElementById("report-cards").innerHTML=`
      <div class="glass-stat glass-stat-purple"><div class="glass-stat-label">ยอดสั่งซื้อ (ตัว)</div><div class="glass-stat-value">${t.totalQty}</div></div>
      <div class="glass-stat glass-stat-orange"><div class="glass-stat-label">ยอดสั่งซื้อ (฿)</div><div class="glass-stat-value text-xl">${fmtMoney(t.totalAmount)}</div></div>
      ${canViewAdminData()?`
      <div class="glass-stat" style="background:linear-gradient(135deg,rgba(109,40,217,.35),rgba(79,70,229,.25))"><div class="glass-stat-label">แจกฟรี (ตัว)</div><div class="glass-stat-value">${t.freeQty||0}</div></div>
      <div class="glass-stat" style="background:linear-gradient(135deg,rgba(109,40,217,.45),rgba(127,29,29,.2))"><div class="glass-stat-label">ขาดทุนแจก (฿)</div><div class="glass-stat-value text-xl">${fmtMoney(t.freeLoss||0)}</div></div>`:""}
      <div class="glass-stat glass-stat-green"><div class="glass-stat-label">สต็อกคงเหลือ</div><div class="glass-stat-value">${r.stockTotalRemaining}</div><div class="glass-stat-sub">ตัว</div></div>
      <div class="glass-stat glass-stat-blue"><div class="glass-stat-label">รอตรวจสอบการชำระ</div><div class="glass-stat-value text-xl">${p.count} รายการ</div><div class="glass-stat-sub">${p.totalQty} ตัว</div></div>`;
    const sizes=appData?.stockSizes||[];
    const rows=r.byRegion.map(x=>{
      const parts=sizes.filter(s=>x.bySize[s]>0).length
        ? `<div class="order-items">${sizes.filter(s=>x.bySize[s]>0).map(s=>`<span class="order-item"><span class="size-badge ${sizeClass(s)}">${s}</span><span class="order-item-qty">${x.bySize[s]}</span></span>`).join("")}</div>`
        : '<span class="text-glass-dim">-</span>';
      const cls=x.totalQty>0?"":"text-glass-dim";
      const giveawayCols=canViewAdminData()?`<td data-label="แจกฟรี" class="py-2 px-2 text-center" style="color:#C4B5FD">${x.freeQty||0}</td><td data-label="ขาดทุน" class="py-2 px-2 text-right" style="color:#C4B5FD">${fmtMoney(x.freeLoss||0)}</td>`:"";
      const bucketCols=reportRegionBucketCellsHtml_(x.reportBuckets);
      return `<tr class="${cls}"><td data-label="เขต" class="py-2 px-2 font-semibold">${escHtml(regionShort(x.shortName))}</td><td data-label="สั่งซื้อ" class="py-2 px-2 text-center font-bold">${x.totalQty}</td><td data-label="ยอดสั่งซื้อ" class="py-2 px-2 text-right">${fmtMoney(x.totalAmount)}</td>${giveawayCols}<td data-label="ไซส์" class="py-2 px-2">${parts}</td>${bucketCols}</tr>`;
    }).join("");
    document.getElementById("report-region-body").innerHTML=rows;
    const footGiveawayCols=canViewAdminData()?`<td data-label="แจกฟรี" class="py-2 px-2 text-center" style="color:#C4B5FD">${t.freeQty||0}</td><td data-label="ขาดทุน" class="py-2 px-2 text-right" style="color:#C4B5FD">${fmtMoney(t.freeLoss||0)}</td>`:"";
    const footBucketCols=reportRegionBucketCellsHtml_(t.reportBuckets);
    document.getElementById("report-region-foot").innerHTML=`<tr><td data-label="เขต" class="py-2 px-2 font-bold">รวม</td><td data-label="สั่งซื้อ" class="py-2 px-2 text-center">${t.totalQty}</td><td data-label="ยอดสั่งซื้อ" class="py-2 px-2 text-right">${fmtMoney(t.totalAmount)}</td>${footGiveawayCols}<td data-label="ไซส์" class="py-2 px-2"></td>${footBucketCols}</tr>`;
    const cells=r.stock.map(s=>{
      const cls=s.remaining<=5?"low":"";
      const nc=s.remaining<=5?"text-red-glass":"text-green-glass";
      return `<div class="glass-stock-cell ${cls}"><span class="size-badge ${sizeClass(s.size)}">${s.size}</span><div class="text-lg font-bold ${nc} mt-1">${s.remaining}</div><div class="text-xs text-glass-muted">/${s.delivered}</div></div>`;
    }).join("");
    document.getElementById("report-stock").innerHTML=`<div class="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2 mb-2">${cells}</div><div class="glass-total-bar">รวมคงเหลือทั้งหมด: <span class="text-lg">${r.stockTotalRemaining}</span> ตัว</div>`;
    this.renderPaidTransferReport();
  },

  renderPaidTransferReport(){
    const host=document.getElementById("report-paid-transfer-table-host");
    if(!host)return;
    const includeUnpaid=!!document.getElementById("report-show-unpaid")?.checked;
    host.innerHTML=renderPaidTransferReportTableHtml_(computePaidTransferReport_(includeUnpaid));
  },

  toggleReportUnpaid(_checked){
    this.renderPaidTransferReport();
  },

  async exportPaidTransferPdf(btn){
    try{
      await runSaving({btn:btn,busyText:"กำลังสร้าง PDF…",toast:false},()=>exportPaidTransferReportPdf_(btn));
      this.showMsg("ดาวน์โหลด PDF แล้ว","success");
    }catch(e){
      this.showMsg(e.message||"สร้าง PDF ไม่สำเร็จ","error");
    }
  },

  // ── Admin view ─────────────────────────────────────────────────────
  renderAdmin(){
    if(!isAdmin())return '<div class="glass-msg-error text-center font-semibold">เฉพาะแอดมินเท่านั้น</div>';
    const stockInputs=appData.stock.map((s,i)=>`<label class="text-xs font-semibold block text-glass">${s.size} (สั่งแล้ว ${s.sold})<input id="stock-del-${i}" type="number" min="0" class="glass-input p-2 mt-1" value="${s.delivered}"></label>`).join("");
    return `
      <div class="glass-card p-4 space-y-4">
        <h2 class="text-lg font-bold glass-section-title border-b glass-divider pb-2"><i class="fas fa-cog text-red-glass mr-1"></i>ตั้งค่าระบบ</h2>
        <div class="glass-card-inner p-4">
          <h3 class="font-bold text-sm mb-3 text-glass"><i class="fas fa-image mr-1"></i> รูปเสื้อ</h3>
          <div class="mb-3 rounded-lg overflow-hidden glass-image-wrap">
            <img id="admin-image-preview" data-image-ref="${escHtml(appData.round.imageRef||appData.round.imageUrl||"")}" src="${appData.round.imageDisplaySrc||withCacheBust(appData.round.imageDisplayUrl||appData.round.imageUrl,appData.generatedAt||Date.now())}" alt="รูปเสื้อ" onload="app.onShirtImageLoaded(this,true)" onerror="app.onShirtImageError(this,true)" class="w-full max-h-40 object-contain" style="background:rgba(0,0,0,.1)">
          </div>
          <div class="space-y-2">
            <input id="admin-image-file" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,image/bmp" class="glass-input p-2 text-xs" onchange="app.previewShirtImage(this)">
            <p id="admin-image-filename" class="text-xs text-glass opacity-70"></p>
            <p id="admin-image-debug" class="text-[11px] text-amber-300 break-all">${escHtml("mode="+(appData.round.imageSourceMode||"placeholder")+(appData.round.imageDebug?(" | "+appData.round.imageDebug):""))}</p>
            <button onclick="app.uploadShirtImage(this)" class="w-full glass-btn-primary py-2 text-sm"><i class="fas fa-upload mr-1"></i> บันทึกรูป</button>
            <input id="admin-image" class="glass-input p-2 text-sm" placeholder="หรือวาง URL รูป" value="${(!appData.round.imageRef||isPlaceholderImage(appData.round.imageRef)||/^drivefile:/i.test(appData.round.imageRef))?"":escHtml(appData.round.imageRef)}">
          </div>
        </div>
        <div class="glass-card-inner p-4">
          <h3 class="font-bold text-sm mb-3 text-glass">รอบ / ราคา</h3>
          <div class="space-y-2">
            <input id="admin-year" class="glass-input p-2 text-sm" placeholder="รอบปี" value="${escHtml(appData.round.year)}">
            <input id="admin-name" class="glass-input p-2 text-sm" placeholder="ชื่อสินค้า" value="${escHtml(appData.round.name)}">
            <input id="admin-price" type="number" class="glass-input p-2 text-sm" placeholder="ราคาต่อตัว" value="${appData.round.unitPrice}">
            <button onclick="app.saveRound(this)" class="w-full glass-btn-pea py-2 text-sm">บันทึกรอบ/ราคา</button>
          </div>
        </div>
        <div class="glass-card-inner p-4">
          <h3 class="font-bold text-sm mb-3 text-glass"><i class="fas fa-university mr-1"></i> บัญชีสำหรับการโอนเงิน</h3>
          <p class="text-xs text-glass-dim mb-2">แสดงในหน้าสั่งซื้อเสื้อและรายการสั่งซื้อ (1 บรรทัดต่อข้อมูล)</p>
          <textarea id="admin-transfer-account" class="glass-input text-sm transfer-account-admin-input" rows="3" maxlength="500" placeholder="เลขบัญชี&#10;ธนาคาร&#10;ชื่อบัญชี">${escHtml(String(appData.transferAccount||""))}</textarea>
          <button onclick="app.saveTransferAccount(this)" class="w-full glass-btn-pea py-2 text-sm mt-2"><i class="fas fa-save mr-1"></i> บันทึกบัญชีโอนเงิน</button>
        </div>
        <div class="glass-card-inner p-4">
          <h3 class="font-bold text-sm mb-3 text-glass"><i class="fas fa-headset mr-1"></i> แจ้งปัญหาการใช้งาน</h3>
          <p class="text-xs text-glass-dim mb-2">แสดงด้านล่างทุกหน้าและหน้าเข้าสู่ระบบ (เช่น แจ้งปัญหาการใช้งาน โทร 02-009-6703)</p>
          <input id="admin-support-contact" type="text" class="glass-input text-sm" maxlength="300" placeholder="แจ้งปัญหาการใช้งาน โทร 02-009-6703" value="${escAttr(String(appData.supportContact||DEFAULT_SUPPORT_CONTACT))}">
          <button onclick="app.saveSupportContact(this)" class="w-full glass-btn-pea py-2 text-sm mt-2"><i class="fas fa-save mr-1"></i> บันทึกข้อความแจ้งปัญหา</button>
        </div>
        <div class="glass-card-inner p-4 admin-email-notify-wrap">
          <h3 class="font-bold text-sm mb-3 text-glass"><i class="fas fa-envelope mr-1"></i> แจ้งเตือนอีเมลอัตโนมัติ</h3>
          <p class="text-xs text-glass-dim mb-3">ส่งจากบัญชี Google ของเจ้าของ deployment · เพิ่มอีเมลผู้รับได้หลายรายการ</p>
          <label class="admin-email-toggle text-sm font-semibold flex items-center gap-2 mb-3">
            <input type="checkbox" id="admin-email-notify-enabled">
            <span>เปิดใช้งานการแจ้งเตือนอีเมล</span>
          </label>
          <div class="admin-email-notify-events space-y-2 mb-3">
            <div class="text-xs font-semibold text-glass-dim">เหตุการณ์ที่แจ้ง:</div>
            <label class="admin-email-event text-xs flex items-center gap-2"><input type="checkbox" id="admin-email-event-order"> สั่งซื้อ (ส่งออเดอร์เข้าระบบ)</label>
            <label class="admin-email-event text-xs flex items-center gap-2"><input type="checkbox" id="admin-email-event-payment"> การโอนเงิน (แนบสลิป)</label>
            <label class="admin-email-event text-xs flex items-center gap-2"><input type="checkbox" id="admin-email-event-shipped"> จัดส่งแล้ว / ได้รับแล้ว</label>
          </div>
          <div id="admin-email-recipients-host" class="admin-email-recipients space-y-2 mb-3"></div>
          <div class="flex flex-wrap gap-2 mb-3">
            <input id="admin-email-add-input" type="email" class="glass-input text-sm flex-1 min-w-[12rem]" placeholder="email@example.com">
            <button type="button" onclick="app.addEmailNotifyRecipient()" class="glass-btn-secondary text-xs px-3 py-2"><i class="fas fa-plus mr-1"></i> เพิ่มอีเมล</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" onclick="app.saveEmailNotifySettings(this)" class="glass-btn-pea py-2 text-sm"><i class="fas fa-save mr-1"></i> บันทึกการตั้งค่า</button>
            <button type="button" onclick="app.sendTestEmailNotify(this)" class="glass-btn-blue py-2 text-sm"><i class="fas fa-paper-plane mr-1"></i> ส่งอีเมลทดสอบ</button>
          </div>
        </div>
        <div class="glass-card-inner p-4">
          <h3 class="font-bold text-sm mb-3 text-glass">จำนวนที่มาส่ง</h3>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">${stockInputs}</div>
          <button onclick="app.saveStock(this)" class="w-full glass-btn-primary py-2 text-sm">บันทึกสต็อก</button>
        </div>
        <div class="glass-card-inner p-4">
          <h3 class="font-bold text-sm mb-3 text-glass"><i class="fas fa-users mr-1"></i> จัดการผู้ใช้</h3>
          <div id="admin-ordering-panel" class="admin-ordering-panel mb-3">
            <div class="text-xs text-glass-dim mb-2">ปิดรับสั่งซื้อ — ผู้ใช้เขตยังดูข้อมูลและแนบสลิปออเดอร์เดิมที่ยังไม่ชำระได้</div>
            <div class="flex flex-wrap gap-2 mb-2">
              <button type="button" id="admin-ordering-global-btn" onclick="app.toggleGlobalOrdering(this)" class="glass-btn-secondary text-xs" style="padding:.45rem .75rem"><i class="fas fa-store"></i> <span id="admin-ordering-global-label">…</span></button>
              <button type="button" onclick="app.setAllUsersOrdering(false,this)" class="glass-btn-danger text-xs" style="padding:.45rem .75rem"><i class="fas fa-user-lock"></i> ปิดทุกเขต</button>
              <button type="button" onclick="app.setAllUsersOrdering(true,this)" class="glass-btn-primary text-xs" style="padding:.45rem .75rem"><i class="fas fa-user-check"></i> เปิดทุกเขต</button>
            </div>
          </div>
          <div id="admin-users-list" class="space-y-2 mb-3"><div class="text-xs text-glass-muted text-center">กำลังโหลด...</div></div>
          <button onclick="app.showCreateUser()" class="w-full glass-btn-blue py-2 text-sm"><i class="fas fa-user-plus mr-1"></i> เพิ่มผู้ใช้</button>
        </div>
        <div class="glass-danger-zone">
          <h3 class="font-bold text-sm mb-2"><i class="fas fa-exclamation-triangle mr-1"></i> ล้างข้อมูลทั้งหมด</h3>
          <p class="text-xs mb-3 opacity-80">ลบรายการสั่งซื้อทั้งหมด รีเซ็ตสต็อก (ไม่ลบ Users)</p>
          <button onclick="app.resetData(this)" class="w-full glass-btn-danger py-2 text-sm font-bold">ล้างข้อมูล เริ่มจาก 0</button>
        </div>
        <button onclick="app.exportCSV(this)" class="w-full glass-btn-blue py-2 text-sm"><i class="fas fa-file-csv mr-1"></i> Export CSV ทั้งหมด</button>
      </div>
      <div id="msg-box"></div>`;
  },

  async initAdmin(){
    pendingImageBase64="";
    if(isAdmin()){
      this.syncAdminOrderingPanel_();
      this.syncAdminEmailNotifyPanel_();
      await this.loadUserList();
    }
  },

  syncAdminEmailNotifyPanel_(){
    emailNotifyDraft_=normalizeEmailNotifyDraft_(appData&&appData.emailNotifySettings);
    const enabledEl=document.getElementById("admin-email-notify-enabled");
    const orderEl=document.getElementById("admin-email-event-order");
    const payEl=document.getElementById("admin-email-event-payment");
    const shipEl=document.getElementById("admin-email-event-shipped");
    if(enabledEl)enabledEl.checked=!!emailNotifyDraft_.enabled;
    if(orderEl)orderEl.checked=emailNotifyDraft_.events.orderSubmitted!==false;
    if(payEl)payEl.checked=emailNotifyDraft_.events.paymentSlip!==false;
    if(shipEl)shipEl.checked=emailNotifyDraft_.events.shipped!==false;
    this.renderEmailNotifyRecipients_();
  },

  renderEmailNotifyRecipients_(){
    const host=document.getElementById("admin-email-recipients-host");
    if(!host)return;
    const list=emailNotifyDraft_&&Array.isArray(emailNotifyDraft_.recipients)?emailNotifyDraft_.recipients:[];
    if(!list.length){
      host.innerHTML='<div class="text-xs text-glass-dim text-center py-2">ยังไม่มีอีเมลผู้รับ</div>';
      return;
    }
    host.innerHTML=list.map(function(email,idx){
      return `<div class="admin-email-recipient-row flex items-center gap-2">
        <span class="text-xs flex-1 break-all">${escHtml(email)}</span>
        <button type="button" class="glass-btn-danger text-xs px-2 py-1" onclick="app.removeEmailNotifyRecipient(${idx})"><i class="fas fa-trash"></i></button>
      </div>`;
    }).join("");
  },

  addEmailNotifyRecipient(){
    if(!emailNotifyDraft_)emailNotifyDraft_=defaultEmailNotifyDraft_();
    const input=document.getElementById("admin-email-add-input");
    const email=String(input&&input.value||"").trim().toLowerCase();
    if(!isValidEmailNotifyInput_(email))return this.showMsg("รูปแบบอีเมลไม่ถูกต้อง","error");
    if(emailNotifyDraft_.recipients.indexOf(email)>-1)return this.showMsg("อีเมลนี้มีในรายการแล้ว","error");
    if(emailNotifyDraft_.recipients.length>=20)return this.showMsg("เพิ่มได้สูงสุด 20 อีเมล","error");
    emailNotifyDraft_.recipients.push(email);
    if(input)input.value="";
    this.renderEmailNotifyRecipients_();
  },

  removeEmailNotifyRecipient(idx){
    if(!emailNotifyDraft_||!Array.isArray(emailNotifyDraft_.recipients))return;
    emailNotifyDraft_.recipients.splice(Number(idx)||0,1);
    this.renderEmailNotifyRecipients_();
  },

  collectEmailNotifyConfigFromForm_(){
    if(!emailNotifyDraft_)emailNotifyDraft_=defaultEmailNotifyDraft_();
    return {
      enabled:!!document.getElementById("admin-email-notify-enabled")?.checked,
      events:{
        orderSubmitted:!!document.getElementById("admin-email-event-order")?.checked,
        paymentSlip:!!document.getElementById("admin-email-event-payment")?.checked,
        shipped:!!document.getElementById("admin-email-event-shipped")?.checked
      },
      recipients:emailNotifyDraft_.recipients.slice()
    };
  },

  async saveEmailNotifySettings(btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    const config=this.collectEmailNotifyConfigFromForm_();
    if(config.enabled&&!config.recipients.length)return this.showMsg("เปิดใช้งานแล้วต้องมีอีเมลผู้รับอย่างน้อย 1 รายการ","error");
    try{
      const r=await runSaving({btn:btn,busyText:"กำลังบันทึก…"},()=>callAuthed("saveEmailNotifySettings",config));
      emailNotifyDraft_=normalizeEmailNotifyDraft_(r&&r.emailNotifySettings?r.emailNotifySettings:config);
      if(appData)appData.emailNotifySettings=emailNotifyDraft_;
      this.syncAdminEmailNotifyPanel_();
      this.showMsg("บันทึกการตั้งค่าแจ้งเตือนอีเมลแล้ว","success");
    }catch(e){this.showMsg(e.message||"บันทึกไม่สำเร็จ","error");}
  },

  async sendTestEmailNotify(btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    const config=this.collectEmailNotifyConfigFromForm_();
    if(!config.recipients.length)return this.showMsg("กรุณาเพิ่มอีเมลผู้รับก่อน","error");
    try{
      await runSaving({btn:btn,busyText:"กำลังส่ง…"},async()=>{
        await callAuthed("saveEmailNotifySettings",config);
        return await callAuthed("sendTestEmailNotify");
      });
      emailNotifyDraft_=normalizeEmailNotifyDraft_(config);
      if(appData)appData.emailNotifySettings=emailNotifyDraft_;
      this.showMsg("ส่งอีเมลทดสอบแล้ว — ตรวจกล่องจดหมาย (รวม Spam)","success");
    }catch(e){this.showMsg(e.message||"ส่งอีเมลทดสอบไม่สำเร็จ","error");}
  },

  syncAdminOrderingPanel_(){
    const label=document.getElementById("admin-ordering-global-label");
    const btn=document.getElementById("admin-ordering-global-btn");
    if(!label)return;
    const open=appData&&appData.orderingGlobalEnabled!==false;
    label.textContent=open?"ปิดรับสั่งซื้อทั้งระบบ":"เปิดรับสั่งซื้อทั้งระบบ";
    if(btn){
      btn.classList.toggle("glass-btn-danger",open);
      btn.classList.toggle("glass-btn-secondary",!open);
    }
  },

  async toggleGlobalOrdering(btn){
    const open=appData&&appData.orderingGlobalEnabled!==false;
    try{
      await runSaving({btn:btn,busyText:"กำลังบันทึก…"},()=>callAuthed("saveOrderingGlobal",!open));
      if(appData)appData.orderingGlobalEnabled=!open;
      this.syncAdminOrderingPanel_();
      this.renderNav();
      this.showMsg(open?"ปิดรับสั่งซื้อทั้งระบบแล้ว":"เปิดรับสั่งซื้อทั้งระบบแล้ว","success");
    }catch(e){this.showMsg(e.message,"error");}
  },

  async setAllUsersOrdering(enabled,btn){
    const msg=enabled?"เปิดการสั่งซื้อทุกเขต?":"ปิดการสั่งซื้อทุกเขต? (ยังดูข้อมูลและแนบสลิปได้)";
    if(!confirm(msg))return;
    try{
      const r=await runSaving({btn:btn,busyText:"กำลังบันทึก…"},()=>callAuthed("setAllUsersOrderingEnabled",!!enabled));
      await ensureAppData(true);
      this.syncAdminOrderingPanel_();
      await this.loadUserList();
      this.showMsg((enabled?"เปิด":"ปิด")+"การสั่งซื้อ "+(r&&r.updated!=null?r.updated:0)+" บัญชีแล้ว","success");
    }catch(e){this.showMsg(e.message,"error");}
  },

  async toggleUserOrdering(username,enabled,btn){
    try{
      await runSaving({btn:btn,busyText:"กำลังบันทึก…"},()=>callAuthed("updateUser",username,{orderingEnabled:!!enabled}));
      await this.loadUserList();
      this.showMsg((enabled?"เปิด":"ปิด")+"การสั่งซื้อ "+username+" แล้ว","success");
    }catch(e){this.showMsg(e.message,"error");}
  },

  async loadUserList(){
    const el=document.getElementById("admin-users-list");
    if(!el)return;
    const gen=++loadUserListGen_;
    el.innerHTML='<div class="text-xs text-glass-muted text-center">กำลังโหลด...</div>';
    try{
      const users=await callAuthedWithTimeout(45000,"listUsers");
      if(gen!==loadUserListGen_||!document.getElementById("admin-users-list"))return;
      if(!users||users.length===0){el.innerHTML='<div class="text-xs text-glass-muted text-center">ไม่มีผู้ใช้</div>';return}
      const myU=String(me&&me.username||"").trim().toLowerCase();
      el.innerHTML=users.map(u=>{
        const roleCls=u.role==="admin"?"role-badge-admin":(u.role==="engineer"?"role-badge-engineer":(u.role===ROLE_ENG_READONLY?"role-badge-eng-readonly":(u.role==="viewer"?"role-badge-user":"role-badge-user")));
        const roleLabel=u.role==="admin"?"แอดมิน":(u.role==="engineer"?`${ROLE_ENGINEER_LABEL} (แอดมินรอง)`:(u.role===ROLE_ENG_READONLY?ROLE_ENG_READONLY_LABEL:(u.role==="viewer"?"ผู้ดูข้อมูล":"ผู้ใช้")));
        const uKey=escAttr(u.username);
        const canDel=String(u.username||"").trim().toLowerCase()!==myU;
        const canToggleOrder=u.role==="user"||u.role===ROLE_ENGINEER;
        const orderOpen=u.orderingEnabled!==false;
        const orderBadge=canToggleOrder
          ?`<span class="admin-ordering-badge ${orderOpen?"admin-ordering-open":"admin-ordering-closed"}">${orderOpen?"เปิดสั่ง":"ปิดสั่ง"}</span>`
          :"";
        const orderBtn=canToggleOrder
          ?`<button type="button" class="${orderOpen?"glass-btn-danger":"glass-btn-primary"} admin-user-ordering" data-username="${uKey}" data-enabled="${orderOpen?"0":"1"}" title="${orderOpen?"ปิดการสั่งซื้อ":"เปิดการสั่งซื้อ"}" style="padding:.35rem .5rem;min-width:38px;min-height:38px"><i class="fas fa-${orderOpen?"ban":"cart-plus"}"></i></button>`
          :"";
        return `<div class="glass-card-inner p-2 flex justify-between items-center gap-2 flex-wrap" data-admin-user="${uKey}">
          <div style="min-width:0;flex:1 1 60%">
            <div class="text-sm font-bold text-glass" style="word-break:break-word">${escHtml(u.username)} <span class="${roleCls}">${roleLabel}</span> ${orderBadge}</div>
            <div class="text-xs text-glass-muted">${escHtml(u.displayName||"")} · ${escHtml(u.region||"-")}</div>
          </div>
          <div class="flex gap-1" style="flex-shrink:0">
            ${orderBtn}
            <button type="button" class="glass-btn admin-user-pwd" data-username="${uKey}" title="ดูรหัสผ่าน" style="padding:.35rem .5rem;min-width:38px;min-height:38px"><i class="fas fa-eye"></i></button>
            <button type="button" class="glass-btn admin-user-reset" data-username="${uKey}" title="รีเซ็ตรหัสผ่าน" style="padding:.35rem .5rem;min-width:38px;min-height:38px"><i class="fas fa-key"></i></button>
            ${canDel?`<button type="button" class="glass-btn-danger admin-user-del" data-username="${uKey}" title="ลบ" style="padding:.35rem .5rem;min-width:38px;min-height:38px"><i class="fas fa-trash"></i></button>`:""}
          </div>
        </div>`;
      }).join("");
      if(!el.dataset.actionsBound){
        el.dataset.actionsBound="1";
        el.addEventListener("click",(ev)=>{
          const t=ev.target&&ev.target.closest?ev.target.closest("button[data-username]"):null;
          if(!t||!el.contains(t))return;
          const name=t.getAttribute("data-username")||"";
          if(t.classList.contains("admin-user-ordering")){
            app.toggleUserOrdering(name,t.getAttribute("data-enabled")==="1",t);
          }else if(t.classList.contains("admin-user-pwd"))app.showUserPassword(name,t);
          else if(t.classList.contains("admin-user-reset"))app.resetUserPwd(name,t);
          else if(t.classList.contains("admin-user-del"))app.deleteUserPrompt(name,t);
        });
      }
    }catch(e){
      if(gen!==loadUserListGen_||!document.getElementById("admin-users-list"))return;
      el.innerHTML=`<div class="text-xs text-red-glass text-center">${escHtml(e.message||"โหลดรายชื่อผู้ใช้ไม่สำเร็จ")}<br><button type="button" class="glass-btn-secondary text-xs mt-2" style="padding:.35rem .65rem" onclick="app.loadUserList()">ลองใหม่</button></div>`;
    }
  },

  showCreateUser(){
    const html=`
      <div class="login-overlay" id="create-user-modal">
        <div class="login-card">
          <div class="login-title">เพิ่มผู้ใช้</div>
          <div class="space-y-2">
            <input id="nu-username" class="glass-input" placeholder="ชื่อผู้ใช้">
            <input id="nu-display" class="glass-input" placeholder="ชื่อแสดง">
            <input id="nu-password" type="password" class="glass-input" placeholder="รหัสผ่าน (อย่างน้อย 4 ตัว)">
            <select id="nu-role" class="glass-select" onchange="app.toggleNewUserRegion(this.value)">
              <option value="user">ผู้ใช้</option>
              <option value="engineer">${ROLE_ENGINEER_LABEL} (แอดมินรอง)</option>
              <option value="${ROLE_ENG_READONLY}">${ROLE_ENG_READONLY_LABEL}</option>
              <option value="admin">แอดมิน</option>
            </select>
            <p id="nu-role-hint" class="text-xs text-glass-dim hidden"></p>
            <label id="nu-region-label" class="glass-label">เขต / สิทธิ์เขต</label>
            <select id="nu-region" class="glass-select"></select>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <button onclick="app.closeCreateUser()" class="glass-btn-secondary py-2">ยกเลิก</button>
              <button onclick="app.submitNewUser(this)" class="glass-btn-primary py-2">บันทึก</button>
            </div>
          </div>
        </div>
      </div>`;
    const wrap=document.createElement("div");
    wrap.innerHTML=html;
    document.body.appendChild(wrap.firstElementChild);
    this.toggleNewUserRegion("user");
  },

  rebuildNewUserRegionOptions_(role){
    const sel=document.getElementById("nu-region");
    if(!sel)return;
    const prev=sel.value;
    let html="";
    if(role==="admin"||role===ROLE_ENG_READONLY){
      html='<option value="*">* (ทุกเขต — '+(role==="admin"?"แอดมิน":ROLE_ENG_READONLY_LABEL)+')</option>';
    }else{
      (appData?.regions||[]).forEach(r=>{html+=`<option value="${escHtml(r)}">${escHtml(r)}</option>`});
    }
    sel.innerHTML=html;
    if(role==="admin"||role===ROLE_ENG_READONLY)sel.value="*";
    else if(prev&&prev!=="*"&&Array.from(sel.options).some(o=>o.value===prev))sel.value=prev;
    else if(role===ROLE_ENGINEER)sel.value="สำนักงานใหญ่";
    else if(sel.options.length)sel.value=sel.options[0].value;
  },

  toggleNewUserRegion(role){
    const hint=document.getElementById("nu-role-hint");
    const label=document.getElementById("nu-region-label");
    this.rebuildNewUserRegionOptions_(role);
    if(role===ROLE_ENGINEER){
      if(hint){
        hint.classList.remove("hidden");
        hint.textContent="ดูข้อมูลทุกเขตได้ ไม่เข้าหน้าแอดมิน — เลือกเขตที่ใช้สั่งเสื้อ (ไม่ใช่ * ทุกเขต)";
      }
      if(label)label.textContent="เขตที่ใช้สั่งเสื้อ *";
    }else if(role===ROLE_ENG_READONLY){
      if(hint){
        hint.classList.remove("hidden");
        hint.textContent="ดูทุกอย่างเหมือนแอดมิน (รายงาน/แจกฟรี/รับ-จัดส่ง) แต่แก้ไขไม่ได้ — สิทธิ์เขต * ทุกเขต";
      }
      if(label)label.textContent="สิทธิ์เขต";
    }else if(role==="admin"){
      if(hint){
        hint.classList.remove("hidden");
        hint.textContent="แอดมินเต็มสิทธิ์ รวมหน้าตั้งค่าระบบ";
      }
      if(label)label.textContent="สิทธิ์เขต";
    }else{
      if(hint)hint.classList.add("hidden");
      if(label)label.textContent="เขต";
    }
  },

  closeCreateUser(){
    const m=document.getElementById("create-user-modal");
    if(m)m.remove();
  },

  async submitNewUser(btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    try{
      const role=document.getElementById("nu-role").value;
      let region=document.getElementById("nu-region").value;
      if(role===ROLE_ENG_READONLY)region="*";
      if(role===ROLE_ENGINEER&&(!region||region==="*")){
        region="สำนักงานใหญ่";
        const sel=document.getElementById("nu-region");
        if(sel)sel.value=region;
      }
      const payload={
        username:document.getElementById("nu-username").value.trim(),
        displayName:document.getElementById("nu-display").value.trim(),
        password:String(document.getElementById("nu-password").value||"").trim(),
        role:role,
        region:region
      };
      if(payload.password.length<4){alert("รหัสผ่านต้องอย่างน้อย 4 ตัว");return}
      if(payload.role===ROLE_ENG_READONLY)payload.region="*";
      if(payload.role===ROLE_ENGINEER&&(!payload.region||payload.region==="*")){
        alert(ROLE_ENGINEER_LABEL+" ต้องเลือกเขตที่ใช้สั่งเสื้อ (เช่น สำนักงานใหญ่) ไม่ใช่ * ทุกเขต");
        return;
      }
      await runSaving({btn:btn,busyText:"กำลังบันทึกผู้ใช้…"},()=>callAuthed("createUser",payload));
      this.closeCreateUser();
      this.showMsg("เพิ่มผู้ใช้แล้ว","success");
      await this.loadUserList();
    }catch(e){alert(e.message||"เพิ่มไม่สำเร็จ")}
  },

  async showUserPassword(username,btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    try{
      const r=await runSaving({btn:btn,btnText:"",busyText:"…"},()=>callAuthed("getUserPassword",username));
      if(!r||!r.hasPassword){
        this.showMsg("ยังไม่มีรหัสที่บันทึกไว้ — รีเซ็ตรหัสผ่านเพื่อให้ดูได้","warning");
        return;
      }
      const html=`
        <div class="login-overlay" id="view-pwd-modal" onclick="if(event.target===this)app.closeViewPassword()">
          <div class="login-card" onclick="event.stopPropagation()">
            <div class="login-title">รหัสผ่าน — ${escHtml(username)}</div>
            ${r.region?`<p class="text-xs text-glass-muted mb-2">เขต: ${escHtml(r.region)}</p>`:""}
            <div class="glass-card-inner p-3 mb-3 font-mono text-sm break-all select-all" id="view-pwd-text">${escHtml(r.password)}</div>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" onclick="app.copyViewPassword()" class="glass-btn-blue py-2 text-sm"><i class="fas fa-copy mr-1"></i> คัดลอก</button>
              <button type="button" onclick="app.closeViewPassword()" class="glass-btn-secondary py-2 text-sm">ปิด</button>
            </div>
          </div>
        </div>`;
      const wrap=document.createElement("div");
      wrap.innerHTML=html;
      document.body.appendChild(wrap.firstElementChild);
    }catch(e){this.showMsg(e.message||"โหลดรหัสไม่สำเร็จ","error")}
  },

  copyViewPassword(){
    const el=document.getElementById("view-pwd-text");
    const t=el?el.textContent:"";
    if(!t)return;
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(t).then(()=>this.showMsg("คัดลอกแล้ว","success")).catch(()=>{});
      return;
    }
    const ta=document.createElement("textarea");
    ta.value=t;document.body.appendChild(ta);ta.select();
    try{document.execCommand("copy");this.showMsg("คัดลอกแล้ว","success");}catch(_){}
    ta.remove();
  },

  closeViewPassword(){
    const m=document.getElementById("view-pwd-modal");
    if(m)m.remove();
  },

  async resetUserPwd(username,btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    const np=String(prompt("รหัสผ่านใหม่สำหรับ "+username+" (อย่างน้อย 4 ตัว):")||"").trim();
    if(!np)return;
    if(np.length<4){this.showMsg("รหัสผ่านต้องอย่างน้อย 4 ตัว","error");return}
    try{
      await runSaving({btn:btn,btnText:"",busyText:"กำลังรีเซ็ตรหัสผ่าน…"},()=>callAuthed("resetPassword",username,np));
      this.showMsg("รีเซ็ตรหัสผ่านแล้ว","success");
    }catch(e){this.showMsg(e.message,"error")}
  },

  async deleteUserPrompt(username,btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    const uname=String(username||"").trim();
    if(!uname)return;
    if(!confirm("ลบผู้ใช้ "+uname+"?"))return;
    const card=btn&&btn.closest?btn.closest("[data-admin-user]"):null;
    try{
      const res=await runSaving({btn:btn,btnText:"",busyText:"กำลังลบผู้ใช้…"},()=>callAuthed("deleteUser",uname));
      if(card)card.remove();
      this.showMsg((res&&res.deleted>1)?`ลบผู้ใช้แล้ว (${res.deleted} แถวซ้ำ)`:"ลบผู้ใช้แล้ว","success");
      await this.loadUserList();
    }catch(e){this.showMsg(e.message,"error")}
  },

  async applyUploadedImageRef(imageRef, sourceLabel, displayUrlFromServer, sourceModeFromServer, thumbFromServer){
    const ref=String(imageRef||"").trim();
    if(!ref)return {url:SHIRT_PLACEHOLDER_URL,warning:"ไม่มี image reference"};
    const thumb=String(thumbFromServer||"");
    let displayUrl=String(displayUrlFromServer||"").trim();
    let sourceMode=String(sourceModeFromServer||"").trim();
    let resolvedWarning="";
    if(!displayUrl){
      clearRoundImageProxyCache(ref);
      const resolved=await resolveRoundImageForDisplay(ref,true);
      displayUrl=resolved.url||"";
      resolvedWarning=resolved.warning||"";
      sourceMode=displayUrl&&!isPlaceholderImage(displayUrl)?"proxy":"placeholder";
    }
    if(!displayUrl&&isValidRoundUrl(ref)){
      displayUrl=ref;
      sourceMode="url";
    }
    if(!displayUrl&&thumb&&isDataUrl(thumb)){
      displayUrl=thumb;
      sourceMode="thumb";
    }
    if(!displayUrl){
      displayUrl=SHIRT_PLACEHOLDER_URL;
      sourceMode="placeholder";
    }
    const bustStamp=Date.now();
    const finalSrc=updateRoundImageElements(displayUrl,ref,bustStamp);
    if(appData&&appData.round){
      appData.round.imageUrl=ref;
      appData.round.imageRef=ref;
      appData.round.imageDataThumb=thumb;
      appData.round.imageDisplayUrl=displayUrl;
      appData.round.imageSourceMode=sourceMode||"placeholder";
      appData.round.imageDisplaySrc=finalSrc;
      appData.round.imageWarning=resolvedWarning;
      appData.round.imageDebug=resolvedWarning
        ? ("upload-"+sourceLabel+": "+resolvedWarning)
        : ("upload-"+sourceLabel+": ok");
    }
    setImageDebug((appData&&appData.round&&appData.round.imageDebug)||"");
    return {url:displayUrl,warning:resolvedWarning,mode:sourceMode||"placeholder"};
  },

  async previewShirtImage(input){
    if(!(input.files&&input.files[0]))return;
    pendingImageBase64=await prepareShirtImageBase64ForUpload_(input.files[0]);
    document.getElementById("admin-image-preview").src=pendingImageBase64;
    setImageDebug("preview: local image selected");
    document.getElementById("admin-image-filename").textContent=input.files[0].name;
  },

  async uploadShirtImage(btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    try{
      let base64=pendingImageBase64||"";
      if(!base64){
        const fi=document.getElementById("admin-image-file");
        if(fi.files&&fi.files[0])base64=await prepareShirtImageBase64ForUpload_(fi.files[0]);
      }
      if(!base64)return this.showMsg("กรุณาเลือกรูปก่อน","error");
      const thumb=await compressShirtThumbForSheet_(base64);
      const r=await runSaving({btn:btn,busyText:"กำลังอัปโหลดรูป…"},()=>callAuthed("uploadShirtImage",base64,thumb));
      if(!r||r.ok===false){
        this.showMsg((r&&r.warning)||"อัปโหลดรูปไม่สำเร็จ","warning");
        setImageDebug("upload-failed: "+((r&&r.warning)||"unknown"));
        return;
      }
      pendingImageBase64="";
      const immediate=await this.applyUploadedImageRef(r.imageUrl,"admin",r.imageDisplayUrl,r.imageSourceMode,r.imageDataThumb);
      this.showMsg("อัปโหลดรูปเรียบร้อย","success");
      if(r.imageUrl){
        document.getElementById("admin-image").value=/^drivefile:/i.test(r.imageUrl)?"":r.imageUrl;
      }
      invalidateClientCache();
      await ensureAppData(true);
      if(appData&&appData.round){
        updateRoundImageElements(appData.round.imageDisplayUrl||immediate.url,r.imageUrl,Date.now());
        setImageDebug(appData.round.imageDebug||"");
      }
      if(r.warning){
        setTimeout(()=>this.showMsg(r.warning,"warning"),900);
      }
    }catch(e){this.showMsg(e.message,"error")}
  },

  async uploadShirtImageInline(input){
    if(!(input.files&&input.files[0]))return;
    try{
      this.showMsg("กำลังอัปโหลด...","success");
      const b=await prepareShirtImageBase64ForUpload_(input.files[0]);
      const img=document.getElementById("stock-shirt-image");
      const prevSrc=img?img.src:"";
      if(img)img.src=b;
      const thumb=await compressShirtThumbForSheet_(b);
      const r=await runSaving({busyText:"กำลังอัปโหลดรูป…"},()=>callAuthed("uploadShirtImage",b,thumb));
      if(!r||r.ok===false){
        if(img&&prevSrc)img.src=prevSrc;
        this.showMsg((r&&r.warning)||"อัปโหลดรูปไม่สำเร็จ","warning");
        setImageDebug("upload-inline-failed: "+((r&&r.warning)||"unknown"));
        return;
      }
      await this.applyUploadedImageRef(r.imageUrl,"inline",r.imageDisplayUrl,r.imageSourceMode,r.imageDataThumb);
      this.showMsg("อัปโหลดเรียบร้อย","success");
      invalidateClientCache();
      await ensureAppData(true);
      if(appData&&appData.round&&appData.round.imageDisplayUrl){
        updateRoundImageElements(appData.round.imageDisplayUrl,r.imageUrl,Date.now());
      }
      if(r.warning){
        setTimeout(()=>this.showMsg(r.warning,"warning"),900);
      }
    }catch(e){this.showMsg(e.message||"อัปโหลดไม่สำเร็จ","error")}
    finally{try{input.value=""}catch(_){}}
  },

  onShirtImageError(imgEl,isAdminPreview){
    if(!imgEl)return;
    const alreadyFallback=imgEl.getAttribute("data-fallback")==="1";
    if(alreadyFallback)return;
    const ref=imgEl.getAttribute("data-image-ref")||"";
    if(ref&&imgEl.getAttribute("data-retry")!=="1"){
      imgEl.setAttribute("data-retry","1");
      const self=this;
      resolveRoundImageForDisplay(ref,true).then(function(r){
        if(r&&r.url&&!isPlaceholderImage(r.url)){
          imgEl.removeAttribute("data-retry");
          imgEl.src=withCacheBust(r.url,Date.now());
          return;
        }
        self.onShirtImageError(imgEl,isAdminPreview);
      }).catch(function(){
        self.onShirtImageError(imgEl,isAdminPreview);
      });
      return;
    }
    const reason="onerror src="+String(imgEl.currentSrc||imgEl.src||"");
    console.warn("[shirt-image] load failed",reason);
    if(isAdminPreview){
      setImageDebug("image-load-failed: "+reason);
    }
    imgEl.setAttribute("data-fallback","1");
    imgEl.src=SHIRT_PLACEHOLDER_URL;
    if(!isAdminPreview){
      this.showMsg("รูปเสื้อโหลดไม่สำเร็จ — ลองรีเฟรช หรือให้แอดมินอัปโหลดรูปใหม่","warning");
    }
  },

  onShirtImageLoaded(imgEl,isAdminPreview){
    if(!imgEl)return;
    imgEl.removeAttribute("data-fallback");
    if(isAdminPreview){
      const src=String(imgEl.currentSrc||imgEl.src||"");
      setImageDebug("image-loaded: "+src.slice(0,120));
    }
  },

  async saveTransferAccount(btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    try{
      const text=String(document.getElementById("admin-transfer-account")?.value||"").trim();
      const r=await runSaving({btn:btn,busyText:"กำลังบันทึกบัญชี…"},()=>callAuthed("saveTransferAccount",text));
      if(appData&&r&&r.transferAccount)appData.transferAccount=r.transferAccount;
      this.showMsg("บันทึกบัญชีโอนเงินแล้ว","success");
      invalidateClientCache();
      scheduleBackgroundBootstrapSync_();
    }catch(e){this.showMsg(e.message||"บันทึกไม่สำเร็จ","error")}
  },

  async saveSupportContact(btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    try{
      const text=String(document.getElementById("admin-support-contact")?.value||"").trim();
      const r=await runSaving({btn:btn,busyText:"กำลังบันทึก…"},()=>callAuthed("saveSupportContact",text));
      if(appData&&r&&r.supportContact)appData.supportContact=r.supportContact;
      updateSupportFooter_();
      this.showMsg("บันทึกข้อความแจ้งปัญหาแล้ว","success");
      invalidateClientCache();
      scheduleBackgroundBootstrapSync_();
    }catch(e){this.showMsg(e.message||"บันทึกไม่สำเร็จ","error")}
  },

  async saveRound(btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    try{
      const payload={
        year:document.getElementById("admin-year").value,
        name:document.getElementById("admin-name").value,
        unitPrice:Number(document.getElementById("admin-price").value),
        imageUrl:document.getElementById("admin-image").value
      };
      if(pendingImageBase64)payload.imageBase64=pendingImageBase64;
      const r=await runSaving({btn:btn,busyText:"กำลังบันทึกรอบ/ราคา…"},()=>callAuthed("saveRoundConfig",payload));
      pendingImageBase64="";
      this.showMsg("บันทึกรอบ/ราคาเรียบร้อย","success");
      if(r&&r.warning){
        setTimeout(()=>this.showMsg(r.warning,"warning"),900);
      }
      if(r&&r.imageUrl){
        await this.applyUploadedImageRef(r.imageUrl,"save-round",r.imageDisplayUrl,r.imageSourceMode,r.imageDataThumb);
      }
      invalidateClientCache();
      await ensureAppData(true);
      if(appData&&appData.round){
        updateRoundImageElements(appData.round.imageDisplayUrl,appData.round.imageRef||r.imageUrl,Date.now());
        setImageDebug(appData.round.imageDebug||"");
      }
    }catch(e){this.showMsg(e.message,"error")}
  },

  async saveStock(btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    try{
      const updates=appData.stock.map((s,i)=>({size:s.size,delivered:Number(document.getElementById("stock-del-"+i).value||0)}));
      await runSaving({btn:btn,busyText:"กำลังบันทึกสต็อก…"},async()=>{
        await callAuthed("saveStockDelivered",updates);
        invalidateClientCache();
        await ensureAppData(true);
      });
      this.showMsg("บันทึกสต็อกเรียบร้อย","success");
      app.navigate("admin");
    }catch(e){this.showMsg(e.message,"error")}
  },

  async resetData(btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    if(!confirm("ยืนยันล้างข้อมูลทั้งหมด?"))return;
    try{
      const r=await runSaving({btn:btn,busyText:"กำลังล้างข้อมูล…"},async()=>{
        const res=await callAuthed("resetAllData");
        invalidateClientCache();
        await ensureAppData(true);
        return res;
      });
      this.showMsg(r.message,"success");
      setTimeout(()=>app.navigate("stock"),1500);
    }catch(e){this.showMsg(e.message,"error")}
  },

  async exportCSV(btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    try{
      const rows=await runSaving({btn:btn,busyText:"กำลังสร้างไฟล์ CSV…"},()=>callAuthed("exportAllDataCsv","all"));
      const csvText="\uFEFF"+rows.map(r=>r.map(c=>`"${String(c==null?"":c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
      const blob=new Blob([csvText],{type:"text/csv;charset=utf-8"});
      const link=document.createElement("a");
      link.href=URL.createObjectURL(blob);
      const stamp=new Date().toISOString().slice(0,10);
      link.download="peace_export_"+String(appData?.round?.year||"data")+"_"+stamp+".csv";
      link.click();
      URL.revokeObjectURL(link.href);
      this.showMsg("ดาวน์โหลด CSV แล้ว","success");
    }catch(e){this.showMsg(e.message||"สร้างไฟล์ไม่สำเร็จ","error")}
  },

  // ── Custom dropdown controller ─────────────────────────────────────
  toggleDropdown(ddId,ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    if(activeDropdown&&activeDropdown.ddId===ddId){this.closeDropdownPanel();return;}
    this.closeDropdownPanel();
    this.openDropdownPanel(ddId);
  },

  openDropdownPanel(ddId){
    const cfg=dropdownRegistry[ddId];
    const host=document.getElementById(ddId);
    if(!cfg||!host)return;
    const toggle=host.querySelector(".glass-dd-toggle");
    const input=host.querySelector('input[type="hidden"]');
    const curVal=input?input.value:"";
    const panel=document.createElement("div");
    panel.className="glass-dd-floating fade-in";
    panel.setAttribute("role","listbox");
    panel.innerHTML=(cfg.options||[]).map(opt=>{
      const active=opt===curVal;
      return `<button type="button" role="option" aria-selected="${active?'true':'false'}" tabindex="-1" class="glass-dd-option ${active?'is-active':''}" data-val="${escHtml(opt)}"><span>${escHtml(opt)}</span>${active?'<i class="fas fa-check"></i>':''}</button>`;
    }).join("");
    panel.addEventListener("click",e=>{
      const btn=e.target.closest(".glass-dd-option");
      if(!btn)return;
      e.preventDefault();e.stopPropagation();
      app.selectDropdownOption(ddId,btn.getAttribute("data-val"));
    });
    document.body.appendChild(panel);
    const rect=toggle.getBoundingClientRect();
    const width=Math.max(rect.width,160);
    panel.style.width=width+"px";
    const panelH=panel.offsetHeight;
    const spaceBelow=window.innerHeight-rect.bottom;
    let top=(spaceBelow<panelH+10&&rect.top>panelH+10)?(rect.top-panelH-6):(rect.bottom+6);
    let left=rect.left;
    if(left+width>window.innerWidth-8)left=window.innerWidth-8-width;
    if(left<8)left=8;
    panel.style.top=Math.max(8,top)+"px";
    panel.style.left=left+"px";
    host.classList.add("is-open");
    if(toggle)toggle.setAttribute("aria-expanded","true");
    activeDropdown={ddId:ddId,panelEl:panel};
    const first=panel.querySelector(".glass-dd-option.is-active")||panel.querySelector(".glass-dd-option");
    if(first){first.setAttribute("tabindex","0");setTimeout(()=>{try{first.focus({preventScroll:true})}catch(_){}},0);}
    setTimeout(()=>{
      document.addEventListener("click",app._ddAway,true);
      document.addEventListener("keydown",app._ddKey,true);
      window.addEventListener("scroll",app._ddScrollClose,true);
      window.addEventListener("resize",app._ddScrollClose,true);
    },0);
  },

  closeDropdownPanel(){
    document.removeEventListener("click",app._ddAway,true);
    document.removeEventListener("keydown",app._ddKey,true);
    window.removeEventListener("scroll",app._ddScrollClose,true);
    window.removeEventListener("resize",app._ddScrollClose,true);
    if(!activeDropdown)return;
    const host=document.getElementById(activeDropdown.ddId);
    if(host){host.classList.remove("is-open");const t=host.querySelector(".glass-dd-toggle");if(t)t.setAttribute("aria-expanded","false");}
    const p=activeDropdown.panelEl;
    if(p&&p.parentNode)p.parentNode.removeChild(p);
    activeDropdown=null;
  },

  selectDropdownOption(ddId,val){
    const cfg=dropdownRegistry[ddId];
    const host=document.getElementById(ddId);
    if(host){
      const input=host.querySelector('input[type="hidden"]');
      if(input)input.value=val;
      const label=document.getElementById(ddId+"-label");
      if(label)label.textContent=val;
      if(cfg&&cfg.compact){
        host.classList.remove("status-ได้รับแล้ว","status-รอตรวจชำระ","status-รอจัดส่ง","status-จัดส่งแล้ว","status-รับแล้ว","status-รอโอน","status-รอรับ");
        host.classList.add(statusClass(val));
      }
    }
    this.closeDropdownPanel();
    if(cfg&&typeof cfg.onSelect==="function"){
      try{cfg.onSelect(val)}catch(e){this.showMsg(e.message||"เกิดข้อผิดพลาด","error")}
    }
  },

  _ddAway(e){
    if(!activeDropdown)return;
    if(activeDropdown.panelEl&&activeDropdown.panelEl.contains(e.target))return;
    const host=document.getElementById(activeDropdown.ddId);
    if(host&&host.contains(e.target))return;
    app.closeDropdownPanel();
  },

  _ddKey(e){
    if(!activeDropdown)return;
    if(e.key==="Escape"){
      e.preventDefault();
      const id=activeDropdown.ddId;
      app.closeDropdownPanel();
      const host=document.getElementById(id);
      const t=host&&host.querySelector(".glass-dd-toggle");
      if(t)try{t.focus()}catch(_){}
      return;
    }
    const opts=Array.prototype.slice.call(activeDropdown.panelEl.querySelectorAll(".glass-dd-option"));
    if(!opts.length)return;
    let idx=opts.indexOf(document.activeElement);
    if(e.key==="ArrowDown"){e.preventDefault();idx=idx<0?0:(idx+1)%opts.length;opts[idx].focus({preventScroll:true});}
    else if(e.key==="ArrowUp"){e.preventDefault();idx=idx<=0?opts.length-1:idx-1;opts[idx].focus({preventScroll:true});}
    else if(e.key==="Enter"||e.key===" "){
      const act=document.activeElement;
      if(act&&act.classList&&act.classList.contains("glass-dd-option")){
        e.preventDefault();
        app.selectDropdownOption(activeDropdown.ddId,act.getAttribute("data-val"));
      }
    }
  },

  _ddScrollClose(e){
    if(activeDropdown&&activeDropdown.panelEl&&e&&e.target&&activeDropdown.panelEl.contains(e.target))return;
    app.closeDropdownPanel();
  },

  showMsg(msg,type){
    notifyUser_(msg,type);
    const box=document.getElementById("msg-box");
    if(!box)return;
    if(hasOpenModal_())return;
    const isWarn=type==="warning";
    const color=type==="success"||isWarn?"glass-msg-success":"glass-msg-error";
    const text=isWarn?`⚠️ ${msg}`:msg;
    box.innerHTML=`<div class="text-sm text-center font-semibold fade-in ${color}">${escHtml(text)}</div>`;
    setTimeout(()=>{box.innerHTML=""},3500);
  }
};

syncWindowSession_();

// ── Boot ─────────────────────────────────────────────────────────────
function bootEntry(){
  if(window.__peaceBootStarted)return;
  window.__peaceBootStarted=true;
  syncAppBranding_();
  try{
    app.container=document.getElementById("app-container");
    authToken=readAuthToken_();
    if(!authToken){hydrateLoginScreen_();return}
    showBootRestoring_();
    let settled=false;
    const fallback=setTimeout(()=>{
      if(settled)return;
      settled=true;
      try{
        const c=document.getElementById("app-container");
        if(c)c.innerHTML=`<div class="glass-msg-error text-center font-semibold p-4">${escHtml("เชื่อมต่อเซิร์ฟเวอร์ช้า — กรุณารีเฟรชหน้าอีกครั้ง")}</div>`;
      }catch(_){}
    },12000);
    bootApp();
    settled=true;
    clearTimeout(fallback);
  }catch(err){
    // Last-resort: never leave the user stranded on the static pre-header.
    try{
      const ph=document.getElementById("pre-header"); if(ph)ph.style.display="none";
      renderLogin("เกิดข้อผิดพลาดในการเริ่มระบบ");
    }catch(e2){
      const b=document.getElementById("app-container")||document.body;
      if(b)b.innerHTML='<pre style="white-space:pre-wrap;color:#fff;background:#7f1d1d;padding:12px;border-radius:8px;font-size:12px;margin:12px">BOOT ERROR: '+String((err&&err.stack)||err)+'</pre>';
    }
  }
}
window.onload=bootEntry;
// In case the load event already fired (script injected late), boot anyway.
if(document.readyState==="complete"){setTimeout(bootEntry,0);}