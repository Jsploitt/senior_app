# Stack, versions, build, and BLE pairing behaviour

Verified 2026-11-15. Version numbers come from the npm registry (`registry.npmjs.org/<pkg>/latest`
and the package time index) and from `expo@58.0.25/bundledNativeModules.json` (the file
`npx expo install` resolves against). Anything not verified today is marked **unverified**.

## 1. What the scaffold already has

`senior_app/mobile/package.json`: `expo ~58.0.25`, `expo-status-bar ~58.0.5`, `react 19.3.0`,
`react-native 0.88.1`, `typescript ~6.0.3`, `main: expo-router/entry` (but `expo-router` is not yet
a dependency). `app.json`: name/slug `scaffold`, `userInterfaceStyle: "light"` (must become
`"automatic"` for dark mode), no plugins, no bundle identifiers. `AGENTS.md`: routes in `src/app/`,
always `npx expo install`, run `npx expo lint`, `npx tsc --noEmit`, `npx expo-doctor`.

## 2. Versions (current stable today)

| Package                          | npm `latest`                   | SDK 58 bundled range           | Notes / source                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expo`                           | 58.0.25 (published 2026-11-12) | n/a                            | dist-tags: `latest 58.0.25`, `sdk-57 57.0.33`. SDK 58 released 2026-10-15 (expo.dev/changelog/sdk-58)                                                                                                                                                                                                               |
| `react-native`                   | 0.88.1                         | 0.88.1                         | SDK 58 upgrades RN 0.86 -> 0.88 (changelog)                                                                                                                                                                                                                                                                         |
| `react`                          | 19.3.0                         | (peer of RN 0.88.1: `^19.3.0`) |                                                                                                                                                                                                                                                                                                                     |
| `expo-router`                    | 58.0.31 (2026-11-11)           | ~58.0.31                       | peers include `react-native-screens ^4.30.1`, `react-native-reanimated *`, `react-native-worklets *`; `expo-symbols` and `@expo/ui` became optional peers in SDK 58 (upgrade guide). Native tabs stable: `import { NativeTabs } from 'expo-router/native-tabs'` (SDK 54-57 used `expo-router/unstable-native-tabs`) |
| `react-native-reanimated`        | 4.7.1                          | 4.7.1                          | peer `react-native 0.86 - 0.88`, peer **`react-native-worklets 0.13.x`** (required)                                                                                                                                                                                                                                 |
| `react-native-worklets`          | 0.13.1                         | 0.13.0                         | Expo docs: "Reanimated Babel plugin is automatically configured in babel-preset-expo"; install both with `npx expo install react-native-reanimated react-native-worklets`                                                                                                                                           |
| `react-native-ble-plx`           | 3.5.1 (2026-02-18)             | not bundled (third party)      | see section 4                                                                                                                                                                                                                                                                                                       |
| `expo-secure-store`              | 58.0.3                         | ~58.0.3                        |                                                                                                                                                                                                                                                                                                                     |
| `expo-haptics`                   | 58.0.8                         | ~58.0.8                        |                                                                                                                                                                                                                                                                                                                     |
| `expo-sharing`                   | 58.0.23                        | ~58.0.23                       |                                                                                                                                                                                                                                                                                                                     |
| `expo-file-system`               | 58.0.13                        | ~58.0.13                       | new API default, see section 3                                                                                                                                                                                                                                                                                      |
| `jest-expo`                      | 58.0.14                        | ~58.0.14                       | peers `jest ^29` or `^30`, `@react-native/jest-preset ^0.88.1` |
| `expo-dev-client`                | 58.0.20                        | ~58.0.20                       | required for `developmentClient: true`                                                                                                                                                                                                                                                                              |
| `react-native-screens`           |                                | ~4.30.1                        |                                                                                                                                                                                                                                                                                                                     |
| `react-native-safe-area-context` |                                | ~5.11.1                        |                                                                                                                                                                                                                                                                                                                     |
| `expo-symbols`                   |                                | ~58.0.5                        | SF Symbols on iOS                                                                                                                                                                                                                                                                                                   |
| `eas-cli`                        | 27.10.0                        | n/a                            | run as `npx eas-cli@latest` (AGENTS.md)                                                                                                                                                                                                                                                                             |
| `expo-doctor`                    | 1.21.8                         | n/a                            | `npx expo-doctor`                                                                                                                                                                                                                                                                                                   |

Tooling: Node 22.13+ (22 line), 24.3+ (24 line) or 26+; odd Node lines unsupported (SDK 58
changelog). SDK 58 builds against the iOS 27 SDK and generates a SceneDelegate on prebuild;
Android release builds have R8 minify on by default (changelog). The new Expo Go supports only
SDK 58 and cannot load ble-plx anyway: **a development build is mandatory**.

Install (never `npm install` directly):

```bash
npx expo install expo-router react-native-screens react-native-safe-area-context expo-linking expo-constants \
  react-native-reanimated react-native-worklets expo-secure-store expo-haptics expo-sharing \
  expo-file-system expo-dev-client expo-symbols expo-application
