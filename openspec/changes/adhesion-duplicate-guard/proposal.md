# Proposal: Guardas Anti-Duplicados en el Formulario de Adhesión

## 1. Intención (Problema y Motivación)

Hoy el formulario público de adhesión (`AdhesionForm.tsx` → `AdhesionRepository.submitApplication()` → tabla `adhesion_requests`) **no valida duplicados**. Un titular o cualquiera de sus familiares (hasta 4 por solicitud) puede enviar un DNI que ya pertenece a un afiliado activo, a un integrante de otro grupo familiar, o a una solicitud pendiente. No se controla ni en el envío ni en la aprobación (`POST /api/approve-adhesion`). Esto genera afiliados duplicados, cobros conflictivos y trabajo manual de saneamiento. Detectado en pruebas end-to-end sobre el Supabase de staging pre-lanzamiento.

Adicionalmente, la solicitud de adhesión **no recolecta hoy el CUIL** (Código Único de Identificación Laboral, ID laboral/tributario argentino de 11 dígitos, formato `NN-DDDDDDDD-C`) de las personas del grupo. El negocio necesita el CUIL de **todas** las personas de la solicitud (titular + cada familiar) y que ese CUIL esté sujeto a la misma prevención de duplicados que el DNI, para no reintroducir descontrol por un identificador distinto.

## 2. Alcance

### Dentro del alcance
- **Nuevo campo `cuil`** recolectado en el formulario de adhesión para el titular y para **cada** familiar (hasta 4), adicional al DNI existente de cada persona.
- Validación **server-side** (bloqueo duro) en el envío de adhesiones, aplicada al **DNI y al CUIL** del titular y de **cada** familiar en la misma solicitud (hasta 4).
- Rechazo de la solicitud **completa** (no parcial) si cualquier DNI **o** CUIL falla, con mensaje que identifique a la persona y al identificador (DNI o CUIL) que la disparó.
- Guardarraíl a nivel base de datos: índice único parcial sobre `adhesion_requests(titular_dni) WHERE status = 'pending'` y su análogo sobre `adhesion_requests(titular_cuil) WHERE status = 'pending'`.
- Evaluación de índices únicos análogos sobre `family_members.dni` y `family_members.cuil` (regla de negocio, no de identidad — los familiares no son usuarios autenticados).
- **Nuevas columnas** de persistencia: `adhesion_requests.titular_cuil` (titular) y `cuil` para los familiares (columna en `family_members` post-aprobación y campo en el jsonb de familiares pre-aprobación).

### Fuera del alcance
- Bug de `split_part`/`substring` en `server.js:605-606` (ya flagueado aparte).
- Flujo OTP y su ventana temporal de expiración de 24h (ajuste temporal ya commiteado).
- UI de administración para resolver/mergear duplicados existentes (esta guarda es puramente preventiva en el envío).
- Reutilización o modificación de `profiles.cuit`: es un campo **distinto y no relacionado** (CUIT tributario del médico para facturación, con `UNIQUE` propio desde `20260427000002_admin_command_center_premium.sql`, definido en `20260628000007_expand_doctor_profile_fields.sql`). El nuevo CUIL de pacientes/titulares y familiares NO debe conflacionarse ni apoyarse en esa columna.

## 3. Reglas de Negocio (Acordadas)

Se recolectan y validan **dos identificadores por persona**: DNI (existente) y CUIL (nuevo). Ambos se chequean con la **misma** lógica de 3 reglas y la excepción de reaplicación.

Para cada **DNI** (titular o familiar), rechazar si coincide con:
1. `profiles.dni` (afiliado activo) → **"Este DNI ya se encuentra afiliado a Medinex."**
2. `family_members.dni` (integrante de cualquier grupo) → **"Este DNI ya está registrado como integrante de otro grupo familiar."**
3. `adhesion_requests.titular_dni` con `status = 'pending'` → **"Ya existe una solicitud pendiente con este DNI."**
4. Si la única coincidencia es una `adhesion_requests` en estado `rejected`, **se permite** reenviar (reaplicación legítima post-rechazo).

Para cada **CUIL** (titular o familiar), rechazar con la **misma lógica** contra las columnas de CUIL correspondientes:
1. `profiles.cuil` (afiliado activo) → **"Este CUIL ya se encuentra afiliado a Medinex."**
2. `family_members.cuil` (integrante de cualquier grupo) → **"Este CUIL ya está registrado como integrante de otro grupo familiar."**
3. `adhesion_requests.titular_cuil` con `status = 'pending'` → **"Ya existe una solicitud pendiente con este CUIL."**
4. Si la única coincidencia es una `adhesion_requests` en estado `rejected`, **se permite** reenviar.

> Nota: `profiles.cuil` es el CUIL del afiliado/paciente, **NO** `profiles.cuit` (que es el CUIT tributario del médico). Si el campo de afiliado no existe aún, la fase de diseño definirá dónde vive el CUIL del afiliado activo; el chequeo contra afiliados activos por CUIL es parte del alcance.

