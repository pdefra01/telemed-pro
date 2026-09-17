# Pharmacy Stock Adjustments Specification

## Purpose

Defines the end-to-end specification for audited batch stock adjustments in the digital pharmacy module (`pharmacy_inventory`). This capability replaces unrecorded direct stock mutations with atomic, concurrency-safe adjustments, an immutable audit trail (`pharmacy_stock_adjustments`), typed classification reasons, domain models, repository operations, and interactive administrative UI modals for adjusting stock and inspecting historical movements.

## Requirements

### Requirement: Atomic Batch Stock Adjustment Execution

The system MUST provide an atomic PostgreSQL RPC function `adjust_pharmacy_batch_stock` that updates the batch stock quantity in `pharmacy_inventory` and records an audit entry in `pharmacy_stock_adjustments` within a single database transaction.

1. The function MUST lock the target inventory row using `SELECT ... FOR UPDATE` on `pharmacy_inventory` to prevent concurrent race conditions.
2. The function MUST calculate `quantity_delta` as `p_new_quantity - previous_quantity`.
3. The function MUST update `stock_quantity` in `pharmacy_inventory` to `p_new_quantity`.
4. The function MUST reject any adjustment resulting in a negative stock quantity (`p_new_quantity < 0`) and abort the transaction.
5. If the inventory record does not exist, the function MUST raise an exception and fail immediately.

#### Scenario: Admin adjusts stock quantity upwards
- GIVEN a pharmacy inventory batch with ID `inv-1`, `product_id: prod-1`, `batch_number: LOT-A1`, and current `stock_quantity: 50`
- WHEN `adjust_pharmacy_batch_stock` is executed with `p_inventory_id: 'inv-1'`, `p_new_quantity: 65`, `p_reason: 'physical_count'`, `p_notes: 'Conteo semestral'`, and authenticated `p_user_id: 'user-admin'`
- THEN the transaction locks the inventory row `inv-1`
- AND `pharmacy_inventory.stock_quantity` MUST be updated to `65`
- AND a new record in `pharmacy_stock_adjustments` MUST be created with:
  - `inventory_id: 'inv-1'`
  - `product_id: 'prod-1'`
  - `batch_number: 'LOT-A1'`
  - `previous_quantity: 50`
  - `new_quantity: 65`
  - `quantity_delta: 15`
  - `reason: 'physical_count'`
  - `notes: 'Conteo semestral'`
  - `user_id: 'user-admin'`
- AND the function MUST return the newly created adjustment record

#### Scenario: Admin adjusts stock quantity downwards
- GIVEN a pharmacy inventory batch with ID `inv-2`, `product_id: prod-1`, `batch_number: LOT-A2`, and current `stock_quantity: 20`
- WHEN `adjust_pharmacy_batch_stock` is executed with `p_inventory_id: 'inv-2'`, `p_new_quantity: 12`, `p_reason: 'breakage'`, `p_notes: 'Frascos rotos en depósito'`
- THEN `pharmacy_inventory.stock_quantity` MUST be updated to `12`
- AND a new record in `pharmacy_stock_adjustments` MUST be created with `previous_quantity: 20`, `new_quantity: 12`, and `quantity_delta: -8`

#### Scenario: Rejection of negative stock quantity
- GIVEN a pharmacy inventory batch with ID `inv-3` and current `stock_quantity: 10`
- WHEN `adjust_pharmacy_batch_stock` is executed with `p_inventory_id: 'inv-3'` and `p_new_quantity: -5`
- THEN the function MUST raise an exception indicating that stock quantity cannot be negative
- AND no changes MUST be persisted in `pharmacy_inventory` or `pharmacy_stock_adjustments`

#### Scenario: Non-existent inventory batch ID
- GIVEN no inventory record exists with ID `inv-non-existent`
- WHEN `adjust_pharmacy_batch_stock` is called with `p_inventory_id: 'inv-non-existent'`
- THEN the function MUST raise a `NOT_FOUND` exception and abort the transaction

---

### Requirement: Immutable Audit Trail Recording

The system MUST record every batch stock adjustment in a dedicated `pharmacy_stock_adjustments` table as an immutable log.

1. The `pharmacy_stock_adjustments` table MUST include the following columns:
   - `id`: `UUID` primary key (default `gen_random_uuid()`)
   - `inventory_id`: `UUID` referencing `pharmacy_inventory(id)` ON DELETE CASCADE
   - `product_id`: `UUID` referencing `pharmacy_products(id)` ON DELETE CASCADE
   - `batch_number`: `TEXT NOT NULL`
   - `user_id`: `UUID` referencing `auth.users(id)` ON DELETE SET NULL
   - `reason`: `TEXT NOT NULL` constrained to one of:
     - `'physical_count'` (Conteo Físico)
     - `'breakage'` (Rotura / Daño)
     - `'loss'` (Pérdida / Extravío)
     - `'expired'` (Vencimiento)
     - `'correction'` (Corrección Administrativa)
     - `'other'` (Otro)
   - `previous_quantity`: `INTEGER NOT NULL`
   - `new_quantity`: `INTEGER NOT NULL CHECK (new_quantity >= 0)`
   - `quantity_delta`: `INTEGER NOT NULL`
   - `notes`: `TEXT` nullable
   - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
