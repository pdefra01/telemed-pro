# Design: Scheduler (Agendamiento de Turnos)

## Technical Approach
We will implement the Repository pattern to decouple the UI from Supabase.
- `DoctorRepository` will handle fetching professional data.
- `AppointmentRepository` will be extended to support real booking.
- `PatientDashboard` will be refactored to use these repositories and handle the multi-step booking UI.

## Architecture Decisions

### Decision: Data Fetching for Doctors
**Choice**: Direct Supabase query via `DoctorRepository`.
**Alternatives considered**: Using existing `AuthRepository` or global context.
**Rationale**: Keeps the codebase organized and follows the established repository pattern.

### Decision: Slot Management
**Choice**: Simple array selection from the doctor's `availability` field.
**Alternatives considered**: Creating a separate `slots` table.
**Rationale**: The current requirements are simple enough for an array. We can evolve to a `slots` table if we need to track real-time occupancy across many dates.

## Data Flow
    PatientDashboard ──(UI)──> DoctorRepository ──(query)──> Supabase (profiles)
         │                          │
         └───────(confirm)───────> AppointmentRepository ──(insert)──> Supabase (appointments)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/repositories/DoctorRepository.ts` | Create | New repository for doctor data. |
| `src/repositories/__tests__/DoctorRepository.test.ts` | Create | Unit tests for DoctorRepository. |
| `src/repositories/AppointmentRepository.ts` | Modify | Add `createAppointment` method. |
| `src/repositories/__tests__/AppointmentRepository.test.ts` | Modify | Add tests for `createAppointment`. |
| `src/pages/patient/PatientDashboard.tsx` | Modify | Connect UI to repositories. |
| `src/pages/patient/__tests__/PatientDashboard.test.tsx` | Create | Integration tests for the booking flow. |

## Interfaces / Contracts

```typescript
// DoctorRepository.ts
export class DoctorRepository {
  async getAllDoctors(): Promise<Doctor[]>;
  async getDoctorsBySpecialty(specialty: string): Promise<Doctor[]>;
  async getSpecialties(): Promise<string[]>;
}

// AppointmentRepository.ts (new method)
async createAppointment(
  patientId: string, 
  doctorId: string, 
  date: string, 
  time: string
): Promise<void>;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Repositories | Mock Supabase and verify queries. |
| Integration | PatientDashboard | Mock repositories and verify UI flow. |

## Migration / Rollout
No migration required. Assumes `profiles` and `appointments` tables exist.
