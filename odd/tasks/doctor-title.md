# Feature: Professional title (Dr. / Dra.)

## Objective
Every place that shows a doctor's name uses the professional's own title
("Dr." or "Dra.") instead of a hardcoded "Dr.".

## Problem
- "Dr." is hardcoded in 16 spots across 9 files: `server/whatsapp.js` (3),
  `supabase/functions/finalize-consultation/index.ts` (3), `src/pages/VideoRoom.tsx` (2),
  `src/pages/admin/Doctors.tsx` (2), `src/pages/patient/PatientDashboard.tsx` (2),
  `src/pages/admin/AdminDashboard.tsx`, `src/pages/patient/PharmacyCatalog.tsx`,
  `src/pages/doctor/PostConsultation.tsx`, `src/pages/doctor/DoctorDashboard.tsx`
  (1 each). The receta PDF prints "Dr/a:".
- `profiles` has no gender or title column. All specialties are medical.

## Decisions (user-confirmed 2026-10-08)
- Store an explicit title field, not gender: `professional_title` on
  `profiles`, values `Dr.` / `Dra.`.
- Existing professionals default to `Dr.`; the admin corrects them from the
  doctors panel.

## Scope
- T1 Data + admin: migration (column, default `Dr.`, check constraint, exposed
  wherever doctor profiles are read — views/RPCs that select doctor fields),
  types/repositories, admin create/edit form field, demo seed sets "Dra." for
  Lucía Fernández.
- T2 Display: shared `formatDoctorName(title, fullName)` (also tolerates names
  that already start with a title, avoiding "Dr. Dra."), replacing every
  hardcoded spot listed above, including WhatsApp, the finalize edge function
  message and the receta PDF.
- Out of scope: doctor self-editing the title; other wording ("el médico").
- Deployment note: the migration must be applied to production separately
  (user decision); the app must tolerate a missing value by falling back to
  "Dr.".

## Tasks
- [ ] T1 Data model + admin field + seed.
- [ ] T2 Display helper + replace all hardcoded spots.
  Route: delegated direct (writer trigger: 10+ non-trivial files, migration).

## Acceptance criteria
- A doctor with `Dra.` shows "Dra. <name>" in every listed spot; `Dr.` and a
  missing value show "Dr. <name>".
- Admin can set the title when creating and editing a doctor.
- Migration applies cleanly on a local reset; existing rows get `Dr.`.
- `npm test` no new failures vs master (5 known); `npx tsc --noEmit` clean.

## Checks
- RED then GREEN for the helper, the admin form, and at least one display spot.
- Local `supabase db reset` (or migration up) to prove the migration; then
  tear everything down (RAM rule).

## Progress
- Branch `feat/doctor-title` from master (87bf279).

- 2026-10-08: writer stopped mid-task at the user's request (user had to
  leave), right as it moved to the admin form. Uncommitted work left on the
  branch (25 paths): migration `20261008000000_profiles_professional_title.sql`,
  `src/utils/doctorName.ts` + tests, `Doctors.test.tsx`, edits in the display
  spots, `server/whatsapp.js` (+ test), seed. Nothing checked or committed.
  Parent stopped Supabase, Docker Desktop and WSL.

- Resumed the same writer; it had in fact finished before the stop.
  - T1 commit `96c6b8b` feat(doctors): migration (`text not null default
    'Dr.'`, check Dr./Dra.; no grants/views needed), DoctorRepository
    read/save, admin "Título" select, `formatDoctorName`, seed Dra.
  - T2 commit (below): all 16 spots + PDF line ("Nombre: Dra. X"); article
    agreement in Spanish messages ("la Dra." / "el Dr."); appointment, record
    and prescription queries fetch the doctor's title; server WhatsApp and the
    edge function read the title tolerantly (fallback "Dr.").
  - Evidence (2026-10-08): RED → GREEN for admin form/DoctorRepository (6
    failing), helper/PatientDashboard (10), server WhatsApp (10); record and
    prescription title tests written after code (no RED). `npm test` 985 pass,
    5 fail (same as master). `tsc` clean (parent re-ran; parent re-ran helper,
    Doctors and whatsapp tests: 104/104). Local `migration up` + `db reset`
    clean; existing rows `Dr.`; `'Lic.'` rejected; demo patient can read the
    doctor's title under RLS.
  - Behavior changes to note: dashboards now show the full doctor name instead
    of one word; names stored with a "Dr."/"Dra." prefix are normalized.
  - DEPLOY ORDER: apply the migration to production BEFORE deploying the
    frontend — client queries select `professional_title` by name and fail
    without the column.

## Next step
- Review, push/PR (user decision); production migration before frontend.
