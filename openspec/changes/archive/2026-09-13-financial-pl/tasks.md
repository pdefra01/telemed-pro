# Tasks: M�dulo Financiero P&L (P�rdidas y Ganancias)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

---

## Phase 1: Foundation / Database

- [x] 1.1 Crear migración `supabase/migrations/20260706000000_operating_expenses.sql` con la tabla `operating_expenses`. (Ya presente en el repo, commit `cd57892`.)
- [x] 1.2 Habilitar RLS en `operating_expenses` permitiendo acceso completo solo a usuarios con rol `admin`. (4 policies SELECT/INSERT/UPDATE/DELETE verificando `profiles.role = 'admin'`.)
- [x] 1.3 Agregar tipo `OperatingExpense` y `PLSummary` a `src/types.ts`. (Ya presente en el repo.)

## Phase 2: Core Implementation / Services

- [x] 2.1 Crear `src/services/FinancialService.ts` implementando el cálculo consolidado del P&L agrupando ingresos y restando egresos. Refactorizado en esta sesión para consumir `InvoiceRepository`/`AppointmentRepository`/`OperatingExpenseRepository` en vez de llamar a Supabase directamente, siguiendo el patrón repositories → services del proyecto (ver `BillingService.ts`).
- [x] 2.2 Agregar método a `FinancialService` para guardar nuevos egresos manuales en Supabase. (`saveExpense` delega en `OperatingExpenseRepository.create`, nuevo en esta sesión.)
- [x] 2.3 Agregar método a `FinancialService` para recuperar egresos filtrados por periodo. (`getExpensesByPeriod` delega en `OperatingExpenseRepository.getByPeriod`, nuevo en esta sesión.)

## Phase 3: Integration / UI

- [x] 3.1 Modificar `src/pages/admin/OCCBilling.tsx` para agregar la pestaña "P&L / Rendimiento" (etiquetada "Pérdidas y Ganancias (P&L)"). (Ya presente en el repo, commit `cd57892`.)
- [x] 3.2 Implementar tarjetas de métricas (Ingresos, Egresos, Margen) y lista de gastos/transacciones en `OCCBilling.tsx`. (Ya presente en el repo.)
- [x] 3.3 Agregar botón y modal interactivo para la carga de nuevos egresos en `OCCBilling.tsx`. (Ya presente en el repo.)

## Phase 4: Testing & Verification

- [x] 4.1 Escribir test unitario para `FinancialService.ts` simulando la agregación matemática. Reescrito en esta sesión (RED→GREEN) para mockear los repositorios en vez de Supabase directamente, más un caso de margen cero y tests de delegación CRUD. Se agregaron además tests RED→GREEN nuevos para `InvoiceRepository.getPaidByPeriod`, `AppointmentRepository.getCompletedConsultationFeesByPeriod` y el nuevo `OperatingExpenseRepository` (13 tests). Total: 22/22 tests passing.
- [ ] 4.2 Verificar manualmente en el navegador que los gastos cargados se computen y resten del margen neto del mes. **Pendiente** — requiere sesión de navegador real contra Supabase; queda para `sdd-verify` o verificación manual del usuario.
