# Patient Profile Update Specification

## Purpose

Allows patients (users with role `patient`) to view, manage, and update their own contact information, ensuring clean integration with the local Supabase instance and instantaneous UI updates.

## Requirements

### Requirement: Patient Profile Edit Form

The patient MUST be able to view their profile details and edit specific contact columns (Full Name, Phone, Address).

#### Scenario: View read-only and editable fields
- GIVEN a patient is logged in and navigates to `/profile`
- WHEN the profile screen loads
- THEN the system MUST display DNI, Email, and Plan as read-only fields
- AND the system MUST display Full Name, Phone, and Address as editable input fields.

#### Scenario: Validation of input on submit
- GIVEN a patient has modified their Full Name to be empty or only whitespace
- WHEN they click the "Guardar" button
- THEN the system MUST prevent form submission
- AND the system MUST show a validation error message: "El nombre completo no puede estar vacío".

### Requirement: Persist Profile Updates

The system MUST save updated profile details to Supabase and immediately update the application header/sidebar context.

#### Scenario: Successful save and local sync
- GIVEN a patient has edited their Full Name to "Juan Actualizado", Phone to "+54 9 11 9999-8888", and Address to "Av. Siempre Viva 742"
- WHEN they click the "Guardar" button
- THEN the system MUST call `affiliateRepository.updateAffiliate` with the updated parameters
- AND the system MUST update `localStorage` and trigger the layouts login callback to update the active session instantly
- AND the system MUST display a success toast message: "Perfil actualizado con éxito".
