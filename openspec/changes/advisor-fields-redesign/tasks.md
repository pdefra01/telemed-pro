# Tasks: Rediseño de Estructura de Alta y Productividad de Asesores

## Fase 1: Base de Datos & Backend (TDD)
- [x] **Crear migración SQL**: Añadir `links_shared_count` a la tabla `producers`.
- [x] **Actualizar test TDD de endpoints**: Modificar `scratch/test_advisor_provisioning_endpoints.mjs` para testear el alta con la nueva estructura de campos, el incremento de clicks de compartición en `/api/advisor/increment-share` y el retorno en `/api/advisor/stats`.
- [x] **Modificar Endpoints en `server.js`**:
  - `POST /api/create-advisor` (nuevos campos, tasa por defecto).
  - `POST /api/advisor/increment-share` (incrementar contador).
  - `GET /api/advisor/stats` (incluir linksSharedCount).
- [x] **Validar que los tests de backend pasen al 100%**.

## Fase 2: Frontend OCC & Dashboard
- [x] **Rediseñar Formulario en `ProducersAdmin.tsx`**:
  - Implementar inputs de Nombre, Apellido, DNI, Celular, Domicilio, Código, Contraseña.
  - Remover Comisión.
- [x] **Actualizar Consola en `AdvisorDashboard.tsx`**:
  - Integrar KPI "Enlaces Compartidos" y Tasa de Conversión %.
  - Disparar el incremento en base de datos al copiar enlace o enviar por WhatsApp.
- [x] **Validar compilación e integración visual**.
