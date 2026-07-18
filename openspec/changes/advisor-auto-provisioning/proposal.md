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
