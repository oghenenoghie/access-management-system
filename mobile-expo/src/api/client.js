const DEFAULT_API_URL = "http://10.0.2.2:8000"; // Android Emulator localhost -> FastAPI

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

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Request failed");
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
