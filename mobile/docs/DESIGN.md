# M010 Barrier app: design

Scope: Expo / React Native app for the Solar-Powered Smart Parking Barrier (TEAM M010, KFUPM
Senior Design, Term 261). Wire behaviour: `CONTRACT.md`. State rendering: `STATE_MACHINE.md`.
Versions and build: `STACK.md`.

## 0. Terminology (from the FDR deck, `senior_app/uploads/TEAM_M010_FDR_Presentation.pptx`)

Use these words in UI copy and in presenter mode so the app matches the slides:

| Term in app                                                                                                                                                   | FDR source                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Owner phone**, **Lower / Raise / Stop**                                                                                                                     | slide 9 ("Owner Phone - external - Lower / Raise / Stop") |
| **BLE & Authorization**, **bonded-owner check**                                                                                                               | slide 9                                                   |
| **Safety Interlocks** (obstruction, limits, power health)                                                                                                     | slides 3, 9                                               |
| **Barrier Controller**, **command validation + state machine**                                                                                                | slide 9                                                   |
| **Status & Events: state, result, fault**                                                                                                                     | slides 4, 9                                               |
| **Movement guard**: `MotionAllowed = OwnerAuthorized AND FreshCommand AND ValidPosition AND SensorsValid AND ZoneClear AND PowerHealthy AND NOT FaultLatched` | slide 10                                                  |
| "An accepted command is permission to begin a monitored movement, not proof that movement finished"                                                           | slide 10 (shown as footnote under the control)            |
| **Fresh requests**: duplicate, expired, prior-session rejection                                                                                               | slide 11                                                  |
| **C4** 150 ms control-loop budget, **C5** 100% local access decisions, **S5** <= 2 s authentication, **S6** >= 90% authentication accuracy                    | slides 11, 13, 15                                         |
| Scope caveat: phone authorization vs the registered "distance-aware vehicle authentication"                                                                   | slides 1, 15 (shown in About; never claim S5/S6 are met)  |

Never show a requirement as "passed" in the app. The app shows _measurements on this phone_ and
labels them as such; FDR slides 12-16 are explicit that nothing is verified yet.

## 1. Visual direction

Apple-native, premium, calm: think Apple Home accessory tile + Tesla app hero.

- System font only (SF Pro on iOS, Roboto on Android) via `fontFamily: undefined` / platform default; no custom fonts to load.
- Large titles on every root screen; content on grouped inset backgrounds.
- One hero per screen: on Control, a large barrier illustration whose arm angle and color follow the FSM state.
- Generous whitespace (24-32 pt between sections), soft corner radii, no borders where a background change will do.
- Motion means the arm is moving: the only looping animation in the app is the RAISING/LOWERING arm and progress ring.
- Haptics on every command and every terminal result (STATE_MACHINE.md 3.2).
- Full dark mode, following the system setting with an in-app override.
- Persistent "Local only - no internet" chip in the header of Control and Health (Constraint 5).

## 2. Navigation map (expo-router, file routes)

**Implementation note (orchestrator, Phase 1):** routes live in `mobile/app/` (expo-router default root), not
`src/app/`; shared code is under `mobile/src/`. Token names in code (`src/theme/tokens.ts`) are the source of truth
(`background`, `tint`, `positive`, `warning`, `critical`, ...) and their AA contrast is enforced by
`src/__tests__/tokens.test.ts`. Arm travel nominal is `MOTION_NOMINAL_MS = 4000` (app constant, used by the sim and
the arm animation; firmware specifies only the 7000 ms timeout).

The scaffold's `AGENTS.md` says routes live in `src/app/` (`senior_app/mobile/AGENTS.md`, "Navigation & Routing"). Native tabs are stable in SDK 58 at `expo-router/native-tabs` (see STACK.md).

