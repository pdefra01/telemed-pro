---
name: El Flujo de Atención del Médico (Doctor notes and completion)
status: draft
type: feature
---

# Feature: El Flujo de Atención del Médico

As a Doctor, I need to be able to efficiently manage my appointments, add medical notes during or after a video call, and mark the appointment as "Completed" to finalize the consultation.

## Context

The current prototype provides a basic Doctor Dashboard and a functional VideoRoom. This specification aims to add the missing logic to complete the "consultation cycle" from the doctor's perspective. The implementation must follow Test-Driven Development (TDD) principles.

**Critical Scaling Requirement:** The platform must support simultaneous attention for many patients across different doctors. The infrastructure and UI must be robust enough to handle concurrent video sessions, real-time messaging, and high-concurrency state updates without performance degradation.

## Data Model Updates

The `appointments` table must be updated to support doctor notes.

```sql
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS notes TEXT;
```

(The `status` constraint was already updated to accept 'completed' in a previous discovery step.)

## Acceptance Criteria

1.  **Dashboard Integration:** The Doctor Dashboard must display appointments assigned to the logged-in doctor, filtering by 'confirmed' or 'pending' status by default.
2.  **Joining Room:** The Doctor can click a link/button from the dashboard to join the VideoRoom for a scheduled appointment.
3.  **VideoRoom Notes:** A new panel or section in the `VideoRoom` page (only visible to the Doctor) must allow adding/editing text for `medical notes`.
4.  **Auto-save/Persist:** Changes to the notes should be persisted (e.g., on debounced change or on explicit save button click, but automatic persistence is preferred for UX).
5.  **Completion Logic:** A "Finalizar Consulta" (Finish Consultation) button must be present in the `VideoRoom` or `DoctorDashboard`.
6.  **Completion Action:** Clicking "Finalizar Consulta" must:
    *   Set the appointment status to `'completed'`.
    *   Ensure any final notes are saved.
    *   Generate a persistent notification for the patient in the `notifications` table (Title: "Consulta Finalizada", Message: "Tu médico ha finalizado la consulta...").
    *   (Optionally) Redirect the doctor back to the dashboard or a summary page.
    *   Prevent the appointment from being rejoined or further edited by either party.
7.  **Service/Repository Implementation:** Business logic must be implemented in services/repositories (e.g., `AppointmentRepository.ts`) and tested using Vitest (TDD). UI should focus on state management and integration.
8.  **Multitasking Dashboard (Doctor):** The doctor must have a "Live Queue" visible during calls to monitor other incoming or waiting patients without leaving the current session.
9.  **System Health Monitoring:** The UI must display real-time network/latency indicators for both the doctor and the patient to ensure a robust experience.

## Scenarios (TDD Guidance)

These scenarios define the test cases that must pass *before* logic changes are made to `AppointmentRepository.ts` or related services.

### Scenario 1: Doctor retrieves their active appointments.
*   **Given** a doctor with ID `doc1` and multiple appointments: one `'pending'`, one `'confirmed'`, one `'completed'`.
*   **When** calling `getDoctorAppointments('doc1', { status: ['pending', 'confirmed'] })`.
*   **Then** only the `'pending'` and `'confirmed'` appointments should be returned.

### Scenario 2: Doctor joins a video call.
*   **Given** a `'confirmed'` appointment with ID `app1` assigned to doctor `doc1`.
*   **When** doctor `doc1` requests to join the room for `app1`.
*   **Then** a valid LiveKit token for the room associated with `app1` must be generated.

### Scenario 3: Doctor saves medical notes.
*   **Given** a consultation for appointment `app1` is in progress.
*   **When** the doctor saves notes text: "Paciente presenta..." for `app1`.
*   **Then** the `appointments` record with ID `app1` in the database must be updated with `notes: "Paciente presenta..."`.

### Scenario 4: Doctor marks appointment as completed.
*   **Given** a consultation for appointment `app1` (with status `'confirmed'`) is finished.
*   **When** the doctor clicks "Finalizar Consulta" for `app1`.
*   **Then**:
    1.  The `appointments` record with ID `app1` must be updated with `status: 'completed'`.
    2.  A new record MUST be created in the `notifications` table for the patient.
    3.  Any recent notes must be persisted.
    4.  A subsequent request to join the room for `app1` should fail or be blocked.

## Implementation Tasks

1.  Create `src/repositories/__tests__/AppointmentRepository.test.ts` (if it doesn't exist) or update it.
2.  Add Vitest tests for the scenarios above (failing tests).
3.  Implement data model change (using a script or via the repository init logic, following project convention).
4.  Implement `getDoctorAppointments` logic (with status filtering).
5.  Implement `saveAppointmentNotes` logic.
6.  Implement `completeAppointment` logic.
7.  Verify all tests pass.
8.  Update `DoctorDashboard.tsx` UI to integrate with the new service methods.
9.  Update `VideoRoom.tsx` UI (Doctor perspective) to include the notes panel and the completion button.
