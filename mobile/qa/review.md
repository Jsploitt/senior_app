# M010 Barrier: screenshot design review

Reviewer: independent, screenshots only (no source read). 29 screens x 2 schemes = 58 rows. Scale 1-5 (5 = first-party polish, 4 = minor nits). Full per-row scores and notes: `review.json`.

**Rows scoring >= 4 on all criteria: 2 / 58.**

## Summary (min of light / dark)

| Screen | hierarchy | hig | tokens | state | errors | a11y | polish | min |
|---|---|---|---|---|---|---|---|---|
| onboarding-welcome | 4 | 4 | 4 | 5 | 4 | 4 | 4 | **4** |
| control-disconnected | 4 | 3 | 4 | 4 | 4 | 4 | 3 | **3** |
| control-lowered | 3 | 3 | 4 | 5 | 3 | 2 | 2 | **2** |
| control-raising | 4 | 4 | 3 | 5 | 4 | 3 | 3 | **3** |
| control-raised | 3 | 3 | 4 | 5 | 3 | 3 | 2 | **2** |
| control-stopped | 4 | 4 | 4 | 5 | 4 | 4 | 3 | **3** |
| control-guard-reject | 2 | 3 | 4 | 3 | 2 | 3 | 2 | **2** |
| control-fault | 3 | 3 | 4 | 4 | 3 | 3 | 2 | **2** |
| control-unknown | 4 | 4 | 4 | 4 | 4 | 3 | 3 | **3** |
| control-link-lost | 3 | 3 | 3 | 2 | 3 | 2 | 2 | **2** |
| connect-modal | 4 | 3 | 4 | 3 | 4 | 4 | 3 | **3** |
| health-connected | 4 | 4 | 3 | 4 | 4 | 4 | 3 | **3** |
| health-disconnected | 4 | 4 | 3 | 4 | 4 | 4 | 3 | **3** |
| log | 2 | 3 | 3 | 3 | 3 | 4 | 2 | **2** |
| settings | 4 | 3 | 3 | 4 | 4 | 3 | 4 | **3** |
| presenter | 4 | 4 | 3 | 4 | 4 | 4 | 3 | **3** |
| onboarding-mode | 4 | 4 | 4 | 3 | 3 | 3 | 4 | **3** |
| onboarding-bluetooth | 4 | 4 | 4 | 4 | 4 | 4 | 3 | **3** |
| onboarding-enroll | 4 | 3 | 4 | 4 | 4 | 4 | 2 | **2** |
| onboarding-done | 4 | 4 | 4 | 3 | 4 | 4 | 4 | **3** |
| settings-device | 3 | 2 | 4 | 4 | 3 | 4 | 3 | **2** |
| settings-about | 3 | 2 | 4 | 4 | 4 | 4 | 3 | **2** |
| guard-details | 4 | 3 | 3 | 3 | 4 | 4 | 4 | **3** |
| connect-pairing | 3 | 3 | 4 | 2 | 3 | 4 | 3 | **2** |
| presenter-obstruction-start | 3 | 4 | 3 | 4 | 4 | 3 | 3 | **3** |
| presenter-obstruction-step3 | 3 | 4 | 3 | 4 | 3 | 3 | 3 | **3** |
| presenter-limit-conflict | 3 | 4 | 3 | 4 | 4 | 4 | 3 | **3** |
| presenter-replayed-command | 3 | 4 | 3 | 3 | 3 | 3 | 3 | **3** |
| presenter-auth-latency | 4 | 3 | 3 | 4 | 4 | 4 | 2 | **2** |

## Fix lists (screens with any score < 4)

### control-disconnected  (hig 3, polish 3)