2. Row Level Security (RLS) MUST be enabled on `pharmacy_stock_adjustments`.
3. Read access (`SELECT`) and insert access (`INSERT`) MUST be restricted to authenticated administrative roles.
4. Update (`UPDATE`) and deletion (`DELETE`) policies MUST NOT be granted to any user roles to preserve audit log immutability.

#### Scenario: Invalid reason classification rejected
- GIVEN a stock adjustment request targeting batch `inv-1`
- WHEN the database receives an adjustment with `reason: 'unauthorized_reason'`
- THEN the check constraint on `reason` MUST reject the row insertion and abort the adjustment

#### Scenario: Audit records remain immutable against client modifications
- GIVEN an existing adjustment record with ID `adj-1` in `pharmacy_stock_adjustments`
- WHEN an authenticated client attempts an `UPDATE` or `DELETE` query targeting `adj-1`
- THEN the database RLS policies MUST deny the operation

---

### Requirement: Domain Models and Repository Operations

The frontend domain types and `PharmacyRepository` MUST provide typed contracts and data access methods for executing adjustments and querying historical records.

1. `src/types.ts` MUST define:
   - `StockAdjustmentReason`: `'physical_count' | 'breakage' | 'loss' | 'expired' | 'correction' | 'other'`
   - `PharmacyStockAdjustment`: interface containing `id`, `inventoryId`, `productId`, `batchNumber`, `userId`, `reason`, `previousQuantity`, `newQuantity`, `quantityDelta`, `notes`, and `createdAt`
   - `AdjustBatchStockPayload`: interface containing `inventoryId`, `newQuantity`, `reason`, `notes?`, and `userId?`
2. `PharmacyRepository.adjustStock(payload: AdjustBatchStockPayload)` MUST:
   - Call the `adjust_pharmacy_batch_stock` RPC on Supabase
   - Map snake_case database response properties to camelCase `PharmacyStockAdjustment`
   - Throw a descriptive error if the RPC call fails
3. `PharmacyRepository.getStockAdjustments(filters?: { inventoryId?: string; productId?: string })` MUST:
   - Query `pharmacy_stock_adjustments`
   - Apply filter `eq('inventory_id', filters.inventoryId)` when `inventoryId` is provided
   - Apply filter `eq('product_id', filters.productId)` when `productId` is provided
   - Order results by `created_at` descending (`ascending: false`)
   - Map returned rows to `PharmacyStockAdjustment[]`

#### Scenario: Successful repository adjustment call
- GIVEN an `AdjustBatchStockPayload` with `inventoryId: 'inv-1'`, `newQuantity: 30`, `reason: 'loss'`, `notes: 'Diferencia de inventario'`
- WHEN `pharmacyRepository.adjustStock(payload)` is invoked
- THEN it executes the `adjust_pharmacy_batch_stock` RPC with the mapped parameters
- AND returns a resolved `PharmacyStockAdjustment` object with camelCase fields

#### Scenario: Repository handling RPC failure
- GIVEN the database RPC throws an error due to invalid quantity or network disconnection
- WHEN `pharmacyRepository.adjustStock(...)` is called
- THEN the method MUST catch and propagate the error to the caller without swallowing it silently

---

### Requirement: Querying and Filtering Audit History

The system MUST allow administrative users to retrieve and filter stock adjustment history by product ID or specific inventory batch ID.

1. When querying by `productId`, the repository MUST return all adjustments for all batches associated with that product.
2. When querying by `inventoryId`, the repository MUST return only adjustments associated with that specific batch record.
3. If no filters are passed, the repository MUST return the global list of pharmacy stock adjustments ordered chronologically descending.

#### Scenario: Query adjustment history for a specific batch
- GIVEN batch `inv-1` has 3 historical adjustments and batch `inv-2` has 2 adjustments
- WHEN `pharmacyRepository.getStockAdjustments({ inventoryId: 'inv-1' })` is called
- THEN exactly 3 records are returned
- AND all returned records have `inventoryId === 'inv-1'`
- AND the records are ordered from most recent `createdAt` to oldest

#### Scenario: Query adjustment history for a product
- GIVEN product `prod-1` has 2 batches (`inv-1` and `inv-2`) with a total of 5 adjustments across them
- WHEN `pharmacyRepository.getStockAdjustments({ productId: 'prod-1' })` is called
- THEN 5 records are returned, ordered by `createdAt` descending

