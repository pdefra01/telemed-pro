# Proposal: Módulo Financiero P&L (Pérdidas y Ganancias)

## Intent
Proveer al panel de administración (OCC) de Medinex una pantalla premium Zen Dark de Pérdidas y Ganancias (P&L) en tiempo real para visualizar ingresos, egresos operativos (tanto fijos como variables) y márgenes de rentabilidad, facilitando la toma de decisiones financieras sin depender de planillas externas.

## Scope

### In Scope
- **Base de Datos:** Nueva tabla `public.operating_expenses` para asentar egresos por categoría, periodo y descripción.
- **Backend:** `FinancialService` para consolidar ingresos (facturas directas y convenios cobradas, ventas de farmacia) y egresos (honorarios médicos por consulta y egresos registrados).
- **Control de Egresos Fijos:** Permitir la carga de alquileres de oficina, impuestos asociados y otros costos operativos.
- **Frontend (OCC):** Pestaña "P&L / Rendimiento" en el Command Center con KPI cards (Ingreso, Egreso, Margen, ROI) y lista de transacciones.

### Out of Scope
- **Conciliación de cuentas bancarias automática:** Se ingresan los datos de facturas procesadas y gastos cargados manualmente.
- **Generador de balances contables oficiales:** Solo exportación a CSV genérico para Estudio Contable.

## Capabilities

### New Capabilities
- `financial-pl`: Capacidad de computar ingresos y egresos, y permitir la administración manual de costos operativos.

### Modified Capabilities
- None

## Approach
1. **Migración SQL:** Crear la tabla `operating_expenses` con RLS para rol `admin`.
2. **Servicio Financiero:** Implementar `FinancialService` que agregue ingresos reales de `InvoiceRepository` y egresos reales de consultas médicas (honorarios) más egresos fijos manuales.
3. **UI en OCC:** Diseñar en `OCCReports.tsx` o `OCCBilling.tsx` (o un nuevo tab) el panel de P&L interactivo con gráficos y tabla de transacciones/gastos.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | Migración para la tabla `operating_expenses`. |
| `src/services/FinancialService.ts` | New | Consolidador de balances mensuales. |
| `src/pages/admin/OCCBilling.tsx` | Modified | Integración de la vista financiera P&L. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Inconsistencia de periodos | Low | Validar el formato `YYYY-MM` en todos los cálculos del P&L. |

## Rollback Plan
Revertir la migración de base de datos y la UI agregada en `OCCBilling.tsx`.

## Success Criteria
- [ ] El administrador puede registrar un gasto de "Alquiler de oficinas" e "Impuestos" para el periodo actual.
- [ ] El panel muestra la ganancia neta correcta descontando dichos egresos del total de facturas cobradas.
