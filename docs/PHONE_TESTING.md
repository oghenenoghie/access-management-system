# Testing on a real Android phone

This runs the backend on a Windows PC and both mobile apps on one Android
phone. It was tested end to end on Windows 10 with an Android 16 phone: a pass
created in the resident app was verified and admitted by the gate app, and the
same one-time code was then rejected as already used.

| Piece | Runs on | How |
| :--- | :--- | :--- |
| FastAPI backend (`backend/`) | PC | Python virtual environment (Docker not needed) |
| Resident app (`mobile-expo/`) | Phone | Expo Go from the Play Store |
| Gate security app (`mobile-flutter/`) | Phone | `flutter run` over USB |

One phone is enough for both apps. The gate app's "Simulate QR Scan" button
doesn't use the camera, so you type the resident's 6-digit code into the gate
app instead.

---

## 0. One-time setup

### On the PC

| Tool | Version tested | Notes |
| :--- | :--- | :--- |
| Python | 3.12.10 | The last 3.12 release with a Windows installer. Newer Pythons lack a prebuilt wheel for the pinned SQLAlchemy 2.0.35. |
| Node.js | 22 LTS | For the Expo resident app. |
| Flutter | 3.50.1 (stable) | |
| Java (JDK) | 21 | Microsoft OpenJDK works. Android builds need it. |
| Android SDK | platform-tools, Android 36 platform, build-tools 36.0.0, NDK 28.2.13676358 | Android Studio is optional; the command-line tools are enough and much lighter on RAM. |

Unpack Flutter, the JDK and the Android command-line tools into a folder
without spaces (for example `C:\dev`), with the command-line tools at
`<SDK>\cmdline-tools\latest`. Then tell Flutter where the SDK and JDK are:

```powershell
flutter config --android-sdk C:\dev\android-sdk --jdk-dir C:\dev\jdk-21
```

Recent Android command-line tools replace `sdkmanager` with an `android`
command. Install the SDK packages with it, **including the NDK**. Gradle tries
to install the NDK through the old `sdkmanager` and fails with
"Package ndk not found" if it's missing.

```powershell
$env:JAVA_HOME = 'C:\dev\jdk-21'
C:\dev\android-sdk\cmdline-tools\latest\bin\android.exe --no-metrics --sdk=C:\dev\android-sdk sdk install platform-tools platforms/android-36 build-tools/36.0.0 ndk/28.2.13676358
```

Flutter only recognises the SDK folder once `platform-tools` is in it. Run
`flutter doctor`; the **Android toolchain** line should show a tick. (Its
Visual Studio warning only matters for Windows desktop apps.)

If an installer fails with error `0x80070003` when started from an editor or
agent's built-in terminal, run it by double-clicking it in File Explorer
instead.

### On the phone

- Install **Expo Go** from the Play Store. The resident app is on Expo SDK 57,
  which the current Play Store version supports.
- Turn on **Developer options → USB debugging**, plug the phone in, and tap
  **Allow** on the "Allow USB debugging?" prompt.
