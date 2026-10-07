/* Rename to todo.js when deploying. */
(() => {
  "use strict";
  const TODO_STORAGE_KEY = "__0f8_todo_items__";
  let operationChain = Promise.resolve();

  function log(event, details = {}) { console.log("[0f8-todo]", event, details); }
  function errorLog(event, error, details = {}) { console.error("[0f8-todo]", event, error instanceof Error ? error.message : String(error), details); }
  function required(id) { const element = document.getElementById(id); if (!element) { console.error(`[0f8-todo] Required element not found: #${id}`); throw new Error(`Required element not found: #${id}`); } return element; }
  function setStatus(message, kind = "") { const el = required("action-status"); el.textContent = message; el.dataset.kind = kind; }
  function enqueue(task) { const next = operationChain.then(task, task); operationChain = next.catch(() => {}); return next; }
  function parseItems(value) {
    if (!value) return [];
    let parsed; try { parsed = JSON.parse(value); } catch { return []; }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === "object" && typeof item.id === "string" && typeof item.text === "string" && typeof item.done === "boolean");
  }
  async function loadItems() { const value = await window.OF8Account.getItem(TODO_STORAGE_KEY); const items = parseItems(value); render(items); return items; }
  async function saveItems(items) { await window.OF8Account.setItem(TODO_STORAGE_KEY, JSON.stringify(items)); render(items); }
  function render(items) {
    const list = required("todo-list"); list.textContent = "";
    if (!items.length) { const empty = document.createElement("li"); empty.className = "todo-item"; empty.textContent = "ToDoはありません。"; list.appendChild(empty); return; }
    for (const item of items) {
      const li = document.createElement("li"); li.className = `todo-item${item.done ? " done" : ""}`;
      const label = document.createElement("label"); const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = item.done;
      checkbox.addEventListener("change", () => enqueue(async () => { const current = parseItems(await window.OF8Account.getItem(TODO_STORAGE_KEY)); const target = current.find((row) => row.id === item.id); if (!target) return; target.done = checkbox.checked; await saveItems(current); setStatus("更新しました。", "success"); log("todo_toggled", { id: item.id, done: target.done }); }));
      const text = document.createElement("span"); text.className = "todo-text"; text.textContent = item.text; label.append(checkbox, text);
      const del = document.createElement("button"); del.className = "delete"; del.type = "button"; del.textContent = "削除";
      del.addEventListener("click", () => enqueue(async () => { const current = parseItems(await window.OF8Account.getItem(TODO_STORAGE_KEY)); const next = current.filter((row) => row.id !== item.id); await saveItems(next); setStatus("削除しました。", "success"); log("todo_deleted", { id: item.id }); }));
      li.append(label, del); list.appendChild(li);
    }
  }
  async function refreshAuthState() {
    const loggedIn = await window.OF8Account.isLoggedIn();
    required("auth-status").textContent = loggedIn ? "ログイン中" : "未ログイン";
    required("app-panel").hidden = !loggedIn;
    if (!loggedIn) { required("account-panel").hidden = true; required("usage-panel").hidden = true; return false; }
    const account = await window.OF8Account.getAccountInfo();
    required("account-name").textContent = account.account?.name || "-";
    await loadItems();
    return true;
  }
  async function login() { setStatus("ログインしています…"); await window.OF8Account.login(); await refreshAuthState(); setStatus("ログインしました。", "success"); log("login_completed"); }
  async function logout() { await window.OF8Account.logout(); required("auth-status").textContent = "未ログイン"; required("account-name").textContent = "-"; required("app-panel").hidden = true; required("account-panel").hidden = true; required("usage-panel").hidden = true; setStatus("ログアウトしました。", "success"); }
  async function addTodo(event) {
    event.preventDefault(); const input = required("todo-input"); const text = input.value.trim(); if (!text) return;
    await enqueue(async () => { const items = parseItems(await window.OF8Account.getItem(TODO_STORAGE_KEY)); const item = { id: crypto.randomUUID(), text, done: false }; items.push(item); await saveItems(items); input.value = ""; setStatus("追加しました。", "success"); log("todo_added", { id: item.id }); });
  }
  async function showAccountInfo() { const result = await window.OF8Account.getAccountInfo(); const account = result.account; required("info-id").textContent = account?.id || "-"; required("info-name").textContent = account?.name || "-"; required("info-origin").textContent = location.origin; required("account-panel").hidden = false; setStatus("アカウント情報を取得しました。", "success"); log("account_info_loaded"); }
  function formatBytes(bytes) { if (!Number.isFinite(bytes) || bytes < 0) return "-"; if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 / 1024).toFixed(2)} MB`; }
  async function showUsage() { const result = await window.OF8Account.getUsage(); const usage = result.usage; required("usage-total").textContent = `${usage.dataChars.toLocaleString()}文字 / ${formatBytes(usage.dataBytes)}`; required("usage-account-total").textContent = `アカウント領域 ${formatBytes(usage.accountStorageBytes)}`; const box = required("usage-domains"); box.textContent = ""; for (const row of usage.domains) { const item = document.createElement("div"); item.className = "usage-domain"; item.textContent = `${row.domain} — ${row.encryptedChars.toLocaleString()}文字 / ${formatBytes(row.encryptedBytes)}`; box.appendChild(item); } required("usage-panel").hidden = false; setStatus("使用容量を取得しました。", "success"); log("usage_loaded", { domains: usage.domains.length }); }
  async function init() {
    required("login-button").addEventListener("click", async () => { try { await login(); } catch (error) { errorLog("login_failed", error); setStatus(error.message, "error"); } });
    required("logout-button").addEventListener("click", async () => { try { await logout(); } catch (error) { errorLog("logout_failed", error); setStatus(error.message, "error"); } });
    required("todo-form").addEventListener("submit", async (event) => { try { await addTodo(event); } catch (error) { errorLog("todo_add_failed", error); setStatus(error.message, "error"); } });
    required("sync-button").addEventListener("click", async () => { try { await enqueue(async () => { await loadItems(); setStatus("同期しました。", "success"); }); } catch (error) { errorLog("sync_failed", error); setStatus(error.message, "error"); } });
    required("refresh-account").addEventListener("click", async () => { try { await showAccountInfo(); } catch (error) { errorLog("account_info_failed", error); setStatus(error.message, "error"); } });
    required("refresh-usage").addEventListener("click", async () => { try { await showUsage(); } catch (error) { errorLog("usage_failed", error); setStatus(error.message, "error"); } });
    try { await refreshAuthState(); } catch (error) { errorLog("session_check_failed", error); setStatus("ログイン状態を取得できませんでした。", "error"); }
    log("ready");
  }
  try { init(); } catch (error) { errorLog("init_failed", error); }
})();
