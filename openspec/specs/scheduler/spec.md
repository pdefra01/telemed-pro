# Scheduler Specification

## Purpose
This specification defines the behavior for patients to search for medical professionals and book appointments based on their real availability.

## Requirements

### Requirement: Professional Lookup by Specialty
The system MUST allow patients to filter the list of available doctors by their medical specialty.

#### Scenario: Filter doctors by specialty
- GIVEN a patient is in the "Nuevo Turno" modal
- WHEN they select "Cardiología" from the specialty list
- THEN only doctors with the "Cardiología" specialty SHALL be displayed

### Requirement: Availability Selection
The system MUST display the available time slots for a selected doctor and allow the patient to select one.

#### Scenario: Select a time slot
- GIVEN a patient has selected a doctor
- WHEN they view the doctor's details
- THEN the system SHALL show all time slots from the doctor's `availability` array
- AND WHEN the patient clicks on a slot
- THEN that slot SHALL be marked as selected

### Requirement: Appointment Confirmation
The system MUST persist the appointment in the database when the patient confirms the booking.

#### Scenario: Confirm appointment successfully
- GIVEN a patient has selected a doctor and a time slot
- WHEN they click "Confirmar Turno"
- THEN a new record MUST be created in the `appointments` table with:
    - `patient_id`: ID of the logged-in patient
    - `doctor_id`: ID of the selected doctor
    - `scheduled_at`: Combined date (tomorrow by default for now) and selected time
    - `status`: 'confirmed'
- AND the patient SHALL receive a success notification
- AND the modal SHALL close
