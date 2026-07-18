# Tasks: Provisión Automática de Cuentas de Asesores (Promotores)

## Fase 1: Backend & API Endpoints (TDD)
- [x] **Escribir test TDD de endpoints**: Crear un script de test en `scratch/test_advisor_provisioning_endpoints.mjs` que intente:
  - Crear un asesor autenticado como administrador (debe dar 201).
  - Intentar crear un asesor autenticado como médico (debe dar 403).
  - Intentar crear un asesor con un promoterCode duplicado (debe dar 400).
- [x] **Implementar Endpoint en `server.js`**:
  - `POST /api/create-advisor`.
- [x] **Validar que los tests de backend pasen al 100%**.

## Fase 2: Frontend & Panel Administrativo
- [x] **Actualizar Formulario en `ProducersAdmin.tsx`**:
  - Agregar campo "Contraseña Inicial" al modal de creación.
  - Modificar la llamada de submit para que consuma `/api/create-advisor` en lugar de guardar directo en Supabase DB.
- [x] **Validar que la interfaz compile e incorpore el alta integrada con éxito**.
