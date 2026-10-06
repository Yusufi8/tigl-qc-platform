# 10 — Open Decisions (resolve before / during Sprint 0)

## Decided (01 Oct 2026, Director of IT)
| Topic | Decision |
|---|---|
| Issuing entity | **Per customer**: T&I Global Limited or T&I Projects Private Limited (Odoo SO company overrides). Letterhead, certificate and numbering follow it |
| E-signature | **Built into the platform**, no Google / third-party signing dependency (licensing). Per-entity sealing certificate |
| Machines | Always extensible: new machine templates, variants, and order-specific checks (doc 02 §9) |
| Hosting / DNS | TIGL hosts locally; internal DNS under our control; no cloud, no vendor ticket |
| Sign-in | Username + password issued by IT together with the role. No LDAP, no Google |

## Still open
| # | Decision | Options | Recommendation | Owner | Needed by |
|---|---|---|---|---|---|
| D1 | Odoo version + edition | 16 / 17 / 18; Community vs Enterprise | Confirm actual prod instance; this platform stays QC system of record, Odoo `quality` app unused | Director of IT | Sprint 0 |
| D2 | Odoo API protocol | JSON-RPC / XML-RPC / JSON-2 (19+) | JSON-RPC on ≤18 / JSON-2 on 19+; adapter supports both | Dev lead | Sprint 5 |
| D3 | Remote access | LAN only vs company VPN for outstation staff/customer sites | VPN (WireGuard); no public exposure | Director of IT | Sprint 0 |
| D4 | TLS certificate | Internal CA vs Let's Encrypt DNS-01 | Internal CA (also signs entity seal certs); install root on PCs | Director of IT | Sprint 0 |
| D5 | Server sizing and backup target | VM vs bare metal; second host/NAS | Per `infra/deployment-onprem.md`; confirm hardware | Director of IT | Sprint 0 |
| D6 | Entity-specific numbering | One series vs `QC-TIGL-…` / `QC-TIPL-…` | Separate series per entity | QM + Finance | Sprint 4 |
| D7 | Signing DSC | Internal CA seal only vs customer-required Class 3 DSC for some entities | Start with internal CA; buy DSC `.p12` only if a customer/export doc requires it (upload supported) | Management + Legal | Before first export report |
| D8 | Signature slots | Checked (req) / Reviewed (opt) / Approved (req) | As prototype; configurable per family (FAT/SAT may add customer witness) | QM | Sprint 4 |
| D9 | Brand | Prototype `#1F5C44` + IBM Plex Sans | Confirm against logo/brand kit; Admin can change | Marketing | Sprint 1 |
| D10 | Spec TBC items | 3 AXIS params (doc 11) + variant mapping of ELEC-016/023/025 (demo only) | Engineering confirms before AXIS go-live | Engineering + QM | Sprint 6 |
| D11 | Dryer family rollout order | `seed/product-families.json` | Highest-volume first; Engineering supplies checklist per family | Engineering + QM | Phase 8 |
| D12 | Site commissioning (SAT) | Online vs offline capture | Offline PWA for SAT | QM + Projects | Phase 8 |
| D13 | Odoo delivery block | Block delivery until QC PASS? | Notify-only for 1 month, then enable | Production + QM | Post pilot |
| D14 | Customer access to reports | Email PDF vs portal | Email sealed PDF; portal later | Sales + QM | Phase 2 |
| D15 | Who may add order-specific checks | QM + Engineering (as built) vs add Supervisor | Keep QM + Engineering | QM | Sprint 3 |
| D16 | Team / estimation | In-house vs vendor | Estimate from `backlog/jira-import.csv` | Director of IT | Before Sprint 1 |
