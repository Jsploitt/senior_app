# Barrier FSM and the UI it drives

Source of truth: the table in `docs/INTERFACES.md:64-111` and its implementation
`firmware/components/barrier_fsm/barrier_fsm.c` (paths relative to the firmware repo root).
Every row below was also executed: the pure FSM (`barrier_fsm.c` + `motion_guard.c`) was compiled
with gcc on the host and stepped through all 7 states x 10 events (84 rows incl. guard variants).
The machine-readable result is `docs/vectors.json` -> `fsm_matrix`; the simulated transport must
reproduce it exactly.

## 1. Vocabulary

States (`firmware/components/barrier_types/include/barrier_types.h:23-32`): UNKNOWN 0, RAISED 1,
LOWERED 2, RAISING 3, LOWERING 4, STOPPED 5, FAULT 6.

Events (`firmware/components/barrier_fsm/include/barrier_fsm.h:22-34`): CMD_RAISE, CMD_LOWER,
CMD_STOP, LIMIT_RAISED, LIMIT_LOWERED, INTERLOCK_UNSAFE, LINK_LOST, MOTION_TIMEOUT, FAULT,
FAULT_CLEAR. Only the three CMD_* events originate from the phone; everything else is device-side.

Actions (`barrier_fsm.h:42-47`): NONE, DRIVE_UP, DRIVE_DOWN, STOP (idempotent).

Guard G (`docs/INTERFACES.md:66-68`, `docs/ARCHITECTURE.md:54-57`): `MotionAllowed =
OwnerAuthorized AND FreshCommand AND ValidPosition AND SensorsValid AND ZoneClear AND PowerHealthy
AND NOT FaultLatched`. The FSM overwrites `position_valid` and `fault_latched` itself
(`barrier_fsm.c:37-39`). ValidPosition (`barrier_fsm.c:276-290`): RAISE from LOWERED/STOPPED;
LOWER from RAISED/STOPPED/UNKNOWN; STOP always.

Phone commands reach the FSM only after the freshness check passes
(`firmware/main/main.c:276-301`); freshness failures never enter the table below and are shown as
REJECTED_AUTH / REJECTED_STALE / REJECTED_FORMAT with the state unchanged
(`firmware/main/main.c:294-300`).

Timer column: A = arm 7000 ms motion timer (`app_config.h:52`, `main.c:238-241`), C = cancel.

## 2. Transition table (verbatim rows + verified implementation)

`IF` = `docs/INTERFACES.md`, `FSM` = `firmware/components/barrier_fsm/barrier_fsm.c`.

