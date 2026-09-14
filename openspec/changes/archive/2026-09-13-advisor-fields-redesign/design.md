# Design: Rediseño de Estructura de Alta y Productividad de Asesores

## 1. Cambios en Base de Datos (Migración SQL)
* **Archivo**: [20260718003000_add_advisor_metrics.sql](file:///d:/Documentos/telemed-pro/supabase/migrations/20260718003000_add_advisor_metrics.sql)
* **SQL**:
  ```sql
  ALTER TABLE public.producers ADD COLUMN IF NOT EXISTS links_shared_count INTEGER NOT NULL DEFAULT 0;
  ```

---

## 2. Endpoints (Express - server.js)

### 2.1. `POST /api/create-advisor`
* **Entrada (Request Body)**:
  * `{ email, password, firstName, lastName, promoterCode, dni, phone, address }`
* **Proceso**:
  1. Validar parámetros requeridos.
  2. Crear usuario auth.
  3. Registrar en `profiles` con `first_name`, `last_name`, `dni`, `phone`, `address` e `role = 'advisor'`.
  4. Registrar en `producers` con `name = firstName + ' ' + lastName`, `producer_code = promoterCode`, `commission_rate = 10.00`, `links_shared_count = 0`.

### 2.2. `POST /api/advisor/increment-share`
* **Seguridad**: Autenticado (`requireAuth` para rol `'advisor'`).
* **Proceso**:
  1. Obtener la ficha comercial en `producers` que tenga el código asociado al perfil del asesor.
  2. Incrementar la columna `links_shared_count` por 1:
     ```sql
     UPDATE public.producers SET links_shared_count = links_shared_count + 1 WHERE id = req.user.id
     ```
* **Salida**: `{ success: true, linksSharedCount: n }`

### 2.3. `GET /api/advisor/stats`
* Se extenderá el retorno para incluir la métrica de compartición:
  * `linksSharedCount`: obtenido de la columna `links_shared_count` en la tabla `producers`.

---

## 3. Frontend Dashboard (AdvisorDashboard.tsx)
* **Visualización del Embudo**:
  * En el panel superior de KPIs se incorporará la tarjeta **"Enlaces Compartidos"** junto con el porcentaje de **Tasa de Conversión** calculated dynamically:
    `Conversión = (Altas Aprobadas / Links Compartidos) * 100` (con control de división por cero).
* **Incremento en Clicks**:
  * Al presionar "Copiar enlace" o "Compartir por WhatsApp", se llamará de forma asíncrona a `POST /api/advisor/increment-share` y se actualizará el estado de la UI para reflejar el incremento de forma fluida.
