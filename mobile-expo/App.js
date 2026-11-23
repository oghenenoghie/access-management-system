import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Share,
  Linking,
  Alert,
  StatusBar,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { apiClient } from "./src/api/client";

// Demo mode pre-fills the demo resident's sign-in, shows sample passes and
// alerts, and falls back to built-in data when the server can't be reached.
// On in development (Expo Go), off in release builds; override with
// EXPO_PUBLIC_DEMO_MODE=true|false.
const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE
  ? process.env.EXPO_PUBLIC_DEMO_MODE === "true"
  : __DEV__;

// How often to refresh passes, history and alerts while the app is open.
const REFRESH_INTERVAL_MS = 30000;

// The pass QR the visitor shows at the gate. Dark-on-white with a quiet zone,
// so the gate app's camera can read it even on a dark card.
function PassQr({ value }) {
  if (!value) return null;
  return (
    <View style={styles.passQrBox}>
      <QRCode value={value} size={180} color="#000000" backgroundColor="#FFFFFF" quietZone={8} />
    </View>
  );
}

// SafeAreaView from react-native-safe-area-context needs a SafeAreaProvider
// above it to measure the status bar, notch and navigation bar insets.
export default function App() {
  return (
    <SafeAreaProvider>
      <ResidentApp />
    </SafeAreaProvider>
  );
}