npx expo install react-native-ble-plx        # third party: expo install pins whatever npm latest resolves
npx expo install jest-expo jest @types/jest -- --save-dev
npx expo install --check   # or --fix
npx expo-doctor
```

## 3. API notes verified against SDK 58 docs

- **expo-file-system** (docs.expo.dev/versions/v58.0.0/sdk/filesystem): current API
  `import { File, Directory, Paths } from 'expo-file-system'`; legacy `FileSystem.*` methods must be
  imported from `'expo-file-system/legacy'` or they throw at runtime. In SDK 58 `File.write()` is
  async (returns a Promise); `writeSync()` is the sync variant; `File.md5` deprecated for
  `File.digest()` (changelog). CSV export:
  ```ts
  const file = new File(Paths.cache, `m010-log-${stamp}.csv`);
  file.create({ overwrite: true });
  await file.write(csv);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export log',
  });
  ```
- **expo-sharing**: `shareAsync(url, { mimeType, UTI, dialogTitle, anchor })`,
  `isAvailableAsync()`. On iOS, `mimeType` only picks an extension; a mapped `UTI` wins.
- **expo-secure-store**: `setItemAsync / getItemAsync / deleteItemAsync`; keys
  `[A-Za-z0-9._-]`; default `keychainAccessible` is `WHEN_UNLOCKED`; use
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY` for the device id + counter floor (must not migrate to another
  phone, which would have no bond anyway). Android data is not kept after uninstall; plugin option
  `configureAndroidBackup` default `true` excludes it from Auto Backup.
- **expo-haptics**: `impactAsync(ImpactFeedbackStyle.Light|Medium|Heavy|Rigid|Soft)`,
  `notificationAsync(NotificationFeedbackType.Success|Warning|Error)`, `selectionAsync()`,
  `performAndroidHapticsAsync(AndroidHaptics.*)` (no VIBRATE permission needed for that one).
- **Reanimated 4**: requires worklets 0.13.x (peer dependency above). The SDK 58 docs page does not
  mention a reduced-motion API; Reanimated's own `useReducedMotion` / `ReduceMotion` is
  **unverified for 4.7.1 today**; fall back to `AccessibilityInfo.isReduceMotionEnabled()`.

## 4. react-native-ble-plx

Facts verified today:

- Latest `3.5.1`, published 2026-02-18; the only change since 3.5.0 is crash guards
  (GitHub release notes v3.5.1).
- The Expo config plugin is **built in**: `app.plugin.js` -> `plugin/build/withBLE` (no
  `@config-plugins/react-native-ble-plx` needed). Options read by the plugin source:
  - `isBackgroundEnabled` (default `false`): **only** adds
    `<uses-feature android:name="android.hardware.bluetooth_le" android:required="true"/>`.
    It does not add iOS background modes.
  - `modes` (default `[]`): `"central"` -> `UIBackgroundModes: bluetooth-central`,
    `"peripheral"` -> `bluetooth-peripheral`.
  - `bluetoothAlwaysPermission` (string, or `false` to skip): sets
    `NSBluetoothAlwaysUsageDescription`; default text "Allow $(PRODUCT_NAME) to connect to
    bluetooth devices".
  - `neverForLocation` (default `false`): adds `android:usesPermissionFlags="neverForLocation"` to
    `BLUETOOTH_SCAN` and caps `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` with
    `android:maxSdkVersion="30"`.
  - Always adds `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT`; `BLUETOOTH_SCAN` with
    `tools:targetApi="31"`. Passing `bluetoothPeripheralPermission` only produces a deprecation
    warning.