---

### Requirement: UI Interaction - Adjust Stock Modal

`PharmacyInventoryAdmin.tsx` MUST provide an intuitive modal dialog for adjusting batch stock quantities with real-time feedback and validation.

1. Each batch row in the "Stock y Lotes" tab MUST render an action button: "Ajustar Stock".
2. Clicking "Ajustar Stock" MUST open the **Adjust Stock Modal** pre-populated with:
   - Product Name and Active Ingredient
   - Batch Number and Expiration Date
   - Current Stock Quantity (read-only reference)
3. The modal MUST provide an input field for `new_quantity`:
   - Defaulting to the batch's current stock quantity
   - Enforcing a minimum value of `0`
   - Disallowing negative values and non-integer inputs
4. The modal MUST display a dynamic, live `quantity_delta` indicator:
   - When `new_quantity > current_quantity`: Displays `+{delta} un.` in emerald/green color styling
   - When `new_quantity < current_quantity`: Displays `-{delta} un.` in rose/red color styling
   - When `new_quantity === current_quantity`: Displays `0 un.` in slate/neutral color styling
5. The modal MUST provide a selector for `reason` with human-readable Spanish labels:
   - "Conteo Físico" (`physical_count`)
   - "Rotura / Daño" (`breakage`)
   - "Pérdida / Extravío" (`loss`)
   - "Vencimiento" (`expired`)
   - "Corrección Administrativa" (`correction`)
   - "Otro" (`other`)
6. The modal MUST provide an optional textarea for `notes`.
7. Submitting the modal MUST:
   - Disable submission buttons and display a loading indicator during execution
   - Invoke `pharmacyRepository.adjustStock(...)` with the user input
   - On success: display a success notification, close the modal, and refresh the inventory batch list and product total stock
   - On error: display an alert with the error message and keep the modal open for correction

#### Scenario: User adjusts batch stock in UI with live delta preview
- GIVEN the admin opens the Adjust Stock Modal for batch `LOT-2026-X` with current stock `50`
- WHEN the admin enters `42` into the new quantity input
- THEN the UI displays a live delta badge indicating `-8 un.` in red/rose styling
- AND when the admin selects reason "Rotura / Daño" and clicks "Confirmar Ajuste"
- THEN `pharmacyRepository.adjustStock` is executed with `newQuantity: 42`, `reason: 'breakage'`
- AND upon completion, the batch stock in the table updates to `42 un.` and the modal closes

#### Scenario: Client-side validation blocks negative input
- GIVEN the admin is inside the Adjust Stock Modal
- WHEN the admin enters `-5` or an invalid non-numeric string
- THEN the submit button MUST be disabled or form submission MUST be prevented with a clear validation error

---

### Requirement: UI Interaction - Adjustment History Modal

`PharmacyInventoryAdmin.tsx` MUST provide a modal dialog to inspect the chronological audit history for a batch or product.

1. Each batch row in the "Stock y Lotes" tab MUST render an action button: "Historial de Ajustes".
2. Clicking "Historial de Ajustes" MUST open the **Adjustment History Modal** displaying the audit log for the selected batch.
3. The modal MUST display a chronological table/timeline containing:
   - Date and time of adjustment (formatted locally)
   - Reason badge with distinct visual color coding:
     - `physical_count`: Blue/Cyan badge
     - `breakage`: Amber/Orange badge
     - `loss`: Rose/Red badge
     - `expired`: Purple badge
     - `correction`: Teal/Emerald badge
     - `other`: Slate/Gray badge
   - Previous Quantity (`previousQuantity`)
   - New Quantity (`newQuantity`)
   - Quantity Delta (`quantityDelta`) with `+` or `-` prefix and color coding
   - Notes / Comments (or a placeholder if empty)
   - User ID or user identifier who executed the change
4. When loading records, the modal MUST show a loading state.
5. If no adjustments exist for the batch, the modal MUST display an empty state: "No hay ajustes de stock registrados para este lote".

#### Scenario: Admin views audit history of a batch
- GIVEN batch `LOT-2026-X` has 2 historical adjustments (a `physical_count` +10 and a `breakage` -2)
- WHEN the admin clicks "Historial de Ajustes" for that batch
- THEN the History Modal opens and loads the adjustments from `pharmacyRepository.getStockAdjustments`
- AND displays 2 rows with their respective reason badges, previous/new quantities, delta badges (`+10`, `-2`), dates, and notes

#### Scenario: Admin views empty history state
- GIVEN a newly created batch with no adjustments
- WHEN the admin clicks "Historial de Ajustes"
- THEN the modal displays the empty state message without errors

---

## Out of Scope

- Automated cycle counting schedules or recurring physical count tasks.
- Integration with fiscal/tax authorities or third-party enterprise ERP systems.
- Patient refund return workflows (handled via pharmacy order cancellation workflows).
