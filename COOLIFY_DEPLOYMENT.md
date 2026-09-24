# Guía de Despliegue en Coolify — MEDINEX v2.0

Esta guía detalla los pasos exactos para desplegar la plataforma **MEDINEX** en una instancia propia de **Coolify** utilizando el `Dockerfile` multietapa optimizado del proyecto.

---

## 📋 Resumen de Configuración en Coolify

| Parámetro | Valor Recomendado |
|-----------|-------------------|
| **Build Pack / Deployment Type** | `Dockerfile` |
| **Dockerfile Location** | `/Dockerfile` |
| **Port / Destination Port** | `3000` (o `3005` según tu variable `PORT`) |
| **Health Check Path** | `/health` |

---

## 🔑 1. Configuración de Variables en Coolify

> [!IMPORTANT]
> Vite compila las variables que empiezan con `VITE_` dentro del código JavaScript del navegador **durante el tiempo de compilación (Build Time)**. Por lo tanto, deben declararse como **Build Arguments** en Coolify.

### A) Build Arguments / Build Secrets (Variables de Compilación)
Configurar estas variables en la sección **Build Variables / Arguments** de la aplicación en Coolify:

| Variable | Descripción | Ejemplo / Valor |
|----------|-------------|-----------------|
| `VITE_SUPABASE_URL` | URL pública de tu proyecto Supabase | `https://fevdxgmtrhvwiuulopcf.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Clave anónima pública de Supabase | `eyJhbGciOi...` |
| `VITE_LIVEKIT_URL` | URL de tu servidor LiveKit (WSS/HTTPS) | `wss://medinex-livekit.com` |

---

### B) Environment Variables (Variables de Tiempo de Ejecución)
Configurar estas variables en la sección **Environment Variables** de Coolify para que `server.js` pueda ejecutar el backend administrativo y generar tokens de videollamada:

| Variable | Descripción | Ejemplo / Valor |
|----------|-------------|-----------------|
| `NODE_ENV` | Entorno de ejecución | `production` |
| `PORT` | Puerto donde escuchará Express | `3000` |
| `SUPABASE_URL` | URL de Supabase para el cliente de administración | `https://fevdxgmtrhvwiuulopcf.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta administrativa (Service Role) | `eyJhbGciOi...` |
| `LIVEKIT_API_KEY` | Clave API de LiveKit para firmar tokens | `APIxxxxxx` |
| `LIVEKIT_API_SECRET` | Clave secreta API de LiveKit | `secretxxxxxx` |
| `MERCADOPAGO_ACCESS_TOKEN` | Token de acceso de producción para Mercado Pago | `APP_USR-...` |
| `MERCADOPAGO_WEBHOOK_SECRET` | Secreto para verificar firmas de webhooks | `...` |
| `WHATSAPP_GATEWAY_URL` | URL **interna** del gateway de WhatsApp (ver sección 4) | `http://waha:3000` |
| `WHATSAPP_GATEWAY_API_KEY` | Clave con la que `server.js` llama al gateway | `(cadena larga aleatoria)` |
| `WHATSAPP_GATEWAY_SESSION` | Nombre de la sesión del gateway (opcional) | `default` |

---

## 🚀 2. Pasos Paso a Paso en el Panel de Coolify

1. **Crear Nueva Aplicación**:
   - Ir a tu proyecto en Coolify → **+ Add Resource** → **Private Repository** (o Public Repository).
   - Conectar tu repositorio Git donde se encuentra el código de MEDINEX.

2. **Seleccionar Build Pack**:
   - En la configuración general de la aplicación, seleccionar **Dockerfile** como el tipo de construcción.

3. **Ingresar Variables de Entorno y Build**:
   - Copiar y pegar las variables de compilación (Sección 1.A) y de entorno (Sección 1.B).

4. **Configurar Dominio y Health Check**:
   - En **Domains**, agregar tu dominio de producción (ej: `https://app.medinex.com`). Coolify generará automáticamente el certificado SSL mediante Let's Encrypt.
   - En **Health Check**, establecer el path en `/health` y el puerto en `3000`.

5. **Desplegar**:
   - Hacer clic en **Deploy**. Coolify construirá el frontend con Vite, empaquetará el servidor de producción Express y activará la aplicación.

---

## 🔍 3. Verificación del Despliegue

Una vez completado el despliegue en Coolify:
- **Verificar Health Check**: Acceder a `https://tu-dominio.com/health` (debe retornar `{"status":"ok","uptime":...}`).
- **Verificar Aplicación**: Acceder a la URL principal e iniciar sesión con las credenciales de prueba.
- **Verificar Videollamadas**: Entrar a una sala de consulta para confirmar que `server.js` genere correctamente los tokens JWT de LiveKit.

---

## 💬 4. WhatsApp para recetas (celular de la empresa)

Las recetas se envían al paciente **desde el número de la empresa**, nunca desde el celular del médico. Un contenedor **WAHA** queda vinculado al celular de la empresa (como un "dispositivo vinculado", igual que WhatsApp Web) y `server.js` le pide cada envío.

> [!WARNING]
> Es un canal **no oficial**: WhatsApp puede bloquear el número. Usarlo solo para las recetas de pacientes que acaban de tener una consulta, sin envíos masivos ni mensajes repetidos.

