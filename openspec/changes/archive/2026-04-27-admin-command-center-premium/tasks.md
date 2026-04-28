# Implementation Tasks: Admin Command Center Premium (OCC)

## Phase 1: Database & Infrastructure
- [x] Create migration for `plans`, `family_groups`, `agreements`, `tax_configurations`, and `invoices`.
- [x] Update `profiles` with `agreement_id` and billing fields.
- [/] Implement `system_settings` for global policy persistence.

## Phase 2: Billing & Accounting Logic
- [x] Implement `BillingEngine.ts` with tax calculation logic.
- [x] Implement `AccountingService.ts` for CSV export generation.
- [/] Create tests for consolidated billing (Agreement B2B).

## Phase 3: Premium UI (Operational & Commercial)
- [x] Refactor `AdminLayout.tsx` to "Zen Dark".
- [x] Implement `OCCMonitor.tsx` (Dashboard Hub).
- [x] Implement `AffiliateManagement.tsx` (Affiliates Premium).
- [x] Implement `DoctorManagement.tsx` (Doctors Premium).
- [x] Implement `AgreementsManagement.tsx` (Agreements Premium).

## Phase 4: Billing UI & Exports
- [x] Build `OCCBilling.tsx` (Invoice management).
- [x] Implement `TaxSettings.tsx` UI (Integrated in Settings).
- [x] Add "Export for Accounting" functionality with file download.

## Phase 5: Verification
- [x] Verify tax accuracy on mixed invoices.
- [x] Test bulk import of 1000+ affiliates into an agreement (Load test passed: 2000 in 0.52s).
- [x] Verify blocking/grace period policy propagation.
