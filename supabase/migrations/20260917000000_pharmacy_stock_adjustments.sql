-- Migration: Pharmacy Stock Adjustments & Immutable Audit Log
-- Creates pharmacy_stock_adjustments table, indexes, RLS policies, and atomic RPC adjust_pharmacy_batch_stock

-- 1. Create table for immutable pharmacy inventory adjustments audit trail
CREATE TABLE IF NOT EXISTS public.pharmacy_stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES public.pharmacy_inventory(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (
    reason IN (
      'physical_count',
      'breakage',
      'loss',
      'expired',
      'correction',
      'other'
    )
  ),
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL CHECK (new_quantity >= 0),
  quantity_delta INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Comments for schema documentation
COMMENT ON TABLE public.pharmacy_stock_adjustments IS 'Registro inmutable de auditoría para ajustes de stock en lotes de farmacia.';
COMMENT ON COLUMN public.pharmacy_stock_adjustments.reason IS 'Motivo clasificado: physical_count, breakage, loss, expired, correction, other.';
COMMENT ON COLUMN public.pharmacy_stock_adjustments.quantity_delta IS 'Diferencia calculada (new_quantity - previous_quantity). Positivo para ingresos, negativo para egresos.';

-- 3. Indexes for efficient querying by inventory batch, product, and creation date
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_adjustments_inventory_id 
  ON public.pharmacy_stock_adjustments(inventory_id);

CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_adjustments_product_id 
  ON public.pharmacy_stock_adjustments(product_id);

CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_adjustments_created_at 
  ON public.pharmacy_stock_adjustments(created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.pharmacy_stock_adjustments ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: Admins can view and insert, no update or delete policies (immutable audit log)
DROP POLICY IF EXISTS "Admins can view pharmacy stock adjustments" ON public.pharmacy_stock_adjustments;
CREATE POLICY "Admins can view pharmacy stock adjustments"
  ON public.pharmacy_stock_adjustments
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert pharmacy stock adjustments" ON public.pharmacy_stock_adjustments;
CREATE POLICY "Admins can insert pharmacy stock adjustments"
  ON public.pharmacy_stock_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 6. Atomic RPC Function to adjust batch stock
CREATE OR REPLACE FUNCTION public.adjust_pharmacy_batch_stock(
  p_inventory_id UUID,
  p_new_quantity INTEGER,
  p_reason TEXT,
  p_notes TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS public.pharmacy_stock_adjustments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory RECORD;
  v_adjustment public.pharmacy_stock_adjustments%ROWTYPE;
  v_delta INTEGER;
  v_actor_id UUID;
BEGIN
  -- 1. Security Check: Caller must be an admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Solo los administradores pueden realizar ajustes de stock.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validation: New quantity cannot be negative
  IF p_new_quantity < 0 THEN
    RAISE EXCEPTION 'La cantidad de stock no puede ser negativa (recibido: %).', p_new_quantity
      USING ERRCODE = '22003';
  END IF;

  -- 3. Validation: Reason must match allowed check constraint
  IF p_reason NOT IN ('physical_count', 'breakage', 'loss', 'expired', 'correction', 'other') THEN
    RAISE EXCEPTION 'Motivo de ajuste inválido: "%". Motivos permitidos: physical_count, breakage, loss, expired, correction, other.', p_reason
      USING ERRCODE = '22023';
  END IF;

  -- 4. Concurrency lock: Lock the target inventory row
  SELECT id, product_id, batch_number, stock_quantity
  INTO v_inventory
  FROM public.pharmacy_inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  -- 5. Validation: Ensure the batch exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de inventario con ID "%" no encontrado.', p_inventory_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 6. Calculate Delta
  v_delta := p_new_quantity - v_inventory.stock_quantity;

  -- 7. Update inventory stock
  UPDATE public.pharmacy_inventory
  SET stock_quantity = p_new_quantity
  WHERE id = p_inventory_id;

  -- 8. Resolve actor user_id
  v_actor_id := COALESCE(p_user_id, auth.uid());

  -- 9. Insert audit record into pharmacy_stock_adjustments
  INSERT INTO public.pharmacy_stock_adjustments (
    inventory_id,
    product_id,
    batch_number,
    user_id,
    reason,
    previous_quantity,
    new_quantity,
    quantity_delta,
    notes,
    created_at
  ) VALUES (
    v_inventory.id,
    v_inventory.product_id,
    v_inventory.batch_number,
    v_actor_id,
    p_reason,
    v_inventory.stock_quantity,
    p_new_quantity,
    v_delta,
    p_notes,
    NOW()
  )
  RETURNING * INTO v_adjustment;

  -- 10. Return the inserted audit record
  RETURN v_adjustment;
END;
$$;

COMMENT ON FUNCTION public.adjust_pharmacy_batch_stock IS 'Ajusta atómicamente el stock de un lote de farmacia con bloqueo de fila y genera el registro inmutable de auditoría.';
