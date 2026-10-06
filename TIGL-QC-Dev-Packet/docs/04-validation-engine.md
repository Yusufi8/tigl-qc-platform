# 04 — Validation Engine (deterministic, authoritative)

Lives in `packages/engine` (pure TypeScript, no I/O). Imported by web (live feedback) and API (authoritative). **No AI, no manual override, no admin setting can change a result.** Only a new template revision (approved by QM) changes acceptance criteria — and only for new inspections.

## Parameter evaluation `evalParam(p, entry) → status`
`entry = {v, ev[] }`. Statuses: `pass | fail | missing | invalid | evidence | recorded | na`.

| Step | Rule |
|---|---|
| 1 | `v` empty → `missing` if `p.mandatory` else `na` (excluded from counts) |
| 2 | `qty`: `Number(v) === p.expected` → pass else fail |
| 3 | `range`: parse decimal (accept `,` as decimal separator; reject units in string → `invalid`). `p.min ≤ n ≤ p.max` inclusive → pass else fail. Store `n` as `numeric(12,4)`; never compare floats from strings in DB |
| 4 | `exact`: case-insensitive, trimmed string equality (numbers compared numerically when both parse) |
| 5 | `yes_no`: `v === p.expected` |
| 6 | `pass_fail`: `v === "Pass"` |
| 7 | `select`: `v ∈ p.accept` (options not in accept list = fail, e.g. a non-approved motor make) |
| 8 | `text`: `recorded` (no acceptance; e.g. serial numbers) |
| 9 | If `p.evidence` and no evidence file: return `fail` if step result was fail, else `evidence` (blocks completion) |

## Inspection summary `summarize(revision, values)`
Counts `total, done, pass, fail, critFail, missing, evidence` overall and per stage. Result precedence:
```
FAIL        if any critical parameter = fail            (known failure beats incompleteness)
INCOMPLETE  else if any missing / invalid / evidence
HOLD        else if any non-critical parameter = fail   (needs QM concession)
PASS        otherwise
```

## Workflow guards (server)
| Transition | Guard |
|---|---|
| submit | result ≠ INCOMPLETE; signer = assigned inspector; FAIL ⇒ status `rejected` + NCR |
| review | status = submitted; role supervisor/qm; signer not already on record |
| approve | status = reviewed; result ∈ {PASS, HOLD}; HOLD ⇒ concession ≥ 10 chars; role qm |
| value write | status = draft and no signatures; role has `insp.execute`; user is inspector or supervisor |

## Test vectors (minimum — add one per bug forever)
| # | Param | Input | Expected |
|---|---|---|---|
| 1 | range 0–0.05 mm | `0.05` | pass (inclusive) |
| 2 | range 0–0.05 | `0.0501` | fail |
| 3 | range 0–0.05 | `0,03` | pass |
| 4 | range 0–0.05 | `0.03mm` | invalid |
| 5 | range −0.20–0.20 | `-0.2` | pass |
| 6 | range 89.5–90.5 deg | `90.6` | fail |
| 7 | qty 4 | `4` / `3` | pass / fail |
| 8 | exact "15:1" | ` 15:1 ` | pass |
| 9 | exact 1440 | `1440.0` | pass |
| 10 | select accept [IE2, IE3] | `IE1` | fail |
| 11 | yes_no expected Yes | `No` | fail |
| 12 | pass_fail + evidence, no file | `Pass` | evidence |
| 13 | pass_fail + evidence, no file | `Fail` | fail |
| 14 | text mandatory | `""` | missing |
| 15 | optional qty | `""` | na |
| 16 | summary: 1 critical fail + 5 missing | — | FAIL |
| 17 | summary: 1 non-critical fail + 1 missing | — | INCOMPLETE |
| 18 | summary: 1 non-critical fail | — | HOLD |
| 19 | summary: all pass/recorded | — | PASS |

CI gate: 100% branch coverage on `packages/engine`; property-based tests (fast-check) for range boundaries.

## AI boundary
AI may (phase 3) draft a narrative summary from verified data. It never writes `inspection_value`, never computes `result`, never fills missing measurements. Narrative is labelled "AI-drafted, reviewed by <signer>".

## Future param type (phase 8, dryer FAT)
`series`: list of readings (e.g. outlet temperature every 15 min during trial run). Each reading evaluated as `range`; param fails if any reading fails; INCOMPLETE until the configured reading count is reached. Add test vectors before enabling.

## Effective checklist (variants and order-specific checks)
Engine input is `effective(inspection) = template_revision.params.filter(p => !p.applies_to?.length || p.applies_to.includes(inspection.variant)) ++ inspection.extra_params`. Everything else (types, precedence, INCOMPLETE/HOLD/FAIL/PASS) is unchanged.
Add test vectors: (V1) param applies only to *Automatic*, inspection variant *Manual* → param ignored in totals and result; (V2) same param, variant *Automatic*, value missing → INCOMPLETE; (V3) extra param critical out of range → FAIL; (V4) extra param added after any signature → rejected `RECORD_SIGNED`; (V5) changing variant after values recorded is blocked once any value exists (or requires inspector confirmation and re-evaluates; choose one in Sprint 2 — recommended: block).
