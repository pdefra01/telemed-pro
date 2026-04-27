-- 1. Tablas de Membresías y Planes
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    monthly_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    bonified_consultations INTEGER NOT NULL DEFAULT 0,
    max_family_members INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Convenios (Empresas)
CREATE TABLE IF NOT EXISTS public.agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- Razón Social
    cuit TEXT UNIQUE,
    billing_email TEXT,
    tax_category TEXT, -- Responsable Inscripto, Monotributista, etc.
    base_plan_id UUID REFERENCES public.plans(id),
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Grupos Familiares
CREATE TABLE IF NOT EXISTS public.family_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_affiliate_id UUID NOT NULL, -- FK se agrega después para evitar loops si profiles no existe aún
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Modificar Profiles para soportar el nuevo modelo
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id),
ADD COLUMN IF NOT EXISTS agreement_id UUID REFERENCES public.agreements(id),
ADD COLUMN IF NOT EXISTS family_group_id UUID REFERENCES public.family_groups(id),
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid' CHECK (payment_status IN ('paid', 'overdue', 'grace_period')),
ADD COLUMN IF NOT EXISTS current_period_quota_used INTEGER DEFAULT 0;

-- Ahora agregamos la FK a family_groups que apuntaba a profiles
ALTER TABLE public.family_groups
ADD CONSTRAINT fk_primary_affiliate FOREIGN KEY (primary_affiliate_id) REFERENCES public.profiles(id);

-- 5. Configuración de Impuestos
CREATE TABLE IF NOT EXISTS public.tax_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- IVA, IIBB, etc.
    rate DECIMAL(5,2) NOT NULL, -- Porcentaje (ej: 21.00)
    scope TEXT CHECK (scope IN ('national', 'local')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Facturación
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('affiliate', 'agreement')),
    entity_id UUID NOT NULL, -- Puede ser profile_id o agreement_id
    period TEXT NOT NULL, -- e.g., "2024-05"
    net_amount DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(12,2) NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    tax_details JSONB DEFAULT '[]'::JSONB, -- Desglose de qué impuestos se aplicaron
    status TEXT DEFAULT 'issued' CHECK (status IN ('issued', 'paid', 'cancelled')),
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Configuración Global del Sistema (Políticas)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insertar política por defecto
INSERT INTO public.system_settings (key, value) 
VALUES ('delinquency_policy', '{"mode": "grace_period"}')
ON CONFLICT (key) DO NOTHING;

-- 8. RLS (Row Level Security) - Simplificado para Admin
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Políticas básicas: Solo Admins pueden tocar esto
CREATE POLICY "Admins have full access to plans" ON public.plans FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admins have full access to agreements" ON public.agreements FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admins have full access to family_groups" ON public.family_groups FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admins have full access to taxes" ON public.tax_configurations FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admins have full access to invoices" ON public.invoices FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admins have full access to settings" ON public.system_settings FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');

-- Lectura para autenticados (opcional, según necesidad)
CREATE POLICY "Profiles can view their own family group" ON public.family_groups FOR SELECT TO authenticated USING (primary_affiliate_id = auth.uid());
