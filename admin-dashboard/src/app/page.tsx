"use client";

import React, { useCallback, useEffect, useState } from "react";
import SignIn from "../components/SignIn";
import {
  api,
  ApiError,
  formatDateTime,
  getSession,
  type AccessCode,
  type AuditLog,
  type GateLog,
  type Overview,
  type ReportPeriod,
  type Unit,
  type User,
  type UserStatus,
} from "../lib/api";

type Nav = "overview" | "residents" | "units" | "codes" | "reports" | "security";

// ---------- Shared styles ----------

const card: React.CSSProperties = { backgroundColor: "#ffffff", padding: "24px", borderRadius: "14px" };
const formCard: React.CSSProperties = { ...card, padding: "20px", marginBottom: "20px" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const headRow: React.CSSProperties = {
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  fontSize: "13px",
  color: "#475569",
};
const th: React.CSSProperties = { padding: "10px" };
const rowStyle: React.CSSProperties = { borderBottom: "1px solid #f1f5f9", fontSize: "14px" };
const td: React.CSSProperties = { padding: "12px 10px", verticalAlign: "top" };
const muted: React.CSSProperties = { fontSize: "12px", color: "#64748b" };
const inputStyle: React.CSSProperties = {
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  flex: 1,
  minWidth: "150px",
};
const primaryBtn: React.CSSProperties = {
  backgroundColor: "#2563eb",
  color: "#ffffff",
  border: "none",
  padding: "10px 18px",
  borderRadius: "8px",
  fontWeight: 700,
  cursor: "pointer",
};
function smallBtn(bg: string): React.CSSProperties {
  return {
    backgroundColor: bg,
    color: "#fff",
    border: "none",
    padding: "6px 10px",
    borderRadius: "6px",
    marginRight: "6px",
    marginBottom: "4px",
    fontSize: "12px",
    cursor: "pointer",
  };
}

const STATUS_COLORS: Record<string, string> = {
  active: "#15803d",
  pending: "#b45309",
  suspended: "#c2410c",
  deactivated: "#b91c1c",
  cancelled: "#b91c1c",
  used: "#475569",
  expired: "#475569",
};

function StatusText({ status }: { status: string }) {
  return (
    <span style={{ fontWeight: 700, color: STATUS_COLORS[status] ?? "#0f172a" }}>
      {status.toUpperCase()}
    </span>
  );
}

const ACTION_LABELS: Record<string, string> = {
  entry_granted: "ENTRY GRANTED",
  exit_recorded: "EXITED",
  entry_rejected: "REJECTED",
};

function ActionBadge({ action }: { action: string }) {
  const rejected = action === "entry_rejected";
  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: "6px",
        fontSize: "12px",
        fontWeight: 700,
        whiteSpace: "nowrap",
        backgroundColor: rejected ? "#fee2e2" : "#dcfce7",
        color: rejected ? "#b91c1c" : "#15803d",
      }}
    >
      {ACTION_LABELS[action] ?? action.toUpperCase()}
    </span>
  );
}

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  askReason?: boolean;
  onConfirm: (reason?: string) => void;
}

