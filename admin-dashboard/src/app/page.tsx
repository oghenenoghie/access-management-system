"use client";

import React, { useState } from "react";

interface ResidentRecord {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  estate_id_number: string;
  unit_number: string;
  status: "active" | "pending" | "suspended" | "deactivated";
}

interface UnitRecord {
  id: number;
  unit_number: string;
  block_name: string;
  street_address: string;
  unit_type: string;
  is_occupied: boolean;
  access_suspended: boolean;
}

interface AccessCodeRecord {
  id: number;
  code: string;
  visitor_name: string;
  visitor_phone: string;
  resident_name: string;
  unit_number: string;
  code_type: "one_time" | "temporary";
  arrival_date: string;
  valid_until: string;
  use_count: number;
  max_uses: number;
  status: "active" | "used" | "expired" | "cancelled";
}

interface GateLogRecord {
  id: number;
  code_entered: string;
  visitor_name: string;
  visitor_phone: string;
  resident_name: string;
  unit_number: string;
  security_officer_name: string;
  gate_name: string;
  vehicle_plate: string;
  action: "entry_granted" | "exit_recorded" | "entry_rejected";
  rejection_reason?: string;
  entry_time: string;
  exit_time?: string;
  period_tag: "daily" | "weekly" | "monthly";
}

