# Proposal: Admin Command Center Premium (OCC)

## Intent
Transform the existing basic administration into a "strong" Operational Command Center (OCC). This involves upgrading the UI to the "Zen Dark" aesthetic, implementing complex business rules for affiliate subscriptions, multi-level billing (B2C/B2B), tax calculation, and accounting exports.

## Scope
- **Subscription Engine**: Implementation of plan management, family groups, and consultation quotas.
- **Billing & Taxes**: Flexible billing (Individual vs. Agreement) with local/national tax calculation (IVA, IIBB).
- **Accounting Integration**: Automated export of records for accounting firms (Estudio Contable).
- **Payment & Delinquency**: Logic for Grace Period vs. Blocking policies.
- **Bulk Operations**: High-performance affiliate import (CSV/Excel) for corporate agreements.
- **Premium UI**: Refactoring the Admin Dashboard into a cinematic, glassmorphic HUD.
- **Operational HUD**: Real-time monitoring of consultation queues and system status.

## Approach
1. **Database Expansion**: Create tables for `plans`, `family_groups`, `agreements`, `invoices`, `taxes`, and `system_settings`.
2. **Business Logic**: 
    - Centralize access validation in `SubscriptionService`.
    - Implement a `BillingEngine` to handle tax calculation and invoice consolidation.
3. **Admin UI Refactor**: 
    - Convert `AdminDashboard.tsx` to "Zen Dark".
    - Implement the "Operational Hub" (Real-time monitor).
    - Implement the "Commercial & Billing Hub" (Roster, Plans, Invoicing, Accounting).
4. **Export Service**: Create a utility to generate CSV/Excel files for accountants.

## Risks
- **Tax Accuracy**: Local and national tax rules can be complex and change over time.
- **Performance**: Consolidating thousands of affiliates into a single agreement invoice must be optimized.
- **Legal/Audit**: Invoices and accounting records must be immutable and audit-trailed.