- No bonding API: no `createBond` or bond-state calls in ble-plx's JS or Android Java sources
  (searched every `.java` file in the 3.5.1 tarball).
- `BleError` exposes `errorCode`, `attErrorCode`, `iosErrorCode`, `androidErrorCode`, `reason`.
  Relevant codes: `CharacteristicReadFailed 402`, `CharacteristicWriteFailed 401`,
  `DeviceDisconnected 201`, `DeviceConnectionFailed 200`, `OperationTimedOut 3`,
  `BluetoothUnauthorized 101`, `BluetoothPoweredOff 102`; ATT `InsufficientAuthentication 5`,
  `InsufficientAuthorization 8`, `InsufficientEncryption 15`; Android `AuthFail 0x89 (137)`,
  `EncrypedNoMitm 0x8d`, `NotEncrypted 0x8e`; iOS codes enumerated only up to `UnknownDevice 12`.
- `ConnectionOptions`: `autoConnect`, `requestMTU`, `refreshGatt`, `timeout` (ms).

Risks (verified status, impact not measured):

- 3.5.1 is a classic bridge module. The upstream TurboModule rewrite (PR #1331 "V4 turbomodule
  rewrite", opened 2026-03-16) is **open, not merged**; issue #1277 "RN New Architecture
  Compatibility" is open. An issue report (#1323) shows 3.5.0 running on RN 0.81.5 with New
  Architecture enabled, i.e. through the interop layer. **Running on RN 0.88.1 is unverified.**
  First task of implementation: a dev build that scans, connects and reads one characteristic.
- Open issue #1323: Android NullPointerException when a device disconnects with GATT status 8. The
  firmware's supervision-timeout disconnect is exactly that case. Mitigation to test: subscribe
  `onDeviceDisconnected` before any operation and cancel monitors on disconnect.
- A community fork `@sfourdrinier/react-native-ble-plx` (latest 3.9.3) claims Expo SDK 57+ / RN
  0.86+ support; its claims were **not evaluated**.

Recommended `app.json` plugin entry:

```json
[
  "react-native-ble-plx",
  {
    "isBackgroundEnabled": false,
    "modes": [],
    "bluetoothAlwaysPermission": "M010 Barrier uses Bluetooth to connect directly to your parking barrier. Nothing is sent over the internet.",
    "neverForLocation": true
  }
]
```

No background modes: the driver flow is foreground only, and the firmware stops the arm on link
loss anyway.

## 5. Permissions

| Platform                  | Permission                                                 | How it gets there                          | Runtime                                                                                            |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| iOS                       | `NSBluetoothAlwaysUsageDescription`                        | ble-plx plugin `bluetoothAlwaysPermission` | prompt on first `BleManager` use; state `Unauthorized` -> `BleErrorCode.BluetoothUnauthorized 101` |
| Android 12+ (API 31+)     | `BLUETOOTH_SCAN` (`neverForLocation`), `BLUETOOTH_CONNECT` | plugin                                     | `PermissionsAndroid.requestMultiple([BLUETOOTH_SCAN, BLUETOOTH_CONNECT])`                          |
| Android <= 11 (API <= 30) | `ACCESS_FINE_LOCATION` (+ COARSE), `maxSdkVersion 30`      | plugin with `neverForLocation: true`       | request `ACCESS_FINE_LOCATION`; location services must be on for scan results on these versions    |
| Android all               | `BLUETOOTH`, `BLUETOOTH_ADMIN`                             | plugin (legacy, install-time)              | none                                                                                               |

With `neverForLocation`, Android 12+ never sees beacon/location data from scans; the app does not
need it (it filters by service UUID).

## 6. Passkey bonding through ble-plx

The firmware uses LESC + MITM + bonding with `DISPLAY_ONLY` IO capability and fixed passkey; every
characteristic needs an authenticated link (CONTRACT.md 7.1). The phone therefore performs
**passkey entry**; the code is printed on the unit label / UART.

### 6.1 iOS

- Apps cannot start pairing explicitly. Core Bluetooth pairs when a read/write returns Insufficient
  Authentication/Encryption; the system shows its own passkey-entry alert. The app triggers this by
  reading **Session** right after `discoverAllServicesAndCharacteristicsForDevice`; the read promise
  resolves only after pairing completes (behaviour of Core Bluetooth as widely documented;
  **not reproduced against this firmware**: untested on hardware).
- The firmware does **not** disconnect on a failed pairing (`firmware/components/ble_auth/ble_auth_gap.c:182-184`), so a wrong
  code or Cancel surfaces as a rejected Session read (`CharacteristicReadFailed 402`, with an
  `attErrorCode` of 5 or 15, or an iOS error code). Raw iOS codes above 12 (e.g.
  `peerRemovedPairingInformation`, `encryptionTimedOut`) are not in ble-plx's enum; their numeric
  values (14, 15) could not be verified against Apple's page today.
- Stale bond: if the device deleted its bond (window closed during pairing, or revoke) but iOS kept
  one, reconnect encryption fails and iOS refuses to re-pair until the user taps **Forget This
  Device** in Settings > Bluetooth. The app cannot remove it; it must instruct the user.
- iOS caches GATT; the firmware's attribute table is static, so no cache problem is expected.

### 6.2 Android

- ble-plx has no bond API (section 4). Android's stack starts bonding automatically when a GATT
  operation on an encrypted characteristic gets `GATT_INSUFFICIENT_AUTHENTICATION (5)`, and shows
  the passkey dialog or, when the app is not in the foreground, a notification (Nordic DevZone /
  Punch Through Android BLE guide; secondary sources). The first read can fail while bonding runs;
  `137 (0x89) GATT_AUTH_FAIL` usually means the link is not authenticated (wrong passkey or stale
  bond).
- Strategy: read Session; on ATT 5 / 15 / Android 0x89, keep the connection, wait, and retry the
  read every 1 s up to the pairing deadline. Showing the "Enter the passkey" guidance before the
  first read avoids the dialog arriving unexplained.
- If explicit `createBond()` turns out to be needed on some phones, it requires a small Expo native
  module (not in ble-plx); **unverified need**, decide after hardware testing.

### 6.3 Detecting outcomes (both platforms)

| Observation within the pairing deadline (45 s, user is typing)                              | Meaning                                                                                           | UI                                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Session read resolves, 4 bytes                                                              | owner authorized                                                                                  | proceed; log `AUTH_OWNER_OK` with elapsed ms                                  |
| Session read rejects with ATT 0x08                                                          | encrypted, but not owner (owner list full, or known bond not in list) (`firmware/components/ble_auth/ble_auth_gatt.c:128-131`) | "paired but not an owner"                                                     |
| Disconnect within about 1 s after the OS pairing UI closes, Session never read              | window closed: device deleted the bond (`firmware/components/ble_auth/ble_auth_gap.c:108-115`)                                 | "hold the button 3 s and retry within 60 s"; on iOS also "Forget This Device" |
| Session read rejects with ATT 5/15 / Android 0x89 and no disconnect, repeated after retries | wrong passkey / cancelled / stale phone bond                                                      | "check the 6-digit code"; on iOS suggest Forget This Device                   |
| Deadline passes                                                                             | pairing UI ignored or stack stuck                                                                 | cancel connection; "try again"                                                |

Wrap every ble-plx call in its own timeout; ble-plx's `timeout` connection option covers only the
connect phase.

## 7. EAS

`eas.json` (keys verified in docs.expo.dev/eas/json; the Apple and Google ids are placeholders the
team must fill in):

```json
{
  "cli": {
    "version": ">= 27.10.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": false },
      "android": { "buildType": "apk" },
      "env": { "EXPO_PUBLIC_TRANSPORT_DEFAULT": "sim" }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": { "EXPO_PUBLIC_TRANSPORT_DEFAULT": "ble" }
    },
    "production": {
      "distribution": "store",
      "autoIncrement": true,
      "env": { "EXPO_PUBLIC_TRANSPORT_DEFAULT": "ble" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "REPLACE_ME@example.com",
        "ascAppId": "REPLACE_WITH_ASC_APP_ID",
        "appleTeamId": "REPLACE_TEAM_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./secrets/play-service-account.json",
        "track": "internal",
        "releaseStatus": "draft"
      }
    }
  }
}
```

- `developmentClient: true` needs `expo-dev-client`; it builds Debug on iOS and `:app:assembleDebug`
  on Android.
- `autoIncrement: true` bumps `ios.buildNumber` / `android.versionCode`; with
  `appVersionSource: "remote"` EAS stores the counter. If `appVersionSource` is omitted, EAS warns
  and uses `local`.
- iOS simulators have no Bluetooth radio: the `development` profile builds for device. A separate
  simulator profile (`"ios": { "simulator": true }`) is useful only with the sim transport.
- `android.track` values: `production | beta | alpha | internal`; `releaseStatus`:
  `completed | draft | halted | inProgress`.
- `app.json` additions: `ios.bundleIdentifier`, `android.package`, `userInterfaceStyle: "automatic"`,
  the ble-plx plugin, `expo-router`, `expo-secure-store` (`configureAndroidBackup: true`).
- Commands: `npx eas-cli@latest build --profile development --platform ios`, `... --profile preview
--platform android`, `npx eas-cli@latest submit --profile production`.
- Constraint 5: do not add `expo-updates` (OTA) or any analytics SDK; the app should make zero
  network requests at runtime.

## 8. Testing

- `jest-expo` preset; contract tests load `docs/vectors.json` and assert byte-for-byte:
  `encodeCommand(op, counter, nonce) === hex` (18 vectors), `decodeStatus(hex)` deep-equals
  `decoded` (22 vectors), invalid lengths throw, the sim transport's FSM reproduces all 84
  `fsm_matrix` rows and the sim validator reproduces all 15 `freshness.cases`.
- Base64: ble-plx moves values as base64 strings; encode/decode helpers need their own vectors
  (derive them from the hex in `vectors.json`).

## Sources

- npm registry: registry.npmjs.org/{expo, expo-router, react-native, react-native-reanimated, react-native-worklets, react-native-ble-plx, expo-secure-store, expo-haptics, expo-sharing, expo-file-system, jest-expo, expo-dev-client, eas-cli, expo-doctor, @sfourdrinier/react-native-ble-plx}
- unpkg.com/expo@58.0.25/bundledNativeModules.json
- unpkg.com/react-native-ble-plx@3.5.1/ (package.json, app.plugin.js, plugin/build/_.js, src/BleError.js, src/BleManager.js, src/TypeDefinition.js, android/src/\**/_.java)
- [Expo SDK 58 changelog](https://expo.dev/changelog/sdk-58) and [upgrade guide](https://expo.dev/blog/how-to-upgrade-to-sdk-58)
- [Expo FileSystem v58](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/), [Sharing](https://docs.expo.dev/versions/v58.0.0/sdk/sharing/), [SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/), [Haptics](https://docs.expo.dev/versions/v58.0.0/sdk/haptics/), [Reanimated](https://docs.expo.dev/versions/v58.0.0/sdk/reanimated/)
- [Expo Router native tabs](https://docs.expo.dev/router/advanced/native-tabs/)
- [eas.json reference](https://docs.expo.dev/eas/json/), [Configure EAS Build](https://docs.expo.dev/build/eas-json/)
- GitHub dotintent/react-native-ble-plx: release v3.5.1, PR #1331, issues #1277, #1278, #1323 (via `gh api`)
- [Punch Through Android BLE guide](https://punchthrough.com/android-ble-guide/), [Nordic DevZone: Android GATT_INSUFFICIENT_AUTHENTICATION](https://devzone.nordicsemi.com/f/nordic-q-a/7651/android-gatt_insufficient_authentication), [Google issue 245501768](https://issuetracker.google.com/issues/245501768)
- [Apple CBError.Code](https://developer.apple.com/documentation/corebluetooth/cberror-swift.struct/code) (page body did not render; values unverified)
