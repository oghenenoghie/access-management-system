// Set EXPO_PUBLIC_API_URL (e.g. in mobile-expo/.env) to http://<PC LAN IP>:8000
// to test on a real phone. The default 10.0.2.2 only reaches the PC from the
// Android emulator.
const DEFAULT_API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:8000"
).replace(/\/+$/, "");

// FastAPI sends validation failures (HTTP 422) as a list of
// { loc: ["body", "valid_hours"], msg: "..." }; turn that into readable text.
function describeError(detail, status) {
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "";
        return field ? `${String(field).replace(/_/g, " ")}: ${d.msg}` : d.msg;
      })
      .join("\n");
  }
  return detail ? String(detail) : `Request failed (HTTP ${status}).`;
}

export class EstateApiClient {
  constructor(baseUrl = DEFAULT_API_URL) {
    this.baseUrl = baseUrl;
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  async request(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(options.headers || {}),
    };

    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
      });
    } catch {
      // status 0 = the server couldn't be reached at all
      throw Object.assign(new Error(`Could not reach the server at ${this.baseUrl}.`), { status: 0 });
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(describeError(data.detail, response.status)), {
        status: response.status,
      });
    }
    return data;
  }

  login(identifier, password) {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
  }

  registerResident(payload) {
    return this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  requestPasswordRecovery(email) {
    return this.request("/api/auth/password-recovery", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  resetPassword(email, recoveryCode, newPassword) {
    return this.request("/api/auth/password-reset", {
      method: "POST",
      body: JSON.stringify({ email, recovery_code: recoveryCode, new_password: newPassword }),
    });
  }

  createAccessCode(payload) {
    return this.request("/api/residents/access-codes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  listAccessCodes(statusFilter = "") {
    const q = statusFilter ? `?status_filter=${statusFilter}` : "";
    return this.request(`/api/residents/access-codes${q}`);
  }

  cancelAccessCode(codeId) {
    return this.request(`/api/residents/access-codes/${codeId}/cancel`, {
      method: "POST",
    });
  }

  getVisitorHistory() {
    return this.request("/api/residents/visitor-history");
  }

  getNotifications() {
    return this.request("/api/residents/notifications");
  }
}

export const apiClient = new EstateApiClient();
