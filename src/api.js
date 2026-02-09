async function handleResponse(r) {
  if (!r.ok) {
    const text = await r.text().catch(() => "");
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
};

export default api;
