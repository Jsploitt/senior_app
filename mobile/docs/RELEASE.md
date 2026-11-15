# RELEASE: M010 Barrier mobile app

_Draft. Build links, numbers and commit hash are filled in Phase 4._

## Builds

| Platform | Profile | Build | Link / status |
| --- | --- | --- | --- |
| Android APK | `preview` | TBD | TBD |
| iOS (TestFlight) | `production` | TBD | TBD |

Commit: TBD (branch `expo-rewrite`).

## Known limitations

- **Everything BLE is untested on hardware.** No ESP32-S3 board or phone was available during the build. The firmware
  itself is also marked untested on hardware (`firmware/components/ble_auth/README.md`, `tools/ble_client.py:9-12`).
- Simulation (default transport) runs a TypeScript port of `barrier_fsm.c`, `motion_guard.c` and `cmd_validator.c`.
  The port matches the host-compiled C on all 84 state x event cases and 15 freshness cases (`docs/vectors.json`),
  but arm travel time (4 s) and BLE latencies in the sim are app-chosen demo values, not measurements.
- Auth latency shown in the app is phone-measured (connect call -> Session + Status read). It is a proxy for Spec 5,
  not the official measurement.
- Spec 6 accuracy is scored on the bench with `tools/log_parser.py s6`; the app shows only phone-observed tallies.
- Constraint 4 (150 ms control loop) is a firmware property measured from UART logs; the app cannot measure it.

## Firmware gaps and requests (firmware repo was read-only for this work)

1. **No owner list / revoke over BLE.** There is no characteristic to list or remove owner phones; revoke is
   `ble_auth_revoke_all()` on site only. The app therefore has no owner-management screen. Request: a read-only
   owner-count field (e.g. in the reserved Status byte 5) and an authenticated revoke-self command.
2. **No solar telemetry.** Status carries only `battery_mv`; no panel voltage / charge current / state of charge.
3. **"Distance-aware" vehicle authentication scope open** (`docs/ARCHITECTURE.md` section 7). The app implements
   phone-owner authorization only.
4. **K1: command counter not restored after device reboot** (`main.c:326` loads with no current owner, so
   `ble_auth_counter_load(-1)` returns 0). The app copes by resyncing from `Status.last_counter`, but the
   replay-protection gap is a firmware issue. Request: reload the owner's counter in `begin_session`.
5. **K7: stop cause not on the wire.** `barrier_types.h:126` says stop causes go to status, but the 12-byte payload has
   no field; the app cannot tell "stopped by obstruction" from "stopped by link loss". Request: use reserved byte 5.
6. **K9: two owners share one session**; a second owner connecting replaces the nonce, so the first owner's frames
   get REJECTED_AUTH. The app shows a reconnect prompt.
7. **No enrollment-window or fault-clear visibility over BLE.** The phone cannot read whether the 60 s window is
   open; the onboarding countdown is the app's own timer.
8. **STOP frames go through freshness rules**: a stale STOP is rejected. The app resyncs and retries once.

See `docs/CONTRACT.md` section 12 (K1-K10) for citations.

## Hardware test checklist

To run on a real unit with this build (record results in `docs/PROGRESS.md`):

- [ ] Enrollment: hold button 3 s, UART logs `EVT_ENROLL_OPEN`; pair within 60 s using the label passkey (iOS and Android).
- [ ] Pairing outside the window is rejected; app shows the enrollment-window message.
- [ ] Third phone when 2 owners exist: Session read fails with insufficient authorization; app shows "not an owner".
- [ ] Every command: LOWER from RAISED, RAISE from LOWERED, STOP mid-travel, LOWER from UNKNOWN, RAISE from UNKNOWN rejected (mask 0x04).
- [ ] Guard rejects: obstruction (0x10), sensor invalid (0x08), low battery (0x20), fault latched (0x44).
- [ ] Counter resync: reboot the unit (K1), send a command, confirm one REJECTED_STALE then accepted retry.
- [ ] Link-loss stop: walk out of range / kill the app mid-travel; arm stops (UART `EVT_UNSAFE_DETECTED`, `EVT_ACT_STOP_ISSUED`); app shows link lost.
- [ ] Measured auth latency vs 2 s: 10 connects, export CSV, compute p50/p95.
- [ ] 10-trial accuracy run vs 90 %: owner + replay/stale/no-pair attempts; cross-check with `tools/log_parser.py s6`.
