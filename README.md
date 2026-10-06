# TIGL QC Platform

Company-owned, self-hosted QC digitalization platform for T&I Projects Private Limited and related issuing entities.

## Current status

This repository is moving from handoff packet to implementation. The original specifications and prototype are preserved in [`TIGL-QC-Dev-Packet/`](TIGL-QC-Dev-Packet/). Phase 0 findings are in [`docs/audit/phase-0-project-audit.md`](docs/audit/phase-0-project-audit.md).

The first pushed implementation slice is `packages/engine`: deterministic parameter evaluation and result aggregation, with AXIS seed contract checks. This is not yet a deployable application. There is no production API, user authentication, inspection UI, signature service, or Odoo adapter in this release.

## Development

Requirements: Node.js 22 or later (up to 24), npm 10 or later.

```sh
npm ci
npm test
npm run typecheck
```

The engine is designed as a pure shared TypeScript package. The browser may use it for immediate feedback; an eventual API must call it again and own the authoritative result. Never accept a client-supplied PASS/FAIL as authoritative.

## Validation semantics

- Decimal measurements accept `.` or `,` as the decimal separator. They reject units and exponent notation.
- Numeric comparisons use decimal integer arithmetic to avoid binary floating point boundary drift.
- Ranges are inclusive.
- Empty mandatory values are incomplete; empty optional values are excluded.
- Required evidence is a separate incomplete condition.
- Summary precedence is critical FAIL, then INCOMPLETE, then non-critical HOLD, then PASS.
- Variant-specific checks outside the selected variant are excluded.

Acceptance criteria and unresolved business decisions remain in the original packet. Engineering and Quality must approve all AXIS TBC specifications before pilot use.

## Source packet

See [`TIGL-QC-Dev-Packet/README.md`](TIGL-QC-Dev-Packet/README.md) for packet contents and its open decisions. The packet is a design baseline, not evidence of production behavior.
