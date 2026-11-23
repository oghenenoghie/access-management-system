// Client for the FastAPI backend's /api/auth and /api/admin endpoints.
//
// Set NEXT_PUBLIC_API_URL (for example in admin-dashboard/.env.local) when the
// backend isn't on http://localhost:8000.

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

const TOKEN_KEY = "estate_admin_token";
const NAME_KEY = "estate_admin_name";

// ---------- Types (mirror backend/app/schemas.py) ----------

export type UserRole = "resident" | "security" | "admin";
export type UserStatus = "active" | "pending" | "suspended" | "deactivated";

export interface Unit {
  id: number;
  unit_number: string;
  block_name: string;
  street_address: string | null;
  unit_type: string;
  is_occupied: boolean;
  access_suspended: boolean;
}

export interface User {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  estate_id_number: string | null;
  unit_id: number | null;
  unit: Unit | null;
  created_at: string;
}

export interface AccessCode {
  id: number;
  code: string;
  qr_payload: string;
  resident_id: number;
  resident_name: string | null;
  unit_number: string | null;
  visitor_name: string;
  visitor_phone: string;
  vehicle_plate: string | null;
  purpose: string;
  code_type: string;
  arrival_date: string;
  valid_from: string;
  valid_until: string;
  max_uses: number;
  use_count: number;
  status: string;
  created_at: string;
  used_at: string | null;
}

export type GateAction = "entry_granted" | "exit_recorded" | "entry_rejected";

export interface GateLog {
  id: number;
  access_code_id: number | null;
  code_entered: string;
  visitor_name: string | null;
  visitor_phone: string | null;
  resident_name: string | null;
  unit_number: string | null;
  security_officer_name: string | null;
  action: GateAction;
  rejection_reason: string | null;
  gate_name: string;
  vehicle_plate: string | null;
  notes: string | null;
  entry_time: string | null;
  exit_time: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: number | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
}

export interface Overview {
  metrics: {
    total_residents: number;
    active_residents: number;
    pending_residents: number;
    security_officers: number;
    total_units: number;
    active_codes: number;
    visitors_currently_inside: number;
  };
  reports_summary: {
    daily_entries: number;
    daily_rejections: number;
    weekly_entries: number;
    monthly_entries: number;
  };
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type ReportPeriod = "all" | "daily" | "weekly" | "monthly";

// ---------- Session (per browser tab) ----------

export function getSession(): { token: string; name: string } | null {
  try {
    const token = window.sessionStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    return { token, name: window.sessionStorage.getItem(NAME_KEY) || "Administrator" };
  } catch {
    return null;
  }
}

export function saveSession(token: string, name: string) {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
    window.sessionStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage unavailable (private mode etc.): the session lasts until reload.
  }
}

export function clearSession() {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(NAME_KEY);
  } catch {
    // Nothing stored.
  }
}

// ---------- Requests ----------

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// FastAPI sends validation failures (HTTP 422) as a list of
// { loc: ["body", "field"], msg: "..." }; turn that into readable text.
function describeError(detail: unknown, status: number): string {
  if (Array.isArray(detail)) {
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "";
        return field ? `${String(field).replace(/_/g, " ")}: ${d.msg}` : String(d.msg);
      })
      .join("\n");
  }
  return detail ? String(detail) : `Request failed (HTTP ${status}).`;
}

let inMemoryToken: string | null = null;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getSession()?.token ?? inMemoryToken;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new ApiError(`Could not reach the server at ${API_BASE_URL}.`, 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(describeError((data as { detail?: unknown }).detail, response.status), response.status);
  }
  return data as T;
}

function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const api = {
  async login(identifier: string, password: string): Promise<LoginResponse> {
    const res = await request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    inMemoryToken = res.access_token;
    return res;
  },
  signOut() {
    inMemoryToken = null;
    clearSession();
  },

  overview: () => request<Overview>("/api/admin/overview"),

  users: (role: UserRole) => request<User[]>(`/api/admin/users${query({ role })}`),
  createUser: (payload: {
    full_name: string;
    email: string;
    phone: string;
    password: string;
    role: UserRole;
    status?: UserStatus;
    estate_id_number?: string | null;
    unit_id?: number | null;
  }) => request<User>("/api/admin/users", { method: "POST", body: JSON.stringify(payload) }),
  resetPassword: (id: number) =>
    request<{ temporary_password: string; message: string }>(`/api/admin/users/${id}/reset-password`, {
      method: "POST",
    }),
  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>("/api/auth/me/password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  setUserStatus: (id: number, status: UserStatus, reason?: string) =>
    request<User>(`/api/admin/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason: reason || null }),
    }),

  units: () => request<Unit[]>("/api/admin/units"),
  createUnit: (payload: {
    unit_number: string;
    block_name: string;
    street_address?: string | null;
    unit_type: string;
  }) => request<Unit>("/api/admin/units", { method: "POST", body: JSON.stringify(payload) }),
  toggleUnitSuspension: (id: number) =>
    request<Unit>(`/api/admin/units/${id}/toggle-suspension`, { method: "PATCH" }),

  accessCodes: () => request<AccessCode[]>("/api/admin/access-codes"),
  revokeCode: (id: number) =>
    request<AccessCode>(`/api/admin/access-codes/${id}/revoke`, { method: "POST" }),

  gateLogs: (period: ReportPeriod, search: string) =>
    request<GateLog[]>(
      `/api/admin/gate-logs${query({ period: period === "all" ? undefined : period, search: search.trim() || undefined })}`
    ),
  auditLogs: () => request<AuditLog[]>("/api/admin/audit-logs"),
};

// The backend stores UTC times without a zone suffix; show them in local time.
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(value);
  const d = new Date(hasZone ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
