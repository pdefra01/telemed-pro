-- Migration: Fix broken admin/doctor RLS policies across the schema
-- Description: Several policies (added in 20260427000002, 20260628000001,
-- 20260628000002, 20260628000003) gate access with `auth.jwt() ->> 'role' = 'admin'`.
-- That claim is the Postgres/GoTrue session role ("authenticated"), not the
-- app-level role stored in public.user_roles/profiles — no custom access
-- token hook is configured to inject it. The condition is therefore always
-- false, silently blocking every admin (and doctor) write through these
-- policies since the tables were created. Replaced with public.is_admin(),
-- the working, recursion-free pattern already used on public.profiles.

-- 1. Doctor-role counterpart to public.is_admin()
CREATE OR REPLACE FUNCTION public.is_doctor()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'doctor'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. admin_command_center_premium (plans, agreements, family_groups, tax_configurations, invoices, system_settings)
DROP POLICY IF EXISTS "Admins have full access to plans" ON public.plans;
CREATE POLICY "Admins have full access to plans" ON public.plans FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to agreements" ON public.agreements;
CREATE POLICY "Admins have full access to agreements" ON public.agreements FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to family_groups" ON public.family_groups;
CREATE POLICY "Admins have full access to family_groups" ON public.family_groups FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to taxes" ON public.tax_configurations;
CREATE POLICY "Admins have full access to taxes" ON public.tax_configurations FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to invoices" ON public.invoices;
CREATE POLICY "Admins have full access to invoices" ON public.invoices FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to settings" ON public.system_settings;
CREATE POLICY "Admins have full access to settings" ON public.system_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3. family_members
DROP POLICY IF EXISTS "Admins full access family_members" ON public.family_members;
CREATE POLICY "Admins full access family_members" ON public.family_members FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Doctors read family_members" ON public.family_members;
CREATE POLICY "Doctors read family_members" ON public.family_members FOR SELECT TO authenticated USING (public.is_doctor());

-- 4. survey_campaigns
DROP POLICY IF EXISTS "Admins full access survey_templates" ON public.survey_templates;
CREATE POLICY "Admins full access survey_templates" ON public.survey_templates FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access survey_questions" ON public.survey_questions;
CREATE POLICY "Admins full access survey_questions" ON public.survey_questions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access campaigns" ON public.campaigns;
CREATE POLICY "Admins full access campaigns" ON public.campaigns FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access campaign_actions" ON public.campaign_actions;
CREATE POLICY "Admins full access campaign_actions" ON public.campaign_actions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access campaign_assignments" ON public.campaign_assignments;
CREATE POLICY "Admins full access campaign_assignments" ON public.campaign_assignments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access survey_responses" ON public.survey_responses;
CREATE POLICY "Admins full access survey_responses" ON public.survey_responses FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. pharmacy_and_delivery
DROP POLICY IF EXISTS "Admins manage products" ON public.pharmacy_products;
CREATE POLICY "Admins manage products" ON public.pharmacy_products FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage inventory" ON public.pharmacy_inventory;
CREATE POLICY "Admins manage inventory" ON public.pharmacy_inventory FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Patients view own orders" ON public.pharmacy_orders;
CREATE POLICY "Patients view own orders" ON public.pharmacy_orders FOR SELECT TO authenticated USING (patient_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins update orders" ON public.pharmacy_orders;
CREATE POLICY "Admins update orders" ON public.pharmacy_orders FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Manage deliveries" ON public.pharmacy_deliveries;
CREATE POLICY "Manage deliveries" ON public.pharmacy_deliveries FOR ALL TO authenticated USING (public.is_admin() OR public.is_doctor()) WITH CHECK (public.is_admin() OR public.is_doctor());

-- 6. deduct_medication_stock: same broken claim check inside a SECURITY DEFINER function —
-- this made the function raise "Acceso denegado" for every real caller.
CREATE OR REPLACE FUNCTION public.deduct_medication_stock(
  p_product_id UUID,
  p_quantity INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch RECORD;
  v_remaining INT := p_quantity;
BEGIN
  IF NOT (public.is_admin() OR public.is_doctor()) THEN
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
