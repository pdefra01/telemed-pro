# Spec: Endurecimiento del Fichaje de Jornada Médica (Doctor Shift Hardening)

## Propósito

Cerrar las brechas de seguridad/integridad detectadas en el fichaje entrada/salida médico ya existente (`doctor_work_shifts`, `office_locations`), sin alterar la UI/lógica de fichaje que ya funciona. Cubre: políticas RLS por propiedad/rol, mitigación de turnos huérfanos, la decisión explícita de no bloquear `clockOut()` por geofence, y la eliminación de código muerto.

## Requisitos

### Requirement: Acceso por propiedad a `doctor_work_shifts` para médicos

El sistema DEBE (MUST) restringir INSERT, SELECT y UPDATE sobre `doctor_work_shifts` para un usuario con rol médico exclusivamente a filas donde `doctor_id = auth.uid()`. Un médico NO DEBE (MUST NOT) poder leer, crear ni modificar la fila de otro médico bajo ninguna circunstancia.

#### Scenario: Médico lee su propio turno activo
- **GIVEN** un médico autenticado con turnos propios en `doctor_work_shifts`
- **WHEN** consulta su turno activo (`getActiveShift`)
- **THEN** la consulta devuelve únicamente filas con su `doctor_id`

#### Scenario: Médico intenta leer o escribir el turno de otro médico
- **GIVEN** un médico autenticado
- **WHEN** intenta hacer SELECT, INSERT o UPDATE sobre una fila de `doctor_work_shifts` con `doctor_id` de otro médico
- **THEN** la operación es rechazada o no devuelve filas por RLS

### Requirement: Lectura administrativa completa de `doctor_work_shifts`

El sistema DEBE (MUST) permitir a un usuario con rol admin (determinado vía `public.is_admin()`, consistente con las policies existentes de `profiles`) hacer SELECT sobre todas las filas de `doctor_work_shifts`, sin restricción de propiedad. Esta lectura es requerida por `DashboardRepository.getAdminAnalytics()` (KPIs "Atenciones Hoy"/"Promedio Sesión" del panel admin), que agrega datos de todos los médicos cuando se consulta en modo `global`.

#### Scenario: Admin consulta analíticas agregadas de todos los médicos
- **GIVEN** un usuario con rol admin y turnos de múltiples médicos en `doctor_work_shifts`
- **WHEN** se ejecuta `getAdminAnalytics('global', ...)`
- **THEN** la consulta devuelve filas de todos los médicos, no solo las del usuario autenticado

### Requirement: Escritura restringida a admin en `office_locations`

El sistema DEBE (MUST) restringir INSERT, UPDATE y DELETE sobre `office_locations` exclusivamente a usuarios con rol admin (`public.is_admin()`). Un usuario no-admin NO DEBE (MUST NOT) poder crear, modificar ni eliminar oficinas.

#### Scenario: Admin gestiona oficinas
- **GIVEN** un usuario con rol admin
- **WHEN** crea, activa/desactiva o elimina una `office_location`
- **THEN** la operación se completa exitosamente

#### Scenario: Médico intenta modificar una oficina
- **GIVEN** un médico autenticado (no admin)
- **WHEN** intenta INSERT, UPDATE o DELETE sobre `office_locations`
- **THEN** la operación es rechazada por RLS

### Requirement: Lectura abierta de `office_locations` para autenticados

El sistema DEBE (MUST) mantener SELECT sobre `office_locations` disponible para cualquier usuario autenticado, sin restringirlo a admin. `officeLocationRepository.getAllOffices()`, invocado desde `clockIn()` para validar la IP del médico contra oficinas activas, depende de esta lectura para funcionar para médicos no-admin.

#### Scenario: Médico ficha entrada y su IP se valida contra oficinas
- **GIVEN** un médico autenticado (no admin) iniciando `clockIn()`
- **WHEN** el sistema lee `office_locations` para comparar la IP detectada contra las oficinas activas
- **THEN** la lectura se completa sin ser bloqueada por RLS

### Requirement: Mitigación de turnos huérfanos

El sistema DEBE (MUST) evitar que una fila de `doctor_work_shifts` permanezca en `status='active'` de forma indefinida cuando el médico cierra la pestaña, pierde conectividad o el proceso termina sin invocar `clockOut()` explícitamente. Este requisito describe el criterio observable, no el mecanismo: la fase de diseño elige entre best-effort en cliente (`visibilitychange`/`beforeunload`), barrido por antigüedad máxima en servidor, o ambos.

#### Scenario: Turno abandonado se cierra o se marca dentro de un umbral razonable
- **GIVEN** un turno `active` cuyo médico dejó de interactuar con la app (pestaña cerrada, sin fichar salida)
- **WHEN** transcurre el umbral de antigüedad/inactividad definido en diseño
- **THEN** el turno deja de reportarse como `active` indefinido en los KPIs de asistencia (se cierra o se marca de forma que no infle el tiempo trabajado)

#### Scenario: El próximo `clockIn()` del mismo médico sigue cerrando turnos previos abiertos
- **GIVEN** un médico con un turno `active` remanente de una sesión anterior
- **WHEN** vuelve a fichar entrada
- **THEN** el comportamiento existente (`autoCloseOldShifts`) sigue cerrando ese turno remanente antes de crear uno nuevo

### Requirement: `clockOut()` no valida geofence

El sistema NO DEBE (MUST NOT) exigir que el médico esté físicamente dentro de una oficina autorizada (validación de IP contra `office_locations`) para completar `clockOut()`. Esta es una decisión de negocio explícita, no una omisión a corregir: exigir presencia física para cerrar agravaría los turnos huérfanos, dado que un médico que se retira sin estar en la oficina nunca podría cerrar su turno.

#### Scenario: Médico ficha salida desde fuera de la oficina
- **GIVEN** un médico con un turno activo y una IP actual que no coincide con ninguna oficina autorizada
- **WHEN** invoca `clockOut()`
- **THEN** el turno se cierra exitosamente (`status='completed'`), sin validación de IP/geofence

### Requirement: `getAllDoctorShifts()` eliminado

El sistema NO DEBE (MUST NOT) exponer `DoctorShiftRepository.getAllDoctorShifts()`: se elimina por ser código muerto (cero llamadores) al momento de este change. Este método NO DEBE (MUST NOT) reintroducirse sin un llamador real y una policy admin explícita que lo respalde.

#### Scenario: El método ya no existe en el repositorio
- **GIVEN** el código fuente de `DoctorShiftRepository.ts` tras aplicar este change
- **WHEN** se busca `getAllDoctorShifts` en `src/`
- **THEN** no existe ninguna definición ni referencia colgante

#### Scenario: Reintroducción futura requiere caller real
- **GIVEN** que en el futuro se decide construir un panel admin de asistencia
- **WHEN** se reintroduce funcionalidad equivalente a `getAllDoctorShifts()`
- **THEN** se crea como un método nuevo con su propio llamador y su propia policy RLS admin explícita, no restaurando el código eliminado sin uso
