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
  // Watchdog: if nothing has rendered (still on pre-skeleton) after 8s, stop
  // hanging silently and offer the login screen.
  window.__bootWatchdog=setTimeout(function(){
    var ps=document.getElementById("pre-skeleton");
    var stillSkeleton=ps&&ps.style.display!=="none";
    if(stillSkeleton){
      try{ if(typeof renderLogin==="function"){renderLogin("โหลดนานผิดปกติ กรุณาเข้าสู่ระบบใหม่"); return;} }catch(e){}
      showBoot("โหลดนานผิดปกติ","ระบบไม่ตอบสนอง (อาจเชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ)");
    }
  },8000);
})();

// ── State ────────────────────────────────────────────────────────────
let appData = null;
let appDataStale = true;
let prefetchPromise = null;
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
let activeDropdown = null;
const dropdownRegistry = {};

const FILTER_DEBOUNCE_MS = 200;
const TOKEN_KEY = "peace_token_v1";
const SHIRT_PLACEHOLDER_URL = "https://placehold.co/600x400/7F1D1D/FFFFFF?text=PEACE+Engineer+Club";
const SUPPORT_PHONE_DISPLAY = "02-009-6703";
const SUPPORT_PHONE_TEL = "+6620096703";

function supportContactInlineHtml_(){
  return `แจ้งปัญหาการใช้งาน โทร <a href="tel:${SUPPORT_PHONE_TEL}" style="color:#FDE68A;text-decoration:underline;font-weight:600">${escHtml(SUPPORT_PHONE_DISPLAY)}</a>`;
}
function setSupportFooterVisible_(show){
  const el=document.getElementById("app-support-footer");
  if(el)el.classList.toggle("hidden",!show);
}

const NAV = [
  { id:"stock", label:"สต็อก", icon:"fa-boxes" },
  { id:"orders", label:"บันทึกขาย", icon:"fa-plus-circle" },
  { id:"list", label:"รายการขาย", icon:"fa-list" },
  { id:"dashboard", label:"แดชบอร์ด", icon:"fa-chart-pie" },
  { id:"report", label:"รายงาน", icon:"fa-file-alt" },
  { id:"guide", label:"คู่มือ", icon:"fa-book", guestOk:true },
  { id:"admin", label:"แอดมิน", icon:"fa-cog", adminOnly:true }
];

