-- Fix [A]: Remove DEFAULT from receipt_number so historical rows don't consume sequence numbers.
-- Only the RPC explicitly assigns a number when inserting new movements.
-- Also resets any contamination from existing rows and restarts the sequence.

-- Step 1: Drop the default so future INSERTs without explicit value get NULL
ALTER TABLE public.affiliate_account_movements
  ALTER COLUMN receipt_number DROP DEFAULT;

ALTER TABLE public.invoices
  ALTER COLUMN invoice_number DROP DEFAULT;

-- Step 2: Null out any rows that were auto-numbered when the column was added (contamination)
UPDATE public.affiliate_account_movements SET receipt_number = NULL WHERE receipt_number IS NOT NULL;
UPDATE public.invoices SET invoice_number = NULL WHERE invoice_number IS NOT NULL;

-- Step 3: Restart both sequences from 1
ALTER SEQUENCE IF EXISTS public.affiliate_account_movements_receipt_number_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.invoices_invoice_number_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.receipt_number_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.invoice_number_seq RESTART WITH 1;

-- Fix the post_manual_adjustment RPC to assign receipt_number from the sequence
-- only for 'payment' and 'adjustment' types (credits that generate a receipt).
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
  v_receipt_number INTEGER;
BEGIN
  IF p_external_ref IS NULL OR p_external_ref = '' THEN
    RAISE EXCEPTION 'post_manual_adjustment requiere un external_ref no vacio para garantizar idempotencia.';
  END IF;

  IF p_type NOT IN ('payment', 'adjustment', 'charge') THEN
    RAISE EXCEPTION 'Tipo invalido. Debe ser payment, adjustment o charge.';
  END IF;

  SELECT family_group_id INTO v_family_group_id FROM public.profiles WHERE id = p_entity_id;

  -- Assign a correlative receipt number only for credit movements (payment/adjustment)
  IF p_type IN ('payment', 'adjustment') THEN
    v_receipt_number := nextval('public.receipt_number_seq');
  END IF;

  INSERT INTO public.affiliate_account_movements (
    entity_type, entity_id, family_group_id, type, amount, external_ref, invoice_id, source, created_by, receipt_number
  )
  VALUES (
    'affiliate', p_entity_id, v_family_group_id, p_type::text, p_amount, p_external_ref, NULL, p_source, auth.uid(), v_receipt_number
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

REVOKE EXECUTE ON FUNCTION public.post_manual_adjustment(UUID, DECIMAL, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_manual_adjustment(UUID, DECIMAL, TEXT, TEXT, TEXT) TO authenticated;
