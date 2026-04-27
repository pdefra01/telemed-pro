---
name: El Flujo de Atención del Paciente (Patient Experience & Dashboard)
status: draft
type: feature
---

# Feature: El Flujo de Atención del Paciente

As a Patient, I need an immersive, secure, and clear experience to manage my health journey, join video consultations, and access my medical information.

## Context

The patient experience must match the high-tech, "Zen Dark" aesthetic of the doctor's command center. It should convey security, privacy, and calm.

**Critical Scaling Requirement:** The platform must support concurrent sessions for many patients. The UI should show real-time health indicators (connection/encryption) to reassure the patient during their journey. This architecture MUST be robust enough to handle simultaneous attention across different doctors and patients without performance degradation.

## Acceptance Criteria

1.  **Zen Dark Dashboard:** The `PatientDashboard` must follow the Zen Dark aesthetic (glassmorphism, high-contrast typography, emerald/teal accents).
2.  **Immersive Waiting Room:** When an appointment is about to start, the transition to the `VideoRoom` should feel like entering a secure, professional environment.
3.  **Real-time Queue Status:** If the patient is waiting in the "Virtual Waiting Room," they should see their status or a comforting "Waiting Room" UI with connection health indicators.
4.  **Secure Document Access:** Access to prescriptions and medical records must be intuitive and feel protected (visual indicators of encryption).
5.  **Digital Credential:** A modern, refractively-styled digital credential for quick identification.
6.  **Interactive Modals:** All patient actions (scheduling, uploading) must use immersive, high-quality modals.
7.  **Real-time Notifications:** The system MUST proactively notify the patient of events (consultation finalized, new prescription) in real-time via a dashboard subscription.
8.  **Notification Center:** A "Bell" icon with a history dropdown must allow viewing and managing (marking as read) recent alerts.

## Scenarios

### Scenario 1: Patient views their dashboard.
*   **Given** a logged-in patient.
*   **When** they view the dashboard.
*   **Then** they see their next appointment, recent records, and digital credential in a Zen Dark theme.

### Scenario 2: Patient waits for a consultation.
*   **Given** a confirmed appointment starting in 5 minutes.
*   **When** the patient is on the dashboard.
*   **Then** the "INGRESAR" button is prominently displayed with a "Connection Secure" indicator.

### Scenario 3: Patient receives a notification.
*   **Given** a patient on their dashboard.
*   **When** a new notification record is created for them.
*   **Then** a Toast appears and the Notification Bell shows a new unread indicator.

### Scenario 4: Patient views connection health.
*   **Given** the patient is in a video call.
*   **When** their network fluctuates.
*   **Then** a subtle signal strength indicator (similar to the doctor's HUD) shows the status.

## Implementation Tasks

1.  Update `PatientDashboard.tsx` with Zen Dark theme (Glassmorphism, Glows).
2.  Enhance the "Next Appointment" card to include "Waiting Room" aesthetics.
3.  Implement/Enhance the "Digital Credential" with a refractive design.
4.  Refactor all patient-facing modals to match the new theme.
5.  Add "Security/Connection Health" indicators to the patient's VideoRoom view.
