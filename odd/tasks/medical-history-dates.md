# Feature: Historia clínica shows correct, readable dates and Spanish types

## Objective
Clinical history views show each date on the right day, formatted for
Argentina (e.g., "26/08/2026"), and visit types in Spanish.

## Problem (found while recording demos, 2026-10-06/08)
- Doctor's "Expediente" → Historia clínica modal (`src/pages/doctor/DoctorDashboard.tsx`
  ~781-830) prints raw timestamps (`2026-08-26T19:30:00+00:00`) and English
  visit types ("CHECKUP").
- Date-only `DATE` columns parsed as UTC (`new Date('YYYY-MM-DD')`) render one
  day early in UTC-3: `src/pages/patient/MedicalHistory.tsx:235,330,433`,
  `src/pages/VideoRoom.tsx:802`. `src/pages/patient/Profile.tsx:407,518` use the
  UTC day as a date input max.
- `src/utils/localDate.ts` (from PR #54) already has `parseLocalDate` /
  `toLocalDateStr`.

## Scope
- Shared formatting for history dates (date-only and timestamps) using local
  time, and a Spanish label map for visit types, applied to the spots above.
- Out of scope: "Dra." title, billing month bounds, other screens.

## Tasks
- [x] T1 Date/type formatting helpers with tests; apply to the doctor's
  Historia clínica modal, MedicalHistory, VideoRoom history panel and Profile
  date max.
  Route: delegated direct (writer + preparation trigger: 4 files, reading to
  prepare the write).

## Acceptance criteria
- `2026-08-26T19:30:00+00:00` renders as 26/08/2026 (with time where the UI
  shows time); a `DATE` value `2026-08-26` renders 26/08/2026, not 25/08.
- Known visit types render in Spanish; unknown values fall back readably.
- Tests pin TZ (already in vite.config.ts); `npx tsc --noEmit` clean; touched
  test files no worse than master.

## Checks
- RED then GREEN for helpers and at least one component render test.

## Progress
- Branch `fix/medical-history-dates` from master (cc21799).

- T1 done (delegated direct). New `src/utils/clinicalHistoryFormat.ts`
  (`formatHistoryDate`, `formatHistoryDateTime`, `visitTypeLabel`) + 12
  tests; applied in DoctorDashboard Historia clínica modal and Estudios tab,
  MedicalHistory (235, 330, 433, plus detail modal 501 and text downloads 339,
  532), VideoRoom Bóveda Médica (802), Profile date max (407, 518).
  - Visit types (DB check constraint): consultation → "Consulta Médica",
    checkup → "Chequeo General", emergency → "Atención Urgente" (labels reused
    from the existing patient page).
  - Finding: `MedicalRecord.date` comes from `created_at` (timestamp), so
    record dates were the right day but unformatted; only DATE values
    (prescriptions, documents, Profile max) were one day early.
  - Evidence (2026-10-08): RED (missing module; render test could not find
    "26/08/2026 16:30") → GREEN. Parent re-ran helper + DoctorDashboard tests:
    17/17. `npm test`: 950 pass, 5 fail (same 5 as master). `tsc` clean.
    No services started.
  - Follow-ups: PostConsultation.tsx Bóveda Médica may show raw dates;
    DoctorDashboard appointment dates (741, 892) still YYYY-MM-DD.

## Next step
- Review, push/PR/merge (user decision).
