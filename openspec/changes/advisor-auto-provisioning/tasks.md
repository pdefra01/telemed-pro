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

---

# Amendment: Gestión de Asesores (Desactivación y Búsqueda)

Test runner: `npm run test` (Vitest 4, Strict TDD). Order below is RED before GREEN per task.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750-850 (migration ~30, `server/advisors.js` ~90, 2 backend test files ~180, `server.js` 3 routes ~120, `ProducerRepository.ts` + test ~110, `ProducersAdmin.tsx` + test ~180, `AdhesionForm.tsx` + test ~70) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — user must pick before `sdd-apply` |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | RPC `set_advisor_status` + pure matching (`server/advisors.js`) | PR 1 | `npm run test -- server/__tests__/advisors.test.js server/__tests__/advisorStatus.test.js` | N/A — no live Supabase call, `supabaseAdmin` stub only | Drop migration file + delete `server/advisors.js`; no callers yet |
| 2 | Backend wiring: `PATCH/GET /api/advisors/*`, `increment-share` guard, `ProducerRepository` client methods | PR 2 | `npm run test -- server/__tests__/advisorStatus.test.js src/repositories/__tests__/ProducerRepository.test.ts` | Manual: admin token → curl `PATCH /api/advisors/:id/status` on a seeded test advisor | Revert 3 route additions + repository methods; PR 1 unaffected |
| 3 | Referral gate: `AdhesionForm.tsx` landing-time promoter check + `AdhesionRepository` submit-gate test | PR 3 | `npm run test -- src/repositories/__tests__/AdhesionRepository.test.ts src/pages/__tests__/AdhesionForm.test.tsx` | Manual: visit `/adhesion?promoter=<inactive-code>` | Revert `AdhesionForm.tsx` `useEffect`; submit-gate test stays (pre-existing filter) |
| 4 | OCC UI: `ProducersAdmin.tsx` search + deactivate/reactivate | PR 4 | `npm run test -- src/pages/admin/__tests__/ProducersAdmin.test.tsx` | Manual: OCC → Asesores → search + toggle status | Revert `ProducersAdmin.tsx`; backend (PR 2) stays usable standalone |

## Fase 3: Backend Foundation — RPC & Matching (PR 1)
- [x] 3.1 Crear `supabase/migrations/20260907000000_set_advisor_status.sql`: función `set_advisor_status(uuid, boolean)` SECURITY DEFINER (design 3.3), `revoke all ... from public, anon, authenticated`, `grant execute ... to service_role`.
- [x] 3.2 RED — `server/__tests__/advisors.test.js`: `matchesAdvisor`/`normalizeTerm` para nombre acento-insensible (Esc.11 "María José"↔"maria"), apellido (Esc.12 "Gómez"↔"gomez"), prefijo DNI (Esc.13 "30123456"↔"301"), código/email substring (Esc.14).
- [x] 3.3 GREEN — crear `server/advisors.js` (`normalizeTerm`, `matchesAdvisor`, `mapAdvisorRow`, patrón `server/affiliateActivation.js`) hasta pasar 3.2.
- [x] 3.4 REFACTOR — separar rama numérica (DNI) vs texto (nombre/código/email) en `matchesAdvisor`; re-ejecutar 3.2 en verde.
- [x] 3.5 RED — `server/__tests__/advisorStatus.test.js` (stub `supabaseAdmin`, patrón `approveAdhesionAuth.test.js`): 403 autodesactivación (Esc.6), 403 no-admin (Esc.8), 400 body inválido, 404 `advisor_not_found` (código `P0002`), 200 placeholder `hasAccount:false` (Esc.7), RPC invocado una sola vez (Esc.4, Esc.5).

## Fase 4: Backend Wiring — Endpoints & Guard (PR 2)
- [x] 4.1 GREEN — `PATCH /api/advisors/:id/status` en `server.js` (`requireAuth, requireAdmin`) llamando a `set_advisor_status` (design 3.3) hasta pasar 3.5.
- [x] 4.2 RED+GREEN — `GET /api/advisors/search` en `server.js` (design 3.4): `q` ≥2 chars o 400, `status=all|active|inactive`, `LIMIT 500`, join en memoria `producers`+`profiles`; extender `advisorStatus.test.js` con Esc.15 (vacío→listado completo), Esc.16 (sin resultados→[]), Esc.17 (403 no-admin), Esc.18 (incluye inactivos etiquetados).
- [x] 4.3 RED+GREEN — guard `profiles.is_active` en `POST /api/advisor/increment-share` (`server.js` ~línea 1650, tras check de rol): 403 si `is_active=false` (Esc.10); test en `advisorStatus.test.js` o suite existente de increment-share.
- [x] 4.4 RED — `src/repositories/__tests__/ProducerRepository.test.ts`: forma del `fetch` (Bearer, método, body) y mapeo de error para `setAdvisorStatus(id, active)` y `searchAdvisors(q, opts)`.
- [x] 4.5 GREEN — implementar `setAdvisorStatus`/`searchAdvisors` en `src/repositories/ProducerRepository.ts` (patrón `AuthRepository.resetPasswordFromAdmin`) hasta pasar 4.4.

## Fase 5: Portón de Referidos (PR 3)
- [x] 5.1 Verificar `src/repositories/__tests__/AdhesionRepository.test.ts` cubre el rechazo `.eq('status','active')` (`AdhesionRepository.ts:82-96`) con mensaje "El código de promotor ingresado no es válido o no está activo."; si falta, agregar el test (blinda D5/Corte 1, sin tocar producción).
- [x] 5.2 RED — `src/pages/__tests__/AdhesionForm.test.tsx`: montaje con `?promoter=<código inactivo o inexistente>` limpia `promoterCode`, desbloquea el campo y muestra aviso inline (Esc.9).
- [x] 5.3 GREEN — en `AdhesionForm.tsx` (`useEffect` ~línea 64), llamar `producerRepository.getProducerByCode(code)`; si `null` o `status !== 'active'`, aplicar 5.2.

## Fase 6: OCC UI — Búsqueda y Baja (PR 4)
- [x] 6.1 RED — `src/pages/admin/__tests__/ProducersAdmin.test.tsx`: `q.length<2` renderiza `producers` de `loadProducers()` sin filtro cliente (Esc.15); `q>=2` dispara `searchAdvisors` con debounce 300ms y renderiza inactivos con badge (Esc.16, Esc.18).
- [x] 6.2 GREEN — eliminar `filteredProducers` (líneas 145-149) en `ProducersAdmin.tsx`; cablear búsqueda server-side per design 3.5; placeholder "Buscar por nombre, apellido, DNI, código o email".
- [x] 6.3 RED — extender 6.1: botón activar/desactivar pide `window.confirm`, llama `setAdvisorStatus`, actualiza badge desde `p.status` (no verde fijo, línea 226).
- [x] 6.4 GREEN — implementar botón + confirmación + badge dinámico en `ProducersAdmin.tsx` hasta pasar 6.3.

## Fase 7: Verificación
- [x] 7.1 Ejecutar `npm run test` (suite completa) y confirmar 0 regresiones sobre Fases 1-2 (baseline) y verde en Fases 3-6. Resultado: 403/410 passed; 7 pre-existing baseline failures (VideoRoom.test.tsx x3, crypto.test.ts x1, DashboardRepository.test.ts x1, MedicalHistory.test.tsx x2) confirmed identical with and without this change's files (verified via `git stash` of only the advisor-auto-provisioning files) — 0 regressions introduced.
- [x] 7.2 `sdd-apply` marca checkboxes `[x]` a medida que cada tarea pasa su gate GREEN.
