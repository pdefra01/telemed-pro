-- Migration: Pharmacy ERP Suppliers, Supplier Orders and Checking Accounts
-- Description: Adds min stock thresholds, suppliers table, supplier purchase orders and account movements ledger.

-- 1. Extend pharmacy_products with reorder thresholds
ALTER TABLE public.pharmacy_products 
ADD COLUMN IF NOT EXISTS min_stock_threshold INT NOT NULL DEFAULT 20,
ADD COLUMN IF NOT EXISTS reorder_quantity INT NOT NULL DEFAULT 100;

-- 2. Create pharmacy_suppliers table
CREATE TABLE IF NOT EXISTS public.pharmacy_suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  cuit            TEXT NOT NULL,
  contact_email   TEXT NOT NULL,
  phone           TEXT,
  current_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. Create pharmacy_supplier_orders table
CREATE TABLE IF NOT EXISTS public.pharmacy_supplier_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id      UUID NOT NULL REFERENCES public.pharmacy_suppliers(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE CASCADE,
  quantity_ordered INT NOT NULL CHECK (quantity_ordered > 0),
  unit_cost        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cost       NUMERIC(10,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'received', 'cancelled')),
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- 4. Create supplier_account_movements table
CREATE TABLE IF NOT EXISTS public.supplier_account_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.pharmacy_suppliers(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES public.pharmacy_supplier_orders(id) ON DELETE SET NULL,
  type        TEXT NOT NULL CHECK (type IN ('purchase_order', 'payment')),
  amount      NUMERIC(10,2) NOT NULL,
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pharmacy_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_account_movements ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Manage suppliers" ON public.pharmacy_suppliers FOR ALL TO authenticated USING (true);
CREATE POLICY "Manage supplier orders" ON public.pharmacy_supplier_orders FOR ALL TO authenticated USING (true);
CREATE POLICY "Manage account movements" ON public.supplier_account_movements FOR ALL TO authenticated USING (true);

-- Seed initial sample suppliers if empty
INSERT INTO public.pharmacy_suppliers (name, cuit, contact_email, phone, current_balance)
SELECT 'Droguería Monza S.A.', '30-71234567-8', 'pedidos@drogueriamonza.com.ar', '011-4555-8800', 125000.00
WHERE NOT EXISTS (SELECT 1 FROM public.pharmacy_suppliers WHERE cuit = '30-71234567-8');

INSERT INTO public.pharmacy_suppliers (name, cuit, contact_email, phone, current_balance)
SELECT 'Laboratorios Central Farma', '30-68999111-4', 'ventas@centralfarma.com.ar', '011-4890-1200', 45000.00
WHERE NOT EXISTS (SELECT 1 FROM public.pharmacy_suppliers WHERE cuit = '30-68999111-4');
