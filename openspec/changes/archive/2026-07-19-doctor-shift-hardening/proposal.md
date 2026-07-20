# Proposal: Endurecimiento del Fichaje de Jornada Médica (Doctor Shift Hardening)

## 1. Intención (Problema y Motivación)

El fichaje de entrada/salida del médico (`Fichar Entrada`/`Fichar Salida`) ya existe y funciona correctamente end-to-end (`DoctorDashboard.tsx`, `DoctorShiftRepository.ts`, tabla `doctor_work_shifts`). Durante la exploración (`sdd/fichar-salida/explore`) se detectaron **4 brechas reales** de seguridad/integridad, ninguna tocada aún, que conviene cerrar **antes de una exposición productiva más amplia**. Este change NO agrega funcionalidad nueva de fichaje: solo endurece lo existente.

## 2. Alcance

### Dentro del alcance
1. **RLS permisiva** — Reemplazar las políticas `USING (true)` de `doctor_work_shifts` y `office_locations` (migración `20260628000005`) por políticas basadas en propiedad/rol:
   - `doctor_work_shifts`: INSERT/SELECT/UPDATE del médico limitado a sus propias filas (`doctor_id = auth.uid()`); lectura de **admin** sobre todas las filas (requerida por el KPI "Promedio Sesión" de `DashboardRepository.ts`, ver Riesgos).
   - `office_locations`: SELECT abierto a autenticados (lo necesita `clockIn()` para el chequeo de IP); escritura (ALL) solo admin.
2. **Turnos huérfanos** — Mitigar que una fila quede `status='active'` indefinidamente si el médico cierra la pestaña sin fichar salida. `autoCloseOldShifts()` solo cierra de forma perezosa en el *próximo* `clockIn()` del mismo médico. La fase de diseño elegirá el mecanismo (best-effort `visibilitout`/`beforeunload` que dispare `clockOut`, y/o barrido por antigüedad máxima).
3. **Geofence en `clockOut()`** — Decisión de negocio explícita (ver §4).
4. **Código muerto** — `getAllDoctorShifts()` (sin llamadores): decisión explícita (ver §4).

### Fuera del alcance
- La UI/lógica de fichaje que ya funciona (botón, timer, toasts, `clockIn`/`clockOut` core) — no se toca.
- Construir un panel admin de asistencia/"Jornadas" (explícitamente fuera, aun si volviera útil a `getAllDoctorShifts`).
- Reporte de payroll/asistencia y cualquier cron/edge-function global de barrido (se evalúa solo como opción en diseño para el ítem 2).

## 3. Capabilities

### Nuevas
- `doctor-shift-hardening`: políticas RLS por propiedad/rol para el fichaje, manejo de turnos huérfanos y decisiones de geofence-en-salida y limpieza de código muerto.

### Modificadas
- Ninguna (no hay spec previa de fichaje de jornada).

## 4. Decisiones Explícitas (para el registro)

**Ítem 3 — Geofence en `clockOut()`: NO agregar bloqueo por IP en la salida.** `clockIn()` valida IP contra `office_locations` para probar presencia física al **iniciar** la jornada. Exigir estar en la oficina para **cerrar** crearía una trampa: un médico que se retira sin fichar salida quedaría bloqueado y no podría cerrar nunca su turno, **agravando** el problema de turnos huérfanos del ítem 2. Recomendación: no bloquear la salida por geofence. Registrar la IP de salida (`clock_out_ip`) para auditoría es un extra barato que se evalúa en diseño, pero NO condiciona el fichaje de salida.

**Ítem 4 — `getAllDoctorShifts()`: ELIMINAR.** Cero llamadores, no existe panel admin y construirlo está fuera de alcance. Por el principio "no construir para un futuro hipotético", se borra. Es consistente con el endurecimiento de RLS: al pasar `doctor_work_shifts` a lectura por propietario/admin, este método (que lee todas las filas) dejaría de funcionar para no-admins de todos modos. Si en el futuro se construye el panel, se re-crea con un método propio y política admin explícita.

## 5. Áreas Afectadas

| Área | Impacto | Descripción |
|------|---------|-------------|
| Migración Supabase (nueva) | Nuevo | `DROP`/reemplazo de las 4 políticas `USING(true)`; nuevas políticas por propiedad/rol en ambas tablas. |
| `src/repositories/DoctorShiftRepository.ts` | Modificado | Eliminar `getAllDoctorShifts()`; posible hook de cierre best-effort para ítem 2. |
| `src/pages/doctor/DoctorDashboard.tsx` | Modificado | Listener `visibilitychange`/`beforeunload` best-effort (ítem 2), sin tocar la lógica de fichaje existente. |
| `src/repositories/DashboardRepository.ts` | Verificar | Su query directa a `doctor_work_shifts` (KPI admin) debe seguir funcionando bajo la nueva RLS. |

## 6. Riesgos

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| La RLS por propietario rompe el KPI admin "Promedio Sesión" (`DashboardRepository` lee todas las filas) | Alta | Incluir política de lectura admin explícita en `doctor_work_shifts`; verificar el mecanismo de rol admin (`profiles.role`/helper) en diseño. |
| Cerrar SELECT de `office_locations` rompe el chequeo de IP en `clockIn()` | Media | Mantener SELECT abierto a autenticados; restringir solo la escritura a admin. |
| `beforeunload`/`visibilitychange` no dispara de forma confiable (crash, kill de proceso) | Media | Tratarlo como best-effort; complementar con cierre por antigüedad (perezoso existente o barrido, a decidir en diseño). |
| Determinación del rol admin en RLS no verificada | Media | La fase de diseño debe confirmar cómo se identifica un admin antes de escribir las policies. |

## 7. Plan de Rollback

Revertir la migración de policies restaurando las cuatro `USING(true)` originales (`DROP POLICY` nuevas + recrear las permisivas). Revertir los cambios de `DoctorShiftRepository.ts`/`DoctorDashboard.tsx` restaura el método eliminado y quita el listener. Sin pérdida de datos: no hay cambios de esquema destructivos (a lo sumo una columna opcional `clock_out_ip` que se dropea).

## 8. Criterios de Éxito

- [ ] Un médico solo puede leer/insertar/actualizar sus propias filas de `doctor_work_shifts`; no las de otros.
- [ ] Un admin sigue leyendo todas las filas y el KPI "Promedio Sesión" sigue funcionando.
- [ ] `office_locations` solo lo escribe un admin; `clockIn()` sigue validando IP sin romperse.
- [ ] Un cierre de pestaña a mitad de turno ya no deja la fila `active` indefinidamente (best-effort + cierre por antigüedad).
- [ ] `clockOut()` no bloquea por geofence; un médico puede cerrar su turno fuera de la oficina.
- [ ] `getAllDoctorShifts()` eliminado; sin referencias colgantes en `src/`.
