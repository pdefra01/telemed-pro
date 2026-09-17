# Proposal: Pharmacy Stock Adjustments

## Intent

Currently, in the digital pharmacy module, inventory batch stock (`pharmacy_inventory`) can only be incremented upon supplier order arrival or decremented via medical prescriptions and direct manual quantity edits without an audit trail. Inventory discrepancies occur regularly due to physical counts, breakage, damage, loss, expired stock, or administrative corrections. Without an explicit, audited stock adjustment mechanism, administrators lack visibility into who changed stock quantities, when, why, and by how much.

This proposal introduces audited batch stock adjustments for the pharmacy inventory (`pharmacy_inventory`), backed by a dedicated audit table `pharmacy_stock_adjustments`, a transactional Supabase Postgres RPC function `adjust_pharmacy_batch_stock`, TypeScript domain types, repository operations in `PharmacyRepository`, and intuitive UI modal dialogs (Stock Adjustment Modal & Adjustment History Modal) inside `PharmacyInventoryAdmin`.

## Scope

### In Scope
- **Database Schema & RPC**:
  - New table `pharmacy_stock_adjustments` tracking `id`, `inventory_id`, `product_id`, `batch_number`, `user_id`, `reason` (enum/check: `physical_count`, `breakage`, `loss`, `expired`, `correction`, `other`), `previous_quantity`, `new_quantity`, `quantity_delta`, `notes`, and `created_at`.
  - Row Level Security (RLS) policies allowing administrative role access for viewing and inserting adjustment records.
  - Atomic Supabase Postgres RPC function `adjust_pharmacy_batch_stock(p_inventory_id, p_new_quantity, p_reason, p_notes, p_user_id)` ensuring concurrent updates safely lock the inventory row, compute `quantity_delta = p_new_quantity - previous_quantity`, update `stock_quantity` in `pharmacy_inventory`, and insert the audit record in `pharmacy_stock_adjustments`.
- **Frontend Domain Models (`src/types.ts`)**:
  - `StockAdjustmentReason` union type (`'physical_count' | 'breakage' | 'loss' | 'expired' | 'correction' | 'other'`).
  - `PharmacyStockAdjustment` interface representing individual audit history items.
  - `AdjustBatchStockPayload` interface for dispatching adjustment requests.
- **Data Access Layer (`src/repositories/PharmacyRepository.ts`)**:
  - `adjustStock(payload: AdjustBatchStockPayload): Promise<PharmacyStockAdjustment>` calling the atomic RPC function.
  - `getStockAdjustments(filters?: { inventoryId?: string; productId?: string }): Promise<PharmacyStockAdjustment[]>` querying adjustment history.
- **Admin User Interface (`src/pages/admin/PharmacyInventoryAdmin.tsx`)**:
  - "Ajustar Stock" button per batch in the inventory view, opening an **Adjust Stock Modal**.
  - Adjust Stock Modal offering reason selection, new quantity input with live delta indicator (`+` / `-`), optional notes, and validation (prevent negative stock).
  - "Ver Historial de Ajustes" button per batch/product opening a **History Modal** with tabular logs of previous quantity, new quantity, delta badge, reason badge, user, notes, and timestamp.
- **Automated Tests (`src/repositories/__tests__/PharmacyRepository.test.ts`)**:
  - Unit test coverage for `adjustStock` and `getStockAdjustments` methods verifying RPC parameters, error handling, and data mapping.

### Out of Scope
- Automated scheduled inventory physical counting rounds (cycle counting workflows).
- Integration with external fiscal accounting or third-party ERP software.
- Customer-facing returns workflow (managed through standard order cancellations/refunds).

## Capabilities

### New Capabilities
- `pharmacy-stock-adjustments`: End-to-end batch stock adjustments with full audit logs, delta calculation, typed classification reasons, and administrative history visualization.

### Modified Capabilities
- `pharmacy-inventory-management`: Batch inventory management in `PharmacyInventoryAdmin` upgraded with audited adjustment actions replacing unrecorded quantity mutations.

## Approach

