# Delta for doctor-flow

## ADDED Requirements

### Requirement: Premium Medication Input Experience
The medication loading section MUST provide a high-end, visual experience to reduce cognitive load and errors.
- **Card-based UI**: Each medication MUST be rendered in its own glass-styled card.
- **Auto-suggestions**: The system SHOULD offer local suggestions for common medication names as the doctor types.
- **Field Validation**: The UI MUST provide real-time visual feedback if a medication is missing its name or posology.

#### Scenario: Doctor adds a medication with visual feedback
- GIVEN the "Receta Electrónica" section is active.
- WHEN the doctor types "Amoxi" in the medication name.
- THEN the system SHOULD display a dropdown with suggestions (e.g., "Amoxicilina 500mg").
- AND WHEN the medication is added, it MUST appear as a distinct card with an "Emerald" or "Blue" glow.

---

## MODIFIED Requirements

### Requirement: Completion Action (from doctor-flow.spec.md: Criterion 6)

Clicking "Finalizar Consulta" MUST trigger a series of atomic actions to close the clinical cycle with a high-fidelity feedback experience:
*   Set the appointment status to `'completed'`.
*   Ensure any final notes are saved.
*   Generate a persistent notification for the patient.
*   **NEW**: The UI MUST display a "Success Overlay" with progress indicators (e.g., "Generando PDF", "Enviando Notificación").
*   **NEW**: A final "Success State" MUST be displayed after the operation completes, offering a "Return to Dashboard" action.
*   Prevent the appointment from being rejoined or further edited by either party.

(Previously: Clicking "Finalizar Consulta" sets status, saves notes, notifies patient, and blocks rejoin.)

#### Scenario: Doctor completes consultation with progress feedback
- GIVEN the doctor is in the `PostConsultation` page with valid data.
- WHEN the doctor clicks "Finalizar Consulta".
- THEN the system MUST display a backdrop overlay with a progress animation.
- AND WHEN the backend process completes, the overlay MUST transition to a "Success Message" with a checkmark animation.
- AND the appointments record MUST be updated and notification created as per previous specs.
