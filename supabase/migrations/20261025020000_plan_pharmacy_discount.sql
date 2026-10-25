-- Migration: plan-driven pharmacy discount (GitHub #33, odd/tasks/plan-pharmacy-discount.md T1)
-- The pharmacy discount used to be a flat, unconditional 40% hardcoded in
-- create_pharmacy_order. It now comes from the buyer's plan:
--   - plans.pharmacy_discount_percent (0-100, 0 = no discount). Existing plans
--     start at 40 so nothing changes for current affiliates.
--   - pharmacy_discount_percent_for(profile): the plan percent of an active
--     profile with an active plan; a family-group profile without its own plan
--     uses the titular's plan; anything else is 0. Internal only.
--   - get_my_pharmacy_discount_percent(): the caller's own percent, for the
--     catalog to display.
--   - create_pharmacy_order applies that percent server-side (never caller input).

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS pharmacy_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 40
  CONSTRAINT plans_pharmacy_discount_percent_range CHECK (pharmacy_discount_percent BETWEEN 0 AND 100);

COMMENT ON COLUMN public.plans.pharmacy_discount_percent IS 'Pharmacy discount (%) for affiliates on this plan, 0-100. 0 = no discount.';

CREATE OR REPLACE FUNCTION public.pharmacy_discount_percent_for(p_profile_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT pl.pharmacy_discount_percent
    FROM public.profiles p
    LEFT JOIN public.family_groups fg ON fg.id = p.family_group_id
    JOIN public.profiles holder
      ON holder.id = CASE WHEN p.plan_id IS NOT NULL THEN p.id ELSE fg.primary_affiliate_id END
    JOIN public.plans pl ON pl.id = holder.plan_id
    WHERE p.id = p_profile_id
      AND p.is_active IS NOT FALSE
      AND holder.is_active IS NOT FALSE
      AND holder.plan_status = 'active'
  ), 0);
$$;

COMMENT ON FUNCTION public.pharmacy_discount_percent_for(UUID) IS 'Pharmacy discount (%) a profile is entitled to: its active plan, else its family titular''s active plan, else 0. Internal (no client grant).';