```
src/app/
  _layout.tsx                 Root Stack. Providers: Theme, Transport (sim|ble), Session store, EventLog.
                              Redirects to /onboarding on first launch (flag in SecureStore).
  onboarding/
    _layout.tsx               Stack, no header, swipe-back disabled on the last step
    index.tsx                 Welcome: what the app does, "100% local" promise
    bluetooth.tsx             Why we need Bluetooth; triggers OS permission request
    enroll.tsx                Enrollment walkthrough (hold 3 s, 60 s window, passkey)
    done.tsx                  Success, first connection latency shown
  (tabs)/
    _layout.tsx               NativeTabs: Control, Health, Log, Settings
    index.tsx                 Control (driver flow)
    health.tsx                Health dashboard (operator, read-only)
    log.tsx                   Event log + CSV export
    settings/
      _layout.tsx             Stack inside the Settings tab
      index.tsx               Settings root
      transport.tsx           Sim / BLE toggle
      device.tsx              This barrier: identifier, counter, forget + counter reset
      appearance.tsx          Theme: System / Light / Dark
      about.tsx               Version, firmware contract version, requirement scope note
  connect.tsx                 Modal: scan list + connect + pairing guidance (presented from Control)
  guard-details.tsx           Sheet: all guard bits / fault explanation (formSheet, detents)
  presenter/
    _layout.tsx               Stack, forces sim transport while mounted
    index.tsx                 Scenario list
    [scenario].tsx            Scenario runner (step-through)
```

Hidden entry: tapping the app logo/wordmark on Settings -> About 5 times within 3 s pushes
`/presenter`. A toast "Presenter mode" confirms; a second "Exit presenter" row returns and restores
the previous transport.

## 3. Screen inventory

### 3.1 Driver flow

**Control (`(tabs)/index.tsx`)**

- Large title: barrier name ("M010-Barrier" or user nickname). Header right: connection pill (`Disconnected` / `Connecting` / `Pairing` / `Connected - owner` / `Connected - not owner`).
- Hero `BarrierHero`: illustration + state label + sub-label (STATE_MACHINE.md 3.1). Color role per state.
- `ControlPad`: two big buttons LOWER and RAISE (min 64 pt tall, full width split), and a full-width STOP bar below them that is always visible and becomes the primary (filled danger) while RAISING/LOWERING. STOP is reachable without scrolling at the largest Dynamic Type size (layout rule: the pad is pinned above the tab bar, hero shrinks first).
- `GuardChips`: row of chips under the hero for live interlock flags from Status: Zone clear, Sensors valid, Battery (V). Tapping opens `guard-details`.
- `ResultBanner`: transient banner for the last result (STATE_MACHINE.md 3.2). REJECTED_GUARD expands to one row per set bit using CONTRACT.md 4.1 copy.
- `AuthLatencyBadge`: "Authenticated in 0.84 s (this phone)" with a 2.0 s reference tick (Spec 5). Tap for this session's history.
- Footnote (caption): "An accepted command starts a monitored movement; the barrier confirms arrival with its end-limit switch."
- Empty state (no device known): illustration + "Find your barrier" -> `/connect`.

**Connect (`connect.tsx`, modal)**

- Scans with service-UUID filter (CONTRACT.md 1). List of `DeviceRow` (name, RSSI bars, "Previously paired" tag if stored).
- Tap -> connecting -> reading Session. States shown inline in the row with a progress step list: Connecting -> Securing (pairing) -> Checking owner -> Ready.
- Pairing guidance sheet appears when the OS prompt is expected (first connection or after forget): "Your phone will ask for a 6-digit code. Enter the passkey on the barrier's label." with an illustration of the system prompt.
- Failure copy (mapping in STACK.md 6):
  - pairing failed / wrong code -> "Pairing didn't complete. Check the 6-digit code on the label and try again."
  - dropped right after pairing -> "The barrier isn't accepting new phones right now. Hold its button for 3 seconds, then try again within 60 seconds."
  - Session read ATT 0x08 -> "This phone is paired but isn't an owner. The barrier already has 2 owners, or this phone was removed."
  - timeout (>15 s total) -> "Couldn't reach the barrier. Move closer and try again."

### 3.2 Operator / health (read-only)

**Health (`(tabs)/health.tsx`)**

- Grouped list, all read-only, from the latest Status:
  - Barrier: state, last result, fault (with title), last counter.
  - Safety interlocks: Zone clear, Sensors valid (with "Movement guard" explanation row).
  - Power: battery mV and V, bar against 11.0 V critical / 11.8 V healthy / 15.5 V plausible max (`app_config.h:37-40`).
  - Link: connected-as-owner flag, RSSI, measured connection interval if available (not exposed by ble-plx on iOS: show "n/a"), last notification age (heartbeat 1 s).
  - This session: auth latency (Spec 5 reference 2 s), commands sent, accepted, rejected by reason.
  - Requirements panel (static): C4 150 ms (firmware, measured on the board from UART logs, not by the phone), C5 local-only (app makes no network requests: true by construction), S5 <= 2 s (phone proxy shown), S6 >= 90% (scored from labelled trials by `tools/log_parser.py s6`; app shows its own accept/reject tallies only).
