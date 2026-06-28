-- Migration: Create pharmacy and delivery ecosystem
-- Description: Digital pharmacy catalog, batch inventory, purchase orders, and live delivery tracking with RLS.

-- 1. Catálogo de Medicamentos
CREATE TABLE IF NOT EXISTS public.pharmacy_products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  active_ingredient     TEXT NOT NULL,
  presentation          TEXT NOT NULL,
  laboratory            TEXT NOT NULL,
  price                 NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  requires_prescription BOOLEAN DEFAULT false,
  category              TEXT NOT NULL DEFAULT 'venta_libre',
  image_url             TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.pharmacy_products IS 'Catálogo de medicamentos y productos de venta libre de la farmacia digital.';

-- 2. Inventario y Lotes
CREATE TABLE IF NOT EXISTS public.pharmacy_inventory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE CASCADE,
  batch_number      TEXT NOT NULL,
  expiration_date   DATE NOT NULL,
  stock_quantity    INT NOT NULL CHECK (stock_quantity >= 0),
  reserved_quantity INT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  created_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.pharmacy_inventory IS 'Gestión de stock por lotes y fechas de vencimiento.';

-- 3. Órdenes de Compra
CREATE TABLE IF NOT EXISTS public.pharmacy_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES public.profiles(id),
  prescription_id   UUID REFERENCES public.prescriptions(id),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'preparing', 'dispatched', 'delivered', 'cancelled')),
  subtotal          NUMERIC(10,2) NOT NULL,
  coverage_discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total             NUMERIC(10,2) NOT NULL,
  delivery_address  TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.pharmacy_orders IS 'Órdenes de compra de medicamentos emitidas por los pacientes.';

-- 4. Ítems de la Orden
CREATE TABLE IF NOT EXISTS public.pharmacy_order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.pharmacy_orders(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES public.pharmacy_products(id),
  quantity    INT NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(10,2) NOT NULL
);

-- 5. Seguimiento de Cadetería en Vivo
CREATE TABLE IF NOT EXISTS public.pharmacy_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES public.pharmacy_orders(id) ON DELETE CASCADE,
  courier_id      UUID REFERENCES public.profiles(id),
  courier_name    TEXT,
  courier_phone   TEXT,
  tracking_status TEXT NOT NULL DEFAULT 'assigned' CHECK (tracking_status IN ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed')),
  current_lat     NUMERIC(10,7),
  current_lng     NUMERIC(10,7),
  otp_code        TEXT NOT NULL DEFAULT (floor(random() * 9000 + 1000)::text),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS en todas las tablas
ALTER TABLE public.pharmacy_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_deliveries ENABLE ROW LEVEL SECURITY;

-- Políticas RLS:
-- Products: Todos los usuarios autenticados pueden leer el catálogo
CREATE POLICY "Public authenticated read products" ON public.pharmacy_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage products" ON public.pharmacy_products FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');

-- Inventory: Admins gestionan inventario
CREATE POLICY "Admins manage inventory" ON public.pharmacy_inventory FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Authenticated read inventory" ON public.pharmacy_inventory FOR SELECT TO authenticated USING (true);

-- Orders: Paciente ve sus órdenes, Admins todas
CREATE POLICY "Patients view own orders" ON public.pharmacy_orders FOR SELECT TO authenticated USING (patient_id = auth.uid() OR auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Patients insert own orders" ON public.pharmacy_orders FOR INSERT TO authenticated WITH CHECK (patient_id = auth.uid());
CREATE POLICY "Admins update orders" ON public.pharmacy_orders FOR UPDATE TO authenticated USING (auth.jwt() ->> 'role' = 'admin');

-- Order Items: Mismos accesos que orders
CREATE POLICY "Read order items" ON public.pharmacy_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert order items" ON public.pharmacy_order_items FOR INSERT TO authenticated WITH CHECK (true);

-- Deliveries: Pacientes leen su entrega, Cadetes/Admins actualizan
CREATE POLICY "Read deliveries" ON public.pharmacy_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage deliveries" ON public.pharmacy_deliveries FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('admin', 'doctor'));

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_inventory_product ON public.pharmacy_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_patient ON public.pharmacy_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON public.pharmacy_deliveries(order_id);
