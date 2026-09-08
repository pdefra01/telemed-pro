# Proposal: Provisión Automática de Cuentas de Asesores (Promotores)

## 1. Objetivos Comerciales y Producto
Facilitar el alta operativa de asesores comerciales desde la consola del Operational Command Center (OCC). Al registrar un promotor en el panel de administración, el sistema debe crear de forma automática su cuenta de autenticación (Supabase Auth) y su perfil comercial, permitiéndole ingresar directamente a su dashboard del asesor sin necesidad de configuraciones manuales en base de datos.

---

## 2. Requerimientos Funcionales
* **Panel OCC (ProducersAdmin.tsx)**:
  * El formulario de "Nuevo Asesor Comercial" incorporará un campo para ingresar la contraseña inicial del asesor.
  * Al guardar, en lugar de insertar directamente en la tabla `producers` por el cliente de Supabase del frontend, se enviará una petición HTTP al backend `/api/create-advisor`.
* **Backend (server.js)**:
  * Endpoint `POST /api/create-advisor` protegido para que solo los administradores puedan crear cuentas.
  * Lógica del Endpoint:
    1. Validar campos requeridos (nombre, email, password, promoterCode).
    2. Crear cuenta en Supabase Auth usando el cliente de administración (`supabaseAdmin`).
    3. Actualizar la tabla `profiles` configurando el rol a `'advisor'` y asociando el `promoter_code` correspondiente.
    4. Insertar la ficha en la tabla comercial `producers` vinculando los datos de tasas de comisión para que siga mostrándose de forma retrocompatible en el OCC.

---

## 3. Impacto Técnico y Seguridad
* **Endpoint de Provisión**: Protegido. Se requerirá un token de administrador para ejecutar `/api/create-advisor` (usando el middleware `requireAuth` e inspeccionando que el rol sea `'admin'`).

---

## 4. Ampliación: Gestión de Asesores (Desactivación y Búsqueda)

### 4.1 Objetivo y Justificación
Hoy el alta es automática pero la **baja no existe**: no hay forma desde el OCC de anular el acceso de un asesor que dejó la red comercial, y la única alternativa operativa es tocar la base de datos a mano. En paralelo, el listado de asesores solo se filtra en el cliente sobre `name`, `producer_code` y `email` (`ProducersAdmin.tsx`), sin búsqueda por apellido ni por documento, que es el dato con el que Administración identifica a una persona. Cerrar el ciclo de vida (alta → búsqueda → baja) evita accesos vigentes de personal desvinculado y elimina intervención manual en base.

### 4.2 Requerimientos Funcionales — Desactivación
* **Quién**: exclusivamente rol `admin` desde `ProducersAdmin.tsx`, con la misma verificación que el alta.
* **Qué significa "desactivado"**:
  * **Bloquea el login**: `profiles.is_active = false`. El login ya rechaza cuentas inactivas (`AuthRepository.login`), por lo que se reutiliza el mecanismo existente sin inventar uno nuevo.
  * **Marca comercial**: `producers.status = 'inactive'` (el CHECK `active|inactive` ya existe en la tabla y hoy nunca se usa).
  * **Sale de las listas activas**: el asesor deja de contarse como "Asesor Activo" y se muestra visualmente diferenciado, pero **no se borra**.
* **Reversible**: sí. La misma acción permite reactivar (`is_active = true`, `status = 'active'`).
* **No destructivo**: nunca se elimina la cuenta de Auth ni la fila de `producers`. Las altas ya referidas (`profiles.producer_id`) conservan su atribución y comisiones históricas.
* **Confirmación explícita**: la acción pide confirmación en la UI antes de ejecutarse.

### 4.3 Requerimientos Funcionales — Búsqueda
* **Campos**: nombre, apellido, DNI/documento, y se preservan los actuales (código comercial y email).
* **Coincidencia**: parcial e insensible a mayúsculas/acentos para nombre y apellido; el documento admite coincidencia parcial por prefijo (Administración suele tipear los primeros dígitos).
* **Dónde**: en el buscador ya existente del listado de asesores del OCC, ampliando su alcance — no se agrega una pantalla nueva.
* **Alcance de resultados**: por defecto incluye activos e inactivos, con el estado visible en cada ficha, para que un asesor dado de baja siga siendo localizable.

### 4.4 Endpoints Implicados (nivel propuesta)
* `PATCH /api/advisors/:id/status` — admin-only; alterna activo/inactivo de forma atómica sobre `profiles` y `producers`.
* `GET /api/advisors/search` — admin-only; búsqueda por nombre, apellido, documento, código y email.
* El detalle de contrato, transaccionalidad y consolidación con el listado actual se define en `sdd-design`.

### 4.5 Impacto Técnico y Seguridad
* Ambos endpoints usan `requireAuth` + validación de rol `admin`, igual que `/api/create-advisor`; ningún asesor puede desactivarse ni buscar a otros.
* La búsqueda expone DNI, por lo que debe resolverse en backend con `supabaseAdmin` y no ampliando la lectura anónima actual de `producers` desde el frontend.
* Una fila de `producers` sin cuenta vinculada (placeholders tipo "Landing Directo") no tiene `profiles` ni Auth: la desactivación debe operar solo sobre su estado comercial y no fallar.
* Un administrador no puede desactivarse a sí mismo por esta vía.

### 4.6 Decisiones Confirmadas
* El link público de referido (`?promoter=CODE` en `AdhesionForm.tsx`) de un asesor inactivo **deja de aceptar nuevas altas**; las altas previas no se tocan.
* La desactivación no cierra sesiones ya abiertas de forma inmediata: el bloqueo aplica en el próximo login.
* **Comisiones**: la desactivación frena la generación de comisión nueva desde la fecha de baja. Las comisiones ya devengadas antes de la desactivación no se revierten; el detalle de implementación (dónde se corta el cálculo) se define en `sdd-design`.
* **Auditoría**: no se requiere historial de quién desactivó/reactivó a quién. Alcanza con el flag de estado actual (`profiles.is_active`, `producers.status`); no se agrega tabla de auditoría en esta ampliación.
* **Reasignación de cartera**: fuera de alcance. Las afiliaciones de un asesor inactivo quedan atribuidas a él (huérfanas mientras dure la baja); no se transfieren a otro asesor en esta ampliación.
