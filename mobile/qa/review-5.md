# M010 Barrier: independent UI review 5

Scope: 29 screens x 2 schemes (58 screenshots, 390x844 pt web build). Scores 1-5; table shows min(light, dark). Light and dark scored identically on every screen; dark mode is coherent throughout.

| Screen | hierarchy | hig | tokens | state | errors | a11y | polish |
|---|---|---|---|---|---|---|---|
| onboarding-welcome | 5 | 4 | 5 | 5 | 5 | 5 | 4 |
| control-disconnected | 5 | 4 | 4 | 5 | 5 | 5 | 4 |
| control-lowered | 4 | 4 | 5 | 5 | 5 | 5 | 4 |
| control-raising | 5 | 5 | 5 | 5 | 5 | 5 | 4 |
| control-raised | 4 | 4 | 5 | 5 | 5 | 5 | 4 |
| control-stopped | 4 | 4 | 5 | 5 | 5 | 5 | 4 |
| control-guard-reject | 4 | 4 | 5 | 5 | 5 | 5 | 4 |
| control-fault | 5 | 4 | 5 | 5 | 5 | 5 | 4 |
| control-unknown | 4 | 4 | 5 | 5 | 5 | 5 | 4 |
| control-link-lost | 4 | 4 | 5 | 5 | 5 | 5 | **3** |
| connect-modal | 5 | 5 | 5 | 5 | 4 | 4 | 5 |
| health-connected | 4 | 5 | 4 | 5 | 5 | 5 | 4 |
| health-disconnected | 5 | 4 | 4 | 5 | 5 | 5 | 4 |
| log | 4 | 4 | 5 | 5 | 4 | 5 | 4 |
| settings | 5 | 4 | 5 | 5 | 5 | 5 | 4 |
| presenter | 5 | 4 | 5 | 5 | 5 | 5 | 4 |
| onboarding-mode | 5 | 5 | 5 | 5 | 5 | 5 | 4 |
| onboarding-bluetooth | 5 | 5 | 5 | 5 | 5 | 5 | 4 |
| onboarding-enroll | 4 | 4 | 5 | 5 | 5 | 5 | 4 |
| onboarding-done | 5 | 5 | 5 | 5 | 5 | 5 | 4 |
| settings-device | 4 | 5 | 5 | 5 | 5 | 5 | 5 |
| settings-about | 4 | 5 | 5 | 5 | 5 | 5 | 4 |
| guard-details | 4 | 5 | 5 | 5 | 5 | 5 | 4 |
| connect-pairing | 5 | 5 | 5 | 5 | 5 | 5 | 4 |
| presenter-obstruction-start | 5 | 4 | 5 | 5 | 5 | 5 | 4 |
| presenter-obstruction-step3 | 4 | 4 | 5 | 5 | 5 | 5 | 4 |
| presenter-limit-conflict | 4 | 4 | 5 | 5 | 5 | 5 | 4 |
| presenter-replayed-command | 4 | 4 | 5 | 5 | 5 | 5 | 4 |
| presenter-auth-latency | 4 | 4 | 5 | 5 | 5 | 5 | 4 |
| **Per-criterion min** | **4** | **4** | **4** | **5** | **4** | **4** | **3** |

Rows >= 4 on all criteria: 56 of 58 (28 of 29 screens, both schemes). Rows below 4: 2.

## Fix lists for screens with any score < 4

### control-link-lost (light + dark): polish 3

1. The stale chips row (Zone clear / Sensors OK / 12.90 V) is sliced in half by the top edge of the action dock in the first viewport. Either reserve the chips' height above the dock (reduce hero height in this state, since the banner adds ~160 pt), or hide the chips while offline (the hero already says 'Not live').
2. 'Connection lost' is shown twice (red chip and banner title). Change the chip to 'Offline' or hide it while the banner is visible.
3. Optional: add the last-update time to 'Not live.' (e.g. 'Not live. Last update 12 s ago.').

## Cross-cutting nits (all scored 4, worth fixing for 5)

- **Header pattern differs between tabs.** Barrier puts status chips under the large title; Health puts them inline at the right of the title. Use one header component.
- **Two different empty-state layouts.** Barrier: content centered low with a full-width CTA. Health: content high with a hugging CTA. Unify.
- **Back button spacing.** Onboarding '<  Back' has a ~18 pt chevron-label gap; '< Settings' / '< Scenarios' are tight. Use one back-button component.
- **Control screen composition.** About 150 pt of empty background between the chips and the action dock on lowered/raised/stopped/unknown/raising; and the dock's hint line disappears in STOPPED, so the dock top jumps between states. Keep a fixed hint slot and consider giving the space to the hero or chips.
- **Idle STOP looks disabled.** The pale tinted STOP when idle (and in FAULT under 'Controls locked.') is close to the disabled style. If STOP is always live, make that obvious (outline + solid glyph) and say so in FAULT.
- **Engineering copy on driver surfaces.** 'Signed in 0.53 s · phone-measured' (Barrier header), 'Barrier's last counter' (Health), 'Firmware interface: November 2026 contract' and 'final design review (slide 15)' (About). Fine in presenter mode, not on driver screens.
- **Copy consistency.** Hints end with or without periods ('Already lowered.' vs 'Lower first to confirm position'); log titles mix 'Lower: Moving' / 'State Lowering'; presenter chips say 'FSM rows 7' for a single row; enroll steps reference 'Start' and 'Connect' controls that are labelled differently or not on screen.
- **Card-in-card segmented controls** on Settings: the segmented control sits inside a padded white card. Put it directly in the group.
- **Log 'Share CSV'** is a large tinted pill beside the title; a nav-bar share icon is the native pattern.
- **Guard details ordering.** Sort failing checks to the top; drop subtitles that restate the title.
- **Presenter step screens** push the live hero below the fold so only a coloured sliver shows above the toolbar; a compact sticky mini-hero would keep the barrier visible on the projector.
- **Accessibility labels** needed for icon-only/visual-only elements: connect-sheet signal bars, presenter toolbar reset/sliders, the floating '?' on the unknown hero.
