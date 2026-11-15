# M010 Barrier - Screenshot design review 4

Independent review of 29 screens x 2 schemes (58 captures) at 390x844 pt against docs/DESIGN.md ("Apple-native premium", section 4.1 as-built tokens). Scores 1-5; 5 = first-party polish, 4 = minor nits only, 3 = issue a user would notice.

**Result:** 54/58 rows score >= 4 on every criterion; 4 rows do not.

## Summary (min of light/dark)

| Screen | hierarchy | hig | tokens | state | errors | a11y | polish |
|---|---|---|---|---|---|---|---|
| onboarding-welcome | 5 | 5 | 5 | 5 | 4 | 5 | 5 |
| control-disconnected | 5 | 5 | 5 | 5 | 5 | 5 | 4 |
| control-lowered | 5 | 5 | 5 | 5 | 4 | 4 | 4 |
| control-raising | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| control-raised | 5 | 5 | 5 | 5 | 4 | 5 | 5 |
| control-stopped | 5 | 5 | 5 | 5 | 4 | 5 | 4 |
| control-guard-reject | 4 | **3** | **3** | 4 | 4 | 4 | 4 |
| control-fault | 5 | 5 | 5 | 5 | 5 | 5 | 4 |
| control-unknown | 5 | 5 | 5 | 5 | 5 | 5 | 4 |
| control-link-lost | 5 | 5 | 5 | 5 | 5 | 4 | 4 |
| connect-modal | 5 | 5 | 5 | 5 | 4 | 4 | 5 |
| health-connected | 4 | 4 | 5 | 4 | 4 | 4 | 4 |
| health-disconnected | **3** | 4 | 5 | 4 | 4 | 4 | 4 |
| log | 5 | 4 | 5 | 5 | 4 | 4 | 4 |
| settings | 5 | 4 | 5 | 5 | 5 | 4 | 4 |
| presenter | 5 | 5 | 5 | 5 | 4 | 5 | 4 |
| onboarding-mode | 5 | 5 | 4 | 5 | 5 | 4 | 4 |
| onboarding-bluetooth | 5 | 5 | 5 | 5 | 4 | 5 | 4 |
| onboarding-enroll | 4 | 5 | 5 | 4 | 4 | 5 | 4 |
| onboarding-done | 5 | 5 | 5 | 5 | 4 | 5 | 4 |
| settings-device | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| settings-about | 4 | 5 | 5 | 5 | 4 | 5 | 4 |
| guard-details | 5 | 5 | 5 | 5 | 5 | 5 | 4 |
| connect-pairing | 5 | 5 | 5 | 5 | 5 | 4 | 4 |
| presenter-obstruction-start | 5 | 4 | 5 | 5 | 4 | 4 | 4 |
| presenter-obstruction-step3 | 4 | 4 | 5 | 5 | 5 | 4 | 4 |
| presenter-limit-conflict | 4 | 4 | 5 | 5 | 5 | 4 | 4 |
| presenter-replayed-command | 4 | 4 | 5 | 5 | 5 | 4 | 4 |
| presenter-auth-latency | 4 | 4 | 5 | 5 | 4 | 4 | 4 |

Light and dark scored identically on every screen: the dark palette is coherent (true-black bg, #1C1C1E cells, tinted hero fills, #409CFF/#30D158/#FFB340/#FF6961 accents). Dark-specific notes are in the JSON.

## Failing rows

| Screen | Scheme | Failing criteria |
|---|---|---|
| control-guard-reject | light | hig 3, tokens 3 |
| health-disconnected | light | hierarchy 3 |
| control-guard-reject | dark | hig 3, tokens 3 |
| health-disconnected | dark | hierarchy 3 |

## Fix lists (screens with any score < 4)

### control-guard-reject (hig 3, tokens 3)

| Element | Problem | Fix |
|---|---|---|
| Raise button | Third visual style (tinted fill + accent label) between enabled-filled and neutral-disabled; reads as "maybe tappable", especially in dark (navy fill). | Use exactly two styles: if the barrier will accept a retry, render Raise as the normal filled primary; if it is blocked, use the neutral disabled style and put the reason in the dock hint line ("Clear the zone to raise"). |
| Hero card | Green 'Lowered / You can drive in' and amber 'Movement blocked' line compete; the amber line duplicates the banner. | Keep hero purely about position; drop the amber line from the hero since the banner and the Zone chip already say it. |
| Overall colour load | Green hero + amber chip + amber banner + blue Raise + red STOP on one screen. | With Raise neutral (above) and the hero line removed, amber becomes the single signal colour for the guard state. |

### health-disconnected (hierarchy 3)

| Element | Problem | Fix |
|---|---|---|
| REQUIREMENTS section | Course/spec codes (C4, C5, S5, S6) and bench caveats fill over half the screen of a primary user tab and outweigh the empty state. | Move this list to Presenter mode or behind a 'Project requirements' row in Settings > About; on Health keep only the empty state (optionally a single 'What Health shows' footer). |
| Header status pill | 'Not connected' here vs 'Disconnected' on Barrier tab. | Use one term app-wide ("Not connected" is friendlier). |
| Header cloud-off icon button | Unlabeled circular icon looks tappable; meaning unclear. | Replace with the same 'Local only' text pill used on the Barrier tab, or remove from Health. |

## Cross-cutting issues

1. **Button-state vocabulary.** The control dock should have exactly three looks: filled (recommended action), neutral (disabled), and STOP (tinted idle / solid while moving). The guard-reject tinted Raise breaks this; fixing it is the single highest-value change.
2. **Engineering wording on user surfaces.** 'phone-measured', 'Barrier's last counter', requirement codes on Health, 'November 2026 contract' and 'slide 15' in About. Keep these in Presenter/About-advanced; the driver-facing tabs should read like Apple Home.
3. **Inconsistent status iconography in headers.** Barrier tab uses text pills ('Local only'); Health uses an unlabeled icon-only circle. Unify.
4. **List row anatomy drift.** Inset vs full-bleed separators (Presenter list), right-aligned values (Health, This barrier) vs left-aligned bold values (Presenter Live status), icon tile on some Settings rows but not Haptics, subtitles that repeat the title (Safety checks, Health interlocks).
5. **Layout shifts between barrier states.** The dock hint line is absent in STOPPED, so the dock jumps ~26 pt; the disconnected empty state places its CTA mid-screen while connected states use the bottom dock. Reserve the hint line height always.
6. **Scroll-edge clipping.** Chips cut in half by the dock (link-lost) and arm slivers peeking above the presenter transport bar look like clipping. Add bottom inset equal to dock height and/or a short gradient under sticky bars.
7. **Presenter result cards push the arm off-screen** on step screens; for a projector demo, consider a compact arm thumbnail in the step card or collapsing details by default.
8. **Icon-only controls** (presenter transport reset/tune/prev, Health header icon, signal bars) need accessibility labels; on a projector, short text labels would also help.

## What is working well

- State is readable within 2 s on every barrier screen: tinted hero + arm pose + coloured title + plain sentence, with icon+text chips (never colour only).
- Error/offline handling is strong: fault recovery card with physical instructions, link-lost 'Last known / Not live' treatment with all controls disabled, guard banner linking to Safety checks.
- Grouped inset lists, large titles, footers and destructive-row placement are consistently Apple-native; dark mode is complete and coherent with the 4.1 tokens.
- Touch targets are generous (dock buttons ~70 pt tall, rows >= 52 pt).