### DNI y CUIL se chequean de forma independiente (decisión)
DNI y CUIL se evalúan **de forma independiente, no combinada**: la solicitud se rechaza si **cualquiera** de los dos identificadores (el DNI **o** el CUIL) de **cualquier** persona coincide con un registro existente según las reglas anteriores. No se exige que ambos coincidan simultáneamente. Esta es la interpretación más conservadora para una regla cuyo objetivo es prevenir el descontrol de duplicados: basta con una coincidencia de un solo identificador para bloquear. Ver Riesgos para la validación de esta decisión con el negocio.

La validación de app-layer es la fuente primaria de verdad; los índices únicos parciales (DNI y CUIL) son defensa en profundidad contra bugs futuros y condiciones de carrera. Los familiares viven en jsonb pre-aprobación, por lo que el guardarraíl DB para ellos solo aplica post-aprobación sobre `family_members.dni` / `family_members.cuil`.

## 4. Capabilities

### Nuevas
- `adhesion-duplicate-guard`: prevención de identificadores duplicados (**DNI y CUIL**) en el envío de adhesiones (titular + familiares) a nivel aplicación y base de datos, incluyendo la recolección del nuevo campo CUIL.

### Modificadas
- Ninguna.

## 5. Repositorios y Servicios Afectados

| Área | Impacto | Descripción |
|------|---------|-------------|
| `src/pages/AdhesionForm.tsx` | Modificado | Agregar campo CUIL (titular + cada familiar); mostrar mensajes de rechazo por persona e identificador (DNI/CUIL). |
| `src/domain/.../AdhesionRepository.ts` (`submitApplication`) | Modificado | Recolectar/persistir CUIL; consulta previa de **DNIs y CUILs** contra `profiles`, `family_members` y `adhesion_requests` pendientes. |
| `server.js` (`POST /api/approve-adhesion`) | Modificado | Re-validación de DNI y CUIL al aprobar (guarda de segundo nivel); volcar CUIL de familiares del jsonb a `family_members`. |
| Migración Supabase | Nuevo | Columnas `adhesion_requests.titular_cuil`, `family_members.cuil` (y CUIL de afiliado activo); índices únicos parciales en `adhesion_requests(titular_dni)` y `(titular_cuil)` WHERE `status='pending'` (+ evaluación en `family_members.dni`/`cuil`). |

## 6. Riesgos

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Decisión "DNI y CUIL independientes" (cualquiera basta para rechazar) no confirmada explícitamente por el negocio | Media | Interpretación conservadora por defecto; validar con el negocio antes de `apply`. Cambiar a "ambos deben coincidir" sería una relajación de la guarda. |
| Confundir el nuevo `cuil` con `profiles.cuit` (CUIT tributario del médico) | Media | Columnas y nombres distintos; documentado como fuera de alcance no reusar `profiles.cuit`. |
| Datos existentes con `titular_dni`/`titular_cuil` duplicados en `pending` impiden crear los índices únicos | Media | Detectar/sanear pendientes duplicados antes de aplicar la migración. |
| Falsos bloqueos por identificadores normalizados de forma distinta (DNI con puntos/espacios, CUIL con o sin guiones) | Media | Normalizar DNI y CUIL antes de comparar en app y en el índice (p. ej. quitar guiones/puntos del CUIL). |
| CUIL inválido o mal formado enviado por el usuario | Media | Validar formato `NN-DDDDDDDD-C` (11 dígitos) en app antes de persistir/comparar. |
| Condición de carrera entre dos envíos simultáneos | Baja | Los índices únicos parciales (DNI y CUIL) garantizan atomicidad en DB. |

## 7. Plan de Rollback

Revertir los cambios de `AdhesionRepository`/`server.js`/`AdhesionForm.tsx`, `DROP INDEX` de los índices parciales agregados (DNI y CUIL) y `DROP COLUMN` de las columnas de CUIL nuevas. El formulario vuelve al comportamiento sin validación ni recolección de CUIL sin pérdida de datos previos.

## 8. Criterios de Éxito

- [ ] El formulario recolecta CUIL del titular y de cada familiar (hasta 4), adicional al DNI.
- [ ] Un envío con **DNI** de afiliado activo, familiar existente o solicitud pendiente es rechazado server-side con el mensaje correcto.
- [ ] Un envío con **CUIL** de afiliado activo, familiar existente o solicitud pendiente es rechazado server-side con el mensaje correcto.
- [ ] Un envío donde solo el DNI (y no el CUIL) coincide, o solo el CUIL (y no el DNI), es rechazado igualmente (chequeo independiente).
- [ ] Un envío con DNI/CUIL de una solicitud `rejected` se acepta.
- [ ] Un DNI o CUIL de familiar duplicado rechaza la solicitud completa e identifica a la persona y al identificador.
- [ ] Los índices únicos parciales impiden dos `pending` con el mismo `titular_dni` o el mismo `titular_cuil`.

## 9. Nota de Seguimiento (para fases posteriores)

Al cierre del ciclo (fase `tasks`/`archive`), **actualizar `PRD.md`** en la raíz del repo para documentar este flujo de prevención de duplicados (DNI y CUIL) y la recolección del nuevo campo CUIL como parte de los requisitos de producto. No perder de vista este pendiente.
