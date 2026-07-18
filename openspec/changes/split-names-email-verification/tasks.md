# Tasks: División de Nombre/Apellido y Verificación de Email

## Fase 1: Base de Datos & Migraciones (TDD)
- [x] **Crear migración SQL**: `supabase/migrations/20260718001000_split_names_and_email_verification.sql` con:
  - Columnas `first_name` y `last_name` en `profiles` y `family_members`.
  - Trigger `sync_full_name` de Postgres.
  - Lógica de migración para separar los nombres existentes.
  - Columna `email_verified` en `adhesion_requests`.
  - Modificación de `user_id` a `NULLABLE` en `contact_verifications` y políticas de RLS públicas.
- [x] **Aplicar la migración** en la base de datos local de desarrollo.
- [x] **Verificar la migración**: Escribir una prueba básica en base de datos para confirmar que el trigger de Postgres concatena `first_name` y `last_name` en `full_name` y que las columnas existen.

## Fase 2: Backend & Endpoints (TDD)
- [x] **Escribir Tests de Integración de Endpoints**: Crear un script de test en `scratch/test_email_verification_endpoints.mjs` que intente:
  - Enviar un OTP al email.
  - Validar un OTP incorrecto (debe fallar).
  - Validar el OTP correcto (debe ser exitoso).
- [x] **Implementar Endpoints en `server.js`**:
  - `POST /api/email-verification/send`.
  - `POST /api/email-verification/verify`.
- [x] **Modificar el Endpoint `/api/approve-adhesion`**:
  - Exigir que la solicitud de adhesión tenga `email_verified: true`.
  - Mapear adecuadamente `titular_first_name` y `titular_last_name` al crear el perfil del titular.
  - Mapear `first_name` y `last_name` al crear los integrantes del grupo familiar en `family_members`.
- [x] **Ejecutar y validar los tests de backend** para confirmar que la lógica de negocio pasa el 100% de las pruebas TDD.

## Fase 3: Frontend & Componentes
- [x] **Actualizar Formulario de Adhesión (`AdhesionForm.tsx`)**:
  - Separar los inputs del titular en Nombre y Apellido.
  - Separar los inputs de convivientes en Nombre y Apellido.
  - Implementar el paso intermedio de validación de correo con llamada a la API y bloqueo del flujo hasta obtener éxito.
- [x] **Actualizar Panel de Administración (`Affiliates.tsx`)**:
  - Adaptar columnas de tabla para afiliados y solicitudes con Nombre y Apellido separados.
  - Actualizar el modal de detalles de solicitud pendiente para visualizar los nombres separados y el estado de la validación del email.

## Fase 4: Verificación Integrada Global
- [x] **Actualizar script de test global**: Adaptar `scratch/test_adhesion_flow.mjs` para incluir la llamada de verificación de email OTP y validar que el nuevo afiliado y su familia se registren con nombre y apellido separados en la DB.
- [x] **Ejecutar test global** y verificar el resultado exitoso.