- No owner list, no revoke, no rename on the device: firmware exposes none (`CONTRACT.md` sections 2 and 7; revoke is `ble_auth_revoke_all()` on-site only).

**Log (`(tabs)/log.tsx`)**

- Reverse-chronological list of on-phone events: `SCAN_START`, `CONN_ESTABLISHED`, `PAIRING_PROMPT_EXPECTED`, `AUTH_OWNER_OK` (with phone-measured ms), `AUTH_REJECT` (with inferred reason), `CMD_TX` (opcode, counter), `CMD_RESULT` (result, mask), `STATE` (prev -> new), `FAULT`, `DISCONNECT`. Names reuse the firmware `EVT_LIST` where meanings match (`CONTRACT.md` section 11).
- Filter segmented control: All / Commands / Auth / Faults.
- Export: "Share CSV" builds `m010-log-YYYYMMDD-HHMMSS.csv` in `Paths.cache` with columns `t_iso,t_mono_ms,event,a,b,detail,transport` and opens the share sheet (`expo-sharing`, `mimeType: 'text/csv'`, `UTI: 'public.comma-separated-values-text'`). Storage: ring buffer of 2000 entries persisted in the app's document directory.
- "Clear log" with confirmation.

### 3.3 Hidden FPR presenter mode

Forced simulated transport (`SimTransport`) that runs the real app code paths (same decoder, same
FSM display, same counter logic) against a device model built from `vectors.json` `fsm_matrix` and
`freshness.cases`. A floating "SIMULATED" badge is always visible, so a recording cannot be
mistaken for hardware evidence.

`presenter/index.tsx` lists scenarios; `[scenario].tsx` shows the normal Control screen with a
bottom drawer: step description, Next / Auto-play, and interlock toggles (Zone clear, Sensors
valid, Power healthy, Owner authorized, Link) like the old demo's PresenterPanel (`senior_app/app.jsx`, `PresenterPanel`).

| Scenario id               | Steps (FSM rows from STATE_MACHINE.md)                                                                                                                                          | What the audience sees                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `happy-path`              | boot UNKNOWN -> LOWER (1) -> limit lowered (16) -> RAISE (5) -> limit raised (14) -> LOWER (7) -> (16)                                                                          | full cycle with success haptics                            |
| `homing`                  | UNKNOWN: RAISE rejected (2, mask 0x04) -> LOWER (1) -> (16)                                                                                                                     | "Lower first" rule (INTERFACES design decision)            |
| `stop-mid-travel`         | RAISE (5) -> STOP (18) -> RAISE from STOPPED (9) -> (14)                                                                                                                        | STOP always reachable                                      |
| `obstruction`             | LOWER (7) -> INTERLOCK_UNSAFE (19) with zone_clear=0 -> LOWER rejected (11, mask 0x10) -> clear -> LOWER (10)                                                                   | stop path + guard                                          |
| `interlock-unsafe-sensor` | RAISE (5) -> sensors invalid (19) -> rejected (11, 0x08) -> 2 s -> FAULT SENSOR_PERSISTENT (26)                                                                                 | sensor validity                                            |
| `limit-conflict`          | RAISE (5) -> LIMIT_LOWERED (15) -> RAISE rejected (28, 0x44) -> STOP in FAULT (27) -> on-site clear (29)                                                                        | latched fault, recovery                                    |
| `motion-timeout`          | LOWER (7) -> 7 s timer -> FAULT MOTION_TIMEOUT (21)                                                                                                                             | countdown visible against 5 s nominal / 7 s timeout        |
| `low-battery`             | battery 11.7 V -> RAISE rejected (6, 0x20) -> 10.9 V -> FAULT POWER_CRITICAL (26)                                                                                               | power health                                               |
| `link-lost`               | LOWER (7) -> link drop (20) -> reconnect, new nonce -> STOPPED shown                                                                                                            | stop without the phone                                     |
| `replayed-command`        | send RAISE c=12 accepted -> resend same frame -> REJECTED_STALE (REPLAY) -> counter jump +65 -> REJECTED_STALE (COUNTER_JUMP) -> old-session nonce -> REJECTED_AUTH (BAD_NONCE) | S6 fresh-request evidence; shows frame hex                 |
| `guard-rejects`           | cycles each guard bit with its copy                                                                                                                                             | every reason string                                        |
| `not-owner`               | pairing completes, Session read ATT 0x08                                                                                                                                        | intruder rejected (S6 true reject)                         |
| `auth-latency`            | 20 simulated connects with latencies drawn from a configurable distribution                                                                                                     | live histogram vs 2 s line, p95 readout, "simulated" label |

