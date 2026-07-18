# Specifications: Habilitación del Perfil Asesor

## 1. Escenarios de Negocio (Given/When/Then)

### 📊 Escenario 1: Visualización de Indicadores de Venta
* **Given** que un Asesor con ID de promotor `promo_juan_123` e inicio de sesión activo ingresa a su Dashboard,
* **When** el sistema calcula las adhesiones asociadas en `adhesion_requests` bajo la columna `promoter_id`,
* **Then** el dashboard debe presentar de manera precisa las adhesiones Totales, las aprobadas, las pendientes y las comisiones calculadas en base a $10.000 por afiliado aprobado.

### 📢 Escenario 2: Cartelera de Anuncios Gerenciales
* **Given** que la administración publica un anuncio titulado "Nuevo Plan Premium Disponible" en la base de datos,
* **When** el Asesor entra a su cartelera en el Dashboard,
* **Then** debe poder leer el anuncio y este debe cambiar de estado de "No Leído" a "Leído", sincronizándolo en la base de datos para no volver a alertar.

### ⚙️ Escenario 3: Autogestión de Datos Personales
* **Given** que el Asesor se encuentra en la pantalla de Configuración de su perfil,
* **When** edita su domicilio a "Calle Falsa 123" y hace click en "Guardar Datos",
* **Then** la base de datos en `profiles` debe actualizar la dirección y el sistema debe notificar el éxito del guardado mediante un toast.

### 🔑 Escenario 4: Cambio de Contraseña Seguro
* **Given** que el Asesor ingresa su nueva contraseña en el formulario de seguridad,
* **When** confirma la acción,
* **Then** la API de autenticación de Supabase debe actualizar su clave de forma segura sin revelar datos en texto plano.

---

## 2. Requerimientos de Seguridad y Roles (RLS)
* **Visualización de Anuncios**: Todos los perfiles autenticados pueden ver anuncios, pero sólo los asesores leen el subconjunto relevante a su rol.
* **Autogestión de Perfil**: El asesor sólo puede actualizar las columnas de su propio registro en `profiles` (`user_id = auth.uid()`).
