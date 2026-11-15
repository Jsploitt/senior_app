# M010 Barrier - independent UI review (round 2)

Scope: 29 screens x 2 schemes = 58 screenshots (web build, 390x844 pt @2x). Judged from screenshots and docs/DESIGN.md only; no source code or earlier reviews read. Scale: 5 polished first-party, 4 good with minor nits, 3 noticeable problems, 2 poor, 1 broken.

**Result:** 34 of 58 rows score >= 4 on every criterion; 24 rows do not (12 screens, failing identically in light and dark).

## Summary (min of light/dark)

| Screen | Hier | HIG | Tokens | State | Errors | A11y | Polish | All >= 4 |
|---|---|---|---|---|---|---|---|---|
| onboarding-welcome | 4 | 4 | 4 | 5 | 4 | 4 | 4 | yes |
| control-disconnected | 4 | 4 | 4 | 4 | 4 | 4 | 4 | yes |
| control-lowered | 4 | 4 | 4 | 5 | 4 | 4 | 4 | yes |
| control-raising | 4 | 4 | 4 | 5 | 4 | 4 | 4 | yes |
| control-raised | 4 | 4 | 4 | 5 | 4 | 4 | 4 | yes |
| control-stopped | 4 | 4 | 4 | 5 | 4 | 4 | 4 | yes |
| control-guard-reject | 4 | 4 | 4 | 4 | 5 | 4 | 4 | yes |
| control-fault | **3** | 4 | 4 | **3** | 4 | 4 | 4 | no |
| control-unknown | 4 | 4 | 4 | 5 | 4 | 4 | 4 | yes |
| control-link-lost | 4 | 4 | 4 | **3** | 5 | 4 | **3** | no |
| connect-modal | 4 | 4 | 4 | 4 | 4 | 4 | 4 | yes |
| health-connected | 4 | 4 | 4 | 4 | 4 | 4 | 4 | yes |
| health-disconnected | 4 | 4 | 4 | 4 | 4 | 4 | 4 | yes |
| log | **3** | **3** | **3** | 4 | 4 | 4 | 4 | no |
| settings | 4 | 4 | **3** | 4 | 4 | 4 | 4 | no |
| presenter | 4 | 4 | 4 | 4 | 4 | 4 | 4 | yes |
| onboarding-mode | 4 | 4 | 4 | 4 | 4 | 4 | 4 | yes |
| onboarding-bluetooth | 4 | 4 | 4 | 4 | 4 | 4 | **3** | no |
| onboarding-enroll | **3** | 4 | 4 | **3** | 4 | 4 | **3** | no |
| onboarding-done | 4 | 4 | 4 | 4 | 4 | 4 | 4 | yes |
| settings-device | 4 | 4 | 4 | 4 | 4 | 4 | 4 | yes |
| settings-about | 4 | 4 | 4 | 4 | 4 | 4 | 4 | yes |
| guard-details | 4 | 4 | 4 | 4 | 5 | 4 | 4 | yes |
| connect-pairing | 4 | **3** | 4 | 4 | 4 | 4 | 4 | no |
| presenter-obstruction-start | **3** | **3** | **3** | 4 | 4 | **3** | **2** | no |
| presenter-obstruction-step3 | **3** | **3** | **3** | 4 | 4 | 4 | **3** | no |
| presenter-limit-conflict | **3** | **3** | **3** | 4 | 4 | 4 | **3** | no |
| presenter-replayed-command | **3** | **3** | **3** | 4 | 4 | 4 | **3** | no |
| presenter-auth-latency | **3** | **3** | **3** | 4 | 4 | 4 | **3** | no |

## Fix lists for screens with any score < 4

### control-fault  (failing: hierarchy 3, state 3)

| Element | Problem | Fix |
|---|---|---|
| Sensor chip | Shows 'Sensors OK' (green) during a position-sensor fault | Drive the chip from the fault/sensor-valid bit; show 'Sensors disagree' in danger style or hide chips while FAULT is latched |
| Hero arm | Arm rendered in the lowered pose while position is invalid | Use the dashed/ghost arm (as in UNKNOWN) tinted danger, or the last confirmed pose with a 'last confirmed' caption |
| Fault messaging | Three restatements of 'needs on-site reset' | Keep hero title + one fault card (cause + action); replace the dock hint with a neutral 'Controls locked' or drop it |
| Spacing | Fault card nearly touches the dock divider | Give the scroll content bottom padding >= 16 pt above the dock |

### control-link-lost  (failing: state 3, polish 3)

| Element | Problem | Fix |
|---|---|---|
| Status chips | Stale values shown in live success styling | Render chips in neutral/disabled style with a 'last known' or timestamp caption, or hide them while disconnected |
| Chip row / dock | Chips touch the dock separator | Add bottom content inset (>= 16 pt) so the last row clears the dock |

### log  (failing: hierarchy 3, hig 3, tokens 3)

