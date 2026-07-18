# Design: Provisión Automática de Cuentas de Asesores (Promotores)

## 1. Diseño de Endpoints (Express - server.js)

### 1.1. `POST /api/create-advisor`
* **Seguridad**:
  * Middleware de autenticación `requireAuth` para verificar token.
  * Verificación de rol: `if (req.user.user_metadata?.role !== 'admin' && !public.is_admin())` -> Retornar 403 Forbidden.
* **Entrada (Request Body)**:
  * `{ email, password, name, promoterCode, phone?, commissionRate? }`
* **Proceso**:
  1. Validar que no falten `email`, `password`, `name` y `promoterCode`.
  2. Verificar si el `promoterCode` ya está en uso en `profiles`:
     `SELECT 1 FROM public.profiles WHERE promoter_code = promoterCode`
     Si existe, retornar 400 Bad Request.
  3. Crear cuenta en Supabase Auth usando el cliente de administración:
     `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'advisor', full_name: name } })`
  4. Actualizar el registro generado en `profiles` con `role = 'advisor'`, `promoter_code = promoterCode`, `phone = phone` e `is_active = true`.
  5. Insertar el registro correspondiente en la tabla comercial `producers`:
     `INSERT INTO public.producers (id, name, producer_code, email, phone, commission_rate, status) VALUES (user_id, name, promoterCode, email, phone, commissionRate, 'active')`
* **Salida**: `{ success: true, id: user_id }`

---

## 2. Cambios en el Frontend (ProducersAdmin.tsx)
* **Formulario del Modal**:
  * Añadir input de contraseña:
    ```tsx
    <div>
      <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Contraseña Inicial *</label>
      <input 
        type="password" 
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
    </div>
    ```
* **Lógica de Envío (`handleSaveProducer`)**:
  * En lugar de llamar a `producerRepository.createProducer(...)` directamente en Supabase, llamaremos a la API local de Express:
    ```typescript
    const token = await getAccessToken();
    const res = await fetch('/api/create-advisor', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        promoterCode: code,
        email,
        phone,
        commissionRate,
        password
      })
    });
    ```