export default function EstateAdminDashboardPage() {
  const [activeNav, setActiveNav] = useState<
    "overview" | "residents" | "units" | "codes" | "reports" | "security"
  >("overview");

  // Residents State
  const [residents, setResidents] = useState<ResidentRecord[]>([
    {
      id: 1,
      full_name: "Engr. Adewale Banjo",
      email: "adewale.banjo@example.com",
      phone: "+2348031112222",
      estate_id_number: "EST-2026-101",
      unit_number: "Block A - Apt 101",
      status: "active",
    },
    {
      id: 2,
      full_name: "Dr. Chioma Nwosu",
      email: "chioma.nwosu@example.com",
      phone: "+2348033334444",
      estate_id_number: "EST-2026-102",
      unit_number: "Block B - Duplex 04",
      status: "active",
    },
    {
      id: 3,
      full_name: "Mr. Tunde Bakare",
      email: "tunde.bakare@example.com",
      phone: "+2348035556666",
      estate_id_number: "EST-2026-103",
      unit_number: "Block A - Apt 102",
      status: "pending",
    },
  ]);

  // Residential Units State
  const [units, setUnits] = useState<UnitRecord[]>([
    {
      id: 1,
      unit_number: "Block A - Apt 101",
      block_name: "Block A (Hibiscus)",
      street_address: "12 Palm Avenue",
      unit_type: "Apartment",
      is_occupied: true,
      access_suspended: false,
    },
    {
      id: 2,
      unit_number: "Block A - Apt 102",
      block_name: "Block A (Hibiscus)",
      street_address: "12 Palm Avenue",
      unit_type: "Apartment",
      is_occupied: true,
      access_suspended: false,
    },
    {
      id: 3,
      unit_number: "Block B - Duplex 04",
      block_name: "Block B (Cedar)",
      street_address: "5 Orchid Drive",
      unit_type: "Duplex",
      is_occupied: true,
      access_suspended: false,
    },
    {
      id: 4,
      unit_number: "Villa 14 - Royal Close",
      block_name: "Royal Villas",
      street_address: "14 Royal Close",
      unit_type: "Villa",
      is_occupied: true,
      access_suspended: false,
    },
  ]);

  // Visitor Access Codes State
  const [accessCodes, setAccessCodes] = useState<AccessCodeRecord[]>([
    {
      id: 101,
      code: "482910",
      visitor_name: "Michael Oluwaseun",
      visitor_phone: "+2348091234567",
      resident_name: "Engr. Adewale Banjo",
      unit_number: "Block A - Apt 101",
      code_type: "one_time",
      arrival_date: "2026-11-15",
      valid_until: "2026-11-15 19:30",
      use_count: 0,
      max_uses: 1,
      status: "active",
    },
    {
      id: 102,
      code: "739104",
      visitor_name: "Solar Tech Maintenance Team",
      visitor_phone: "+2348087654321",
      resident_name: "Dr. Chioma Nwosu",
      unit_number: "Block B - Duplex 04",
      code_type: "temporary",
      arrival_date: "2026-11-15",
      valid_until: "2026-11-16 12:00",
      use_count: 1,
      max_uses: 4,
      status: "active",
    },
    {
      id: 103,
      code: "510293",
      visitor_name: "DHL Express Courier",
      visitor_phone: "+2348050009999",
      resident_name: "Engr. Adewale Banjo",
      unit_number: "Block A - Apt 101",
      code_type: "one_time",
      arrival_date: "2026-11-15",
      valid_until: "2026-11-15 14:00",
      use_count: 1,
      max_uses: 1,
      status: "used",
    },
    {
      id: 104,
      code: "194822",
      visitor_name: "Grace Adebayo",
      visitor_phone: "+2348071112233",
      resident_name: "Engr. Adewale Banjo",
      unit_number: "Block A - Apt 101",
      code_type: "one_time",
      arrival_date: "2026-11-14",
      valid_until: "2026-11-14 20:00",
      use_count: 0,
      max_uses: 1,
      status: "expired",
    },
  ]);

  // Gate Logs & Investigation Records
  const [gateLogs] = useState<GateLogRecord[]>([
    {
      id: 1,
      code_entered: "739104",
      visitor_name: "Solar Tech Maintenance Team",
      visitor_phone: "+2348087654321",
      resident_name: "Dr. Chioma Nwosu",
      unit_number: "Block B - Duplex 04",
      security_officer_name: "Officer Samuel Okafor",
      gate_name: "Main North Gate",
      vehicle_plate: "APP-901-XY",
      action: "entry_granted",
      entry_time: "2026-11-15 10:52",
      period_tag: "daily",
    },
    {
      id: 2,
      code_entered: "510293",
      visitor_name: "DHL Express Courier",
      visitor_phone: "+2348050009999",
      resident_name: "Engr. Adewale Banjo",
      unit_number: "Block A - Apt 101",
      security_officer_name: "Officer Samuel Okafor",
      gate_name: "Main North Gate",
      vehicle_plate: "KJA-112-AA",
      action: "exit_recorded",
      entry_time: "2026-11-15 09:30",
      exit_time: "2026-11-15 09:55",
      period_tag: "daily",
    },
    {
      id: 3,
      code_entered: "194822",
      visitor_name: "Grace Adebayo",
      visitor_phone: "+2348071112233",
      resident_name: "Engr. Adewale Banjo",
      unit_number: "Block A - Apt 101",
      security_officer_name: "Officer Ibrahim Musa",
      gate_name: "South Service Gate",
      vehicle_plate: "N/A",
      action: "entry_rejected",
      rejection_reason: "Expired access code presented",
      entry_time: "2026-11-15 08:15",
      period_tag: "daily",
    },
  ]);

  // Security Personnel Accounts
  const [securityOfficers, setSecurityOfficers] = useState([
    {
      id: 201,
      full_name: "Officer Samuel Okafor",
      email: "security.north@royalpalmsestate.com",
      phone: "+2348020000001",
      badge_id: "EST-SEC-001",
      assigned_gate: "Main North Gate",
      status: "active",
    },
    {
      id: 202,
      full_name: "Officer Ibrahim Musa",
      email: "security.south@royalpalmsestate.com",
      phone: "+2348020000002",
      badge_id: "EST-SEC-002",
      assigned_gate: "South Service Gate",
      status: "active",
    },
  ]);

  // Filter & Form States
  const [investigationQuery, setInvestigationQuery] = useState("");
  const [reportPeriod, setReportPeriod] = useState<"all" | "daily" | "weekly" | "monthly">("all");
  const [newUnitNumber, setNewUnitNumber] = useState("");
  const [newUnitBlock, setNewUnitBlock] = useState("");
  const [newOfficerName, setNewOfficerName] = useState("");
  const [newOfficerPhone, setNewOfficerPhone] = useState("");
  const [newOfficerGate, setNewOfficerGate] = useState("Main North Gate");

  const updateResidentStatus = (
    id: number,
    status: ResidentRecord["status"]
  ) => {
    setResidents((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r))
    );
  };

  const toggleUnitSuspension = (id: number) => {
    setUnits((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, access_suspended: !u.access_suspended } : u
      )
    );
  };

  const revokeCode = (id: number) => {
    setAccessCodes((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "cancelled" } : c))
    );
  };

  const filteredLogs = gateLogs.filter((log) => {
    const matchesPeriod =
      reportPeriod === "all" || log.period_tag === reportPeriod || reportPeriod === "weekly" || reportPeriod === "monthly";
    const q = investigationQuery.toLowerCase().trim();
    if (!q) return matchesPeriod;
    return (
      matchesPeriod &&
      (log.visitor_name.toLowerCase().includes(q) ||
        log.code_entered.toLowerCase().includes(q) ||
        log.resident_name.toLowerCase().includes(q) ||
        log.unit_number.toLowerCase().includes(q) ||
        log.vehicle_plate.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: "270px",
          backgroundColor: "#0f172a",
          color: "#f8fafc",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: "28px", padding: "0 8px" }}>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 800,
              color: "#38bdf8",
              letterSpacing: "1.2px",
            }}
          >
            ROYAL PALMS ESTATE
          </div>
          <h1 style={{ fontSize: "19px", fontWeight: 700, marginTop: "4px" }}>
            Estate Admin Portal
          </h1>
        </div>

        {[
          { id: "overview", label: "Dashboard Overview" },
          { id: "residents", label: "Resident Accounts" },
          { id: "units", label: "Units & Apartments" },
          { id: "codes", label: "Visitor Access Codes" },
          { id: "reports", label: "Gate Reports & Investigations" },
          { id: "security", label: "Security Personnel" },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveNav(item.id as typeof activeNav)}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: "10px",
              border: "none",
              marginBottom: "6px",
              backgroundColor:
                activeNav === item.id ? "#2563eb" : "transparent",
              color: activeNav === item.id ? "#ffffff" : "#cbd5e1",
              fontWeight: activeNav === item.id ? 700 : 500,
              fontSize: "14px",
            }}
          >
            {item.label}
          </button>
        ))}
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "28px 36px" }}>
        {/* OVERVIEW */}
        {activeNav === "overview" && (
          <div>
            <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "20px" }}>
              Estate Access Control & Security Overview
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "16px",
                marginBottom: "28px",
              }}
            >
              {[
                {
                  title: "Registered Residents",
                  value: residents.length,
                  sub: `${residents.filter((r) => r.status === "pending").length} Pending Approval`,
                },
                {
                  title: "Active Visitor Codes",
                  value: accessCodes.filter((c) => c.status === "active").length,
                  sub: "Real-Time Gate Sync",
                },
                {
                  title: "Visitors Currently Inside",
                  value: gateLogs.filter(
                    (l) => l.action === "entry_granted" && !l.exit_time
                  ).length,
                  sub: "Monitored by Gate Terminal",
                },
                {
                  title: "Rejected Gate Attempts",
                  value: gateLogs.filter((l) => l.action === "entry_rejected")
                    .length,
                  sub: "Expired / Invalid / Cancelled",
                },
              ].map((card, i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor: "#ffffff",
                    padding: "20px",
                    borderRadius: "14px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>
                    {card.title}
                  </div>
                  <div
                    style={{
                      fontSize: "32px",
                      fontWeight: 800,
                      margin: "8px 0 4px",
                      color: "#0f172a",
                    }}
                  >
                    {card.value}
                  </div>
                  <div style={{ fontSize: "12px", color: "#2563eb", fontWeight: 600 }}>
                    {card.sub}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                padding: "24px",
                borderRadius: "14px",
              }}
            >
              <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "14px" }}>
                Recent Gate Activity Log
              </h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      textAlign: "left",
                      fontSize: "13px",
                      color: "#475569",
                    }}
                  >
                    <th style={{ padding: "10px" }}>Code</th>
                    <th style={{ padding: "10px" }}>Visitor</th>
                    <th style={{ padding: "10px" }}>Authorising Resident</th>
                    <th style={{ padding: "10px" }}>Gate</th>
                    <th style={{ padding: "10px" }}>Status</th>
                    <th style={{ padding: "10px" }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {gateLogs.map((log) => (
                    <tr
                      key={log.id}
                      style={{ borderBottom: "1px solid #f1f5f9", fontSize: "14px" }}
                    >
                      <td style={{ padding: "12px 10px", fontWeight: 700 }}>
                        {log.code_entered}
                      </td>
                      <td style={{ padding: "12px 10px" }}>{log.visitor_name}</td>
                      <td style={{ padding: "12px 10px" }}>
                        {log.resident_name} ({log.unit_number})
                      </td>
                      <td style={{ padding: "12px 10px" }}>{log.gate_name}</td>
                      <td style={{ padding: "12px 10px", fontWeight: 700 }}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            backgroundColor:
                              log.action === "entry_rejected"
                                ? "#fee2e2"
                                : "#dcfce7",
                            color:
                              log.action === "entry_rejected"
                                ? "#b91c1c"
                                : "#15803d",
                          }}
                        >
                          {log.action.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "12px 10px" }}>{log.entry_time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* RESIDENTS MANAGEMENT */}
        {activeNav === "residents" && (
          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "24px",
              borderRadius: "14px",
            }}
          >
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
              Resident Accounts & Access Privilege Control
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #e2e8f0",
                    textAlign: "left",
                    fontSize: "13px",
                    color: "#475569",
                  }}
                >
                  <th style={{ padding: "10px" }}>Resident Name</th>
                  <th style={{ padding: "10px" }}>Estate ID</th>
                  <th style={{ padding: "10px" }}>Unit / Apartment</th>
                  <th style={{ padding: "10px" }}>Contact</th>
                  <th style={{ padding: "10px" }}>Status</th>
                  <th style={{ padding: "10px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {residents.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid #f1f5f9", fontSize: "14px" }}
                  >
                    <td style={{ padding: "12px 10px", fontWeight: 600 }}>
                      {r.full_name}
                    </td>
                    <td style={{ padding: "12px 10px" }}>{r.estate_id_number}</td>
                    <td style={{ padding: "12px 10px" }}>{r.unit_number}</td>
                    <td style={{ padding: "12px 10px" }}>
                      {r.email}
                      <br />
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        {r.phone}
                      </span>
                    </td>
                    <td style={{ padding: "12px 10px", fontWeight: 700 }}>
                      {r.status.toUpperCase()}
                    </td>
                    <td style={{ padding: "12px 10px" }}>
                      {r.status !== "active" && (
                        <button
                          onClick={() => updateResidentStatus(r.id, "active")}
                          style={{
                            backgroundColor: "#16a34a",
                            color: "#fff",
                            border: "none",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            marginRight: "6px",
                            fontSize: "12px",
                          }}
                        >
                          Approve / Activate
                        </button>
                      )}
                      {r.status === "active" && (
                        <button
                          onClick={() => updateResidentStatus(r.id, "suspended")}
                          style={{
                            backgroundColor: "#ea580c",
                            color: "#fff",
                            border: "none",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            marginRight: "6px",
                            fontSize: "12px",
                          }}
                        >
                          Suspend Privileges
                        </button>
                      )}
                      <button
                        onClick={() => updateResidentStatus(r.id, "deactivated")}
                        style={{
                          backgroundColor: "#dc2626",
                          color: "#fff",
                          border: "none",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                      >
                        Deactivate
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
            <div
              style={{
                backgroundColor: "#ffffff",
                padding: "20px",
                borderRadius: "14px",
                marginBottom: "20px",
              }}
            >
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>
                Add Residential Unit / Apartment
              </h3>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  placeholder="Unit Number (e.g. Block C - Apt 201)"
                  value={newUnitNumber}
                  onChange={(e) => setNewUnitNumber(e.target.value)}
                  style={{
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    flex: 1,
                  }}
                />
                <input
                  placeholder="Block / Precinct Name"
                  value={newUnitBlock}
                  onChange={(e) => setNewUnitBlock(e.target.value)}
                  style={{
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    flex: 1,
                  }}
                />
                <button
                  onClick={() => {
                    if (!newUnitNumber.trim()) return;
                    setUnits([
                      ...units,
                      {
                        id: Date.now(),
                        unit_number: newUnitNumber.trim(),
                        block_name: newUnitBlock.trim() || "General Block",
                        street_address: "Royal Palms Drive",
                        unit_type: "Apartment",
                        is_occupied: true,
                        access_suspended: false,
                      },
                    ]);
                    setNewUnitNumber("");
                    setNewUnitBlock("");
                  }}
                  style={{
                    backgroundColor: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    fontWeight: 700,
                  }}
                >
                  Add Unit
                </button>
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                padding: "24px",
                borderRadius: "14px",
              }}
            >
              <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
                Residential Units & Apartments Directory
              </h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      textAlign: "left",
                      fontSize: "13px",
                      color: "#475569",
                    }}
                  >
                    <th style={{ padding: "10px" }}>Unit Number</th>
                    <th style={{ padding: "10px" }}>Block</th>
                    <th style={{ padding: "10px" }}>Type</th>
                    <th style={{ padding: "10px" }}>Access Privilege</th>
                    <th style={{ padding: "10px" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => (
                    <tr
                      key={u.id}
                      style={{ borderBottom: "1px solid #f1f5f9", fontSize: "14px" }}
                    >
                      <td style={{ padding: "12px 10px", fontWeight: 700 }}>
                        {u.unit_number}
                      </td>
                      <td style={{ padding: "12px 10px" }}>{u.block_name}</td>
                      <td style={{ padding: "12px 10px" }}>{u.unit_type}</td>
                      <td style={{ padding: "12px 10px", fontWeight: 700 }}>
                        {u.access_suspended ? "SUSPENDED" : "ALLOWED"}
                      </td>
                      <td style={{ padding: "12px 10px" }}>
                        <button
                          onClick={() => toggleUnitSuspension(u.id)}
                          style={{
                            backgroundColor: u.access_suspended
                              ? "#16a34a"
                              : "#dc2626",
                            color: "#fff",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                          }}
                        >
                          {u.access_suspended
                            ? "Restore Unit Access"
                            : "Suspend Unit Access"}
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
          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "24px",
              borderRadius: "14px",
            }}
          >
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
              Monitor Active & Historical Visitor Access Codes
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #e2e8f0",
                    textAlign: "left",
                    fontSize: "13px",
                    color: "#475569",
                  }}
                >
                  <th style={{ padding: "10px" }}>Code</th>
                  <th style={{ padding: "10px" }}>Visitor</th>
                  <th style={{ padding: "10px" }}>Host Resident & Unit</th>
                  <th style={{ padding: "10px" }}>Type / Uses</th>
                  <th style={{ padding: "10px" }}>Valid Until</th>
                  <th style={{ padding: "10px" }}>Status</th>
                  <th style={{ padding: "10px" }}>Control</th>
                </tr>
              </thead>
              <tbody>
                {accessCodes.map((ac) => (
                  <tr
                    key={ac.id}
                    style={{ borderBottom: "1px solid #f1f5f9", fontSize: "14px" }}
                  >
                    <td style={{ padding: "12px 10px", fontWeight: 800 }}>
                      {ac.code}
                    </td>
                    <td style={{ padding: "12px 10px" }}>
                      {ac.visitor_name}
                      <br />
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        {ac.visitor_phone}
                      </span>
                    </td>
                    <td style={{ padding: "12px 10px" }}>
                      {ac.resident_name} ({ac.unit_number})
                    </td>
                    <td style={{ padding: "12px 10px" }}>
                      {ac.code_type} ({ac.use_count}/{ac.max_uses})
                    </td>
                    <td style={{ padding: "12px 10px" }}>{ac.valid_until}</td>
                    <td style={{ padding: "12px 10px", fontWeight: 700 }}>
                      {ac.status.toUpperCase()}
                    </td>
                    <td style={{ padding: "12px 10px" }}>
                      {ac.status === "active" && (
                        <button
                          onClick={() => revokeCode(ac.id)}
                          style={{
                            backgroundColor: "#dc2626",
                            color: "#fff",
                            border: "none",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            fontSize: "12px",
                          }}
                        >
                          Revoke Code
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* GATE REPORTS & SECURITY INVESTIGATIONS */}
        {activeNav === "reports" && (
          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "24px",
              borderRadius: "14px",
            }}
          >
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "14px" }}>
              Gate Activity Reports & Security Investigations
            </h2>
            <div
              style={{
                display: "flex",
                gap: "12px",
                marginBottom: "18px",
                alignItems: "center",
              }}
            >
              <input
                placeholder="Search visitor, access code, resident, unit, or vehicle plate..."
                value={investigationQuery}
                onChange={(e) => setInvestigationQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                }}
              />
              {(["all", "daily", "weekly", "monthly"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setReportPeriod(p)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor:
                      reportPeriod === p ? "#0f172a" : "#f8fafc",
                    color: reportPeriod === p ? "#ffffff" : "#0f172a",
                    fontWeight: 600,
                    fontSize: "13px",
                  }}
                >
                  {p.toUpperCase()} REPORT
                </button>
              ))}
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #e2e8f0",
                    textAlign: "left",
                    fontSize: "13px",
                    color: "#475569",
                  }}
                >
                  <th style={{ padding: "10px" }}>Code</th>
                  <th style={{ padding: "10px" }}>Visitor & Phone</th>
                  <th style={{ padding: "10px" }}>Host Resident & Unit</th>
                  <th style={{ padding: "10px" }}>Security Officer</th>
                  <th style={{ padding: "10px" }}>Vehicle</th>
                  <th style={{ padding: "10px" }}>Entry / Exit</th>
                  <th style={{ padding: "10px" }}>Decision</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((l) => (
                  <tr
                    key={l.id}
                    style={{ borderBottom: "1px solid #f1f5f9", fontSize: "14px" }}
                  >
                    <td style={{ padding: "12px 10px", fontWeight: 700 }}>
                      {l.code_entered}
                    </td>
                    <td style={{ padding: "12px 10px" }}>
                      {l.visitor_name} ({l.visitor_phone})
                    </td>
                    <td style={{ padding: "12px 10px" }}>
                      {l.resident_name} • {l.unit_number}
                    </td>
                    <td style={{ padding: "12px 10px" }}>
                      {l.security_officer_name} ({l.gate_name})
                    </td>
                    <td style={{ padding: "12px 10px" }}>{l.vehicle_plate}</td>
                    <td style={{ padding: "12px 10px" }}>
                      In: {l.entry_time}
                      {l.exit_time ? ` | Out: ${l.exit_time}` : ""}
                    </td>
                    <td style={{ padding: "12px 10px", fontWeight: 700 }}>
                      {l.action.toUpperCase()}
                      {l.rejection_reason ? ` (${l.rejection_reason})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* SECURITY PERSONNEL ACCOUNTS */}
        {activeNav === "security" && (
          <div>
            <div
              style={{
                backgroundColor: "#ffffff",
                padding: "20px",
                borderRadius: "14px",
                marginBottom: "20px",
              }}
            >
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>
                Register Security Personnel Account
              </h3>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  placeholder="Officer Full Name"
                  value={newOfficerName}
                  onChange={(e) => setNewOfficerName(e.target.value)}
                  style={{
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    flex: 1,
                  }}
                />
                <input
                  placeholder="Telephone Number"
                  value={newOfficerPhone}
                  onChange={(e) => setNewOfficerPhone(e.target.value)}
                  style={{
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    flex: 1,
                  }}
                />
                <input
                  placeholder="Assigned Gate"
                  value={newOfficerGate}
                  onChange={(e) => setNewOfficerGate(e.target.value)}
                  style={{
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    flex: 1,
                  }}
                />
                <button
                  onClick={() => {
                    if (!newOfficerName.trim()) return;
                    setSecurityOfficers([
                      ...securityOfficers,
                      {
                        id: Date.now(),
                        full_name: newOfficerName.trim(),
                        email: `${newOfficerName
                          .toLowerCase()
                          .replace(/\s+/g, ".")}@royalpalmsestate.com`,
                        phone: newOfficerPhone.trim() || "+2348020000099",
                        badge_id: `EST-SEC-00${securityOfficers.length + 1}`,
                        assigned_gate: newOfficerGate,
                        status: "active",
                      },
                    ]);
                    setNewOfficerName("");
                    setNewOfficerPhone("");
                  }}
                  style={{
                    backgroundColor: "#2563eb",
                    color: "#fff",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    fontWeight: 700,
                  }}
                >
                  Create Officer
                </button>
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                padding: "24px",
                borderRadius: "14px",
              }}
            >
              <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
                Estate Security Personnel Roster
              </h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      textAlign: "left",
                      fontSize: "13px",
                      color: "#475569",
                    }}
                  >
                    <th style={{ padding: "10px" }}>Badge ID</th>
                    <th style={{ padding: "10px" }}>Officer Name</th>
                    <th style={{ padding: "10px" }}>Assigned Gate</th>
                    <th style={{ padding: "10px" }}>Contact</th>
                    <th style={{ padding: "10px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {securityOfficers.map((o) => (
                    <tr
                      key={o.id}
                      style={{ borderBottom: "1px solid #f1f5f9", fontSize: "14px" }}
                    >
                      <td style={{ padding: "12px 10px", fontWeight: 700 }}>
                        {o.badge_id}
                      </td>
                      <td style={{ padding: "12px 10px" }}>{o.full_name}</td>
                      <td style={{ padding: "12px 10px" }}>{o.assigned_gate}</td>
                      <td style={{ padding: "12px 10px" }}>
                        {o.email} • {o.phone}
                      </td>
                      <td style={{ padding: "12px 10px", fontWeight: 700 }}>
                        {o.status.toUpperCase()}
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
