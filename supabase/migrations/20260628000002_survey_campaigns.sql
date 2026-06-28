-- Migration: Create Survey & Census Campaigns Tables
-- Description: Enables dynamic health surveys, censuses, and automated action triggers.

CREATE TABLE IF NOT EXISTS public.survey_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.survey_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.survey_templates(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('single_choice', 'multiple_choice', 'boolean', 'numeric', 'text')),
  options     JSONB, -- e.g. ["Opción 1", "Opción 2"]
  is_required BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  template_id     UUID NOT NULL REFERENCES public.survey_templates(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  target_group    TEXT NOT NULL DEFAULT 'all' CHECK (target_group IN ('all', 'agreement', 'risk_group')),
  target_group_id TEXT,
  start_date      TIMESTAMPTZ DEFAULT now(),
  end_date        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_actions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id        UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  question_id        UUID NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  condition_operator TEXT NOT NULL CHECK (condition_operator IN ('equals', 'greater_than', 'less_than', 'contains')),
  condition_value    TEXT NOT NULL,
  action_type        TEXT NOT NULL CHECK (action_type IN ('medical_alert', 'tag_risk_group', 'recommend_appointment')),
  action_payload     JSONB
);

CREATE TABLE IF NOT EXISTS public.campaign_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  assigned_at  TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(campaign_id, patient_id)
);

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  UUID NOT NULL REFERENCES public.campaign_assignments(id) ON DELETE CASCADE,
  question_id    UUID NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  patient_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response_value TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- Admins full access policies
CREATE POLICY "Admins full access survey_templates" ON public.survey_templates FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admins full access survey_questions" ON public.survey_questions FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admins full access campaigns" ON public.campaigns FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admins full access campaign_actions" ON public.campaign_actions FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admins full access campaign_assignments" ON public.campaign_assignments FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admins full access survey_responses" ON public.survey_responses FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');

-- Patients access policies
CREATE POLICY "Patients view templates" ON public.survey_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Patients view questions" ON public.survey_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Patients view active campaigns" ON public.campaigns FOR SELECT TO authenticated USING (status = 'active');
CREATE POLICY "Patients view campaign_actions" ON public.campaign_actions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Patients manage own assignments" ON public.campaign_assignments FOR ALL TO authenticated USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
CREATE POLICY "Patients insert own responses" ON public.survey_responses FOR ALL TO authenticated USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
