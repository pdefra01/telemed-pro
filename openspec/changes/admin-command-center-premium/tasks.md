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
- [ ] Refactor `AdminLayout.tsx` to "Zen Dark".
- [ ] Implement `OCCMonitor.tsx` (Real-time Hub).
- [ ] Implement `AffiliateManagement.tsx` (Commercial Hub).

## Phase 4: Billing UI & Exports
- [ ] Build `OCCBilling.tsx` (Invoice management).
- [ ] Implement `TaxSettings.tsx` UI.
- [ ] Add "Export for Accounting" functionality with file download.

## Phase 5: Verification
- [ ] Verify tax accuracy on mixed invoices.
- [ ] Test bulk import of 1000+ affiliates into an agreement.
- [ ] Verify blocking/grace period policy propagation.
