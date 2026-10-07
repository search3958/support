/* Rename to account-dashboard.js when deploying. */
(() => {
  "use strict";

  const API_BASE = "https://sentaro-0f8-accounts.takesen2278.workers.dev";
  const TOKEN_COOKIE = "of8_access_token";
  const SIGNATURE_COOKIE = "of8_access_signature";
  const DATA_KEY_STORAGE = "__of8_data_access_key_v1__";

  function log(event, details = {}) {
    console.log("[0f8-dashboard]", event, details);
  }

  function errorLog(event, error, details = {}) {
    console.error("[0f8-dashboard]", event, error instanceof Error ? error.message : String(error), details);
  }

  function required(id) {
    const element = document.getElementById(id);
    if (!element) {
      console.error(`[0f8-dashboard] Required element not found: #${id}`);
      throw new Error(`Required element not found: #${id}`);
    }
    return element;
  }

  function cookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const item = document.cookie.split("; ").find((entry) => entry.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : "";
  }

  function setCookie(name, value) {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=259200; Path=/; Secure; SameSite=Lax`;
  }

  function delCookie(name) {
    document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
  }

  function setStatus(id, message, kind = "") {
    const element = required(id);
    element.textContent = message;
    element.dataset.kind = kind;
  }

  function base64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function fileToBase64Url(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return base64Url(bytes);
  }

  function imageDimensions(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("アイコン画像を読み込めませんでした。"));
      };
      image.src = url;
    });
  }

  async function api(path, options = {}) {
    const headers = new Headers({
      Accept: "application/json",
      ...(options.headers || {}),
    });
    const token = cookie(TOKEN_COOKIE);
    const signature = cookie(SIGNATURE_COOKIE);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (signature) headers.set("X-OF8-Signature", signature);
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      credentials: "omit",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error?.message || `Request failed (${response.status}).`);
    if (data.token && data.signature) {
      setCookie(TOKEN_COOKIE, data.token);
      setCookie(SIGNATURE_COOKIE, data.signature);
      log("token_rotated", { path });
    }
    return data;
  }

  function showDashboard(account) {
    required("login-card").classList.add("account-hidden");
    required("dashboard-card").classList.remove("account-hidden");
    required("account-id").textContent = `ID: ${account.id}`;
    required("account-name").value = account.name;
    const icon = required("account-icon");
    if (account.icon) {
      icon.src = `data:${account.iconMimeType || "image/png"};base64,${account.icon}`;
      icon.hidden = false;
    } else {
      icon.removeAttribute("src");
      icon.hidden = true;
    }
  }

  async function load() {
    const data = await api("/v1/account/info");
    showDashboard(data.account);
    log("dashboard_loaded", { id: data.account.id });
  }

  async function login() {
    const popupUrl = new URL("account-login.html", location.href);
    popupUrl.searchParams.set("origin", location.origin);
    popupUrl.searchParams.set("state", base64Url(crypto.getRandomValues(new Uint8Array(24))));
    const popup = window.open(popupUrl.toString(), "of8-dashboard-login", "popup=yes,width=460,height=720");
    if (!popup) throw new Error("ログインポップアップがブロックされました。");

    const result = await new Promise((resolve, reject) => {
      const expectedOrigin = location.origin;
      const timeout = setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(new Error("ログインがタイムアウトしました。"));
      }, 5 * 60 * 1000);
      function handler(event) {
        if (event.origin !== location.origin || event.source !== popup) return;
        const message = event.data;
        if (!message || message.type !== "OF8_AUTH_RESULT") return;
        if (message.state !== popupUrl.searchParams.get("state")) return;
        clearTimeout(timeout);
        window.removeEventListener("message", handler);
        resolve(message);
      }
      window.addEventListener("message", handler);
    });
    setCookie(TOKEN_COOKIE, result.accessToken);
    setCookie(SIGNATURE_COOKIE, result.signature);
    log("login_completed");
    await load();
  }

  async function saveProfile() {
    const name = required("account-name").value.trim();
    if (!name) throw new Error("名前を入力してください。");
    const fileInput = required("account-icon-file");
    const body = { name };
    const file = fileInput.files?.[0];
    if (file) {
      if (file.size > 13 * 1024) throw new Error("アイコンは13KB以内にしてください。");
      const dimensions = await imageDimensions(file);
      if (dimensions.width !== 64 || dimensions.height !== 64) throw new Error("アイコンは64x64pxにしてください。");
      body.iconBase64Url = await fileToBase64Url(file);
      body.iconMimeType = file.type;
    }
    const data = await api("/v1/account/profile", { method: "POST", body });
    showDashboard(data.account);
    setStatus("profile-status", "保存しました。", "success");
  }

  async function removeIcon() {
    const data = await api("/v1/account/profile", { method: "POST", body: { removeIcon: true } });
    showDashboard(data.account);
    setStatus("profile-status", "アイコンを削除しました。", "success");
  }

  async function changePassword() {
    const currentPassword = required("current-password").value;
    const newPassword = required("new-password").value;
    await api("/v1/account/password", { method: "POST", body: { currentPassword, newPassword } });
    delCookie(TOKEN_COOKIE);
    delCookie(SIGNATURE_COOKIE);
    localStorage.removeItem(DATA_KEY_STORAGE);
    required("dashboard-card").classList.add("account-hidden");
    required("login-card").classList.remove("account-hidden");
    setStatus("password-status", "パスワードを変更しました。すべての端末がログアウトされました。", "success");
  }

  async function logoutAll() {
    await api("/v1/auth/logout-all", { method: "POST", body: {} });
    delCookie(TOKEN_COOKIE);
    delCookie(SIGNATURE_COOKIE);
    localStorage.removeItem(DATA_KEY_STORAGE);
    required("dashboard-card").classList.add("account-hidden");
    required("login-card").classList.remove("account-hidden");
    setStatus("dashboard-status", "すべての端末からログアウトしました。", "success");
  }

  async function logout() {
    try {
      await api("/v1/auth/logout", { method: "POST", body: {} });
    } finally {
      delCookie(TOKEN_COOKIE);
      delCookie(SIGNATURE_COOKIE);
      localStorage.removeItem(DATA_KEY_STORAGE);
      required("dashboard-card").classList.add("account-hidden");
      required("login-card").classList.remove("account-hidden");
      setStatus("dashboard-status", "ログアウトしました。", "success");
    }
  }

  async function deleteAccount() {
    const password = window.prompt("アカウントを完全に削除します。現在のパスワードを入力してください。");
    if (password === null) return;
    if (!window.confirm("アカウントと保存データを完全に削除します。続行しますか？")) return;
    await api("/v1/account", { method: "DELETE", body: { password } });
    delCookie(TOKEN_COOKIE);
    delCookie(SIGNATURE_COOKIE);
    localStorage.removeItem(DATA_KEY_STORAGE);
    required("dashboard-card").classList.add("account-hidden");
    required("login-card").classList.remove("account-hidden");
    setStatus("dashboard-status", "アカウントを削除しました。", "success");
    log("account_deleted");
  }

  async function init() {
    const loginButton = required("dashboard-login");
    required("profile-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      try { await saveProfile(); } catch (error) { errorLog("profile_update_failed", error); setStatus("profile-status", error.message, "error"); }
    });
    required("remove-icon").addEventListener("click", async () => {
      try { await removeIcon(); } catch (error) { errorLog("icon_remove_failed", error); setStatus("profile-status", error.message, "error"); }
    });
    required("password-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      try { await changePassword(); } catch (error) { errorLog("password_change_failed", error); setStatus("password-status", error.message, "error"); }
    });
    required("logout-all").addEventListener("click", async () => {
      try { await logoutAll(); } catch (error) { errorLog("logout_all_failed", error); setStatus("dashboard-status", error.message, "error"); }
    });
    required("logout").addEventListener("click", async () => {
      try { await logout(); } catch (error) { errorLog("logout_failed", error); }
    });
    required("delete-account").addEventListener("click", async () => {
      try { await deleteAccount(); } catch (error) { errorLog("delete_account_failed", error); setStatus("dashboard-status", error.message, "error"); }
    });
    loginButton.addEventListener("click", async () => {
      loginButton.disabled = true;
      setStatus("dashboard-login-status", "処理中…");
      try { await login(); } catch (error) { errorLog("login_failed", error); setStatus("dashboard-login-status", error.message, "error"); }
      finally { loginButton.disabled = false; }
    });

    if (cookie(TOKEN_COOKIE) && cookie(SIGNATURE_COOKIE)) {
      try {
        await load();
        log("existing_session_loaded");
      } catch (error) {
        errorLog("session_load_failed", error);
        delCookie(TOKEN_COOKIE);
        delCookie(SIGNATURE_COOKIE);
      }
    }

    log("ready");
  }

  try {
    init();
  } catch (error) {
    errorLog("init_failed", error);
  }
})();
