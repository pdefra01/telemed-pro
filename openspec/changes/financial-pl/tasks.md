# Tasks: Módulo Financiero P&L (Pérdidas y Ganancias)

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

- [ ] 1.1 Crear migración `supabase/migrations/20260706000000_operating_expenses.sql` con la tabla `operating_expenses`.
- [ ] 1.2 Habilitar RLS en `operating_expenses` permitiendo acceso completo solo a usuarios con rol `admin`.
- [ ] 1.3 Agregar tipo `OperatingExpense` y `PLSummary` a `src/types.ts`.

## Phase 2: Core Implementation / Services

- [ ] 2.1 Crear `src/services/FinancialService.ts` implementando el cálculo consolidado del P&L agrupando ingresos y restando egresos.
- [ ] 2.2 Agregar método a `FinancialService` para guardar nuevos egresos manuales en Supabase.
- [ ] 2.3 Agregar método a `FinancialService` para recuperar egresos filtrados por periodo.

## Phase 3: Integration / UI

- [ ] 3.1 Modificar `src/pages/admin/OCCBilling.tsx` para agregar la pestaña "P&L / Rendimiento".
- [ ] 3.2 Implementar tarjetas de métricas (Ingresos, Egresos, Margen) y lista de gastos/transacciones en `OCCBilling.tsx`.
- [ ] 3.3 Agregar botón y modal interactivo para la carga de nuevos egresos en `OCCBilling.tsx`.

## Phase 4: Testing & Verification

- [ ] 4.1 Escribir test unitario para `FinancialService.ts` simulando la agregación matemática.
- [ ] 4.2 Verificar manualmente en el navegador que los gastos cargados se computen y resten del margen neto del mes.
