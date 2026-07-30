-- Fix post_manual_adjustment to fetch family_group_id and use DO NOTHING for conflict

CREATE OR REPLACE FUNCTION public.post_manual_adjustment(
  p_entity_id UUID,
  p_amount DECIMAL,
  p_type TEXT,
  p_external_ref TEXT,
  p_source TEXT
)
RETURNS public.affiliate_account_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement public.affiliate_account_movements;
  v_family_group_id UUID;
BEGIN
  IF p_external_ref IS NULL OR p_external_ref = '' THEN
    RAISE EXCEPTION 'post_manual_adjustment requiere un external_ref no vacio para garantizar idempotencia.';
  END IF;

  IF p_type NOT IN ('payment', 'adjustment', 'charge') THEN
    RAISE EXCEPTION 'Tipo invalido. Debe ser payment, adjustment o charge.';
  END IF;

  SELECT family_group_id INTO v_family_group_id FROM public.profiles WHERE id = p_entity_id;

  INSERT INTO public.affiliate_account_movements (
    entity_type, entity_id, family_group_id, type, amount, external_ref, invoice_id, source, created_by
  )
  VALUES (
    'affiliate', p_entity_id, v_family_group_id, p_type::text, p_amount, p_external_ref, NULL, p_source, auth.uid()
  )
  ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL DO NOTHING
  RETURNING * INTO v_movement;

  IF NOT FOUND THEN
    SELECT * INTO v_movement
    FROM public.affiliate_account_movements
    WHERE external_ref = p_external_ref;
  END IF;

  RETURN v_movement;
END;
$$;
