# Review 3: M010 Barrier screenshots (fresh, independent)

Scope: 29 screens x light/dark = 58 screenshots, 390x844 pt web build. Scores 1-5, table shows min(light, dark).

Rows with every criterion >= 4: **45 / 58**. Rows below 4 on any criterion: **13**.

| Screen | Hier | HIG | Tokens | State | Errors | A11y | Polish |
|---|---|---|---|---|---|---|---|
| onboarding-welcome | 5 | 4 | 5 | 5 | 4 | 4 | 4 |
| control-disconnected | 4 | 4 | 5 | 5 | 4 | 4 | 4 |
| control-lowered | 4 | 4 | 4 | 5 | 4 | 4 | 4 |
| control-raising | 5 | 4 | 4 | 5 | 4 | 4 | 4 |
| control-raised | 4 | 4 | 4 | 5 | 4 | 4 | 4 |
| control-stopped | 4 | 4 | 4 | 5 | 4 | 4 | 4 |
| control-guard-reject | **3** | 4 | 4 | 4 | 4 | 4 | 4 |
| control-fault | 4 | 4 | 4 | 4 | 5 | 4 | **3** |
| control-unknown | 4 | 4 | 4 | 5 | 5 | 4 | 4 |
| control-link-lost | 4 | 4 | 4 | 4 | 5 | 4 | **3** |
| connect-modal | 4 | 4 | 5 | 4 | 4 | 4 | 4 |
| health-connected | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| health-disconnected | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| log | **3** | **3** | 4 | 4 | 4 | 4 | 4 |
| settings | 5 | 4 | 5 | 5 | 4 | 4 | 4 |
| presenter | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| onboarding-mode | 4 | 4 | 4 | 5 | 4 | 4 | 4 |
| onboarding-bluetooth | 4 | 4 | 5 | 5 | 4 | 4 | 4 |
| onboarding-enroll | 4 | 4 | 4 | 4 | 4 | **3** | **2** |
| onboarding-done | 4 | 4 | 5 | 5 | 4 | 4 | 4 |
| settings-device | 5 | 5 | 5 | 5 | 4 | 4 | 4 |
| settings-about | 5 | 5 | 5 | 5 | 4 | 4 | 4 |
| guard-details | 4 | 4 | 5 | 5 | 5 | 4 | 4 |
| connect-pairing | 4 | 4 | 4 | 5 | 4 | 4 | 4 |
| presenter-obstruction-start | **3** | 4 | 4 | 4 | 4 | 4 | 4 |
| presenter-obstruction-step3 | 4 | 4 | 4 | 5 | 5 | 4 | 4 |
| presenter-limit-conflict | 4 | 4 | 4 | 5 | 5 | 4 | 4 |
| presenter-replayed-command | 4 | 4 | 4 | 5 | 5 | 4 | 4 |
| presenter-auth-latency | **3** | 4 | 4 | 4 | 4 | 4 | **3** |

## Failing rows

- control-guard-reject (light): hierarchy=3
- control-fault (light): polish=3
- control-link-lost (light): polish=3
- log (light): hierarchy=3, hig=3
- onboarding-enroll (light): a11y=3, polish=2
- presenter-obstruction-start (light): hierarchy=3
- presenter-auth-latency (light): hierarchy=3, polish=3
- control-guard-reject (dark): hierarchy=3
- control-fault (dark): polish=3
- log (dark): hierarchy=3, hig=3
- onboarding-enroll (dark): a11y=3, polish=2
- presenter-obstruction-start (dark): hierarchy=3
- presenter-auth-latency (dark): hierarchy=3, polish=3

## Fix lists (screens with any score < 4)

### control-guard-reject

| Element | Problem | Fix |
|---|---|---|
| Raise button | Filled primary right under 'Can't move right now'; invites a repeat of the refused command. | While a guard bit is set, render Raise/Lower in the tinted style, or keep enabled with hint 'Clear the space, then try again'. |
| Hero card | Stays plain green 'Lowered' while motion is blocked. | Add a small amber 'Zone blocked' line or badge in the hero, under the subtitle. |
| Warning banner | No path to the Safety checks sheet. | Add a trailing chevron / 'Details' link that opens guard-details. |

