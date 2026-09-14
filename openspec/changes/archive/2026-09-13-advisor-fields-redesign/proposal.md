# Proposal: Rediseño de Alta y Métricas de Productividad de Asesores (Promotores)

## 1. Objetivos Comerciales y Producto
1. Reestructurar la información de alta de los asesores en el OCC (separar Nombre/Apellido, DNI, celular, correo personal y domicilio particular, removiendo el campo de comisión).
2. Incorporar métricas de productividad en la consola del asesor, permitiéndole monitorear su embudo de ventas en tiempo real:
   * **Links Compartidos**: Cantidad de veces que copió o envió el enlace personalizado.
   * **Formularios Completados**: Solicitudes de adhesión enviadas bajo su código.
   * **Altas Acreditadas**: Solicitudes aprobadas con pago verificado.
   * **Tasa de Conversión**: Porcentaje de efectividad.

---

## 2. Requerimientos Funcionales y de UI

### 🖥️ Panel OCC (ProducersAdmin.tsx)
* Formulario con inputs: Nombre, Apellido, DNI, Celular, Correo Personal, Domicilio Particular, Código Único y Contraseña Inicial.
* Sin campo de tasa de comisión.

### 🔗 Consola del Asesor (AdvisorDashboard.tsx)
* Tarjeta de KPI en el panel superior mostrando "Links Compartidos".
* Al hacer click en "Copiar Enlace" o "Compartir por WhatsApp", se enviará una petición en segundo plano para registrar y persistir el incremento de compartición.
* Gráfico o panel mostrando la tasa de conversión en base al embudo de productividad.

---

## 3. Base de Datos
* Agregar la columna `links_shared_count` (INTEGER, DEFAULT 0, NOT NULL) a la tabla `producers`.
