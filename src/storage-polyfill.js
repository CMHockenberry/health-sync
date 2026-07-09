// Talks to your self-hosted health-ledger-api instead of localStorage, so
// data is available across every device that opens this app. Falls back to
// localStorage automatically if the server can't be reached (e.g. you're
// offline), so the app still works — it just won't sync until you're back
// online and reload.

const CONFIG_KEY = "health-ledger:server-config";

function getConfig() {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (raw) return JSON.parse(raw);

  const url = window.prompt(
    "One-time setup: enter your health-ledger-api server URL\n(e.g. https://health.yourdomain.com)"
  );
  const token = window.prompt("Enter your API token (the AUTH_TOKEN you set on the server)");
  const config = { url: (url || "").replace(/\/$/, ""), token: token || "" };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  return config;
}

function localFallbackGet(key) {
  const raw = localStorage.getItem("health-ledger:local:" + key);
  return raw === null ? null : raw;
}
function localFallbackSet(key, value) {
  localStorage.setItem("health-ledger:local:" + key, value);
}

async function apiFetch(path, options = {}) {
  const { url, token } = getConfig();
  const res = await fetch(url + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  return res;
}

window.storage = {
  async get(key) {
    try {
      const res = await apiFetch(`/storage/${encodeURIComponent(key)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`server error ${res.status}`);
      const data = await res.json();
      localFallbackSet(key, data.value); // keep a local mirror for offline use
      return { key, value: data.value, shared: false };
    } catch (e) {
      console.warn("health-ledger: server unreachable, using local copy", e);
      const value = localFallbackGet(key);
      return value === null ? null : { key, value, shared: false };
    }
  },

  async set(key, value) {
    localFallbackSet(key, value); // write local immediately so nothing is lost
    try {
      const res = await apiFetch(`/storage/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error(`server error ${res.status}`);
      return { key, value, shared: false };
    } catch (e) {
      console.warn("health-ledger: server unreachable, saved locally only — will not sync until back online", e);
      return { key, value, shared: false };
    }
  },

  async delete(key) {
    localStorage.removeItem("health-ledger:local:" + key);
    try {
      const res = await apiFetch(`/storage/${encodeURIComponent(key)}`, { method: "DELETE" });
      const data = await res.json();
      return { key, deleted: !!data.deleted, shared: false };
    } catch (e) {
      console.warn("health-ledger: server unreachable, deleted locally only", e);
      return { key, deleted: true, shared: false };
    }
  },

  async list(prefix = "") {
    try {
      const res = await apiFetch(`/storage?prefix=${encodeURIComponent(prefix)}`);
      if (!res.ok) throw new Error(`server error ${res.status}`);
      const data = await res.json();
      return { keys: data.keys, prefix, shared: false };
    } catch (e) {
      console.warn("health-ledger: server unreachable, listing local keys only", e);
      const keys = Object.keys(localStorage)
        .filter((k) => k.startsWith("health-ledger:local:" + prefix))
        .map((k) => k.slice("health-ledger:local:".length));
      return { keys, prefix, shared: false };
    }
  },
};
