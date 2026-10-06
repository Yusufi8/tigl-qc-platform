# 11 — Source Data Notes (`Axis_Final.xls` → `seed/axis_templates.json`)

The paper checklist was digitised faithfully. Where the sheet was ambiguous, a **documented interpretation** was used and the parameter flagged `tbc: true` (shown as "Spec TBC" in the app). **Engineering must confirm every item below** before AXIS goes live; confirmation = publish a new template revision.

## Sheet map
| Sheet | Content | Digitised as |
|---|---|---|
| Sheet1 | AXIS MM main checklist (components, assembly, alignment) | Stages COMP, ASSY, ALGN — template AXIS-MM |
| Sheet6 | Twin Milling Head variant (LM block 8, 2 sync motors, 4 spindle bearings, 2nd gearbox + motor) | Template AXIS-TMH (188 params) |
| Sheet2 | Electrical testing (14 items) | Stage ELEC |
| Sheet3 | Tools list + kit | Stage TOOLS |
| Sheet4 | 27 tolerances | Stage TOL (codes TOL-001..) |
| Sheet5 | Assembly checks | Stage ASSY / FIN |

## Flagged specs (TBC)
| Param | Source said | Modelled as | Question for Engineering |
|---|---|---|---|
| ALGN-005 Three roller supports — tail end | No tolerance given for tail end | 0 – 0.05 mm (same as head end) | Correct limit? |
| TOL-018 Worm wheel / worm shaft centre distance | Range text ambiguous | 101.50 – 101.85 mm | Confirm nominal and band |
| TOL-023 Synchronous motor winding resistance | "195 ohms", no tolerance | 185 – 205 Ω (±5 %) | Confirm tolerance and test temperature |

## Interpretations (not TBC, but review)
- "80 % of total amps" → modelled as **% of rated current ≤ 80** (inspector enters %).
- "0.050m" in several rows → treated as typo for **0.050 mm**.
- "90° ± 0.5" → range 89.5 – 90.5°.
- Head stock holes "± 0.20" → modelled as **deviation range −0.20 … +0.20 mm** (enter deviation, not absolute).
- Tolerance sheet numbering has gaps/duplicates in the source; stable app codes (TOL-001…) are sequential and do not reuse sheet row numbers. Mapping table can be generated from `build_seed.py` if needed.
- Free-text "OK" columns converted to typed checks (pass_fail / yes_no / qty) so the engine can decide.
- Critical flags: assigned to geometric tolerances, spindle/bearing, and electrical safety items. **QM to review critical list** — critical fail = FAIL + NCR, non-critical fail = HOLD.

## For new product families
Use the same approach: Engineering supplies the controlled checklist (xls/paper) → IT digitises via template import → Engineering reviews draft in app → QM publishes. Never invent tolerances in software.
