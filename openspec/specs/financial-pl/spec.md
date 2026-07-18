# Financial P&L Specification

## Purpose
Esta especificación define las reglas y requerimientos funcionales para el cálculo de ingresos, egresos y márgenes financieros en Medinex, permitiendo visualizar la rentabilidad neta consolidada del negocio.

## Requirements

### Requirement: Cálculo de Ingresos Netos
El sistema MUST acumular como ingresos todas las facturas (`invoices`) cuyo estado sea `paid` dentro del periodo correspondiente (formato `YYYY-MM`), incluyendo cobros B2C de afiliados directos, cobros B2B de convenios corporativos y copagos de farmacia.

#### Scenario: Acumulación exitosa de ingresos
- GIVEN facturas del periodo "2026-07" con estado 'paid' por $1.000.000 y facturas 'pending' por $500.000
- WHEN se calcula el total de ingresos del periodo "2026-07"
- THEN el ingreso acumulado MUST ser de $1.000.000
- AND las facturas pendientes MUST ser excluidas

---

### Requirement: Registro de Egresos Fijos y Variables
El sistema MUST permitir a los usuarios con rol 'admin' registrar egresos bajo categorías predefinidas ('infrastructure', 'medical_fees', 'marketing', 'administrative', 'other') indicando un periodo `YYYY-MM`, monto y descripción.

#### Scenario: Carga exitosa de egreso operativo
- GIVEN un usuario con rol 'admin' autenticado
- WHEN registra un egreso de categoría 'administrative' por $450.000 para "Alquiler de oficinas" en el periodo "2026-07"
- THEN el egreso MUST quedar persistido en base de datos
- AND computarse en el total de egresos del periodo "2026-07"

---

### Requirement: Visualización y Margen Neto
El sistema MUST computar la ganancia neta restando el total de egresos (gastos cargados más honorarios médicos por consultas completadas) del total de ingresos conciliados. El margen neto MUST expresarse como valor monetario y porcentaje sobre el total de ingresos.

#### Scenario: Margen de rentabilidad positivo
- GIVEN ingresos totales conciliados por $2.000.000 y egresos consolidados por $1.500.000
- WHEN se renderiza la vista de P&L del periodo
- THEN la ganancia neta MUST mostrarse como $500.000
- AND el margen neto MUST mostrarse como 25%