### control-fault

| Element | Problem | Fix |
|---|---|---|
| Hero card | Shrinks to ~70% height and redraws the arm/base at a smaller scale; screen jumps on entering FAULT. | Keep the hero at the same fixed height and illustration scale for every state; centre the fault title in the same slot as other state titles. |
| Hero title | Shows only the cause; the state word 'Fault' is missing. | Title 'Fault' (danger colour + glyph), cause 'Position sensors disagree' as subtitle. |
| 'Sensors: see fault' chip | Neutral grey for the failing item. | Use the danger tint + warning icon. |

### control-link-lost

| Element | Problem | Fix |
|---|---|---|
| Hero arm (light) | Dimmed arm loses its white segments on the white card and reads as broken stripes. | Render stale arm as full arm at ~40% opacity or a grey outline, same as dark mode. |
| Hero illustration | Smaller scale than live states. | Use the shared hero size/scale. |

### log

| Element | Problem | Fix |
|---|---|---|
| Share CSV | Full-width filled primary button dominates a read-only list. | Move to a header share icon or a tinted/plain button under the summary. |
| Row status pills | Repeat the row title and double row height. | Drop the pill; colour the leading icon or append status to the meta line. |

### onboarding-enroll

| Element | Problem | Fix |
|---|---|---|
| Timer ring | '1:00' and 'not started' overlap the ring stroke. | Enlarge ring (about 160pt) or drop numerals to ~34pt; place 'not started' inside the inner radius or below the ring. |
| Footnote 'up to 2 owner phones' | Collides with the footer divider. | Add bottom padding equal to footer height in the scroll content, or move the note into step 3's card. |
| Step 1 copy | Four bold lines. | Shorten to one line plus secondary text. |

### presenter-obstruction-start

| Element | Problem | Fix |
|---|---|---|
| State table | Three columns without headers; right column duplicates the middle. | Add column headers (e.g. 'App' / 'Raw') or remove the duplicate column. |

### presenter-auth-latency

| Element | Problem | Fix |
|---|---|---|
| Median stepper label | 'Simulated median (next run)' wraps leaving 'run)' orphaned. | Shorten to 'Next-run median' or put the label above the stepper row. |
| State table | Same headerless duplicate column; 'No block' dimmer than siblings. | Add headers; use the same value style for all rows. |
| Capture | Screenshot is mid-scroll, title not visible. | Re-capture from scroll top for review. |

## Cross-cutting issues

1. **Hero card is not a fixed frame.** Fault, link-lost and presenter fault heroes change height and draw the arm/base at a different scale from lowered/raising/raised/stopped/unknown. Lock hero height and illustration scale across all states so state changes animate in place.
2. **Redundant status messaging on the control screen.** Toast + hero + hint line + disabled button often repeat one fact (raised, stopped). Pick one confirmation (the hero) and use the toast only for events the hero cannot show (rejections, link loss).
3. **Engineering copy leaking into end-user screens.** 'Phone-measured, simulated. Reference: 2.00 s', 'An accepted command starts a monitored movement...', C4/S5/S6 requirement rows, 'Nothing here is a verdict'. Fine for presenter, noisy on Barrier/Health tabs; move behind a disclosure or into Presenter/About.
4. **Secondary text that restates the title** (log pills, guard-details 'Valid', 'No fault'). Use secondary lines only for new information.
5. **Onboarding page indicator**: one dot is consistently lighter (skipped step) and inactive dots are nearly invisible in dark mode; use a uniform inactive colour with at least 3:1 against the background, and hide skipped steps.
6. **Presenter state table** lacks column headers and shows duplicate values; one fix covers all presenter step screens.
7. **What works well**: token use and dark mode are coherent (deep fills + white labels, tinted state cards, AA-looking text everywhere); state colours always come with words and glyphs; disabled states always carry a reason line; touch targets are generous (buttons ~56-72pt tall); grouped inset lists in Settings/Health/About read as first-party.
