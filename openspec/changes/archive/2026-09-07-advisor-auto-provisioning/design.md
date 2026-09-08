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

---

## 3. Ampliación: Gestión de Asesores (Desactivación y Búsqueda)

### 3.1 Límites Arquitectónicos

    ProducersAdmin.tsx ─→ ProducerRepository ─→ /api/advisors/* (Express, supabaseAdmin)
      (UI, confirmación)     (fetch + Bearer)        │
                                                     ├─→ rpc set_advisor_status()  [transacción única]
                                                     └─→ producers ⋈ profiles + server/advisors.js (matching puro)

La UI nunca habla con Supabase para estas dos operaciones: el DNI y la escritura de estado quedan del lado servidor (propuesta 4.5). El `fetch` vive en el repositorio, como `AuthRepository.resetPasswordFromAdmin` / `updateEmailFromAdmin`, no en el componente.

### 3.2 Decisiones de Arquitectura

| # | Decisión | Alternativa rechazada | Razón |
|---|---|---|---|
| D1 | Atomicidad vía RPC Postgres `set_advisor_status` (SECURITY DEFINER) | Dos `update` secuenciales con rollback compensatorio a mano, como `/api/create-advisor` (server.js:1818-1854) | El rollback manual puede fallar él mismo y dejar el par `profiles`/`producers` incoherente sin señal. La función corre en una transacción implícita: si falla el segundo `update`, el primero se revierte solo. Ya hay precedente de RPC transaccional (`finalize_subscription_enrollment`, `claim_subscription_enrollment`) |
| D2 | `producers` es la fila conductora; `profiles` es opcional | Exigir `profiles` y devolver 404 si no existe | Los placeholders ("Landing Directo (sin asesor)") tienen `producers` pero no `profiles`/Auth. 0 filas en el `update` de `profiles` no es error: se devuelve `hasAccount: false` (mismo criterio que `ProducerRepository.getProducers`) |
| D3 | Matching insensible a acentos en Node (`server/advisors.js`), no en SQL | Extensión `unaccent` + índice funcional / `pg_trgm` | Ninguna migración instala `unaccent` hoy; el universo de asesores es de decenas de filas. Se escanea con tope `LIMIT 500` y se filtra con `normalize('NFD')`. Si la red crece, migrar a RPC SQL con `unaccent` + trigram (follow-up, fuera de alcance) |
| D4 | La búsqueda pasa a ser server-authoritative | Mantener el filtro cliente y sólo "ampliar" con hits inactivos | Dos motores de coincidencia (cliente `includes` vs servidor normalizado) divergen en acentos y prefijo de DNI, y obligan a mergear/deduplicar dos fuentes. Además garantiza que los inactivos aparezcan aunque en el futuro `getProducers()` filtre por estado |
| D5 | Rechazo de link de referido en submit + landing; la aprobación no cambia | Filtrar por `status='active'` también al aprobar | Cortar en la aprobación borraría atribución de solicitudes cargadas mientras el asesor estaba activo (viola 4.6: no revertir lo devengado) |
| D6 | El corte de comisiones va donde se generan filas atribuibles, no en la fórmula | Agregar `is_active` al cálculo de `/api/advisor/stats` | La comisión es **derivada**, no asentada (server.js:1626). Filtrar ahí borraría retroactivamente lo ya devengado |

### 3.3 `PATCH /api/advisors/:id/status`

* **Middleware**: `requireAuth, requireAdmin` (server.js:100 y 132) — reutiliza el middleware existente en lugar de repetir la verificación inline de `/api/create-advisor`.
* **Entrada**: `{ active: boolean }`. `:id` debe ser UUID.
* **Validaciones y códigos**:

| Caso | Código | Cuerpo |
|---|---|---|
| `supabaseAdmin` no configurado | 503 | `{ error: 'Servicio de administración no configurado.' }` |
| `:id` no es UUID o `active` no es booleano estricto | 400 | `{ error: 'Datos inválidos para el cambio de estado.' }` |
| `req.params.id === req.user.id` | 403 | `{ error: 'Un administrador no puede modificar su propio estado.' }` |
| RPC lanza `advisor_not_found` (`P0002`) | 404 | `{ error: 'Asesor no encontrado.' }` |
| OK (idempotente) | 200 | `{ success: true, id, status: 'active'\|'inactive', isActive, hasAccount }` |

* **Función (nueva migración)**:

```sql
create or replace function public.set_advisor_status(p_advisor_id uuid, p_active boolean)
returns table (advisor_id uuid, producer_status text, has_account boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_status text := case when p_active then 'active' else 'inactive' end;
  v_producer_rows int; v_profile_rows int;
begin
  update public.producers set status = v_status where id = p_advisor_id;
  get diagnostics v_producer_rows = row_count;
  if v_producer_rows = 0 then
    raise exception 'advisor_not_found' using errcode = 'P0002';
  end if;

  -- 0 filas es válido: placeholders sin cuenta. El guard `role = 'advisor'`
  -- impide desactivar un perfil admin por esta vía (defensa en profundidad).
  update public.profiles set is_active = p_active
   where id = p_advisor_id and role = 'advisor';
  get diagnostics v_profile_rows = row_count;

  return query select p_advisor_id, v_status, v_profile_rows > 0;
end; $$;

revoke all on function public.set_advisor_status(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_advisor_status(uuid, boolean) to service_role;
```

### 3.4 `GET /api/advisors/search`

* **Middleware**: `requireAuth, requireAdmin`.
* **Query**: `q` (obligatorio, ≥2 caracteres tras `trim`, si no 400), `status=all|active|inactive` (default `all` — propuesta 4.3), `limit` (default 50, máx 100).
* **Un solo parámetro `q`**: nombre, apellido, DNI, código y email se resuelven con el mismo término, porque el buscador del OCC es una sola caja. No hay parámetros por campo.
* **Flujo servidor**:
  1. `producers` → `select('*').order('name').limit(500)` (tope documentado de D3).
  2. `profiles` → `select('id, first_name, last_name, dni, is_active').eq('role','advisor')` — el DNI vive en `profiles`, no en `producers`; el join se hace en memoria por `id` (mismo criterio que `ProducerRepository.getProducers`).
  3. Filtro con `matchesAdvisor(row, term)` de `server/advisors.js`.
  4. Conteo de referidos sólo para los ids que matchean: `profiles.select('producer_id').in('producer_id', matchedIds)`.
* **Matching (`server/advisors.js`, funciones puras testeables)**:

```js
export const normalizeTerm = (v) =>
  (v ?? '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

// term numérico  → prefijo de DNI (o substring de código)
// term no numérico → substring en nombre, apellido, nombre completo, código, email
export function matchesAdvisor(row, term) { /* ... */ }
```

* **Respuesta**: `{ results: [{ id, name, firstName, lastName, producerCode, email, phone, dni, status, isActive, hasAccount, commissionRate, totalAffiliatesReferred }], total, truncated }`. `status` viaja siempre, para que el inactivo se vea diferenciado.

### 3.5 Integración con el buscador actual (D4)

En `ProducersAdmin.tsx` se elimina `filteredProducers` (líneas 145-149) y se reemplaza por:

* `searchTerm.trim().length < 2` → se renderiza `producers` tal como lo devuelve `loadProducers()` (sin filtro cliente).
* `>= 2` → debounce de 300 ms → `producerRepository.searchAdvisors(term)`; se renderiza el resultado del servidor (incluye inactivos).
* Si el endpoint falla, se muestra el error y se conserva la lista cargada.
* Placeholder del input pasa a "Buscar por nombre, apellido, DNI, código o email".
* Cada tarjeta agrega el botón de activar/desactivar con `window.confirm` previo (propuesta 4.2) y el badge de estado deja de ser verde fijo (línea 226) para reflejar `p.status`.

### 3.6 Rechazo del link de referido para inactivos

| Punto | Ubicación exacta | Acción |
|---|---|---|
| Submit (ya existe — sólo cubrir con test) | `src/repositories/AdhesionRepository.ts:82-96` | El filtro `.eq('status','active')` ya rechaza con "El código de promotor ingresado no es válido o no está activo." |
| Landing con `?promoter=CODE` (nuevo) | `src/pages/AdhesionForm.tsx` — `useEffect` de montaje sobre `searchParams.get('promoter')` (línea 64) | `producerRepository.getProducerByCode(code)`; si es `null` o `status !== 'active'` → limpiar `promoterCode`, desbloquear el campo (`isPromoterLocked = false`) y avisar en línea, en lugar de fallar recién al enviar el paso 4 |
| Aprobación (deliberadamente sin cambios) | `server.js:1339-1351` | Sigue resolviendo `producer_id` sin filtrar estado: preserva la atribución del pipeline cargado antes de la baja |

### 3.7 Congelamiento de comisiones

La comisión no está asentada en ninguna tabla: se deriva en `server.js:1626`
(`commissions = approvedSales * 10000 * (commissionRate / 10)`) contando `adhesion_requests` por `promoter_id = profiles.promoter_code`.

* **No se toca la fórmula** — filtrar por estado ahí pondría en cero lo ya devengado (D6).
* **Corte 1 (existente, se blinda con test)**: `AdhesionRepository.ts:82-96`. Con el código inactivo no se puede crear una nueva `adhesion_requests`, por lo que `approvedSales` sólo puede crecer con el pipeline previo a la baja.
* **Corte 2 (nuevo)**: `server.js` `POST /api/advisor/increment-share` (~línea 1650), inmediatamente después del check `role !== 'advisor'`: leer `profiles.is_active` y devolver 403 si es `false`. Evita que una sesión abierta siga generando actividad/métricas tras la baja (propuesta 4.6: la sesión no se cierra, pero no debe producir nada nuevo).
* **Reactivación**: se restablece sola, porque el corte 1 vuelve a pasar.

### 3.8 File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `supabase/migrations/<ts>_set_advisor_status.sql` | Create | Función `set_advisor_status` + grants a `service_role` |
| `server/advisors.js` | Create | `normalizeTerm`, `matchesAdvisor`, `mapAdvisorRow` (lógica pura, patrón de `server/affiliateActivation.js`) |
| `server/__tests__/advisors.test.js` | Create | Tests unitarios del matching |
| `server/__tests__/advisorStatus.test.js` | Create | Tests de handler con `supabaseAdmin` stub (patrón `approveAdhesionAuth.test.js`) |
| `server.js` | Modify | Rutas `PATCH /api/advisors/:id/status` y `GET /api/advisors/search`; guard `is_active` en `/api/advisor/increment-share` |
| `src/repositories/ProducerRepository.ts` | Modify | `setAdvisorStatus(id, active)` y `searchAdvisors(q, opts)` con Bearer token |
| `src/pages/admin/ProducersAdmin.tsx` | Modify | Búsqueda server-side con debounce, botón activar/desactivar con confirmación, badge por estado |
| `src/pages/AdhesionForm.tsx` | Modify | Validación del `?promoter=` al montar |

### 3.9 Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit | `matchesAdvisor`: "peña"↔"Pena", mayúsculas, prefijo de DNI, substring de código/email, término <2 | vitest, funciones puras |
| Unit/Integration servidor | 403 self-deactivation, 403 no-admin, 400 body inválido, 404 inexistente, 200 placeholder con `hasAccount:false`, RPC invocado una sola vez | vitest + stub de `supabaseAdmin` |
| Repository | `setAdvisorStatus`/`searchAdvisors` (forma del fetch y mapeo de error); `AdhesionRepository` rechaza código inactivo | vitest + mock de `fetch`/supabase |
| UI | confirmación previa al PATCH, badge inactivo, fallback a lista cargada con `q<2`, búsqueda debounced | RTL con repositorio mockeado |
| E2E | admin desactiva asesor → login del asesor rechazado | Playwright (opcional) |

### 3.10 Threat Matrix

N/A — no hay routing de shell, subprocesos, automatización de VCS/PR, clasificación de archivos ejecutables ni integración de procesos. Las rutas HTTP nuevas quedan cubiertas por el borde `requireAuth`/`requireAdmin` existente, con tests explícitos de 401/403.

### 3.11 Migración / Rollout

Una sola migración (función SQL). Sin backfill: `producers.status` ya tiene default `'active'` y CHECK `active|inactive` desde `20260628000010`. Sin feature flag. Rollback = revertir `server.js`/UI y `drop function set_advisor_status`; los flags de estado son reversibles desde el propio OCC.

### 3.12 Open Questions

- [ ] La tarjeta "Total Asesores Activos" hoy cuenta `producers.length` (incluye placeholders e inactivos). Recomendación: contar `status === 'active'`. ¿Entra en esta ampliación?
- [ ] `ProducerRepository.getProducers()` escanea `profiles` completo trayendo `dni`/`address` de todos los perfiles sólo para contar referidos. Es un problema de PII/performance preexistente; se registra como follow-up fuera de alcance.
