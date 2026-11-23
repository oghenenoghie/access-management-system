# Estate Gate Access Management System

A complete, end-to-end **Estate Gate Access & Visitor Management Platform** built with:
- **Python + FastAPI Backend (`backend/`)**: Centralised cloud-ready database & REST API with JWT role-based authentication, unique access code & QR generation, configurable validity windows, single-use auto-invalidation, push notification dispatch, and reporting.
- **React Native (Expo) Resident Mobile App (`mobile-expo/`)**: Resident registration with Estate ID, login & password recovery, one-time and temporary visitor access code generation, QR pass display, WhatsApp & SMS sharing, code cancellation, visitor entry history, and real-time notifications.
- **Flutter Android Gate Security App (`mobile-flutter/`)**: Dedicated Android smartphone/tablet interface for security officers at the estate gate to enter or scan visitor codes/QR passes, verify authenticity in real time, confirm the authorising resident and unit, reject expired/cancelled/used codes, and record visitor entry & exit times.
- **Next.js Estate Management Administration Dashboard (`admin-dashboard/`)**: Web-based portal to approve/suspend/deactivate residents, manage residential units and apartments, monitor visitor access codes, generate daily/weekly/monthly gate reports, conduct security investigations, and manage security personnel.
- **Zero-Setup Interactive Browser Sandbox (`preview/index.html`)**: Open directly in any web browser to test Resident code generation, Security gate verification, and Estate Admin monitoring side-by-side.

---

## Project Structure

```text
estate-gate-access/
├── backend/                  # Python FastAPI + SQLAlchemy Centralised API
│   ├── app/
│   │   ├── main.py           # FastAPI entry point & CORS config
│   │   ├── database.py       # SQLite / PostgreSQL connection
│   │   ├── models.py         # Users, Units, AccessCodes, GateLogs, Notifications, AuditLogs
│   │   ├── schemas.py        # Pydantic request/response schemas
│   │   ├── auth.py           # JWT & RBAC guards (Resident, Security, Admin)
│   │   ├── seed.py           # Pre-seeded demo accounts, units, codes & gate logs
│   │   └── routers/
│   │       ├── auth.py       # Login, Estate ID Registration, Password Recovery
│   │       ├── residents.py  # Access code generation, cancellation, history, alerts
│   │       ├── security.py   # Real-time code verification, admit visitor, record exit
│   │       └── admin.py      # Resident/unit/officer management, reports & investigations
│   ├── requirements.txt
│   └── Dockerfile
├── mobile-expo/              # React Native (Expo) Residents' Mobile Application
│   ├── App.js                # Resident portal screens (Generate, Codes, History, Alerts)
│   ├── src/api/client.js     # FastAPI client with offline fallback
│   ├── app.json              # Android package & permissions config
│   ├── eas.json              # Google Play Store APK / AAB build profiles
│   └── package.json
├── mobile-flutter/           # Flutter Android Security Gate Verification Application
│   ├── lib/main.dart         # Security Officer login, QR/code verifier, entry/exit logger
│   ├── android/              # AndroidManifest.xml & Gradle build config
│   └── pubspec.yaml
├── admin-dashboard/          # Next.js Estate Management Web Administration Dashboard
│   ├── src/app/page.tsx      # Full Admin Dashboard (Overview, Residents, Units, Codes, Reports, Security)
│   ├── src/app/layout.tsx
│   └── package.json
├── preview/
│   └── index.html            # Standalone interactive end-to-end simulator (opens in any browser)
├── docs/
│   └── USER_MANUALS_AND_TECHNICAL_DOCS.md
└── docker-compose.yml
```

---

## Demo Credentials (Pre-Seeded)