- Empty state ('Find your barrier') floats in the top third and leaves ~800pt of blank background above the tab bar; center the empty-state group vertically in the available area (Apple Home empty-state pattern).
- Header: the three pills (Disconnected / Local only / SIMULATED) sit in a row under the large title instead of the spec'd header-right connection pill; on the connected screens the same row wraps SIMULATED to a second line. Move SIMULATED into a single compact badge (top-right) and keep one pill row.
- Large title reads 'Barrier' here but 'M010-Barrier' once connected; the title should not change identity between states. Use the stored barrier name or a fixed 'Barrier' title with the device name as a subtitle.
- 'Find barrier' button is content-width (~150pt) while every other primary CTA in the app is full-width; pick one primary-button width rule.

### control-lowered  (hierarchy 3, hig 3, errors 3, a11y 2, polish 2)

- Clipped text: a row reading 'Authenticated in 0.5x s' is cut in half by the pinned ControlPad divider at y~595pt. The AuthLatencyBadge is effectively invisible. Reserve its space above the pad or move it into the header/pill row.
- Hero card is ~350pt tall with the illustration in its lower half and ~190pt of empty tinted space on top; shrink the hero to ~240pt (spec: 'hero shrinks first') so chips and the latency badge fit above the pinned pad.
- Disabled LOWER (light): white label on pale green (#9CC3A6-ish) is ~1.8:1 and gives no reason. Use a neutral disabled fill (systemGray5 + tertiaryLabel text) and show the disabledReason as a caption above the pad ('Already lowered'), as is done on the Unknown/Fault screens.
- GuardChips wrap: 'Battery 12.90 V' drops alone onto a second row. Fit all three chips on one row (shorter labels, e.g. '12.9 V', or a horizontal scroller).
- Header pills: 'SIMULATED' wraps to its own row under 'Connected - owner' / 'Local only', pushing the hero down 68pt.
- Dark: disabled LOWER is grey text on dark green (~2:1), same fix.

### control-raising  (tokens 3, a11y 3, polish 3)

- STOP correctly becomes the filled danger primary while moving; good.
- Both LOWER and RAISE are disabled while moving but rendered as pale tinted fills with white text (~1.6:1 light); they read as 'washed out' rather than intentionally disabled. Use one neutral disabled style.
- 'Battery 12.90 V' chip bottom edge touches/clips against the pad divider at y~595pt; add 16pt clearance above the pinned pad or allow the content to scroll under a fade.
- Progress '0.8 s of about 4.0 s' is text-only; the spec'd progress ring/bar is not visible. Add a determinate bar under the label so progress is readable at a glance.
- Dark: filled STOP uses a light-mode red (~#D0202C) with white text instead of the dark danger token #FF6961 with onFill #000; align with the token table.

### control-raised  (hierarchy 3, hig 3, errors 3, a11y 3, polish 2)

- A green result card (likely the 'Done' ResultBanner) peeks out as a 12pt sliver at y~590pt and is otherwise hidden under the pinned ControlPad; the user never sees the result. Show transient results as a toast above the pad or reserve a fixed slot.
- Disabled RAISE (light): white on pale blue ~1.7:1, with no visible reason; add caption 'Already raised'.
- Hero too tall (same as Lowered): ~110pt empty space above the arm.
- Header pills wrap SIMULATED to a second row.
- Dark: disabled RAISE is grey on navy (~2:1).

### control-stopped  (polish 3)

- Hero sub-label wraps with a one-word orphan ('continue.'); shorten to 'Stopped mid-travel. Raise or lower to continue.' or balance the wrap.
- 'Battery 12.90 V' chip sits flush against the pad divider (0pt gap) at y~595pt; needs >=12pt clearance.
- Header pills wrap SIMULATED to a second row.

### control-guard-reject  (hierarchy 2, hig 3, state 3, errors 2, a11y 3, polish 2)

- The guard-rejection ResultBanner (orange card) is hidden under the pinned ControlPad; only a 10pt orange sliver is visible at y~590pt. The single most important message on this screen (why the command was refused) is invisible. Pin the banner directly above the pad, or present it as a toast overlay over the hero bottom.
- Hero still reads 'Lowered' in large success-green on a green card; the dominant signal says 'all good' while the last command failed. Add a warning-colored result line inside the hero ('Raise refused: something is in the way') or tint the chip row.
- Only cue on screen is the 'Zone blocked' chip (orange, with icon). Make that chip visibly tappable (chevron) since it opens Safety checks.
- Disabled LOWER low contrast and unexplained (see Lowered).

### control-fault  (hierarchy 3, hig 3, errors 3, a11y 3, polish 2)

- Hero: ~150pt empty band between the warning triangle (y~190pt) and the arm (y~340pt); the triangle floats alone. Place the icon inline with the title or overlay it on the housing.
- Hero title is the fault name ('Position sensors disagree', wraps to 2 lines at 28pt bold) with no 'Fault' state word; add a small 'FAULT' eyebrow or use 'Fault' as the title and the reason as sub-label, matching other states' 'state + explanation' pattern.
- GuardChips row is clipped mid-glyph by the pad divider at y~570pt (only chip tops visible). Hide chips in FAULT or let the hero shrink.
- Instruction repeated twice ('Needs on-site reset...' in hero and 'Locked by a fault. It needs an on-site reset.' above the pad). Keep the precise one (hold button 8 s) once.
- STOP stays light-tinted while LOWER/RAISE are disabled; fine per spec, but in dark its fill equals the hero fill so it loses its edge.

### control-unknown  (a11y 3, polish 3)

- Good: dashed arm + '?' + 'Lower first to confirm position' caption above the pad is the clearest disabled-reason pattern in the app; reuse it on Lowered/Raised.
- Third chip (Battery) is clipped under the pad divider at y~570pt; only its top 8pt shows.
- Hero uses plain white surface while every other state uses a tinted card; acceptable for neutral, but the '?' glyph (bold text character) looks like a placeholder. Use the questionmark.circle symbol at the same weight as the fault triangle.

### control-link-lost  (hierarchy 3, hig 3, tokens 3, state 2, errors 3, a11y 2, polish 2)

- Contradiction: banner says 'The barrier stops automatically if it was moving' while the hero still shows 'Raising' in full accent blue with an animated-looking arm. Replace with 'Last known: Raising' in neutral grey, desaturate the whole hero card (not just the arm), and drop the moving-state color.
- Hero sub-label is clipped by the pad divider at y~595pt ('Arm is moving up' cut mid-glyph); the hero is pushed down by the banner. Collapse the hero to a compact row when the banner is present.
- STOP is rendered as a ghost (~1.3:1 in light, nearly invisible in dark). If it is disabled because there is no link, say so in a caption ('Not connected') rather than making the safety control vanish.
- Connection-lost banner uses a drop shadow while all other cards are flat; tokens say flat by default.
- Dark: STOP label/icon dark red on near-black red is ~1.3:1, effectively invisible.

### connect-modal  (hig 3, state 3, polish 3)

- No scanning state: there is no 'Searching...' spinner, 'NEARBY BARRIERS' section header, or last-scanned time, so the list's freshness is unknown. Add a section header with an activity indicator while scanning.
- RSSI bars are pure black/white glyphs with no value or label; add an accessibility label and color them secondaryLabel to match other accessories.
- 'Close' sits at y~39pt while the large title baseline is ~y50pt; on a modal use a standard nav bar with Close in the bar and the large title below it, or vertically center Close on the title.
- Bottom ~70% of the sheet is empty; fine for a modal, but the 'Scan again' button reads as primary-sized secondary. Make it a plain text button in the nav bar or a list footer.

### health-connected  (tokens 3, polish 3)

- 'Local only' chip here is blue-tinted with accent text and placed top-right; on Control it is grey with secondary text placed in the pill row. Use one LocalOnlyChip style and position on both screens.
- 'Last result: Done (COMPLETED)' shows the raw firmware enum in parentheses; show 'Done' and move the enum to the Log/presenter.
- Movement guard row prints the raw boolean formula in CamelCase ('MotionAllowed = OwnerAuthorized AND ...'); render it as a checklist (or link to Safety checks) for the operator; keep the formula for presenter mode.
- No connection status on this screen at all; add the connection pill so 'live vs stale' is obvious.

### health-disconnected  (tokens 3, polish 3)

- Requirements rows: right-hand values ('Board', 'By design', 'Phone proxy', 'Bench') are set at 17pt secondary and compete with row titles while the subtitles wrap to 2 lines because of them. Move the value to a small caption tag under the title or a trailing chip.
- User-facing copy exposes a repo path ('tools/log_parser.py s6'); say 'Scored on the bench from labelled trials' and keep the path in About/presenter.
- Footer 'Nothing here is a verdict...' is cut by the tab bar at the fold; ensure bottom content inset equals tab bar height + 16pt.
- 'Local only' chip style differs from Control (see health-connected).

### log  (hierarchy 2, hig 3, tokens 3, state 3, errors 3, polish 2)

- The Log screen's primary content (the event list) is entirely below the fold; above it are S5/S6 summary tables. Move the filter segmented control directly under the title and the event list first; collapse summaries into one compact header row or move them to Health.
- S6 TALLIES shows contradictory/duplicated rows: 'Accepted 3', 'Rejected 0', then 'ACCEPTED 2', 'STOPPED 1' in raw uppercase enums. Either group the per-result breakdown under a sub-header ('By result') with human labels, or remove it.
- Action buttons are inconsistent: 'Share CSV' is a tinted pill, 'Clear log' is plain accent text next to it. Clear log is destructive and should be red text (or behind a menu); Share should be a nav-bar share icon.
- S5 rows 'p50'/'p95' are statistician jargon for the end user; label 'Median' / '95th percentile'.
- Dark: segmented control selected segment ('All') is darker than the track; selection reads inverted.

### settings  (hig 3, tokens 3, a11y 3)

- Haptics switch: teal thumb on green track is neither iOS (white thumb) nor Material 3 (thumb tinted from the same hue); use a white thumb on success/accent track, or the platform Switch.
- Connection segmented control: disabled 'Bluetooth' segment text is ~2:1 and only the footer explains why. Add a lock glyph or '(Android app)' inside the segment, and keep the footer.
- Row icon colors (orange, green, blue tiles) are fine, but green 'Presenter mode' tile reuses the success color; pick a non-semantic tint (e.g. indigo).
- Dark: selected segment (Simulated / System) is darker (#1C1C1E) than the track (#2C2C2E); iOS dark uses a lighter selected thumb (#636366). Selection is hard to see.

### presenter  (tokens 3, polish 3)

- SIMULATED badge here is letter-spaced uppercase bold in a larger pill top-right; on Control it is a smaller pill in the chip row. One SimulatedBadge component, one style.
- Subtitle 'FPR scenarios on a simulated barrier' wraps at ~200pt because the badge column reserves width, leaving 'barrier' orphaned. Put the badge in the nav bar or let the subtitle span full width below.
- List is cut by the 'Exit presenter' bar mid-row ('Sensor failure' description clipped) with no fade or separator; add a bottom content inset and a top hairline/blur on the bar.
- Each scenario shows 'FSM rows 1, 5, 7...' as accent-colored chips that look tappable but are not; use neutral chips.

### onboarding-mode  (state 3, errors 3, a11y 3)

- 'I have the barrier here' card is greyed (~2.5:1 text) but still shows an empty radio; it reads as 'unselected' and 'disabled' at the same time. If unavailable on this build, add an inline 'Needs the Android app' tag inside the card and remove the radio; if selectable, render it at full contrast.
- Unavailability reason sits below both cards in 13pt caption; move it into the disabled card.
- Dark: disabled card text is even dimmer (~2:1).

### onboarding-bluetooth  (polish 3)

- Page indicator shows 5 dots here but 4 dots on Welcome/Mode/Enroll/Done; step count must be consistent (it also jumps from dot 2 on Mode to dot 3 here to dot 3 on Enroll).
- Content is vertically centered here (hero at y~210pt) while Mode/Enroll are top-aligned below the Back link; the hero tile jumps position between steps. Use one layout anchor.
- Copy 'Nearby devices access is used only for this' is Android-correct; keep it. No denied-state visible (spec: deep link to Settings) - verify it exists.

### onboarding-enroll  (hig 3, polish 2)

- Step 2 card is hard-clipped at y~674pt (no bottom corner radius, text runs into the page dots) and step 3 ('Tap Connect, then enter the passkey') is not visible at all. Make the content area scroll with a bottom fade above the dots, or compress: smaller ring (~120pt), timer button inline.
- Primary 'Connect' is enabled and visually dominant before the 60 s timer has started; consider making 'Start 60 s timer' the primary until it runs, then promote Connect.
- Step 1 text wraps to 3 lines with an orphan 'seconds.'; tighten copy ('Hold the barrier's button for 3 s').

### onboarding-done  (state 3)

- CTA 'Open the barrier' is ambiguous for a parking barrier (sounds like a command to lower/open the arm). Use 'Go to Barrier' or 'Done'.
- Spec says Done shows 'You're the owner' + 'Authenticated in X.XX s'; screen shows generic 'You're all set.' with no owner/latency confirmation, and body text tells the user to 'tap Connect' even though the user just paired (or chose simulator). Tailor copy per path.
- Hero tile + check is vertically centered with ~430pt empty above; consistent with Bluetooth step but not with Mode/Enroll.

### settings-device  (hierarchy 3, hig 2, errors 3, polish 3)

- Navigation order is inverted: the large title 'Barrier' renders ABOVE the back link '< Settings' (y~30pt vs y~88pt). On a pushed screen the back control belongs in the nav bar above/left of the title. Fix the stack header (headerLargeTitle with headerBackTitle) so back sits at the top.
- Title 'Barrier' duplicates the Control tab name; use 'This barrier' or the device name.
- 'Forget this barrier' is a full-width filled red button; in an inset-grouped Settings context use a red-text row in its own group, and show the consequence text (re-enroll, remove OS bond) as the group footer before the action.
- Long labels 'Next command counter (this phone)' leave little room for values; fine at default size but will truncate at larger text sizes.

### settings-about  (hierarchy 3, hig 2, polish 3)

- Same inverted nav as Device: large title 'About' above the '< Settings' back link. Back must be at the top.
- 'Contract  INTERFACES.md as of 2026-11-15' exposes a file name as a value and is nearly row-width; show 'Interface contract  2026-11-15'.
- Scope card copy is long (5 lines) in a single cell; split into a title + footer or a 'Learn more' row.

### guard-details  (hig 3, tokens 3, state 3)

- Failing row is titled 'Zone clear' with a warning icon and subtitle 'Something detected'; the title states the opposite of reality. Title failing rows by their state ('Zone blocked'), matching the chip on Control.
- Row separators run full-bleed (x=16 to 374pt) while Health/Settings use inset separators aligned to text; use inset separators starting at the text column (x~68pt).
- Sheet has no grabber and uses a large title; for a formSheet with detents, show a grabber and an inline title (Title 2) per the design doc.
- Good: 'Blocked your last command' callout and plain-language explanation are clear and actionable.

### connect-pairing  (hierarchy 3, hig 3, state 2, errors 3, polish 3)

- This state is supposed to show pairing guidance ('Your phone will ask for a 6-digit code...') and the step list (Connecting > Securing > Checking owner > Ready). The screenshot is just the scan list without the 'Previously paired' tag; nothing communicates that pairing is expected. Show the guidance sheet/inline card and the StepList in the tapped row.
- Row has no inline progress or phase label, so a user cannot tell a tapped row from an idle one.
- Same nav/Close alignment and empty lower area as connect-modal.

### presenter-obstruction-start  (hierarchy 3, tokens 3, a11y 3, polish 3)

- No step indicator ('Step 3 of 6') or current step description is visible; the presenter cannot tell where they are in the script. Add a one-line step caption + counter in the drawer above the Next step button.
- State is repeated three times (hero 'Raised', STATE card 'Raised', raw 'RAISED'); for the audience the hero is enough. Drop the STATE card or make the 2x2 grid denser (one row each for result/fault/guard).
- Second chip row ('Next counter 1', 'Link ready') is clipped by the drawer top edge at y~707pt.
- Chips use a 'label value' two-weight style (grey label + bold value) that exists nowhere else in the app; reuse GuardChips styling with icons so pass/fail is not color-only.
- Dark: drawer segmented control selected segment darker than track (inverted).

### presenter-obstruction-step3  (hierarchy 3, tokens 3, errors 3, a11y 3, polish 3)

- No step indicator ('Step 3 of 6') or current step description is visible; the presenter cannot tell where they are in the script. Add a one-line step caption + counter in the drawer above the Next step button.
- State is repeated three times (hero 'Raised', STATE card 'Raised', raw 'RAISED'); for the audience the hero is enough. Drop the STATE card or make the 2x2 grid denser (one row each for result/fault/guard).
- Hero sub-label says 'Raise or lower to continue' while the zone is blocked and motion is refused; in a guarded STOPPED state the sub-label should say 'Clear the zone, then raise or lower'.
- Chip row 2 is fully hidden by the drawer (only top edges at y~705pt).
- Dark: drawer segmented control selected segment darker than track (inverted).

### presenter-limit-conflict  (hierarchy 3, tokens 3, polish 3)

- No step indicator ('Step 3 of 6') or current step description is visible; the presenter cannot tell where they are in the script. Add a one-line step caption + counter in the drawer above the Next step button.
- State is repeated three times (hero 'Raised', STATE card 'Raised', raw 'RAISED'); for the audience the hero is enough. Drop the STATE card or make the 2x2 grid denser (one row each for result/fault/guard).
- FAULT card title wraps to 3 lines at 28pt ('Position / sensors / disagree'), making the grid uneven (card heights 184 vs 220pt). Use a smaller title in grid cards (Title 3, 20pt).
- Warning triangle in the hero overlaps the arm tip area at y~178pt; position it consistently with the Control fault hero.
- Dark: drawer segmented control selected segment darker than track (inverted).

### presenter-replayed-command  (hierarchy 3, tokens 3, state 3, errors 3, a11y 3, polish 3)

- No step indicator ('Step 3 of 6') or current step description is visible; the presenter cannot tell where they are in the script. Add a one-line step caption + counter in the drawer above the Next step button.
- State is repeated three times (hero 'Raised', STATE card 'Raised', raw 'RAISED'); for the audience the hero is enough. Drop the STATE card or make the 2x2 grid denser (one row each for result/fault/guard).
- Description promises 'Frame hex is shown' but no hex is visible on screen; this is the S6 evidence scenario. Show the last TX frame hex (mono) and the reject reason (REPLAY / COUNTER_JUMP / BAD_NONCE) in a dedicated card above the fold.
- LAST RESULT 'Rejected: out of sequence' sits next to GUARD 'No rejection' - reads as a contradiction. Rename the GUARD card 'Guard mask' and show '-' when not applicable, or replace it with 'Reason: REPLAY'.
- Chip row 2 clipped by drawer.
- Dark: drawer segmented control selected segment darker than track (inverted).

### presenter-auth-latency  (hig 3, tokens 3, polish 2)

- Expanded drawer overlaps the hero and slices the 'Lowered' label in half at y~350pt. When the drawer expands, collapse the hero to a compact row or scroll it fully out of view.
- Big readout 0.53 s vs 'Median per connect 0.65 s' stepper below are adjacent and easy to confuse; label the stepper 'Simulated median (next run)'.
- Histogram has no y-axis or count labels; with n=1 the single bar looks like a full-height result. Add count labels or a minimum n note.
- Good: 2.0 s spec line labelled in danger color with text, 'Phone-measured, simulated' caption present.
- Dark: 'Typical' selected segment darker than track (inverted selection).

## Cross-cutting issues

- **Pinned ControlPad hides content (Control, all connected states).** The pad is pinned above the tab bar but the scroll content behind it has no bottom inset, so the AuthLatencyBadge, ResultBanner (including the guard-reject reason) and the third GuardChip are clipped or invisible. Fix: give the ScrollView `contentInset.bottom = padHeight + 16`, place ResultBanner in a fixed slot directly above the pad (or as an overlay toast), and let the hero shrink first as the spec says.
- **Hero card is oversized.** Every Control hero is ~350pt tall with 100-190pt of empty tint above the arm. Reduce to ~240pt and anchor the illustration to the vertical center; this alone recovers the space needed for chips + banner + latency badge.
- **Disabled control styling.** Disabled LOWER/RAISE use a faded version of their own fill with white (light) or grey (dark) text at ~1.6-2:1, and disabled STOP on link-lost nearly vanishes. Use one neutral disabled style (gray fill, tertiaryLabel text >= 3:1 for the label) and always show the reason caption above the pad (the Unknown screen does this well; Lowered/Raised/Raising do not).
- **Header chip row wraps.** 'Connected - owner' + 'Local only' + 'SIMULATED' does not fit 358pt and wraps SIMULATED to a second row on every connected Control screen. Collapse to one ConnectionPill + a small icon-only local-only chip, and move SIMULATED to a corner badge.
- **Component inconsistency.** LocalOnlyChip (grey on Control vs blue on Health), SimulatedBadge (two sizes/weights), primary button width (content-width on Control empty state vs full-width elsewhere), action buttons on Log (tinted pill vs plain text), presenter chips (label+bold value) vs GuardChips (icon+label). Consolidate each into one component with one style.
- **Dark-mode segmented control selection is inverted.** Selected segment is darker than the track in Settings, Log filter and presenter drawer; iOS dark uses a lighter thumb (#636366 on #2C2C2E-ish). Selection is hard to read.
- **Dark-mode token drift.** Filled primary buttons use a mid blue (~#1A73E8) with white text and filled STOP uses a light-mode red, whereas the token table specifies accent #409CFF / danger #FF6961 with onFill #000 in dark. Either update the table or the components; right now they disagree.
- **Pushed-screen navigation is wrong.** Settings > Barrier and Settings > About render the large title above the back link. Back must sit in the nav bar at the top-left with the large title beneath it.
- **Raw engineering strings in user UI.** 'Done (COMPLETED)', 'ACCEPTED 2 / STOPPED 1', the CamelCase MotionAllowed formula, 'tools/log_parser.py', 'INTERFACES.md'. Keep these in presenter mode/log export; show plain language in Health/Log/About.
- **State contradictions.** Link-lost hero says 'Raising' in motion blue while the banner says the barrier stopped; Safety checks titles a failing row 'Zone clear'; presenter STOPPED sub-label says 'raise or lower' while the zone is blocked; replayed-command shows 'No rejection' next to a rejection. State text must follow the latest reported state, and last-known values must be labelled as such.
- **Onboarding consistency.** Page indicator count differs (5 dots on Bluetooth vs 4 elsewhere); hero anchor jumps between top-aligned and centered layouts; Enroll content is hard-clipped above the dots; Done CTA 'Open the barrier' is ambiguous for a barrier controller.
- **Connect flow states are not visible.** Neither connect screenshot shows scanning progress, per-row phase, the step list, or pairing guidance; 'connect-pairing' is visually identical to the plain list. The connect flow is the most error-prone path and currently has the least feedback.