### A) Crear el servicio del gateway en Coolify

1. En el mismo proyecto/entorno que la app: **+ Add Resource → Docker Image** con `devlikeapro/waha`.
2. Variables de entorno del servicio:
   - `WAHA_API_KEY` = la misma cadena que pondrás en `WHATSAPP_GATEWAY_API_KEY` de la app. Es la variable que lee esta versión de WAHA: con otro nombre WAHA genera una clave aleatoria en cada reinicio y todo responde 401.
   - `WHATSAPP_DEFAULT_ENGINE` = `GOWS`. Es el motor que logró vincular el número; `WEBJS` falló al escanear y `NOWEB` fue inestable.
   - `WAHA_DASHBOARD_USERNAME` y `WAHA_DASHBOARD_PASSWORD` = usuario y clave del panel. Si no se definen, WAHA genera una clave aleatoria que imprime **una sola vez** en los logs del primer arranque.
   - `WHATSAPP_START_SESSION` = `default` (inicia la sesión al arrancar). El nombre debe ser exactamente `default` (o el valor de `WHATSAPP_GATEWAY_SESSION`).
3. **Persistencia**: montar un volumen en `/app/.sessions`. Sin él, la vinculación se pierde en cada redeploy y hay que volver a escanear el QR.
4. **No publicar el puerto ni asignarle dominio público.** El gateway debe ser alcanzable solo por la red interna de Coolify.
5. En la app, cargar `WHATSAPP_GATEWAY_URL` con la URL interna que Coolify muestra para ese servicio (ej. `http://waha:3000`) y las otras dos variables de la sección 1.B. Redeploy de la app.

> [!NOTE]
> Los nombres de variables y rutas de WAHA pueden cambiar entre versiones. Confirmalos en la documentación de la versión que instales antes de desplegar.

> [!IMPORTANT]
> En Coolify, un cambio de variables de entorno solo se aplica con **Redeploy**; **Restart** reinicia el contenedor con la configuración vieja. Para confirmar qué valor tiene realmente el contenedor, abrí su pestaña **Terminal** y corré `env | grep -i key`.

### B) Vincular el celular de la empresa (una sola vez)

Antes de empezar: el celular de la empresa debe tener **internet (datos o wifi) y WhatsApp/WhatsApp Business actualizado**. Sin conexión en el celular, WhatsApp muestra "No se pudo vincular el dispositivo" al instante, aunque todo lo demás esté bien.

1. Asignar un **dominio temporal** al servicio del gateway (Coolify → servicio → **Domains** → *Generate Domain*, guardar y **Redeploy**). Es el único momento en que el gateway queda público.
2. Entrar a `<dominio>/dashboard` con `WAHA_DASHBOARD_USERNAME` / `WAHA_DASHBOARD_PASSWORD`.
3. En **Workers** → editar el worker y cargar la API key completa (`WAHA_API_KEY`). El campo recorta visualmente los valores largos: verificá el valor real con `env | grep -i key` en la Terminal del contenedor.
4. En **Sessions**, iniciar la sesión `default` (debe pasar a `SCAN_QR_CODE`).
5. Vincular con **código** (más confiable que el QR, que rota cada ~20 segundos). Dejá el celular en WhatsApp → **Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono** con el teclado listo, y pedí el código:
   ```
   POST <dominio>/api/default/auth/request-code
   X-Api-Key: <WAHA_API_KEY>
   {"phoneNumber": "549XXXXXXXXXX"}
   ```
   (número en formato internacional, sin `+` ni espacios). Ingresá el código de inmediato: vence en pocos segundos.
6. Verificar que la sesión figure en estado **WORKING**.
7. **Quitar el dominio temporal** (dejar el campo *Domains* vacío, guardar) y hacer **Redeploy**: el gateway debe volver a ser solo interno.

Si falla: evitá reintentar en ráfaga (WhatsApp puede bloquear el número); revisá primero la conexión del celular. Si la sesión pasó a `FAILED`, reiniciala (`POST /api/sessions/default/restart`) antes de pedir otro código.

### C) Migración de base de datos

Aplicar con `supabase db push` las migraciones de los registros de envío y de la receta de obra social:
- `20260920010000_prescription_deliveries.sql` (recetas)
- `20260922000000_adhesion_payment_link_deliveries.sql` (link de pago de la adhesión)
- `20260923000000_prescriptions_external_url.sql` (link de receta de obra social)

### D) Mantenimiento y cuidados

- **Conectar el celular al menos una vez cada ~14 días** (abrir WhatsApp con internet); si no, WhatsApp desvincula el dispositivo.
- Si la sesión se cae, el médico verá el aviso *"El WhatsApp de la empresa no está conectado"* y un botón **Reenviar**. Volver a escanear el QR (paso B) y reenviar.
- Cada intento (enviado o fallido) queda en la tabla `prescription_deliveries`.
- El sistema bloquea reenvíos de la misma receta dentro del minuto para proteger el número.

### E) Verificación

1. Hacer una consulta de prueba con receta a un paciente con teléfono válido (formato argentino: con o sin +54 / 9 / 15).
2. Al finalizar, el paciente debe recibir el PDF desde el número de la empresa y el médico ver *"Enviado por WhatsApp"*.
3. Confirmar que en el mensaje **no** aparece el número del médico.
