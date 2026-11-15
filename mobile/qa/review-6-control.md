# Review 6: Control screens

Scope: 9 Control screenshots x 2 schemes = 18 rows (only 9 control-* names exist in qa/out; the brief said 10).
Scale 1-5. Columns: hierarchy, hig, tokens, state, errors, a11y, polish.

| screen | scheme | hier | hig | tok | state | err | a11y | polish |
|---|---|---|---|---|---|---|---|---|
| control-disconnected | light | 4 | 4 | 5 | 5 | 4 | 4 | 4 |
| control-lowered | light | 4 | 4 | 5 | 5 | 5 | 4 | 4 |
| control-raising | light | 5 | 5 | 5 | 5 | 5 | 4 | 4 |
| control-raised | light | 4 | 4 | 5 | 5 | 5 | 4 | 4 |
| control-stopped | light | 5 | 4 | 5 | 5 | 5 | 4 | 4 |
| control-guard-reject | light | 4 | 4 | 4 | 4 | 5 | 4 | 4 |
| control-fault | light | 4 | 4 | 5 | 5 | 5 | 4 | 4 |
| control-unknown | light | 4 | 4 | 4 | 5 | 5 | 4 | 4 |
| control-link-lost | light | 5 | 4 | 5 | 4 | 5 | 4 | 4 |
| control-disconnected | dark | 4 | 4 | 5 | 5 | 4 | 4 | 4 |
| control-lowered | dark | 4 | 4 | 5 | 5 | 5 | 4 | 4 |
| control-raising | dark | 5 | 5 | 5 | 5 | 5 | 4 | 4 |
| control-raised | dark | 4 | 4 | 5 | 5 | 5 | 4 | 4 |
| control-stopped | dark | 5 | 4 | 5 | 5 | 5 | 4 | 4 |
| control-guard-reject | dark | 4 | 4 | 4 | 4 | 5 | 4 | 4 |
| control-fault | dark | 4 | 4 | 5 | 5 | 5 | 4 | 4 |
| control-unknown | dark | 4 | 4 | 4 | 5 | 5 | 4 | 4 |
| control-link-lost | dark | 5 | 4 | 5 | 4 | 5 | 4 | 4 |

Min per criterion: hierarchy 4, hig 4, tokens 4, state 4, errors 4, a11y 4, polish 4

All 18 rows score >= 4 on every criterion. No fix list is required (no score < 4).

## Optional polish (score-4 nits, highest value first)

1. Guard reject: mute or amend the hero sub-label ('You can drive in') while an obstruction banner is shown; add a 24 px gap between banner and pad; drop the light-mode banner shadow.
2. Fault: say the fault once in the hero and give detail only in the card; make the card title semibold and the body secondaryLabel so the red title leads.
3. Link lost: add age of the last status ('Not live - 12 s ago') so 'Last known: Raising' is not read as live motion.
4. Reserve the pad helper line height in every state (Stopped currently shifts the divider).
5. Unknown: put the '?' glyph inline with the label; add the missing period to 'Lower first to confirm position'.
6. Close the dead band between chips and pad on idle states (move chips down, or let the hero grow).
7. Add an inline state glyph next to Lowered / Raised / Stopped labels per DESIGN.md 4.1.
8. Disconnected: lower the CTA toward the thumb zone; consider a one-line hint for first-time enrollment.
