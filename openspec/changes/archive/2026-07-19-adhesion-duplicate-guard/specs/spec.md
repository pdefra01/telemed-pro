# Spec: Guardas Anti-Duplicados en el Formulario de Adhesión

## Propósito

Definir el comportamiento de validación de identificadores duplicados (DNI y CUIL) en el envío de solicitudes de adhesión (titular y hasta 4 familiares), tanto a nivel de aplicación como de base de datos, incluyendo la recolección del nuevo campo CUIL, sin alterar datos ya existentes.

## Requisitos

### Requirement: Validación del DNI y del CUIL del titular contra afiliados, familiares y solicitudes pendientes

El sistema DEBE (MUST) validar, antes de persistir la solicitud, tanto el DNI como el CUIL del titular, cada uno de forma independiente, contra: (1) la fuente de afiliado activo correspondiente (`profiles.dni` para DNI; la fuente de CUIL de afiliado activo — su columna/tabla exacta la define la fase de diseño — para CUIL), (2) `family_members.dni` / `family_members.cuil` (integrante de cualquier grupo), y (3) `adhesion_requests.titular_dni` / `adhesion_requests.titular_cuil` con `status = 'pending'`. El sistema DEBE permitir el reenvío cuando la única coincidencia (por DNI o por CUIL) sea una `adhesion_requests` en estado `rejected`.

#### Scenario: DNI del titular ya afiliado
- **GIVEN** el DNI ingresado como titular existe en `profiles.dni` (afiliado activo)
- **WHEN** se envía la solicitud de adhesión
- **THEN** la solicitud se rechaza con el mensaje "Este DNI ya se encuentra afiliado a Medinex."

#### Scenario: CUIL del titular ya afiliado
- **GIVEN** el CUIL ingresado como titular coincide con el CUIL de un afiliado activo
- **WHEN** se envía la solicitud de adhesión
- **THEN** la solicitud se rechaza con el mensaje "Este CUIL ya se encuentra afiliado a Medinex."

#### Scenario: DNI o CUIL del titular ya registrado como familiar de otro grupo
- **GIVEN** el DNI ingresado como titular existe en `family_members.dni`, o su CUIL existe en `family_members.cuil`, de otro grupo familiar
- **WHEN** se envía la solicitud de adhesión
- **THEN** la solicitud se rechaza con "Este DNI ya está registrado como integrante de otro grupo familiar." o "Este CUIL ya está registrado como integrante de otro grupo familiar.", según corresponda

#### Scenario: DNI o CUIL del titular con solicitud pendiente existente
- **GIVEN** el DNI ya existe en `adhesion_requests.titular_dni`, o el CUIL en `adhesion_requests.titular_cuil`, con `status = 'pending'`
- **WHEN** se envía la solicitud de adhesión
- **THEN** la solicitud se rechaza con "Ya existe una solicitud pendiente con este DNI." o "Ya existe una solicitud pendiente con este CUIL.", según corresponda

#### Scenario: Reenvío legítimo tras rechazo previo
- **GIVEN** el único registro existente para ese DNI o ese CUIL en `adhesion_requests` tiene `status = 'rejected'`
- **WHEN** se envía una nueva solicitud con el mismo DNI o CUIL de titular
- **THEN** la solicitud se acepta y se procesa normalmente

### Requirement: Validación del DNI y del CUIL de cada familiar en la misma solicitud

El sistema DEBE (MUST) aplicar la misma validación (afiliado activo, familiar existente, solicitud pendiente, excepción de rechazada) a cada DNI y a cada CUIL de familiar incluido en la solicitud, hasta un máximo de 4 familiares por envío.

#### Scenario: DNI de un familiar coincide con un afiliado activo
- **GIVEN** una solicitud con 2 familiares, donde el DNI del segundo familiar existe en `profiles.dni`
- **WHEN** se envía la solicitud
- **THEN** la solicitud completa se rechaza con "Este DNI ya se encuentra afiliado a Medinex." identificando al familiar involucrado

#### Scenario: CUIL de un familiar coincide con una solicitud pendiente
- **GIVEN** una solicitud con familiares, donde el CUIL de uno de ellos ya figura como `titular_cuil` en una `adhesion_requests` con `status = 'pending'`
- **WHEN** se envía la solicitud
- **THEN** la solicitud completa se rechaza con "Ya existe una solicitud pendiente con este CUIL." identificando al familiar involucrado

### Requirement: DNI y CUIL se evalúan de forma independiente

