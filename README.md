# TIGL QC Platform

Company-owned, self-hosted QC digitalization platform for T&I Projects Private Limited and related issuing entities.

## Current status

This repository is moving from handoff packet to implementation. The original specifications and prototype are preserved in [`TIGL-QC-Dev-Packet/`](TIGL-QC-Dev-Packet/). Phase 0 findings are in [`docs/audit/phase-0-project-audit.md`](docs/audit/phase-0-project-audit.md).

The repository contains `packages/engine`, a deterministic parameter evaluator, and a clickable browser prototype based on the handoff packet. The prototype is useful for reviewing workflows and UX; it stores demo data in browser local storage and is not a production application. There is no production API, authentication service, signature service, or Odoo adapter yet.

## Development

Requirements: Node.js 22 or later (up to 24), npm 10 or later.

```sh
npm ci
npm run preview
npm test
npm run typecheck
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173) for the local preview. Demo user switching is available in the header. Use “Reset demo data” in the sidebar to restore the sample dataset.

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
