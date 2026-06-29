# Manual del Usuario — Plataforma MEDINEX v2.0

Bienvenido al manual oficial de la plataforma **MEDINEX**. Este documento guía a los usuarios (Pacientes, Médicos y Administradores) en el uso de las herramientas del sistema, incluyendo los módulos de **Receta Electrónica Criptográfica**, **Control de Jornada Laboral y Geofencing por IP**, **Indicadores y Analítica Evolutiva**, **Ficha Médica Integral**, **Vademécum & Stock de Medicamentos** y el **Módulo de Encuestas y Campañas de Censado Epidemiológico**.

---

## 🚀 Guía Rápida por Rol

| Rol | Flujo Principal | Acceso por Defecto |
|-----|-----------------|--------------------|
| **Paciente** | Responder censos, ver recetas verificadas y gestionar grupo familiar | DNI o Email / `password123` |
| **Médico** | Fichar jornada por IP, atender consultas, consultar vademécum y emitir recetas firmadas con PIN | `medico@medinex.com.ar` / `medico123` |
| **Administrador** | Administrar usuarios y sucursales, auditar tendencias evolutivas y lanzar campañas epidemiológicas | `admin@medinex.com` / `password123` |

---

## 👤 1. Módulo para Pacientes y Afiliados

### 1.1. Gestión del Perfil y Grupo Familiar (`/profile`)
Desde la sección **Mi Perfil**, el afiliado titular puede mantener actualizada su información médica y familiar:
- **Datos del Titular**: Actualización de nombre, teléfono, dirección, **Grupo Sanguíneo** (A+, O+, etc.) y **Fecha de Nacimiento**.
- **Grupo Familiar**: Alta y baja de dependientes cubiertos por el plan de salud (cónyuge, hijos, padres). Los familiares quedan vinculados automáticamente al grupo familiar del titular.

### 1.2. Consulta de Historia Clínica y Recetas (`/history`)
En la pestaña **Historia Clínica**, el paciente dispone de la bóveda médica con:
- **Evoluciones Médicas y Estudios**: Diagnósticos y adjuntos de laboratorio e imágenes.
- **Recetas Digitales**: Acceso a las indicaciones farmacológicas y descarga de PDF oficial.
- **Badge de Verificación Criptográfica**: Cada receta cuenta con un badge dinámico en pantalla:
  - 🟢 **Firma ECDSA Verificada**: Garantiza autenticidad e integridad del documento.
  - 🔴 **Firma Inválida — Documento Alterado**: Alerta sobre modificaciones no autorizadas.
  - 🔘 **Sin Firma Criptográfica**: Recetas emitidas en modo legacy.

### 1.3. Respuesta de Censos de Salud (`/patient-surveys`)
Cuando la administración lanza una campaña epidemiológica, el paciente recibe una notificación in-app:
1. Acceder a **Prevención & Salud → Censos Epidemiológicos**.
2. Seleccionar el censo pendiente y responder las preguntas estructuradas (opción múltiple, valores numéricos, Sí/No).
3. Presionar **Enviar Censo**. El sistema evaluará las respuestas e informará si se activó alguna recomendación de salud o alerta médica.

---

## 🩺 2. Módulo para Médicos

### 2.1. Control de Jornada Laboral y Fichado por IP (`DoctorDashboard`)
Para comenzar a atender consultas en la clínica, el profesional médico debe registrar su ingreso:
1. En el encabezado del **Dashboard Médico**, presionar el botón **Fichar Entrada**.
2. **Validación Geográfica por IP**: El sistema verificará de forma automática si la IP pública de la red actual pertenece a una sucursal física autorizada. Si la IP es válida, la jornada comenzará y se activará el temporizador en vivo (`00h 00m 00s`) indicando la sucursal asignada.
3. Al finalizar la guardia o turno, presionar **Fichar Salida**. El sistema registrará los minutos totales trabajados.

### 2.2. Indicadores Clínicos en Tiempo Real (`DoctorDashboard`)
El panel superior HUD muestra los indicadores operativos clave del profesional:
- **Consultas Pendientes**: Total de pacientes aguardando en la sala de espera.
- **Consultas Efectivas**: Total de atenciones completadas en el período.
- **Tiempo Promedio de Sesión**: Duración media en minutos por paciente, con selector interactivo de rango temporal (**Diario**, **Semanal**, **Mensual**).
- **Búsqueda Global por DNI**: Buscador directo para consultar pacientes en toda la red clínica e inspeccionar su bóveda de antecedentes.

### 2.3. Vademécum & Consulta de Inventario de Medicamentos
El médico puede consultar las existencias de la farmacia digital en cualquier momento:
1. Presionar el botón **💊 Vademécum & Stock** en la barra de acciones principal.
2. Ingresar el nombre del medicamento, droga o laboratorio. El modal mostrará el stock exacto disponible en vivo (`ej: Stock: 42 un.`).

### 2.4. Cierre de Consulta, Receta Criptográfica y Descuento de Stock (`PostConsultation`)
Durante la atención de un turno activo:
1. Registrar el diagnóstico y las notas evolutivas.
2. **Autocompletado de Receta**: Al escribir un medicamento, el sistema desplegará las sugerencias del catálogo oficial indicando su stock en vivo. Si el producto se selecciona del catálogo, quedará vinculado automáticamente.
3. **Firma Criptográfica con PIN de 6 dígitos**:
   - *Primera vez*: Definir un PIN de 6 dígitos para generar el par de claves asimétricas **ECDSA (P-256)**.
   - *Médico recurrente*: Ingresar el PIN de 6 dígitos para autorizar y firmar la receta.