El sistema DEBE (MUST) rechazar la solicitud si **cualquiera** de los dos identificadores (DNI **o** CUIL) de **cualquier** persona (titular o familiar) coincide con un registro existente según las reglas anteriores. El sistema NO DEBE (MUST NOT) exigir que ambos identificadores de una misma persona coincidan simultáneamente para disparar el rechazo: una sola coincidencia (DNI solo, o CUIL solo) es suficiente.

#### Scenario: Solo el CUIL coincide, el DNI es nuevo
- **GIVEN** el DNI del titular no coincide con ningún registro, pero su CUIL sí coincide con un afiliado activo
- **WHEN** se envía la solicitud
- **THEN** la solicitud se rechaza igual, con el mensaje correspondiente al CUIL

#### Scenario: Solo el DNI coincide, el CUIL es nuevo
- **GIVEN** el CUIL de un familiar no coincide con ningún registro, pero su DNI sí coincide con una solicitud pendiente
- **WHEN** se envía la solicitud
- **THEN** la solicitud se rechaza igual, con el mensaje correspondiente al DNI

### Requirement: Rechazo atómico de la solicitud completa

El sistema DEBE (MUST) rechazar la solicitud completa —no de forma parcial— si cualquier DNI o CUIL (titular o cualquier familiar) falla la validación de duplicados. El mensaje de error DEBE (MUST) identificar la persona y el identificador (DNI o CUIL) que disparó el rechazo.

#### Scenario: Falla el CUIL del familiar 3 de 4, la solicitud entera se descarta
- **GIVEN** una solicitud con titular y 4 familiares donde solo el CUIL del tercer familiar es duplicado
- **WHEN** se envía la solicitud
- **THEN** no se persiste ningún dato de la solicitud (ni titular ni familiares)
- **AND** el mensaje de rechazo indica explícitamente al tercer familiar y al identificador CUIL como causantes

### Requirement: Normalización de DNI y CUIL antes de comparar

El sistema DEBE (MUST) normalizar cada DNI (solo dígitos, sin separadores) y cada CUIL (11 dígitos, formato `NN-DDDDDDDD-C`, guiones removidos para la comparación) a un formato canónico antes de ejecutar cualquier comparación de duplicados.

#### Scenario: DNI con separadores se normaliza antes de comparar
- **GIVEN** un DNI existente en `profiles.dni` almacenado como `30.123.456`
- **WHEN** se envía una solicitud con el DNI `30123456`
- **THEN** el sistema detecta la coincidencia tras normalizar ambos valores y rechaza la solicitud

#### Scenario: CUIL con y sin guiones se normaliza antes de comparar
- **GIVEN** un CUIL existente almacenado como `20-30123456-7`
- **WHEN** se envía una solicitud con el CUIL `20301234567`
- **THEN** el sistema detecta la coincidencia tras normalizar ambos valores (sin guiones) y rechaza la solicitud

### Requirement: Guardarraíl de base de datos como defensa en profundidad

El sistema DEBE (MUST) mantener índices únicos parciales sobre `adhesion_requests(titular_dni) WHERE status = 'pending'` y sobre `adhesion_requests(titular_cuil) WHERE status = 'pending'`. Son defensa secundaria: en operación normal nunca deberían dispararse porque la validación de aplicación bloquea antes. Si un índice se viola (p. ej. condición de carrera), el sistema NO DEBE (MUST NOT) silenciar el error: DEBE propagarlo como fallo de escritura y responder al cliente con un error explícito.

#### Scenario: Violación de índice único por condición de carrera
- **GIVEN** dos envíos simultáneos con el mismo `titular_dni` o el mismo `titular_cuil` que pasan ambos la validación de aplicación
- **WHEN** ambos intentan insertar en `adhesion_requests` con `status = 'pending'`
- **THEN** la base de datos rechaza el segundo INSERT por violación del índice único correspondiente
- **AND** el backend propaga el error al cliente en vez de reportar éxito falso

### Requirement: Alcance limitado al momento de envío

Esta guarda DEBE (MUST) aplicarse únicamente en el momento de envío de nuevas solicitudes. El sistema NO DEBE (MUST NOT) modificar, revalidar en retrospectiva ni marcar como conflictivos los datos de afiliados, familiares o solicitudes ya existentes al introducir esta guarda o el nuevo campo CUIL.

#### Scenario: Datos preexistentes no se tocan
- **GIVEN** que ya existen en la base de datos afiliados o solicitudes con DNIs/CUILs potencialmente duplicados anteriores a esta guarda
- **WHEN** se despliega esta funcionalidad
- **THEN** ningún registro existente se modifica, elimina ni marca automáticamente por esta guarda
