# Tasks: Pharmacy Stock Adjustments

Ordered task breakdown for implementing audited pharmacy stock adjustments with database atomicity, TypeScript domain types, repository layer methods, administrative UI modals, and unit tests.

---

## 1. Database Migration & Atomic RPC

- [ ] 1.1 Create migration file `supabase/migrations/20260917000000_pharmacy_stock_adjustments.sql`
  - [ ] 1.1.1 Define `pharmacy_stock_adjustments` table with columns `id`, `inventory_id`, `product_id`, `batch_number`, `user_id`, `reason`, `previous_quantity`, `new_quantity`, `quantity_delta`, `notes`, `created_at`
  - [ ] 1.1.2 Add check constraints for `reason` (`'physical_count'`, `'breakage'`, `'loss'`, `'expired'`, `'correction'`, `'other'`) and `new_quantity >= 0`
  - [ ] 1.1.3 Add foreign keys to `pharmacy_inventory(id) ON DELETE CASCADE`, `pharmacy_products(id) ON DELETE CASCADE`, and `auth.users(id) ON DELETE SET NULL`
  - [ ] 1.1.4 Create performance indexes on `inventory_id`, `product_id`, and `created_at DESC`
  - [ ] 1.1.5 Add table and column descriptive comments for schema documentation
- [ ] 1.2 Configure Row Level Security (RLS) policies for audit log protection
  - [ ] 1.2.1 Enable RLS on `public.pharmacy_stock_adjustments`
  - [ ] 1.2.2 Create `SELECT` policy restricted to authenticated administrators via `public.is_admin()`
  - [ ] 1.2.3 Create `INSERT` policy restricted to authenticated administrators via `public.is_admin()`
  - [ ] 1.2.4 Ensure `UPDATE` and `DELETE` operations have no policies (immutable audit log)
- [ ] 1.3 Implement atomic PostgreSQL RPC `public.adjust_pharmacy_batch_stock`
  - [ ] 1.3.1 Set `SECURITY DEFINER` and `SET search_path = public`
  - [ ] 1.3.2 Enforce caller admin check with `public.is_admin()` (raise error `42501` if unauthorized)
  - [ ] 1.3.3 Validate `p_new_quantity >= 0` and reason string against allowed enum values
  - [ ] 1.3.4 Acquire row lock with `SELECT ... FOR UPDATE` on `public.pharmacy_inventory`
  - [ ] 1.3.5 Calculate `quantity_delta = p_new_quantity - v_inventory.stock_quantity`
  - [ ] 1.3.6 Update `pharmacy_inventory.stock_quantity` to `p_new_quantity`
  - [ ] 1.3.7 Insert audit log into `pharmacy_stock_adjustments` with actor resolution (`COALESCE(p_user_id, auth.uid())`)
  - [ ] 1.3.8 Return newly created `pharmacy_stock_adjustments` record (`RETURNING *`)

---

## 2. Domain Types & TypeScript Contracts

- [ ] 2.1 Update `src/types.ts`
  - [ ] 2.1.1 Add `StockAdjustmentReason` union type (`'physical_count' | 'breakage' | 'loss' | 'expired' | 'correction' | 'other'`)
  - [ ] 2.1.2 Add `PharmacyStockAdjustment` interface (`id`, `inventoryId`, `productId`, `batchNumber`, `userId`, `reason`, `previousQuantity`, `newQuantity`, `quantityDelta`, `notes`, `createdAt`)
  - [ ] 2.1.3 Add `AdjustBatchStockPayload` interface (`inventoryId`, `newQuantity`, `reason`, `notes?`, `userId?`)

---

## 3. Data Access Layer (Repository)

