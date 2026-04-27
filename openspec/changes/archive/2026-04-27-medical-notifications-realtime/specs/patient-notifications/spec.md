# Patient Notifications Specification

## Purpose
Define the real-time notification experience for patients, ensuring they receive proactive updates about their clinical journey (finalized consultations, new prescriptions, administrative updates) without manual refreshes.

## Requirements

### Requirement: Real-time Subscription
The patient dashboard MUST maintain an active subscription to the `notifications` table for the current user.

#### Scenario: Dashboard receives a notification in real-time
- GIVEN a patient is viewing their `PatientDashboard`.
- WHEN a new notification is inserted in the database for that patient's `user_id`.
- THEN the dashboard MUST catch the event via Supabase Realtime.
- AND the UI MUST update the notification indicator (bell icon) and show a Toast alert.

### Requirement: Notification Bell & History
The system MUST provide a central place (Notification Bell) to view recent alerts.

#### Scenario: Patient views notification history
- GIVEN the patient has unread notifications.
- WHEN the patient clicks the "Notification Bell" icon.
- THEN a dropdown or modal MUST show a list of recent notifications.
- AND each item MUST display the title, time, and status.

### Requirement: Immediate Action from Notification
Notifications with links (e.g., to a Prescription PDF) MUST allow the patient to take action directly.

#### Scenario: Patient opens a prescription from notification
- GIVEN a notification with title "Consulta Finalizada" containing a link to a PDF.
- WHEN the patient clicks the notification or the action button within it.
- THEN the system MUST open the PDF link in a new tab or trigger a download.

### Requirement: Marking as Read
Notifications MUST be marked as read once viewed or interacted with to clear the badge.

#### Scenario: Patient clears notification badge
- GIVEN a notification with `is_read: false`.
- WHEN the patient opens the notification list.
- THEN the system SHOULD mark those notifications as `is_read: true` in the database.
