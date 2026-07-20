# Exploration: Fichar Salida en el Dashboard Médico

## Conclusión

**"Fichar Salida" ya está completamente implementado.** No hace falta construir nada nuevo para este pedido.

## Evidencia verificada en el código

- `src/pages/doctor/DoctorDashboard.tsx:388-407` — el botón ya renderiza condicionalmente:
  - `activeShift` truthy → botón rojo "Fichar Salida" (`onClick={handleClockOut}`)
  - `activeShift` falsy → botón verde "Fichar Entrada" (`onClick={handleClockIn}`)
- `handleClockOut` (líneas 143-156) llama a `doctorShiftRepository.clockOut(activeShift.id)`, limpia el estado y muestra un toast con la duración real calculada.
- `DoctorShiftRepository.clockOut()` (líneas 94-131) trae la fila, calcula `duration_minutes` a partir de timestamps reales, y actualiza `clock_out`/`duration_minutes`/`status='completed'`.
- El timer "00h 00m 00s" es un reloj real (`setInterval`) derivado de `activeShift.clockIn`, no decorativo — y sobrevive a un refresh de página porque un efecto al montar el componente vuelve a traer el turno activo desde `doctor_work_shifts`.
- La migración `20260628000005_doctor_work_shifts_and_offices.sql` ya tiene todas las columnas necesarias (`clock_in`, `clock_out`, `duration_minutes`, `status`, `ip_address`) — no requiere schema nuevo.

**Por qué no se veía en la captura que motivó el pedido**: el doctor de esa sesión todavía no había hecho clic en "Fichar Entrada", así que `activeShift` era `null` y solo se veía el botón verde. El flujo completo funciona, solo no era visible en ese estado puntual.

## Gaps reales encontrados (no pedidos, quedan anotados para más adelante)

1. Las políticas RLS de `doctor_work_shifts` y `office_locations` son `USING (true)` para todas las operaciones — permisivas de dev/demo, valdría la pena endurecerlas antes del lanzamiento real.
2. No hay manejo de `beforeunload`/`visibilitychange` en ningún lado de la app — si un médico cierra la pestaña a mitad de turno, la fila queda `status='active'` indefinidamente hasta su *próximo* fichaje de entrada (que la cierra automáticamente vía `autoCloseOldShifts`) — turnos huérfanos posibles mientras tanto.
3. `clockOut()` no re-valida IP/geofence como sí hace `clockIn()`.
4. `DoctorShiftRepository.getAllDoctorShifts()` está construido pero sin ningún llamador — código muerto, probablemente pensado para un panel admin que nunca se construyó.

## Recomendación

No se requiere ninguna fase de SDD adicional (spec/design/tasks/apply) para "agregar Fichar Salida" — ya existe. Si en algún momento se quiere atacar los gaps de arriba (RLS, turnos huérfanos), eso sería un change nuevo y distinto, no continuación de este.