// ── Server bridge (GAS iframe OR GitHub Pages → JSONP RPC) ────────────
const RPC_JSONP_MAX_PAYLOAD = 1800;
const RPC_JSONP_TIMEOUT_MS = 120000;
const RPC_POST_TIMEOUT_MS = 180000;
const RPC_POST_METHODS_ = { uploadOrderImage: true, uploadShirtImage: true };
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
function probeApiOnLogin_() {
  const msg = document.getElementById("login-msg");
  if (!msg || !getRpcApiUrl_() || isGasScriptBridge_()) return;
  callServer("getRpcPing").then(function (r) {
    const serverBuild = r && r.build ? String(r.build) : "";
    const cfgBuild = (window.PEACE_CONFIG && window.PEACE_CONFIG.build) || "";
    if (serverBuild && cfgBuild && serverBuild !== cfgBuild) {
      msg.innerHTML = "<span style=\"color:#FDE68A\">เบราว์เซอร์ใช้ build " + escHtml(cfgBuild) +
        " แต่ API เป็น build " + escHtml(serverBuild) + " — กด Ctrl+Shift+R</span>";
    }
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

function ensureAppData(force) {
  if (!force && appData && !appDataStale) return Promise.resolve(appData);
  const loader = guestMode ? callServer("getGuestStockData") : fetchBootstrapAuthed_(force ? 5 : 3);
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
    try{
    if(data&&data.round){
      const round=data.round;
      const imageRef=String(round.imageUrl||"").trim();
      round.imageRef=imageRef;
      round.imageDataThumb=String(round.imageDataThumb||"");
      let displayUrl="";
      let sourceMode="";
      let warning="";
      if(round.imageDisplayUrl&&!isPlaceholderImage(round.imageDisplayUrl)){
        displayUrl=String(round.imageDisplayUrl);
        sourceMode=String(round.imageSourceMode||"proxy");
      }else if(extractDriveFileId(imageRef)){
        const resolved=await resolveRoundImageForDisplay(imageRef,!!force);
        if(resolved.url&&!isPlaceholderImage(resolved.url)){
          displayUrl=resolved.url;
          sourceMode="proxy";
        }
        warning=resolved.warning||"";
        if(!displayUrl&&round.imageDataThumb&&isDataUrl(round.imageDataThumb)){
          displayUrl=round.imageDataThumb;
          sourceMode="thumb";
        }
      }else if(isValidRoundUrl(imageRef)){
        displayUrl=imageRef;
        sourceMode="url";
      }else if(round.imageDataThumb&&isDataUrl(round.imageDataThumb)){
        displayUrl=round.imageDataThumb;
        sourceMode="thumb";
      }else{
        displayUrl=SHIRT_PLACEHOLDER_URL;
        sourceMode="placeholder";
      }
      round.imageDisplayUrl=displayUrl;
      round.imageSourceMode=sourceMode;
      round.imageWarning=warning;
      round.imageDebug="mode="+sourceMode+(warning?(" | "+warning):"");
      round.imageDisplaySrc=withCacheBust(displayUrl,data.generatedAt||Date.now());
    }
    }catch(imgErr){
      // Fall back to a safe placeholder; never break data loading over an image.
      if(data&&data.round){
        data.round.imageDisplayUrl=SHIRT_PLACEHOLDER_URL;
        data.round.imageSourceMode="placeholder";
        data.round.imageDisplaySrc=SHIRT_PLACEHOLDER_URL;
        data.round.imageWarning="โหลดรูปไม่สำเร็จ";
      }
    }
    appData = data;
    appDataStale = false;
    // Update the signed-in identity, but NEVER downgrade/clear a known role:
    // a malformed me (missing role) must not hide the admin tab or scope away data.
    if(data && data.me){
      if(data.me.role){ me = normalizeMeClient_(data.me); }
      else if(me && me.role){ me = normalizeMeClient_(Object.assign({}, data.me, {role: me.role})); }
      else { me = normalizeMeClient_(data.me); }
    }
    syncWindowSession_();
    return appData;
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
function isUserEditableOrderStatus(s){
  if(isCartStatus(s))return true;
  const v=String(s||"").trim();
  return v==="สั่งออเดอร์แล้ว"||v==="รอโอน";
}
function isUserLockedOrderStatus(s){
  const v=String(s||"").trim();
  return v==="รอส่ง"||v==="จัดส่งแล้ว"||v==="รอรับ"||v==="รับแล้ว";
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
function isPaymentVerified(s){
  return String(s||"").trim()==="ชำระเงินแล้ว";
}
function isFreeGiveawayPayment(s){
  return String(s||"").trim()===PAYMENT_FREE_GIVEAWAY;
}
function isPaymentLocked(s){
  return isPaymentVerified(s)||isFreeGiveawayPayment(s);
}
function countsAsSaleRevenue(s){
  return !isFreeGiveawayPayment(s);
}
function shouldCountInDashboard_(o){
  return !isCartStatus(o.status||o.orderStatus);
}
function canEditOrderNote_(g,ownsOrder){
  if(isAdmin()&&isAdminHiddenNoteRegion(g&&g.region))return false;
  if(canViewAllRegions()&&!isAdmin()&&!ownsOrderRegion(g))return false;
  if(isAdmin())return true;
  return canUserEditOrderGroup(g,ownsOrder);
}
function renderOrderNoteBlock_(g){
  if(isAdmin()&&isAdminHiddenNoteRegion(g&&g.region))return "";
  if(canViewAllRegions()&&!isAdmin()&&!ownsOrderRegion(g)){
    return g.note?`<div class="mt-1 text-xs text-glass-dim"><span class="opacity-70">หมายเหตุ:</span> ${escHtml(g.note)}</div>`:"";
  }
  return g.note?`<div class="mt-1 text-xs text-glass-dim"><span class="opacity-70">หมายเหตุ:</span> ${escHtml(g.note)}</div>`:"";
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
  if(s==="รับแล้ว")return "status-รับแล้ว";
  if(s==="รอโอน")return "status-รอโอน";
  if(s==="รอส่ง"||s==="จัดส่งแล้ว")return "status-รอรับ";
  return "status-รอรับ";
}
function regionShort(r){return String(r||"").trim()}
function fmtMoney(n){return Number(n||0).toLocaleString()}
function todayStr(){return new Date().toISOString().split("T")[0]}
function nowTimeStr(){return new Date().toTimeString().split(" ")[0].substring(0,5)}

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
// Combined two-line (date / time) cell for the order list
function formatOrderTimestampCell(ts){
  const s=String(ts||"").trim();
  if(!s)return "-";
  const iso=s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if(iso)return formatThaiDateTimeCell(iso[1],iso[2]);
  return formatThaiDateTimeCell(s,"");
}

function paymentStatusLabel(s){
  const v=String(s||"").trim();
  if(v==="ชำระเงินแล้ว")return v;
  if(v===PAYMENT_FREE_GIVEAWAY)return v;
  if(v==="รอตรวจสลิป")return v;
  return v? v : "ยังไม่ชำระ";
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
function canViewAllRegions(){
  return isAdmin() || isEngineer() || isViewer();
}
function ownsOrderRegion(g){
  return !isGuest()&&!!(me&&String(me.region)===String(g&&g.region));
}
function isGuest(){return me&&me.role==="guest"}
function escHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function escAttr(s){return escHtml(s).replace(/`/g,"&#96;")}
function noteInputId(orderId){return "order-note-"+String(orderId||"").replace(/[^a-zA-Z0-9_-]/g,"_")}

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

function clearRoundImageProxyCache(imageRef){
  const id=extractDriveFileId(imageRef);
  if(id)delete imageProxyCache[id];
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
      imageProxyCache[fileId]=res.dataUrl;
      return {url:res.dataUrl,cached:!!res.cached};
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

function statusOptions(selected){
  return (appData?.pickupStatus||["สั่งออเดอร์แล้ว","รอโอน","รอรับ","รับแล้ว"]).map(s=>
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

function recalcStockFromOrders(){
  if(!appData?.stock||!appData?.orders)return;
  // Non-admin users only receive their region's orders; recalculating sold from
  // that subset would inflate remaining vs the stock page (all orders).
  if(!canViewAllRegions())return;
  const sold={};
  appData.stockSizes.forEach(s=>{sold[s]=0});
  appData.orders.forEach(o=>{if(sold[o.size]!==undefined)sold[o.size]+=Number(o.qty||0)});
  appData.stock.forEach(s=>{s.sold=sold[s.size]||0;s.remaining=Math.max(s.delivered-s.sold,0)});
}

function stockRemainingForSize(size){
  const s=appData?.stock?.find(x=>x.size===size);
  return Math.max(0,Number(s&&s.remaining)||0);
}

function qtyInOrderForSize(orderId,size){
  return (appData?.orders||[]).filter(o=>String(o.orderId)===String(orderId)&&o.size===size)
    .reduce((sum,o)=>sum+Number(o.qty||0),0);
}

function maxEditableQtyForOrder(orderId,size){
  return stockRemainingForSize(size)+qtyInOrderForSize(orderId,size);
}

function applyLocalOrderCreate_(result,payload,items){
  if(!appData||!result||!result.orderId||!Array.isArray(items)||items.length===0)return;
  if(!Array.isArray(appData.orders))appData.orders=[];
  const unitPrice=Number(result.unitPrice||appData.unitPrice||0);
  const status=String(result.status||payload.status||(isAdmin()?"สั่งออเดอร์แล้ว":orderCartStatus()));
  const note=String(result.note||payload.note||"");
  const now=new Date().toISOString();
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
  appDataStale=true;
}

function applyLocalOrderCartUpdate_(orderId,result,items,orderGroup){
  if(!appData||!orderId||!Array.isArray(items)||items.length===0||!orderGroup)return;
  if(!Array.isArray(appData.orders))appData.orders=[];
  const unitPrice=Number(appData.unitPrice||0)||(orderGroup.totalQty?orderGroup.totalPrice/orderGroup.totalQty:0);
  const status=String(result&&result.status||orderGroup.status||"");
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
      note:orderGroup.note||"",
      timestamp:orderGroup.timestamp||new Date().toISOString(),
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
  appDataStale=true;
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
        requestedChange:o.requestedChange||"",
        changeRequestStatus:o.changeRequestStatus||"none",
        changeRequestNote:o.changeRequestNote||"",
        slipName:o.slipName,
        slipUrl:o.slipUrl,
        timestamp:o.timestamp,
        paymentStatus:o.paymentStatus||"",
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

// ── Dashboard / report compute ──────────────────────────────────────
function computeDashboard(regionFilter){
  const all=appData?.orders||[];
  const orders=(regionFilter&&regionFilter!=="all")?all.filter(o=>o.region===regionFilter):all;
  const regions=appData?.regions||[];
  const byRegion={};
  const byRegionFree={};
  const byRegionFreeLoss={};
  regions.forEach(r=>{
    byRegion[r]={qty:0,amount:0};
    byRegionFree[r]={qty:0,loss:0};
    byRegionFreeLoss[r]=0;
  });
  const bySize={};
  const bySizeFree={};
  (appData?.stockSizes||[]).forEach(s=>{bySize[s]=0;bySizeFree[s]=0});
  let saleQty=0,saleMoney=0,freeGiveawayQty=0,freeGiveawayLoss=0;
  let pendingPayment=0,pendingPickup=0,pickedUp=0;
  const orderIdSet={};
  for(let i=0;i<orders.length;i++){
    const o=orders[i];
    if(!shouldCountInDashboard_(o))continue;
    const isFree=isFreeGiveawayPayment(o.paymentStatus);
    const price=Number(o.price)||0;
    const qty=Number(o.qty)||0;
    orderIdSet[o.orderId||o.no]=1;
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
      if(o.status==="รอโอน")pendingPayment+=qty;
      else if(o.status==="รอรับ")pendingPickup+=qty;
      else if(o.status==="รับแล้ว")pickedUp+=qty;
    }
  }
  return {
    totalShirts:saleQty,
    totalMoney:saleMoney,
    freeGiveawayQty,
    freeGiveawayLoss,
    pendingPayment,pendingPickup,pickedUp,
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
    regionAcc[r]={totalQty:0,totalAmount:0,orderIds:{},bySize:bs};
    regionFreeAcc[r]={totalQty:0,totalLoss:0,orderIds:{},bySize:bf};
  });
  let totalQty=0,totalAmount=0,freeQty=0,freeLoss=0,pendingCount=0,pendingQty=0;
  const allOrderIds={};
  for(let i=0;i<orders.length;i++){
    const o=orders[i];
    if(!shouldCountInDashboard_(o))continue;
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
      if(o.status==="รอโอน"){pendingCount++;pendingQty+=o.qty}
      if(acc){
        acc.totalQty+=o.qty;
        acc.totalAmount+=o.price;
        acc.orderIds[oid]=1;
        if(acc.bySize[o.size]!==undefined)acc.bySize[o.size]+=o.qty;
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
    bySizeFree:regionFreeAcc[r].bySize
  }));
  const stock=appData?.stock||[];
  return {byRegion,stock,
    stockTotalRemaining:stock.reduce((s,x)=>s+x.remaining,0),
    pendingPayment:{count:pendingCount,totalQty:pendingQty},
    totals:{totalQty,totalAmount,freeQty,freeLoss,orderCount:Object.keys(allOrderIds).length,regionCount:regions.length},
    unitPrice:appData?.unitPrice||0};
}

// ── Login screen ─────────────────────────────────────────────────────
function renderLogin(errMsg){
  document.getElementById("pre-header").style.display="none";
  document.getElementById("pre-skeleton").style.display="none";
  document.getElementById("app-header").classList.add("hidden");
  setSupportFooterVisible_(true);
  const gasOnly=isGasAdminOnlyHost_();
  const ghUrl=getGithubPagesUrl_();
  const c=document.getElementById("app-container");
  c.innerHTML=`
    <div class="login-overlay">
      <div class="login-card">
        <div class="login-title"><i class="fas fa-tshirt mr-2" style="color:#F59E0B"></i>PEACE Engineer Club</div>
        <div class="login-sub">${gasOnly?"โหมดแอดมิน GAS — เฉพาะบัญชีแอดมิน":"ระบบจัดการขายเสื้อชมรม กฟภ."}</div>
        ${gasOnly?`<p class="text-xs text-center mb-2 opacity-80">ผู้ใช้ทั่วไป <a href="${escHtml(ghUrl)}" style="color:#FDE68A;text-decoration:underline">เปิดแอปหลัก (GitHub Pages)</a></p>`:""}
        <form id="login-form" class="space-y-3" autocomplete="on" onsubmit="event.preventDefault();doLogin();return false;">
          <div>
            <label class="glass-label" for="login-username">ชื่อผู้ใช้</label>
            <input id="login-username" name="username" class="glass-input" autocomplete="username" placeholder="${gasOnly?"admin1":"เช่น admin1, user_n1 หรือ viewer"}">
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
  setTimeout(()=>{
    const u=document.getElementById("login-username");
    if(u)u.focus();
    const p=document.getElementById("login-password");
    if(p){
      p.addEventListener("keydown",e=>{if(e.key==="Enter")doLogin()});
    }
    probeApiOnLogin_();
  },50);
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
    try{localStorage.setItem(TOKEN_KEY,authToken)}catch(_){}
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
  try{localStorage.removeItem(TOKEN_KEY)}catch(_){}
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
  const cur=String(document.getElementById("pwd-change-current")?.value||"");
  const np=String(document.getElementById("pwd-change-new")?.value||"");
  const cf=String(document.getElementById("pwd-change-confirm")?.value||"");
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
  guestMode=false;
  authToken=null;me=null;appData=null;appDataStale=true;prefetchPromise=null;
  try{localStorage.removeItem(TOKEN_KEY)}catch(_){}
  try{await callServer("logout",t)}catch(_){}
  renderLogin();
}

function bootApp(){
  document.getElementById("pre-header").style.display="none";
  document.getElementById("pre-skeleton").style.display="none";
  document.getElementById("app-header").classList.remove("hidden");
  setSupportFooterVisible_(true);
  renderUserChip();
  app.renderNav();
  app.container.innerHTML=skeletonHtml("stock");
  appDataStale=true;prefetchPromise=null;
  prefetchAppData().then(()=>app.navigate("stock"))
    .catch(async e=>{
      if(isSessionReloginMessage(e&&e.message)){
        if(await verifySessionAlive_()){
          app.container.innerHTML=`<div class="glass-msg-error text-center font-semibold">${escHtml(e&&e.message||"โหลดข้อมูลไม่สำเร็จ")}</div>`;
          return;
        }
        authToken=null;me=null;appData=null;appDataStale=true;prefetchPromise=null;
        syncWindowSession_();
        try{localStorage.removeItem(TOKEN_KEY)}catch(_){}
        renderLogin("กรุณาเข้าสู่ระบบใหม่");
        return;
      }
      app.container.innerHTML=`<div class="glass-msg-error text-center font-semibold">${escHtml(e&&e.message||"โหลดข้อมูลไม่สำเร็จ")}</div>`;
    });
}

function renderUserChip(){
  const chip=document.getElementById("user-info-chip");
  if(!chip||!me)return;
  const roleCls=me.role==="admin"?"role-badge-admin":(isEngineer()?"role-badge-engineer":(isViewer()?"role-badge-user":(isGuest()?"role-badge-guest":"role-badge-user")));
  const roleLabel=me.role==="admin"?"แอดมิน":(isEngineer()?`${ROLE_ENGINEER_LABEL} (แอดมินรอง)`:(isViewer()?"ผู้ดูข้อมูล":(isGuest()?"Guest":"ผู้ใช้")));
  const regionLabel=canViewAllRegions()?(isEngineer()?`ดูทุกเขต · สั่ง ${me.region||""}`:(isViewer()?"ดูทุกเขต (อ่านอย่างเดียว)":"ทุกเขต")):(isGuest()?"ดูสต็อกเท่านั้น":me.region);
  chip.className="user-chip";
  const pwdBtn=!isGuest()&&authToken
    ?`<button onclick="openChangePasswordModal()" title="เปลี่ยนรหัสผ่าน" class="chip-logout" type="button"><i class="fas fa-key"></i></button>`
    :"";
  chip.innerHTML=`<span class="${roleCls}">${roleLabel}</span><span class="chip-name" style="font-weight:700">${escHtml(me.displayName||me.username)}</span><span class="chip-region">${escHtml(regionLabel)}</span>${pwdBtn}<button onclick="doLogout()" title="ออกจากระบบ" class="chip-logout" type="button"><i class="fas fa-sign-out-alt"></i></button>`;
  const adminBtn=document.getElementById("header-admin-btn");
  const hdrBtns=document.getElementById("header-buttons");
  if(hdrBtns)hdrBtns.style.display=isGuest()?"none":"flex";
  if(adminBtn){
    if(me.role==="admin")adminBtn.classList.remove("hidden");
    else adminBtn.classList.add("hidden");
  }
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
      return !n.adminOnly||isAdmin();
    }).map(n=>
      `<button class="nav-tab ${this.currentModule===n.id?"active":""}" onclick="app.navigate('${n.id}')"><i class="fas ${n.icon} mr-1"></i>${n.label}</button>`).join("");
  },

  async navigate(module, forceRefresh){
    if(isGuest()&&module!=="stock"&&module!=="guide")module="stock";
    if(module==="admin"&&!isAdmin())module="stock";
    if(module==="guide"){
      this.currentModule=module;
      this.renderNav();
      this.paintModule(module);
      return;
    }
    this.currentModule=module;
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
        try{localStorage.removeItem(TOKEN_KEY)}catch(_){}
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
      else if(module==="admin")this.initAdmin();
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
        <iframe class="guide-frame" title="คู่มือผู้ใช้ PEACE Engineer Club" src="${htmlUrl}"></iframe>
      </div>
      <div id="msg-box"></div>`;
  },

  // ── Stock view ─────────────────────────────────────────────────────
  renderGuestStock(){
    const round=appData.round, stock=appData.stock||[], sizeChartRows=appData.sizeChart||[];
    const displayImage=(round.imageDisplayUrl&&!isPlaceholderImage(round.imageDisplayUrl))
      ? withCacheBust(round.imageDisplayUrl,appData.generatedAt||Date.now())
      : (isValidRoundUrl(round.imageUrl)
          ? withCacheBust(round.imageUrl,appData.generatedAt||Date.now())
          : ((round.imageDataThumb&&isDataUrl(round.imageDataThumb))
              ? round.imageDataThumb
              : SHIRT_PLACEHOLDER_URL));
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
        <div class="glass-card-header px-5 py-3">
          <h1 class="text-lg font-bold">${escHtml(round.name||"เสื้อชมรมวิศวกร")}</h1>
        </div>
        <div class="p-4">
          ${isPlaceholderImage(displayImage)
            ? `<div class="glass-image-wrap flex flex-col items-center justify-center py-8 text-glass" style="opacity:.8"><i class="fas fa-tshirt text-6xl mb-2"></i><p class="text-sm font-semibold">ยังไม่มีรูปเสื้อ</p></div>`
            : `<img id="stock-shirt-image" src="${displayImage}" alt="เสื้อ" loading="lazy" onload="app.onShirtImageLoaded(this,false)" onerror="app.onShirtImageError(this,false)" class="w-full max-h-80 object-contain rounded-lg glass-image-wrap">`}
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
    const displayImage=(round.imageDisplayUrl&&!isPlaceholderImage(round.imageDisplayUrl))
      ? withCacheBust(round.imageDisplayUrl,appData.generatedAt||Date.now())
      : (isValidRoundUrl(round.imageUrl)
          ? withCacheBust(round.imageUrl,appData.generatedAt||Date.now())
          : ((round.imageDataThumb&&isDataUrl(round.imageDataThumb))
              ? round.imageDataThumb
              : SHIRT_PLACEHOLDER_URL));
    const stockHeader=stock.map(s=>`<th class="stock-cell"><span class="size-badge ${sizeClass(s.size)}">${s.size}</span></th>`).join("");
    const deliveredRow=stock.map(s=>`<td class="stock-cell font-semibold">${s.delivered}</td>`).join("");
    const soldRow=stock.map(s=>`<td class="stock-cell text-orange-glass">${s.sold}</td>`).join("");
    const remainRow=stock.map(s=>{
      const cls=s.remaining<=5?"text-red-glass font-bold":"text-green-glass font-bold";
      return `<td class="stock-cell ${cls}">${s.remaining}</td>`;
    }).join("");
    const chartRows=sizeChartRows.map(r=>`<tr><td class="py-2 px-3"><span class="size-badge ${sizeClass(r.size)}">${r.size}</span></td><td class="py-2 px-3 text-center">${r.chest}</td><td class="py-2 px-3 text-center">${r.length}</td></tr>`).join("");
    const stockMobileCards=stock.map(s=>{
      const low=s.remaining<=5;
      const remainCls=low?"text-red-glass":"text-green-glass";
      return `<div class="stock-mobile-card ${low?'low':''}">
        <div class="flex justify-between items-center" style="margin-bottom:.35rem"><span class="size-badge ${sizeClass(s.size)}">${s.size}</span><span class="font-bold ${remainCls}" style="font-size:1.1rem">${s.remaining}<span class="text-xs opacity-70">/${s.delivered}</span></span></div>
        <div class="row"><span class="lbl">มาส่ง</span><span class="val">${s.delivered}</span></div>
        <div class="row"><span class="lbl">ขายแล้ว</span><span class="val text-orange-glass">${s.sold}</span></div>
        <div class="row"><span class="lbl">คงเหลือ</span><span class="val ${remainCls}">${s.remaining}</span></div>
      </div>`;
    }).join("");
    const adminUpload=isAdmin()?`<label for="stock-shirt-upload" class="absolute top-2 right-2 glass-btn-primary text-xs cursor-pointer" style="padding:.35rem .75rem;border-radius:9999px"><i class="fas fa-camera"></i> <span class="sm:inline hidden">เปลี่ยนรูป</span></label><input id="stock-shirt-upload" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,image/bmp" class="hidden" onchange="app.uploadShirtImageInline(this)">`:"";
    const guestNote=isGuest()?`<div class="glass-card p-4"><div class="text-sm text-glass"><i class="fas fa-info-circle mr-1"></i> โหมด Guest: ดูจำนวนเสื้อคงเหลือได้เท่านั้น</div></div>`:"";
    const guestActions=isGuest()?"":`<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button onclick="app.navigate('orders')" class="glass-btn-primary py-3"><i class="fas fa-plus-circle mr-1"></i> บันทึกการขาย</button>
        <button onclick="app.navigate('list')" class="glass-btn-secondary py-3"><i class="fas fa-list mr-1"></i> ดูรายการ (${appData.orders.length})</button>
      </div>`;
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
      <div class="glass-card">
        <div class="glass-card-header px-5 py-3 flex justify-between items-center">
          <div><div class="text-xs opacity-80">รอบปี ${round.year}</div><h1 class="text-lg font-bold">${escHtml(round.name)}</h1></div>
          <div class="text-right"><div class="text-xs opacity-80">ราคา</div><div class="text-xl font-bold">${fmtMoney(round.unitPrice)} ฿</div></div>
        </div>
        <div class="p-4">
          <div class="relative mb-4">
            ${isPlaceholderImage(displayImage)
              ? `<div class="glass-image-wrap flex flex-col items-center justify-center py-8 text-glass" style="opacity:.8"><i class="fas fa-tshirt text-6xl mb-2"></i><p class="text-sm font-semibold">ยังไม่มีรูปเสื้อ</p></div>`
              : `<img id="stock-shirt-image" data-image-ref="${escHtml(round.imageRef||round.imageUrl||"")}" src="${displayImage}" alt="เสื้อ" loading="lazy" onload="app.onShirtImageLoaded(this,false)" onerror="app.onShirtImageError(this,false)" class="w-full max-h-80 object-contain rounded-lg glass-image-wrap">`}
            ${adminUpload}
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
              <tr><td class="px-2 font-semibold text-glass-muted whitespace-nowrap">ขายแล้ว</td>${soldRow}</tr>
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
        <h2 class="text-lg font-bold glass-section-title mb-4 border-b glass-divider pb-2"><i class="fas fa-plus-circle mr-1"></i>บันทึกการขาย (สั่งหลายไซส์)</h2>
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
          <p class="text-xs text-glass-dim">วันที่/เวลาสั่งซื้อบันทึกอัตโนมัติ · แนบสลิปและระบุวันที่โอนได้ที่รายการขาย</p>
          <div>
            <label class="glass-label">สถานะ</label>
            ${isAdm
              ? buildGlassDropdown({ddId:"order-status-dd",valueInputId:"order-status",value:"สั่งออเดอร์แล้ว",options:(appData?.pickupStatus||["สั่งออเดอร์แล้ว","รอโอน","รอรับ","รับแล้ว"])})
              : `<input id="order-status-fixed" class="glass-input glass-input-readonly" value="${escHtml(orderCartStatus())}" readonly>`}
          </div>
          ${isAdm?"":`<p class="text-xs text-glass-dim -mt-1">เพิ่มลงตะกร้าก่อน แล้วไปแก้ไข/ยืนยันส่งออเดอร์ที่รายการขาย</p>`}
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
        note:(document.getElementById("order-note")?.value||"").trim()
      };
      if(isAdmin()){
        payload.status=document.getElementById("order-status").value;
      }
      const total=items.reduce((s,x)=>s+x.qty,0);
      const result=await runSaving({btn:btn,busyText:"กำลังบันทึกออเดอร์…"},async()=>{
        const r=await callAuthed("addMultiSizeOrder",payload);
        applyLocalOrderCreate_(r,payload,items);
        appDataStale=false;
        invalidateClientCache();
        ensureAppData(true).catch(function(){});
        return r;
      });
      const okMsg=isAdmin()
        ?`บันทึกออเดอร์ ${total} ตัว (${items.length} ไซส์) เรียบร้อย`
        :`เพิ่มลงตะกร้า ${total} ตัว (${items.length} ไซส์) แล้ว — ไปรายการขายเพื่อแก้ไขหรือยืนยันส่งออเดอร์`;
      this.showMsg(okMsg,"success");
      if(result&&result.warning){
        setTimeout(()=>this.showMsg(result.warning,"warning"),900);
      }
      setTimeout(()=>app.navigate("list"),400);
    }catch(e){
      const msg=e&&e.message||"บันทึกไม่สำเร็จ";
      if(isSessionReloginMessage(msg) && await verifySessionAlive_()){
        this.showMsg("บันทึกออเดอร์แล้ว แต่รีเฟรชข้อมูลไม่สำเร็จ กรุณาเปิดรายการขายอีกครั้ง","warning");
        return;
      }
      this.showMsg(msg,"error");
    }
  },

  // ── Order list (grouped by orderId) ─────────────────────────────────
  renderOrderList(){
    const grouped=groupOrdersByOrderId((appData&&Array.isArray(appData.orders))?appData.orders:[]).reverse();
    let filterOpts='<option value="all">ทุกเขต</option>';
    appData.regions.forEach(r=>{filterOpts+=`<option value="${escHtml(r)}">${escHtml(r)}</option>`});
    const showFilter=canViewAllRegions();
    const body=grouped.length===0
      ? '<tr><td colspan="9" class="text-center py-8 text-glass-dim">ยังไม่มีรายการขาย</td></tr>'
      : "";
    return `
      <div class="glass-card p-4">
        <div class="flex justify-between items-center mb-4 border-b glass-divider pb-2">
          <h2 class="text-lg font-bold glass-section-title"><i class="fas fa-list mr-1"></i>รายการขาย (${grouped.length} ออเดอร์)</h2>
          <button onclick="app.navigate('orders')" class="text-xs glass-btn-primary"><i class="fas fa-plus"></i> เพิ่ม</button>
        </div>
        ${showFilter?`<div class="mb-3"><select id="list-filter" onchange="app.filterList()" class="glass-select p-2 text-sm w-full">${filterOpts}</select></div>`:""}
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
              <th class="py-2 px-1"></th>
            </tr></thead>
            <tbody id="order-tbody">${body}</tbody>
          </table>
        </div>
      </div>
      <div id="msg-box"></div>`;
  },

  fillOrderListBody(){
    const tbody=document.getElementById("order-tbody");
    if(!tbody)return;
    const orders=(appData&&Array.isArray(appData.orders))?appData.orders:[];
    const grouped=groupOrdersByOrderId(orders).reverse();
    if(grouped.length===0)return;
    // Render each order group independently so one malformed order can never
    // blank the entire list (a single thrown row would otherwise empty it).
    tbody.innerHTML=grouped.map(g=>{
      try{return this.orderGroupRowHtml(g);}
      catch(e){
        const oid=escHtml((g&&g.orderId)||"?");
        return `<tr data-region="${escHtml((g&&g.region)||"")}"><td colspan="9" class="py-2 px-2 text-xs text-red-glass">#${oid} แสดงผลไม่สำเร็จ</td></tr>`;
      }
    }).join("");
  },

  orderGroupRowHtml(g){
    const inCart=isCartStatus(g.status);
    const statusCls=statusClass(g.status);
    const canEditStatus=isAdmin();
    const ownsOrder=ownsOrderRegion(g);
    const canEditOrder=canUserEditOrderGroup(g,ownsOrder);
    const canDeleteOrder=canUserDeleteOrderGroup(g,ownsOrder);
    const canEditNote=canEditOrderNote_(g,ownsOrder);
    const showEditBtn=canEditOrder||canEditNote;
    const itemsLabel=`<div class="order-items">${g.items.map(it=>`<span class="order-item"><span class="size-badge ${sizeClass(it.size)}">${it.size}</span><span class="order-item-qty">×${it.qty}</span></span>`).join("")}</div>`;
    const canManageSlip=!isFreeGiveawayPayment(g.paymentStatus)&&(isAdmin()||(ownsOrder&&!isPaymentLocked(g.paymentStatus)));
    const slipSafeId=ddSafeId(g.orderId);
    let slipCell;
    if(g.slipUrl){
      slipCell=`<div class="order-slip-actions">
        <button class="glass-btn-secondary text-xs" style="padding:.3rem .55rem" onclick="app.viewOrderImage('${escHtml(g.orderId)}',this)"><i class="fas fa-eye"></i> ดูสลิป</button>
        ${canManageSlip?`<button class="glass-btn-secondary text-xs" style="padding:.3rem .55rem" onclick="app.openSlipUploadModal('${escHtml(g.orderId)}',true)"><i class="fas fa-upload"></i> เปลี่ยนสลิป</button>
        <button class="glass-btn-danger text-xs" style="padding:.3rem .55rem" onclick="app.deleteOrderImage('${escHtml(g.orderId)}',this)"><i class="fas fa-trash"></i> ลบ</button>`:""}
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
        <button class="glass-btn text-xs" style="padding:.3rem .55rem;background:rgba(109,40,217,.45)" onclick="app.markOrderFreeGiveaway('${escHtml(g.orderId)}',this)" title="ผู้บริหาร/แจกฟรี — ไม่รวมยอดขาย"><i class="fas fa-gift"></i> เสื้อแจกฟรี</button>
      </div>`;
    }
    const noteBlock=renderOrderNoteBlock_(g);
    const orderEditActions=showEditBtn
      ?`<div class="mt-2 flex flex-wrap gap-1 justify-center">
          <button class="glass-btn-secondary text-xs" style="padding:.35rem .55rem" onclick="app.openCartEditModal('${escHtml(g.orderId)}')"><i class="fas fa-edit"></i> แก้ไข</button>
          ${inCart&&canEditOrder?`<button class="glass-btn-primary text-xs" style="padding:.35rem .55rem" onclick="app.submitCartToAdmin('${escHtml(g.orderId)}',this)"><i class="fas fa-paper-plane"></i> ยืนยันส่งออเดอร์</button>`:""}
        </div>`
      :(isPaymentLocked(g.paymentStatus)?`<div class="mt-1 text-xs text-glass-dim">${isFreeGiveawayPayment(g.paymentStatus)?"เสื้อแจกฟรี — แก้ไข/ลบได้เฉพาะแอดมิน":"ชำระเงินแล้ว — แก้ไข/ลบได้เฉพาะแอดมิน"}</div>`
        :(isUserLockedOrderStatus(g.status)?`<div class="mt-1 text-xs text-glass-dim">ล็อกแล้ว — ติดต่อแอดมิน</div>`:""));
    const deleteBtn=canDeleteOrder
      ?`<button onclick="app.removeOrderGroup('${escHtml(g.orderId)}',${inCart?"true":"false"},this)" class="glass-btn-danger" title="ลบออเดอร์" style="padding:.35rem .55rem"><i class="fas fa-trash"></i></button>`
      :`<span class="text-glass-dim text-xs">-</span>`;
    const shortId=String(g.orderId).replace(/^ORD-?/,"").substring(0,8);
    return `
      <tr data-region="${escHtml(g.region)}">
        <td data-label="ออเดอร์" class="py-2 px-2 text-center font-bold">#${shortId}</td>
        <td data-label="เขต" class="py-2 px-2">${escHtml(regionShort(g.region))}</td>
        <td data-label="รายการ" class="py-2 px-2">${itemsLabel}</td>
        <td data-label="รวม" class="py-2 px-2 text-center"><div class="font-bold">${g.totalQty} ตัว</div>${isFreeGiveawayPayment(g.paymentStatus)?`<div class="text-xs" style="color:#C4B5FD">แจกฟรี (ไม่รวมยอดขาย)</div>`:`<div class="text-xs opacity-80">${fmtMoney(g.totalPrice)} ฿</div>`}</td>
        <td data-label="วันที่สั่ง" class="py-2 px-2 text-center text-xs">${formatOrderTimestampCell(g.timestamp)}</td>
        <td data-label="สถานะ" class="py-2 px-2 text-center">
          ${canEditStatus
            ? buildGlassDropdown({ddId:"order-status-dd-"+ddSafeId(g.orderId),valueInputId:"order-status-val-"+ddSafeId(g.orderId),value:g.status||"สั่งออเดอร์แล้ว",options:(appData?.pickupStatus||["สั่งออเดอร์แล้ว","รอโอน","รอรับ","รับแล้ว"]),compact:true,statusCls:statusCls,onSelect:(val)=>app.changeGroupStatus(g.orderId,val)})
            : `<span class="inline-block px-2 py-1 rounded-lg text-xs ${statusCls}" style="border:1px solid rgba(255,255,255,.25)">${escHtml(g.status||orderCartStatus())}</span>`}
          ${noteBlock}
          ${orderEditActions}
        </td>
        <td data-label="สลิปชำระ" class="py-2 px-2 text-center">${slipCell}</td>
        <td data-label="ชำระเงิน" class="py-2 px-2 text-center">${paymentCell}</td>
        <td data-label="ลบ" class="py-2 px-1 text-center">${deleteBtn}</td>
      </tr>`;
  },

  filterList(){
    clearTimeout(listFilterTimer);
    listFilterTimer=setTimeout(()=>this.applyListFilter(),FILTER_DEBOUNCE_MS);
  },

  applyListFilter(){
    const region=document.getElementById("list-filter")?.value;
    if(region===undefined)return;
    const rows=document.querySelectorAll("#order-table tbody tr[data-region]");
    rows.forEach(tr=>{
      tr.style.display=(region==="all"||tr.getAttribute("data-region")===region)?"":"none";
    });
  },

  async changeGroupStatus(orderId,status){
    if(!isAdmin()){
      this.showMsg("เฉพาะแอดมินเท่านั้นที่เปลี่ยนสถานะได้","error");
      return;
    }
    const ordersInGroup=(appData?.orders||[]).filter(o=>o.orderId===orderId);
    const prev=ordersInGroup.length?(ordersInGroup[0].orderStatus||ordersInGroup[0].status):status;
    ordersInGroup.forEach(o=>{o.status=status;o.orderStatus=status});
    try{
      await runSaving({busyText:"กำลังอัปเดตสถานะ…"},()=>callAuthed("updateOrderStatusByOrderId",orderId,status));
      this.showMsg("อัปเดตสถานะออเดอร์แล้ว","success");
    }catch(e){
      ordersInGroup.forEach(o=>{o.status=prev;o.orderStatus=prev});
      this.fillOrderListBody();
      this.showMsg(e.message,"error");
    }
  },

  async saveGroupNote(orderId,btnEl){
    const input=document.getElementById(noteInputId(orderId));
    if(!input)return;
    const ordersInGroup=(appData?.orders||[]).filter(o=>o.orderId===orderId);
    const prev=ordersInGroup.length?String(ordersInGroup[0].note||""):"";
    const next=String(input.value||"").trim();
    ordersInGroup.forEach(o=>{o.note=next});
    try{
      await runSaving({btn:btnEl,btnText:"บันทึก…",busyText:"กำลังบันทึกหมายเหตุ…"},()=>callAuthed("updateOrderNoteByOrderId",orderId,next));
      this.showMsg("บันทึกหมายเหตุแล้ว","success");
    }catch(e){
      ordersInGroup.forEach(o=>{o.note=prev});
      input.value=prev;
      this.showMsg(e.message||"บันทึกหมายเหตุไม่สำเร็จ","error");
    }
  },

  async removeOrderGroup(orderId,inCart,btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    const msg=inCart===true||inCart==="true"
      ?"ลบออเดอร์ในตะกร้านี้ทั้งหมด?"
      :"ลบออเดอร์นี้ทั้งหมด? (ไม่สามารถกู้คืนได้)";
    if(!confirm(msg))return;
    try{
      await runSaving({btn:btn,btnText:"",busyText:"กำลังลบออเดอร์…"},()=>callAuthed("deleteOrderByOrderId",orderId));
      if(appData?.orders){appData.orders=appData.orders.filter(o=>o.orderId!==orderId)}
      recalcStockFromOrders();
      this.showMsg("ลบออเดอร์แล้ว","success");
      app.navigate("list");
    }catch(e){this.showMsg(e.message,"error")}
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
    const orderGroup=groupOrdersByOrderId(appData?.orders||[]).find(g=>g.orderId===orderId);
    if(!orderGroup)return this.showMsg("ไม่พบออเดอร์","error");
    const ownsOrder=ownsOrderRegion(orderGroup);
    if(!canUserEditOrderGroup(orderGroup,ownsOrder))return this.showMsg("ออเดอร์ชำระเงินแล้ว แก้ไขสลิปได้เฉพาะแอดมิน","warning");
    this.closeSlipUploadModal();
    const safeOid=ddSafeId(orderId);
    const html=`
      <div class="login-overlay" id="slip-upload-modal" onclick="if(event.target===this)app.closeSlipUploadModal()">
        <div class="login-card" style="max-width:480px" onclick="event.stopPropagation()">
          <div class="login-title">${isReplace?"เปลี่ยนสลิป":"แนบสลิปชำระเงิน"} #${escHtml(String(orderId).replace(/^ORD-?/,"").substring(0,8))}</div>
          <p class="login-sub text-xs">วันที่สั่ง: ${formatOrderTimestampCell(orderGroup.timestamp)} · กรอกวันที่/เวลาที่โอนตามสลิป</p>
          <div class="space-y-2">
            <div class="grid grid-cols-2 gap-2">
              <div><label class="glass-label">วันที่โอน *</label><input id="slip-pay-date-${safeOid}" type="date" value="${todayStr()}" class="glass-input p-2 text-sm"></div>
              <div><label class="glass-label">เวลาโอน *</label><input id="slip-pay-time-${safeOid}" type="time" value="${nowTimeStr()}" class="glass-input p-2 text-sm"></div>
            </div>
            <div><label class="glass-label">รูปสลิป *</label><input id="slip-file-${safeOid}" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,image/bmp" class="glass-input p-2 text-xs"></div>
            <p class="text-xs text-glass-dim">รองรับไฟล์ใหญ่ (สูงสุด ~28 MB) — ระบบย่อรูปอัตโนมัติก่อนส่ง · แนะนำ JPG/PNG</p>
            <div id="slip-modal-msg" class="modal-inline-msg text-sm text-center mt-2 font-semibold" style="display:none" role="alert"></div>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <button type="button" onclick="app.closeSlipUploadModal()" class="glass-btn-secondary py-2">ยกเลิก</button>
              <button type="button" onclick="app.submitSlipUpload('${escHtml(orderId)}',this)" class="glass-btn-primary py-2">บันทึกสลิป</button>
            </div>
          </div>
        </div>
      </div>`;
    const wrap=document.createElement("div");
    wrap.innerHTML=html;
    document.body.appendChild(wrap.firstElementChild);
    const escHandler=function(e){if(e.key==="Escape")app.closeSlipUploadModal();};
    document.addEventListener("keydown",escHandler);
    const m=document.getElementById("slip-upload-modal");
    if(m)m._escHandler=escHandler;
  },

  closeSlipUploadModal(){
    const m=document.getElementById("slip-upload-modal");
    if(m&&m._escHandler)document.removeEventListener("keydown",m._escHandler);
    if(m)m.remove();
  },

  async submitSlipUpload(orderId,btn){
    const safeOid=ddSafeId(orderId);
    const file=document.getElementById("slip-file-"+safeOid)?.files?.[0];
    const payDate=String(document.getElementById("slip-pay-date-"+safeOid)?.value||"").trim();
    const payTime=String(document.getElementById("slip-pay-time-"+safeOid)?.value||"").trim();
    this.clearSlipModalMsg();
    if(!file)return this.showSlipModalMsg("กรุณาเลือกรูปสลิป","error");
    if(!payDate||!payTime)return this.showSlipModalMsg("กรุณากรอกวันที่และเวลาโอน","error");
    await new Promise(function(r){setTimeout(r,0);});
    try{
      const self=this;
      const base64=await prepareImageBase64ForUpload_(file,function(status){
        self.showSlipModalMsg(status,"warning");
      });
      await runSaving({btn:btn,busyText:"กำลังบันทึกสลิป…"},async()=>{
        await callAuthedWithTimeout(RPC_POST_TIMEOUT_MS,"uploadOrderImage",orderId,base64,payDate,payTime,file.name);
        invalidateClientCache();
        ensureAppData(true).catch(function(){});
      });
      this.closeSlipUploadModal();
      this.showMsg("บันทึกสลิปแล้ว รอแอดมินตรวจสอบ","success");
      this.fillOrderListBody();
    }catch(e){
      this.showSlipModalMsg(e.message||"บันทึกสลิปไม่สำเร็จ","error");
    }
  },

  async openPaymentReviewModal(orderId){
    const g=groupOrdersByOrderId(appData?.orders||[]).find(x=>x.orderId===orderId);
    if(!g)return this.showMsg("ไม่พบออเดอร์","error");
    let imgHtml='<div class="text-xs text-glass-dim py-4 text-center">กำลังโหลดรูป…</div>';
    const html=`
      <div class="login-overlay" id="payment-review-modal">
        <div class="login-card" style="max-width:520px">
          <div class="login-title">ตรวจสอบการชำระ #${escHtml(String(orderId).replace(/^ORD-?/,"").substring(0,8))}</div>
          <div class="text-xs space-y-1 mb-3">
            <div><b>วันที่สั่ง:</b> ${formatOrderTimestampCell(g.timestamp)}</div>
            <div><b>วันที่โอน (จากสลิป):</b> ${formatThaiDateTimeCell(g.payDate,g.payTime)}</div>
            <div><b>ยอด:</b> ${fmtMoney(g.totalPrice)} ฿ · <b>เขต:</b> ${escHtml(g.region||"")}</div>
          </div>
          <div id="payment-review-img" class="mb-3">${imgHtml}</div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button onclick="app.closePaymentReviewModal()" class="glass-btn-secondary py-2">ปิด</button>
            <button id="payment-accept-btn" onclick="app.acceptOrderPayment('${escHtml(orderId)}',this)" class="glass-btn-primary py-2" ${String(g.paymentStatus||"")==="ชำระเงินแล้ว"||isFreeGiveawayPayment(g.paymentStatus)?"disabled":""}>ยอมรับการชำระ</button>
            <button onclick="app.markOrderFreeGiveaway('${escHtml(orderId)}',this)" class="glass-btn py-2" style="background:rgba(109,40,217,.5)" ${isFreeGiveawayPayment(g.paymentStatus)?"disabled":""}><i class="fas fa-gift mr-1"></i>เสื้อแจกฟรี</button>
          </div>
          <p class="text-xs text-glass-dim mt-2">เสื้อแจกฟรี: ไม่รวมยอดขาย · แสดงเป็นขาดทุนในแดชบอร์ด</p>
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
        box.innerHTML=warn+`<img src="${src}" class="w-full max-h-64 object-contain rounded-lg glass-image-wrap" alt="สลิป" onerror="app.onSlipImgError(this,'${escHtml(orderId)}')">`;
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

  async acceptOrderPayment(orderId,btn){
    if(!confirm("ยอมรับว่าชำระเงินถูกต้องแล้ว?"))return;
    try{
      await runSaving({btn:btn,busyText:"กำลังบันทึก…"},async()=>{
        await callAuthed("acceptOrderPayment",orderId);
        invalidateClientCache();
        ensureAppData(true).catch(function(){});
      });
      this.closePaymentReviewModal();
      this.showMsg("ยอมรับการชำระเงินแล้ว","success");
      this.fillOrderListBody();
    }catch(e){
      this.showMsg(e.message||"บันทึกไม่สำเร็จ","error");
    }
  },

  async markOrderFreeGiveaway(orderId,btn){
    if(!isAdmin())return this.showMsg("เฉพาะแอดมินเท่านั้น","error");
    const g=groupOrdersByOrderId(appData?.orders||[]).find(x=>x.orderId===orderId);
    if(g&&isFreeGiveawayPayment(g.paymentStatus))return this.showMsg("ออเดอร์นี้เป็นเสื้อแจกฟรีแล้ว","warning");
    if(g&&isPaymentVerified(g.paymentStatus))return this.showMsg("ออเดอร์ชำระเงินแล้ว ไม่สามารถเปลี่ยนเป็นแจกฟรีได้","warning");
    if(!confirm("บันทึกเป็นเสื้อแจกฟรี (ผู้บริหาร)?\nยอดนี้จะไม่รวมกับเสื้อที่ขาย และแสดงเป็นขาดทุนในแดชบอร์ด"))return;
    try{
      await runSaving({btn:btn,busyText:"กำลังบันทึก…"},async()=>{
        await callAuthed("markOrderFreeGiveaway",orderId);
        invalidateClientCache();
        ensureAppData(true).catch(function(){});
      });
      this.closePaymentReviewModal();
      this.showMsg("บันทึกเป็นเสื้อแจกฟรีแล้ว (ไม่รวมยอดขาย)","success");
      this.fillOrderListBody();
    }catch(e){
      this.showMsg(e.message||"บันทึกไม่สำเร็จ","error");
    }
  },

  async deleteOrderImage(orderId,btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    if(!confirm("ลบรูปแนบของออเดอร์นี้? (ต้องลบก่อนจึงจะแนบรูปใหม่ได้)"))return;
    try{
      await runSaving({btn:btn,btnText:"",busyText:"กำลังลบรูป…"},async()=>{
        await callAuthed("deleteOrderImage",orderId);
        invalidateClientCache();
        try {
          await ensureAppData(true);
        } catch (refreshErr) {
          if (!await verifySessionAlive_()) throw refreshErr;
        }
      });
      this.showMsg("ลบรูปแนบแล้ว","success");
      this.fillOrderListBody();
    }catch(e){
      this.showMsg(e.message||"ลบรูปไม่สำเร็จ","error");
    }
  },

  async viewOrderImage(orderId,btn){
    try{
      const res=await runSaving({btn:btn,btnText:"",busyText:"กำลังโหลดรูป…"},()=>callAuthed("getOrderImage",orderId));
      const src=orderImageDisplaySrc(res);
      if(res&&res.ok&&src){
        this.openImageLightbox(src);
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

  openImageLightbox(src){
    this.closeImageLightbox();
    const wrap=document.createElement("div");
    wrap.id="image-lightbox";
    wrap.className="image-lightbox-overlay fade-in";
    wrap.innerHTML=`<div class="image-lightbox-card">
      <button class="image-lightbox-close" onclick="app.closeImageLightbox()" aria-label="ปิด"><i class="fas fa-times"></i></button>
      <img src="${src}" alt="รูปแนบออเดอร์" class="image-lightbox-img">
      <a href="${src}" target="_blank" rel="noopener" class="image-lightbox-open"><i class="fas fa-external-link-alt mr-1"></i> เปิดในแท็บใหม่</a>
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
    if(!canEditOrder&&!canEditNote)return this.showMsg("ออเดอร์ถูกล็อกแล้ว แก้ไขได้เฉพาะแอดมิน","warning");
    const inCart=isCartStatus(orderGroup.status);
    const safeId=ddSafeId(orderId);
    const sizes=appData?.stockSizes||[];
    const itemRows=sizes.map(size=>{
      const it=orderGroup.items.find(x=>x.size===size);
      const remainQty=stockRemainingForSize(size);
      const maxQty=maxEditableQtyForOrder(orderId,size);
      const cur=it?it.qty:0;
      const remainLabel=remainQty<=0?'<span class="text-red-glass">หมด</span>':remainQty;
      return `<tr>
        <td><span class="size-badge ${sizeClass(size)}">${size}</span></td>
        <td>${remainLabel}</td>
        <td><input id="cart-${safeId}-${size}" type="number" min="0" max="${maxQty}" class="glass-input p-1 text-xs" value="${cur}"></td>
      </tr>`;
    }).join("");
    const noteField=canEditNote
      ?`<div>
          <label class="glass-label text-xs">หมายเหตุ</label>
          <input id="cart-edit-note-${safeId}" type="text" class="glass-input text-sm" maxlength="120" placeholder="เช่น ชื่อผู้รับ, รายละเอียดเพิ่มเติม" value="${escHtml(orderGroup.note||"")}">
        </div>`
      :"";
    const html=`
      <div class="login-overlay" id="cart-edit-modal">
        <div class="login-card" style="max-width:560px">
          <div class="login-title">${inCart?"แก้ไขตะกร้า":"แก้ไขออเดอร์"} #${escHtml(String(orderId).replace(/^ORD-?/,"").substring(0,8))}</div>
          <p class="login-sub text-xs">${inCart?"แก้ไขหมายเหตุ ไซส์ และจำนวนได้จนกว่าจะยืนยันส่งออเดอร์":"แก้ไขหมายเหตุ ไซส์ และจำนวนได้จนกว่าแอดมินจะล็อกสถานะ"}<br><span class="opacity-80">คอลัมน์ «คงเหลือ» = ตามหน้าสต็อก · ช่องจำนวนปรับได้สูงสุด = คงเหลือ + จำนวนเดิมในออเดอร์นี้</span></p>
          <div class="space-y-2">
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
    const safeId=ddSafeId(orderId);
    const noteEl=document.getElementById("cart-edit-note-"+safeId);
    const note=noteEl?String(noteEl.value||"").trim():String(orderGroup.note||"");
    const sizes=appData?.stockSizes||[];
    const items=sizes.map(size=>{
      const val=Number(document.getElementById("cart-"+safeId+"-"+size)?.value||0);
      return {size:size,qty:Math.max(0,Math.floor(val))};
    }).filter(it=>it.qty>0);
    if(items.length===0){this.showMsg("กรุณาเลือกอย่างน้อย 1 ไซส์","warning");return;}
    const inCart=isCartStatus(orderGroup.status);
    try{
      await runSaving({btn:btn,busyText:inCart?"กำลังบันทึกตะกร้า…":"กำลังบันทึก…"},async()=>{
        const r=await callAuthed("updateCartOrderByOrderId",orderId,{items:items,note:note});
        applyLocalOrderCartUpdate_(orderId,r,items,orderGroup);
        appDataStale=false;
        invalidateClientCache();
        ensureAppData(true).catch(function(){});
        return r;
      });
      this.closeCartEditModal();
      this.showMsg(inCart?"บันทึกตะกร้าแล้ว":"บันทึกจำนวนแล้ว","success");
      this.fillOrderListBody();
    }catch(e){
      this.showMsg(e.message||"บันทึกไม่สำเร็จ","error");
      ensureAppData(true).catch(function(){});
    }
  },

  async submitCartToAdmin(orderId,btn){
    if(btn&&btn.dataset&&btn.dataset.busy==="1")return;
    if(!confirm("ยืนยันส่งออเดอร์นี้ไปยังแอดมิน? หลังส่งแล้วยังแก้จำนวนได้จนกว่าแอดมินจะล็อกสถานะ"))return;
    try{
      await runSaving({btn:btn,busyText:"กำลังส่งออเดอร์…"},async()=>{
        await callAuthed("submitCartOrderToAdmin",orderId);
        invalidateClientCache();
        await ensureAppData(true);
      });
      this.showMsg("ส่งออเดอร์ไปยังแอดมินแล้ว","success");
      this.fillOrderListBody();
    }catch(e){
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
      ${isAdmin()?`<div class="grid grid-cols-1 gap-4 mb-4">
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
      const giveawayCards=isAdmin()?`
        <div class="glass-stat" style="background:linear-gradient(135deg,rgba(109,40,217,.35),rgba(79,70,229,.25))"><div class="glass-stat-label">แจกฟรี (ตัว)</div><div class="glass-stat-value">${dash.freeGiveawayQty||0}</div></div>
        <div class="glass-stat" style="background:linear-gradient(135deg,rgba(109,40,217,.45),rgba(127,29,29,.2))"><div class="glass-stat-label">ขาดทุนแจก (฿)</div><div class="glass-stat-value text-2xl">${fmtMoney(dash.freeGiveawayLoss||0)}</div></div>`:"";
      cardsEl.innerHTML=`
        <div class="glass-stat glass-stat-purple"><div class="glass-stat-label">ขายแล้ว (ตัว)</div><div class="glass-stat-value">${dash.totalShirts}</div></div>
        <div class="glass-stat glass-stat-orange"><div class="glass-stat-label">ยอดขาย (฿)</div><div class="glass-stat-value text-2xl">${fmtMoney(dash.totalMoney)}</div></div>
        ${giveawayCards}
        <div class="glass-stat glass-stat-blue"><div class="glass-stat-label">รอโอน</div><div class="glass-stat-value text-2xl">${dash.pendingPayment||0}</div></div>
        <div class="glass-stat glass-stat-yellow"><div class="glass-stat-label">รอรับ</div><div class="glass-stat-value text-2xl">${dash.pendingPickup}</div></div>
        <div class="glass-stat glass-stat-green"><div class="glass-stat-label">รับแล้ว</div><div class="glass-stat-value text-2xl">${dash.pickedUp}</div></div>`;
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
    const datasets=[
      {label:"ขาย (ตัว)",data:dash.regionQtys,backgroundColor:"#7F1D1D",borderRadius:4,maxBarThickness:40},
    ];
    if(isAdmin()){
      datasets.push({label:"แจกฟรี (ตัว)",data:dash.regionFreeQtys,backgroundColor:"#6D28D9",borderRadius:4,maxBarThickness:40});
    }
    const chartTitle=isAdmin()?"จำนวนเสื้อตามเขต (ขาย vs แจกฟรี)":"จำนวนเสื้อตามเขต";
    if(regionChart&&regionChart.canvas===canvas&&document.body.contains(canvas)){
      regionChart.data.labels=dash.regionLabels;
      regionChart.data.datasets=datasets;
      regionChart.update();return;
    }
    if(regionChart)try{regionChart.destroy()}catch(_){}
    regionChart=new Chart(canvas.getContext("2d"),{type:"bar",data:{labels:dash.regionLabels,datasets:datasets},options:{maintainAspectRatio:false,animation:{duration:280},plugins:{legend:{display:true,labels:{color:"#fff",font:{family:"'Sarabun',sans-serif"}}},title:{display:true,text:chartTitle,color:"#fff",font:{size:15,weight:"700",family:"'Sarabun',sans-serif"}}},scales:{x:{stacked:true,ticks:{color:"rgba(255,255,255,.85)",font:{size:10,family:"'Sarabun',sans-serif"}},grid:{color:"rgba(255,255,255,.1)"}},y:{stacked:true,beginAtZero:true,ticks:{color:"rgba(255,255,255,.85)",font:{family:"'Sarabun',sans-serif"}},grid:{color:"rgba(255,255,255,.1)"}}}}});
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
    giveawayChart=new Chart(canvas.getContext("2d"),{type:"bar",data:{labels:dash.regionLabels,datasets:[{label:"ขาดทุนแจก (฿)",data:lossData,backgroundColor:"#8B5CF6",borderRadius:6,maxBarThickness:48}]},options:{maintainAspectRatio:false,animation:{duration:280},plugins:{legend:{display:false},title:{display:true,text:"มูลค่าขาดทุนจากการแจกฟรี (ไม่รวมยอดขาย)",color:"#fff",font:{size:15,weight:"700",family:"'Sarabun',sans-serif"}}},scales:{x:{ticks:{color:"rgba(255,255,255,.85)",font:{size:10,family:"'Sarabun',sans-serif"}},grid:{color:"rgba(255,255,255,.1)"}},y:{beginAtZero:true,ticks:{color:"rgba(255,255,255,.85)",font:{family:"'Sarabun',sans-serif"}},grid:{color:"rgba(255,255,255,.1)"}}}}});
  },

  upsertSizeChart(dash){
    const canvas=document.getElementById("sizeChart");
    if(!canvas)return;
    const sizeDatasets=[
      sizeChartDataset_("ขาย",dash.sizeQtys,"sale"),
    ];
    if(isAdmin()){
      sizeDatasets.push(sizeChartDataset_("แจกฟรี",dash.sizeFreeQtys,"free"));
    }
    const chartTitle=isAdmin()?"จำนวนตามไซส์ (ขาย vs แจกฟรี)":"จำนวนตามไซส์";
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
        <div id="report-cards"></div>
        <div>
          <h3 class="text-sm font-bold glass-section-title mb-2"><i class="fas fa-map-marker-alt mr-1"></i> ยอดสั่งตามเขต</h3>
          <div class="overflow-x-auto glass-table-wrap">
            <table class="glass-table report-table w-full text-xs" id="report-region-table">
              <thead><tr>
                <th class="py-2 px-2 text-left">เขต</th>
                <th class="py-2 px-2 text-center">ขาย (ตัว)</th>
                <th class="py-2 px-2 text-right">ยอดขาย (฿)</th>
                ${isAdmin()?`<th class="py-2 px-2 text-center">แจกฟรี</th>
                <th class="py-2 px-2 text-right">ขาดทุนแจก</th>`:""}
                <th class="py-2 px-2 text-left">ไซส์ (ขาย)</th>
              </tr></thead>
              <tbody id="report-region-body"></tbody>
              <tfoot id="report-region-foot"></tfoot>
            </table>
          </div>
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
    document.getElementById("report-cards").innerHTML=`
      <div class="glass-stat glass-stat-purple"><div class="glass-stat-label">ยอดขาย (ตัว)</div><div class="glass-stat-value">${t.totalQty}</div></div>
      <div class="glass-stat glass-stat-orange"><div class="glass-stat-label">ยอดขาย (฿)</div><div class="glass-stat-value text-xl">${fmtMoney(t.totalAmount)}</div></div>
      ${isAdmin()?`
      <div class="glass-stat" style="background:linear-gradient(135deg,rgba(109,40,217,.35),rgba(79,70,229,.25))"><div class="glass-stat-label">แจกฟรี (ตัว)</div><div class="glass-stat-value">${t.freeQty||0}</div></div>
      <div class="glass-stat" style="background:linear-gradient(135deg,rgba(109,40,217,.45),rgba(127,29,29,.2))"><div class="glass-stat-label">ขาดทุนแจก (฿)</div><div class="glass-stat-value text-xl">${fmtMoney(t.freeLoss||0)}</div></div>`:""}
      <div class="glass-stat glass-stat-green"><div class="glass-stat-label">สต็อกคงเหลือ</div><div class="glass-stat-value">${r.stockTotalRemaining}</div><div class="glass-stat-sub">ตัว</div></div>
      <div class="glass-stat glass-stat-blue"><div class="glass-stat-label">รอโอน</div><div class="glass-stat-value text-xl">${p.count} รายการ</div><div class="glass-stat-sub">${p.totalQty} ตัว</div></div>`;
    const sizes=appData?.stockSizes||[];
    const rows=r.byRegion.map(x=>{
      const parts=sizes.filter(s=>x.bySize[s]>0).length
        ? `<div class="order-items">${sizes.filter(s=>x.bySize[s]>0).map(s=>`<span class="order-item"><span class="size-badge ${sizeClass(s)}">${s}</span><span class="order-item-qty">${x.bySize[s]}</span></span>`).join("")}</div>`
        : '<span class="text-glass-dim">-</span>';
      const cls=x.totalQty>0?"":"text-glass-dim";
      const giveawayCols=isAdmin()?`<td data-label="แจกฟรี" class="py-2 px-2 text-center" style="color:#C4B5FD">${x.freeQty||0}</td><td data-label="ขาดทุน" class="py-2 px-2 text-right" style="color:#C4B5FD">${fmtMoney(x.freeLoss||0)}</td>`:"";
      return `<tr class="${cls}"><td data-label="เขต" class="py-2 px-2 font-semibold">${escHtml(regionShort(x.shortName))}</td><td data-label="ขาย" class="py-2 px-2 text-center font-bold">${x.totalQty}</td><td data-label="ยอดขาย" class="py-2 px-2 text-right">${fmtMoney(x.totalAmount)}</td>${giveawayCols}<td data-label="ไซส์" class="py-2 px-2">${parts}</td></tr>`;
    }).join("");
    document.getElementById("report-region-body").innerHTML=rows;
    const footGiveawayCols=isAdmin()?`<td data-label="แจกฟรี" class="py-2 px-2 text-center" style="color:#C4B5FD">${t.freeQty||0}</td><td data-label="ขาดทุน" class="py-2 px-2 text-right" style="color:#C4B5FD">${fmtMoney(t.freeLoss||0)}</td>`:"";
    document.getElementById("report-region-foot").innerHTML=`<tr><td data-label="เขต" class="py-2 px-2 font-bold">รวม</td><td data-label="ขาย" class="py-2 px-2 text-center">${t.totalQty}</td><td data-label="ยอดขาย" class="py-2 px-2 text-right">${fmtMoney(t.totalAmount)}</td>${footGiveawayCols}<td data-label="ไซส์" class="py-2 px-2"></td></tr>`;
    const cells=r.stock.map(s=>{
      const cls=s.remaining<=5?"low":"";
      const nc=s.remaining<=5?"text-red-glass":"text-green-glass";
      return `<div class="glass-stock-cell ${cls}"><span class="size-badge ${sizeClass(s.size)}">${s.size}</span><div class="text-lg font-bold ${nc} mt-1">${s.remaining}</div><div class="text-xs text-glass-muted">/${s.delivered}</div></div>`;
    }).join("");
    document.getElementById("report-stock").innerHTML=`<div class="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2 mb-2">${cells}</div><div class="glass-total-bar">รวมคงเหลือทั้งหมด: <span class="text-lg">${r.stockTotalRemaining}</span> ตัว</div>`;
  },

  // ── Admin view ─────────────────────────────────────────────────────
  renderAdmin(){
    if(!isAdmin())return '<div class="glass-msg-error text-center font-semibold">เฉพาะแอดมินเท่านั้น</div>';
    const stockInputs=appData.stock.map((s,i)=>`<label class="text-xs font-semibold block text-glass">${s.size} (ขายแล้ว ${s.sold})<input id="stock-del-${i}" type="number" min="0" class="glass-input p-2 mt-1" value="${s.delivered}"></label>`).join("");
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
          <h3 class="font-bold text-sm mb-3 text-glass">จำนวนที่มาส่ง</h3>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">${stockInputs}</div>
          <button onclick="app.saveStock(this)" class="w-full glass-btn-primary py-2 text-sm">บันทึกสต็อก</button>
        </div>
        <div class="glass-card-inner p-4">
          <h3 class="font-bold text-sm mb-3 text-glass"><i class="fas fa-users mr-1"></i> จัดการผู้ใช้</h3>
          <div id="admin-users-list" class="space-y-2 mb-3"><div class="text-xs text-glass-muted text-center">กำลังโหลด...</div></div>
          <button onclick="app.showCreateUser()" class="w-full glass-btn-blue py-2 text-sm"><i class="fas fa-user-plus mr-1"></i> เพิ่มผู้ใช้</button>
        </div>
        <div class="glass-danger-zone">
          <h3 class="font-bold text-sm mb-2"><i class="fas fa-exclamation-triangle mr-1"></i> ล้างข้อมูลทั้งหมด</h3>
          <p class="text-xs mb-3 opacity-80">ลบรายการขายทั้งหมด รีเซ็ตสต็อก (ไม่ลบ Users)</p>
          <button onclick="app.resetData(this)" class="w-full glass-btn-danger py-2 text-sm font-bold">ล้างข้อมูล เริ่มจาก 0</button>
        </div>
        <button onclick="app.exportCSV(this)" class="w-full glass-btn-blue py-2 text-sm"><i class="fas fa-file-csv mr-1"></i> Export CSV ทั้งหมด</button>
      </div>
      <div id="msg-box"></div>`;
  },

  async initAdmin(){
    pendingImageBase64="";
    if(isAdmin())await this.loadUserList();
  },

  async loadUserList(){
    const el=document.getElementById("admin-users-list");
    if(!el)return;
    try{
      const users=await callAuthed("listUsers");
      if(!users||users.length===0){el.innerHTML='<div class="text-xs text-glass-muted text-center">ไม่มีผู้ใช้</div>';return}
      const myU=String(me&&me.username||"").trim().toLowerCase();
      el.innerHTML=users.map(u=>{
        const roleCls=u.role==="admin"?"role-badge-admin":(u.role==="engineer"?"role-badge-engineer":"role-badge-user");
        const roleLabel=u.role==="admin"?"แอดมิน":(u.role==="engineer"?`${ROLE_ENGINEER_LABEL} (แอดมินรอง)`:"ผู้ใช้");
        const uKey=escAttr(u.username);
        const canDel=String(u.username||"").trim().toLowerCase()!==myU;
        return `<div class="glass-card-inner p-2 flex justify-between items-center gap-2 flex-wrap" data-admin-user="${uKey}">
          <div style="min-width:0;flex:1 1 60%">
            <div class="text-sm font-bold text-glass" style="word-break:break-word">${escHtml(u.username)} <span class="${roleCls}">${roleLabel}</span></div>
            <div class="text-xs text-glass-muted">${escHtml(u.displayName||"")} · ${escHtml(u.region||"-")}</div>
          </div>
          <div class="flex gap-1" style="flex-shrink:0">
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
          if(t.classList.contains("admin-user-pwd"))app.showUserPassword(name,t);
          else if(t.classList.contains("admin-user-reset"))app.resetUserPwd(name,t);
          else if(t.classList.contains("admin-user-del"))app.deleteUserPrompt(name,t);
        });
      }
    }catch(e){el.innerHTML=`<div class="text-xs text-red-glass">${escHtml(e.message)}</div>`}
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
    if(role==="admin"){
      html='<option value="*">* (ทุกเขต — แอดมิน)</option>';
    }else{
      (appData?.regions||[]).forEach(r=>{html+=`<option value="${escHtml(r)}">${escHtml(r)}</option>`});
    }
    sel.innerHTML=html;
    if(role==="admin")sel.value="*";
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
      if(role===ROLE_ENGINEER&&(!region||region==="*")){
        region="สำนักงานใหญ่";
        const sel=document.getElementById("nu-region");
        if(sel)sel.value=region;
      }
      const payload={
        username:document.getElementById("nu-username").value.trim(),
        displayName:document.getElementById("nu-display").value.trim(),
        password:document.getElementById("nu-password").value,
        role:role,
        region:region
      };
      if(payload.password.length<4){alert("รหัสผ่านต้องอย่างน้อย 4 ตัว");return}
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
    const np=prompt("รหัสผ่านใหม่สำหรับ "+username+" (อย่างน้อย 4 ตัว):");
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
    pendingImageBase64=await prepareImageBase64ForUpload_(input.files[0]);
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
        if(fi.files&&fi.files[0])base64=await prepareImageBase64ForUpload_(fi.files[0]);
      }
      if(!base64)return this.showMsg("กรุณาเลือกรูปก่อน","error");
      const r=await runSaving({btn:btn,busyText:"กำลังอัปโหลดรูป…"},()=>callAuthed("uploadShirtImage",base64));
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
      const b=await prepareImageBase64ForUpload_(input.files[0]);
      const img=document.getElementById("stock-shirt-image");
      const prevSrc=img?img.src:"";
      if(img)img.src=b;
      const r=await runSaving({busyText:"กำลังอัปโหลดรูป…"},()=>callAuthed("uploadShirtImage",b));
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
    const reason="onerror src="+String(imgEl.currentSrc||imgEl.src||"");
    console.warn("[shirt-image] load failed",reason);
    if(isAdminPreview){
      setImageDebug("image-load-failed: "+reason);
    }
    imgEl.setAttribute("data-fallback","1");
    imgEl.src=SHIRT_PLACEHOLDER_URL;
    if(!isAdminPreview){
      this.showMsg("รูปเสื้อโหลดไม่สำเร็จ ระบบใช้รูปสำรองแทนชั่วคราว","warning");
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
        host.classList.remove("status-รับแล้ว","status-รอโอน","status-รอรับ");
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
  try{
    app.container=document.getElementById("app-container");
    try{authToken=localStorage.getItem(TOKEN_KEY)||null}catch(_){authToken=null}
    if(!authToken){renderLogin();return}
    // Guard verifySession so a hung/failed call still lands on the login screen.
    let settled=false;
    const fallback=setTimeout(()=>{if(settled)return;settled=true;try{renderLogin("เชื่อมต่อเซิร์ฟเวอร์ช้า กรุณาเข้าสู่ระบบ")}catch(_){}} ,9000);
    callServer("verifySession",authToken).then(r=>{
      if(settled)return; settled=true; clearTimeout(fallback);
      if(r&&r.ok){
        me=normalizeMeClient_({username:r.username,role:r.role,region:r.region,displayName:r.displayName});
        syncWindowSession_();
        bootApp();
      }else{
        authToken=null;try{localStorage.removeItem(TOKEN_KEY)}catch(_){}
        renderLogin();
      }
    }).catch(()=>{
      if(settled)return; settled=true; clearTimeout(fallback);
      authToken=null;
      try{renderLogin()}catch(_){}
    });
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