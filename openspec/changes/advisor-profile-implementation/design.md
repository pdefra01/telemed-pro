# Design: Habilitación del Perfil Asesor

## 1. Cambios en Base de Datos (Postgres / Supabase)

### 1.1. Tabla `announcements` (Anuncios gerenciales)
Almacena las comunicaciones publicadas por los administradores con destino a los asesores:
```sql
CREATE TABLE IF NOT EXISTS public.announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "All authenticated can view announcements" ON public.announcements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage announcements" ON public.announcements
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

### 1.2. Tabla `announcement_reads` (Control de lectura)
Registra la fecha y hora en que cada asesor lee un anuncio determinado:
```sql
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Users can manage their own reads" ON public.announcement_reads
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### 1.3. Campo `promoter_code` en `profiles`
Para poder asociar las adhesiones capturadas mediante el `promoter_id` del formulario, los perfiles de los asesores tendrán un `promoter_code` único en la tabla `profiles`:
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS promoter_code TEXT UNIQUE;
```

---

## 2. API REST Endpoints (Express - server.js)

### 2.1. `GET /api/advisor/stats`
Consolida métricas del mes y acumuladas en base al código de promotor del asesor autenticado:
* **Entrada**: Token de autenticación del usuario.
* **Proceso**:
  1. Obtiene el perfil del asesor (`promoter_code`).
  2. Consulta la cantidad de registros en `adhesion_requests` donde `promoter_id = promoter_code`.
  3. Clasifica las solicitudes por estado (`pending`, `approved`, `rejected`).
  4. Calcula la comisión acumulada en base a las solicitudes aprobadas ($10.000 por afiliado).
* **Salida**: JSON con KPIs detallados.

### 2.2. `GET /api/announcements`
Lista de anuncios ordenada por fecha de creación, incluyendo una bandera `read` si el usuario actual ya tiene un registro en `announcement_reads`.

### 2.3. `POST /api/announcements/:id/read`
Marca un anuncio como leído insertando la relación en `announcement_reads` para el usuario actual.

---

## 3. Frontend & Layout (Vite / React)

### 3.1. `AdvisorDashboard.tsx`
* **Estilo**: Glassmorphism premium, Cinematic Dark, acentuado con verde esmeralda y oro (comisiones).
* **Secciones**:
  1. **Panel de KPIs**: Cards visuales con micro-animaciones en hover mostrando Adhesiones Totales, Aprobadas, Pendientes, y Comisiones Acumuladas.
  2. **Sección de Solicitudes**: Tabla dinámica con las adhesiones capturadas por el asesor, indicando su estado de aprobación.
  3. **Cartelera Gerencial**: Lista de anuncios interactivos con scroll suave y efectos glow. Permite hacer click para leer el detalle y marcar como leído.
  4. **Panel de Autogestión**: Formulario para cambiar celular, dirección y contraseña de forma directa.

### 3.2. Ruteo Lateral (`Sidebar`)
Adaptar la barra lateral de navegación para que si el rol del usuario en la sesión es `advisor`, se muestren los enlaces a su Dashboard y a su configuración, ocultando paneles no correspondientes (médicos o pacientes).
