let onUnauthorized = null;

async function handleResponse(r) {
  if (r.status === 401) {
    if (onUnauthorized) onUnauthorized();
    throw new Error("Not authenticated");
  }
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    let parsed;
    try { parsed = JSON.parse(text); } catch {}
    if (parsed) {
      const err = new Error(parsed.error || `Request failed (${r.status})`);
      if (parsed.needsVerification) err.needsVerification = true;
      if (parsed.email) err.email = parsed.email;
      throw err;
    }
    throw new Error(text || `Request failed (${r.status})`);
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
  register: (username, password, email) => api.post("/api/register", { username, password, email }),
  logout: () => api.post("/api/logout"),
  getMe: () => api.get("/api/me"),
  updateProfile: (fields) => api.put("/api/profile", fields),

  // Email verification & password reset
  verifyEmail: (token) => api.get("/api/verify-email?token=" + encodeURIComponent(token)),
  resendVerification: (email) => api.post("/api/resend-verification", { email }),
  forgotPassword: (email) => api.post("/api/forgot-password", { email }),
  resetPassword: (token, password) => api.post("/api/reset-password", { token, password }),

  // Admin helpers
  adminGetUsers: () => api.get("/api/admin/users"),
  adminUpdateUser: (id, fields) => api.put(`/api/admin/users/${id}`, fields),
  adminDeleteUser: (id) => api.del(`/api/admin/users/${id}`),
  adminGetUserSongs: (id) => api.get(`/api/admin/users/${id}/songs`),

  // Set callback for 401 responses (redirect to login)
  setOnUnauthorized: (cb) => { onUnauthorized = cb; },
};

export default api;
