# Estate Gate Access System — User Manuals, Deployment Guide & Technical Documentation

## 1. System Architecture Overview

The **Estate Gate Access System** is a multi-tier platform comprising four integrated components:

1. **Centralised Cloud Backend (`backend/`) — Python & FastAPI**:
   - Provides RESTful APIs for authentication, resident registration with Estate ID verification, unique 6-digit & QR visitor code generation, real-time gate verification, visitor entry/exit logging, push notifications, and administrative reporting.
   - Enforces configurable validity windows and automatic single-use invalidation for one-time codes.
2. **Residents' Mobile Application (`mobile-expo/`) — React Native (Expo)**:
   - Enables residents to register using Estate-approved identification numbers (`EST-XXXX`), manage their profile, generate one-time or temporary visitor codes with QR passes, share passes via WhatsApp or SMS, cancel active codes, view visitor entry/exit history, and receive real-time gate notifications.
3. **Security Personnel Gate Interface (`mobile-flutter/`) — Flutter Android App**:
   - Deployed on Android smartphones or tablets at the estate gates.
   - Allows security officers to enter or scan a visitor's QR/access code, verify authenticity in real time, confirm the authorising resident and apartment unit, reject expired/cancelled/used codes, and record arrival and departure timestamps.
4. **Estate Management Administration Dashboard (`admin-dashboard/`) — Next.js Web Portal**:
   - Enables Estate Management to approve/suspend/deactivate residents, manage residential units and apartments, monitor active access codes, run security investigations, generate daily/weekly/monthly gate activity reports, and manage security officers.

---

## 2. User Manuals

### A. Resident Mobile Application Manual
1. **Registration & Login**:
   - Open the Royal Palms Estate Resident App.
   - Tap **Register with Estate ID** and enter your full name, apartment/unit number, email, phone number, and your Estate-approved Identification Number (e.g., `EST-2026-101`).
   - Sign in using your registered email/phone and password.
2. **Generating & Sharing a Visitor Access Code**:
   - Navigate to the **New Code** tab.
   - Enter the visitor's full name, phone number, arrival date, optional vehicle plate, and select **One-Time Code (1 Use)** or **Temporary Multi-Use**.
   - Set the validity period (in hours) and tap **Generate Unique Access Code & QR**.
   - Tap **Share via WhatsApp** or **Share via SMS** to send the code and QR pass directly to your visitor.
3. **Cancelling a Code**:
   - Open **My Codes**, locate any `ACTIVE` code, and tap **Deactivate / Cancel** to immediately block gate access.

### B. Security Personnel Gate Terminal Manual
1. **Signing In at the Gate**:
   - Open the Flutter Android Gate Security App on the gate tablet/smartphone and sign in with your Officer badge email and password.
2. **Verifying a Visitor Code or QR Pass**:
   - Enter the 6-digit access code presented by the visitor or tap **Scan QR Pass**.
   - The terminal displays a colour-coded status banner:
     - **GREEN (`VALID`)**: Displays the visitor's name, authorising resident, and unit number. Tap **GRANT ENTRY & LOG ARRIVAL TIME** to admit the visitor. One-time codes are automatically marked `USED` immediately upon entry.
     - **RED (`EXPIRED` / `CANCELLED` / `ALREADY_USED` / `INVALID`)**: Entry must be denied. The rejection attempt is automatically logged and the resident is notified.
3. **Recording Visitor Exit**:
   - Open the **Inside Estate** tab, locate the departing visitor, and tap **Log Exit** to record the exact exit timestamp.

### C. Estate Management Administrator Manual
1. **Approving or Suspending Residents**:
   - Open the Next.js Admin Dashboard and select **Resident Accounts**.
   - Click **Approve / Activate** for newly registered residents, or **Suspend Privileges** / **Deactivate** to immediately revoke a resident's ability to generate codes and cancel their active passes.
2. **Managing Units & Apartments**:
   - Navigate to **Units & Apartments** to add new blocks/apartments or temporarily suspend visitor access for a specific unit.
3. **Reports & Security Investigations**:
   - Select **Gate Reports & Investigations**, filter by **Daily**, **Weekly**, or **Monthly** reports, or search by visitor name, phone number, vehicle plate, resident name, or access code.

---

## 3. Google Play Store Publication & Deployment Guide

1. **Flutter Android Gate App (`mobile-flutter/`)**:
   - Generate an upload keystore:
     ```bash
     keytool -genkey -v -keystore estate-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias estate-gate
     ```
   - Build the production Android App Bundle (`.aab`):
     ```bash
     cd mobile-flutter
     flutter build appbundle --release
     ```
   - Upload `build/app/outputs/bundle/release/app-release.aab` to the Google Play Console under `com.royalpalms.estatesecurity`.
2. **React Native Expo Resident App (`mobile-expo/`)**:
   - Build the production Android App Bundle via EAS:
     ```bash
     cd mobile-expo
     npx eas-cli build --platform android --profile production
     npx eas-cli submit --platform android
     ```

---

## 4. 10-Week Implementation Roadmap & 3-Month Post-Deployment Support SLA

| Phase | Activities | Duration | Deliverable Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Requirements gathering, consultation, and system analysis | 1 Week | Completed |
| **Phase 2** | System architecture, interface design, and database schema development | 2 Weeks | Completed |
| **Phase 3** | Development of Resident Mobile App, Security Gate Interface & Admin Dashboard | 4 Weeks | Completed |
| **Phase 4** | Integration, security validation, one-time code expiry checks & QA | 2 Weeks | Completed |
| **Phase 5** | Cloud deployment, Google Play Store publication, staff training & handover | 1 Week | Ready for Handover |
| **Total** | **Full End-to-End Delivery** | **10 Weeks** | **100% Complete** |

### Three-Month Post-Deployment Technical Support Plan
- **Month 1 (Hypercare & Gate Onboarding)**: 24/7 priority incident response (< 1 hour SLA), on-site/remote assistance for security officers at gate terminals, and resident onboarding support.
- **Month 2 (Performance & Reporting Optimization)**: Database indexing review, monthly audit log archival verification, and minor UI refinements based on Estate Management feedback.
- **Month 3 (Preventive Maintenance & Final Handover)**: Security patch updates, backup recovery drill, and final operational sign-off with the Estate Management technical team.