- [ ] 3.1 Update `src/repositories/PharmacyRepository.ts`
  - [ ] 3.1.1 Import `StockAdjustmentReason`, `PharmacyStockAdjustment`, and `AdjustBatchStockPayload` types
  - [ ] 3.1.2 Implement `adjustStock(payload: AdjustBatchStockPayload): Promise<PharmacyStockAdjustment>` invoking `supabase.rpc('adjust_pharmacy_batch_stock', ...)`
  - [ ] 3.1.3 Map snake_case database response properties to camelCase `PharmacyStockAdjustment`
  - [ ] 3.1.4 Implement `getStockAdjustments(filters?: { inventoryId?: string; productId?: string }): Promise<PharmacyStockAdjustment[]>`
  - [ ] 3.1.5 Add query filters (`inventory_id`, `product_id`) and order by `created_at DESC`
  - [ ] 3.1.6 Map query results to `PharmacyStockAdjustment[]` with numeric parsing

---

## 4. Admin UI Integration (`PharmacyInventoryAdmin.tsx`)

- [ ] 4.1 Define adjustment constants and helpers in `src/pages/admin/PharmacyInventoryAdmin.tsx`
  - [ ] 4.1.1 Add `STOCK_ADJUSTMENT_REASONS` configuration mapping reasons to Spanish labels and Tailwind color badges
  - [ ] 4.1.2 Import icons `Clock`, `History`, `Sliders` from `lucide-react`
- [ ] 4.2 Add UI state management for stock adjustment and history inspection
  - [ ] 4.2.1 State for Adjust Stock Modal (`adjustingBatch`, `adjNewQuantity`, `adjReason`, `adjNotes`)
  - [ ] 4.2.2 State for History Modal (`historyBatch`, `adjustmentsList`, `loadingHistory`)
- [ ] 4.3 Add action buttons in the "Stock & Lotes" tab batch listing
  - [ ] 4.3.1 Add "Ajustar Stock" button to each batch row triggering `handleOpenAdjustModal(inv)`
  - [ ] 4.3.2 Add "Historial" button to each batch row triggering `handleOpenHistoryModal(inv)`
- [ ] 4.4 Implement **Adjust Stock Modal**
  - [ ] 4.4.1 Display product details, batch number, and current stock reference
  - [ ] 4.4.2 Provide numeric input for `newQuantity` (`min="0"`)
  - [ ] 4.4.3 Provide live visual delta indicator (`+{delta} un.` in green, `-{delta} un.` in red, `0 un.` in neutral)
  - [ ] 4.4.4 Provide reason selector dropdown with Spanish labels
  - [ ] 4.4.5 Provide optional notes textarea
  - [ ] 4.4.6 Implement submit handler calling `pharmacyRepository.adjustStock`, refreshing inventory & products list, showing success toast, and handling errors
- [ ] 4.5 Implement **Adjustment History Modal**
  - [ ] 4.5.1 Display header with batch number and product name
  - [ ] 4.5.2 Show spinner / loading indicator while fetching adjustments
  - [ ] 4.5.3 Render empty state when no adjustments exist
  - [ ] 4.5.4 Render chronological table / list displaying date/time, reason badge, previous -> new quantity, delta badge, notes, and user ID

---

## 5. Automated Unit Tests

- [ ] 5.1 Update `src/repositories/__tests__/PharmacyRepository.test.ts`
  - [ ] 5.1.1 Add test suite for `adjustStock` method verifying RPC invocation parameters (`p_inventory_id`, `p_new_quantity`, `p_reason`, `p_notes`, `p_user_id`)
  - [ ] 5.1.2 Verify `adjustStock` correctly transforms database row to camelCase `PharmacyStockAdjustment`
  - [ ] 5.1.3 Verify `adjustStock` propagates RPC errors properly
  - [ ] 5.1.4 Add test suite for `getStockAdjustments` verifying base query and ordering by `created_at DESC`
  - [ ] 5.1.5 Verify `getStockAdjustments` applies `inventoryId` filter when provided
  - [ ] 5.1.6 Verify `getStockAdjustments` applies `productId` filter when provided
  - [ ] 5.1.7 Verify `getStockAdjustments` error propagation on Supabase query failure

---

## 6. End-to-End Verification & Quality Checks

- [ ] 6.1 Execute Vitest test suite (`npm run test` or `npx vitest run`) and ensure all repository tests pass
- [ ] 6.2 Execute TypeScript compilation check (`npx tsc --noEmit`) to ensure zero type errors
- [ ] 6.3 Execute Vite build (`npm run build`) to ensure bundle integrity
