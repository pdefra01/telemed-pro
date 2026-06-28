-- Migration: Doctor Digital Signatures
-- Description: Adds columns to support client-side encrypted private keys and digital signatures on prescriptions.

-- 1. Agregar columnas a profiles para claves asimétricas de firma digital
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS digital_public_key TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT;

-- 2. Agregar columna a prescriptions para auditar la clave pública de firma
ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS signature_public_key TEXT;

COMMENT ON COLUMN public.profiles.digital_public_key IS 'Clave pública ECDSA P-256 en formato SPKI codificado en Hex o PEM.';
COMMENT ON COLUMN public.profiles.encrypted_private_key IS 'Clave privada ECDSA P-256 cifrada con AES-GCM usando el PIN del médico (formato JSON cifrado).';
COMMENT ON COLUMN public.prescriptions.signature_public_key IS 'Clave pública del médico que firmó la receta para auditoría criptográfica.';
