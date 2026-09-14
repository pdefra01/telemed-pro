-- Migration: Add purchase price (cost) column to pharmacy_products
--
-- Persists the actual purchase/cost price of a pharmacy product so it can be
-- captured and edited from the admin catalog form. Nullable because existing
-- rows have no recorded cost yet; the Pareto/reorder profitability analysis
-- in PharmacyInventoryAdmin continues to estimate cost separately and is not
-- affected by this column.

ALTER TABLE public.pharmacy_products
  ADD COLUMN purchase_price NUMERIC(10,2) CHECK (purchase_price >= 0);

COMMENT ON COLUMN public.pharmacy_products.purchase_price IS 'Precio de compra (costo) del producto, cargado manualmente en el catálogo. Nulo cuando aún no fue registrado.';
