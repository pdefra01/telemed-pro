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