- `adb devices` on the PC should list the phone as `device`. See
  [Troubleshooting](#troubleshooting) if it doesn't.

## 1. Network

The phone must be able to reach the PC. The same Wi-Fi works, and so does the
PC joining the **phone's own hotspot**. Find the PC's address:

```powershell
ipconfig
```

Use the "IPv4 Address" of the Wi-Fi adapter, for example `192.168.1.50`. The
steps below call it `<PC_IP>`. Don't use `localhost` or `10.0.2.2` on a real
phone; those only work on the PC or in the emulator.

**Turn off any VPN on the phone while testing**, or enable its "allow local
network" option. A VPN sends the phone's traffic to the PC into the tunnel,
and requests time out.

## 2. Backend

```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

If `py` isn't available, use the full path to Python 3.12's `python.exe` for
the first command. `--host 0.0.0.0` matters: without it, the backend only
accepts connections from the PC itself. Demo accounts, units and access codes
are created on first start (see the credentials table in the main README).

When Windows Firewall asks about `python.exe`, choose **Allow**.

**Check from the phone first:** open `http://<PC_IP>:8000/docs` in the phone's
browser. If that page doesn't load, the apps won't connect either.

## 3. Gate security app (Flutter)

With the phone plugged in:

```powershell
cd mobile-flutter
flutter pub get
flutter run --dart-define=API_BASE_URL=http://<PC_IP>:8000
```

- The **first build takes a long time** (about 25 minutes on a 4 GB RAM PC)
  while Gradle downloads its dependencies. Later builds are much faster.
- `android/gradle.properties` caps Gradle at a 2 GB heap so it fits on low-RAM
  PCs. Raise `-Xmx` there if a build fails with `OutOfMemoryError`.
- The backend address is built into the app. **If `<PC_IP>` changes, rebuild.**

To install without keeping the cable in, build an APK and copy it to the phone:

```powershell
flutter build apk --debug --dart-define=API_BASE_URL=http://<PC_IP>:8000
```

The APK is at `build\app\outputs\flutter-apk\app-debug.apk`.

## 4. Resident app (Expo Go)

```powershell
cd mobile-expo
npm install
"EXPO_PUBLIC_API_URL=http://<PC_IP>:8000" | Out-File -Encoding ascii .env
npx expo start
```

Scan the QR code in the terminal with Expo Go, and allow Node.js through the
firewall if Windows asks (Expo serves the app on port 8081). `.env` is
git-ignored, so each machine keeps its own address.

**Over USB instead of Wi-Fi** (no firewall prompt for Node.js): the app code
goes over the cable, while the app still talks to the backend at `<PC_IP>`.

```powershell
adb reverse tcp:8081 tcp:8081
npx expo start --localhost
adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081 host.exp.exponent
```

## 5. Test the flow

1. In the resident app, sign in as the active resident from the README table.
   An **"Offline demo mode"** alert means the app couldn't reach the backend
   and is using built-in data; passes made then won't verify at the gate.
2. On the **Generate** tab, create a one-time visitor pass and note the
   6-digit code. If the server rejects the pass, a **"Pass not created"**
   alert says why (for example, valid hours must be 1–168, and a temporary
   pass allows at most 50 uses).
3. In the gate app, sign in as the North Gate security officer. The line above
   the officer's name should end in **Online**. **Offline demo** in orange
   means it couldn't reach the backend.
4. Type the code and tap **Verify Code**. It should show **VALID** with the
   resident's name and unit.
5. Tap **GRANT ENTRY & LOG ARRIVAL TIME**. The visitor appears under
   **Inside Estate**, and the resident gets a "Visitor Admitted at Gate" alert.
   The resident app only loads alerts at sign-in, so sign out and back in to
   see it.
6. Verify the same code again. It should be rejected as **ALREADY_USED**.
7. Under **Inside Estate**, tap **Log Exit**. The visitor moves to the
   **Gate Logbook** with an exit time.
8. Try the pre-seeded codes too: `510293` (already used) and `194822`
   (expired) should be rejected and show up in the logbook.

When signed in to the server, both apps treat it as the source of truth: if a
request fails, they show an error ("Pass not created", "Code NOT cancelled",
"Entry NOT recorded") instead of pretending it worked. Only **Offline demo**
mode uses built-in sample data and keeps changes on the phone.

Phones with little free memory may close the app you're not looking at. If
the gate app reopens on its sign-in screen, sign in again and check it says
**Online**.

## Troubleshooting

- **`adb devices` lists nothing.** The phone isn't offering a debugging
  connection yet (it may still show up in Windows as a file-transfer device).
  Unplug, turn USB debugging off and on, tap "Revoke USB debugging
  authorisations", plug back in, choose **File transfer**, and tap **Allow**
  on the prompt. Try another cable or USB port if needed.
- **The phone can't reach the backend.** Check for a phone VPN first:
  `adb shell ip route get <PC_IP>` should show `dev wlan…`, not `dev tun0`.
  Then check the Windows Firewall prompt was allowed.
- **Backend logs look out of date.** When the backend's output goes to a file
  rather than a console window, Python buffers it. Set
  `$env:PYTHONUNBUFFERED = '1'` before starting it to see requests as they
  happen.

## Known gaps

- **The QR scan is simulated.** The scan button always verifies `482910`, and
  the `mobile_scanner` package is installed but unused. Flutter also warns
  that a future version will refuse `mobile_scanner` unless it is updated.
- **`SafeAreaView` is deprecated** in React Native 0.86. The resident app still
  works, but logs a warning; `react-native-safe-area-context` replaces it.
- **The Flutter app ID** is `com.royalpalms.estate_gate_access_flutter`. To
  change it, edit `applicationId` in `android/app/build.gradle.kts`.
