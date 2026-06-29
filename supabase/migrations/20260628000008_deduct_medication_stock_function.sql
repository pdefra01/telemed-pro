-- Migration: Stored procedure to deduct medication stock atomically with role validation
-- Description: Decrements stock_quantity in pharmacy_inventory for a given product_id across available batches.

CREATE OR REPLACE FUNCTION public.deduct_medication_stock(
  p_product_id UUID,
  p_quantity INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch RECORD;
  v_remaining INT := p_quantity;
  v_role TEXT;
BEGIN
  -- Security check: Verify caller has doctor or admin role
  v_role := auth.jwt() ->> 'role';
  IF v_role IS NULL OR v_role NOT IN ('doctor', 'admin') THEN
    RAISE EXCEPTION 'Acceso denegado: Solo médicos o administradores pueden descontar stock de farmacia.';
  END IF;

  IF p_quantity <= 0 THEN
    RETURN TRUE;
  END IF;

  FOR v_batch IN 
    SELECT id, stock_quantity 
    FROM public.pharmacy_inventory 
    WHERE product_id = p_product_id AND stock_quantity > 0 AND expiration_date >= CURRENT_DATE
    ORDER BY expiration_date ASC
  LOOP
    IF v_batch.stock_quantity >= v_remaining THEN
      UPDATE public.pharmacy_inventory
      SET stock_quantity = stock_quantity - v_remaining
      WHERE id = v_batch.id;
      
      v_remaining := 0;
      EXIT;
    ELSE
      v_remaining := v_remaining - v_batch.stock_quantity;
      UPDATE public.pharmacy_inventory
      SET stock_quantity = 0
      WHERE id = v_batch.id;
    END IF;
  END LOOP;

  RETURN (v_remaining = 0);
END;
$$;

COMMENT ON FUNCTION public.deduct_medication_stock IS 'Descuenta atómicamente el stock de medicamentos de los lotes activos según su fecha de vencimiento (FIFO) previa validación de rol.';
