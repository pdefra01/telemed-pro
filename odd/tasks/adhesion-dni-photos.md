# Feature: Titular DNI photos (front and back) in the adhesion form
Branch `feat/adhesion-dni-photos` (PR #63). Delivery: single PR. Runners: `npx vitest run`, `supabase test db` (pgTAP).
Deploy order: migration `20261018000000_adhesion_dni_photos.sql` first, then the app (server + front).

## Specs

- **S1** — L1 verbatim: "necesito poder subir foto dni ambas caras del titular en la afiliación". The public adhesion form lets the titular upload a photo of the DNI front and back.
- **S2** — Both photos are mandatory (user choice 2026-10-18: "Obligatorias"). Step 1 does not advance without both: toast `Cargá las fotos del DNI del titular (frente y dorso).` Only JPG, PNG or WEBP are accepted at selection: `Seleccioná una imagen JPG, PNG o WEBP del DNI`.
- **S3** — Photos are identity documents: a private bucket `adhesion-documents`. Anonymous users can never read, list, overwrite or delete them, and cannot write to the bucket directly.
- **S4** — Admins see both photos in the "Revisar Solicitud de Adhesión" modal, through signed URLs that expire after 10 minutes.
- **S5** — The mandatory rule also holds outside the UI: a public (anon/authenticated) insert into `adhesion_requests` without both photos, already uploaded under the row's own folder, is rejected. Updates (approve/reject) on older rows without photos keep working; server-side roles are not constrained.
- **S6** — Follow-ups requested 2026-10-18 ("Pendientes del PR"): uploads are rate-limited, orphan photos (no row) are cleaned up, `submitApplication` requires the photos in its signature.
- **S7** — Follow-ups requested 2026-10-18 (reply "Si" to the review advisories): no anon-callable RPC can probe which objects exist; the orphan sweep is not blocked by unexpected root entries or a failing folder.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1–S5 | inline | done | `c45ac1d` |
| T2 | S3, S5, S6 | inline | done | `1bbb9f1` |
| T3 | S7 | inline | done | `8162681`, `4c4dcaa` |

Route evidence: every task stayed inline (no Writer trigger: one dependent sequence of changes, no parallel units). Verification trigger fired (Risk item 2) → independent verifier after T1, native RDD review per commit.

## Log

- **L1** (2026-10-18, user): "necesito poder subir foto dni ambas caras del titular en la afiliación"
- **L2** (2026-10-18, user): photos mandatory ("Obligatorias (Recommended)").
- **L3** — T1 design: compress client-side (`src/utils/compressImage.ts`, ≤1600px JPEG 0.85, falls back to the original); upload before the row insert under `<id>/(front|back).<ext>`; no NOT NULL/CHECK on the columns because a NOT VALID check would still block admin UPDATEs on old rows, so a BEFORE INSERT trigger enforces S5 instead.
- **L4** — Independent verifier (T1): no blockers. Supabase Storage docs: INSERT-only policy suffices for `upsert:false`. Advisories fixed in T1: DB trigger (S5), explicit `accept` types so iOS hands over JPEG, preview URL revocation. pgTAP showed `INSERT ... RETURNING` as anon fails without SELECT; checked `supabase/storage` source (`uploader.ts` `authorizeUpload` → `pg.ts` `createObject`): the upload probe is a plain INSERT without RETURNING and the real write runs as superuser.
- **L5** — `storage.protect_delete()` blocks direct SQL DELETE on `storage.objects` for every role; the "no delete" guarantee is asserted on `pg_policies` instead. pgTAP fixtures inserting `adhesion_requests` as anon need unique DNI and phone (`uq_adhesion_pending_*`) and now photo paths plus existing objects.
- **L6** — RDD T1 (`review-709c9bbf63328173`, risk + reliability): approved, acknowledged. Advisories → S6.
- **L7** (2026-10-18, user): "Pendientes del PR".
- **L8** — T2 design: rate limiting is impossible while the browser writes straight to Storage, so `POST /api/adhesion/dni-upload-urls` (10 per 15 min per IP, `server/rateLimits.js`) reserves the adhesion id and returns one-time signed upload URLs; the anon INSERT policy is dropped. Trigger also checks both objects exist. Hourly `cleanupOrphanDniPhotos` (24 h minimum age) in `server.js`; paginates by kept folders so removals don't skip pages.
- **L9** — T2 evidence: vitest 1015 passed (5 failures pre-existing on `master`: `VideoRoom`, `DashboardRepository`, `crypto`); pgTAP 408/408; local end-to-end against real Storage: direct anon upload refused, signed upload ok, token reuse refused, PDF refused, anon download refused, anon row insert ok, admin signed URL 200, cleanup removes a real orphan and keeps linked/young folders.
- **L10** — RDD T2 (`review-4faec9d19e80f293`, risk + resilience + reliability): approved, acknowledged. Advisories → S7; accepted as-is: editing the unmerged migration in place (never deployed), retries consume rate-limit quota.
- **L11** (2026-10-18, user): "Si" (apply the two advisories).
- **L12** — T3 design: trigger is SECURITY DEFINER and reads the submitter from `current_setting('role')` (PostgREST's SET ROLE; unchanged by a definer function, unlike `current_user`), so the `adhesion_dni_photo_count` helper is gone. Sweep considers only `<uuid>/` folders of plain files and logs and skips a failing folder.
- **L13** — T3 evidence: vitest server + repository 491 passed; pgTAP 410/410 (anon inserts without photos still rejected → role detection inside the definer works). RDD T3 (`8162681` vs `1bbb9f1`, risk + resilience): approved, acknowledged; advisory fixed in `4c4dcaa` (`drop function if exists` for the old helper). `4c4dcaa` assessed `under_budget`, pending in the slice; not run through pgTAP (Docker down; idempotent one-liner).
- **L14** — Process gap, recorded honestly: RED was not observed before implementation for T1 (tests written after the code); the feature document was created after T3, not before T2 when the task grew.
- **L15** — `4c4dcaa` verified: pgTAP 410/410 after `db reset`; re-applying the migration on a DB that had the old helper drops it (1 → 0) and the migration is idempotent.
- **Next:** merge PR #63 (user decision), deploy migration then app, smoke-test one real signup with photos.