REVOKE EXECUTE ON FUNCTION public.pharmacy_discount_percent_for(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_pharmacy_discount_percent()
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.pharmacy_discount_percent_for(auth.uid());
$$;

COMMENT ON FUNCTION public.get_my_pharmacy_discount_percent() IS 'The calling user''s pharmacy discount (%), for display. The checkout recomputes it server-side.';

REVOKE EXECUTE ON FUNCTION public.get_my_pharmacy_discount_percent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pharmacy_discount_percent() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_pharmacy_order(
  p_patient_id UUID,
  p_items JSONB, -- [{ "product_id": "uuid", "quantity": int }, ...]
  p_prescription_id UUID DEFAULT NULL,
  p_delivery_address TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id       UUID;
  v_item           RECORD;
  v_unit_price     NUMERIC(10,2);
  v_subtotal       NUMERIC(10,2) := 0;
  v_discount       NUMERIC(10,2) := 0;
  v_total          NUMERIC(10,2) := 0;
  v_remaining      INT;
  v_batch          RECORD;
  v_clean_address  TEXT;
BEGIN
  -- Solo el propio paciente autenticado puede crear su orden.
  IF auth.uid() IS NULL OR auth.uid() <> p_patient_id THEN
    RAISE EXCEPTION 'Acceso denegado: solo el propio paciente puede crear su orden.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La orden no contiene ítems.';
  END IF;

  v_clean_address := btrim(COALESCE(p_delivery_address, ''));
  IF v_clean_address = '' THEN
    RAISE EXCEPTION 'La dirección de entrega es obligatoria.';
  END IF;

  -- 1. Validar cada ítem contra el catálogo real y recomputar el subtotal server-side.
  --    Cualquier product_id que no exista como fila real de pharmacy_products
  --    (por ejemplo, un id sintético fabricado en el cliente) aborta toda la transacción.
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT)
  LOOP
    IF v_item.product_id IS NULL OR v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Ítem de orden inválido.';
    END IF;

    SELECT price INTO v_unit_price FROM public.pharmacy_products WHERE id = v_item.product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto % no existe en el catálogo.', v_item.product_id;
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * v_item.quantity);
  END LOOP;

  -- La tasa de descuento sale del plan del paciente (pharmacy_discount_percent_for),
  -- calculada en el servidor: nunca puede ser influenciada por el llamador (evita que
  -- un paciente autenticado invoque la RPC directamente con una tasa arbitraria).
  v_discount := ROUND(v_subtotal * public.pharmacy_discount_percent_for(p_patient_id) / 100, 2);
  v_total := v_subtotal - v_discount;

  -- 2. Descontar stock atómicamente por ítem, bloqueando los lotes (FOR UPDATE) para
  --    evitar lost updates entre checkouts concurrentes. Si el stock total disponible
  --    no alcanza, se aborta toda la transacción (ninguna orden, ítem o delivery se crea).
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT)
  LOOP
    v_remaining := v_item.quantity;

    FOR v_batch IN
      SELECT id, stock_quantity
      FROM public.pharmacy_inventory
      WHERE product_id = v_item.product_id AND stock_quantity > 0
      ORDER BY expiration_date ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      IF v_batch.stock_quantity >= v_remaining THEN
        UPDATE public.pharmacy_inventory
        SET stock_quantity = stock_quantity - v_remaining
        WHERE id = v_batch.id;
        v_remaining := 0;
      ELSE
        v_remaining := v_remaining - v_batch.stock_quantity;
        UPDATE public.pharmacy_inventory
        SET stock_quantity = 0
        WHERE id = v_batch.id;
      END IF;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto %.', v_item.product_id;
    END IF;
  END LOOP;

  -- 3. Insertar la cabecera de la orden con los montos recomputados en el servidor.
  INSERT INTO public.pharmacy_orders (
    patient_id, prescription_id, status, subtotal, coverage_discount, total, delivery_address
  )
  VALUES (
    p_patient_id, p_prescription_id, 'paid', v_subtotal, v_discount, v_total, v_clean_address
  )
  RETURNING id INTO v_order_id;

  -- 4. Insertar los ítems de la orden con el precio real del catálogo (no el del cliente).
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT)
  LOOP
    SELECT price INTO v_unit_price FROM public.pharmacy_products WHERE id = v_item.product_id;

    INSERT INTO public.pharmacy_order_items (order_id, product_id, quantity, unit_price)
    VALUES (v_order_id, v_item.product_id, v_item.quantity, v_unit_price);
  END LOOP;

  -- 5. Si la compra proviene de una receta electrónica, verificar que la receta
  --    pertenece realmente al paciente autenticado antes de marcarla como
  --    dispensada. SECURITY DEFINER evita el RLS de la tabla prescriptions, así
  --    que sin este chequeo cualquier paciente podría pasar el id de una receta
  --    ajena y dispensarla unilateralmente. Un id inexistente o ajeno aborta toda
  --    la transacción (ninguna orden/ítem/stock queda persistido).
  IF p_prescription_id IS NOT NULL THEN
    PERFORM 1 FROM public.prescriptions
    WHERE id = p_prescription_id AND patient_id = p_patient_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La receta % no existe o no pertenece al paciente.', p_prescription_id;
    END IF;

    UPDATE public.prescriptions SET status = 'dispensed' WHERE id = p_prescription_id;
  END IF;

  -- 6. Crear el registro de cadetería asignado.
  INSERT INTO public.pharmacy_deliveries (
    order_id, courier_name, courier_phone, tracking_status, current_lat, current_lng
  )
  VALUES (
    v_order_id, 'Marcos Benítez (Cadete MEDINEX)', '+54 387 512 3456', 'assigned', -24.7859, -65.4117
  );

  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_pharmacy_order IS 'Crea atómicamente una orden de farmacia: recomputa montos desde el catálogo real y aplica el descuento de farmacia del plan del paciente, descuenta stock con bloqueo de fila, y crea orden/ítems/delivery en una sola transacción. Aborta por completo (rollback) ante stock insuficiente o ítems inválidos.';
REVOKE EXECUTE ON FUNCTION public.create_pharmacy_order(UUID, JSONB, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pharmacy_order(UUID, JSONB, UUID, TEXT) TO authenticated;