Auth latency readout (all scenarios): `LatencyMeter` with value, 2.0 s spec line, p50/p95 of the
session, and the caption "Phone-measured, simulated" or "Phone-measured, BLE".

### 3.4 Onboarding, permissions, settings

**Onboarding**

1. `index`: "Control your parking barrier from your phone. Everything stays between your phone and the barrier: no internet, no cloud." (C5)
2. `bluetooth`: why Bluetooth is needed; button "Allow Bluetooth" triggers the request. Android 12+: BLUETOOTH_SCAN + BLUETOOTH_CONNECT runtime request; Android <= 11: location request with the explanation "Android requires Location access to scan for Bluetooth devices. The app never reads your location." If denied: deep link to Settings.
3. `enroll`: three illustrated steps with a 60 s ring timer the user starts:
   - "On the barrier, hold the button for 3 seconds." (`ENROLL_BUTTON_HOLD_MS`)
   - "You now have 60 seconds." Start the ring (`ENROLL_WINDOW_MS`); the phone cannot read the device's window, so the ring is the app's own countdown and says so.
   - "Tap Connect, then enter the 6-digit passkey from the barrier's label when your phone asks."
   - Note: "A barrier can have up to 2 owner phones."
4. `done`: "You're the owner." + "Authenticated in X.XX s".

**Settings**

- Transport: segmented `Simulated | Bluetooth`. Default `Bluetooth` in production builds, `Simulated` in dev. Switching disconnects first.
- This barrier: device id, nickname (local only), last counter (device-reported and local), "Forget this barrier" (destructive): clears stored device id, nonce, local counter; then instructs: "Also remove M010-Barrier in your phone's Bluetooth settings (iOS: Settings > Bluetooth > (i) > Forget This Device). To use it again you must re-enroll: hold the barrier's button 3 s." The app cannot remove the OS bond itself on iOS.
- Appearance: System / Light / Dark.
- About: app version and build (expo-application), contract version "INTERFACES.md as of 2026-11-15", scope note from FDR slide 15, licenses.

## 4. Design tokens

### 4.1 Color (all text/fill pairs checked for WCAG AA >= 4.5:1; computed 2026-11-15)

> **As built (authoritative):** `src/theme/tokens.ts`, contrast enforced by `src/__tests__/tokens.test.ts` (36 pairs,
> light and dark). Differences from the research table below: filled buttons in dark mode use deep fills with white
> labels (`tintFill #1A73E8`, `positiveFill #1A7A35`, `criticalFill #D11A2A`, `warningFill #B35200`, all >= 4.5:1 with
> `#FFFFFF`) instead of light fills with black labels; dark tint text is `#4DA3FF`; the selected segment in dark mode is
> `segmentThumb #636366` on a `#2C2C2E` track; disabled controls use one neutral style (`fill` + `secondaryLabel`).

| Token               | Light     | Dark      | Use                                           |
| ------------------- | --------- | --------- | --------------------------------------------- |
| `bg`                | `#F2F2F7` | `#000000` | grouped background                            |
| `surface`           | `#FFFFFF` | `#1C1C1E` | cards, cells                                  |
| `surfaceRaised`     | `#FFFFFF` | `#2C2C2E` | sheets, hero card                             |
| `separator`         | `#C6C6C8` | `#38383A` | hairlines (non-text, no contrast requirement) |
| `label`             | `#000000` | `#FFFFFF` | primary text                                  |
| `secondaryLabel`    | `#3C3C43` | `#EBEBF5` | secondary text                                |
| `tertiaryLabel`     | `#6C6C70` | `#AEAEB2` | captions                                      |
| `accent` / `motion` | `#0062CC` | `#409CFF` | RAISED, links, moving                         |
| `success`           | `#1E7B34` | `#30D158` | LOWERED, completed                            |
| `warning`           | `#9A5B00` | `#FFB340` | STOPPED, guard rejects                        |
| `danger`            | `#C4281C` | `#FF6961` | FAULT, STOP fill, destructive                 |
| `neutral`           | `#5B5B60` | `#AEAEB2` | UNKNOWN                                       |
| `onFill`            | `#FFFFFF` | `#000000` | text on filled buttons                        |

Measured contrast:

