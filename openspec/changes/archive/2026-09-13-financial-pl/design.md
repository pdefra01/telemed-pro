# Design: Módulo Financiero P&L (Pérdidas y Ganancias)

## Technical Approach
El módulo de Pérdidas y Ganancias consolidará los ingresos del sistema provenientes de cobros (afiliados, convenios y farmacia) y los cruzará con los egresos (honorarios médicos por consultas completadas y gastos operativos fijos/variables registrados manualmente) para determinar la rentabilidad real de la plataforma. 

La implementación requiere una migración SQL en Supabase para la tabla de egresos, la creación de un nuevo servicio de backend (`FinancialService`) que realice las agregaciones de base de datos eficientemente, y una pestaña integrada en la interfaz de facturación del OCC.

---

## Architecture Decisions

### Decision: Agregación de Ingresos y Egresos
* **Opción A:** Realizar agregación directa en memoria en el Frontend trayendo todos los registros de base de datos.
* **Opción B (Elegida):** Computar agregaciones en memoria en un servicio del backend (`FinancialService`) o via consultas parametrizadas de Supabase, filtrando por periodo.
* **Justificación:** Previene problemas de escala y transferencia innecesaria de datos si la cantidad de facturas crece en producción.

---

## Data Flow

```
+--------------------+
|  InvoiceRepository | --(Ingresos Paid)--+
+--------------------+                     ¦
                                           ?
+--------------------+              +--------------------+      +---------------+
|  ApptRepository    | --(Honorarios)-? |  FinancialService  | --? | UI Dashboard  |
+--------------------+                     ?                    +---------------+
                                           ¦
+--------------------+                     ¦
|  ExpensesTable     | --(Egresos Fijos)---+
+--------------------+
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260706000000_operating_expenses.sql` | Create | Migración SQL para la tabla `operating_expenses` con políticas de RLS. |
| `src/services/FinancialService.ts` | Create | Servicio financiero para calcular ingresos, egresos y retornos. |
| `src/pages/admin/OCCBilling.tsx` | Modify | Agregar solapa "P&L / Rendimiento" y formularios de carga de egresos. |

---

## Interfaces / Contracts

```typescript
export interface OperatingExpense {
  id: string;
  period: string; // Formato 'YYYY-MM'
  category: 'infrastructure' | 'medical_fees' | 'marketing' | 'administrative' | 'other';
  amount: number;
  description: string;
  createdAt: string;
}

export interface PLSummary {
  period: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  netMargin: number; // Porcentaje
  breakdown: {
    revenue: {
      b2c: number;
      b2b: number;
      pharmacy: number;
    };
    expenses: {
      medicalFees: number;
      infrastructure: number;
      marketing: number;
      administrative: number;
      other: number;
    };
  };
}
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `FinancialService` calculations | Mocks de facturas, consultas y egresos para verificar la precisión matemática. |
| Integration | RLS policies on `operating_expenses` | Intentar leer/escribir gastos con rol 'patient' y confirmar rechazo por Supabase. |

---

## Migration / Rollout
Se aplicará la migración SQL directamente en Supabase para crear la tabla de egresos. No se requiere migración de datos previos dado que las facturas y turnos existentes ya son compatibles con el esquema de cálculo del servicio.