4. **Deducción Automática de Inventario**: Al emitirse la receta firmada, la plataforma descontará atómicamente las unidades del stock de los lotes activos de farmacia según su fecha de vencimiento (método FIFO).

---

## 🛠️ 3. Módulo para Administradores (Command Center)

### 3.1. Analítica Evolutiva y Filtros por Médico (`AdminDashboard`)
El Command Center cuenta con herramientas de inteligencia operativa avanzada:
- **Barra de Control de Filtros**: Permite alternar la visualización entre la **🌐 Red Clínica Global** o auditar el desempeño de un médico específico.
- **Selector Temporal**: Filtro para evaluar tendencias a nivel **Diario** (bloques horarios), **Semanal** (días) o **Mensual** (semanas).
- **Gráficos Evolutivos (Recharts)**:
  - *Flujo Evolutivo de Consultas*: Volumen de atenciones y porcentaje de variación respecto al período anterior.
  - *Tendencia Promedio de Sesión*: Comparativa en minutos del tiempo dedicado por atención.
  - *Horas de Guardia Fichadas*: Auditoría de horas trabajadas reales en sucursales.

### 3.2. Red de Oficinas Autorizadas y Control de IP (`/settings`)
En la sección **OCC Settings**, los administradores pueden gestionar las sucursales físicas:
1. Acceder a **Red de Oficinas Autorizadas (Control de IP Pública)**.
2. Hacer clic en **Nueva Sucursal**, ingresar el nombre del centro médico e indicar la IP pública autorizada.
3. **🪄 Detectar mi IP actual**: Función automática que obtiene la IP pública de la red administrativa actual para darla de alta con un solo clic.

### 3.3. Legajo y Ficha Médica Integral (`/doctors`)
La gestión del cuerpo médico (`/doctors`) dispone del modal estructurado **Ficha Médica Integral**:
- **Pestaña 1 (Datos Personales)**: Nombre, Email, Teléfono Móvil de Contacto, CUIT/CUIL Fiscal y Especialidad.
- **Pestaña 2 (Licencias & Título)**: Matrícula Nacional (MN), Matrícula Provincial (MP), Universidad de Egreso y Año de Titulación.
- **Pestaña 3 (Vínculo Laboral)**: **Fecha de Inicio de Relación Laboral**, **Fecha de Fin de Relación Laboral (Opcional)**, Honorario por Consulta ($ ARS) y Contraseña Temporal de Acceso.
- La tabla principal destaca de forma inmediata las insignias de licencias y los rangos de fechas contractuales de cada profesional.

### 3.5. Centro de Gestión de Farmacia ERP & Análisis Pareto ABC (`/admin/pharmacy`)
El panel administrativo de farmacia e inventario se estructura en 5 pestañas de control institucional:
1. **Catálogo Comercial**: Alta/edición de medicamentos con precio, laboratorio, droga activa y configuración de **Stock Mínimo** y **Cantidad de Reposición (OC)**.
2. **Stock & Lotes**: Control de remesas y trazabilidad por vencimiento con ajuste manual de unidades en existencias.
3. **Órdenes de Compra (OC)**: Detección automática de insumos con stock crítico y emisión de pedidos a droguerías. Incluye el modal **Confirmar Recepción de Mercadería** que acredita el stock al inventario en un solo clic.
4. **Proveedores & Cuentas Corrientes**: CRUD de droguerías con CUIT, saldo adeudado acumulado en tiempo real y libro de movimientos financieros de cuenta corriente para registrar pagos y transferencias.
5. **Ranking & Pareto ABC**: Dashboard de inteligencia de inventario que clasifica los medicamentos según la regla 80/20 en Clase A (Alta rotación / 80% vol), Clase B (Rotación media / 15% vol) y Clase C (Baja rotación / 5% vol). Cuenta con los botones **🔄 Ejecutar Recálculo Pareto** (para actualizar a demanda) y **⚡ Aplicar Umbrales Sugeridos** (para sincronizar los puntos de reorden).

---

## 📋 Checklist de Verificación de Funcionalidades v2.0

- [x] **Receta Electrónica Criptográfica**: Firma ECDSA con PIN + Verificación Client-Side + Deducción Automática de Stock FIFO.
- [x] **Jornada Laboral & IP Whitelist**: Fichado con temporizador y geofencing por IP pública de sucursal con autodetección administrativa.
- [x] **KPIs & Analítica Evolutiva**: Indicadores dinámicos filtrables por médico y rango temporal (Diario, Semanal, Mensual).
- [x] **Ficha Médica Integral**: Legajo profesional completo con matrículas (MN/MP), CUIT, formación y fechas de relación laboral.
- [x] **Vademécum & Farmacia ERP**: Buscador médico en vivo, control de stock por lote, OC automáticas, cuentas corrientes de proveedores y Matriz Pareto ABC.
- [x] **Perfil & Grupo Familiar**: Registro de datos médicos y gestión de dependientes.
- [x] **Campañas Epidemiológicas**: Censos masivos con evaluación de reglas clínicas automáticas.

