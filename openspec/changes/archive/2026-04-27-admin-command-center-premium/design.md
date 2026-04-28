# Design: Admin Command Center Premium (OCC)

## 1. Data Architecture

### 1.1. Schema Changes (Supabase)

#### [NEW] Table: `agreements`
- `id`: uuid (PK)
- `name`: text (Razón Social)
- `cuit`: text
- `billing_email`: text
- `tax_category`: text (e.g., 'Responsable Inscripto')
- `base_plan_id`: uuid (FK -> plans.id)

#### [NEW] Table: `tax_configurations`
- `id`: uuid (PK)
- `name`: text ('IVA', 'IIBB', etc.)
- `rate`: decimal
- `scope`: text ('national', 'local')

#### [NEW] Table: `invoices`
- `id`: uuid (PK)
- `entity_type`: text ('affiliate', 'agreement')
- `entity_id`: uuid (FK to profiles or agreements)
- `period`: text
- `net_amount`: decimal
- `tax_amount`: decimal
- `total_amount`: decimal
- `status`: text ('issued', 'paid', 'cancelled')

## 2. Component Architecture

### 2.1. Billing Center (`OCCBilling.tsx`)
- **`InvoiceGrid.tsx`**: View and manage issued invoices.
- **`TaxSettings.tsx`**: Configuration of tax rates.
- **`AccountingDashboard.tsx`**: Summary of billing and export triggers.

## 3. Logic & Services

### 3.1. `BillingEngine.ts`
- `generateInvoice(entityId, type)`: Calculates net + taxes and creates a record.
- `calculateTaxes(amount)`: Iterates over active `tax_configurations`.

### 3.2. `AccountingService.ts`
- `generateCSVExport(startDate, endDate)`: Queries the `invoices` table and formats it for accounting software.
