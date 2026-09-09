// Thin fetch wrapper around the Flask JSON API (nse/blueprints/api.py).
// All calls go through here so the base URL + auth header live in one place.

import * as SecureStore from "expo-secure-store";

// ---------------------------------------------------------------------------
// Where the backend lives. Change this to your deployment.
//   - Android emulator reaches your Mac's localhost at 10.0.2.2
//   - iOS simulator can use 127.0.0.1
//   - A physical phone must use your Mac's LAN IP (e.g. http://192.168.1.5:5055)
//   - Production: the Vercel URL, e.g. https://app-amc-three.vercel.app
// ---------------------------------------------------------------------------
export const API_BASE = "https://northern-star-amc.vercel.app/api/v1";
// For local dev against the Flask server, comment the line above and use e.g.:
// export const API_BASE = "http://10.0.2.2:5055/api/v1";

const TOKEN_KEY = "nse_token";

export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error("Cannot reach the server. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.payload = data; // e.g. waiver_required carries waiver_text
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
  requestOtp: (phone) =>
    request("/auth/otp/request", { method: "POST", body: { phone } }),
  verifyOtp: (phone, code, name) =>
    request("/auth/otp/verify", { method: "POST", body: { phone, code, name } }),

  // ----- Profile -----------------------------------------------------------
  me: () => request("/me", { auth: true }),
  updateMe: (fields) => request("/me", { method: "PUT", auth: true, body: fields }),

  // ----- Home / contracts --------------------------------------------------
  dashboard: () => request("/dashboard", { auth: true }),
  contracts: () => request("/contracts", { auth: true }),
  contract: (id) => request(`/contracts/${id}`, { auth: true }),
  requestRenewal: (id) =>
    request(`/contracts/${id}/renew`, { method: "POST", auth: true }),
  submitReferral: (id, fields) =>
    request(`/contracts/${id}/refer`, { method: "POST", auth: true, body: fields }),
  agreement: (id) => request(`/contracts/${id}/agreement`, { auth: true }),
  acceptAgreement: (id) =>
    request(`/contracts/${id}/agreement/accept`, { method: "POST", auth: true }),

  // ----- Visits ------------------------------------------------------------
  visit: (id) => request(`/visits/${id}`, { auth: true }),
  rateVisit: (id, ratings) =>
    request(`/visits/${id}/rate`, { method: "POST", auth: true, body: ratings }),

  // ----- Service quotations ------------------------------------------------
  serviceQuotations: () => request("/service-quotations", { auth: true }),
  serviceQuotation: (id) => request(`/service-quotations/${id}`, { auth: true }),
  acceptQuote: (id) =>
    request(`/service-quotations/${id}/accept`, { method: "POST", auth: true }),
  negotiateQuote: (id, note) =>
    request(`/service-quotations/${id}/negotiate`, { method: "POST", auth: true, body: { note } }),

  // ----- Material (visit-linked) quotations --------------------------------
  materialQuote: (id) => request(`/quotations/${id}`, { auth: true }),
  decideMaterialQuote: (id, decision, waiverAccepted) =>
    request(`/quotations/${id}/decide`, {
      method: "POST", auth: true,
      body: { decision, waiver_accepted: waiverAccepted ? 1 : 0 },
    }),

  // ----- Requests + refills ------------------------------------------------
  requests: () => request("/requests", { auth: true }),

  // ----- Support tickets / complaints --------------------------------------
  tickets: () => request("/tickets", { auth: true }),
  ticket: (id) => request(`/tickets/${id}`, { auth: true }),
  raiseTicket: (fields) =>
    request("/tickets", { method: "POST", auth: true, body: fields }),
  retriggerTicket: (id) =>
    request(`/tickets/${id}/retrigger`, { method: "POST", auth: true }),

  // ----- Journey + notifications -------------------------------------------
  journey: () => request("/journey", { auth: true }),
  notifications: () => request("/notifications", { auth: true }),
  markNotificationsRead: () =>
    request("/notifications/read", { method: "POST", auth: true }),

  // ----- Plans (public) ----------------------------------------------------
  plans: () => request("/plans"),
};