// In-page confirmation (native confirm()/prompt() can be blocked or suppressed).
function ConfirmDialog({ req, onCancel }: { req: ConfirmRequest; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        zIndex: 50,
      }}
    >
      <div style={{ backgroundColor: "#ffffff", borderRadius: "14px", padding: "22px", width: "100%", maxWidth: "440px" }}>
        <h3 id="confirm-title" style={{ fontSize: "17px", fontWeight: 700, marginBottom: "8px", color: "#0f172a" }}>
          {req.title}
        </h3>
        <p style={{ fontSize: "14px", color: "#334155", lineHeight: 1.5 }}>{req.message}</p>
        {req.askReason && (
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginTop: "14px" }}>
            Reason (optional, sent to them)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              style={{
                display: "block",
                width: "100%",
                marginTop: "6px",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px",
                fontFamily: "inherit",
              }}
            />
          </label>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
          <button
            onClick={onCancel}
            style={{
              backgroundColor: "#f1f5f9",
              color: "#0f172a",
              border: "none",
              padding: "9px 16px",
              borderRadius: "8px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            autoFocus
            onClick={() => req.onConfirm(reason.trim() || undefined)}
            style={{
              backgroundColor: "#dc2626",
              color: "#ffffff",
              border: "none",
              padding: "9px 16px",
              borderRadius: "8px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const dialogOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(15, 23, 42, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  zIndex: 50,
};
const dialogBox: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "14px",
  padding: "22px",
  width: "100%",
  maxWidth: "440px",
};
const dialogInput: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: "6px",
  padding: "9px 10px",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  fontSize: "14px",
};

// Shows an admin-issued temporary password once, so it can be passed on.
function TemporaryPasswordDialog({
  name,
  password,
  onClose,
}: {
  name: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="temp-title" style={dialogOverlay}>
      <div style={dialogBox}>
        <h3 id="temp-title" style={{ fontSize: "17px", fontWeight: 700, marginBottom: "8px", color: "#0f172a" }}>
          Temporary password for {name}
        </h3>
        <p style={{ fontSize: "14px", color: "#334155", lineHeight: 1.5 }}>
          Give it to them in person or by phone. It won&apos;t be shown again. Ask them to change it after signing in.
        </p>
        <div
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
            fontSize: "20px",
            fontWeight: 700,
            letterSpacing: "1px",
            backgroundColor: "#f1f5f9",
            padding: "12px 14px",
            borderRadius: "8px",
            margin: "14px 0",
            wordBreak: "break-all",
            userSelect: "all",
          }}
        >
          {password}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            onClick={() => {
              navigator.clipboard
                ?.writeText(password)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
            style={{ ...primaryBtn, backgroundColor: "#0f172a", padding: "9px 16px" }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button autoFocus onClick={onClose} style={{ ...primaryBtn, padding: "9px 16px" }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError("The new password must be at least 8 characters.");
    if (next !== repeat) return setError("The two new passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await api.changeOwnPassword(current, next);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change the password.");
    } finally {
      setBusy(false);
    }
  };

  const label: React.CSSProperties = { display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginTop: "12px" };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-title"
      style={dialogOverlay}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <form onSubmit={submit} style={dialogBox}>
        <h3 id="change-title" style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>
          Change your password
        </h3>
        <label style={label}>
          Current password
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} style={dialogInput} autoFocus />
        </label>
        <label style={label}>
          New password (at least 8 characters)
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} style={dialogInput} />
        </label>
        <label style={label}>
          Repeat new password
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} style={dialogInput} />
        </label>
        {error && (
          <div role="alert" style={{ backgroundColor: "#fee2e2", color: "#b91c1c", padding: "9px 11px", borderRadius: "8px", fontSize: "13px", marginTop: "12px" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ backgroundColor: "#f1f5f9", color: "#0f172a", border: "none", padding: "9px 16px", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, padding: "9px 16px" }}>
            {busy ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} style={{ ...td, color: "#94a3b8", textAlign: "center" }}>
        {text}
      </td>
    </tr>
  );
}

// ---------- Page: sign-in gate ----------

export default function EstateAdminDashboardPage() {
  const [ready, setReady] = useState(false);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [signInNotice, setSignInNotice] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session) setAdminName(session.name);
    setReady(true);
  }, []);

  const signOut = useCallback((notice?: string) => {
    api.signOut();
    setAdminName(null);
    setSignInNotice(notice ?? null);
  }, []);

  if (!ready) return null;
  if (!adminName) {
    return (
      <SignIn
        notice={signInNotice}
        onSignedIn={(name) => {
          setSignInNotice(null);
          setAdminName(name);
        }}
      />
    );
  }
  return <Dashboard adminName={adminName} onSignOut={signOut} />;
}

// ---------- Dashboard ----------

