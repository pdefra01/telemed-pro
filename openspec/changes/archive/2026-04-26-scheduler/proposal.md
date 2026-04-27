# Proposal: Scheduler (Agendamiento de Turnos)

## Intent
Implement a real scheduler for patients to book appointments with doctors, replacing the current mock-based system. **Note: The platform must support simultaneous attention for many patients with different doctors and must be robust for high-concurrency environments.**

## Scope
- New `DoctorRepository` to fetch real data from Supabase `profiles`.
- Updated `AppointmentRepository` to create real appointments.
- Refactored `PatientDashboard` modal to handle the booking flow.

## New Capabilities
- **Professional Lookup**: Patients can browse doctors by specialty.
- **Availability Booking**: Patients can select from a doctor's real time slots.
- **Real Appointment Persistence**: Appointments are saved to the Supabase `appointments` table.

## Affected Areas
- `src/repositories/DoctorRepository.ts` [NEW]
- `src/repositories/AppointmentRepository.ts` [MODIFY]
- `src/pages/patient/PatientDashboard.tsx` [MODIFY]
- `src/types.ts` [MODIFY] (maybe)
