# Specifications: Provisión Automática de Cuentas de Asesores (Promotores)

## 1. Escenarios de Negocio (Given/When/Then)

### 🔑 Escenario 1: Alta Exitosa de Asesor Comercial por un Administrador
* **Given** que un administrador autenticado en el OCC ingresa al panel de "Asesores Comerciales",
* **When** completa el formulario con el email `pedro.asesor@medinex.com`, contraseña `clave123`, código de promotor `PROMO_PEDRO` y hace click en "Guardar",
* **Then** el sistema debe crear la cuenta en Supabase Auth, registrar su perfil con rol `advisor` y promoter_code `PROMO_PEDRO` en `profiles`, e insertar la fila en `producers` con éxito.

### 🛡️ Escenario 2: Intento de Creación de Asesor por un No-Administrador
* **Given** que un usuario sin rol de administrador (por ejemplo, un médico o un paciente) intenta realizar una petición HTTP a `/api/create-advisor`,
* **When** el backend evalúa el token de autorización mediante el middleware,
* **Then** la API debe rechazar la petición con código de estado HTTP 403 (Forbidden) y no alterar las tablas.

### ⚠️ Escenario 3: Intento de Alta con Código de Promotor Duplicado
* **Given** que ya existe en la base de datos un asesor comercial con el código de promotor `PROMO_PEDRO`,
* **When** un administrador intenta dar de alta un nuevo asesor con el mismo código `PROMO_PEDRO`,
* **Then** el backend debe capturar el error de clave única de Postgres y retornar una respuesta HTTP 400 (Bad Request) con un mensaje explicativo.

---

## 2. Ampliación: Gestión de Asesores (Desactivación y Búsqueda)

### Requisito: Desactivación y Reactivación de Asesores
El sistema DEBE permitir a un administrador alternar el estado de un asesor entre activo e inactivo mediante `PATCH /api/advisors/:id/status`, actualizando de forma atómica `profiles.is_active` y `producers.status` (`active`/`inactive`). El sistema NO DEBE eliminar la cuenta de Auth ni la fila de `producers`, y DEBE reutilizar el mecanismo de bloqueo de login ya existente en `AuthRepository.login` sin introducir un nuevo mecanismo de autenticación. El sistema NO DEBE permitir que un administrador se desactive a sí mismo. El sistema DEBE poder desactivar filas de `producers` sin `profiles`/cuenta de Auth vinculada (placeholders) sin fallar.

#### 🔑 Escenario 4: Desactivación Exitosa de un Asesor Activo
* **Given** un asesor activo con `profiles.is_active = true` y `producers.status = 'active'`,
* **When** un administrador ejecuta `PATCH /api/advisors/:id/status` solicitando desactivación,
* **Then** el sistema actualiza `profiles.is_active = false` y `producers.status = 'inactive'` de forma atómica, sin eliminar ninguna fila.

#### 🔑 Escenario 5: Reactivación Exitosa de un Asesor Inactivo
* **Given** un asesor previamente desactivado,
* **When** un administrador ejecuta la misma acción solicitando reactivación,
* **Then** el sistema restaura `profiles.is_active = true` y `producers.status = 'active'`.

#### 🛡️ Escenario 6: Bloqueo de Autodesactivación
* **Given** un administrador autenticado cuyo `id` coincide con el del asesor objetivo,
* **When** intenta ejecutar `PATCH /api/advisors/:id/status` sobre su propia cuenta,
* **Then** el backend rechaza la operación sin modificar ningún registro.

#### ⚠️ Escenario 7: Desactivación de un Producer Placeholder sin Cuenta Vinculada
* **Given** una fila de `producers` sin `profiles` ni cuenta de Auth asociada (por ejemplo, "Landing Directo"),
* **When** un administrador solicita su desactivación,
* **Then** el sistema actualiza únicamente `producers.status = 'inactive'` sin fallar por ausencia de `profiles`.

#### 🛡️ Escenario 8: Intento de Desactivación por un No-Administrador
* **Given** un usuario sin rol `admin`,
* **When** invoca `PATCH /api/advisors/:id/status`,
* **Then** la API responde 403 (Forbidden) y no altera `profiles` ni `producers`.

#### 🔑 Escenario 9: El Link de Referido Deja de Aceptar Altas tras la Desactivación
* **Given** un asesor inactivo con código de promotor `PROMO_X`,
* **When** un visitante ingresa a `AdhesionForm.tsx` con `?promoter=PROMO_X`,
* **Then** el sistema rechaza la nueva adhesión con ese código, sin afectar las altas previas ya registradas.

#### 🔑 Escenario 10: El Devengo de Comisiones se Detiene tras la Desactivación
* **Given** un asesor con comisiones ya devengadas antes de su desactivación,
* **When** se desactiva su cuenta,
* **Then** el sistema deja de generar comisión nueva desde esa fecha en adelante, sin revertir lo ya devengado.

### Requisito: Búsqueda Ampliada de Asesores
El sistema DEBE exponer `GET /api/advisors/search`, protegido para rol `admin`, permitiendo buscar asesores por nombre, apellido, DNI/documento, código comercial y email. La coincidencia DEBE ser parcial e insensible a mayúsculas/acentos para nombre y apellido, y por prefijo para el documento. Los resultados DEBEN incluir asesores activos e inactivos por defecto, mostrando el estado de cada uno.

#### 🔑 Escenario 11: Búsqueda por Nombre con Coincidencia Parcial e Insensible a Acentos
* **Given** un asesor llamado "María José",
* **When** un administrador busca "maria" en `GET /api/advisors/search`,
* **Then** el sistema retorna al asesor pese a la diferencia de mayúsculas y acentos.

#### 🔑 Escenario 12: Búsqueda por Apellido
* **Given** un asesor con apellido "Gómez",
* **When** un administrador busca "gomez",
* **Then** el sistema retorna la coincidencia por apellido de forma parcial e insensible a acentos.

#### 🔑 Escenario 13: Búsqueda por Prefijo de DNI/Documento
* **Given** un asesor con documento "30123456",
* **When** un administrador busca "301",
* **Then** el sistema retorna el asesor por coincidencia de prefijo del documento.

#### 🔑 Escenario 14: Búsqueda por Código Comercial o Email (Retrocompatibilidad)
* **Given** los campos de búsqueda ya existentes (código de promotor y email),
* **When** un administrador busca por cualquiera de ellos,
* **Then** el sistema conserva el comportamiento de coincidencia ya vigente.

#### ⚠️ Escenario 15: Búsqueda con Query Vacía
* **Given** un administrador que no ingresa texto de búsqueda,
* **When** ejecuta `GET /api/advisors/search`,
* **Then** el sistema retorna el listado completo de asesores, activos e inactivos.

#### ⚠️ Escenario 16: Búsqueda Sin Resultados
* **Given** un término de búsqueda que no coincide con ningún asesor,
* **When** se ejecuta la búsqueda,
* **Then** el sistema retorna una lista vacía sin error.

#### 🛡️ Escenario 17: Intento de Búsqueda por un No-Administrador
* **Given** un usuario sin rol `admin`,
* **When** invoca `GET /api/advisors/search`,
* **Then** la API responde 403 (Forbidden).

#### 🔑 Escenario 18: Resultados Incluyen Asesores Inactivos Correctamente Etiquetados
* **Given** una base con asesores activos e inactivos,
* **When** un administrador realiza cualquier búsqueda válida,
* **Then** el sistema incluye ambos grupos en los resultados, indicando el estado de cada uno.
