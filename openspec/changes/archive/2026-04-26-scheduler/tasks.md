# Tasks: Scheduler (Agendamiento de Turnos)

## Phase 1: Data Layer (Repositories) - TDD
- [x] 1.1 Create `src/repositories/__tests__/DoctorRepository.test.ts` (RED: failing tests for lookup and specialties).
- [x] 1.2 Implement `DoctorRepository.ts` (GREEN: passing tests).
- [x] 1.3 Add `createAppointment` test to `src/repositories/__tests__/AppointmentRepository.test.ts` (RED).
- [x] 1.4 Implement `createAppointment` in `src/repositories/AppointmentRepository.ts` (GREEN).

## Phase 2: Frontend Infrastructure
- [x] 2.1 Create `src/pages/patient/__tests__/PatientDashboard.test.tsx` (RED: integration test for booking flow).
- [x] 2.2 Refactor `PatientDashboard.tsx` to replace `MOCK_DOCTORS` with `doctorRepository` calls.
- [x] 2.3 Implement specialty filter logic in the modal.

## Phase 3: Booking Flow Implementation
- [x] 3.1 Implement doctor selection and availability slot rendering in the modal.
- [x] 3.2 Implement appointment confirmation logic using `appointmentRepository`.
- [x] 3.3 Add loading states and toast notifications for success/error.

## Phase 4: Verification & Polish
- [x] 4.1 Verify all scenarios from `scheduler.spec.md` with integration tests.
- [x] 4.2 Polish UI (Lucide icons, teal/emerald gradients, transitions).
- [x] 4.3 Handle empty states (no doctors found for specialty).

