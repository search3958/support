/* 0f8 Account Client Service v1
 * Rename this file to client-service.js when deploying it.
 */
(() => {
  "use strict";

  const OF8_CLIENT_CONFIG = Object.freeze({
    apiBase: "https://sentaro-0f8-accounts.takesen2278.workers.dev",
    popupUrl: "https://YOUR-ACCOUNT-SERVICE-PAGE.example/login.html",
    cookieToken: "of8_access_token",
    cookieSignature: "of8_access_signature",
    storageKey: "__of8_data_access_key_v1__",
    storageDataKey: "__of8_data_cache_v1__",
    popupWidth: 460,
    popupHeight: 720,
  });

  const te = new TextEncoder();
  const td = new TextDecoder();

  function clientLog(event, details = {}) {
    console.log("[0f8-client]", event, details);
  }

  function clientError(event, error, details = {}) {
    console.error("[0f8-client]", event, error instanceof Error ? error.message : String(error), details);
  }

  function base64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlBytes(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("Invalid base64url.");
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function sha256(value) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", typeof value === "string" ? te.encode(value) : value));
  }

  async function pbkdf2(value, salt, iterations) {
    const key = await crypto.subtle.importKey("raw", te.encode(value), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
    return new Uint8Array(bits);
  }

  const BASE122_ALPHABET = Object.freeze(
    Array.from({ length: 122 }, (_, index) => String.fromCodePoint(0x0100 + index))
  );
  const BASE122_REVERSE = new Map(BASE122_ALPHABET.map((char, index) => [char, index]));
  const BASE122_RADIX = 122n;
  const BASE122_LOG2 = Math.log2(122);
  const BASE122_FULL_BLOCK_BYTES = 32;
  const BASE122_FULL_BLOCK_DIGITS = Math.ceil((BASE122_FULL_BLOCK_BYTES * 8) / BASE122_LOG2);

  function base122DigitsForBytes(byteLength) {
    if (!Number.isInteger(byteLength) || byteLength < 1 || byteLength > BASE122_FULL_BLOCK_BYTES) throw new Error("Invalid Base122 block size.");
    return Math.ceil((byteLength * 8) / BASE122_LOG2);
  }

  function base122EncodeBlock(bytes, width) {
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    const digits = new Array(width);
    for (let i = width - 1; i >= 0; i--) {
      digits[i] = BASE122_ALPHABET[Number(value % BASE122_RADIX)];
      value /= BASE122_RADIX;
    }
    if (value !== 0n) throw new Error("Base122 block overflow.");
    return digits.join("");
  }

  function base122DecodeBlock(text, expectedBytes) {
    if (!Number.isInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > BASE122_FULL_BLOCK_BYTES) throw new Error("Invalid Base122 output size.");
    let value = 0n;
    for (const char of text) {
      const digit = BASE122_REVERSE.get(char);
      if (digit === undefined) throw new Error("Invalid Base122 character.");
      value = value * BASE122_RADIX + BigInt(digit);
    }
    const output = new Uint8Array(expectedBytes);
    for (let i = output.length - 1; i >= 0; i--) {
      output[i] = Number(value & 0xffn);
      value >>= 8n;
    }
    if (value !== 0n) throw new Error("Base122 block overflow on decode.");
    return output;
  }

  function base122Encode(inputBytes) {
    if (!(inputBytes instanceof Uint8Array)) throw new TypeError("base122Encode expects Uint8Array.");
    const raw = new Uint8Array(4 + inputBytes.length);
    new DataView(raw.buffer).setUint32(0, inputBytes.length, false);
    raw.set(inputBytes, 4);

    const remainder = raw.length % BASE122_FULL_BLOCK_BYTES;
    let output = BASE122_ALPHABET[remainder];
    let offset = 0;
    const fullEnd = remainder === 0 ? raw.length : raw.length - remainder;
    while (offset < fullEnd) {
      output += base122EncodeBlock(raw.subarray(offset, offset + BASE122_FULL_BLOCK_BYTES), BASE122_FULL_BLOCK_DIGITS);
      offset += BASE122_FULL_BLOCK_BYTES;
    }
    if (remainder > 0) output += base122EncodeBlock(raw.subarray(fullEnd), base122DigitsForBytes(remainder));
    return output;
  }

  function base122Decode(text) {
    if (typeof text !== "string" || text.length < 3) throw new Error("Invalid Base122 data.");
    const remainder = BASE122_REVERSE.get(text[0]);
    if (remainder === undefined || remainder > 31) throw new Error("Invalid Base122 remainder header.");
    const payload = text.slice(1);
    const tailChars = remainder > 0 ? base122DigitsForBytes(remainder) : 0;
    if (remainder === 0) {
      if (payload.length % BASE122_FULL_BLOCK_DIGITS !== 0) throw new Error("Invalid Base122 full-block length.");
    } else if (payload.length < tailChars || (payload.length - tailChars) % BASE122_FULL_BLOCK_DIGITS !== 0) {
      throw new Error("Invalid Base122 block layout.");
    }

    const fullChars = remainder === 0 ? payload.length : payload.length - tailChars;
    const byteLength = (fullChars / BASE122_FULL_BLOCK_DIGITS) * BASE122_FULL_BLOCK_BYTES + remainder;
    const raw = new Uint8Array(byteLength);
    let sourceOffset = 0;
    let targetOffset = 0;
    while (sourceOffset < fullChars) {
      const block = base122DecodeBlock(payload.slice(sourceOffset, sourceOffset + BASE122_FULL_BLOCK_DIGITS), BASE122_FULL_BLOCK_BYTES);
      if (block.length !== BASE122_FULL_BLOCK_BYTES) throw new Error("Invalid Base122 full block.");
      raw.set(block, targetOffset);
      sourceOffset += BASE122_FULL_BLOCK_DIGITS;
      targetOffset += BASE122_FULL_BLOCK_BYTES;
    }
    if (remainder > 0) {
      const block = base122DecodeBlock(payload.slice(sourceOffset, sourceOffset + tailChars), remainder);
      if (block.length !== remainder) throw new Error("Invalid Base122 tail block.");
      raw.set(block, targetOffset);
    }

    if (raw.length < 4) throw new Error("Base122 data is incomplete.");
    const expectedLength = new DataView(raw.buffer).getUint32(0, false);
    if (expectedLength !== raw.length - 4) throw new Error("Base122 length check failed.");
    return raw.subarray(4);
  }

  function getOrigin() {
    const origin = location.origin.toLowerCase();
    if (!/^https:\/\//.test(origin) && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      throw new Error("0f8 requires an HTTPS origin.");
    }
    return origin;
  }

  function getCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const item = document.cookie.split("; ").find((entry) => entry.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : "";
  }

  function setCookie(name, value, maxAgeSeconds = 259200) {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; Secure; SameSite=Lax`;
    clientLog("cookie_saved", { name });
  }

  function deleteCookie(name) {
    document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
    clientLog("cookie_deleted", { name });
  }

  function decodeTokenId(token) {
    const parts = String(token).split(".");
    if (parts.length !== 6 || parts[0] !== "v1") throw new Error("Invalid access token.");
    return td.decode(base64UrlBytes(parts[3]));
  }

  async function dataAccessKeyFor(id, origin) {
    const salt = await sha256(`0f8-data-access-v1\0${origin}`);
    const key = await pbkdf2(`${origin}\0${id}`, salt, 600000);
    return base64Url(key);
  }

  async function ensureDataAccessKey(token) {
    const origin = getOrigin();
    const id = decodeTokenId(token);
    const expected = await dataAccessKeyFor(id, origin);
    const existing = localStorage.getItem(OF8_CLIENT_CONFIG.storageKey);
    if (existing !== expected) {
      localStorage.setItem(OF8_CLIENT_CONFIG.storageKey, expected);
      clientLog("data_access_key_refreshed", { id, origin });
    }
    return expected;
  }

  async function deriveAesKey(dataAccessKey) {
    const raw = base64UrlBytes(dataAccessKey);
    if (raw.length !== 32) throw new Error("Invalid data access key length.");
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  async function encryptDomainObject(object, dataAccessKey) {
    const plaintext = te.encode(JSON.stringify(object));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesKey(dataAccessKey);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, plaintext));
    const packed = new Uint8Array(1 + 12 + ciphertext.length);
    packed[0] = 1;
    packed.set(iv, 1);
    packed.set(ciphertext, 13);
    const encoded = base122Encode(packed);
    if (encoded.length > 200000) throw new Error("Encrypted data exceeds the 200 KB service limit.");
    return encoded;
  }

  async function decryptDomainObject(encoded, dataAccessKey) {
    const packed = base122Decode(encoded);
    if (packed.length < 30 || packed[0] !== 1) throw new Error("Unsupported encrypted data version.");
    const iv = packed.subarray(1, 13);
    const ciphertext = packed.subarray(13);
    const key = await deriveAesKey(dataAccessKey);
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, ciphertext));
    const value = JSON.parse(td.decode(plaintext));
    if (!value || typeof value !== "object" || value.v !== 1 || !value.items || typeof value.items !== "object") {
      throw new Error("Decrypted data structure is invalid.");
    }
    return value;
  }

  function openPopup() {
    const stateBytes = crypto.getRandomValues(new Uint8Array(24));
    const state = base64Url(stateBytes);
    const origin = getOrigin();
    sessionStorage.setItem("__of8_login_state__", state);

    const url = new URL(OF8_CLIENT_CONFIG.popupUrl);
    url.searchParams.set("origin", origin);
    url.searchParams.set("state", state);

    const left = Math.max(0, Math.round((screen.width - OF8_CLIENT_CONFIG.popupWidth) / 2));
    const top = Math.max(0, Math.round((screen.height - OF8_CLIENT_CONFIG.popupHeight) / 2));
    const popup = window.open(
      url.toString(),
      "of8-account-login",
      `popup=yes,width=${OF8_CLIENT_CONFIG.popupWidth},height=${OF8_CLIENT_CONFIG.popupHeight},left=${left},top=${top}`
    );
    if (!popup) throw new Error("Login popup was blocked by the browser.");
    clientLog("login_popup_opened", { origin });
    return popup;
  }

  function installAuthListener(popup) {
    return new Promise((resolve, reject) => {
      const expectedOrigin = new URL(OF8_CLIENT_CONFIG.popupUrl).origin;
      const state = sessionStorage.getItem("__of8_login_state__");
      if (!state) {
        reject(new Error("Login state is missing."));
        return;
      }

      const timeout = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("Login window timed out."));
      }, 5 * 60 * 1000);

      function cleanup() {
        clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        sessionStorage.removeItem("__of8_login_state__");
      }

      function onMessage(event) {
        if (event.origin !== expectedOrigin || event.source !== popup) return;
        const message = event.data;
        if (!message || message.type !== "OF8_AUTH_RESULT" || message.version !== 1) return;
        if (message.state !== state) return;
        if (typeof message.accessToken !== "string" || typeof message.signature !== "string") {
          cleanup();
          reject(new Error("Authentication response is malformed."));
          return;
        }
        cleanup();
        setCookie(OF8_CLIENT_CONFIG.cookieToken, message.accessToken);
        setCookie(OF8_CLIENT_CONFIG.cookieSignature, message.signature);
        ensureDataAccessKey(message.accessToken)
          .then(() => {
            clientLog("login_completed", { id: decodeTokenId(message.accessToken) });
            resolve({ accessToken: message.accessToken, signature: message.signature });
          })
          .catch(reject);
      }

      window.addEventListener("message", onMessage);
    });
  }

  async function request(path, options = {}) {
    const method = options.method || "GET";
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (options.body !== undefined) headers.set("Content-Type", "application/json");

    const token = getCookie(OF8_CLIENT_CONFIG.cookieToken);
    const signature = getCookie(OF8_CLIENT_CONFIG.cookieSignature);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (signature) headers.set("X-OF8-Signature", signature);
    if (token) headers.set("X-OF8-Data-Access-Key", await ensureDataAccessKey(token));

    const response = await fetch(`${OF8_CLIENT_CONFIG.apiBase}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      credentials: "omit",
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (error) {
      clientError("response_parse_failed", error, { path, status: response.status });
      throw new Error(`Account service returned invalid JSON (${response.status}).`);
    }

    if (!response.ok || data.ok === false) {
      const message = data?.error?.message || `Account service error (${response.status}).`;
      clientError("request_failed", new Error(message), { path, status: response.status, code: data?.error?.code });
      throw new Error(message);
    }

    if (data.token && data.signature) {
      setCookie(OF8_CLIENT_CONFIG.cookieToken, data.token);
      setCookie(OF8_CLIENT_CONFIG.cookieSignature, data.signature);
      await ensureDataAccessKey(data.token);
      clientLog("token_rotated", { path });
    }

    return data;
  }

  function domainDataCacheKey() {
    return `${OF8_CLIENT_CONFIG.storageDataKey}:${getOrigin()}`;
  }

  function readCache() {
    const raw = localStorage.getItem(domainDataCacheKey());
    if (!raw) return { v: 1, items: {} };
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.v === 1 && parsed.items && typeof parsed.items === "object") return parsed;
    } catch (error) {
      clientError("cache_parse_failed", error);
    }
    return { v: 1, items: {} };
  }

  function writeCache(data) {
    localStorage.setItem(domainDataCacheKey(), JSON.stringify(data));
  }

  async function syncFromServer() {
    const result = await request("/v1/data");
    if (!result.encrypted) {
      const empty = { v: 1, items: {} };
      writeCache(empty);
      clientLog("server_data_empty");
      return empty;
    }
    const token = getCookie(OF8_CLIENT_CONFIG.cookieToken);
    if (!token) throw new Error("Access token disappeared during sync.");
    const key = await ensureDataAccessKey(token);
    const data = await decryptDomainObject(result.encrypted, key);
    writeCache(data);
    clientLog("server_data_synced", { keys: Object.keys(data.items).length });
    return data;
  }

  async function saveWholeObject(next) {
    const token = getCookie(OF8_CLIENT_CONFIG.cookieToken);
    if (!token) throw new Error("Login is required.");
    const key = await ensureDataAccessKey(token);
    const encrypted = await encryptDomainObject(next, key);
    await request("/v1/data", { method: "PUT", body: { encrypted } });
    const confirmed = await syncFromServer();
    clientLog("data_saved_and_confirmed", { keys: Object.keys(confirmed.items).length });
    return confirmed;
  }

  async function login() {
    const popup = openPopup();
    return installAuthListener(popup);
  }

  async function logout() {
    const token = getCookie(OF8_CLIENT_CONFIG.cookieToken);
    if (token) {
      try {
        await request("/v1/auth/logout", { method: "POST", body: {} });
      } catch (error) {
        clientError("logout_request_failed", error);
      }
    }
    deleteCookie(OF8_CLIENT_CONFIG.cookieToken);
    deleteCookie(OF8_CLIENT_CONFIG.cookieSignature);
    localStorage.removeItem(OF8_CLIENT_CONFIG.storageKey);
    localStorage.removeItem(domainDataCacheKey());
    clientLog("logout_completed");
  }

  async function getItem(key) {
    const data = await syncFromServer();
    const normalizedKey = String(key);
    return Object.prototype.hasOwnProperty.call(data.items, normalizedKey) ? data.items[normalizedKey] : null;
  }

  async function setItem(key, value) {
    const data = await syncFromServer();
    data.items[String(key)] = String(value);
    await saveWholeObject(data);
  }

  async function removeItem(key) {
    const data = await syncFromServer();
    const normalizedKey = String(key);
    const existed = Object.prototype.hasOwnProperty.call(data.items, normalizedKey);
    delete data.items[normalizedKey];
    await saveWholeObject(data);
    clientLog("item_removed", { key: normalizedKey, existed });
  }

  async function clear() {
    await saveWholeObject({ v: 1, items: {} });
    clientLog("domain_data_cleared");
  }

  async function keys() {
    const data = await syncFromServer();
    return Object.keys(data.items);
  }

  async function length() {
    return (await keys()).length;
  }

  async function key(index) {
    const list = await keys();
    return list[index] ?? null;
  }

  async function accountInfo() {
    return request("/v1/account/info");
  }

  async function isLoggedIn() {
    const token = getCookie(OF8_CLIENT_CONFIG.cookieToken);
    const signature = getCookie(OF8_CLIENT_CONFIG.cookieSignature);
    if (!token || !signature) return false;
    try {
      const result = await request("/v1/auth/introspect", {
        method: "POST",
        body: { token, signature },
        headers: { "X-OF8-Data-Access-Key": await ensureDataAccessKey(token) },
      });
      return result.valid === true;
    } catch (error) {
      clientError("session_check_failed", error);
      return false;
    }
  }

  window.OF8Account = Object.freeze({
    login,
    logout,
    getItem,
    setItem,
    removeItem,
    clear,
    keys,
    length,
    key,
    accountInfo,
    isLoggedIn,
    sync: syncFromServer,
    constants: OF8_CLIENT_CONFIG,
  });

  clientLog("client_service_ready", { version: 1, origin: location.origin });
})();