| Role | Email / Identifier | Password | Estate ID / Unit |
| :--- | :--- | :--- | :--- |
| **Estate Administrator** | `admin@royalpalmsestate.com` | `Admin@123` | `EST-ADM-001` |
| **Security Officer (North Gate)** | `security.north@royalpalmsestate.com` | `Security@123` | `EST-SEC-001` |
| **Resident (Active)** | `adewale.banjo@example.com` | `Resident@123` | `EST-2026-101` (`Block A - Apt 101`) |
| **Resident (Active)** | `chioma.nwosu@example.com` | `Resident@123` | `EST-2026-102` (`Block B - Duplex 04`) |

### Pre-Seeded Test Access Codes
- `482910`: **Valid One-Time Code** (Visitor: Michael Oluwaseun, Host: Engr. Adewale Banjo)
- `739104`: **Valid Temporary Multi-Use Code** (Visitor: Solar Tech Maintenance Team, 1/4 uses)
- `510293`: **Already-Used One-Time Code** (Automatically rejected if presented again)
- `194822`: **Expired Access Code** (Automatically rejected & alerts resident)

These accounts and passwords are public. They're for local testing only: never run a real estate on the seeded data.

---

## Configuration & Security

The backend reads these environment variables:

| Variable | Default | What it does |
| :--- | :--- | :--- |
| `APP_ENV` | `development` | Set to `production` on a real server. The backend then refuses to start without a safe `JWT_SECRET_KEY`. |
| `JWT_SECRET_KEY` | *(generated)* | Signs sign-in tokens. In production, set a long random value, e.g. from `python -c "import secrets; print(secrets.token_urlsafe(48))"`, and keep it out of git. In development, if it's unset, the backend creates a private key in `backend/.jwt_secret` (git-ignored). |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated web origins allowed to call the API (the admin dashboard). Add the dashboard's real address when you host it. The mobile apps aren't affected. |
| `PASSWORD_HASH_ITERATIONS` | `310000` | PBKDF2-SHA256 rounds for new password hashes. Raise it on a fast server. Older hashes are upgraded at the next sign-in. |
| `DATABASE_URL` | `sqlite:///./estate_access.db` | Database location. |

How sign-in is protected:
- **Passwords** are hashed with a random salt per password, and new passwords must be 8–128 characters.
- **Repeated wrong passwords** lock an account for 15 minutes after 5 tries, or an address after 30. The lock is kept in memory, so it resets when the server restarts.
- **New resident registrations** start as *pending* and can't sign in or issue passes until an administrator approves them in the admin dashboard.
- **Suspending or deactivating** a person cuts off their existing sessions immediately.
- **Password recovery codes** are random, expire after 15 minutes, and stop working after 5 wrong tries. The API never returns the code. No email/SMS sender is connected yet: in development, the code is printed in the backend's log; in production, nothing is sent until a sender is added.

---

## Quick Start Instructions

### 1. Instant Browser Preview (No Installation Required)
Open `preview/index.html` in any web browser to interact with the Resident Mobile App, Security Gate Verifier, and Estate Admin Dashboard simultaneously.

### 2. Run the Python FastAPI Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Interactive Swagger API documentation is available at `http://localhost:8000/docs`.

### 3. Run the Next.js Estate Management Admin Dashboard
```bash
cd admin-dashboard
npm install
npm run dev
```
Open `http://localhost:3000` and sign in with the Estate Administrator account from the table above (other roles are turned away). Every section reads from and writes to the backend, so start the backend first. If it isn't on `http://localhost:8000`, put `NEXT_PUBLIC_API_URL=http://<host>:8000` in `admin-dashboard/.env.local`.

### 4. Run the React Native (Expo) Resident Mobile App
Uses Expo SDK 57, so it opens in the current Expo Go from the Play Store.
```bash
cd mobile-expo
npm install
npx expo start --android
```

### 5. Run the Flutter Android Security Gate App
```bash
cd mobile-flutter
flutter pub get
flutter run
```

### 6. Test on a real Android phone
Both apps default to `10.0.2.2`, which only works in the Android emulator. To use a physical phone, see [docs/PHONE_TESTING.md](docs/PHONE_TESTING.md).
