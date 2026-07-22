# Product Requirements Document (PRD) - TeleMed Pro

## Overview
TeleMed Pro is a high-end, premium telemedicine platform designed for doctors and patients. It prioritizes "Cinematic/Zen Dark" aesthetics, robustness, and a seamless user experience.

## Core Values
1. **Premium Aesthetics**: Every screen must feel expensive, professional, and "Zen" (Dark mode, glassmorphism, teal/emerald accents).
2. **Robustness**: The platform must be reliable under high load and varying network conditions.
3. **Privacy & Security**: HIPAA-compliant standards, encrypted connections, and clear visual indicators for patients.

### 1. Scaling & Concurrency (Critical)
- **Simultaneous Attention**: The platform must support concurrent sessions for many patients and doctors.
- **Robust Infrastructure**: The architecture (Supabase + LiveKit) must handle multiple rooms and high-traffic periods without degradation.
- **Doctor Multi-tasking**: Doctors must have tools to manage their queue while in a consultation (Waiting Room awareness).

### 2. Patient Experience
- **Zen Dark Dashboard**: Unified panel for medical history, payments, and appointments.
- **Premium Video Consultation**: High-fidelity video with HUD-style technical indicators (latency, signal strength).
- **Digital Credential**: Refractive/Glassy ID for quick identification.

### 3. Doctor Experience
- **Clinical Command Center**: Unified workspace with real-time patient queue and HUD overlays.
- **Post-Consultation Workflow**: Fast, AI-assisted registration of clinical evolution and prescriptions.

## 4. Administrative & Business Rules (Operational Command Center)

### 4.1. Subscription & Affiliate Management

- **Membership Model**: Patients pay a monthly fee (mensualidad).
- **Plan Duration**: Each plan defines a billed duration in months (`paidMonths`) plus an optional free promo duration (`bonusMonths`) added on top (e.g. a "12+2" plan = 14 months of coverage for the price of 12).
- **Grace vs. Block**: The system must allow admins to toggle between "Grace Period" and "Immediate Blocking" for non-payment.
- **Affiliate Roster (Padrón)**: Supports individual registrations and bulk imports (CSV/Excel) for corporate agreements (convenios).
- **Cancellations**: Supports both immediate termination or end-of-month expiration.
- **Family Groups**: Membership includes the primary affiliate plus their 1st-degree family group.

### 4.2. Consultations & Quotas
- **Bonified Consultations**: Each plan includes a defined number (X) of "0 cost" consultations per month for the entire family group.
- **Over-quota logic**: Beyond the quota, consultations follow the standard pricing or a discounted rate (TBD).
- **Coverage Window**: Assigning a plan to an affiliate (or family group) for the first time opens a coverage window — a snapshot of period start, expiration date (derived from the plan's `paidMonths` + `bonusMonths`), and granted quota. This snapshot, not the live plan, is the source of truth for quota and expiry: editing a plan later never retroactively changes coverage already granted to an affiliate mid-window.
- **Explicit Coverage States**: The system always reports one of three states — active (with real remaining quota), expired (never reports leftover quota from an expired window as available), or no window yet (plan assigned but coverage never opened) — instead of fabricating a number.
- **Manual Renewal**: Once a window expires, an admin can trigger an explicit "Renovar Cobertura" action from the affiliate roster to open a fresh window sourced from the affiliate's currently assigned plan and reset consumed quota. There is no automatic renewal (no scheduler yet) — it is always a deliberate admin action.

### 4.3. Payment & Billing
- **Hybrid Payments**: Supports digital gateways (Mercado Pago, etc.) and manual reconciliation via bank file imports.
- **Billing Methods**: Supports billing by **Individual Affiliate** and by **Agreement (Convenio/Company)**.
- **Tax Engine**: Must account for local and national taxes (IVA, IIBB, etc.) in invoice generation.
- **Accounting Export**: Ability to generate accounting records/exports for external accounting firms (Estudio Contable).
- **Revenue Tracking**: Admin must have real-time visibility into MRR (Monthly Recurring Revenue) and delinquency (morosidad).

### 4.4. Duplicate Prevention & Identity Validation (Adhesion Requests)
- **Problem Solved**: The public adhesion form previously had no duplicate-prevention logic and did not collect the CUIL (Argentine tax/labor ID), which led to duplicate affiliate registrations and manual data cleanup.
- **Identifiers Collected**: The titular and each family member (up to 4 per request) now provide both DNI and CUIL.
- **Duplicate Checks**: On submission, both DNI and CUIL are checked independently — a match on either one is enough to block the request — against active affiliates, existing family members, and pending adhesion requests. Requests where the only match is a previously **rejected** application are allowed to resubmit.
- **Enforcement**: Primary validation runs at the application layer (`POST /api/adhesion/check-duplicates`); partial unique indexes at the database level act as defense-in-depth against race conditions.

## Technical Stack
- **Frontend**: React 19, TypeScript, Vite, React Router 7.
- **Styling**: Vanilla CSS (Cinematic/Zen Dark system).
- **Backend**: Supabase (Auth, DB, Real-time).
- **Video**: LiveKit.
- **AI**: Gemini (for medical notes assistance).

## 5. Advisor Experience (Perfil Asesor)

### 5.1. Dashboard del Asesor
- **Indicadores de Venta**: Panel visual que muestra las adhesiones capturadas por el asesor mediante su código/ID de promotor, permitiéndole dar seguimiento a sus comisiones e ingresos acumulados.
- **Cartelera de Anuncios**: Sección para visualizar comunicaciones, instructivos y cambios operativos enviados por la Gerencia y la Administración.
- **Autogestión**: Panel que permite al asesor actualizar sus datos personales (teléfono, domicilio, correo) y gestionar su contraseña de forma segura.

---

## Pendientes Prioritarios (Backlog)

1. **[PENDIENTE] Perfil "Asesor"**:
   - Diseñar esquema de base de datos para registrar métricas de ventas y comisiones asociadas a promotores.
   - Implementar panel de control visual para asesores con indicadores de rendimiento (KPIs).
   - Crear sistema de anuncios administrativos/gerenciales en el Operational Command Center con destino a la cartelera del Asesor.
   - Desarrollar la autogestión de perfil y datos personales en la interfaz de asesor.