| #   | From                      | Event                          | Condition                              | To                                          | Action     | Result (wire)                                         | Timer | Cite                                |
| --- | ------------------------- | ------------------------------ | -------------------------------------- | ------------------------------------------- | ---------- | ----------------------------------------------------- | ----- | ----------------------------------- |
| 1   | UNKNOWN                   | CMD_LOWER                      | G ok                                   | LOWERING                                    | DRIVE_DOWN | ACCEPTED 1                                            | A     | `IF:72`, `FSM:42-49`                |
| 2   | UNKNOWN                   | CMD_LOWER / CMD_RAISE          | G fails (RAISE always fails: position) | UNKNOWN                                     | NONE       | REJECTED_GUARD 6 + mask                               |       | `IF:73`, `FSM:50-56`                |
| 3   | UNKNOWN                   | LIMIT_RAISED                   |                                        | RAISED                                      | STOP       | NONE 0                                                |       | `IF:74`, `FSM:107-111`              |
| 4   | UNKNOWN                   | LIMIT_LOWERED                  |                                        | LOWERED                                     | STOP       | NONE 0                                                |       | `IF:75`, `FSM:107-111`              |
| 5   | LOWERED                   | CMD_RAISE                      | G ok                                   | RAISING                                     | DRIVE_UP   | ACCEPTED 1                                            | A     | `IF:76`, `FSM:42-49`                |
| 6   | LOWERED                   | CMD_RAISE / CMD_LOWER          | G fails (LOWER always fails: position) | LOWERED                                     | NONE       | REJECTED_GUARD 6                                      |       | `IF:77`                             |
| 7   | RAISED                    | CMD_LOWER                      | G ok                                   | LOWERING                                    | DRIVE_DOWN | ACCEPTED 1                                            | A     | `IF:78`                             |
| 8   | RAISED                    | CMD_RAISE / CMD_LOWER          | G fails (RAISE always fails: position) | RAISED                                      | NONE       | REJECTED_GUARD 6                                      |       | `IF:79`                             |
| 9   | STOPPED                   | CMD_RAISE                      | G ok                                   | RAISING                                     | DRIVE_UP   | ACCEPTED 1                                            | A     | `IF:80`                             |
| 10  | STOPPED                   | CMD_LOWER                      | G ok                                   | LOWERING                                    | DRIVE_DOWN | ACCEPTED 1                                            | A     | `IF:81`                             |
| 11  | STOPPED                   | CMD_RAISE / CMD_LOWER          | G fails                                | STOPPED                                     | NONE       | REJECTED_GUARD 6                                      |       | `IF:82`                             |
| 12  | STOPPED                   | LIMIT_RAISED                   |                                        | RAISED                                      | STOP       | NONE 0                                                |       | `IF:83`, `FSM:107-111`              |
| 13  | STOPPED                   | LIMIT_LOWERED                  |                                        | LOWERED                                     | STOP       | NONE 0                                                |       | `IF:84`                             |
| 14  | RAISING                   | LIMIT_RAISED                   |                                        | RAISED                                      | STOP       | COMPLETED 2                                           | C     | `IF:85`, `FSM:113-118`              |
| 15  | RAISING                   | LIMIT_LOWERED                  |                                        | FAULT (LIMIT_CONFLICT 2)                    | STOP       | FAULT 8                                               | C     | `IF:86`, `FSM:118-124`              |
| 16  | LOWERING                  | LIMIT_LOWERED                  |                                        | LOWERED                                     | STOP       | COMPLETED 2                                           | C     | `IF:87`, `FSM:132-137`              |
| 17  | LOWERING                  | LIMIT_RAISED                   |                                        | FAULT (LIMIT_CONFLICT 2)                    | STOP       | FAULT 8                                               | C     | `IF:88`, `FSM:127-131`              |
| 18  | RAISING / LOWERING        | CMD_STOP                       |                                        | STOPPED (cause COMMAND)                     | STOP       | STOPPED 3                                             | C     | `IF:89`, `FSM:76-80`                |
| 19  | RAISING / LOWERING        | INTERLOCK_UNSAFE               |                                        | STOPPED (cause from event)                  | STOP       | STOPPED 3                                             | C     | `IF:90`, `FSM:169-175`              |
| 20  | RAISING / LOWERING        | LINK_LOST                      |                                        | STOPPED (cause LINK_LOST)                   | STOP       | STOPPED 3                                             | C     | `IF:91`, `FSM:169-175`              |
| 21  | RAISING / LOWERING        | MOTION_TIMEOUT                 |                                        | FAULT (MOTION_TIMEOUT 1)                    | STOP       | FAULT 8                                               | C     | `IF:92`, `FSM:195-201`              |
| 22  | RAISING / LOWERING        | CMD_RAISE / CMD_LOWER          |                                        | unchanged                                   | NONE       | REJECTED_GUARD 6, mask includes INVALID_POSITION 0x04 |       | `IF:93`, `FSM:276-290`              |
| 23  | any non-moving, non-FAULT | CMD_STOP                       |                                        | unchanged (STOPPED refreshes cause COMMAND) | STOP       | STOPPED 3                                             |       | `IF:94`, `FSM:81-86`                |
| 24  | any non-moving            | INTERLOCK_UNSAFE / LINK_LOST   |                                        | unchanged                                   | NONE       | NONE 0                                                |       | `IF:95`, `FSM:176-180`              |
| 25  | any non-moving            | MOTION_TIMEOUT                 | stale timer                            | unchanged                                   | NONE       | NONE 0                                                |       | `IF:96`, `FSM:202-206`              |
| 26  | any except FAULT          | FAULT                          |                                        | FAULT (ev.fault)                            | STOP       | FAULT 8                                               | C     | `IF:97`, `FSM:223-230`              |
| 27  | FAULT                     | CMD_STOP                       |                                        | FAULT                                       | STOP       | STOPPED 3                                             |       | `IF:98`, `FSM:67-87`                |
| 28  | FAULT                     | CMD_RAISE / CMD_LOWER          |                                        | FAULT                                       | NONE       | REJECTED_GUARD 6, mask >= 0x44                        |       | `IF:99`, `FSM:37-39`                |
| 29  | FAULT                     | FAULT_CLEAR (on-site 8 s hold) |                                        | UNKNOWN, fault -> NONE                      | STOP       | NONE 0                                                |       | `IF:100`, `FSM:242-247`             |
| 30  | FAULT                     | anything else                  |                                        | FAULT                                       | NONE       | NONE 0                                                |       | `IF:101`, `FSM:144-148`, `:219-222` |
| 31  | not FAULT                 | FAULT_CLEAR                    |                                        | unchanged                                   | NONE       | NONE 0                                                |       | `IF:102`, `FSM:248-252`             |
| 32* | RAISED / LOWERED          | LIMIT_RAISED / LIMIT_LOWERED   | (not in INTERFACES.md)                 | unchanged                                   | STOP       | NONE 0                                                |       | `FSM:94-96`, `:139-143`             |
| 33* | boot                      | both limits asserted           |                                        | FAULT (LIMIT_CONFLICT)                      |            |                                                       |       | `FSM:259-261`                       |
| 34* | boot                      | one limit asserted             |                                        | RAISED or LOWERED; else UNKNOWN             |            |                                                       |       | `FSM:262-271`                       |

