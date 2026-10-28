// Thin fetch wrapper around the Flask JSON API (nse/blueprints/api.py, the
// "MODULE 3 — Technician App" section). Mirrors the customer app's
// src/api/client.js pattern exactly — same base URL, same token scheme,
// same server — just a different set of endpoints and a staff login instead
// of customer OTP.

import * as SecureStore from "expo-secure-store";

// ---------------------------------------------------------------------------
// Where the backend lives:
//   - Web Browser preview: http://127.0.0.1:5055/api/v1
//   - Physical Phone / Expo Go: http://192.168.1.10:5055/api/v1
// ---------------------------------------------------------------------------
export const API_BASE = "https://northern-star-amc.vercel.app/api/v1";
export const API_ORIGIN = API_BASE.replace(/\/api\/v1$/, "");

const TOKEN_KEY = "nse_tech_token";

export async function saveToken(token) {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (e) {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(TOKEN_KEY, token);
    }
  }
}

export async function getToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (e) {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(TOKEN_KEY);
    }
    return null;
  }
}

export async function clearToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (e) {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  }
}

async function request(path, { method = "GET", body, auth = true, form } = {}) {
  const headers = {};
  if (!form) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: form ? form : (body ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (e) {
    const detail = e.name === "AbortError" ? "Server request timed out" : (e.message || "Network error");
    throw new Error(`Cannot reach the server (${detail}). Check your connection.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.payload = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------------------
// The API surface. One method per backend endpoint.
// ---------------------------------------------------------------------------
export const api = {
  // ----- Auth --------------------------------------------------------------
  staffLogin: (email, password) =>
    request("/auth/staff-login", { method: "POST", auth: false, body: { email, password } }),

  // ----- Profile / "Me" -----------------------------------------------------
  me: () => request("/tech/me"),

  // ----- Today ---------------------------------------------------------------
  today: () => request("/tech/today"),

  // ----- Visits --------------------------------------------------------------
  visits: (status = "all") => request(`/tech/visits?status=${status}`),
  visit: (id) => request(`/tech/visits/${id}`),
  confirmVisit: (id, action, note) =>
    request(`/tech/visits/${id}/confirm`, { method: "POST", body: { action, note } }),
  checkin: (id, lat, lng, note) =>
    request(`/tech/visits/${id}/checkin`, { method: "POST", body: { lat, lng, note } }),
  checkout: (id) => request(`/tech/visits/${id}/checkout`, { method: "POST" }),
  saveChecklist: (id, fields) =>
    request(`/tech/visits/${id}/checklist`, { method: "POST", body: fields }),
  completeVisit: (id) => request(`/tech/visits/${id}/complete`, { method: "POST" }),
  raiseQuotation: (id, items, notes) =>
    request(`/tech/visits/${id}/quotation`, { method: "POST", body: { items, notes } }),
  uploadPhoto: async (id, fileUri, caption) => {
    const token = await getToken();
    const form = new FormData();
    form.append("photo", { uri: fileUri, name: "photo.jpg", type: "image/jpeg" });
    if (caption) form.append("caption", caption);
    const res = await fetch(`${API_BASE}/tech/visits/${id}/photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  },

  // ----- Scan / equipment ------------------------------------------------------
  lookupEquipment: (code) => request(`/tech/equipment/lookup?code=${encodeURIComponent(code)}`),

  // ----- Refill pickups --------------------------------------------------------
  refillPickups: () => request("/tech/refill-pickups"),

  // ----- Notifications -----------------------------------------------------
  notifications: () => request("/tech/notifications"),
  markNotificationsRead: () => request("/tech/notifications/read", { method: "POST" }),

  // ----- Inventory (material quotation search) ------------------------------
  searchInventory: (q) => request(`/tech/inventory/search?q=${encodeURIComponent(q || "")}`),

  // ----- Inquiries & Site Visit Inspections ---------------------------------
  inquiries: () => request("/tech/inquiries"),
  inquiry: (id) => request(`/tech/inquiries/${id}`),
  updateInquiryStatus: (id, status, note) =>
    request(`/tech/inquiries/${id}/visit-status`, { method: "POST", body: { status, note } }),
  submitInquiryChecklist: (id, items, technician_notes) =>
    request(`/tech/inquiries/${id}/checklist`, { method: "POST", body: { items, technician_notes } }),
};
