let onUnauthorized = null;

async function handleResponse(r) {
  if (r.status === 401) {
    if (onUnauthorized) onUnauthorized();
    throw new Error("Not authenticated");
  }
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    let msg;
    try { msg = JSON.parse(text).error; } catch {}
    throw new Error(msg || text || `Request failed (${r.status})`);
  }
  return r.json();
}

const api = {
  get: async (url) => handleResponse(await fetch(url)),
  post: async (url, body) => {
    if (body instanceof FormData) {
      return handleResponse(await fetch(url, { method: "POST", body }));
    }
    return handleResponse(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  },
  put: async (url, body) => {
    if (body instanceof FormData) {
      return handleResponse(await fetch(url, { method: "PUT", body }));
    }
    return handleResponse(await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  },
  del: async (url) => handleResponse(await fetch(url, { method: "DELETE" })),
  patch: async (url, body) => {
    return handleResponse(await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  },

  // Auth helpers
  login: (username, password) => api.post("/api/login", { username, password }),
  register: (username, password) => api.post("/api/register", { username, password }),
  logout: () => api.post("/api/logout"),
  getMe: () => api.get("/api/me"),

  // Set callback for 401 responses (redirect to login)
  setOnUnauthorized: (cb) => { onUnauthorized = cb; },
};

export default api;
