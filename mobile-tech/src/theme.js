// Northern Star brand tokens — mirrors the customer app's theme.js and the web
// design system (CLAUDE.md), so the Technician App looks like the same product.
export const theme = {
  navy: "#072076",
  navyDark: "#141834",
  amber: "#f59e0b",
  amberDark: "#d97706",
  amberLight: "#fef3c7",
  canvas: "#f6f5f2",
  card: "#ffffff",
  hair: "#eceae4",
  ink: "#1b1c22",
  inkMuted: "#4a4b52",
  inkSubtle: "#8a8a90",
  success: "#17864a",
  successLight: "#e7f4ec",
  danger: "#d23f3f",
  dangerLight: "#fdecea",
  warning: "#b45309",
  warningLight: "#fbf0dc",
  blue: "#2f6fed",
  blueLight: "#eef1fb",
};

// Status pill colours — same map the web `status_badge` macro uses.
export const statusColors = {
  active: { bg: "#e7f4ec", fg: "#17864a" },
  completed: { bg: "#e7f4ec", fg: "#17864a" },
  paid: { bg: "#e7f4ec", fg: "#17864a" },
  approved: { bg: "#e7f4ec", fg: "#17864a" },
  accepted: { bg: "#e7f4ec", fg: "#17864a" },
  resolved: { bg: "#e7f4ec", fg: "#17864a" },
  done: { bg: "#e7f4ec", fg: "#17864a" },
  ok: { bg: "#e7f4ec", fg: "#17864a" },
  pending: { bg: "#fbf0dc", fg: "#b45309" },
  new: { bg: "#fbf0dc", fg: "#b45309" },
  next: { bg: "#fbf0dc", fg: "#b45309" },
  issue: { bg: "#fbf0dc", fg: "#b45309" },
  overdue: { bg: "#fdecea", fg: "#d23f3f" },
  open: { bg: "#fdecea", fg: "#d23f3f" },
  sent: { bg: "#eef1fb", fg: "#2f6fed" },
  viewed: { bg: "#eef1fb", fg: "#2f6fed" },
  scheduled: { bg: "#eef1fb", fg: "#2f6fed" },
  acknowledged: { bg: "#fbf0dc", fg: "#b45309" },
  in_progress: { bg: "#ede9fe", fg: "#5b21b6" },
  dispatched: { bg: "#ede9fe", fg: "#5b21b6" },
  negotiation_requested: { bg: "#fbf0dc", fg: "#b45309" },
  rejected: { bg: "#fdecea", fg: "#d23f3f" },
  cancelled: { bg: "#fdecea", fg: "#d23f3f" },
  expired: { bg: "#f1f0ee", fg: "#6b6b72" },
  closed: { bg: "#f1f0ee", fg: "#6b6b72" },
  draft: { bg: "#f1f0ee", fg: "#6b6b72" },
  na: { bg: "#f1f0ee", fg: "#6b6b72" },
};

export function pillFor(status) {
  return statusColors[status] || { bg: "#f1f0ee", fg: "#6b6b72" };
}

// ₹ formatting with Indian thousands separators (mirrors the web `rupees` filter).
export function rupees(amount) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = Number(amount);
  if (Number.isNaN(n)) return "—";
  const [intPart, decPart] = n.toFixed(2).split(".");
  let s = intPart;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  let last3 = s.slice(-3);
  let rest = s.slice(0, -3);
  if (rest) last3 = "," + last3;
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const formatted = rest + last3;
  const dec = decPart === "00" ? "" : "." + decPart;
  return `${neg ? "-" : ""}₹${formatted}${dec}`;
}

// Friendly date (e.g. "21 Jul 2026"). Accepts ISO string or null.
export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  }) + ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// "Wednesday, 1 July" — used on the Today screen header.
export function fmtDayHeader(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}
