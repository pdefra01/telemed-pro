# Proposal: División de Nombre/Apellido y Verificación de Email

## 1. Business Objective
El objetivo de esta propuesta es normalizar la estructura de datos de las personas dentro del sistema dividiendo el campo de nombre completo en Nombre y Apellido de forma independiente. Asimismo, se implementará un flujo de verificación de correo electrónico vía OTP de 6 dígitos para asegurar que cada nuevo afiliado proporcione un email de contacto válido y verificado antes de completar su adhesión.

## 2. Scope & Target Personas
Esta división de nombre y apellido afectará a todos los "tipos de personas" definidos en la base de datos de TeleMed Pro:
- **Profiles**: Pacientes, Médicos, Administradores y futuros Asesores.
- **Family Members**: Familiares del grupo familiar conviviente de los afiliados.
- **Adhesion Requests**: Titulares y familiares declarados en solicitudes pendientes de adhesión.

El flujo de verificación por correo electrónico afectará a:
- Portales públicos de adhesión (como el formulario QR).

## 3. Technical Requirements Summary
- Migración de base de datos Postgres con triggers de concatenación de nombres automática para asegurar retrocompatibilidad con campos `full_name` existentes.
- Integración del repositorio `ContactVerificationRepository` y endpoints `/api/email-verification/send` / `/api/email-verification/verify` en el backend Express.
- Actualización de interfaces React en `AdhesionForm.tsx` y `Affiliates.tsx`.
