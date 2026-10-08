/* Rename to account-dashboard.js when deploying. */
(() => {
  "use strict";

  const API_BASE = "https://sentaro-0f8-accounts.takesen2278.workers.dev";
  const TOKEN_COOKIE = "__Host-of8_access_token";
  const SIGNATURE_COOKIE = "__Host-of8_access_signature";
  const LEGACY_TOKEN_COOKIE = "of8_access_token";
  const LEGACY_SIGNATURE_COOKIE = "of8_access_signature";
  const DATA_KEY_STORAGE = "__of8_data_access_key_v2__";
  const MANAGEMENT_ORIGIN = "https://search3958.github.io";

  function log(event, details = {}) { console.log("[0f8-dashboard]", event, details); }
  function errorLog(event, error, details = {}) { console.error("[0f8-dashboard]", event, error instanceof Error ? error.message : String(error), details); }
  function required(id) { const element = document.getElementById(id); if (!element) { console.error(`[0f8-dashboard] Required element not found: #${id}`); throw new Error(`Required element not found: #${id}`); } return element; }
  function cookie(name) { const prefix = `${encodeURIComponent(name)}=`; const item = document.cookie.split("; ").find((entry) => entry.trim().startsWith(prefix)); if (!item) return ""; try { return decodeURIComponent(item.trim().slice(prefix.length)); } catch (error) { errorLog("cookie_decode_failed", error, { name }); return ""; } }
  function sessionCookie(name, legacyName) { const value = cookie(name); if (value) return value; const legacy = cookie(legacyName); if (legacy) log("legacy_cookie_detected", { name: legacyName }); return legacy; }
  function setCookie(name, value) { document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=259200; Path=/; Secure; SameSite=Strict`; log("cookie_saved", { name }); }
  function delCookie(name) { document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; Path=/; Secure; SameSite=Strict`; log("cookie_deleted", { name }); }
  function setStatus(id, message, kind = "") { const element = required(id); element.textContent = message; element.dataset.kind = kind; }
  function base64Url(bytes) { let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
  async function fileToBase64Url(file) { return base64Url(new Uint8Array(await file.arrayBuffer())); }
  function imageDimensions(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file); const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("アイコン画像を読み込めませんでした。")); };
      image.src = url;
    });
  }
  function isManagementOrigin() { return location.origin.toLowerCase() === MANAGEMENT_ORIGIN; }
  function clearSession() { delCookie(TOKEN_COOKIE); delCookie(SIGNATURE_COOKIE); delCookie(LEGACY_TOKEN_COOKIE); delCookie(LEGACY_SIGNATURE_COOKIE); localStorage.removeItem(DATA_KEY_STORAGE); log("session_cleared"); }

  async function api(path, options = {}) {
    const headers = new Headers({ Accept: "application/json", ...(options.headers || {}) });
    const token = sessionCookie(TOKEN_COOKIE, LEGACY_TOKEN_COOKIE); const signature = sessionCookie(SIGNATURE_COOKIE, LEGACY_SIGNATURE_COOKIE);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (signature) headers.set("X-OF8-Signature", signature);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    if (options.dataAccess === true) {
      const accessKey = localStorage.getItem(DATA_KEY_STORAGE) || "";
      if (!accessKey) throw new Error("データアクセスキーがありません。再ログインしてください。");
      headers.set("X-OF8-Data-Access-Key", accessKey);
    }
    const response = await fetch(`${API_BASE}${path}`, { method: options.method || "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), cache: "no-store", credentials: "omit" });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error?.message || `Request failed (${response.status}).`);
    if (data.token && data.signature) { setCookie(TOKEN_COOKIE, data.token); setCookie(SIGNATURE_COOKIE, data.signature); log("token_rotated", { path }); }
    return data;
  }

  function showDashboard(account) {
    required("login-card").classList.add("account-hidden"); required("dashboard-card").classList.remove("account-hidden");
    required("account-id").textContent = `ID: ${account.id}`; required("account-name").value = account.name;
    const icon = required("account-icon");
    if (account.icon && typeof account.icon === "string") { icon.src = `data:${account.iconMimeType || "image/png"};base64,${account.icon}`; icon.hidden = false; log("icon_loaded"); } else { icon.removeAttribute("src"); icon.hidden = true; log("icon_not_set"); }
    const allowed = isManagementOrigin();
    required("save-profile").disabled = !allowed; required("remove-icon").disabled = !allowed; required("account-icon-file").disabled = !allowed; required("account-name").disabled = !allowed;
    setStatus("management-origin-status", allowed ? "プロフィール編集: search3958.github.io として許可" : "プロフィール・アイコン編集は search3958.github.io からのみ許可されます。", allowed ? "success" : "error");
  }

  async function load() { const data = await api("/v1/account/info"); showDashboard(data.account); await loadUsage(); log("dashboard_loaded", { id: data.account.id }); }

  async function loadUsage() {
    setStatus("usage-status", "容量を取得しています…");
    const data = await api("/v1/account/usage");
    const usage = data.usage;
    required("usage-total").textContent = `${usage.dataChars.toLocaleString()}文字 / ${formatBytes(usage.dataBytes)}`;
    required("usage-icon").textContent = formatBytes(usage.iconBytes);
    required("usage-account-total").textContent = formatBytes(usage.accountStorageBytes);
    const tbody = required("usage-domains"); tbody.textContent = "";
    for (const row of usage.domains) {
      const tr = document.createElement("tr");
      const domain = document.createElement("td"); domain.textContent = row.domain;
      const chars = document.createElement("td"); chars.textContent = `${row.encryptedChars.toLocaleString()}文字`;
      const bytes = document.createElement("td"); bytes.textContent = formatBytes(row.encryptedBytes);
      const action = document.createElement("td");
      const button = document.createElement("button");
      button.className = "account-button secondary domain-delete-button";
      button.type = "button";
      button.textContent = "削除";
      button.disabled = !isManagementOrigin();
      button.title = isManagementOrigin() ? "このドメインの保存データをすべて削除" : "管理画面からのみ削除できます";
      button.addEventListener("click", async () => {
        if (!isManagementOrigin()) { console.error("[0f8-dashboard] Domain delete is unavailable outside management origin."); return; }
        if (!window.confirm(`${row.domain} の保存データをすべて削除します。続行しますか？`)) return;
        button.disabled = true;
        try {
          await api("/v1/account/domain", { method: "DELETE", body: { domain: row.domain } });
          log("domain_deleted", { domain: row.domain });
          await loadUsage();
          setStatus("usage-status", `${row.domain} の保存データを削除しました。`, "success");
        } catch (error) {
          errorLog("domain_delete_failed", error, { domain: row.domain });
          setStatus("usage-status", error.message, "error");
          button.disabled = false;
        }
      });
      action.appendChild(button);
      tr.append(domain, chars, bytes, action); tbody.appendChild(tr);
    }
    if (!usage.domains.length) { const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 4; td.textContent = "保存データはありません。"; tr.appendChild(td); tbody.appendChild(tr); }
    setStatus("usage-status", `データ上限: ${usage.maxDataChars.toLocaleString()}文字`);
    log("usage_loaded", { domains: usage.domains.length, dataBytes: usage.dataBytes });
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "-";
    if (bytes < 1024) return `${bytes} B`; const units = ["KB", "MB", "GB"]; let value = bytes / 1024;
    for (const unit of units) { if (value < 1024 || unit === units.at(-1)) return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`; value /= 1024; }
    return `${bytes} B`;
  }

  async function login() {
    const popupUrl = new URL("account-login.html", location.href); popupUrl.searchParams.set("origin", location.origin); popupUrl.searchParams.set("state", base64Url(crypto.getRandomValues(new Uint8Array(24))));
    const popup = window.open(popupUrl.toString(), "of8-dashboard-login", "popup=yes,width=460,height=720");
    if (!popup) throw new Error("ログインポップアップがブロックされました。");
    const result = await new Promise((resolve, reject) => {
      const expectedOrigin = location.origin; const state = popupUrl.searchParams.get("state"); const timeout = setTimeout(() => { window.removeEventListener("message", handler); reject(new Error("ログインがタイムアウトしました。")); }, 5 * 60 * 1000);
      function handler(event) {
        if (event.origin !== expectedOrigin || event.source !== popup) return; const message = event.data;
        if (!message || message.type !== "OF8_AUTH_RESULT" || message.version !== 2 || message.state !== state) return;
        if (typeof message.accessToken !== "string" || typeof message.signature !== "string" || typeof message.dataAccessKey !== "string") { clearTimeout(timeout); window.removeEventListener("message", handler); reject(new Error("認証結果が不正です。")); return; }
        clearTimeout(timeout); window.removeEventListener("message", handler); resolve(message);
      }
      window.addEventListener("message", handler);
    });
    setCookie(TOKEN_COOKIE, result.accessToken); setCookie(SIGNATURE_COOKIE, result.signature); localStorage.setItem(DATA_KEY_STORAGE, result.dataAccessKey); log("login_completed"); await load();
  }

  async function saveProfile() {
    if (!isManagementOrigin()) throw new Error("プロフィール・アイコン編集は search3958.github.io からのみ許可されます。");
    const name = required("account-name").value.trim(); if (!name) throw new Error("名前を入力してください。");
    const body = { name }; const file = required("account-icon-file").files?.[0];
    if (file) { if (file.size > 13 * 1024) throw new Error("アイコンは13KB以内にしてください。"); const dimensions = await imageDimensions(file); if (dimensions.width !== 64 || dimensions.height !== 64) throw new Error("アイコンは64x64pxにしてください。"); body.iconBase64Url = await fileToBase64Url(file); body.iconMimeType = file.type; }
    const data = await api("/v1/account/profile", { method: "POST", body }); showDashboard(data.account); setStatus("profile-status", "保存しました。", "success");
  }
  async function removeIcon() {
    if (!isManagementOrigin()) throw new Error("プロフィール・アイコン編集は search3958.github.io からのみ許可されます。");
    const data = await api("/v1/account/profile", { method: "POST", body: { removeIcon: true } }); showDashboard(data.account); setStatus("profile-status", "アイコンを削除しました。", "success");
  }
  async function changePassword() {
    if (!isManagementOrigin()) throw new Error("パスワード変更は search3958.github.io からのみ許可されています。");
    const currentPassword = required("current-password").value; const newPassword = required("new-password").value;
    if ([currentPassword, newPassword].some((value) => [...value].length < 8)) throw new Error("パスワードは8文字以上で入力してください。");
    await api("/v1/account/password", { method: "POST", body: { currentPassword, newPassword } });
    clearSession(); required("dashboard-card").classList.add("account-hidden"); required("login-card").classList.remove("account-hidden"); required("current-password").value = ""; required("new-password").value = "";
    setStatus("password-status", "パスワードを変更しました。全保存データも新しい鍵で再暗号化されています。", "success");
  }
  async function logoutAll() {
    if (!isManagementOrigin()) throw new Error("全端末からのログアウトは search3958.github.io からのみ許可されています。");
    await api("/v1/auth/logout-all", { method: "POST", body: {} }); clearSession(); required("dashboard-card").classList.add("account-hidden"); required("login-card").classList.remove("account-hidden"); setStatus("dashboard-status", "すべての端末からログアウトしました。", "success"); }
  async function logout() { try { await api("/v1/auth/logout", { method: "POST", body: {} }); } finally { clearSession(); required("dashboard-card").classList.add("account-hidden"); required("login-card").classList.remove("account-hidden"); setStatus("dashboard-status", "ログアウトしました。", "success"); } }
  async function deleteAccount() {
    if (!isManagementOrigin()) throw new Error("アカウント削除は search3958.github.io からのみ許可されています。");
    const password = window.prompt("アカウントを完全に削除します。現在のパスワードを入力してください。"); if (password === null) return; if (!window.confirm("アカウントと保存データを完全に削除します。続行しますか？")) return;
    await api("/v1/account", { method: "DELETE", body: { password } }); clearSession(); required("dashboard-card").classList.add("account-hidden"); required("login-card").classList.remove("account-hidden"); setStatus("dashboard-status", "アカウントを削除しました。", "success"); log("account_deleted");
  }

  async function init() {
    required("profile-form").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveProfile(); } catch (error) { errorLog("profile_update_failed", error); setStatus("profile-status", error.message, "error"); } });
    required("remove-icon").addEventListener("click", async () => { try { await removeIcon(); } catch (error) { errorLog("icon_remove_failed", error); setStatus("profile-status", error.message, "error"); } });
    required("password-form").addEventListener("submit", async (event) => { event.preventDefault(); try { await changePassword(); } catch (error) { errorLog("password_change_failed", error); setStatus("password-status", error.message, "error"); } });
    required("logout-all").addEventListener("click", async () => { try { await logoutAll(); } catch (error) { errorLog("logout_all_failed", error); setStatus("dashboard-status", error.message, "error"); } });
    required("logout").addEventListener("click", async () => { try { await logout(); } catch (error) { errorLog("logout_failed", error); } });
    required("delete-account").addEventListener("click", async () => { try { await deleteAccount(); } catch (error) { errorLog("delete_account_failed", error); setStatus("dashboard-status", error.message, "error"); } });
    required("refresh-usage").addEventListener("click", async () => { try { await loadUsage(); } catch (error) { errorLog("usage_refresh_failed", error); setStatus("usage-status", error.message, "error"); } });
    const loginButton = required("dashboard-login");
    loginButton.addEventListener("click", async () => { loginButton.disabled = true; setStatus("dashboard-login-status", "処理中…"); try { await login(); } catch (error) { errorLog("login_failed", error); setStatus("dashboard-login-status", error.message, "error"); } finally { loginButton.disabled = false; } });
    if (sessionCookie(TOKEN_COOKIE, LEGACY_TOKEN_COOKIE) && sessionCookie(SIGNATURE_COOKIE, LEGACY_SIGNATURE_COOKIE) && localStorage.getItem(DATA_KEY_STORAGE)) { try { await load(); log("existing_session_loaded"); } catch (error) { errorLog("session_load_failed", error); clearSession(); } }
    log("ready", { managementOriginAllowed: isManagementOrigin() });
  }
  try { init(); } catch (error) { errorLog("init_failed", error); }
})();
