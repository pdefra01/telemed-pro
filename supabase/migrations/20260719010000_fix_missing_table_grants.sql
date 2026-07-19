-- Description: Several tables were created with RLS policies but without the base
-- GRANT statements that Postgres requires before RLS is ever evaluated. This left
-- `authenticated` and `service_role` unable to touch these tables at all (e.g.
-- POST /api/create-advisor failing with "permission denied for table producers"),
-- even though their RLS policies were correctly defined.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.adhesion_requests,
  public.agreements,
  public.announcement_reads,
  public.announcements,
  public.appointments,
  public.campaign_actions,
  public.campaign_assignments,
  public.campaigns,
  public.contact_verifications,
  public.doctor_work_shifts,
  public.family_groups,
  public.family_members,
  public.invoices,
  public.legal_acceptances,
  public.legal_terms,
  public.office_locations,
  public.pharmacy_deliveries,
  public.pharmacy_inventory,
  public.pharmacy_order_items,
  public.pharmacy_orders,
  public.pharmacy_products,
  public.pharmacy_supplier_orders,
  public.pharmacy_suppliers,
  public.plans,
  public.producers,
  public.supplier_account_movements,
  public.survey_questions,
  public.survey_responses,
  public.survey_templates,
  public.system_settings,
  public.tax_configurations
TO authenticated, service_role;

-- These two tables have RLS policies explicitly scoped to `anon` (public adhesion
-- form submission, and the email/phone OTP verification flow before login).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.adhesion_requests,
  public.contact_verifications
TO anon;

-- operating_expenses only had `authenticated` granted; the admin financial
-- endpoints also use the service-role admin client.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.operating_expenses TO service_role;
