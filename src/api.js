const api = {
  get: async (url) => { const r = await fetch(url); return r.json(); },
  post: async (url, body) => {
    if (body instanceof FormData) {
      const r = await fetch(url, { method: "POST", body });
      return r.json();
    }
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  },
  put: async (url, body) => {
    if (body instanceof FormData) {
      const r = await fetch(url, { method: "PUT", body });
      return r.json();
    }
    const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  },
  del: async (url) => { const r = await fetch(url, { method: "DELETE" }); return r.json(); },
  patch: async (url, body) => {
    const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  },
};

export default api;
