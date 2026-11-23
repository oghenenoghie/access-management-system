# Deploying the Estate Gate Access pilot

The pilot runs on three hosted services plus two Android apps installed from
APK files:

| Piece | Runs on | Address |
| :--- | :--- | :--- |
| Backend API (`backend/`) | Railway, EU West | `https://<backend>.up.railway.app` |
| Database | Neon PostgreSQL, Frankfurt (free plan) | connection string only |
| Admin dashboard (`admin-dashboard/`) | Vercel (or Railway) | `https://<dashboard>.vercel.app` |
| Gate app, resident app | Android phones | APKs from the **Release APKs** workflow |

Do the steps in order the first time. Later releases only need
[Updating](#updating).

---

## 0. Signing keys and GitHub secrets (once)

The apps are signed with two keys kept **outside the repository**, in
`C:\Users\user\develop\keys` (see its `README.txt`):

- `estate-gate-upload.jks`, `estate-resident-upload.jks`: the keys
- `estate-*-signing.properties`: their passwords

**Back that folder up somewhere safe and private.** Android only installs an
update signed with the same key as the installed app. If the keys are lost,
everyone has to uninstall and reinstall.

GitHub builds the release APKs, so it needs the keys as **encrypted repository
secrets**. In the repository on GitHub, open **Settings → Secrets and
variables → Actions → New repository secret** and add these four. Paste each
value from the file of the same name in
`C:\Users\user\develop\keys\github-secrets\`:

| Secret name | Value from |
| :--- | :--- |
| `GATE_KEYSTORE_BASE64` | `GATE_KEYSTORE_BASE64.txt` |
| `GATE_KEYSTORE_PASSWORD` | `GATE_KEYSTORE_PASSWORD.txt` |
| `RESIDENT_KEYSTORE_BASE64` | `RESIDENT_KEYSTORE_BASE64.txt` |
| `RESIDENT_KEYSTORE_PASSWORD` | `RESIDENT_KEYSTORE_PASSWORD.txt` |

Then delete the `github-secrets` folder. The keys and passwords remain in the
`keys` folder.

## 1. Database (Neon)

1. Create a Neon project in **AWS Europe (Frankfurt)**.
2. Copy its **direct** connection string, not the pooled one. It looks like
   `postgresql://user:password@ep-…eu-central-1.aws.neon.tech/neondb?sslmode=require`.
   Treat it as a password.

The backend creates its tables on first start.

## 2. Backend (Railway)

1. New project → **Deploy from GitHub repo** → this repository.
2. In the service's **Settings**: set **Root Directory** to `backend` and the
   region to **EU West**. The build uses `backend/Dockerfile` and
   `backend/railway.json`, which sets the health check.
3. In **Variables**, set:

| Variable | Value |
| :--- | :--- |
| `APP_ENV` | `production` |
| `DATABASE_URL` | the Neon connection string |
| `JWT_SECRET_KEY` | a new random value: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `TRUSTED_PROXY_HOPS` | `1` (Railway's proxy; needed for the per-address sign-in lockout) |
| `CORS_ALLOWED_ORIGINS` | the dashboard's address (step 3), e.g. `https://<dashboard>.vercel.app` |
| `INITIAL_ADMIN_EMAIL` | the estate administrator's email |
| `INITIAL_ADMIN_PASSWORD` | a password of 12+ characters, **typed in by the administrator** |
| `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_PHONE` | optional |
| `PASSWORD_HASH_ITERATIONS` | optional; `600000` is recommended on a server |

4. **Settings → Networking → Generate Domain** gives the HTTPS address.
5. Check it:
   - `https://<backend>/` returns `"status": "operational"`.
   - `https://<backend>/docs` returns **404**, because the API's test pages are
     off in production.
   - The deploy log says `Created the first administrator account`.
6. **Delete `INITIAL_ADMIN_PASSWORD` from Railway's variables.** The account
   exists now; the variable is only read when no administrator exists.

In production the backend refuses to start without a safe `JWT_SECRET_KEY`
or with SQLite, and it never loads the demo accounts.

## 3. Admin dashboard (Vercel)

1. Vercel → **Add New → Project** → import this repository.
2. Set **Root Directory** to `admin-dashboard`, and add the environment
   variable `NEXT_PUBLIC_API_URL` = `https://<backend>`.
3. Deploy, then put the dashboard's address into `CORS_ALLOWED_ORIGINS` on
   Railway. Railway redeploys automatically.

Vercel's free **Hobby** plan is for non-commercial use only. For paid or
business use, either use Vercel Pro or run the dashboard as a second Railway
service from the same repository (Root Directory `admin-dashboard`, with the
same variable).

## 4. Apps

1. On GitHub: **Actions → Release APKs → Run workflow**, and enter the
   backend's address (`https://<backend>`, HTTPS required).
2. When it finishes (about 15–25 minutes), download the two artifacts from
   the run's page:
   - `estate-gate-security-buildN.apk`: for the guards' phones
   - `estate-resident-buildN.apk`: for residents
3. Send the APKs to the pilot users, for example by WhatsApp or a shared
   drive link. When opening the file, Android asks to allow installing apps
   from that source.

Release builds have **demo mode off**: no pre-filled sign-in, no sample data,
and no offline fallback. They only talk to the server over HTTPS. They run on
ARM phones, 32- and 64-bit, which is practically every Android phone.

The repository is public, so anyone signed in to GitHub can download the
APKs from a workflow run for 30 days. That's fine: they hold no secrets, and
an account is still needed to use them.

## 5. First day

1. Sign in to the dashboard with the initial administrator account.
2. **Units & Apartments:** add the estate's units.
3. **Security Personnel:** create an account per guard, then give each guard
   their email and initial password in person.
4. Residents install the resident app and register; their accounts show as
   **pending** until you **Approve** them under **Resident Accounts**.
5. Gate phones: install the gate app and sign in as the guard on duty.

## Running the pilot

- **Forgotten passwords:** no email/SMS sender is connected yet. In the
  dashboard, **Reset password** gives a one-time temporary password to pass
  on; the person then changes it (resident app: **Password**). Officers can't
  change their own password in the gate app yet, so reset it for them.
- **Logs:** Railway → the backend service → **Deployments / Logs**.
- **Backups:** the Neon free plan can only restore to a point in the
  **last 6 hours**. Take a regular copy with PostgreSQL's `pg_dump`, run from
  any PC with PostgreSQL installed:
  `pg_dump "<Neon connection string>" --format=custom --file=estate-YYYY-MM-DD.dump`.
  Keep the files private: they contain residents' personal data.
- **Rolling back a bad backend release:** Railway → **Deployments** → pick the
  previous deployment → **Redeploy**.
- **Signing everyone out**, e.g. if a phone with a signed-in admin is lost:
  change `JWT_SECRET_KEY` on Railway, and every session ends.
- **Personal data:** the system stores names and phone numbers of residents
  and visitors, so Nigeria's NDPA applies. Give residents a short privacy
  notice covering what's stored, why, and who to ask about it.

## Updating

- **Backend and dashboard:** push to `main`. CI must pass, then Railway and
  Vercel deploy the new version automatically.
- **Apps:** run **Release APKs** again. Each run gets a higher build number,
  so the new APK installs over the old one and keeps the user signed in.
  Always build from the same signing keys.
