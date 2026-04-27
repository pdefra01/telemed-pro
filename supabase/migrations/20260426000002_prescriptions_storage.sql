-- Create storage bucket for prescriptions
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescriptions_pdfs', 'prescriptions_pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- RLS para Storage Objects (Ya está habilitado por Supabase)

-- Select policy: permitimos acceso público ya que la URL tiene un ID único difícil de adivinar (UUID)
CREATE POLICY "Recetas visibles para lectura pública"
ON storage.objects FOR SELECT
USING ( bucket_id = 'prescriptions_pdfs' );

-- Insert policy: Permitimos a usuarios autenticados subir recetas
CREATE POLICY "Doctores pueden subir recetas"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'prescriptions_pdfs' AND auth.role() = 'authenticated' );

-- Add pdf_url column to prescriptions
ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Service role bypasses RLS naturally, so the Edge Function (using service_role key) can insert without issues.