| Pair                    | Light | Dark  |
| ----------------------- | ----- | ----- |
| label / bg              | 18.82 | 21.00 |
| secondaryLabel / bg     | 9.80  | 17.73 |
| tertiaryLabel / bg      | 4.69  | 9.50  |
| tertiaryLabel / surface | 5.23  | 7.69  |
| accent / bg             | 5.20  | 7.42  |
| success / bg            | 4.78  | 10.39 |
| warning / bg            | 4.86  | 11.77 |
| danger / bg             | 5.13  | 7.45  |
| neutral / bg            | 6.05  | 9.50  |
| onFill / accent         | 5.80  | 7.42  |
| onFill / success        | 5.33  | 10.39 |
| onFill / warning        | 5.43  | 11.77 |
| onFill / danger         | 5.73  | 7.45  |
| onFill / neutral        | 6.75  | 9.50  |

The light-mode semantic colors are darkened versions of Apple's system colors so they pass AA as
text; iOS `systemGreen #34C759` on white is only about 2.2:1 and must not be used for text.
State is never conveyed by color alone: every state has a label and an icon (SF Symbols via
`expo-symbols`: `arrow.up.to.line`, `arrow.down.to.line`, `stop.fill`, `exclamationmark.triangle.fill`, `questionmark.circle`).

### 4.2 Typography (iOS HIG text styles at the default "Large" size; scale with Dynamic Type)

Sizes below are Apple's published defaults as known to the author; they were not re-fetched from
the HIG page today. Verify against developer.apple.com/design/human-interface-guidelines/typography
before freezing tokens.

| Token         | iOS style           | Size / line height (pt) | Weight                                   | Use                         |
| ------------- | ------------------- | ----------------------- | ---------------------------------------- | --------------------------- |
| `largeTitle`  | Large Title         | 34 / 41                 | Bold                                     | screen titles               |
| `title1`      | Title 1             | 28 / 34                 | Regular                                  | hero state label (Semibold) |
| `title2`      | Title 2             | 22 / 28                 | Regular                                  | section heads in sheets     |
| `title3`      | Title 3             | 20 / 25                 | Regular                                  | card titles                 |
| `headline`    | Headline            | 17 / 22                 | Semibold                                 | button labels, cell titles  |
| `body`        | Body                | 17 / 22                 | Regular                                  | text                        |
| `callout`     | Callout             | 16 / 21                 | Regular                                  | banners                     |
| `subheadline` | Subheadline         | 15 / 20                 | Regular                                  | sub-labels                  |
| `footnote`    | Footnote            | 13 / 18                 | Regular                                  | explanations                |
| `caption1`    | Caption 1           | 12 / 16                 | Regular                                  | chips, timestamps           |
| `caption2`    | Caption 2           | 11 / 13                 | Regular                                  | badges                      |
| `mono`        | (monospaced digits) | as body                 | Regular, `fontVariant: ['tabular-nums']` | latency, counters, hex      |

### 4.3 Spacing, radius, elevation, motion

- Spacing (4 pt grid): `xs 4`, `sm 8`, `md 12`, `lg 16`, `xl 24`, `xxl 32`, `xxxl 48`. Screen side margin 16 (20 on >= 428 pt wide).
- Radii: `chip 999`, `sm 8`, `md 12`, `lg 16` (cells/cards), `xl 24` (hero card, control buttons), `sheet 28`.
- Elevation: flat by default. `raised`: iOS shadow `#000` opacity 0.08, radius 16, offset (0, 4); Android `elevation 3`. Dark mode: no shadows, use `surfaceRaised`.
- Motion durations: `instant 100 ms` (press feedback), `fast 200 ms` (banners, chips), `standard 300 ms` (sheet, state color crossfade), `slow 500 ms` (hero transitions). Arm animation tracks real elapsed time with a 5000 ms nominal travel (`MOTION_NOMINAL_MS`); it eases out and holds at 95% until the end-limit Status arrives. Springs: damping 18, stiffness 180 for button press.
- Reduce Motion on: no looping arm animation (static arm + determinate progress bar), crossfades instead of slides, no spring overshoot.

## 5. Components

