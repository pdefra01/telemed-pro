# Delta for Consultation Finalization

## MODIFIED Requirements

### Requirement: Completion Action (from doctor-flow.spec.md: Criterion 6)

Clicking "Finalizar Consulta" MUST trigger a series of atomic actions to close the clinical cycle:
*   Set the appointment status to `'completed'`.
*   Ensure any final notes are saved.
*   Generate a persistent notification for the patient in the `notifications` table.
*   The notification MUST include:
    *   A clear title: "Consulta Finalizada".
    *   A descriptive message: "Tu médico ha finalizado la consulta. Ya podés revisar tu receta y el registro médico."
    *   A direct link to the record (if available).
    *   A type indicator (e.g., `success` or `info`).
*   (Optionally) Redirect the doctor back to the dashboard or a summary page.
*   Prevent the appointment from being rejoined or further edited by either party.

(Previously: Clicking "Finalizar Consulta" must set status to 'completed', save notes, and block rejoin.)

#### Scenario: Doctor marks appointment as completed with notification
- GIVEN a consultation for appointment `app1` (with status `'confirmed'`) is finished.
- WHEN the doctor clicks "Finalizar Consulta" for `app1`.
- THEN:
    1. The `appointments` record with ID `app1` MUST be updated with `status: 'completed'`.
    2. A new record MUST be created in the `notifications` table for the patient associated with `app1`.
    3. The notification record MUST contain `title: "Consulta Finalizada"` and `link` to the prescription PDF if generated.
    4. Any recent notes MUST be persisted.
    5. A subsequent request to join the room for `app1` SHOULD fail or be blocked.
