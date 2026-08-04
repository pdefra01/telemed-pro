# PRD — Integración de Débito Automático con Mercado Pago

**Proyecto:** Medinex / Telemedicina  
**Módulo:** Cobros y Suscripciones  
**Estado:** ✅ Implementado y desplegado en producción (Coolify)  
**Última actualización:** 2026-07-31

---

## 1. Objetivo

Permitir que un paciente pueda adherirse al plan de cobertura médica y autorizar un débito automático mensual a través de Mercado Pago, sin necesidad de ingresar los datos de su tarjeta directamente en la plataforma. El cobro se realiza según el día elegido por el afiliado en la adhesión (**día 1 o día 10 de cada mes**; por defecto día 10).

---

## 2. Flujo Completo del Usuario

```
[Paciente] Completa el Formulario de Adhesión (Selecciona fecha de débito: Día 1 o Día 10)
        ↓
[Backend] Crea la orden de preapproval en MP con la fecha de débito seleccionada
        ↓
[Paciente] Es redirigido a la pasarela de MP
        ↓
[Paciente] Inicia sesión en MP y autoriza la tarjeta
        ↓
[MP] Notifica via Webhook al backend en la fecha programada (día 1 o 10 de cada mes)
        ↓
[Backend] Verifica el pago, registra el movimiento con número de recibo
        ↓
[Backend] Extiende la cobertura del afiliado por un mes
        ↓
[Afiliado] Puede descargar el recibo PDF desde su panel
```

---

## 3. Variables de Entorno Requeridas (Coolify)

| Variable | Descripción |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token de MP. Empieza con `TEST-` en sandbox o `APP_USR-` en producción. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Secret para verificar la firma HMAC-SHA256 de los webhooks entrantes. |
| `PUBLIC_APP_URL` | URL pública de la app (ej: `https://medinex.duckdns.org`). Usada como `back_url`. |

---

## 4. Endpoints del Backend

### `POST /api/adhesion/preapproval`
Crea la suscripción de débito automático en MP para un nuevo afiliado (pre-afiliado, aún sin cuenta).

- **Quién lo llama:** Frontend (`AdhesionForm.tsx`) tras enviar el formulario.
- **Qué hace:**
  1. Resuelve el plan solicitado.
  2. Calcula el precio mensual con descuento por débito automático.
  3. Crea el preapproval en MP con `start_date` = próximo día 10.
  4. Guarda la reserva en `affiliate_payment_subscriptions` con `status: 'pending'`.
  5. Devuelve `{ ok: true, initPoint: "https://www.mercadopago.com.ar/..." }`.
- **Respuesta de error:** `{ ok: false }` (nunca 5xx para no alarmar al usuario).

### `POST /api/payments/subscribe`
Crea la suscripción para un afiliado que **ya tiene cuenta** y quiere activar el débito automático desde su panel.

- **Quién lo llama:** Frontend (panel del paciente logueado).
- **Qué hace:** Igual que el anterior, pero usa el perfil del usuario autenticado.

### `POST /api/webhooks/mercadopago`
Recibe notificaciones de Mercado Pago.

- **Autenticación:** Verifica la firma HMAC-SHA256 con `MERCADOPAGO_WEBHOOK_SECRET` antes de procesar.
- **Topics manejados:**

| Topic | Qué hace |
|---|---|
| `payment` | Registra el pago en el ledger (`affiliate_account_movements`) con número de recibo correlativo. |
| `subscription_authorized_payment` | Procesa el cobro mensual: registra el pago + extiende cobertura del afiliado 1 mes. |
| `subscription_preapproval` | Actualiza el estado de la suscripción (`authorized`, `cancelled`, `paused`). |
| Cualquier otro | Responde 200 sin procesar (ack silencioso). |

---

## 5. Ciclo de Cobro Mensual

- **Día del cobro:** siempre el **10 de cada mes**.
- **Lógica del `start_date`:**
  - Si el afiliado se adhiere ANTES del día 10 → primer cobro el día 10 del mes actual.
  - Si el afiliado se adhiere el día 10 o DESPUÉS → primer cobro el día 10 del mes siguiente (recibe el resto del mes gratis).
- **Zona horaria:** `America/Argentina/Buenos_Aires` (UTC-3, sin horario de verano).

### Estados del pago mensual en Mercado Pago

| Estado | Significado | Acción del sistema |
|---|---|---|
| `scheduled` | Cobro programado | Ack silencioso, sin cambios en BD |
| `recycling` | MP reintentando cobro (hasta 3 veces) | Ack silencioso, sin cambios en BD |
| `processed` | Cobro exitoso | Registra pago + número de recibo + extiende cobertura |
| `rejected` | Todos los reintentos fallaron | Marca `payment_failed` en la suscripción |

---

## 6. Registro de Pagos y Recibos

Cuando un pago es exitoso:

1. **`affiliate_account_movements`:** Se inserta un movimiento de tipo `payment` con:
   - `source: 'mercadopago'`
   - `external_ref: 'payment:mercadopago:{mp_payment_id}'` (único — garantiza idempotencia)
   - `receipt_number:` número correlativo auto-asignado desde la secuencia `receipt_number_seq`
2. **`invoices`:** La factura asociada pasa a estado `paid`.
3. **`profiles`:** El `plan_status` del afiliado pasa a `active`.
4. **`family_coverage_windows`:** Se extiende la cobertura 1 mes hacia adelante.

