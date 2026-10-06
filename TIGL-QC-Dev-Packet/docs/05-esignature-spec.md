# 05 — E-Signature Specification

## 1. Behaviour (matches prototype)
1. Signature **slots** are configured in Admin → Workflow: `checked` (Inspector, required), `reviewed` (Supervisor, optional), `approved` (Quality Manager, required). Checked-by and Approved-by can't be made optional.
2. Signing happens through workflow actions (*Submit and sign*, *Review and sign*, *Approve and sign*) or the **E-sign** button on the report's empty slot ("Sign here" tab, like Adobe Fill & Sign).
3. **Dialog** (Adobe-style):
   - Tabs: **Type full name** | **Initials**
   - Fields: Full name (prefilled from the user's account, editable), Initials (auto-derived, max 4), **Designation** (prefilled from user profile, editable)
   - **Style picker**: 4 handwriting fonts (Dancing Script, Great Vibes, Caveat, Homemade Apple — all OFL, self-host the font files), live preview on a signature line
   - **Re-authentication**: the signer re-enters **their own account password** (plus TOTP code if they enabled 2FA). Verified server-side (Argon2id), rate-limited, 3 wrong attempts in 10 min locks signing for that user. Works fully offline on the intranet — **no Google, no external e-sign provider**
   - **Intent statement** checkbox: "I, the signer above, intend this electronic signature to mean '<slot label>' for this record and to be the equivalent of my handwritten signature."
   - *Apply signature* disabled until name ≥ 3 chars, initials, designation, re-auth, and intent are all present
4. On apply, the signature block is **appended under the report** in the Signatures section: rendered signature (chosen font), printed name, designation, meaning, IST timestamp, signature ID, signer username, short document hash.
5. **PDF lock:** until every *required* slot is signed:
   - `GET /api/v1/reports/{id}.pdf` → `423 Locked` `{error:"REPORT_LOCKED", missing:["approved"]}`
   - Download button disabled with lock icon ("Sign all required fields to download")
   - On-screen preview watermarked "UNSIGNED DRAFT"; print stylesheet replaces content with a blocking message
   - Odoo attachment (and optional Drive archive) jobs are not enqueued
   - There is **no** unsigned/draft PDF endpoint and no admin override
6. After all required slots: PDF generated server-side (job), sealed (see §4), stored in the local object store with its SHA-256; download via 5-minute signed URL; every download audited.

## 2. Data captured per signature (`signature` table)
`id, company_id, inspection_id, slot_key, meaning, signer_user_id, signer_username, certificate_id, typed_name, initials, designation, mode (type|initials), font, reauth_method (password|password_totp), reauth_at, intent_text, doc_hash_sha256, canonical_version, signed_at (UTC), ip, user_agent, revoked_at, revoked_reason`.

## 3. Document hash
`doc_hash = SHA-256(canonical JSON)` where canonical JSON (RFC 8785 JCS) = `{inspection_id, template_code, template_revision, header, values: [[param_code, value, [evidence_sha256…]] sorted by param_code], concession}`. Evidence files are hashed on upload (`evidence.sha256`). Each signature stores the hash at its moment of signing; the final PDF carries all hashes plus a verification URL `https://qc.tiglobal.com/verify/{signature_id}` (internal) that recomputes and compares.

## 4. PDF output
- Rendered from the same React report component (Gotenberg/Chromium), A4, embedded fonts
- Final page/section: signature blocks + "Signature manifest" table (slot, signer, designation, time IST, signature ID, hash)
- PDF metadata: Title, Subject (`QC report <id>`), Keywords (`hash:<sha256>`), Producer `TIGL Quality`
- **Document seal (v1, built in):** the finished PDF is sealed with a PAdES (CMS detached) signature using the **issuing entity's own certificate** (TIGL or TIPL), so any tampering is visible in Acrobat. Done in-process by the worker (`pdf-lib` for the visual manifest + a MIT-licensed PAdES library such as `@signpdf/signpdf` with `@signpdf/signer-p12`, or `node-forge`; **confirm licences in Sprint 0**). No per-signature or per-seat licence, no cloud call.

## 4a. Built-in signing service (no external dependency)
- **Module `signing`** inside the API/worker. Everything a signature needs lives in our DB and our server: user account + password check, typed signature rendering, hash, certificate, PDF seal, verify page.
- **Certificates:** one active certificate **per issuing entity** (table `signing_certificate`). Two ways to get one: (a) **Generate from the TIGL internal CA** (admin screen, RSA-3072/SHA-256, 2-year validity, auto-expiry warning at 60 days), or (b) **Upload a .p12/.pfx** bought from a public CA (e.g. a Class 3 DSC / document-signing cert) when a customer requires it. Private key stored encrypted (AES-256-GCM) with a master key from a root-only file / env secret on the host; never returned by any API; admin UI shows subject, issuer, validity, fingerprint only.
- **Which cert signs:** the report's issuing entity (`inspection.company_id`), i.e. T&I Global Limited **or** T&I Projects Private Limited. Letterhead, address, certificate and numbering follow the same entity.
- **Rotation:** new cert → old becomes `retired` (still used to *verify* old PDFs). Revoked cert → report shows warning on verify page.
- **Internal CA trust:** publish the TIGL root CA cert on the intranet; install it in company PCs (Adobe Reader then shows the seal as trusted). Until installed, Acrobat shows "validity unknown" but still detects tampering.
- **Verify:** `https://qc.tiglobal.com/verify/{signature_id}` (and QR on the PDF) recomputes the hash, checks seal and certificate status. Works without internet.
- **Offline / DNS independent:** nothing here calls out to the internet (no timestamp authority in v1; server time + audit chain; optional RFC 3161 TSA in phase 2 if a customer demands it).

## 5. Revocation
Returning an inspection to the inspector revokes *all* signatures on it (`revoked_at`, reason) — audit logged; PDF cache deleted. Approved records are never re-opened; corrections go through a new inspection (re-inspection) or a QM "amendment" record (phase 2).

## 6. Legal note (draft — for legal review)
Typed/style signatures with re-authentication, intent and hash-binding are **electronic signatures** suitable as internal approvals and as evidence of authorship. Under the **Information Technology Act, 2000 (s. 3A, Second Schedule)**, statutory presumption of a "reliable electronic signature" applies to notified methods (e.g. Aadhaar eSign, DSC). If customers or contracts require legally presumptive signatures on QC certificates, upload a Class 3 DSC / document-signing certificate (.p12) for that entity (supported in v1, see §4a) or add Aadhaar eSign via an ESP in phase 2. Design follows 21 CFR Part 11-style controls (signature manifestation, signature/record linking, unique user, re-authentication) as good practice — TIGL is not required to be Part 11 compliant.
