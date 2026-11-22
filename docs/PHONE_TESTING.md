# Testing on a real Android phone

This runs the backend on your Windows PC and both mobile apps on one Android
phone. The PC and the phone must be on the same Wi-Fi network.

| Piece | Runs on | How |
| :--- | :--- | :--- |
| FastAPI backend (`backend/`) | PC | Python virtual environment (Docker not needed) |
| Resident app (`mobile-expo/`) | Phone | Expo Go app, loaded over Wi-Fi |
| Gate security app (`mobile-flutter/`) | Phone | `flutter run` over USB |

One phone is enough. The gate app's "Simulate QR Scan" button doesn't use the
camera, so you type the resident's 6-digit code into the gate app instead.

---

## 0. One-time installs on the PC

- **Python 3.12** from python.org. Tick "Add python.exe to PATH". Avoid 3.14,
  because the pinned `pydantic` has no prebuilt wheels for it.
- **Node.js LTS** from nodejs.org (for the Expo resident app).
- **Flutter SDK** and **Android Studio** (Android Studio provides the Android
  SDK and `adb`). Then run `flutter doctor --android-licenses` and
  `flutter doctor` until the Android toolchain shows a tick.
- On the phone, install **Expo Go** from the Play Store and turn on
  **Developer options → USB debugging**.

## 1. Find your PC's Wi-Fi IP address

```powershell
(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias Wi-Fi).IPAddress
```

If that errors, run `ipconfig` and use the "IPv4 Address" under your Wi-Fi
adapter. It looks like `192.168.1.50`. The examples below use `<PC_IP>`. Don't use
`localhost` or `10.0.2.2` on a real phone, because those only work on the PC or
in the emulator.

## 2. Start the backend, listening on the network

```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` matters: without it, the backend only accepts connections
from the PC itself. Demo accounts, units and access codes are created on first
start (see the credentials table in the main README).

When Windows Firewall asks about `python.exe`, allow it on **Private
networks**. If your Wi-Fi is set to "Public" in Windows, either switch it to
Private or allow Public as well.

**Check from the phone first:** open `http://<PC_IP>:8000/docs` in the phone's
browser. If that page doesn't load, the apps won't connect either. Fix the
firewall or network before going further.

## 3. Resident app (Expo Go)

```powershell
cd mobile-expo
npm install
"EXPO_PUBLIC_API_URL=http://<PC_IP>:8000" | Out-File -Encoding ascii .env
npx expo start
```

Scan the QR code in the terminal with Expo Go. `.env` is git-ignored, so each
machine keeps its own address. Allow Node.js through the firewall too if
Windows asks, because Expo serves the app on port 8081.

This project is on **Expo SDK 51**. The Play Store's Expo Go only supports the
newest SDK. If Expo Go says the project is incompatible, install the SDK 51
build of Expo Go from https://expo.dev/go (pick SDK 51, Android).

## 4. Gate security app (Flutter)

Plug the phone in with USB and accept the debugging prompt on the phone.

```powershell
cd mobile-flutter
flutter create --platforms=android --org com.royalpalms --project-name estate_gate_access_flutter .
flutter pub get
flutter devices
flutter run --dart-define=API_BASE_URL=http://<PC_IP>:8000
```

Run `flutter create` once only. It generates the Android build files that aren't
in the repo. It doesn't overwrite `lib/main.dart`, `pubspec.yaml` or the
existing `AndroidManifest.xml`, which already allows plain `http` for local
testing. It also adds a sample `test/widget_test.dart` that refers to a `MyApp`
class this app doesn't have. Delete that file if you run `flutter test`.

To install without a cable each time, build an APK and copy it to the phone:

```powershell
flutter build apk --debug --dart-define=API_BASE_URL=http://<PC_IP>:8000
```

The APK is at `build\app\outputs\flutter-apk\app-debug.apk`.

## 5. Test the flow

1. In the resident app, sign in as the active resident from the README table.
   If an **"Offline demo mode"** alert appears, the app couldn't reach the
   backend and is using built-in data. Passes made then won't verify at the
   gate. Recheck step 2.
2. Create a one-time visitor pass and note the 6-digit code.
3. In the gate app, sign in as the North Gate security officer. The line above
   the officer's name should end in **Online**. **Offline demo** in orange, or
   an orange "Could not reach the server…" message, means the same problem as
   above.
4. Type the code and tap **Verify Code**. It should show **VALID** with the
   resident's name and unit.
5. Tap **GRANT ENTRY & LOG ARRIVAL TIME**. The visitor appears under
   **Inside Estate**. The resident gets a "Visitor Admitted at Gate" alert.
   The resident app only loads alerts at sign-in, so sign out and back in, or
   restart Expo Go, to see it.
6. Verify the same one-time code again. It should now be rejected as
   **ALREADY_USED**.
7. Under **Inside Estate**, tap **Log Exit**. The visitor moves to the
   **Gate Logbook** with an exit time.
8. Try the pre-seeded codes too: `510293` (already used) and `194822`
   (expired) should be rejected and show up in the logbook.

When the gate app is **Online**, every verify, entry and exit goes through the
backend, and the lists come from the backend (use the refresh icon to reload
them). If the backend can't be reached mid-session, the app shows a red
"NOT recorded" message rather than pretending it worked. Entries and exits
are only kept locally in **Offline demo** mode, which uses built-in sample
data.

## Known gaps

- **The QR scan is simulated.** The scan button always verifies `482910`, and
  the `mobile_scanner` package is installed but unused.
- **The Flutter app ID** is `com.royalpalms.estate_gate_access_flutter`
  (generated by `flutter create`). To change it, edit `applicationId` in
  `android/app/build.gradle.kts`.
