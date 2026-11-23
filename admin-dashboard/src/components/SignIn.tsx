"use client";

import React, { useState } from "react";
import { api, ApiError, API_BASE_URL, saveSession } from "../lib/api";

export default function SignIn({
  notice,
  onSignedIn,
}: {
  notice?: string | null;
  onSignedIn: (name: string) => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Enter your email (or phone) and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(identifier.trim(), password);
      if (res.user.role !== "admin") {
        api.signOut();
        setError(
          "This account isn't an estate administrator. Residents and security officers use the mobile apps."
        );
        return;
      }
      saveSession(res.access_token, res.user.full_name);
      onSignedIn(res.user.full_name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "11px 12px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    marginTop: "6px",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0f172a",
        padding: "16px",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: "400px",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          padding: "28px",
        }}
      >
        <div style={{ fontSize: "11px", fontWeight: 800, color: "#2563eb", letterSpacing: "1.2px" }}>
          ROYAL PALMS ESTATE
        </div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "4px 0 20px", color: "#0f172a" }}>
          Estate Admin Portal
        </h1>

        {notice && (
          <div
            style={{
              backgroundColor: "#fef3c7",
              color: "#92400e",
              padding: "10px 12px",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "14px",
            }}
          >
            {notice}
          </div>
        )}

        <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
          Email or phone
          <input
            style={input}
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </label>
        <div style={{ height: "14px" }} />
        <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
          Password
          <input
            style={input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: "#fee2e2",
              color: "#b91c1c",
              padding: "10px 12px",
              borderRadius: "8px",
              fontSize: "13px",
              marginTop: "14px",
              whiteSpace: "pre-line",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            marginTop: "18px",
            backgroundColor: busy ? "#93c5fd" : "#2563eb",
            color: "#ffffff",
            border: "none",
            padding: "12px",
            borderRadius: "8px",
            fontWeight: 700,
            fontSize: "14px",
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "14px" }}>
          Server: {API_BASE_URL}
        </div>
      </form>
    </div>
  );
}
