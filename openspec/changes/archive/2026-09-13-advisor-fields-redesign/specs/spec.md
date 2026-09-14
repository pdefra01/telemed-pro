# Specifications: Rediseño de Estructura de Alta y Productividad de Asesores

## 1. Escenarios de Negocio (Given/When/Then)

### 🔑 Escenario 1: Alta Exitosa de Asesor Comercial
* **Given** que un administrador autenticado en el OCC ingresa al modal "Alta de Asesor Comercial",
* **When** completa el formulario con los datos personales y hace click en "Guardar",
* **Then** la API Express `/api/create-advisor` debe procesar la solicitud, crear el usuario en Auth y registrar en `profiles` los campos correspondientes de manera consistente.

### 🛡️ Escenario 2: Asignación por Defecto de Comisión en el Backend
* **Given** que se ejecuta el proceso de alta del Asesor Comercial,
* **When** se invoca el backend sin proporcionar una tasa de comisión desde la interfaz de usuario,
* **Then** el endpoint debe registrar automáticamente la ficha comercial en la tabla `producers` con un valor por defecto de `10.00` (10%).

### 📊 Escenario 3: Incremento y Obtención de Métricas de Compartición de Enlace
* **Given** que un asesor comercial se encuentra autenticado en su dashboard,
* **When** hace click en "Copiar Enlace" o "Compartir por WhatsApp",
* **Then** el frontend debe invocar `POST /api/advisor/increment-share` y actualizar la métrica local incrementando en 1 el contador visual de "Links Compartidos".
