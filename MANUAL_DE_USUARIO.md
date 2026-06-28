# Manual del Usuario — Plataforma MEDINEX v2.0

Bienvenido al manual oficial de la plataforma **MEDINEX**. Este documento guía a los usuarios (Pacientes, Médicos y Administradores) en el uso de las herramientas del sistema, incluyendo los módulos de **Receta Electrónica Criptográfica**, **Perfil de Paciente y Grupo Familiar**, y el **Módulo de Encuestas y Campañas de Censado Epidemiológico**.

---

## 🚀 Guía Rápida por Rol

| Rol | Flujo Principal | Acceso por Defecto |
|-----|-----------------|--------------------|
| **Paciente** | Responder censos, ver recetas verificadas y gestionar grupo familiar | DNI o Email / `password123` |
| **Médico** | Atender consultas y emitir recetas firmadas digitalmente con PIN | `doctor@medinex.com` / `password123` |
| **Administrador** | Administrar usuarios, diseñar encuestas y lanzar campañas epidemiológicas | `admin@medinex.com` / `password123` |

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

### 2.1. Cierre de Consulta y Receta Digital (`PostConsultation`)
Durante la atención de un turno activo, el profesional médica accede al panel de post-consultación:
1. Registrar el diagnóstico (CIE-10 / texto).
2. Habilitar **Receta Electrónica** y agregar los medicamentos e indicaciones.
3. Hacer clic en **Finalizar Consulta**.

### 2.2. Firma Digital con PIN de Seguridad
Al finalizar una consulta con receta, se despliega el modal de firma electrónica avanzada:
- **Primera vez**: El sistema solicitará definir un **PIN de 6 dígitos**. Se generará un par de claves asimétricas **ECDSA (P-256)** y la clave privada se cifrará localmente con el PIN.
- **Firmas subsiguientes**: Ingresar el PIN de 6 dígitos para autorizar y firmar criptográficamente la receta.
- El PDF generado incluirá el código de autenticidad criptográfica y la matrícula profesional (`license_number`).

---

## 🛠️ 3. Módulo para Administradores (Command Center)

### 3.1. Diseñador de Encuestas (`/survey-builder`)
Permite a los auditores médicos diseñar cuestionarios dinámicos para relevar patologías crónicas:
1. Acceder a **Encuestas** en el menú lateral.
2. Hacer clic en **Nueva Encuesta** e ingresar título y objetivo.
3. Agregar preguntas configurando el tipo de respuesta (Opción Única, Múltiple, Sí/No, Valor Numérico o Texto Libre).
4. Guardar la plantilla para dejarla disponible para campañas.

### 3.2. Gestión de Campañas y Disparadores Automáticos (`/campaigns`)
Permite lanzar censos masivos y configurar acciones inteligentes:
1. Acceder a **Campañas** y presionar **Nueva Campaña**.
2. Seleccionar la encuesta asociada y definir el grupo objetivo (Todos los afiliados o por convenio).
3. **Configurar Disparadores de Acciones**: Definir reglas automáticas basadas en las respuestas del paciente:
   - *Ejemplo*: Si "Presión Sistólica" > 140 → Disparar **⚠️ Alerta Médica Prioritaria**.
   - *Ejemplo*: Si "Controles al día" = No → Disparar **🩺 Invitación a Turno Preventivo**.
4. Hacer clic en **Activar Campaña** para notificar automáticamente a todos los afiliados asignados.

---

## 📋 Checklist de Verificación de Funcionalidades

- [x] **Receta Electrónica**: Firma ECDSA con PIN + Verificación Client-Side en portal del paciente.
- [x] **Perfil & Familiares**: Registro de datos médicos y gestión de dependientes.
- [x] **Diseñador de Encuestas**: Creación de plantillas dinámicas multitipo.
- [x] **Campañas de Censado**: Activación masiva y evaluación automática de reglas clínicas.
