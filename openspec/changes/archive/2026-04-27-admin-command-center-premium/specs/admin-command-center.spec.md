# Specification: Admin Command Center Premium (OCC)

## 1. Functional Requirements

### 1.1. Subscription & Plan Management
- **Plan Definition**: Name, Cost, `bonified_consultations`, and family group limits.
- **Affiliate Roster**: CRUD with support for family grouping and linking to corporate agreements.

### 1.2. Billing, Taxes & Accounting
- **Individual Billing (B2C)**: Automated generation of monthly invoices for direct affiliates.
- **Agreement Billing (B2B)**: Consolidate all affiliates under a "Convenio" into a single monthly invoice for the corporate entity.
- **Tax Calculation Engine**:
    - **IVA**: Apply national Value Added Tax.
    - **IIBB**: Apply local "Ingresos Brutos" based on the entity's jurisdiction.
    - Configurable tax rates via the admin settings.
- **Accounting Export**:
    - Generate structured records (Date, Invoice#, Entity, Net Amount, Tax, Total).
    - Export format: CSV (compatible with most accounting software).

### 1.3. Delinquency & Policy Enforcement
- **Toggle Policy**: Choose between "Grace Period" (visual alert) and "Blocking" (prevention of bookings).
- **Payment Reconciliation**: Automated reconciliation via payment gateways and manual reconciliation via bank files.

### 1.4. Operational HUD
- Real-time queue and system health monitoring with "Zen Dark" aesthetics.

## 2. User Stories & Scenarios

### Scenario 1: Corporate (Agreement) Billing
**Given** a "Convenio" (Agreement) has 100 active affiliates
**When** the monthly billing cycle runs
**Then** the system should generate a SINGLE invoice for the corporate entity containing the sum of all monthly fees plus relevant taxes.
**And** it should flag all 100 affiliates as "Paid" for the period.

### Scenario 2: Accounting Export
**Given** an administrator needs to send the month's records to the accountant
**When** they select "Generate Accounting Export" for the current month
**Then** the system should generate a CSV file containing all invoices (Individual and B2B) with detailed tax breakdown.

### Scenario 3: Tax Adjustment
**Given** a change in the local IIBB tax rate
**When** the administrator updates the rate in "Tax Settings"
**Then** all subsequent invoices generated should reflect the new rate.
