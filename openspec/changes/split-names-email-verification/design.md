# Design: División de Nombre/Apellido y Verificación de Email

## 1. Database Migrations and Triggers

### 1.1. Modificación de `profiles` y `family_members`
Añadiremos `first_name` y `last_name` a ambas tablas.
Implementaremos una función trigger para autocompletar `full_name`:
```sql
CREATE OR REPLACE FUNCTION public.sync_full_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL THEN
    NEW.full_name := trim(concat(COALESCE(NEW.first_name, ''), ' ', COALESCE(NEW.last_name, '')));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
Y asignamos este trigger a:
- `profiles` (`BEFORE INSERT OR UPDATE`)
- `family_members` (`BEFORE INSERT OR UPDATE`)

### 1.2. Parseo y Migración de Nombres Existentes
```sql
-- Profiles migration
UPDATE public.profiles
SET first_name = split_part(full_name, ' ', 1),
    last_name = COALESCE(nullif(substring(full_name from position(' ' in full_name) + 1), ''), '')
WHERE full_name IS NOT NULL AND position(' ' in full_name) > 0 AND first_name IS NULL;

UPDATE public.profiles
SET first_name = full_name,
    last_name = ''
WHERE full_name IS NOT NULL AND position(' ' in full_name) = 0 AND first_name IS NULL;

-- Family members migration
UPDATE public.family_members
SET first_name = split_part(full_name, ' ', 1),
    last_name = COALESCE(nullif(substring(full_name from position(' ' in full_name) + 1), ''), '')
WHERE full_name IS NOT NULL AND position(' ' in full_name) > 0 AND first_name IS NULL;

UPDATE public.family_members
SET first_name = full_name,
    last_name = ''
WHERE full_name IS NOT NULL AND position(' ' in full_name) = 0 AND first_name IS NULL;
```

### 1.3. Tabla `contact_verifications` para Invitados Anónimos
Dado que los solicitantes no están registrados en `profiles`, alteraremos la columna `user_id` para permitir valores `NULL`:
```sql
ALTER TABLE public.contact_verifications ALTER COLUMN user_id DROP NOT NULL;
```
Y agregaremos una política de RLS para el rol público:
```sql
CREATE POLICY "Public can insert verification challenges" 
ON public.contact_verifications FOR INSERT 
TO public 
WITH CHECK (true);

CREATE POLICY "Public can select verification challenges by email and code" 
ON public.contact_verifications FOR SELECT 
TO public 
USING (verified_at IS NULL AND expires_at > now());
```

---

## 2. API Rest Endpoints

### 2.1. `POST /api/email-verification/send`
Generación del desafío OTP:
```javascript
app.post('/api/email-verification/send', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email es requerido' });

  const cleanEmail = email.trim().toLowerCase();
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const { error } = await supabaseAdmin
      .from('contact_verifications')
      .insert({
        channel: 'email',
        contact_value: cleanEmail,
        otp_code: otpCode,
        attempts: 0,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      });

    if (error) throw error;

    console.log(`[SIMULADOR EMAIL OTP] Enviando código para ${cleanEmail}: ${otpCode}`);
    res.status(200).json({ success: true, message: 'Código enviado.' });
  } catch (err) {
    console.error("Error en send-email-otp:", err);
    res.status(500).json({ error: 'Fallo al generar el código.' });
  }
});
```

### 2.2. `POST /api/email-verification/verify`
Validación del desafío OTP:
```javascript
app.post('/api/email-verification/verify', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email y código requeridos' });

  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  try {
    // Buscar desafío activo
    const { data: challenges, error } = await supabaseAdmin
      .from('contact_verifications')
      .select('*')
      .eq('contact_value', cleanEmail)
      .eq('channel', 'email')
      .is('verified_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !challenges || challenges.length === 0) {
      return res.status(400).json({ error: 'El código ha expirado o no existe.' });
    }

    const challenge = challenges[0];

    if (challenge.otp_code === cleanCode) {
      // Marcar verificado
      await supabaseAdmin
        .from('contact_verifications')
        .update({ verified_at: new Date().toISOString() })
        .eq('id', challenge.id);

      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ error: 'Código incorrecto.' });
    }
  } catch (err) {
    console.error("Error en verify-email-otp:", err);
    res.status(500).json({ error: 'Fallo al verificar el código.' });
  }
});
```

---

## 3. Frontend Component Layouts

### 3.1. `AdhesionForm.tsx`
- En el Step 1, introduciremos un botón de validación de email.
- El formulario se bloqueará mediante un estado `isEmailVerified: boolean = false` hasta que la llamada de verificación sea exitosa.
- Dividiremos `titular_name` en `titular_first_name` y `titular_last_name`.
- Para los familiares (`family_members`), las propiedades del objeto pasarán a incluir `first_name` y `last_name` de manera estructurada.

### 3.2. `Affiliates.tsx`
- Modificaremos el panel administrativo para leer de forma independiente `first_name` y `last_name` de los afiliados aprobados y de las solicitudes pendientes, permitiendo listarlos por apellido y nombre de forma ordenada.
