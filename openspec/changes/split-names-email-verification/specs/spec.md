# Spec: División de Nombre/Apellido y Verificación de Email

## 1. Database Schema Specifications

### 1.1. Tabla `profiles` (Tipos Persona: Patient, Doctor, Admin, Advisor)
- **Nuevas columnas**:
  - `first_name` (VARCHAR, nullable temporalmente).
  - `last_name` (VARCHAR, nullable temporalmente).
- **Lógica de Retrocompatibilidad (full_name)**:
  - Mantendremos `full_name` como columna calculada automáticamente.
  - Para evitar romper las tablas existentes, crearemos un trigger en Postgres `BEFORE INSERT OR UPDATE` sobre `profiles` que concatene `first_name` y `last_name` con un espacio simple. Si no se proveen, mantendrá el valor actual.
- **Migración de Datos**:
  - Para los registros actuales de `profiles`, extraeremos la primera palabra de `full_name` como `first_name` y el resto como `last_name`.
  - Ejemplo: `"Juan Perez Gomez"` -> `first_name = "Juan"`, `last_name = "Perez Gomez"`.

### 1.2. Tabla `family_members` (Convivientes)
- **Nuevas columnas**:
  - `first_name` (VARCHAR, nullable).
  - `last_name` (VARCHAR, nullable).
- **Lógica de Retrocompatibilidad (full_name)**:
  - Trigger idéntico a `profiles` para autocompletar `full_name` como `first_name || ' ' || last_name`.
- **Migración de Datos**:
  - Lógica idéntica de partición para los familiares existentes.

### 1.3. Tabla `adhesion_requests` (Solicitudes)
- **Modificaciones estructurales**:
  - Reemplazar `titular_name` por `titular_first_name` y `titular_last_name` (o agregarlos).
  - Añadir columna `email_verified` (boolean, default false).
  - La estructura del JSON de familiares en `family_members` debe guardar las claves `first_name` y `last_name` de cada conviviente.

---

## 2. API Endpoint Specifications

### 2.1. `POST /api/email-verification/send`
- **Request**: `{ email: string }`
- **Acciones**:
  - Utilizar el repositorio de backend `ContactVerificationRepository` para crear un nuevo desafío OTP de tipo `email`.
  - El repositorio guardará un código numérico aleatorio de 6 dígitos.
  - En desarrollo, el backend imprimirá el código en consola: `[SIMULADOR EMAIL OTP] Código para ...`.
- **Response**: `200 OK` con `{ success: true }`.

### 2.2. `POST /api/email-verification/verify`
- **Request**: `{ email: string, code: string }`
- **Acciones**:
  - Validar contra la tabla `contact_verifications` si el código OTP está activo y no ha expirado.
  - Marcar el registro como verificado.
- **Response**: `200 OK` con `{ success: true }`. Si es inválido o expiró, devolver `400 Bad Request` con mensaje descriptivo.

---

## 3. Frontend Specifications

### 3.1. `AdhesionForm.tsx` (Paso 1: Datos Personales)
- Dividir el input "Nombre Completo" en "Nombre" y "Apellido".
- Incorporar control de validación de email:
  - Input para ingresar el email del titular.
  - Botón "Enviar código de verificación".
  - Al hacer click, llama a `/api/email-verification/send`, inicia una cuenta regresiva de 60 segundos para reenvío, y muestra el input del código.
  - El usuario ingresa los 6 dígitos del código enviado por correo.
  - Llama a `/api/email-verification/verify`. Si es exitoso, marca el estado `emailVerified: true` y desbloquea el botón "Siguiente".

### 3.2. `AdhesionForm.tsx` (Paso 3: Grupo Familiar)
- En el formulario para añadir familiares convivientes, se deben separar las entradas de "Nombre Completo" en "Nombre" y "Apellido".

### 3.3. `Affiliates.tsx` (Admin panel)
- Ajustar la visualización del padrón de afiliados activos y pendientes para mostrar las columnas Nombre y Apellido por separado.
- En el modal de detalles de solicitud, mostrar las columnas individuales del titular, de los miembros familiares y el indicador visual de "Email Verificado".