| Element | Problem | Fix |
|---|---|---|
| Clear log button | Destructive action is the most prominent control | Move to a nav-bar/overflow action or plain red text button with a confirmation alert; keep Share as the only top-level button |
| Result chips | 'Moving' green and 'Stopped' gray contradict hero state colors | Map chip colors to the state tokens: motion=accent, LOWERED=success, STOPPED=warning, FAULT=danger, UNKNOWN=neutral |
| List separators | Full-width separators | Inset separators to the text column (as in Settings) for consistency |
| Row density | Up to 4 chips per row | Show result as one colored chip; move counter and latency into the subtitle in tabular digits |
| Row icons | Commands and state events look identical | Use distinct glyphs/tints (e.g. arrow for commands, dot/state glyph for state changes) |

### settings  (failing: tokens 3)

| Element | Problem | Fix |
|---|---|---|
| Haptics switch | Teal thumb / green track not in the token set | Set trackColor true=success (or accent) and thumbColor=#FFFFFF in both schemes |
| Haptics row | Misplaced under Appearance | Move to GENERAL or a 'Feedback' section |
| Replay onboarding icon | Warning orange used as decoration | Use a neutral gray or accent tile; reserve orange for STOPPED/guard |

### onboarding-bluetooth  (failing: polish 3)

| Element | Problem | Fix |
|---|---|---|
| Page dots | 5 dots vs 4 on sibling pages | Compute dot count from the actual flow for the chosen mode and use it on every page (or always show the full flow) |

### onboarding-enroll  (failing: hierarchy 3, state 3, polish 3)

| Element | Problem | Fix |
|---|---|---|
| Step 2 copy/timer | States time is running before the timer starts | Copy: 'Then tap Start: you have 60 s to connect.'; show timer idle state as '60 s' with a muted ring until started |
| Primary actions | Start timer and Connect compete | Make 'Connect' start the countdown automatically, or demote Start timer to a plain text button |
| Scroll clipping | Card cut by footer divider | Add bottom inset so the card ends above the footer, or compress the timer (smaller ring) so content fits at 844 pt |
| Simulator path | Physical-button instructions in simulator mode | Skip this step or show a simulator variant ('The virtual barrier is already in pairing mode') |

### connect-pairing  (failing: hig 3)

| Element | Problem | Fix |
|---|---|---|
| Pairing illustration | Fake input boxes look interactive | Render as a clearly illustrative thumbnail (smaller, device-frame, 'Example' caption, dots instead of input wells) or replace with an icon + text |
| Step labels | Completed step uses present-tense label | Use past tense for done steps: Connected, Secured, Owner verified |
| Spinners | Duplicate progress indicators | Drop the header spinner; keep the per-step one |

### presenter-obstruction-start  (failing: hierarchy 3, hig 3, tokens 3, a11y 3, polish 2)

| Element | Problem | Fix |
|---|---|---|
| Interlocks table | No horizontal padding; text touches card edges | Apply the standard 16 pt cell inset to the table rows (same cell component as Health) |
| Raw value column | ~10 pt mono caps | Raise to caption1 (12 pt) minimum or drop raw enums from the default view |
| Bottom dock | Too tall, duplicates the step title | Collapse to one row: [prev] [Next step] [Auto] [reset]; move the Interlocks/Auth panel toggle into a nav-bar button or a sheet; drop the duplicated 'Step n of m' line |
| Nav row | Back/badge insets differ from other screens | Use the shared header component and 16 pt gutters |
| Title | Inline 28 pt title inconsistent with Presenter list | Use the large-title style or a standard nav title consistently for scenario screens |
| Prev button | Bare chevron reads like navigation back | Label it 'Back' or use a step-backward glyph, with an accessibility label |

### presenter-obstruction-step3  (failing: hierarchy 3, hig 3, tokens 3, polish 3)

| Element | Problem | Fix |
|---|---|---|
| Bottom dock | Too tall, duplicates the step title | Collapse to one row: [prev] [Next step] [Auto] [reset]; move the Interlocks/Auth panel toggle into a nav-bar button or a sheet; drop the duplicated 'Step n of m' line |
| Nav row | Back/badge insets differ from other screens | Use the shared header component and 16 pt gutters |
| Title | Inline 28 pt title inconsistent with Presenter list | Use the large-title style or a standard nav title consistently for scenario screens |
| Prev button | Bare chevron reads like navigation back | Label it 'Back' or use a step-backward glyph, with an accessibility label |
| Scroll content | Check list hidden under dock | Add bottom content inset equal to dock height so the last check can scroll fully into view |

### presenter-limit-conflict  (failing: hierarchy 3, hig 3, tokens 3, polish 3)

| Element | Problem | Fix |
|---|---|---|
| Bottom dock | Too tall, duplicates the step title | Collapse to one row: [prev] [Next step] [Auto] [reset]; move the Interlocks/Auth panel toggle into a nav-bar button or a sheet; drop the duplicated 'Step n of m' line |
| Nav row | Back/badge insets differ from other screens | Use the shared header component and 16 pt gutters |
| Title | Inline 28 pt title inconsistent with Presenter list | Use the large-title style or a standard nav title consistently for scenario screens |
| Prev button | Bare chevron reads like navigation back | Label it 'Back' or use a step-backward glyph, with an accessibility label |
| Fault arm depiction | Inconsistent with Barrier tab fault | Use one fault-arm rendering rule (ghost/dashed for untrusted position) on both screens |

