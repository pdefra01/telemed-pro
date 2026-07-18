# Proposal: Habilitación del Perfil Asesor

## 1. Objetivos Comerciales y Producto
Habilitar un espacio de autogestión y control para el rol comercial de la plataforma (**Asesores / Promotores**), de manera que cada vendedor pueda realizar el seguimiento en tiempo real de sus indicadores de ventas y comisiones acumuladas, acceder a anuncios oficiales publicados por la gerencia, y autogestionar su perfil e información personal de forma segura.

---

## 2. Requerimientos Funcionales

### 📊 Dashboard del Asesor
* **Visualización de KPIs**: 
  * Total de adhesiones capturadas (en el mes actual y acumuladas históricas).
  * Monto acumulado de comisiones (calculado en base a un valor por afiliado adherido).
  * Tasa de conversión o porcentaje de solicitudes aprobadas por administración.
* **Listado de Solicitudes**: Vista de solicitudes de adhesión generadas bajo su identificador de promotor, indicando el estado actual (pendiente, aprobado, rechazado).

### 📢 Cartelera de Anuncios
* Espacio visual dentro del dashboard del asesor para visualizar comunicados, instructivos y cambios operativos emitidos por la Gerencia y la Administración.
* Indicador de anuncios no leídos.

### ⚙️ Autogestión del Perfil
* Edición de información de contacto: domicilio, localidad, barrio, celular y correo electrónico.
* Cambio de contraseña seguro desde la interfaz.

### 🏛️ Backoffice Administrativo (Operational Command Center)
* Panel para que la administración publique nuevos anuncios destinados a los asesores.
* Visualización en el panel administrativo del ranking y estadísticas de adhesiones por asesor.

---

## 3. Impacto Técnico y Arquitectura
* **Esquema de Base de Datos (Supabase)**:
  * El perfil del Asesor se registrará en la tabla `profiles` con `role = 'advisor'`.
  * Crearemos la tabla `announcements` para almacenar comunicados gerenciales (id, title, content, created_at, created_by).
  * Crearemos una tabla de lecturas de anuncios `announcement_reads` para controlar qué asesores ya leyeron cada publicación.
  * Extenderemos y asociaremos las solicitudes de adhesión de `adhesion_requests` a través del campo `promoter_id` con el respectivo asesor para consolidar los KPIs de venta y comisiones de forma dinámica sin duplicar datos.
* **Backend (REST API)**:
  * Endpoints en `server.js` para:
    * `/api/announcements`: Listar y publicar comunicados.
    * `/api/advisor/stats`: Obtener métricas consolidadas del asesor en base a su ID.
* **Frontend**:
  * Nueva ruta privada `/#/advisor/dashboard` que renderice la consola del asesor.
  * Menú de navegación lateral adaptativo: si el rol es `advisor`, mostrar el dashboard correspondiente.
  * Formulario de autogestión de perfil con cambio de clave.
