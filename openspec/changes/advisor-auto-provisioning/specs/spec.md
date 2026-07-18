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