### presenter-replayed-command  (failing: hierarchy 3, hig 3, tokens 3, polish 3)

| Element | Problem | Fix |
|---|---|---|
| Bottom dock | Too tall, duplicates the step title | Collapse to one row: [prev] [Next step] [Auto] [reset]; move the Interlocks/Auth panel toggle into a nav-bar button or a sheet; drop the duplicated 'Step n of m' line |
| Nav row | Back/badge insets differ from other screens | Use the shared header component and 16 pt gutters |
| Title | Inline 28 pt title inconsistent with Presenter list | Use the large-title style or a standard nav title consistently for scenario screens |
| Prev button | Bare chevron reads like navigation back | Label it 'Back' or use a step-backward glyph, with an accessibility label |

### presenter-auth-latency  (failing: hierarchy 3, hig 3, tokens 3, polish 3)

| Element | Problem | Fix |
|---|---|---|
| Latency panel | Takes over the screen; step card hidden | Present as a sheet/detent or a separate tab; keep the dock to one row |
| Stat header | Label baselines misaligned | Top-align all stat labels on one baseline; size the 'last' value consistently with the others or place it on its own row |
| Spec marker | Danger red for a reference line | Use neutral/secondary label color with a dashed line; reserve red for failures (e.g. bar beyond spec) |
| Nav row | Back/badge insets differ from other screens | Use the shared header component and 16 pt gutters |
| Title | Inline 28 pt title inconsistent with Presenter list | Use the large-title style or a standard nav title consistently for scenario screens |
| Prev button | Bare chevron reads like navigation back | Label it 'Back' or use a step-backward glyph, with an accessibility label |

## Cross-cutting issues

1. **State-color mapping is not applied everywhere.** The hero uses the documented tokens (motion/RAISED = accent blue, LOWERED = success, STOPPED = warning, FAULT = danger, UNKNOWN = neutral), but Log chips show 'Moving' in green and 'Stopped' in gray, the onboarding Bluetooth badge and Haptics switch use green decoratively, and the latency spec line uses danger red as a reference. Centralize a `stateTone(state)` mapping and use it for every chip, badge and marker.
2. **Live vs stale/contradictory status chips.** The Zone/Sensors/Battery chip row is rendered in live success style when the link is lost and shows 'Sensors OK' during a position-sensor FAULT. Chips must derive from the same state as the hero and switch to neutral 'last known' styling when not live.
3. **Header and sheet patterns vary.** Barrier tab puts status pills below the large title, Health puts them beside it; Find barrier sheet uses Close above a 34 pt large title, Safety checks uses an inline 28 pt title with Done; presenter scenario screens use their own back/badge insets and 28 pt inline titles. Pick one tab-header and one sheet-header component.
4. **Bottom-inset collisions with fixed docks.** Fault card, link-lost chip row, onboarding enroll card, and every presenter scenario list run into the dock/footer edge. Add a bottom content inset equal to dock height + 16 pt on every screen with a fixed bottom bar.
5. **Repetition of the same message.** FAULT says 'needs on-site reset' three times; RAISED shows hero + banner + hint; scenario screens repeat the step title in card and dock. Trim to one message per layer (hero = state, banner = transient result, hint = why a control is disabled).
6. **Copy mismatches for the same action.** 'Find barrier' (Barrier tab), 'Connect to barrier' (Health), 'tap Connect' (onboarding done). Use one verb.
7. **Data consistency across screens.** Last counter is 1 on Health and 0 on This barrier in the same capture set; verify both read the same source.
8. **Destructive emphasis.** 'Clear log' is a solid red button at the top of Log; 'Forget this barrier' (red text row) is the right pattern - apply it to Clear log too.
9. **Unlabeled icon chip.** The cloud-off circle beside the connection pill appears on Barrier and Health with no label; add a short label ('Local') or remove it, since the SIMULATED badge and About already cover the message.
10. **Dark mode** is coherent overall (deep fills with white labels, tinted hero surfaces, good contrast). Only nits: sheets (Find barrier, Safety checks) sit on pure black rather than an elevated surface, so they read as pages.

## What works well

- Barrier hero: arm illustration + colored state title + plain-language subtitle makes every state readable in well under 2 s; UNKNOWN (dashed ghost arm) and RAISING (progress bar with elapsed/expected) are standout.
- Disabled controls always carry a reason line above them ('Already lowered.', 'Arm is moving. Use Stop.', 'Lower first to confirm position').
- Guard rejection banner and Safety checks sheet explain cause and fix in user language.
- Settings / This barrier / About are close to first-party inset-grouped quality in both schemes.
