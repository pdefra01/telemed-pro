# Feature: Booking uses the local calendar day, not the UTC day

## Objective
The patient booking modal ("Agendar Turno") and appointment lists must use the
patient's local calendar day. Today, from 21:00 local time in Argentina
(UTC-3), the modal shows tomorrow's slots, "Atención inmediata" disappears, and
appointment cards show the wrong date.

## Problem (explorer map, 2026-10-06)
Local calendar days are stored as `YYYY-MM-DD` strings but produced with
`new Date().toISOString().split('T')[0]`, which is the UTC day.
- `src/pages/patient/PatientDashboard.tsx`: initial/reset `selectedDate`
  (225, 233), date input `min` (997), "Cerrar" reset (1030), `isToday` for
  Atención inmediata (1095), "Agendar para Mañana" (1153-1155).
- Display mappers mix the UTC date with local time:
  `src/repositories/AppointmentRepository.ts:50,95,345`,
  `src/pages/doctor/DoctorDashboard.tsx:216` (a 21:00 local booking for 07/10
  shows as 2026-10-08 21:00).
- The saved `scheduled_at` (timestamptz) is a correct instant built from the
  wrong day; the insert needs no change once `selectedDate` is local.
- Server side (expiration, overlap checks) compares instants: unaffected.

## Scope
- New `src/utils/localDate.ts` (`toLocalDateStr`, `parseLocalDate`,
  `addDaysLocal`) and use it in the places above.
- "Today" computed when the modal opens, not only at mount.
- Pin `TZ=America/Argentina/Buenos_Aires` for vitest.
- Out of scope (separate): one-day-early date-only rendering in
  `MedicalHistory.tsx`, `VideoRoom.tsx`, `Profile.tsx`; month-bound `Z`
  billing at `AppointmentRepository.ts:113-114`; deduplicating the three slot
  helpers.

## Tasks
- [ ] T1 Local-date helper with tests; booking modal and appointment mappers
  use it; booking test at 21:30 local proves header date, Atención inmediata
  and `scheduled_at`.
  Route: delegated direct (writer trigger: 4+ non-trivial files).

## Acceptance criteria
- At 21:30 local (00:30Z next day) the modal shows today's local date and its
  slots; tapping a slot that already started offers "Atención inmediata"; the
  insert sends the correct instant.
- A booking at 21:00 local on 07/10 renders as 2026-10-07 21:00 in patient and
  doctor lists.
- Existing tests pass; `npm run lint`/typecheck per repo scripts pass.

## Checks
- RED then GREEN for the helper and the 21:30 booking test; full `npm test`;
  typecheck/lint.

## Progress
- Branch `fix/booking-local-date` from master (b21f23d).

## Next step
- T1 via writer.
