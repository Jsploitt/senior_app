# M010 Smart Parking Barrier: BLE wire contract (phone side)

Status: Phase 0 research, docs only. Written 2026-11-15 against the firmware repo
`m010-barrier-firmware` at commit `342c4ac` ("Merge pull request #8 from Jsploitt/ppr/sim-evidence"), working tree clean.

**Citation convention.** Every `path:line` is relative to the firmware repo root
(`C:\Users\Moutaz\Desktop\KFUPM\Term261\m010-barrier-firmware`). `INTERFACES.md` means
`docs/INTERFACES.md`. Where a value exists only in C source and not in the normative docs, that is
stated. Where the firmware sources say nothing, the text says "not specified in firmware sources".

**Normative order.** `docs/INTERFACES.md:3-6` says the C headers plus INTERFACES.md are the
contract. When the `.c` implementation and the docs disagree, the app must match what the
firmware **does** (the `.c` files run on the board); every such case is listed in
[Conflicts](#12-conflicts).

**Hardware status.** Every firmware BLE behaviour is "untested on hardware"
(`firmware/components/ble_auth/README.md:142-147`, `tools/ble_client.py:9-12`).

---

## 1. Identity and discovery

| Item                         | Value                                                                       | Citation                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Device name                  | `M010-Barrier`                                                              | `firmware/components/barrier_types/include/app_config.h:73`, `INTERFACES.md:21`, `tools/ble_client.py:71` |
| Name use                     | discovery only, carries no authority                                        | `INTERFACES.md:21-22`, `firmware/components/ble_auth/ble_auth_gatt.c:233`                                 |
| Advertising type             | connectable undirected, general discoverable, forever                       | `firmware/components/ble_auth/ble_auth_gap.c:294-298`                                                     |
| Adv flags                    | `BLE_HS_ADV_F_DISC_GEN \| BLE_HS_ADV_F_BREDR_UNSUP`                         | `firmware/components/ble_auth/ble_auth_gap.c:268`                                                         |
| Service UUID location        | **advertising data** (complete 128-bit list)                                | `firmware/components/ble_auth/ble_auth_gap.c:269-271`                                                     |
| Name location                | **scan response** (complete local name)                                     | `firmware/components/ble_auth/ble_auth_gap.c:279-286`                                                     |
| Re-advertise                 | after every connect while a slot is free, after disconnect, on adv complete | `firmware/components/ble_auth/ble_auth_gap.c:172`, `:150`, `:235`, `:259-261`                             |
| Max simultaneous connections | 2                                                                           | `firmware/sdkconfig.defaults:20`, `firmware/components/ble_auth/ble_auth_internal.h:45`                   |
| Own address type             | inferred by `ble_hs_id_infer_auto(0, ...)` (privacy off)                    | `firmware/components/ble_auth/ble_auth_gap.c:311-316`                                                     |

**App rule:** scan with a **service-UUID filter** `f5f61d53-97e4-4601-8204-81943dd7e865`
(always in the primary advertisement). Do not filter on name alone: the name is only in the scan
response, so a passive scan does not see it. Never treat the name as identity.

## 2. GATT service

| Item            | UUID                                   | Properties (NimBLE flags)                                                                      | Payload            | Citation                                                                                                           |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Barrier service | `f5f61d53-97e4-4601-8204-81943dd7e865` | primary                                                                                        |                    | `INTERFACES.md:16`, `firmware/components/ble_auth/ble_auth_gatt.c:31-33`, `:204-205`, `tools/ble_client.py:73`     |
| Command         | `d6a1e91e-0067-4e39-b4b2-b9c0d3032d84` | `WRITE \| WRITE_ENC \| WRITE_AUTHEN` (write **with response**; no write-without-response flag) | 9-byte frame       | `INTERFACES.md:17`, `firmware/components/ble_auth/ble_auth_gatt.c:34-36`, `:183`, `tools/ble_client.py:74`, `:226` |
| Status          | `40bad457-f09d-43a8-8ccf-fe7cf09786a1` | `READ \| READ_ENC \| READ_AUTHEN \| NOTIFY`                                                    | 12 bytes           | `INTERFACES.md:18`, `firmware/components/ble_auth/ble_auth_gatt.c:37-39`, `:189-190`, `tools/ble_client.py:75`     |
| Session         | `1cd43f12-2ee3-472f-90c9-55907f75d50b` | `READ \| READ_ENC \| READ_AUTHEN`                                                              | 4 bytes, LE uint32 | `INTERFACES.md:19`, `firmware/components/ble_auth/ble_auth_gatt.c:40-42`, `:196`, `tools/ble_client.py:76`         |

UUID byte order was cross-checked: reversing each `BLE_UUID128_INIT` byte array in
`ble_auth_gatt.c:31-42` reproduces the INTERFACES.md strings exactly (script in scratch, all four
`True`).

MTU: not specified in firmware sources. Largest payload is 12 bytes
(`firmware/components/ble_auth/ble_auth_gatt.c:28`), which fits the default ATT MTU of 23
(20-byte payload), so the app must **not** depend on an MTU exchange.

Notify CCCD: subscription is tracked per connection on `BLE_GAP_EVENT_SUBSCRIBE` for the Status
value handle (`firmware/components/ble_auth/ble_auth_gap.c:216-221`). Notifications go to every
subscribed connection, owner or not (`firmware/components/ble_auth/ble_auth_gatt.c:86-93`).

## 3. Command frame (9 bytes, little-endian)

| Offset | Size | Field         | Values                                              | Citation                                                                                                        |
| ------ | ---- | ------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 0      | 1    | opcode        | `0x01` RAISE, `0x02` LOWER, `0x03` STOP             | `INTERFACES.md:28`, `firmware/components/barrier_types/include/barrier_types.h:38-41`, `tools/ble_client.py:81` |
| 1      | 4    | counter       | uint32 LE, strictly increasing per bond             | `INTERFACES.md:29`, `firmware/components/cmd_validator/cmd_validator.c:56-57`                                   |
| 5      | 4    | session_nonce | uint32 LE, value read from Session after connecting | `INTERFACES.md:30`, `firmware/components/cmd_validator/cmd_validator.c:58-59`                                   |

- Frame length constant `CMD_FRAME_LEN 9u`: `firmware/components/barrier_types/include/barrier_types.h:44`; `tools/ble_client.py:80`.
- `CMD_NONE = 0x00` exists in the enum but is not a valid wire opcode (`barrier_types.h:38`, `firmware/components/cmd_validator/cmd_validator.c:38-42`).
- Python struct: `"<BII"` (`tools/ble_client.py:79`). Firmware encoder: `cmd_encode()` (`firmware/components/cmd_validator/cmd_validator.c:90-110`).
- Oversized writes: the GATT callback copies at most 13 bytes and passes the real length on
  (`firmware/components/ble_auth/ble_auth_gatt.c:161-171`); `main` clamps any length > 9 to 10
  so the parser reports `BAD_LENGTH` (`firmware/main/main.c:127`).

**ATT write success is not command acceptance.** Once the connection is the owner, the Command
access callback returns 0 (ATT success) for every write regardless of content
(`firmware/components/ble_auth/ble_auth_gatt.c:170-173`). Parsing, freshness and the guard run
later in `control_task` (`firmware/main/main.c:252-319`). The outcome is only visible in the next
Status (`last_result`, `last_counter`, `guard_fail_mask`).

## 4. Status payload (12 bytes, little-endian)

| Offset | Size | Field                        | Packing in firmware                                                                                     | Citation                                                              |
| ------ | ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 0      | 1    | state (`barrier_state_t`)    | `buf[0]`                                                                                                | `INTERFACES.md:39`, `firmware/components/ble_auth/ble_auth_gatt.c:62` |
| 1      | 1    | last_result (`cmd_result_t`) | `buf[1]`                                                                                                | `INTERFACES.md:40`, `ble_auth_gatt.c:63`                              |
| 2      | 1    | fault (`fault_reason_t`)     | `buf[2]`                                                                                                | `INTERFACES.md:41`, `ble_auth_gatt.c:64`                              |
| 3      | 1    | guard_fail_mask              | `buf[3]`                                                                                                | `INTERFACES.md:42`, `ble_auth_gatt.c:65`                              |
| 4      | 1    | flags                        | bit0 `zone_clear` (0x01), bit1 `sensors_valid` (0x02), bit2 `owner_connected` (0x04); bits 3-7 always 0 | `INTERFACES.md:43`, `ble_auth_gatt.c:66-68`                           |
| 5      | 1    | reserved                     | always 0                                                                                                | `INTERFACES.md:44`, `ble_auth_gatt.c:69`                              |
| 6      | 2    | battery_mv (uint16 LE)       | `buf[6..7]`                                                                                             | `INTERFACES.md:45`, `ble_auth_gatt.c:70-71`                           |
| 8      | 4    | last_counter (uint32 LE)     | `buf[8..11]`                                                                                            | `INTERFACES.md:46`, `ble_auth_gatt.c:72-75`                           |

(`ble_auth_gatt.c` = `firmware/components/ble_auth/ble_auth_gatt.c`.) Python struct `"<BBBBBBHI"`,
length 12 (`tools/ble_client.py:84-85`); decoder `parse_status()` raises on any length != 12
(`tools/ble_client.py:112-129`).

**Field semantics the app must respect:**

| Field              | Semantics                                                                                                                          | Citation                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| state, last_result | overwritten after every FSM step and every rejection                                                                               | `firmware/main/main.c:89-97`, `:246`, `:264-266`, `:281-283`, `:297-299`                      |
| guard_fail_mask    | **sticky**: only written when `last_result == REJECTED_GUARD`; keeps the old mask otherwise. Show it only when `last_result == 6`. | `firmware/main/main.c:94-96`, `firmware/components/barrier_types/include/barrier_types.h:144` |
| fault              | copied from the FSM after every FSM step; `FAULT_NONE` again after fault clear                                                     | `firmware/main/main.c:247`, `firmware/components/barrier_fsm/barrier_fsm.c:242-246`           |
| zone_clear         | `obstruction_valid && zone_clear`                                                                                                  | `firmware/main/main.c:117`                                                                    |
| sensors_valid      | `obstruction_valid && limits_valid && power_valid`                                                                                 | `firmware/main/main.c:118`                                                                    |
| owner_connected    | set true in the same handler that starts the validator session; false on link loss                                                 | `firmware/main/main.c:362-366`, `:355-359`                                                    |
| battery_mv         | raw validated view value; refreshed on each RAISE/LOWER and on the 1 s heartbeat                                                   | `firmware/main/main.c:119`, `:309`, `:450-455`                                                |
| last_counter       | the validator's last accepted counter; updated only on a frame that passes freshness. **Starts at 0 after every boot**             | `firmware/main/main.c:271-274`, `:487`                                                        |
| last_stop_cause    | **not on the wire**; status cannot say why the arm stopped                                                                         | `firmware/components/barrier_types/include/barrier_types.h:126`, `:140-150`                   |

Notification cadence: `status_task` polls every 20 ms and notifies when the snapshot is dirty
or every 1000 ms as a heartbeat (`firmware/main/main.c:378-379`, `:450-459`). There is no
timestamp or sequence number in Status (`tools/ble_client.py:16-20`), so consecutive
identical outcomes produce byte-identical notifications.

### 4.1 Enum values

**barrier_state_t** (`firmware/components/barrier_types/include/barrier_types.h:23-32`)

| Value | Name     | Meaning (source comment)                                                  |
| ----- | -------- | ------------------------------------------------------------------------- |
| 0     | UNKNOWN  | boot, or after fault clear, until a limit input confirms position (`:24`) |
| 1     | RAISED   | arm up: space reserved; confirmed by raised end-limit (`:25`)             |
| 2     | LOWERED  | arm down: owner can enter; confirmed by lowered end-limit (`:26`)         |
| 3     | RAISING  | (`:27`)                                                                   |
| 4     | LOWERING | (`:28`)                                                                   |
| 5     | STOPPED  | halted mid-travel by the stop path; position between limits (`:29`)       |
| 6     | FAULT    | latched; only an explicit fault clear leaves this state (`:30`)           |

Values >= 7 (`BARRIER_STATE_COUNT`, `:31`) are invalid on the wire; the app must show
"Unknown status" and disable motion buttons.

**cmd_result_t** (`firmware/components/barrier_types/include/barrier_types.h:105-115`)

| Value | Name            | UI title               | Plain-language explanation                                                                                                                                            | Suggested user action                                                |
| ----- | --------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 0     | NONE            | (no banner)            | Nothing to report, or the last event was not a command (boot, limit reached, fault clear).                                                                            | None.                                                                |
| 1     | ACCEPTED        | "Moving"               | The barrier accepted your command and started moving. Arrival is not confirmed yet (`barrier_types.h:107`).                                                           | Wait; STOP stays available.                                          |
| 2     | COMPLETED       | "Done"                 | The end-limit switch confirmed the arm reached its position (`barrier_types.h:108`).                                                                                  | None.                                                                |
| 3     | STOPPED         | "Stopped"              | Movement was halted by STOP, an obstruction, a sensor or power problem, or a lost link (`barrier_types.h:109`). Also returned when STOP is sent while already parked. | Check the area, then send RAISE or LOWER again.                      |
| 4     | REJECTED_AUTH   | "Not authorized"       | The barrier did not recognise this command as part of your current session (no session or wrong session nonce: `firmware/main/main.c:201-204`).                       | Reconnect; the app re-reads the session automatically.               |
| 5     | REJECTED_STALE  | "Command expired"      | The command was a repeat, skipped too far ahead, or arrived too late (REPLAY, COUNTER_JUMP or EXPIRED: `firmware/main/main.c:205-208`).                               | Tap again. If it repeats, the app resyncs its counter (section 6.3). |
| 6     | REJECTED_GUARD  | "Can't move right now" | The barrier refused to move for a safety reason; see the guard reasons below (`barrier_types.h:112`).                                                                 | Fix the listed reason, then retry.                                   |
| 7     | REJECTED_FORMAT | "App error"            | The command was malformed (bad length or opcode: `firmware/main/main.c:196-200`). This is an app bug.                                                                 | Update the app; report it.                                           |
| 8     | FAULT           | "Barrier fault"        | The barrier detected a fault and locked itself (`barrier_types.h:114`).                                                                                               | See the fault reason; on-site reset needed.                          |

**fault_reason_t** (`firmware/components/barrier_types/include/barrier_types.h:117-124`)

| Value | Name              | Raised by                                                                                                                                                          | UI title                    | Explanation                                                                                                | Suggested user action                                                                        |
| ----- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 0     | NONE              |                                                                                                                                                                    | (none)                      | No fault latched.                                                                                          | None.                                                                                        |
| 1     | MOTION_TIMEOUT    | FSM, no end-limit within `MOTION_TIMEOUT_MS` = 7000 ms (`app_config.h:52`, `barrier_fsm.c:195-201`, `barrier_types.h:119`)                                         | "Arm didn't finish moving"  | The arm did not reach its end position within 7 seconds, so the barrier stopped and locked.                | Check for something jamming the arm; a technician holds the unit's button 8 s to reset.      |
| 2     | LIMIT_CONFLICT    | FSM on the opposite limit while moving (`barrier_fsm.c:118-123`, `:127-131`), or both limits asserted at boot (`barrier_fsm.c:259-261`) (`barrier_types.h:120`)    | "Position sensors disagree" | The barrier saw the wrong end-switch for the direction it was moving, so it cannot trust where the arm is. | Do not use the barrier; a technician must inspect the limit switches, then reset (8 s hold). |
| 3     | SENSOR_PERSISTENT | `safety_task` when any interlock input stays INVALID >= `FAULT_SENSOR_MS` = 2000 ms (`app_config.h:47`, `safety_interlocks.c:222-230`, `interlock_core.c:172-182`) | "Sensor failure"            | A safety sensor gave no valid reading for over 2 seconds.                                                  | Check sensor wiring/obstruction sensor; technician reset (8 s hold).                         |
| 4     | POWER_CRITICAL    | `safety_task` when valid battery < `BATTERY_CRITICAL_MV` = 11000 mV (`app_config.h:40`, `safety_interlocks.c:232-238`)                                             | "Battery critically low"    | The battery fell below 11.0 V, so movement is locked to protect the system.                                | Let the solar panel recharge the battery; technician reset (8 s hold).                       |
| 5     | INTERNAL          | not raised anywhere in `firmware/` (only in `host_tests/test_barrier_fsm.c`)                                                                                       | "Internal error"            | The controller reported an internal error.                                                                 | Power-cycle the unit; report to the team.                                                    |

(Paths: `app_config.h` = `firmware/components/barrier_types/include/app_config.h`;
`barrier_fsm.c` = `firmware/components/barrier_fsm/barrier_fsm.c`; `safety_interlocks.c` /
`interlock_core.c` under `firmware/components/safety_interlocks/`.)

Fault clear: only on-site, by holding the enrollment button `FAULT_CLEAR_BUTTON_HOLD_MS` = 8000 ms
(`app_config.h:71`, `firmware/main/main.c:416-419`), moving FAULT -> UNKNOWN
(`barrier_fsm.c:242-246`). **The app cannot clear a fault**: there is no fault-clear opcode
(`barrier_types.h:37-42`). Holding 8 s also passes the 3 s mark and opens the enrollment window
(`firmware/main/main.c:412-415`).

**guard_fail_mask bits** (`firmware/components/barrier_types/include/barrier_types.h:88-97`; evaluated in
`firmware/components/motion_guard/motion_guard.c:21-27`)

| Bit | Mask | Name             | Source of the term                                                                                                                                                                               | UI title                        | Explanation                                                                                                             | Suggested user action                                     |
| --- | ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 0   | 0x01 | NOT_AUTHORIZED   | `ble_auth_owner_authorized()` = any owner connected (`firmware/main/main.c:305`, `firmware/components/ble_auth/ble_auth.c:196-199`)                                                              | "Phone not authorized"          | The barrier does not currently see an authorized owner connection.                                                      | Reconnect; if it persists, re-enroll.                     |
| 1   | 0x02 | STALE_COMMAND    | `command_fresh` is hard-set `true` before the guard (`firmware/main/main.c:306`); stale frames are rejected earlier as REJECTED_STALE. Only reachable via a NULL guard (`motion_guard.c:18-19`). | "Command expired"               | The command was not fresh.                                                                                              | Tap again.                                                |
| 2   | 0x04 | INVALID_POSITION | `fsm_position_valid()` (`firmware/components/barrier_fsm/barrier_fsm.c:276-290`)                                                                                                                 | "Can't move that way from here" | RAISE is only allowed from LOWERED or STOPPED; LOWER from RAISED, STOPPED or UNKNOWN; nothing while moving or in FAULT. | Use the other button, or STOP first.                      |
| 3   | 0x08 | SENSORS_INVALID  | obstruction, limit and power inputs all valid (`motion_guard.c:45`)                                                                                                                              | "Sensor check failed"           | At least one safety sensor is giving no valid reading.                                                                  | Wait a moment and retry; if it persists, inspect sensors. |
| 4   | 0x10 | ZONE_NOT_CLEAR   | `obstruction_valid && zone_clear` (`motion_guard.c:47`)                                                                                                                                          | "Something's in the way"        | The obstruction sensor sees something in the arm's path (or cannot tell).                                               | Clear the space around the barrier, then retry.           |
| 5   | 0x20 | POWER_UNHEALTHY  | `power_valid && power_healthy` (`motion_guard.c:48`); healthy floor `BATTERY_HEALTHY_MIN_MV` = 11800 mV (`app_config.h:39`)                                                                      | "Battery too low to move"       | Battery is below the safe-motion level (11.8 V) or its reading is invalid.                                              | Wait for solar recharge; retry later.                     |
| 6   | 0x40 | FAULT_LATCHED    | `state == FAULT` (`firmware/components/barrier_fsm/barrier_fsm.c:38`)                                                                                                                            | "Barrier locked by a fault"     | A fault is latched; no movement until an on-site reset.                                                                 | See the fault reason.                                     |
| 7   | 0x80 | (unused)         | not defined                                                                                                                                                                                      |                                 |                                                                                                                         | Treat as unknown reason.                                  |

A rejected RAISE/LOWER in FAULT always carries at least `0x44` (INVALID_POSITION + FAULT_LATCHED),
because `fsm_position_valid()` is false in FAULT (verified by host-compiling the FSM; see
`vectors.json` `fsm_matrix`). Multiple bits can be set at once; list every set bit, highest
safety relevance first: FAULT_LATCHED, ZONE_NOT_CLEAR, SENSORS_INVALID, POWER_UNHEALTHY,
INVALID_POSITION, NOT_AUTHORIZED, STALE_COMMAND.

**stop_cause_t** (internal only, `firmware/components/barrier_types/include/barrier_types.h:127-136`):
NONE 0, COMMAND 1, LINK_LOST 2, OBSTRUCTION 3, SENSOR_INVALID 4, POWER 5, TIMEOUT 6,
LIMIT_CONFLICT 7. Appears in UART `EVT_UNSAFE_DETECTED` / `EVT_ACT_STOP_ISSUED` `a` field
(`firmware/components/event_log/include/event_log.h:31-32`), **not in Status**.

**ble_auth_reject_t** (UART only, `firmware/components/ble_auth/include/ble_auth.h:31-39`):
NONE 0, NOT_BONDED 1, PAIRING_CLOSED 2, NOT_AUTHENTICATED 3, NOT_OWNER 4, PASSKEY_FAILED 5,
WRITE_UNAUTHORIZED 6. Logged as `EVT_AUTH_REJECT` b-field (`event_log.h:38`). Never sent over BLE;
the phone infers them from ATT errors and disconnects (section 7).

## 5. Session nonce

| Rule                    | Value                                                                                                                                    | Citation                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Size / encoding         | 4 bytes, LE uint32                                                                                                                       | `INTERFACES.md:19`, `firmware/components/ble_auth/ble_auth_gatt.c:133-137`, `tools/ble_client.py:208-212`         |
| Generation              | `esp_random()` on each successful owner authorization (encryption change with encrypted+authenticated+bonded and identity in owner list) | `firmware/components/ble_auth/ble_auth_gap.c:119-121`, `firmware/components/ble_auth/README.md:104`               |
| Scope                   | per connection (`ble_auth_conn_t.session_nonce`)                                                                                         | `firmware/components/ble_auth/ble_auth_internal.h:52`                                                             |
| Who may read            | **owner connections only**; others get ATT `0x08` Insufficient Authorization                                                             | `firmware/components/ble_auth/ble_auth_gatt.c:127-131`                                                            |
| Validator session start | `cmd_validator_begin_session(nonce)` when `control_task` processes `CTRL_MSG_OWNER_CONNECTED`                                            | `firmware/main/main.c:132-137`, `:362-366`                                                                        |
| Validator session end   | `cmd_validator_end_session()` on `EV_LINK_LOST` (any owner disconnect)                                                                   | `firmware/main/main.c:355-356`, `firmware/components/cmd_validator/cmd_validator.c:30-36`                         |
| Rotation                | new nonce on every owner authorization; a reconnect always yields a new nonce, so frames from an old session fail `BAD_NONCE`            | `firmware/components/ble_auth/ble_auth_gap.c:119`, `firmware/components/cmd_validator/include/cmd_validator.h:31` |
| Value 0                 | possible (random); app must not treat 0 as "no nonce"                                                                                    | `firmware/components/ble_auth/ble_auth_gap.c:119`                                                                 |

**App rule:** cache the nonce in memory only, re-read it after every (re)connect, and wait for a
Status with `owner_connected = 1` before the first Command. That flag is set in the same
`control_task` step that starts the validator session (`firmware/main/main.c:363-365`), which
closes the window in which a very early write would get `NO_SESSION`.

## 6. Freshness rules (`cmd_validator`)

### 6.1 Order (first failing rule wins)

| #   | Check                                                    | Result                            | Wire `last_result` | Citation                                                                                                      |
| --- | -------------------------------------------------------- | --------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1   | `len != 9`                                               | CMDV_BAD_LENGTH                   | 7 REJECTED_FORMAT  | `INTERFACES.md:52`, `firmware/components/cmd_validator/cmd_validator.c:50-51`, `firmware/main/main.c:196-200` |
| 2   | opcode not in {1,2,3}                                    | CMDV_BAD_OPCODE                   | 7 REJECTED_FORMAT  | `INTERFACES.md:53`, `cmd_validator.c:52-53`                                                                   |
| 3   | no active session                                        | CMDV_NO_SESSION                   | 4 REJECTED_AUTH    | `INTERFACES.md:54`, `cmd_validator.c:71-72`, `main.c:201-204`                                                 |
| 4   | `nonce != session_nonce`                                 | CMDV_BAD_NONCE                    | 4 REJECTED_AUTH    | `INTERFACES.md:55`, `cmd_validator.c:73-74`                                                                   |
| 5   | `counter <= last_counter`                                | CMDV_REPLAY                       | 5 REJECTED_STALE   | `INTERFACES.md:56`, `cmd_validator.c:75-76`, `main.c:205-208`                                                 |
| 6   | `counter - last_counter > CMD_COUNTER_WINDOW` (= **64**) | CMDV_COUNTER_JUMP                 | 5 REJECTED_STALE   | `INTERFACES.md:57`, `cmd_validator.c:77-78`, `app_config.h:65`                                                |
| 7a  | `now_us < rx_us` (clock misuse)                          | CMDV_EXPIRED                      | 5 REJECTED_STALE   | `cmd_validator.c:79-80` (C only, not in INTERFACES.md)                                                        |
| 7b  | `now_us - rx_us > CMD_MAX_AGE_MS * 1000` (= **500 ms**)  | CMDV_EXPIRED                      | 5 REJECTED_STALE   | `INTERFACES.md:58`, `cmd_validator.c:81-82`, `app_config.h:66`                                                |
| 8   | otherwise                                                | CMDV_OK, `last_counter = counter` | (FSM result)       | `INTERFACES.md:59`, `cmd_validator.c:83-85`                                                                   |

(`cmd_validator.c` = `firmware/components/cmd_validator/cmd_validator.c`, `main.c` =
`firmware/main/main.c`, `app_config.h` = `firmware/components/barrier_types/include/app_config.h`.)

Rule 6 is computed as an unsigned difference after rule 5 has guaranteed `counter > last`, so it
cannot overflow; boundary verified on host: last=10 accepts 74 (+64), rejects 75 (+65)
(`vectors.json` `freshness.cases`). `rx_us` is stamped first thing in the GATT callback
(`firmware/components/ble_auth/ble_auth_gatt.c:147-149`), `now_us` when `control_task` validates
(`firmware/main/main.c:270`). EXPIRED therefore measures **on-device queueing delay**, not
phone-to-device latency: a frame that arrives at the radio is only expired if `control_task`
cannot get to it within 500 ms. The phone cannot cause or avoid EXPIRED by timing.

`cmdv_result_t` numeric values (UART `EVT_CMD_RESULT.b` when not a guard mask): OK 0, BAD_LENGTH 1,
BAD_OPCODE 2, NO_SESSION 3, BAD_NONCE 4, REPLAY 5, COUNTER_JUMP 6, EXPIRED 7, NULL_ARG 8
(`firmware/components/cmd_validator/include/cmd_validator.h:26-36`).

### 6.2 STOP frames

STOP goes through the same freshness rules (`INTERFACES.md:61-62`). A STOP that fails freshness or
comes while no owner is authorized is **rejected and does not stop the arm**
(`firmware/main/main.c:276-285`). A STOP that passes bypasses the guard
(`firmware/main/main.c:286-290`, `docs/ARCHITECTURE.md:69`). The physical stop path does not
depend on STOP frames: link loss and interlocks stop the arm on the device
(`INTERFACES.md:61-62`, `docs/ARCHITECTURE.md:63-74`). **Retry a STOP with a new counter**, never
the same frame.

### 6.3 Counter rules for the app

| Rule                   | Value                                                                                                        | Citation                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Next counter           | `last + 1`                                                                                                   | `INTERFACES.md:32-33`, `tools/ble_client.py:293`                                                                                            |
| Window                 | at most `last + 64`                                                                                          | `firmware/components/barrier_types/include/app_config.h:65`                                                                                 |
| Consumed when          | a frame passes freshness, **even if the guard then rejects RAISE/LOWER**                                     | `firmware/main/main.c:270-274`                                                                                                              |
| Not consumed when      | any freshness/format rejection                                                                               | `firmware/components/cmd_validator/cmd_validator.c:83-86`, `firmware/components/cmd_validator/include/cmd_validator.h:57-58`                |
| Device persistence     | written to NVS key `counters` (blob, one uint32 per owner index) in namespace `m010` on every accepted frame | `firmware/main/main.c:272`, `firmware/components/ble_auth/ble_auth_nvs.c:144-170`, `firmware/components/ble_auth/ble_auth_internal.h:29-32` |
| Device restore at boot | **effectively 0** (see Conflict K1)                                                                          | `firmware/main/main.c:326`, `firmware/components/ble_auth/ble_auth.c:34`, `firmware/components/ble_auth/ble_auth_nvs.c:125-129`             |
| Shared between owners  | one validator instance; counter tracks the most recently authorized owner                                    | `firmware/components/ble_auth/README.md:131-137`                                                                                            |
| uint32 wrap            | no wrap handling; at `0xFFFFFFFF` no larger counter exists                                                   | `firmware/components/cmd_validator/include/cmd_validator.h:9`                                                                               |
| Reset on revoke        | `ble_auth_revoke_all()` erases `owners` and `counters`                                                       | `firmware/components/ble_auth/include/ble_auth.h:61-62`, `firmware/components/ble_auth/ble_auth_nvs.c:182-183`                              |

**Recommended phone algorithm (required to survive device reboots, see K1):**

1. On every connect, after the Session read, read Status once. Let `dev = status.last_counter`.
2. Use `next = dev + 1` as the next counter. Persist `max(local, next)` in SecureStore keyed by
   the device identifier only for display and as a floor when the device reports a higher value.
   Do **not** send `local + 1` when `local > dev + 64`: that is guaranteed `COUNTER_JUMP`.
3. After every write, wait for the first Status where `last_counter == sent` (accepted by
   freshness; then read `last_result` for the FSM outcome) or a rejection result with
   `last_counter` unchanged. Timeout 2 s (heartbeat is 1 s, `firmware/main/main.c:379`).
4. On `REJECTED_STALE` with unchanged `last_counter`, re-read Status and resync to
   `last_counter + 1` once; do not loop.

Status has no command correlation id (`tools/ble_client.py:16-20`), so a heartbeat can arrive
between the write and the result. Correlate with `last_counter` as above, not with "next
notification".

## 7. Security, pairing, enrollment

### 7.1 Pairing policy

| Item                   | Value                                                                                                                                                                                                  | Citation                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pairing                | LE Secure Connections only (legacy pairing compiled out)                                                                                                                                               | `firmware/sdkconfig.defaults:15-16`, `firmware/components/ble_auth/ble_auth_gap.c:330-337`, `docs/ARCHITECTURE.md:93-94`                                                                       |
| MITM                   | required                                                                                                                                                                                               | `firmware/components/ble_auth/ble_auth_gap.c:336`                                                                                                                                              |
| Bonding                | required                                                                                                                                                                                               | `firmware/components/ble_auth/ble_auth_gap.c:335`                                                                                                                                              |
| IO capability          | `DISPLAY_ONLY` -> phone gets a **passkey entry** prompt                                                                                                                                                | `firmware/components/ble_auth/ble_auth_gap.c:334`, `firmware/components/ble_auth/README.md:28-30`                                                                                              |
| Passkey                | fixed 6-digit (000000-999999) generated once by `esp_random() % 1000000` at first boot, stored NVS `m010/passkey`, printed on UART at boot and when enrollment opens; intended to be on the unit label | `firmware/components/ble_auth/ble_auth_nvs.c:109-121`, `firmware/components/ble_auth/ble_auth.c:117-118`, `:160`, `firmware/components/ble_auth/README.md:19-22`, `docs/ARCHITECTURE.md:95-97` |
| Passkey injection      | on `BLE_GAP_EVENT_PASSKEY_ACTION` with `BLE_SM_IOACT_DISP`                                                                                                                                             | `firmware/components/ble_auth/ble_auth_gap.c:187-199`                                                                                                                                          |
| Key distribution       | ENC + ID both ways (identity address resolution of the phone's RPA)                                                                                                                                    | `firmware/components/ble_auth/ble_auth_gap.c:338-341`                                                                                                                                          |
| Owner identity         | resolved identity address of a bonded peer, never name or OTA address                                                                                                                                  | `firmware/components/ble_auth/include/ble_auth.h:8-11`, `docs/ARCHITECTURE.md:100-102`                                                                                                         |
| Max owners             | `MAX_OWNER_BONDS` = **2**                                                                                                                                                                              | `firmware/components/barrier_types/include/app_config.h:72`, `firmware/components/ble_auth/README.md:38-40`                                                                                    |
| NimBLE bond store size | `CONFIG_BT_NIMBLE_MAX_BONDS=3`                                                                                                                                                                         | `firmware/sdkconfig.defaults:18`                                                                                                                                                               |

### 7.2 Enrollment window

| Item              | Value                                                                                               | Citation                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Trigger           | hold enrollment button (`PIN_ENROLL_BUTTON`, active low) >= `ENROLL_BUTTON_HOLD_MS` = **3000 ms**   | `firmware/components/barrier_types/include/app_config.h:24`, `:70`, `firmware/main/main.c:410-415`      |
| Window length     | `ENROLL_WINDOW_MS` = **60000 ms**                                                                   | `app_config.h:69`, `firmware/main/main.c:413`                                                           |
| Open check        | `esp_timer_get_time() < enroll_end_us`                                                              | `firmware/components/ble_auth/ble_auth.c:122-125`                                                       |
| Re-opening        | resets end time and timer                                                                           | `firmware/components/ble_auth/ble_auth.c:100-114`                                                       |
| Evidence          | `EVT_ENROLL_OPEN` (a = window ms), `EVT_ENROLL_CLOSE` (a = 1 if a bond was added), `EVT_BOND_ADDED` | `firmware/components/ble_auth/ble_auth.c:96`, `:116`, `firmware/components/ble_auth/ble_auth_gap.c:101` |
| Visible to phone? | **No.** No characteristic exposes enrollment state or remaining time.                               | `firmware/components/ble_auth/ble_auth_gatt.c:179-200`                                                  |

### 7.3 Authorization decision (on `BLE_GAP_EVENT_ENC_CHANGE`)

| Situation                                                | Device behaviour                                                                            | What the phone sees                                                             | Citation                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Encryption failed (wrong passkey, cancelled, timeout)    | logs `AUTH_REJECT/NOT_AUTHENTICATED`; **does not disconnect**                               | pairing failure from OS; link stays up unencrypted; protected reads/writes fail | `firmware/components/ble_auth/ble_auth_gap.c:179-185`                                        |
| Encrypted but not authenticated or not bonded            | logs NOT_BONDED or NOT_AUTHENTICATED, **disconnects**                                       | disconnect                                                                      | `ble_auth_gap.c:80-89`                                                                       |
| Bonded, identity already an owner                        | authorized; new nonce; `EVT_AUTH_OWNER_OK` b = ms since connect; requests 15-30 ms interval | Session read succeeds                                                           | `ble_auth_gap.c:91`, `:118-132`                                                              |
| New identity, window open, list not full                 | added as owner, authorized                                                                  | Session read succeeds                                                           | `ble_auth_gap.c:93-101`                                                                      |
| New identity, window open, list full (2)                 | stays bonded, **not** owner, `NOT_OWNER`, **no disconnect**                                 | Session read -> ATT 0x08; Command write -> ATT 0x08                             | `ble_auth_gap.c:102-106`, `firmware/components/ble_auth/ble_auth_gatt.c:128-131`, `:156-158` |
| New identity, window closed                              | bond deleted, `PAIRING_CLOSED`, **disconnect**                                              | OS pairing "succeeds", then link drops within the same second                   | `ble_auth_gap.c:108-115`, `firmware/components/ble_auth/README.md:35-37`                     |
| Known peer re-pairs (phone forgot the bond), window open | stale bond deleted, pairing retried                                                         | new passkey prompt, then authorized (identity still in owner list)              | `ble_auth_gap.c:206-211`                                                                     |
| Known peer re-pairs, window closed                       | `BLE_GAP_REPEAT_PAIRING_IGNORE`                                                             | pairing fails                                                                   | `ble_auth_gap.c:212-213`                                                                     |

`AUTH_REJECT_PASSKEY_FAILED` is declared (`firmware/components/ble_auth/include/ble_auth.h:37`) but
never emitted by any `.c` file in `firmware/`.

### 7.4 ATT errors the app will see

| Access                       | Condition                        | ATT error                                                            | Source                                                                                                                                                                        |
| ---------------------------- | -------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any of the 3 characteristics | link not encrypted+authenticated | Insufficient Authentication (0x05) or Insufficient Encryption (0x0F) | Chosen by NimBLE from the `*_ENC \| *_AUTHEN` flags (`firmware/components/ble_auth/ble_auth_gatt.c:183`, `:189`, `:196`); the exact code is not specified in firmware sources |
| Session read                 | connected+encrypted, not owner   | Insufficient Authorization **0x08**                                  | `firmware/components/ble_auth/ble_auth_gatt.c:128-131`                                                                                                                        |
| Command write                | connected+encrypted, not owner   | Insufficient Authorization **0x08**, logged `WRITE_UNAUTHORIZED`     | `firmware/components/ble_auth/ble_auth_gatt.c:155-158`                                                                                                                        |
| Wrong operation type         | e.g. write to Status             | Unlikely Error 0x0E                                                  | `firmware/components/ble_auth/ble_auth_gatt.c:102-104`, `:123-125`, `:151-153`                                                                                                |
| Status/Session read          | mbuf append failure              | Insufficient Resources 0x11                                          | `firmware/components/ble_auth/ble_auth_gatt.c:115-116`, `:139-140`                                                                                                            |
| Command write by owner       | anything                         | **0 (success)**                                                      | `firmware/components/ble_auth/ble_auth_gatt.c:173`                                                                                                                            |

Status read requires only an encrypted+authenticated link, **not** owner status
(`firmware/components/ble_auth/ble_auth_gatt.c:98-117`). The reliable "am I the owner?" probe is a
successful Session read.

## 8. Connection parameters

| Item                                         | Value                                          | Citation                                                    |
| -------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Interval requested after owner authorization | min 12 units (15.0 ms), max 24 units (30.0 ms) | `firmware/components/ble_auth/ble_auth_gap.c:37-40`, `:128` |
| Slave latency                                | 0                                              | `ble_auth_gap.c:47`                                         |
| Supervision timeout                          | 400 units = **4 s**                            | `ble_auth_gap.c:48`                                         |
| Before authorization                         | central's defaults (no request made)           | not specified in firmware sources                           |
| Request failure                              | logged, not fatal                              | `ble_auth_gap.c:52-55`                                      |

Consequence for UX: if the phone walks out of range, the device declares link loss (and stops a
moving arm) only after the supervision timeout, up to 4 s. An explicit app disconnect is immediate.

## 9. Link loss

`on_owner_disconnected` runs first in the GAP disconnect handler, stops the actuator directly if
moving, logs `UNSAFE_DETECTED`/`ACT_STOP_ISSUED` with cause LINK_LOST, then posts `EV_LINK_LOST`
(`firmware/components/ble_auth/ble_auth_gap.c:139-146`, `firmware/main/main.c:148-160`,
`INTERFACES.md:116-120`). FSM: RAISING/LOWERING -> STOPPED with `RESULT_STOPPED`; all other states
unchanged (`firmware/components/barrier_fsm/barrier_fsm.c:162-182`). The validator session ends and
`owner_connected` clears (`firmware/main/main.c:355-359`). The phone cannot read that Status (it
is disconnected); on reconnect it sees STOPPED with `last_result = 3`.

## 10. Timing and requirement anchors

| Requirement              | Value                                                                  | Citation                                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec 5 auth latency      | < 2000 ms, metric `AUTH_OWNER_OK.b` (ms since `CONN_ESTABLISHED`), p95 | `firmware/components/barrier_types/include/app_config.h:74`, `docs/ARCHITECTURE.md:103`, `firmware/components/ble_auth/ble_auth_gap.c:125-126`, `tools/log_parser.py:201-205`, `docs/VERIFICATION.md:29` |
| Spec 6 auth accuracy     | (TP+TN)/N >= 0.90, FA and FR reported separately                       | `docs/ARCHITECTURE.md:104-105`, `tools/log_parser.py:357`, `:368`, `docs/VERIFICATION.md:30`                                                                                                             |
| Constraint 4 stop budget | <= 150 ms unsafe -> actuator stop; 55 ms allocated                     | `app_config.h:48`, `docs/ARCHITECTURE.md:76-89`                                                                                                                                                          |
| Constraint 5             | all access decisions local; no Wi-Fi/network                           | `docs/REQUIREMENTS.md:10`, `docs/ARCHITECTURE.md:22`, `firmware/sdkconfig.defaults:22`                                                                                                                   |
| Spec 4 travel            | nominal 5000 ms full travel; timeout 7000 ms                           | `app_config.h:51-52`                                                                                                                                                                                     |
| Battery thresholds       | plausible 8000-15500 mV; healthy >= 11800; critical < 11000            | `app_config.h:37-40`                                                                                                                                                                                     |

The phone cannot read the device's Spec 5 number (it is UART only). The phone-side proxy is
"connect started -> Session read succeeded" measured with a monotonic clock; it includes
connection setup that the firmware metric excludes (firmware stamps from `BLE_GAP_EVENT_CONNECT`,
`firmware/components/ble_auth/ble_auth_gap.c:160-166`). Label it "phone-measured" in the UI.

## 11. UART evidence events (for the in-app log naming only)

`EVT,<t_us>,<NAME>,<a>,<b>` (`INTERFACES.md:125-127`). Names and a/b meanings:
`firmware/components/event_log/include/event_log.h:29-48` (BOOT, UNSAFE_DETECTED, ACT_STOP_ISSUED,
ACT_DRIVE, LIMIT, STATE, CONN_ESTABLISHED, AUTH_OWNER_OK, AUTH_REJECT, DISCONNECT, CMD_RX,
CMD_RESULT, ENROLL_OPEN, ENROLL_CLOSE, BOND_ADDED, FAULT, FAULT_CLEAR, BATTERY, LOG_OVERFLOW).
These are not available over BLE. The app's on-phone log is its own record of what it sent and
received; it should reuse these names where the meaning matches so the two logs line up in the
report.

---

## Reference encodings

Generated 2026-11-15 by importing the real `tools/ble_client.py` with `importlib`
(`pack_command`, `unpack_command`, `parse_status`), running from the scratch dir with
`sys.dont_write_bytecode = True`. Commands were then cross-checked **byte for byte** against the
firmware's own `cmd_encode()` by compiling `cmd_validator.c`, `barrier_fsm.c` and
`motion_guard.c` with gcc on the host (output in scratch, nothing written to the firmware repo).
All 18 command vectors matched. Full set, plus freshness and an 84-row FSM matrix, is in
`docs/vectors.json`.

### Commands (`opcode | counter LE | nonce LE`)

| Opcode     | Counter    | Nonce      | Hex                  |
| ---------- | ---------- | ---------- | -------------------- |
| RAISE 0x01 | 1          | 0x00000000 | `010100000000000000` |
| RAISE 0x01 | 1          | 0xDEADBEEF | `0101000000efbeadde` |
| RAISE 0x01 | 2          | 0x12345678 | `010200000078563412` |
| RAISE 0x01 | 65         | 0x0A0B0C0D | `01410000000d0c0b0a` |
| RAISE 0x01 | 256        | 0x00000001 | `010001000001000000` |
| RAISE 0x01 | 4294967295 | 0xFFFFFFFF | `01ffffffffffffffff` |
| LOWER 0x02 | 1          | 0xDEADBEEF | `0201000000efbeadde` |
| LOWER 0x02 | 2          | 0x12345678 | `020200000078563412` |
| LOWER 0x02 | 256        | 0x00000001 | `020001000001000000` |
| STOP 0x03  | 1          | 0xDEADBEEF | `0301000000efbeadde` |
| STOP 0x03  | 2          | 0x12345678 | `030200000078563412` |
| STOP 0x03  | 65         | 0x0A0B0C0D | `03410000000d0c0b0a` |

### Session characteristic

| Hex        | Nonce      |
| ---------- | ---------- |
| `00000000` | 0          |
| `01000000` | 1          |
| `efbeadde` | 0xDEADBEEF |
| `ffffffff` | 0xFFFFFFFF |

### Status payloads (decoded by `ble_client.parse_status`)

| Hex                        | state      | result            | fault               | mask           | flags (zone/sens/owner) | mV    | last_counter | Scenario                     |
| -------------------------- | ---------- | ----------------- | ------------------- | -------------- | ----------------------- | ----- | ------------ | ---------------------------- |
| `000000000700003200000000` | 0 UNKNOWN  | 0 NONE            | 0                   | 0x00           | 1/1/1                   | 12800 | 0            | boot                         |
| `0102000007002c3329000000` | 1 RAISED   | 2 COMPLETED       | 0                   | 0x00           | 1/1/1                   | 13100 | 41           | raised idle                  |
| `020200000700fa322a000000` | 2 LOWERED  | 2 COMPLETED       | 0                   | 0x00           | 1/1/1                   | 13050 | 42           | lowered idle                 |
| `0301000007006a312b000000` | 3 RAISING  | 1 ACCEPTED        | 0                   | 0x00           | 1/1/1                   | 12650 | 43           | raising                      |
| `04010000070038312c000000` | 4 LOWERING | 1 ACCEPTED        | 0                   | 0x00           | 1/1/1                   | 12600 | 44           | lowering                     |
| `05030000070064322d000000` | 5 STOPPED  | 3 STOPPED         | 0                   | 0x00           | 1/1/1                   | 12900 | 45           | stopped                      |
| `06080100070070302e000000` | 6 FAULT    | 8 FAULT           | 1 MOTION_TIMEOUT    | 0x00           | 1/1/1                   | 12400 | 46           | timeout                      |
| `06080200050070302f000000` | 6 FAULT    | 8 FAULT           | 2 LIMIT_CONFLICT    | 0x00           | 1/0/1                   | 12400 | 47           | limit conflict               |
| `060803000000e02e2f000000` | 6 FAULT    | 8 FAULT           | 3 SENSOR_PERSISTENT | 0x00           | 0/0/0                   | 12000 | 47           | sensor fault                 |
| `060804000300942a2f000000` | 6 FAULT    | 8 FAULT           | 4 POWER_CRITICAL    | 0x00           | 1/1/0                   | 10900 | 47           | power critical               |
| `060805000700d4302f000000` | 6 FAULT    | 8 FAULT           | 5 INTERNAL          | 0x00           | 1/1/1                   | 12500 | 47           | internal (not emitted today) |
| `020600100600003230000000` | 2 LOWERED  | 6 REJECTED_GUARD  | 0                   | 0x10 ZONE      | 0/1/1                   | 12800 | 48           | zone blocked                 |
| `020600180400003231000000` | 2 LOWERED  | 6 REJECTED_GUARD  | 0                   | 0x18 SENS+ZONE | 0/0/1                   | 12800 | 49           | sensors + zone               |
| `010600200700b42d32000000` | 1 RAISED   | 6 REJECTED_GUARD  | 0                   | 0x20 POWER     | 1/1/1                   | 11700 | 50           | low battery                  |
| `000600040700003233000000` | 0 UNKNOWN  | 6 REJECTED_GUARD  | 0                   | 0x04 POSITION  | 1/1/1                   | 12800 | 51           | RAISE from UNKNOWN           |
| `060602440700003234000000` | 6 FAULT    | 6 REJECTED_GUARD  | 2                   | 0x44 POS+FAULT | 1/1/1                   | 12800 | 52           | move while faulted           |
| `0206007f0000282335000000` | 2 LOWERED  | 6 REJECTED_GUARD  | 0                   | 0x7F all       | 0/0/0                   | 9000  | 53           | every bit                    |
| `010500000700003235000000` | 1 RAISED   | 5 REJECTED_STALE  | 0                   | 0x00           | 1/1/1                   | 12800 | 53           | replay / jump / expired      |
| `010400000700003235000000` | 1 RAISED   | 4 REJECTED_AUTH   | 0                   | 0x00           | 1/1/1                   | 12800 | 53           | bad nonce / no session       |
| `010700000700003235000000` | 1 RAISED   | 7 REJECTED_FORMAT | 0                   | 0x00           | 1/1/1                   | 12800 | 53           | malformed                    |
| `050300000300003204030201` | 5 STOPPED  | 3 STOPPED         | 0                   | 0x00           | 1/1/0                   | 12800 | 0x01020304   | owner bit clear              |
| `010200000700ffffffffffff` | 1 RAISED   | 2 COMPLETED       | 0                   | 0x00           | 1/1/1                   | 65535 | 4294967295   | max values                   |

Payloads of length 0, 8, 10, 13 are rejected by `parse_status` with `ValueError`
(`vectors.json` `invalid_status_lengths`). The status rows are crafted (not captured from a board):
they exercise the decoder, not firmware behaviour. Rows marked "not emitted today" or with
combinations the firmware cannot produce are still valid decoder inputs.

### Freshness (firmware `cmd_validate()`, host-compiled; last_counter = 10, nonce 0xCAFEBABE)

| Case                                 | Result                          |
| ------------------------------------ | ------------------------------- |
| counter 11                           | OK, last -> 11                  |
| counter 10 / 9                       | REPLAY                          |
| counter 74 (+64)                     | OK                              |
| counter 75 (+65)                     | COUNTER_JUMP                    |
| nonce 0xCAFEBABF                     | BAD_NONCE                       |
| nonce wrong **and** counter replayed | BAD_NONCE (nonce checked first) |
| no session                           | NO_SESSION                      |
| age 500 000 us                       | OK                              |
| age 500 001 us                       | EXPIRED                         |
| now < rx                             | EXPIRED                         |
| last 0xFFFFFFF0, counter 0xFFFFFFFF  | OK                              |
| parse len 10                         | BAD_LENGTH                      |
| parse opcode 0 / 4                   | BAD_OPCODE                      |

---

## 12. Conflicts

Areas checked: UUIDs, device name, frame layout, status layout, enums, freshness order, window and
age constants, counter persistence, session nonce, FSM table vs `barrier_fsm.c`, ATT permissions,
connection interval, advertising, reject reasons, `ble_client.py` vs all of the above.

**None found** in: UUID strings and byte arrays (4/4 match); device name (`app_config.h:73` =
`INTERFACES.md:21` = `ble_client.py:71`); command layout and opcodes (C `cmd_encode` ==
`ble_client.pack_command` on 18 vectors); status layout and flag bits (`ble_auth_gatt.c:62-75` ==
`INTERFACES.md:37-46` == `ble_client.py:84`, `:112-129`); freshness order for rules 1-6 and 7b;
`CMD_COUNTER_WINDOW` 64 and `CMD_MAX_AGE_MS` 500 (`app_config.h:65-66` == `ble_client.py:87`
comment); enrollment 3 s / 60 s / 2 owners (`app_config.h:69-72` == ble_auth README); FSM rows for
every listed state/event pair except K2/K3 below.

**K1. Persisted command counter is not restored after reboot (implementation vs docs).**
`INTERFACES.md:29` says the counter is "persisted on both sides" and `docs/ARCHITECTURE.md:123-124`
says "`last_counter` persists in NVS per bond so a reboot does not reopen old counters". But
`control_task` initialises the validator with `ble_auth_load_counter()` at boot
(`firmware/main/main.c:326`), when `g_ble_auth_current_owner_idx` is still `-1`
(`firmware/components/ble_auth/ble_auth.c:34`), so `ble_auth_counter_load(-1)` returns 0
(`firmware/components/ble_auth/ble_auth_nvs.c:125-129`). `cmd_validator_begin_session` does not
reload it (`firmware/components/cmd_validator/cmd_validator.c:22-28`, `firmware/main/main.c:363`).
Status `last_counter` also starts at 0 (`firmware/main/main.c:487`). Effect on the phone: after any
device reboot, a phone whose stored counter is > 64 gets `COUNTER_JUMP` forever if it sends
`local + 1`. `tools/ble_client.py:289-293` uses only its local file and would hit this. **Not
blocking**: the app resyncs from `Status.last_counter` (section 6.3), which always equals the
validator's value. Security impact (counters 1..64 reopen after reboot, still nonce-bound) is a
firmware issue to report to the firmware owner, not something the app can fix.

**K2. FSM rows missing from INTERFACES.md.** RAISED or LOWERED receiving `LIMIT_RAISED` /
`LIMIT_LOWERED` has no row in `INTERFACES.md:70-102`. Implementation: state unchanged, `ACT_STOP`,
`RESULT_NONE`, and the wrong limit while parked does **not** fault
(`firmware/components/barrier_fsm/barrier_fsm.c:94-96`, `:139-143`). Not blocking (the app only
displays state).

**K3. FAULT + RAISE/LOWER mask.** `INTERFACES.md:99` says `REJECTED_GUARD (FAULT_LATCHED)`; the
firmware always also sets `INVALID_POSITION`, giving at least 0x44
(`firmware/components/barrier_fsm/barrier_fsm.c:37-39`, `:276-290`; host run). Likewise
`INTERFACES.md:93` says `(INVALID_POSITION)` for moves while moving, and the real mask also includes
any other failing term. Not blocking: the app decodes bits, it does not compare masks for equality.

**K4. Extra EXPIRED condition.** `cmd_validator.c:79-80` returns EXPIRED when `now_us < rx_us`; not in
`INTERFACES.md:58`. Not observable from the phone. Not blocking.

**K5. Dangling reference.** `tools/ble_client.py:39` and `tools/README.md:140-141` cite
"INTERFACES.md item 9" for the 15-30 ms interval. INTERFACES.md has no item 9; the value exists only
in `firmware/components/ble_auth/ble_auth_gap.c:37-48` ("rule 9" of a session prompt). Not blocking.

**K6. Session read needs owner status, not stated in INTERFACES.md.** `INTERFACES.md:10-12` only
says Command writes need the owner; `ble_auth_gatt.c:128-131` also refuses Session reads from
non-owners. Not blocking; the app uses this as its owner probe.

**K7. Stop cause promised to status, absent from wire.** `barrier_types.h:126` says stop causes are
"used for the stop-path log and status"; `barrier_status_t` (`barrier_types.h:140-150`) and the
12-byte wire format (`INTERFACES.md:37-46`) have no stop-cause field. The app cannot say _why_ a
STOPPED happened; it may infer obstruction from `zone_clear = 0`. Not blocking.

**K8. Advertising placement.** `INTERFACES.md:21-22` says "name ... service UUID in the
advertisement"; the name is actually in the scan response (`ble_auth_gap.c:279-286`). Not blocking
if the app filters by service UUID.

**K9. Two owners at once share one session.** Any owner disconnect ends the single validator
session (`firmware/main/main.c:355-356`), and a second owner's authorization replaces the session
nonce (`main.c:363`), so the first owner's next frames get `BAD_NONCE` -> REJECTED_AUTH. Only the
counter-sharing part is documented (`firmware/components/ble_auth/README.md:131-137`). Not blocking; the app shows
"Another owner is connected" heuristically on REJECTED_AUTH and offers reconnect.

**K10. Unused enum values.** `AUTH_REJECT_PASSKEY_FAILED` (`ble_auth.h:37`) and `FAULT_INTERNAL`
(`barrier_types.h:123`) are never produced by `firmware/` sources. Not blocking.

**Does any conflict block implementing a BLE client?** No. K1 changes the counter algorithm (resync
from Status) and must be handled; K2-K10 affect only copy and edge-case UI.