Rows marked * exist only in the implementation (see CONTRACT.md Conflict K2). FAULT row 26 sources:
`EV_FAULT` comes from `safety_task` for SENSOR_PERSISTENT and POWER_CRITICAL
(`firmware/components/safety_interlocks/safety_interlocks.c:222-238`).

Global rules (`IF:104-111`): no DRIVE without GUARD_OK in the same call; `last_stop_cause` updated
on every entry into STOPPED; `fault` set on FAULT entry, cleared on FAULT_CLEAR; UNKNOWN allows
LOWER only (marked "design decision to confirm with ME", `IF:110-111`).

## 3. Display model

The UI renders from the **last decoded Status** only, never from what the app requested
(`docs/ARCHITECTURE.md:35`, FDR slide 10: "An accepted command is permission to begin a monitored
movement, not proof that movement finished").

### 3.1 Per-state screen

| State    | Hero label                    | Sub-label                                    | Color role          | LOWER    | RAISE                                                | STOP                 | Arm illustration       |
| -------- | ----------------------------- | -------------------------------------------- | ------------------- | -------- | ---------------------------------------------------- | -------------------- | ---------------------- |
| UNKNOWN  | "Position unknown"            | "Lower to home the barrier"                  | `neutral`           | enabled  | disabled (explain "Lower first to confirm position") | enabled              | dashed arm, mid        |
| RAISED   | "Space reserved"              | "Barrier is up"                              | `accent`            | enabled  | disabled                                             | enabled              | arm up                 |
| LOWERED  | "Open to park"                | "Barrier is down"                            | `success`           | disabled | enabled                                              | enabled              | arm flat               |
| RAISING  | "Raising..."                  | live elapsed / 5 s nominal                   | `motion` (animated) | disabled | disabled                                             | **enabled, primary** | arm animating up       |
| LOWERING | "Lowering..."                 | live elapsed / 5 s nominal                   | `motion` (animated) | disabled | disabled                                             | **enabled, primary** | arm animating down     |
| STOPPED  | "Stopped mid-travel"          | "Choose a direction"                         | `warning`           | enabled  | enabled                                              | enabled              | arm at mid angle       |
| FAULT    | fault title (CONTRACT.md 4.1) | "Needs on-site reset (hold unit button 8 s)" | `danger`            | disabled | disabled                                             | enabled              | arm with warning badge |

Button enablement mirrors `fsm_position_valid()` (`barrier_fsm.c:276-290`) **plus** live Status:
disable RAISE/LOWER (and say why inline) when `zone_clear = 0`, `sensors_valid = 0`, or
`battery_mv < 11800` (`app_config.h:39`), because the guard will reject them. Never disable STOP
while connected; it is the only command allowed in every state (rows 18, 23, 27).

"Nominal 5 s" from `MOTION_NOMINAL_MS` (`app_config.h:51`); show a soft warning after 5 s and
expect FAULT at 7 s (`app_config.h:52`).

### 3.2 Per-result banner and haptic

| Result            | Banner                                                     | Haptic (expo-haptics)                                  |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| ACCEPTED 1        | none (hero animates)                                       | `impactAsync(Medium)` on send; nothing extra on accept |
| COMPLETED 2       | "Barrier is up" / "Barrier is down"                        | `notificationAsync(Success)`                           |
| STOPPED 3         | "Stopped" (+ "Something's in the way" if `zone_clear = 0`) | `impactAsync(Heavy)`                                   |
| REJECTED_AUTH 4   | "Not authorized: reconnecting"                             | `notificationAsync(Error)`                             |
| REJECTED_STALE 5  | "Command expired: try again"                               | `notificationAsync(Warning)`                           |
| REJECTED_GUARD 6  | "Can't move right now" + one row per guard bit             | `notificationAsync(Warning)`                           |
| REJECTED_FORMAT 7 | "App error"                                                | `notificationAsync(Error)`                             |
| FAULT 8           | fault title, persistent red card                           | `notificationAsync(Error)`                             |
| NONE 0            | none                                                       | none                                                   |

### 3.3 Row -> UI mapping (what the user sees after each table row)

| Row                | UI after the Status arrives                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, 7, 10           | Hero "Lowering...", motion color, STOP becomes the primary button; LOWER/RAISE disabled                                                                                                             |
| 5, 9               | Hero "Raising...", same                                                                                                                                                                             |
| 2, 6, 8, 11        | State unchanged; amber sheet "Can't move right now" listing each guard bit (CONTRACT.md 4.1); warning haptic                                                                                        |
| 3, 12              | Hero "Space reserved" (no banner: result NONE, a limit confirmed position)                                                                                                                          |
| 4, 13              | Hero "Open to park"                                                                                                                                                                                 |
| 14                 | "Barrier is up" success banner + success haptic                                                                                                                                                     |
| 16                 | "Barrier is down" success banner + success haptic                                                                                                                                                   |
| 15, 17             | Red fault card "Position sensors disagree"; all motion disabled except STOP                                                                                                                         |
| 18                 | Hero "Stopped mid-travel" (warning), heavy haptic                                                                                                                                                   |
| 19                 | Same as 18, banner "Stopped for safety" (+ "Something's in the way" if `zone_clear = 0`, "Sensor problem" if `sensors_valid = 0`)                                                                   |
| 20                 | Phone is disconnected, so it sees this only on reconnect: hero "Stopped mid-travel", banner "Stopped because the connection dropped" (inferred: previous app state was moving and the link dropped) |
| 21                 | Red fault card "Arm didn't finish moving"                                                                                                                                                           |
| 22                 | Cannot happen from the app normally (buttons disabled while moving); if it does: warning banner "Already moving"                                                                                    |
| 23                 | No state change; quiet toast "Already stopped"; no haptic beyond the send tap                                                                                                                       |
| 24, 25, 30, 31, 32 | No visible change                                                                                                                                                                                   |
| 26                 | Red fault card with the specific fault title                                                                                                                                                        |
| 27                 | Toast "Barrier is locked by a fault; STOP sent"                                                                                                                                                     |
| 28                 | Fault card stays; inline "Locked by a fault"                                                                                                                                                        |
| 29                 | (On-site action) Hero "Position unknown"; fault card dismissed; LOWER enabled                                                                                                                       |
| 33                 | On connect: fault card "Position sensors disagree"                                                                                                                                                  |

## 4. What STOP does in each state

| State                                   | Device effect of a fresh STOP              | Wire result | Citation                       |
| --------------------------------------- | ------------------------------------------ | ----------- | ------------------------------ |
| RAISING / LOWERING                      | actuator stop, -> STOPPED, timer cancelled | STOPPED 3   | `barrier_fsm.c:76-80`          |
| STOPPED                                 | actuator stop (repeat), cause refreshed    | STOPPED 3   | `barrier_fsm.c:81-86`          |
| UNKNOWN / RAISED / LOWERED              | actuator stop (hold), state unchanged      | STOPPED 3   | `barrier_fsm.c:81-86`          |
| FAULT                                   | actuator stop, stays FAULT                 | STOPPED 3   | `barrier_fsm.c:67-87`          |
| any, frame stale / bad nonce / no owner | **nothing**; rejected                      | 4 or 5      | `firmware/main/main.c:276-285` |

STOP always consumes a counter when it passes freshness (`main.c:270-274`); a retry needs
`counter + 1`. STOP is never guard-checked (`docs/ARCHITECTURE.md:69`).

## 5. Link-loss behaviour

| Phase      | Device                                                                                                                                          | App                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Radio lost | detects after up to 4 s supervision timeout (`firmware/components/ble_auth/ble_auth_gap.c:48`)                                                  | ble-plx `onDeviceDisconnected` fires on the phone's own timeout                                  |
| Disconnect | if moving: direct `actuator_stop()` before anything else, logs UNSAFE_DETECTED/ACT_STOP_ISSUED cause LINK_LOST (`firmware/main/main.c:148-160`) | show "Connection lost. The barrier stops automatically if it was moving." Disable all controls.  |
| FSM        | RAISING/LOWERING -> STOPPED, others unchanged (row 20/24)                                                                                       | n/a                                                                                              |
| Session    | validator session ended, `owner_connected = 0` (`main.c:355-359`)                                                                               | discard cached nonce                                                                             |
| Reconnect  | new nonce on authorization (`ble_auth_gap.c:119`)                                                                                               | auto-reconnect with backoff (1 s, 2 s, 4 s, cap 8 s); re-read Session and Status; resync counter |

The app must never imply that losing the phone leaves the arm moving: per `docs/ARCHITECTURE.md:68`
and FDR slide 10, local protection does not depend on an active phone connection.
