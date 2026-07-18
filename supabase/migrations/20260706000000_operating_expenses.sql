-- Migración: operating_expenses
-- Descripción: Crea la tabla para almacenar los egresos fijos y variables de la plataforma.

CREATE TABLE IF NOT EXISTS public.operating_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period VARCHAR(7) NOT NULL, -- Formato 'YYYY-MM'
    category VARCHAR(50) NOT NULL CHECK (category IN ('infrastructure', 'medical_fees', 'marketing', 'administrative', 'other')),
    amount NUMERIC(12, 2) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.operating_expenses ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad RLS
CREATE POLICY "Permitir lectura completa a administradores"
ON public.operating_expenses FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Permitir inserción completa a administradores"
ON public.operating_expenses FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Permitir modificación completa a administradores"
ON public.operating_expenses FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Permitir eliminación completa a administradores"
ON public.operating_expenses FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- Otorgar accesos necesarios
GRANT ALL ON public.operating_expenses TO authenticated;