> **Idempotencia:** Si MP reenvía el mismo webhook, el `ON CONFLICT (external_ref)` en la base de datos lo ignora silenciosamente. El número de recibo ya asignado en el primer intento no se pierde ni se duplica.

---

## 7. Base de Datos — Tablas Involucradas

| Tabla | Rol |
|---|---|
| `affiliate_payment_subscriptions` | Almacena cada suscripción activa con su `mp_preapproval_id` y estado. |
| `affiliate_account_movements` | Ledger de movimientos. Cada pago exitoso genera una fila con `receipt_number`. |
| `mercadopago_audit` (o `mercadopago_events`) | Log de auditoría de todos los eventos recibidos del webhook. |
| `invoices` | Facturas mensuales. El pago las marca como `paid`. |
| `family_coverage_windows` | Ventana de cobertura del grupo familiar. Se extiende 1 mes por cada pago completo. |
| `profiles` | `plan_status` pasa a `active` cuando el pago es aprobado. |

### Funciones SQL clave

- **`post_payment_movement_from_webhook`**: Registra el movimiento de pago, asigna número de recibo, extiende cobertura. Idempotente por diseño.
- **`post_manual_adjustment`**: Contrapartida manual para el admin. Misma secuencia de recibos.
- **`release_subscription_reservation`**: Libera reservas abandonadas.
- **`claim_subscription_enrollment`** / **`finalize_subscription_enrollment`**: Ciclo de reserva para evitar condiciones de carrera al crear la suscripción.

---

## 8. Reconciliación Automática (Deferred Reconciliation)

Para casos donde MP nunca entregó el webhook final, el sistema tiene un sweep `runDeferredReconciliation` con 4 pasadas:

| Pasada | Qué hace |
|---|---|
| Pass B | Intenta linkear suscripciones sin `mp_preapproval_id` |
| Pass A | Reintenta pagos diferidos (`needs_admin`, `subscription_not_linked`) |
| Pass C | Re-consulta a MP suscripciones con eventos viejos o sin eventos |
| Pass D | Elimina reservas abandonadas (más de 30 min sin confirmar) |

> ⚠️ **Pendiente:** Este barrido no tiene aún un scheduler periódico. Requiere una cron job o Edge Function en Supabase que lo dispare mensualmente (idealmente el día 12, 2 días después del cobro).

---

## 9. Modo Sandbox (Testing)

Para probar sin dinero real:

1. En Coolify usar el `MERCADOPAGO_ACCESS_TOKEN` que empieza con `TEST-`.
2. Crear una **Cuenta de Prueba Comprador** en el panel de MP (Integraciones → Cuentas de prueba).
3. Llenar el formulario de adhesión con el **email del usuario de prueba** (`TESTUSER...@...`).
4. Abrir la URL del `initPoint` en una **ventana de incógnito**.
5. Iniciar sesión con las credenciales del comprador de prueba.
6. Usar la tarjeta de crédito de prueba: `4509 9535 6623 3704`, CVV `123`, Vto `11/28`.

> **Importante:** El email del paciente en el formulario y el usuario que paga en MP deben ser del mismo "mundo" (ambos de prueba o ambos reales). Mezclarlos genera el error: _"Una de las partes con la que intentás hacer el pago es de prueba"_.

---

## 10. Archivos del Proyecto Involucrados

| Archivo | Rol |
|---|---|
| [`server.js`](file:///d:/Documentos/telemed-pro/server.js) | Endpoints REST, función `nextBillingDate()` |
| [`server/mercadopago.js`](file:///d:/Documentos/telemed-pro/server/mercadopago.js) | Toda la lógica de webhooks, reconciliación y eventos |
| [`src/pages/AdhesionForm.tsx`](file:///d:/Documentos/telemed-pro/src/pages/AdhesionForm.tsx) | Formulario de adhesión + botón de redirect a MP |
| [`src/pages/patient/Payments.tsx`](file:///d:/Documentos/telemed-pro/src/pages/patient/Payments.tsx) | Panel de pagos del paciente + descarga de recibo |
| [`src/services/PdfService.ts`](file:///d:/Documentos/telemed-pro/src/services/PdfService.ts) | Generación de PDF del recibo |
| [`supabase/migrations/20260726000000_mercadopago_integration.sql`](file:///d:/Documentos/telemed-pro/supabase/migrations/20260726000000_mercadopago_integration.sql) | Migración principal: tablas y RPCs |
| [`supabase/migrations/20260731000000_add_receipt_number_to_webhook.sql`](file:///d:/Documentos/telemed-pro/supabase/migrations/20260731000000_add_receipt_number_to_webhook.sql) | Asigna número de recibo a pagos de MP |

---

## 11. Pendientes / Backlog

- [ ] **Scheduler de reconciliación:** Crear una cron job (Edge Function o servicio externo) que llame a `runDeferredReconciliation` mensualmente (sugerido: día 12 de cada mes a las 09:00 AR).
- [ ] **Notificaciones al paciente:** Email automático cuando el cobro mensual falla (`payment_failed`), para que el paciente actualice su tarjeta en MP.
- [ ] **Panel de admin para suscripciones:** Vista de todas las suscripciones activas, pausadas y canceladas con su historial de cobros.
- [ ] **Migración a producción:** Cambiar `MERCADOPAGO_ACCESS_TOKEN` de `TEST-` a `APP_USR-` en Coolify cuando se quiera cobrar dinero real.