function Dashboard({
  adminName,
  onSignOut,
}: {
  adminName: string;
  onSignOut: (notice?: string) => void;
}) {
  const [activeNav, setActiveNav] = useState<Nav>("overview");

  // Data from the backend
  const [overview, setOverview] = useState<Overview | null>(null);
  const [residents, setResidents] = useState<User[]>([]);
  const [officers, setOfficers] = useState<User[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [recentLogs, setRecentLogs] = useState<GateLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [reportLogs, setReportLogs] = useState<GateLog[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  // Filters & forms
  const [investigationQuery, setInvestigationQuery] = useState("");
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("all");
  const [codeFilter, setCodeFilter] = useState("all");
  const [newUnitNumber, setNewUnitNumber] = useState("");
  const [newUnitBlock, setNewUnitBlock] = useState("");
  const [newUnitType, setNewUnitType] = useState("Apartment");
  const [newUnitStreet, setNewUnitStreet] = useState("");
  const [newOfficerName, setNewOfficerName] = useState("");
  const [newOfficerEmail, setNewOfficerEmail] = useState("");
  const [newOfficerPhone, setNewOfficerPhone] = useState("");
  const [newOfficerPassword, setNewOfficerPassword] = useState("");
  const [newOfficerBadge, setNewOfficerBadge] = useState("");

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onSignOut("Your session has expired. Please sign in again.");
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        onSignOut("This account doesn't have estate administrator access.");
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong.");
    },
    [onSignOut]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, res, sec, un, codes, logs, audit] = await Promise.all([
        api.overview(),
        api.users("resident"),
        api.users("security"),
        api.units(),
        api.accessCodes(),
        api.gateLogs("all", ""),
        api.auditLogs(),
      ]);
      setOverview(ov);
      setResidents(res);
      setOfficers(sec);
      setUnits(un);
      setAccessCodes(codes);
      setRecentLogs(logs);
      setAuditLogs(audit);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Gate reports are filtered by the backend; wait for a pause in typing.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const logs = await api.gateLogs(reportPeriod, investigationQuery);
        if (!cancelled) setReportLogs(logs);
      } catch (err) {
        if (!cancelled) handleError(err);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reportPeriod, investigationQuery, refreshKey, handleError]);

  const refreshAll = () => {
    setError(null);
    setRefreshKey((k) => k + 1);
    void loadAll();
  };

  // Runs a change on the backend, then reloads everything it may affect.
  const perform = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      setRefreshKey((k) => k + 1);
      await loadAll();
      return true;
    } catch (err) {
      handleError(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeUserStatus = (u: User, status: UserStatus) => {
    const run = (reason?: string) =>
      void perform(() => api.setUserStatus(u.id, status, reason), `${u.full_name} is now ${status}.`);
    if (status !== "suspended" && status !== "deactivated") {
      run();
      return;
    }
    const verb = status === "suspended" ? "Suspend" : "Deactivate";
    setConfirmReq({
      title: `${verb} ${u.full_name}?`,
      message:
        u.role === "resident"
          ? "Their active visitor codes will be cancelled immediately, and they won't be able to sign in until reactivated."
          : "They won't be able to sign in to the gate app until reactivated.",
      confirmLabel: verb,
      askReason: true,
      onConfirm: (reason) => {
        setConfirmReq(null);
        run(reason);
      },
    });
  };

  const toggleUnit = (u: Unit) => {
    const run = () =>
      void perform(
        () => api.toggleUnitSuspension(u.id),
        u.access_suspended ? `Gate access restored for ${u.unit_number}.` : `Gate access suspended for ${u.unit_number}.`
      );
    if (u.access_suspended) {
      run();
      return;
    }
    setConfirmReq({
      title: `Suspend gate access for ${u.unit_number}?`,
      message: "Visitor codes from this unit will be rejected at the gate until you restore access.",
      confirmLabel: "Suspend access",
      onConfirm: () => {
        setConfirmReq(null);
        run();
      },
    });
  };

  const resetPassword = (u: User) => {
    setConfirmReq({
      title: `Reset ${u.full_name}'s password?`,
      message:
        "Their current password stops working straight away. You'll get a temporary password to give them in person or by phone.",
      confirmLabel: "Reset password",
      onConfirm: async () => {
        setConfirmReq(null);
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
          const res = await api.resetPassword(u.id);
          setTempPassword({ name: u.full_name, password: res.temporary_password });
          setRefreshKey((k) => k + 1);
          void loadAll(); // the reset appears in the audit trail
        } catch (err) {
          handleError(err);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const revokeCode = (c: AccessCode) => {
    setConfirmReq({
      title: `Revoke code ${c.code}?`,
      message: `The pass for ${c.visitor_name} will be rejected at the gate. This can't be undone.`,
      confirmLabel: "Revoke code",
      onConfirm: () => {
        setConfirmReq(null);
        void perform(() => api.revokeCode(c.id), `Code ${c.code} revoked.`);
      },
    });
  };

  const addUnit = async () => {
    if (!newUnitNumber.trim() || !newUnitBlock.trim()) {
      setError("Enter both a unit number and a block name.");
      return;
    }
    const unitNumber = newUnitNumber.trim();
    const ok = await perform(
      () =>
        api.createUnit({
          unit_number: unitNumber,
          block_name: newUnitBlock.trim(),
          street_address: newUnitStreet.trim() || null,
          unit_type: newUnitType,
        }),
      `Unit ${unitNumber} added.`
    );
    if (ok) {
      setNewUnitNumber("");
      setNewUnitBlock("");
      setNewUnitStreet("");
    }
  };

  const createOfficer = async () => {
    const name = newOfficerName.trim();
    const email = newOfficerEmail.trim();
    const phone = newOfficerPhone.trim();
    const badge = newOfficerBadge.trim();
    if (!name || !email || !phone || !newOfficerPassword) {
      setError("Enter the officer's name, email, phone and an initial password.");
      return;
    }
    if (newOfficerPassword.length < 8) {
      setError("Use an initial password of at least 8 characters.");
      return;
    }
    if (badge && [...officers, ...residents].some((u) => u.estate_id_number === badge)) {
      setError(`Badge / estate ID ${badge} is already in use.`);
      return;
    }
    const ok = await perform(
      () =>
        api.createUser({
          full_name: name,
          email,
          phone,
          password: newOfficerPassword,
          role: "security",
          status: "active",
          estate_id_number: badge || null,
        }),
      `Officer account created for ${name}. They can sign in to the gate app with ${email}.`
    );
    if (ok) {
      setNewOfficerName("");
      setNewOfficerEmail("");
      setNewOfficerPhone("");
      setNewOfficerPassword("");
      setNewOfficerBadge("");
    }
  };

  const residentsPerUnit = (unitId: number) => residents.filter((r) => r.unit_id === unitId).length;
  const visibleCodes = codeFilter === "all" ? accessCodes : accessCodes.filter((c) => c.status === codeFilter);
  const m = overview?.metrics;
  const s = overview?.reports_summary;
  const show = (n: number | undefined) => (n === undefined ? "…" : n);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {confirmReq && <ConfirmDialog req={confirmReq} onCancel={() => setConfirmReq(null)} />}
      {tempPassword && (
        <TemporaryPasswordDialog
          name={tempPassword.name}
          password={tempPassword.password}
          onClose={() => setTempPassword(null)}
        />
      )}
      {changingPassword && (
        <ChangePasswordDialog
          onClose={() => setChangingPassword(false)}
          onChanged={() => {
            setChangingPassword(false);
            setNotice("Your password was changed.");
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          width: "270px",
          flexShrink: 0,
          backgroundColor: "#0f172a",
          color: "#f8fafc",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: "28px", padding: "0 8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#38bdf8", letterSpacing: "1.2px" }}>
            ROYAL PALMS ESTATE
          </div>
          <h1 style={{ fontSize: "19px", fontWeight: 700, marginTop: "4px" }}>Estate Admin Portal</h1>
        </div>

        {(
          [
            { id: "overview", label: "Dashboard Overview" },
            { id: "residents", label: "Resident Accounts" },
            { id: "units", label: "Units & Apartments" },
            { id: "codes", label: "Visitor Access Codes" },
            { id: "reports", label: "Gate Reports & Investigations" },
            { id: "security", label: "Security Personnel" },
          ] as { id: Nav; label: string }[]
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveNav(item.id)}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: "10px",
              border: "none",
              marginBottom: "6px",
              backgroundColor: activeNav === item.id ? "#2563eb" : "transparent",
              color: activeNav === item.id ? "#ffffff" : "#cbd5e1",
              fontWeight: activeNav === item.id ? 700 : 500,
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}

        <div style={{ marginTop: "auto", padding: "16px 8px 0", borderTop: "1px solid #1e293b" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>Signed in as</div>
          <div style={{ fontSize: "14px", fontWeight: 600, margin: "2px 0 10px" }}>{adminName}</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[
              { label: "Change password", onClick: () => setChangingPassword(true) },
              { label: "Sign out", onClick: () => onSignOut() },
            ].map((b) => (
              <button
                key={b.label}
                onClick={b.onClick}
                style={{
                  backgroundColor: "#1e293b",
                  color: "#e2e8f0",
                  border: "none",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "28px 36px", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          {(loading || busy) && <span style={muted}>{busy ? "Saving…" : "Loading…"}</span>}
          <button
            onClick={refreshAll}
            disabled={loading || busy}
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #cbd5e1",
              padding: "8px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: "#fee2e2",
              color: "#b91c1c",
              padding: "12px 14px",
              borderRadius: "10px",
              marginBottom: "16px",
              fontSize: "14px",
              whiteSpace: "pre-line",
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ border: "none", background: "none", color: "#b91c1c", cursor: "pointer" }}>
              Dismiss
            </button>
          </div>
        )}
        {notice && !error && (
          <div
            role="status"
            style={{
              backgroundColor: "#dcfce7",
              color: "#15803d",
              padding: "12px 14px",
              borderRadius: "10px",
              marginBottom: "16px",
              fontSize: "14px",
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} style={{ border: "none", background: "none", color: "#15803d", cursor: "pointer" }}>
              Dismiss
            </button>
          </div>
        )}

        {/* OVERVIEW */}
        {activeNav === "overview" && (
          <div>
            <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "20px" }}>
              Estate Access Control & Security Overview
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
                marginBottom: "16px",
              }}
            >
              {[
                {
                  title: "Registered Residents",
                  value: show(m?.total_residents),
                  sub: `${show(m?.pending_residents)} pending approval`,
                },
                { title: "Active Visitor Codes", value: show(m?.active_codes), sub: "Valid at the gate now" },
                {
                  title: "Visitors Currently Inside",
                  value: show(m?.visitors_currently_inside),
                  sub: "Entered, no exit recorded",
                },
                {
                  title: "Rejected Gate Attempts",
                  value: show(s?.daily_rejections),
                  sub: "Last 24 hours",
                },
              ].map((c) => (
                <div
                  key={c.title}
                  style={{
                    backgroundColor: "#ffffff",
                    padding: "20px",
                    borderRadius: "14px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>{c.title}</div>
                  <div style={{ fontSize: "32px", fontWeight: 800, margin: "8px 0 4px", color: "#0f172a" }}>
                    {c.value}
                  </div>
                  <div style={{ fontSize: "12px", color: "#2563eb", fontWeight: 600 }}>{c.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ ...muted, marginBottom: "28px" }}>
              Entries & exits: {show(s?.daily_entries)} in the last 24 hours · {show(s?.weekly_entries)} in 7 days ·{" "}
              {show(s?.monthly_entries)} in 30 days · {show(m?.total_units)} units · {show(m?.security_officers)} security
              officers
            </div>

            <div style={card}>
              <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "14px" }}>Recent Gate Activity</h3>
              <table style={tableStyle}>
                <thead>
                  <tr style={headRow}>
                    <th style={th}>Code</th>
                    <th style={th}>Visitor</th>
                    <th style={th}>Authorising Resident</th>
                    <th style={th}>Gate</th>
                    <th style={th}>Status</th>
                    <th style={th}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.length === 0 && <EmptyRow cols={6} text={loading ? "Loading…" : "No gate activity yet."} />}
                  {recentLogs.slice(0, 10).map((log) => (
                    <tr key={log.id} style={rowStyle}>
                      <td style={{ ...td, fontWeight: 700 }}>{log.code_entered}</td>
                      <td style={td}>{log.visitor_name ?? "Unknown visitor"}</td>
                      <td style={td}>
                        {log.resident_name ?? "—"}
                        {log.unit_number ? ` (${log.unit_number})` : ""}
                      </td>
                      <td style={td}>{log.gate_name}</td>
                      <td style={td}>
                        <ActionBadge action={log.action} />
                      </td>
                      <td style={td}>{formatDateTime(log.entry_time ?? log.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* RESIDENTS MANAGEMENT */}
        {activeNav === "residents" && (
          <div style={card}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
              Resident Accounts & Access Privilege Control
            </h2>
            <table style={tableStyle}>
              <thead>
                <tr style={headRow}>
                  <th style={th}>Resident Name</th>
                  <th style={th}>Estate ID</th>
                  <th style={th}>Unit / Apartment</th>
                  <th style={th}>Contact</th>
                  <th style={th}>Status</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {residents.length === 0 && <EmptyRow cols={6} text={loading ? "Loading…" : "No residents yet."} />}
                {residents.map((r) => (
                  <tr key={r.id} style={rowStyle}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.full_name}</td>
                    <td style={td}>{r.estate_id_number ?? "—"}</td>
                    <td style={td}>{r.unit?.unit_number ?? "—"}</td>
                    <td style={td}>
                      {r.email}
                      <br />
                      <span style={muted}>{r.phone}</span>
                    </td>
                    <td style={td}>
                      <StatusText status={r.status} />
                    </td>
                    <td style={td}>
                      {r.status !== "active" && (
                        <button disabled={busy} onClick={() => changeUserStatus(r, "active")} style={smallBtn("#16a34a")}>
                          {r.status === "pending" ? "Approve" : "Reactivate"}
                        </button>
                      )}
                      {r.status === "active" && (
                        <button disabled={busy} onClick={() => changeUserStatus(r, "suspended")} style={smallBtn("#ea580c")}>
                          Suspend Privileges
                        </button>
                      )}
                      {r.status !== "deactivated" && (
                        <button disabled={busy} onClick={() => changeUserStatus(r, "deactivated")} style={smallBtn("#dc2626")}>
                          Deactivate
                        </button>
                      )}
                      <button disabled={busy} onClick={() => resetPassword(r)} style={smallBtn("#475569")}>
                        Reset password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* RESIDENTIAL UNITS & APARTMENTS */}
        {activeNav === "units" && (
          <div>
            <div style={formCard}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>Add Residential Unit / Apartment</h3>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <input
                  placeholder="Unit number (e.g. Block C - Apt 201)"
                  value={newUnitNumber}
                  onChange={(e) => setNewUnitNumber(e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="Block / precinct name"
                  value={newUnitBlock}
                  onChange={(e) => setNewUnitBlock(e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="Street address (optional)"
                  value={newUnitStreet}
                  onChange={(e) => setNewUnitStreet(e.target.value)}
                  style={inputStyle}
                />
                <select
                  value={newUnitType}
                  onChange={(e) => setNewUnitType(e.target.value)}
                  style={{ ...inputStyle, flex: "0 0 150px", minWidth: 0 }}
                >
                  {["Apartment", "Duplex", "Terrace", "Villa", "Bungalow"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <button disabled={busy} onClick={() => void addUnit()} style={primaryBtn}>
                  Add Unit
                </button>
              </div>
            </div>

            <div style={card}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
                Residential Units & Apartments Directory
              </h2>
              <table style={tableStyle}>
                <thead>
                  <tr style={headRow}>
                    <th style={th}>Unit Number</th>
                    <th style={th}>Block</th>
                    <th style={th}>Type</th>
                    <th style={th}>Residents</th>
                    <th style={th}>Gate Access</th>
                    <th style={th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {units.length === 0 && <EmptyRow cols={6} text={loading ? "Loading…" : "No units yet."} />}
                  {units.map((u) => (
                    <tr key={u.id} style={rowStyle}>
                      <td style={{ ...td, fontWeight: 700 }}>
                        {u.unit_number}
                        {u.street_address && (
                          <>
                            <br />
                            <span style={{ ...muted, fontWeight: 400 }}>{u.street_address}</span>
                          </>
                        )}
                      </td>
                      <td style={td}>{u.block_name}</td>
                      <td style={td}>{u.unit_type}</td>
                      <td style={td}>{residentsPerUnit(u.id)}</td>
                      <td style={{ ...td, fontWeight: 700, color: u.access_suspended ? "#b91c1c" : "#15803d" }}>
                        {u.access_suspended ? "SUSPENDED" : "ALLOWED"}
                      </td>
                      <td style={td}>
                        <button
                          disabled={busy}
                          onClick={() => toggleUnit(u)}
                          style={smallBtn(u.access_suspended ? "#16a34a" : "#dc2626")}
                        >
                          {u.access_suspended ? "Restore Unit Access" : "Suspend Unit Access"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VISITOR ACCESS CODES MONITORING */}
        {activeNav === "codes" && (
          <div style={card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <h2 style={{ fontSize: "20px", fontWeight: 700 }}>Monitor Active & Historical Visitor Access Codes</h2>
              <select value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} style={{ ...inputStyle, flex: "0 0 170px" }}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="used">Used</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <table style={tableStyle}>
              <thead>
                <tr style={headRow}>
                  <th style={th}>Code</th>
                  <th style={th}>Visitor</th>
                  <th style={th}>Host Resident & Unit</th>
                  <th style={th}>Type / Uses</th>
                  <th style={th}>Valid Until</th>
                  <th style={th}>Status</th>
                  <th style={th}>Control</th>
                </tr>
              </thead>
              <tbody>
                {visibleCodes.length === 0 && <EmptyRow cols={7} text={loading ? "Loading…" : "No codes match."} />}
                {visibleCodes.map((ac) => (
                  <tr key={ac.id} style={rowStyle}>
                    <td style={{ ...td, fontWeight: 800 }}>{ac.code}</td>
                    <td style={td}>
                      {ac.visitor_name}
                      <br />
                      <span style={muted}>{ac.visitor_phone}</span>
                    </td>
                    <td style={td}>
                      {ac.resident_name ?? "—"}
                      {ac.unit_number ? ` (${ac.unit_number})` : ""}
                    </td>
                    <td style={td}>
                      {ac.code_type === "one_time" ? "One-time" : "Temporary"} ({ac.use_count}/{ac.max_uses})
                    </td>
                    <td style={td}>{formatDateTime(ac.valid_until)}</td>
                    <td style={td}>
                      <StatusText status={ac.status} />
                    </td>
                    <td style={td}>
                      {ac.status === "active" && (
                        <button disabled={busy} onClick={() => revokeCode(ac)} style={smallBtn("#dc2626")}>
                          Revoke Code
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ ...muted, marginTop: "12px" }}>Shows the 200 most recent codes.</div>
          </div>
        )}

        {/* GATE REPORTS & SECURITY INVESTIGATIONS */}
        {activeNav === "reports" && (
          <div>
            <div style={{ ...card, marginBottom: "20px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "14px" }}>
                Gate Activity Reports & Security Investigations
              </h2>
              <div style={{ display: "flex", gap: "12px", marginBottom: "18px", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  placeholder="Search visitor, phone, access code, resident, unit, or vehicle plate..."
                  value={investigationQuery}
                  onChange={(e) => setInvestigationQuery(e.target.value)}
                  style={{ ...inputStyle, padding: "10px 14px", minWidth: "260px" }}
                />
                {(["all", "daily", "weekly", "monthly"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setReportPeriod(p)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      backgroundColor: reportPeriod === p ? "#0f172a" : "#f8fafc",
                      color: reportPeriod === p ? "#ffffff" : "#0f172a",
                      fontWeight: 600,
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    {p === "all" ? "ALL TIME" : `${p.toUpperCase()} REPORT`}
                  </button>
                ))}
              </div>

              <div style={{ ...muted, marginBottom: "8px" }}>
                {reportLogs.length} record{reportLogs.length === 1 ? "" : "s"}
                {reportLogs.length === 300 ? " (showing the newest 300)" : ""}
              </div>
              <table style={tableStyle}>
                <thead>
                  <tr style={headRow}>
                    <th style={th}>Code</th>
                    <th style={th}>Visitor & Phone</th>
                    <th style={th}>Host Resident & Unit</th>
                    <th style={th}>Security Officer</th>
                    <th style={th}>Vehicle</th>
                    <th style={th}>Entry / Exit</th>
                    <th style={th}>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {reportLogs.length === 0 && <EmptyRow cols={7} text="No gate records match." />}
                  {reportLogs.map((l) => (
                    <tr key={l.id} style={rowStyle}>
                      <td style={{ ...td, fontWeight: 700 }}>{l.code_entered}</td>
                      <td style={td}>
                        {l.visitor_name ?? "Unknown visitor"}
                        {l.visitor_phone && (
                          <>
                            <br />
                            <span style={muted}>{l.visitor_phone}</span>
                          </>
                        )}
                      </td>
                      <td style={td}>
                        {l.resident_name ?? "—"}
                        {l.unit_number ? ` • ${l.unit_number}` : ""}
                      </td>
                      <td style={td}>
                        {l.security_officer_name ?? "—"}
                        <br />
                        <span style={muted}>{l.gate_name}</span>
                      </td>
                      <td style={td}>{l.vehicle_plate ?? "—"}</td>
                      <td style={td}>
                        {l.entry_time ? `In: ${formatDateTime(l.entry_time)}` : formatDateTime(l.created_at)}
                        {l.exit_time && (
                          <>
                            <br />
                            Out: {formatDateTime(l.exit_time)}
                          </>
                        )}
                      </td>
                      <td style={td}>
                        <ActionBadge action={l.action} />
                        {l.rejection_reason && (
                          <>
                            <br />
                            <span style={muted}>{l.rejection_reason}</span>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={card}>
              <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "14px" }}>Audit Trail</h3>
              <table style={tableStyle}>
                <thead>
                  <tr style={headRow}>
                    <th style={th}>Time</th>
                    <th style={th}>Who</th>
                    <th style={th}>Action</th>
                    <th style={th}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 && <EmptyRow cols={4} text={loading ? "Loading…" : "No audit entries yet."} />}
                  {auditLogs.map((a) => (
                    <tr key={a.id} style={rowStyle}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{formatDateTime(a.created_at)}</td>
                      <td style={td}>
                        {a.actor_name ?? "System"}
                        {a.actor_role && (
                          <>
                            <br />
                            <span style={muted}>{a.actor_role}</span>
                          </>
                        )}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{a.action.replace(/_/g, " ")}</td>
                      <td style={td}>{a.details ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ ...muted, marginTop: "12px" }}>Shows the 100 most recent entries.</div>
            </div>
          </div>
        )}

        {/* SECURITY PERSONNEL ACCOUNTS */}
        {activeNav === "security" && (
          <div>
            <div style={formCard}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>Register Security Personnel Account</h3>
              <div style={{ ...muted, marginBottom: "12px" }}>
                The officer signs in to the gate app with this email and password. Share the password with them privately.
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <input
                  placeholder="Officer full name"
                  value={newOfficerName}
                  onChange={(e) => setNewOfficerName(e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="Email"
                  type="email"
                  value={newOfficerEmail}
                  onChange={(e) => setNewOfficerEmail(e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="Telephone number"
                  value={newOfficerPhone}
                  onChange={(e) => setNewOfficerPhone(e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="Initial password (8+ characters)"
                  type="password"
                  autoComplete="new-password"
                  value={newOfficerPassword}
                  onChange={(e) => setNewOfficerPassword(e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="Badge ID (optional, e.g. EST-SEC-003)"
                  value={newOfficerBadge}
                  onChange={(e) => setNewOfficerBadge(e.target.value)}
                  style={inputStyle}
                />
                <button disabled={busy} onClick={() => void createOfficer()} style={primaryBtn}>
                  Create Officer
                </button>
              </div>
            </div>

            <div style={card}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>Estate Security Personnel Roster</h2>
              <table style={tableStyle}>
                <thead>
                  <tr style={headRow}>
                    <th style={th}>Badge ID</th>
                    <th style={th}>Officer Name</th>
                    <th style={th}>Contact</th>
                    <th style={th}>Added</th>
                    <th style={th}>Status</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {officers.length === 0 && <EmptyRow cols={6} text={loading ? "Loading…" : "No security officers yet."} />}
                  {officers.map((o) => (
                    <tr key={o.id} style={rowStyle}>
                      <td style={{ ...td, fontWeight: 700 }}>{o.estate_id_number ?? "—"}</td>
                      <td style={td}>{o.full_name}</td>
                      <td style={td}>
                        {o.email}
                        <br />
                        <span style={muted}>{o.phone}</span>
                      </td>
                      <td style={td}>{formatDateTime(o.created_at)}</td>
                      <td style={td}>
                        <StatusText status={o.status} />
                      </td>
                      <td style={td}>
                        {o.status !== "active" && (
                          <button disabled={busy} onClick={() => changeUserStatus(o, "active")} style={smallBtn("#16a34a")}>
                            Reactivate
                          </button>
                        )}
                        {o.status === "active" && (
                          <button disabled={busy} onClick={() => changeUserStatus(o, "suspended")} style={smallBtn("#ea580c")}>
                            Suspend
                          </button>
                        )}
                        {o.status !== "deactivated" && (
                          <button disabled={busy} onClick={() => changeUserStatus(o, "deactivated")} style={smallBtn("#dc2626")}>
                            Deactivate
                          </button>
                        )}
                        <button disabled={busy} onClick={() => resetPassword(o)} style={smallBtn("#475569")}>
                          Reset password
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
