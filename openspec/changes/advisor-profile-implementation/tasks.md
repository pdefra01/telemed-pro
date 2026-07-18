# Tasks: Habilitación del Perfil Asesor

## Fase 1: Base de Datos & Migraciones (TDD)
- [ ] **Crear migración SQL**: `supabase/migrations/20260718002000_create_advisor_profile_tables.sql` con:
  - Creación de las tablas `announcements` y `announcement_reads` con sus políticas de RLS asociadas.
  - Adición de la columna `promoter_code` en la tabla `profiles`.
- [ ] **Aplicar la migración** en la base de datos local.
- [ ] **Verificar la estructura**: Crear y ejecutar un script de test básico en DB (`scratch/test_advisor_db.mjs`) que verifique que las tablas y columnas existen y que las políticas de RLS restringen los accesos adecuadamente.

## Fase 2: Backend & Endpoints (TDD)
- [ ] **Escribir Tests de Integración de Endpoints**: Crear un script de test en `scratch/test_advisor_endpoints.mjs` que intente:
  - Consultar estadísticas del asesor (`/api/advisor/stats`).
  - Obtener el listado de anuncios (`/api/announcements`).
  - Marcar un anuncio como leído (`POST /api/announcements/:id/read`).
- [ ] **Implementar Endpoints en `server.js`**:
  - `GET /api/advisor/stats`.
  - `GET /api/announcements`.
  - `POST /api/announcements/:id/read`.
- [ ] **Validar que los tests de backend pasen al 100%**.

## Fase 3: Frontend & Componentes
- [ ] **Crear el Componente `AdvisorDashboard.tsx`**:
  - Implementar visualizaciones premium para indicadores (KPIs) y comisiones de venta.
  - Renderizar cartelera de anuncios interactiva (con scroll, badges de estado no leído y acciones de marcar como leído).
  - Diseñar el formulario de autogestión de perfil (domicilio, celular, email) y cambio de contraseña.
- [ ] **Adaptar Sidebar & Ruteo**:
  - Actualizar `App.tsx` para agregar la ruta del asesor.
  - Modificar el sidebar dinámico para redirigir al asesor de forma exclusiva a su dashboard comercial.

## Fase 4: Verificación Integrada Global
- [ ] **Actualizar y ejecutar script de test global**: Validar que un usuario con rol `advisor` inicie sesión con éxito, visualice sus comisiones y registre la lectura de anuncios de forma consistente en base de datos.
