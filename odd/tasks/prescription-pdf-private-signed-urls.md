# Feature: Make prescription PDFs private with 48h signed URLs

## Objective
`prescriptions_pdfs` is a public Supabase Storage bucket (confirmed via
`select public from storage.buckets` on remote: `true`) with no RLS. Any link
ever generated is permanently, unauthenticated readable. These are medical
prescriptions (diagnosis, medication, patient name). Make the bucket private
and serve every link as a 48h-expiring signed URL instead.

## Decisions (user-confirmed 2026-09-22)
- Every link expires 48h after being minted. No auto-regeneration flow for
  the patient: if a patient needs a prescription after the link died, they
  ask the doctor, who uses the existing "Reenviar" (resend) WhatsApp button.
  So the WhatsApp resend path MUST always work regardless of elapsed time —
  it re-mints a fresh signed URL at send time, never reuses a possibly-dead
  stored one.
- Applies retroactively: flipping the bucket to private breaks ALL
  already-issued public links immediately (patient historial views included).
  Accepted explicitly by the user — no backfill/migration of old links needed,
  no dual-behavior (public bucket kept alive for old rows, private for new).
- Patient-facing historial screens (`MedicalHistory.tsx`, `PatientDashboard.tsx`)
  are NOT changed to re-mint on view — their stored `pdfUrl` will just die
  after 48h, by design (user's explicit choice, see above). Do not add a
  "regenerate on open" flow there.

## Design (assistant, from the code map)
- `supabase/functions/finalize-consultation/index.ts:174-198`: uploads the
  PDF then calls `getPublicUrl` — swap for
  `storage.from('prescriptions_pdfs').createSignedUrl(fileName, 60*60*48)`,
  store the resulting `signedUrl` in `pdf_url` (unchanged column, unchanged
  consumers) AND the raw `fileName` in a NEW `pdf_path` column (needed so the
  resend flow can re-sign later without depending on a possibly-expired URL
  or having to parse it).
- `server/whatsapp.js` `sendPrescriptionViaWhatsApp`: today does
  `fetchFn(prescription.pdf_url)` directly. Change to: read `pdf_path` from
  the `prescriptions` row (select it alongside the existing columns); if
  present, mint a FRESH signed URL via `supabaseAdmin.storage` right before
  fetching bytes (ignore the stored `pdf_url`, which may be stale/expired).
  For legacy rows with `pdf_path IS NULL` (issued before this change): derive
  the storage path by parsing it out of the old `pdf_url`
  (`.../object/public/prescriptions_pdfs/<path>` — everything after that
  fixed prefix is the path) and mint a signed URL from that derived path too
  — the underlying storage object still exists even though the bucket is now
  private, so this keeps "Reenviar" working for prescriptions issued before
  this change without needing a data backfill. If neither `pdf_path` nor a
  parseable `pdf_url` exists, fail the same way `no_pdf` already fails today.
- Migration: `ALTER TABLE prescriptions ADD COLUMN pdf_path TEXT;` +
  `UPDATE storage.buckets SET public = false WHERE id = 'prescriptions_pdfs';`
  (bucket already exists on remote as public with no RLS policies — verified
  via `supabase db query --linked`). Since only server-side code (edge
  function's service role, `server/whatsapp.js`'s `supabaseAdmin`) ever
  touches this bucket, no new storage.objects RLS policy is needed — service
  role bypasses RLS entirely.
- `PostConsultation.tsx` (doctor's immediate post-consultation view: opens
  the PDF, has a `mailto:` with the link) runs right after generation, well
  within the 48h window — no change needed there.
- `PatientDashboard.tsx` / `MedicalHistory.tsx`: NOT changed, per the
  decision above — their links will die after 48h and that is accepted.

## Constraints / risks
- TDD enabled for `server/*` (vitest). The edge function
  (`supabase/functions/finalize-consultation/index.ts`, Deno) has NO existing
  test file/harness in this repo — do not introduce a new Deno test
  framework for this; keep that change small and carefully reviewed by hand
  instead, consistent with how the rest of that file is (untested Deno
  function).
- Migration changes remote bucket visibility — breaking existing public
  links is explicitly accepted, but flag it clearly as a real behavior change
  the moment it's applied to remote (user must explicitly OK the remote
  apply, same as every other migration in this project).
- Do not touch `PatientDashboard.tsx`, `MedicalHistory.tsx`, or
  `PostConsultation.tsx` — out of scope per the decisions above.
