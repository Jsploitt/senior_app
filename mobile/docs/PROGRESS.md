# PROGRESS: M010 Barrier mobile app (overnight run, 2026-11-15)

Branch: `expo-rewrite` in `senior_app`. Firmware repo is read-only for this run.

## Current

- Phase: 0 and 1 complete, Phase 2 starting
- Open failures: none
- Next action: workstreams A-E in parallel worktrees

## Log

### Phase 1: Foundation (commit 2nd on branch, `mobile: Expo SDK 58 foundation...`)

Scaffold: `create-expo-app --template blank-typescript` -> Expo SDK `~58.0.25`, React Native `0.88.1`,
React `19.3.0`, TypeScript `~6.0.3`. Added expo-router, ble-plx `3.5.1`, reanimated `4.7.1`, worklets
`0.13.0`, expo-secure-store, expo-haptics, expo-sharing, expo-file-system, jest-expo, RNTL.

Gates at commit:

- `npx tsc --noEmit` -> exit 0
- `npx eslint .` -> 0 problems
- `npx jest` -> `Test Suites: 4 passed, 4 total; Tests: 216 passed, 216 total`
- `npx expo-doctor` -> `20/20 checks passed. No issues detected!`
- `npx expo export -p web` -> exported to `dist/`

Notes / decisions:

- TS 6 defaults `types` to `[]`; tsconfig sets `"types": ["jest", "node"]`.
- `create-expo-app` initialised a nested `.git` in `mobile/`; removed so `mobile/` is tracked by `senior_app`.
- FSM port verified against `docs/vectors.json` `fsm_matrix` (84 rows = 7 states x 12 event/guard cases,
  produced by compiling `barrier_fsm.c` on the host in Phase 0). All 84 match.
- Freshness: `cmd_validator.c:79-80` also rejects `now < rx` as EXPIRED; not stated in INTERFACES.md
  section 2. Ported as implemented.
- Counter resync: on `REJECTED_STALE` the app cannot distinguish REPLAY / COUNTER_JUMP / EXPIRED
  (`main.c:205-208` maps all three to one wire result). Resync = re-read Status, retry once with
  `status.last_counter + 1` (correct for both REPLAY and COUNTER_JUMP). On connect: `max(stored, last) + 1`.

### Phase 0: Research gate

- Research agent (Opus) wrote CONTRACT.md, STATE_MACHINE.md, DESIGN.md, STACK.md, vectors.json.
- Gate script `mobile/scripts/check_citations.py` (resolves every `path:line` against the firmware repo,
  checks the line range exists, spot-checks 13 values at their cited line):
  first run `citations checked: 376, failures: 1` (ambiguous path `ble_auth/README.md`, fixed to full path);
  second run `citations checked: 377, failures: 0`, `value spot checks: 13, failures: 0`.
- Firmware repo: `git status` clean at `342c4ac`. The research agent reported it briefly wrote
  `tools/__pycache__/ble_client.cpython-37.pyc` there and deleted it; verified no `__pycache__` remains.
- Conflicts K1-K10 in CONTRACT.md section 12; none blocks BleTransport. K1 (counter not restored after
  device reboot) is handled by Status-based resync; recorded as a firmware request for RELEASE.md.
- Risk: react-native-ble-plx 3.5.1 is a legacy bridge module; RN 0.88 runs it only via interop. Untested.

### Scope change (2026-11-15, user decision): Android only

- iOS dropped: removed `ios` block and `bluetoothAlwaysPermission` from `app.config.ts`, set
  `platforms: ['android', 'web']` (web = screenshot QA only), removed iOS from `eas.json` (no `submit`).
- Exit criterion "iOS build in TestFlight" no longer applies.
- Visual design (DESIGN.md) unchanged.
