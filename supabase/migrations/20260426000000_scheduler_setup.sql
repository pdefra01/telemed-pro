-- Agregar columnas necesarias a profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS specialty TEXT,
ADD COLUMN IF NOT EXISTS rating DECIMAL DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS availability TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}'::JSONB;

-- Asegurar que la tabla appointments tenga specialty
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS specialty TEXT;

-- Insertar algunos médicos de prueba si no existen removidos para no violar auth.users FK