function ResidentApp() {
  // Auth state: "login" | "register" | "recovery" | "reset" | "authenticated"
  const [authView, setAuthView] = useState("login");
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("generate"); // generate | codes | history | notifications | profile
  const [refreshing, setRefreshing] = useState(false);

  // Login / Register inputs
  const [identifier, setIdentifier] = useState(DEMO_MODE ? "adewale.banjo@example.com" : "");
  const [password, setPassword] = useState(DEMO_MODE ? "Resident@123" : "");
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwRepeat, setPwRepeat] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regEstateId, setRegEstateId] = useState("EST-2026-");
  const [regUnit, setRegUnit] = useState("Block A - Apt 104");
  const [regPassword, setRegPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");

  // Visitor Code Generation inputs
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [purpose, setPurpose] = useState("Personal Visit");
  const [codeType, setCodeType] = useState("one_time"); // one_time | temporary
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().slice(0, 10));
  const [validHours, setValidHours] = useState("12");
  const [maxUses, setMaxUses] = useState("1");

  // Resident data lists
  const [accessCodes, setAccessCodes] = useState(DEMO_MODE ? [
    {
      id: 101,
      code: "482910",
      qr_payload: "ESTATE-PASS|CODE:482910|UNIT:1|SIG:A9F03C1E8B12",
      visitor_name: "Michael Oluwaseun",
      visitor_phone: "+2348091234567",
      vehicle_plate: "LSR-482-KJ",
      purpose: "Personal Visit",
      code_type: "one_time",
      arrival_date: "2026-11-15",
      valid_until: "2026-11-15 19:30",
      max_uses: 1,
      use_count: 0,
      status: "active",
    },
    {
      id: 102,
      code: "510293",
      qr_payload: "ESTATE-PASS|CODE:510293|UNIT:1|SIG:C2E41F8B9A11",
      visitor_name: "DHL Express Courier",
      visitor_phone: "+2348050009999",
      vehicle_plate: "KJA-112-AA",
      purpose: "Delivery",
      code_type: "one_time",
      arrival_date: "2026-11-15",
      valid_until: "2026-11-15 14:00",
      max_uses: 1,
      use_count: 1,
      status: "used",
    },
  ] : []);

  const [historyLogs, setHistoryLogs] = useState(DEMO_MODE ? [
    {
      id: 1,
      code_entered: "510293",
      visitor_name: "DHL Express Courier",
      action: "exit_recorded",
      gate_name: "Main North Gate",
      entry_time: "2026-11-15 09:30",
      exit_time: "2026-11-15 09:55",
    },
    {
      id: 2,
      code_entered: "194822",
      visitor_name: "Grace Adebayo",
      action: "entry_rejected",
      rejection_reason: "Code expired",
      gate_name: "South Service Gate",
      entry_time: "2026-11-15 08:15",
    },
  ] : []);

  const [notifications, setNotifications] = useState(DEMO_MODE ? [
    {
      id: 1,
      title: "Visitor Admitted at Gate",
      message: "DHL Express Courier was verified and admitted at Main North Gate using code 510293.",
      event_type: "visitor_admitted",
      created_at: "Today, 09:30 AM",
      is_read: false,
    },
    {
      id: 2,
      title: "Expired Visitor Code Presented",
      message: "Visitor Grace Adebayo presented expired code 194822 at South Service Gate. Entry was denied.",
      event_type: "code_expired",
      created_at: "Today, 08:15 AM",
      is_read: false,
    },
  ] : []);

  const [generatedPassModal, setGeneratedPassModal] = useState(null);
  const [qrShownForId, setQrShownForId] = useState(null);

  const handleLogin = async () => {
    try {
      const res = await apiClient.login(identifier, password);
      apiClient.setToken(res.access_token);
      setUser(res.user);
      setAuthView("authenticated");
      refreshResidentData();
    } catch (err) {
      apiClient.setToken(null);
      if (err.status) {
        // The server answered and refused (wrong password, pending or suspended
        // account, too many attempts): don't let them in on demo data.
        Alert.alert("Sign-in failed", err.message);
        return;
      }
      if (!DEMO_MODE) {
        Alert.alert("Can't reach the server", `${err.message} Check your internet connection and try again.`);
        return;
      }
      // Demo builds only: fall back to the seeded demo resident
      Alert.alert(
        "Offline demo mode",
        `Sign-in through ${apiClient.baseUrl} failed (${err.message}). ` +
          "Showing built-in demo data. Passes you create now won't reach the gate app."
      );
      setUser({
        id: 4,
        full_name: "Engr. Adewale Banjo",
        email: identifier,
        phone: "+2348031112222",
        estate_id_number: "EST-2026-101",
        unit: { unit_number: "Block A - Apt 101", block_name: "Block A (Hibiscus)" },
      });
      setAuthView("authenticated");
    }
  };

  const handleRegister = async () => {
    if (!regEstateId.toUpperCase().startsWith("EST-")) {
      Alert.alert("Invalid Estate ID", "Estate-approved identification number must begin with EST-");
      return;
    }
    if (regPassword.length < 8) {
      Alert.alert("Choose a password", "Your password must be at least 8 characters.");
      return;
    }
    try {
      await apiClient.registerResident({
        full_name: regName,
        email: regEmail,
        phone: regPhone,
        password: regPassword,
        estate_id_number: regEstateId,
        unit_number: regUnit,
      });
      Alert.alert(
        "Registration received",
        "Estate Management will review your account. You can sign in once it's approved."
      );
      setRegPassword("");
      setAuthView("login");
    } catch (err) {
      // Stay on the form so the details can be corrected.
      Alert.alert("Registration failed", err.message);
    }
  };

  const handleRequestRecovery = async () => {
    const email = recoveryEmail.trim();
    if (!email) {
      Alert.alert("Enter your email", "Type the email address you registered with.");
      return;
    }
    try {
      const res = await apiClient.requestPasswordRecovery(email);
      // The server gives the same answer whether or not the email is registered.
      Alert.alert("Check your email", res.message);
      setResetCode("");
      setAuthView("reset");
    } catch (err) {
      Alert.alert("Couldn't request a code", err.message);
    }
  };

  const handleResetPassword = async () => {
    const email = recoveryEmail.trim();
    if (!email || resetCode.trim().length !== 6) {
      Alert.alert("Missing details", "Enter your email and the 6-digit code you received.");
      return;
    }
    if (resetPassword.length < 8) {
      Alert.alert("Choose a password", "Your new password must be at least 8 characters.");
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      Alert.alert("Passwords don't match", "Type the same new password in both boxes.");
      return;
    }
    try {
      await apiClient.resetPassword(email, resetCode.trim(), resetPassword);
      Alert.alert("Password changed", "You can now sign in with your new password.");
      setIdentifier(email);
      setPassword("");
      setResetCode("");
      setResetPassword("");
      setResetPasswordConfirm("");
      setAuthView("login");
    } catch (err) {
      Alert.alert("Couldn't reset the password", err.message);
    }
  };

  const handleChangePassword = async () => {
    if (!apiClient.token) {
      Alert.alert("Not available offline", "Connect to the estate server to change your password.");
      return;
    }
    if (pwNew.length < 8) {
      Alert.alert("Choose a password", "Your new password must be at least 8 characters.");
      return;
    }
    if (pwNew !== pwRepeat) {
      Alert.alert("Passwords don't match", "Type the same new password in both boxes.");
      return;
    }
    try {
      await apiClient.changePassword(pwCurrent, pwNew);
      setPwCurrent("");
      setPwNew("");
      setPwRepeat("");
      setActiveTab("generate");
      Alert.alert("Password changed", "Use your new password next time you sign in.");
    } catch (err) {
      if (err.status === 401) {
        signOut("Your session has ended. Please sign in again.");
        return;
      }
      Alert.alert("Couldn't change the password", err.message);
    }
  };

  // Clears everything from the previous session so the next person signing
  // in on this phone never sees it.
  const signOut = (message) => {
    apiClient.setToken(null);
    setUser(null);
    setAccessCodes([]);
    setHistoryLogs([]);
    setNotifications([]);
    setGeneratedPassModal(null);
    setQrShownForId(null);
    setAuthView("login");
    if (message) Alert.alert("Signed out", message);
  };

  const refreshResidentData = async () => {
    if (!apiClient.token) return; // offline demo: keep the local lists
    try {
      const [codes, hist, notifs] = await Promise.all([
        apiClient.listAccessCodes(),
        apiClient.getVisitorHistory(),
        apiClient.getNotifications(),
      ]);
      setAccessCodes(codes);
      setHistoryLogs(hist);
      setNotifications(notifs);
    } catch (err) {
      if (err.status === 401) {
        signOut("Your session has ended. Please sign in again.");
      } else if (err.status === 403) {
        signOut(err.message); // e.g. the account was suspended
      }
      // Network blips: keep showing the last data; the next refresh retries.
    }
  };

  // Keep passes, visitor history and alerts current while signed in.
  useEffect(() => {
    if (authView !== "authenticated" || !apiClient.token) return undefined;
    const timer = setInterval(() => {
      refreshResidentData();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [authView]);

  const onPullToRefresh = async () => {
    setRefreshing(true);
    await refreshResidentData();
    setRefreshing(false);
  };

  const handleGenerateCode = async () => {
    if (!visitorName.trim() || !visitorPhone.trim()) {
      Alert.alert("Missing Fields", "Please enter the visitor's full name and telephone number.");
      return;
    }

    const payload = {
      visitor_name: visitorName.trim(),
      visitor_phone: visitorPhone.trim(),
      vehicle_plate: vehiclePlate.trim() || null,
      purpose,
      code_type: codeType,
      arrival_date: arrivalDate,
      valid_hours: parseInt(validHours, 10) || 12,
      max_uses: codeType === "one_time" ? 1 : parseInt(maxUses, 10) || 3,
    };

    try {
      const created = await apiClient.createAccessCode(payload);
      setAccessCodes([created, ...accessCodes]);
      setGeneratedPassModal(created);
    } catch (err) {
      if (apiClient.token) {
        // Signed in through the server: never invent a code the gate can't verify.
        // Keep the form filled in so the resident can correct it and retry.
        Alert.alert("Pass not created", err.message);
        return;
      }
      // Offline demo mode only: make a local pass that exists on this phone alone.
      const randomCode = String(Math.floor(100000 + Math.random() * 900000));
      const fallbackCode = {
        id: Date.now(),
        code: randomCode,
        qr_payload: `ESTATE-PASS|CODE:${randomCode}|UNIT:1|SIG:DEMO99`,
        visitor_name: payload.visitor_name,
        visitor_phone: payload.visitor_phone,
        vehicle_plate: payload.vehicle_plate,
        purpose: payload.purpose,
        code_type: payload.code_type,
        arrival_date: payload.arrival_date,
        valid_until: `${payload.arrival_date} (+${payload.valid_hours}h)`,
        max_uses: payload.max_uses,
        use_count: 0,
        status: "active",
      };
      setAccessCodes([fallbackCode, ...accessCodes]);
      setGeneratedPassModal(fallbackCode);
    }

    setVisitorName("");
    setVisitorPhone("");
    setVehiclePlate("");
  };

  const handleShareWhatsApp = (ac) => {
    const message =
      `🏛️ *ROYAL PALMS ESTATE VISITOR PASS*\n\n` +
      `Hello ${ac.visitor_name},\n` +
      `You have been authorised by *${user?.full_name || "Resident"}* (${user?.unit?.unit_number || "Block A - Apt 101"}).\n\n` +
      `🔑 *Access Code:* ${ac.code}\n` +
      `📅 *Arrival Date:* ${ac.arrival_date}\n` +
      `⏱️ *Valid Until:* ${ac.valid_until}\n` +
      `🎫 *Pass Type:* ${ac.code_type === "one_time" ? "One-Time Entry" : `Temporary (${ac.max_uses} uses)`}\n\n` +
      `Please present this code or QR pass to Security at the Estate Gate.`;

    const url = `whatsapp://send?phone=${ac.visitor_phone.replace(/[^0-9+]/g, "")}&text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Share.share({ message });
    });
  };

  const handleShareSMS = (ac) => {
    const body = `Royal Palms Estate Pass: Your visitor access code is ${ac.code} (Valid until ${ac.valid_until}). Host: ${user?.full_name}, ${user?.unit?.unit_number}.`;
    Linking.openURL(`sms:${ac.visitor_phone}?body=${encodeURIComponent(body)}`).catch(() => {
      Share.share({ message: body });
    });
  };

  const handleCancelCode = async (codeObj) => {
    try {
      await apiClient.cancelAccessCode(codeObj.id);
    } catch (err) {
      if (apiClient.token) {
        // Signed in through the server: the code is still valid at the gate.
        Alert.alert("Code NOT cancelled", err.message);
        return;
      }
      // Offline demo mode: update this phone's list only.
    }
    setAccessCodes((prev) =>
      prev.map((item) => (item.id === codeObj.id ? { ...item, status: "cancelled" } : item))
    );
    Alert.alert("Code Cancelled", `Access code ${codeObj.code} for ${codeObj.visitor_name} has been deactivated.`);
  };

  if (authView !== "authenticated") {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar barStyle="light-content" />
        <View style={styles.authCard}>
          <Text style={styles.brandBadge}>ROYAL PALMS ESTATE</Text>
          <Text style={styles.authTitle}>
            {authView === "login"
              ? "Resident Mobile Portal"
              : authView === "register"
              ? "Resident Registration"
              : "Password Recovery"}
          </Text>

          {authView === "login" && (
            <>
              <Text style={styles.inputLabel}>Email or Telephone</Text>
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="email@example.com"
                autoCapitalize="none"
              />
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
                <Text style={styles.primaryBtnText}>Sign In to Resident Portal</Text>
              </TouchableOpacity>

              <View style={styles.authLinksRow}>
                <TouchableOpacity onPress={() => setAuthView("register")}>
                  <Text style={styles.linkText}>Register with Estate ID</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAuthView("recovery")}>
                  <Text style={styles.linkText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {authView === "register" && (
            <>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput style={styles.input} value={regName} onChangeText={setRegName} placeholder="Engr. John Doe" />
              <Text style={styles.inputLabel}>Estate-Approved ID Number</Text>
              <TextInput
                style={styles.input}
                value={regEstateId}
                onChangeText={setRegEstateId}
                placeholder="EST-2026-105"
                autoCapitalize="characters"
              />
              <Text style={styles.inputLabel}>Apartment / Unit Number</Text>
              <TextInput style={styles.input} value={regUnit} onChangeText={setRegUnit} placeholder="Block A - Apt 104" />
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput style={styles.input} value={regEmail} onChangeText={setRegEmail} autoCapitalize="none" />
              <Text style={styles.inputLabel}>Telephone Number</Text>
              <TextInput style={styles.input} value={regPhone} onChangeText={setRegPhone} keyboardType="phone-pad" />
              <Text style={styles.inputLabel}>Password (at least 8 characters)</Text>
              <TextInput
                style={styles.input}
                value={regPassword}
                onChangeText={setRegPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password-new"
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={handleRegister}>
                <Text style={styles.primaryBtnText}>Complete Resident Registration</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuthView("login")} style={{ marginTop: 12 }}>
                <Text style={styles.linkText}>Back to Login</Text>
              </TouchableOpacity>
            </>
          )}

          {authView === "recovery" && (
            <>
              <Text style={styles.inputLabel}>Registered Email Address</Text>
              <TextInput
                style={styles.input}
                value={recoveryEmail}
                onChangeText={setRecoveryEmail}
                placeholder="resident@example.com"
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={handleRequestRecovery}>
                <Text style={styles.primaryBtnText}>Send Recovery Code</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuthView("reset")} style={{ marginTop: 12 }}>
                <Text style={styles.linkText}>I already have a code</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuthView("login")} style={{ marginTop: 12 }}>
                <Text style={styles.linkText}>Back to Login</Text>
              </TouchableOpacity>
            </>
          )}

          {authView === "reset" && (
            <>
              <Text style={styles.inputLabel}>Registered Email Address</Text>
              <TextInput
                style={styles.input}
                value={recoveryEmail}
                onChangeText={setRecoveryEmail}
                placeholder="resident@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.inputLabel}>6-Digit Recovery Code</Text>
              <TextInput
                style={styles.input}
                value={resetCode}
                onChangeText={setResetCode}
                keyboardType="number-pad"
                maxLength={6}
              />
              <Text style={styles.inputLabel}>New Password (at least 8 characters)</Text>
              <TextInput
                style={styles.input}
                value={resetPassword}
                onChangeText={setResetPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password-new"
              />
              <Text style={styles.inputLabel}>Repeat New Password</Text>
              <TextInput
                style={styles.input}
                value={resetPasswordConfirm}
                onChangeText={setResetPasswordConfirm}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password-new"
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={handleResetPassword}>
                <Text style={styles.primaryBtnText}>Set New Password</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuthView("recovery")} style={{ marginTop: 12 }}>
                <Text style={styles.linkText}>Send a new code</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuthView("login")} style={{ marginTop: 12 }}>
                <Text style={styles.linkText}>Back to Login</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>{user?.unit?.unit_number || ""}</Text>
          <Text style={styles.headerTitle}>{user?.full_name}</Text>
        </View>
        <View style={{ flexDirection: "row" }}>
          <TouchableOpacity
            style={[styles.logoutBtn, { marginRight: 8 }]}
            onPress={() => setActiveTab("password")}
          >
            <Text style={styles.logoutText}>Password</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={() => signOut()}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullToRefresh} />}
      >
        {/* Generated Pass Banner */}
        {generatedPassModal && (
          <View style={styles.passCard}>
            <Text style={styles.passHeader}>NEW VISITOR ACCESS PASS GENERATED</Text>
            <Text style={styles.passCode}>{generatedPassModal.code}</Text>
            <PassQr value={generatedPassModal.qr_payload} />
            <Text style={styles.passDetail}>Visitor: {generatedPassModal.visitor_name}</Text>
            <Text style={styles.passDetail}>
              Type: {generatedPassModal.code_type === "one_time" ? "One-Time Entry" : `Temporary (${generatedPassModal.max_uses} uses)`}
            </Text>
            <View style={styles.shareRow}>
              <TouchableOpacity style={styles.whatsappBtn} onPress={() => handleShareWhatsApp(generatedPassModal)}>
                <Text style={styles.shareBtnText}>Share via WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smsBtn} onPress={() => handleShareSMS(generatedPassModal)}>
                <Text style={styles.shareBtnText}>Share via SMS</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setGeneratedPassModal(null)} style={{ marginTop: 10 }}>
              <Text style={{ color: "#94A3B8", textAlign: "center" }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB 1: GENERATE VISITOR CODE */}
        {activeTab === "generate" && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Generate Visitor Access Code</Text>
            <Text style={styles.inputLabel}>Visitor Full Name *</Text>
            <TextInput
              style={styles.input}
              value={visitorName}
              onChangeText={setVisitorName}
              placeholder="e.g. Michael Oluwaseun"
            />

            <Text style={styles.inputLabel}>Visitor Telephone Number *</Text>
            <TextInput
              style={styles.input}
              value={visitorPhone}
              onChangeText={setVisitorPhone}
              placeholder="+2348091234567"
              keyboardType="phone-pad"
            />

            <Text style={styles.inputLabel}>Vehicle Plate Number (Optional)</Text>
            <TextInput
              style={styles.input}
              value={vehiclePlate}
              onChangeText={setVehiclePlate}
              placeholder="LSR-482-KJ"
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>Arrival Date (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={arrivalDate} onChangeText={setArrivalDate} />

            <Text style={styles.inputLabel}>Access Code Type</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleOption, codeType === "one_time" && styles.toggleOptionActive]}
                onPress={() => setCodeType("one_time")}
              >
                <Text style={[styles.toggleText, codeType === "one_time" && styles.toggleTextActive]}>
                  One-Time Code (1 Use)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleOption, codeType === "temporary" && styles.toggleOptionActive]}
                onPress={() => setCodeType("temporary")}
              >
                <Text style={[styles.toggleText, codeType === "temporary" && styles.toggleTextActive]}>
                  Temporary Multi-Use
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.rowInputs}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.inputLabel}>Validity Period (Hours)</Text>
                <TextInput
                  style={styles.input}
                  value={validHours}
                  onChangeText={setValidHours}
                  keyboardType="numeric"
                />
              </View>
              {codeType === "temporary" && (
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Max Allowed Entries</Text>
                  <TextInput style={styles.input} value={maxUses} onChangeText={setMaxUses} keyboardType="numeric" />
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleGenerateCode}>
              <Text style={styles.primaryBtnText}>Generate Unique Access Code & QR</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB 2: MANAGE MY ACCESS CODES */}
        {activeTab === "codes" && (
          <View>
            <Text style={styles.sectionTitle}>My Visitor Access Codes</Text>
            {accessCodes.map((ac) => (
              <View key={ac.id} style={styles.listItemCard}>
                <View style={styles.listHeader}>
                  <Text style={styles.codeBadge}>{ac.code}</Text>
                  <Text
                    style={[
                      styles.statusPill,
                      ac.status === "active"
                        ? styles.statusActive
                        : ac.status === "used"
                        ? styles.statusUsed
                        : styles.statusRejected,
                    ]}
                  >
                    {ac.status.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.itemTitle}>{ac.visitor_name}</Text>
                <Text style={styles.itemSub}>
                  📞 {ac.visitor_phone} • {ac.code_type === "one_time" ? "One-Time" : `Temp (${ac.use_count}/${ac.max_uses})`}
                </Text>
                <Text style={styles.itemSub}>Valid Until: {ac.valid_until}</Text>

                {ac.status === "active" && qrShownForId === ac.id && <PassQr value={ac.qr_payload} />}

                {ac.status === "active" && (
                  <View style={styles.actionRow}>
                    {ac.qr_payload ? (
                      <TouchableOpacity
                        style={styles.smallQrBtn}
                        onPress={() => setQrShownForId(qrShownForId === ac.id ? null : ac.id)}
                      >
                        <Text style={styles.smallBtnText}>{qrShownForId === ac.id ? "Hide QR" : "Show QR"}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={styles.smallShareBtn} onPress={() => handleShareWhatsApp(ac)}>
                      <Text style={styles.smallBtnText}>WhatsApp</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallSmsBtn} onPress={() => handleShareSMS(ac)}>
                      <Text style={styles.smallBtnText}>SMS</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancelCode(ac)}>
                      <Text style={styles.cancelBtnText}>Deactivate / Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* TAB 3: VISITOR ENTRY HISTORY */}
        {activeTab === "history" && (
          <View>
            <Text style={styles.sectionTitle}>Visitor Entry & Exit History</Text>
            {historyLogs.map((log) => (
              <View key={log.id} style={styles.listItemCard}>
                <View style={styles.listHeader}>
                  <Text style={styles.itemTitle}>{log.visitor_name}</Text>
                  <Text
                    style={[
                      styles.statusPill,
                      log.action === "entry_rejected" ? styles.statusRejected : styles.statusActive,
                    ]}
                  >
                    {log.action.replace("_", " ").toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.itemSub}>Code: {log.code_entered} • Gate: {log.gate_name}</Text>
                {log.entry_time && <Text style={styles.itemSub}>Entry: {log.entry_time}</Text>}
                {log.exit_time && <Text style={styles.itemSub}>Exit: {log.exit_time}</Text>}
                {log.rejection_reason && (
                  <Text style={{ color: "#DC2626", marginTop: 4, fontWeight: "600" }}>
                    Reason: {log.rejection_reason}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* TAB 4: REAL-TIME NOTIFICATIONS */}
        {/* CHANGE PASSWORD (opened from the header) */}
        {activeTab === "password" && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Change Password</Text>
            <Text style={styles.inputLabel}>Current Password</Text>
            <TextInput
              style={styles.input}
              value={pwCurrent}
              onChangeText={setPwCurrent}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />
            <Text style={styles.inputLabel}>New Password (at least 8 characters)</Text>
            <TextInput
              style={styles.input}
              value={pwNew}
              onChangeText={setPwNew}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
            />
            <Text style={styles.inputLabel}>Repeat New Password</Text>
            <TextInput
              style={styles.input}
              value={pwRepeat}
              onChangeText={setPwRepeat}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleChangePassword}>
              <Text style={styles.primaryBtnText}>Change Password</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveTab("generate")} style={{ marginTop: 12 }}>
              <Text style={styles.linkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === "notifications" && (
          <View>
            <Text style={styles.sectionTitle}>Gate & Access Notifications</Text>
            {notifications.map((n) => (
              <View key={n.id} style={styles.listItemCard}>
                <Text style={styles.itemTitle}>{n.title}</Text>
                <Text style={[styles.itemSub, { marginVertical: 4, color: "#334155" }]}>{n.message}</Text>
                <Text style={{ fontSize: 11, color: "#64748B" }}>{n.created_at}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom Tab Navigation */}
      <View style={styles.tabBar}>
        {[
          { key: "generate", label: "New Code" },
          { key: "codes", label: "My Codes" },
          { key: "history", label: "History" },
          { key: "notifications", label: `Alerts (${notifications.length})` },
        ].map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, activeTab === t.key && styles.tabItemActive]}
            onPress={() => {
              setActiveTab(t.key);
              refreshResidentData();
            }}
          >
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  authContainer: { flex: 1, backgroundColor: "#0F172A", justifyContent: "center", padding: 20 },
  authCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 24 },
  brandBadge: { color: "#2563EB", fontWeight: "800", fontSize: 12, letterSpacing: 1.2, marginBottom: 4 },
  authTitle: { fontSize: 22, fontWeight: "700", color: "#0F172A", marginBottom: 16 },
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  header: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerSubtitle: { color: "#38BDF8", fontSize: 12, fontWeight: "600" },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  logoutBtn: { backgroundColor: "#1E293B", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  logoutText: { color: "#F8FAFC", fontSize: 12 },
  content: { flex: 1, padding: 16 },
  sectionCard: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 18, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A", marginBottom: 12 },
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#F8FAFC",
  },
  toggleRow: { flexDirection: "row", marginTop: 6, marginBottom: 8 },
  toggleOption: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    alignItems: "center",
    marginRight: 6,
  },
  toggleOptionActive: { backgroundColor: "#EFF6FF", borderColor: "#2563EB" },
  toggleText: { color: "#64748B", fontWeight: "600", fontSize: 13 },
  toggleTextActive: { color: "#1D4ED8" },
  rowInputs: { flexDirection: "row", marginBottom: 8 },
  primaryBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 18,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  authLinksRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  linkText: { color: "#2563EB", fontWeight: "600", fontSize: 13 },
  passCard: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    alignItems: "center",
  },
  passHeader: { color: "#38BDF8", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  passCode: { color: "#FFFFFF", fontSize: 36, fontWeight: "900", letterSpacing: 6, marginVertical: 8 },
  passQrBox: {
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    padding: 4,
    borderRadius: 8,
    marginVertical: 10,
  },
  passDetail: { color: "#CBD5E1", fontSize: 13, marginBottom: 2 },
  shareRow: { flexDirection: "row", marginTop: 12 },
  whatsappBtn: {
    backgroundColor: "#16A34A",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 8,
  },
  smsBtn: { backgroundColor: "#0284C7", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  shareBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  listItemCard: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, marginBottom: 12 },
  listHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  codeBadge: { fontSize: 20, fontWeight: "800", color: "#0F172A", letterSpacing: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontSize: 11, fontWeight: "700" },
  statusActive: { backgroundColor: "#DCFCE7", color: "#15803D" },
  statusUsed: { backgroundColor: "#E0E7FF", color: "#1D4ED8" },
  statusRejected: { backgroundColor: "#FEE2E2", color: "#B91C1C" },
  itemTitle: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  itemSub: { fontSize: 13, color: "#64748B", marginTop: 2 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", rowGap: 8, marginTop: 12 },
  smallQrBtn: { backgroundColor: "#0F172A", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, marginRight: 8 },
  smallShareBtn: { backgroundColor: "#16A34A", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, marginRight: 8 },
  smallSmsBtn: { backgroundColor: "#0284C7", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, marginRight: 8 },
  smallBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  cancelBtn: { backgroundColor: "#FEE2E2", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 },
  cancelBtnText: { color: "#B91C1C", fontSize: 12, fontWeight: "700" },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingVertical: 10,
  },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 6 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: "#2563EB" },
  tabLabel: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  tabLabelActive: { color: "#2563EB", fontWeight: "700" },
});