| Component          | Props                                                                                                                    | Notes                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `BarrierHero`      | `state: BarrierState; fault: FaultReason; progress?: number; elapsedMs?: number; reduceMotion: boolean`                  | illustration + label; accessible as one element: "Barrier, Raising, 3 seconds"      |
| `ControlPad`       | `state: BarrierState; status: DecodedStatus; connected: boolean; pending: Opcode \| null; onCommand(op: Opcode): void`   | LOWER/RAISE enablement per STATE_MACHINE.md 3.1; STOP always enabled when connected |
| `ControlButton`    | `kind: 'raise' \| 'lower' \| 'stop'; enabled: boolean; prominent: boolean; disabledReason?: string; onPress(): void`     | >= 64 pt high; disabledReason read by VoiceOver as hint                             |
| `ConnectionPill`   | `phase: 'idle' \| 'scanning' \| 'connecting' \| 'pairing' \| 'owner' \| 'notOwner' \| 'lost'`                            | header right                                                                        |
| `GuardChips`       | `zoneClear: boolean; sensorsValid: boolean; batteryMv: number; onPress(): void`                                          |                                                                                     |
| `GuardReasonList`  | `mask: number`                                                                                                           | renders set bits in priority order, CONTRACT.md 4.1 copy                            |
| `FaultCard`        | `fault: FaultReason`                                                                                                     | danger card with title, explanation, on-site reset instruction                      |
| `ResultBanner`     | `result: CmdResult; mask: number; zoneClear: boolean; onDismiss(): void`                                                 | auto-dismiss 4 s except FAULT/GUARD                                                 |
| `AuthLatencyBadge` | `ms: number \| null; specMs: 2000; source: 'ble' \| 'sim'`                                                               |                                                                                     |
| `LatencyMeter`     | `samples: number[]; specMs: number; label: string`                                                                       | p50/p95 + histogram, presenter and Health                                           |
| `LocalOnlyChip`    | none                                                                                                                     | "Local only" with `wifi.slash` symbol                                               |
| `DeviceRow`        | `name: string; rssi: number \| null; known: boolean; phase?: ConnectPhase; onPress(): void`                              |                                                                                     |
| `StepList`         | `steps: {label: string; state: 'todo' \| 'active' \| 'done' \| 'error'}[]`                                               | connect progress, onboarding                                                        |
| `CountdownRing`    | `totalMs: number; startedAt: number \| null; label: string`                                                              | enrollment 60 s                                                                     |
| `EventRow`         | `entry: LogEntry`                                                                                                        | log list                                                                            |
| `SettingsRow`      | `title: string; value?: string; destructive?: boolean; onPress?(): void; accessory?: 'chevron' \| 'switch'`              |                                                                                     |
| `SegmentedControl` | `options: string[]; value: string; onChange(v: string): void`                                                            | transport, theme, log filter                                                        |
| `SimulatedBadge`   | none                                                                                                                     | presenter + sim transport                                                           |
| `ScenarioDrawer`   | `scenario: Scenario; stepIndex: number; onNext(): void; onAuto(): void; toggles: InterlockToggles; onToggle(k, v): void` | presenter                                                                           |

## 6. Accessibility rules

- Dynamic Type: every text uses the type tokens with `allowFontScaling` on; test at AX5. Layout reflows: ControlPad stacks LOWER above RAISE above STOP at accessibility sizes; STOP stays on screen without scrolling.
- VoiceOver / TalkBack: every control has `accessibilityRole="button"`, label ("Raise barrier"), state (`disabled`), and hint (the disabledReason). Hero has `accessibilityLiveRegion="polite"` (Android) and posts `AccessibilityInfo.announceForAccessibility` on state and result changes ("Barrier lowered", "Can't move: something's in the way").
- Targets >= 44 x 44 pt (Apple) / 48 dp (Android); control buttons >= 64 pt.
- Contrast: AA (4.5:1 text, 3:1 large text and UI glyphs) using the tokens above; never color-only state.
- Reduce Motion: respect `AccessibilityInfo.isReduceMotionEnabled()` / Reanimated's reduced-motion setting (section 4.3).
- Haptics are additive; every haptic event also has a visual and spoken equivalent.
- Destructive actions (Forget barrier, Clear log) require confirmation with a clear cancel.

## 7. Requirement visibility

| Requirement            | Where the app shows it                                                                                                                           | Wording rule                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| C5 100% local          | `LocalOnlyChip` on Control and Health; onboarding step 1; About. The app declares no network use (no analytics, no OTA updates in this project). | "Local only"                             |
| S5 auth <= 2 s         | `AuthLatencyBadge` per session, Health "This session", presenter `LatencyMeter`                                                                  | "phone-measured", never "passed"         |
| S6 >= 90% accuracy     | Health tallies of accepted vs rejected auth attempts this phone observed; presenter `replayed-command` and `not-owner` scenarios                 | "scored on the bench with log_parser s6" |
| C4 150 ms control loop | Health requirements panel and presenter footnote: "Stop timing is measured on the barrier itself (UART log), not by this app."                   | the app cannot measure it                |