### 1. Database Architecture & Atomic RPC
A new table `pharmacy_stock_adjustments` will store every stock alteration. The Postgres RPC `adjust_pharmacy_batch_stock` guarantees atomicity:
```sql
CREATE TABLE pharmacy_stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES pharmacy_inventory(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES pharmacy_products(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('physical_count', 'breakage', 'loss', 'expired', 'correction', 'other')),
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL CHECK (new_quantity >= 0),
  quantity_delta INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
The RPC will execute within a transaction with row locking (`SELECT ... FOR UPDATE` on `pharmacy_inventory`) to avoid race conditions.

### 2. TypeScript Contracts & Repository
Extend `src/types.ts` with typed adjustment reasons and history models:
- `StockAdjustmentReason`: `'physical_count' | 'breakage' | 'loss' | 'expired' | 'correction' | 'other'`
- `PharmacyStockAdjustment`: record representing an adjustment row.
- `AdjustBatchStockPayload`: request parameters for adjusting stock.

Update `PharmacyRepository` with:
- `adjustStock(payload: AdjustBatchStockPayload): Promise<PharmacyStockAdjustment>`: invokes `supabase.rpc('adjust_pharmacy_batch_stock', ...)` and returns the resulting audit log.
- `getStockAdjustments(filters?: { inventoryId?: string; productId?: string }): Promise<PharmacyStockAdjustment[]>`: queries `pharmacy_stock_adjustments` ordered by `created_at DESC`.

### 3. UI/UX in `PharmacyInventoryAdmin.tsx`
- Batches table will include action buttons: `Ajustar` and `Historial`.
- Modal 1: **Adjust Stock Modal**:
  - Displays current batch number, product name, expiration date, and current quantity.
  - Reason selector with clear labels (Conteo Físico, Rotura / Daño, Pérdida / Extravío, Vencimiento, Corrección Administrativa, Otro).
  - New quantity input with visual indicator showing the calculated delta (`+X` in green, `-X` in red).
  - Optional notes input.
- Modal 2: **History Modal**:
  - Chronological timeline/table of all adjustments for the batch/product.
  - Badges for reasons, delta highlighting, date/time formatted, and user who authorized the change.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/*_pharmacy_stock_adjustments.sql` | New | Migration creating table, RLS policies, indexes, and RPC `adjust_pharmacy_batch_stock` |
| `src/types.ts` | Modified | Add `StockAdjustmentReason`, `PharmacyStockAdjustment`, and `AdjustBatchStockPayload` |
| `src/repositories/PharmacyRepository.ts` | Modified | Add `adjustStock` and `getStockAdjustments` methods |
| `src/pages/admin/PharmacyInventoryAdmin.tsx` | Modified | Integrate Adjust Stock Modal & History Modal into batch inventory view |
| `src/repositories/__tests__/PharmacyRepository.test.ts` | Modified | Unit tests for `adjustStock` and `getStockAdjustments` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Concurrent stock modifications causing race conditions | Low | Use row-level locking (`FOR UPDATE`) inside `adjust_pharmacy_batch_stock` RPC |
| Negative inventory resulting from manual adjustment | Low | Postgres check constraint `CHECK (new_quantity >= 0)` + frontend input clamping |
| Orphan adjustment records if batch is deleted | Low | Cascade deletion or nullifying FK constraints in DB schema |
| Missing user attribution if session expires | Low | Pass authenticated user ID explicitly or fallback to `auth.uid()` in RPC |

## Rollback Plan
1. Drop the `pharmacy_stock_adjustments` table and RPC function `adjust_pharmacy_batch_stock` via down-migration SQL.
2. Revert changes in `src/repositories/PharmacyRepository.ts`, `src/types.ts`, and `src/pages/admin/PharmacyInventoryAdmin.tsx` via git.
3. No breaking changes to existing product catalog or inventory schema.

## Dependencies
- Supabase Postgres Database with RLS enabled.
- `@supabase/supabase-js` client.
- Lucide React icons for UI indicators.

## Success Criteria
- [ ] Database migration successfully creates `pharmacy_stock_adjustments` table and `adjust_pharmacy_batch_stock` RPC function.
- [ ] Administrators can adjust batch stock with any of the 6 standard reasons (`physical_count`, `breakage`, `loss`, `expired`, `correction`, `other`) and optional notes.
- [ ] Stock adjustments recalculate `quantity_delta` and update `stock_quantity` in `pharmacy_inventory` atomically.
- [ ] Adjustment audit trail is queryable and visible in the History Modal with timestamps, user info, and reason badges.
- [ ] Unit tests for repository methods pass successfully with 100% assertions met.