- `server/__tests__/whatsapp.test.js` already has a `sendPrescriptionViaWhatsApp`
  describe block — extend it, mirroring its existing supabase-stub style.

## Tasks
- [x] T1 Migration: `pdf_path` column on `prescriptions` + set
      `prescriptions_pdfs` bucket `public = false`. Write only; remote apply
      needs explicit user OK afterward.
- [x] T2 `finalize-consultation/index.ts`: `createSignedUrl` (48h) instead of
      `getPublicUrl`, store both `pdf_url` (signed) and `pdf_path` (raw path).
- [x] T3 `server/whatsapp.js`: `sendPrescriptionViaWhatsApp` re-mints a fresh
      signed URL from `pdf_path` (or a legacy-parsed path) at send time
      instead of trusting the stored `pdf_url`; tests for: fresh row (has
      pdf_path), legacy row (no pdf_path, has parseable pdf_url), row with
      neither (existing `no_pdf` failure path unchanged).

## Progress / evidence

- **T1**: `supabase/migrations/20260922010000_prescriptions_pdfs_private.sql`
  written (`ADD COLUMN IF NOT EXISTS pdf_path TEXT` + bucket `public = false`,
  with a comment explaining the retroactive-breakage decision). Local Docker
  Supabase was NOT reachable in this environment (`supabase status` failed:
  `dockerDesktopLinuxEngine` pipe not found — Docker Desktop not running), so
  it could not be verified against a local stack. Reviewed the SQL by hand
  instead: both statements mirror the exact syntax the task doc specified and
  match this project's existing migration style (see
  `20260921010000_email_in_use.sql`). Needs local verification once Docker is
  available, and explicit user OK before any remote apply — NOT applied to
  remote or local.
- **T2**: `supabase/functions/finalize-consultation/index.ts` — replaced the
  `getPublicUrl` call with `createSignedUrl(fileName, 60 * 60 * 48)`; the
  `signError` case throws into the same existing `catch (storageErr)` /
  mocked-URL fallback block as `uploadError` (no new error-handling pattern).
  Added `let pdfPath: string | null = null` alongside the existing `pdfUrl`
  declaration, set from `fileName` on success and reset to `null` on the
  storage-fallback path, and added `pdf_path: pdfPath` next to the existing
  `pdf_url: pdfUrl` in the `prescriptions` insert. No Deno test harness
  exists/added, per constraint — reviewed by hand.
- **T3**: `server/whatsapp.js` — `sendPrescriptionViaWhatsApp` now selects
  `pdf_path` alongside the existing columns, resolves a `storagePath` from
  `pdf_path` or (legacy) `extractStoragePathFromPublicUrl(pdf_url, 'prescriptions_pdfs')`
  (new small pure exported helper, mirroring `normalizeArgentinePhone`'s
  style), returns the existing `no_pdf` 422 when neither resolves, and mints
  a fresh `createSignedUrl` (48h) right before `fetchFn`, reusing the
  existing `pdf_unavailable` 502 path for both a signing error and a fetch
  failure.
  - `server/__tests__/whatsapp.test.js`: extended the `sendPrescriptionViaWhatsApp`
    stub with `storage.from().createSignedUrl` (default: succeeds), updated
    `PRESCRIPTION` fixture to also carry `pdf_path`; added tests for the
    fresh-row path (asserts `createSignedUrl` called with `pdf_path`, fetch
    uses the fresh signed URL, not the stale stored `pdf_url`), the legacy
    row (no `pdf_path`, parseable old public `pdf_url`), the "neither"
    422 `no_pdf` case, and `createSignedUrl` itself failing -> 502
    `pdf_unavailable`. Added a new `extractStoragePathFromPublicUrl` describe
    block (well-formed URL, non-matching prefix, null/undefined input).
  - TDD evidence: RED — ran `npx vitest run server/__tests__/whatsapp.test.js`
    before implementing T3 (fixture/stub already updated, code not yet
    changed): 7 failed / 38 passed (45 total). GREEN — after implementing
    T3: 51 passed (45 pre-existing/adjusted + 6 new), 0 failed.
  - Full suite: `npx vitest run` → 688 passed, 7 failed across 4 files
    (VideoRoom, DashboardRepository, crypto, MedicalHistory) — same
    pre-existing unrelated failures noted in the task constraints, untouched.

## Next step
Feature complete pending: (1) user explicit OK + local Docker verification
before applying T1's migration anywhere, (2) orchestrator commit of this
work unit.
