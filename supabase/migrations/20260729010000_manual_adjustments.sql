-- Migration to allow manual adjustments and standalone payments (e.g. cash) for affiliates

CREATE OR REPLACE FUNCTION public.post_manual_adjustment(
  p_entity_id UUID,
  p_amount DECIMAL,
  p_type TEXT, -- 'payment' or 'adjustment' or 'charge'
  p_external_ref TEXT,
  p_source TEXT
)
RETURNS public.affiliate_account_movements
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_movement public.affiliate_account_movements;
BEGIN
  IF p_external_ref IS NULL OR p_external_ref = '' THEN
    RAISE EXCEPTION 'post_manual_adjustment requiere un external_ref no vacio para garantizar idempotencia.';
  END IF;

  IF p_type NOT IN ('payment', 'adjustment', 'charge') THEN
    RAISE EXCEPTION 'Tipo invalido. Debe ser payment, adjustment o charge.';
  END IF;

  INSERT INTO public.affiliate_account_movements (
    entity_type, entity_id, type, amount, external_ref, invoice_id, source
  )
  VALUES (
    'affiliate', p_entity_id, p_type::text, p_amount, p_external_ref, NULL, p_source
  )
  ON CONFLICT (external_ref) DO UPDATE
    SET updated_at = NOW()
  RETURNING * INTO v_movement;

  RETURN v_movement;
END;
$$;

COMMENT ON FUNCTION public.post_manual_adjustment IS 'Atomic, idempotent (by external_ref) movement posting for direct affiliates without linking to an invoice. Used for manual adjustments and cash payments.';

REVOKE EXECUTE ON FUNCTION public.post_manual_adjustment(UUID, DECIMAL, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_manual_adjustment(UUID, DECIMAL, TEXT, TEXT, TEXT) TO authenticated;
