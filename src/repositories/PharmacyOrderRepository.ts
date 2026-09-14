import { supabase } from '../services/supabase';
import { PharmacyOrder, PharmacyOrderItem } from '../types';

export class PharmacyOrderRepository {
  /**
   * Crea una nueva orden de compra de farmacia con sus ítems
   */
  async createOrder(orderData: {
    patientId: string;
    prescriptionId?: string;
    deliveryAddress: string;
    items: { productId: string; quantity: number }[];
  }): Promise<PharmacyOrder> {
    // Orden creada atómicamente vía RPC SECURITY DEFINER: recomputa subtotal/total
    // desde el catálogo real, descuenta stock con bloqueo de fila, y crea
    // orden + ítems + delivery en una sola transacción. Si algo falla (stock
    // insuficiente, producto inexistente, etc.) toda la transacción se revierte
    // — nunca queda una orden 'paid' huérfana ni parcial. La tasa de descuento es
    // una regla de negocio fija del servidor (no se envía ni se acepta desde el
    // cliente, para que no pueda ser manipulada).
    const { data: orderId, error: rpcError } = await supabase.rpc('create_pharmacy_order', {
      p_patient_id: orderData.patientId,
      p_items: orderData.items.map(item => ({
        product_id: item.productId,
        quantity: item.quantity
      })),
      p_prescription_id: orderData.prescriptionId || null,
      p_delivery_address: orderData.deliveryAddress.trim()
    });

    if (rpcError) {
      console.error("Error creando orden de farmacia (RPC atómica):", rpcError);
      throw rpcError;
    }

    if (!orderId) {
      throw new Error('No se pudo crear la orden de farmacia: la RPC no devolvió un id de orden.');
    }

    const order = await this.getOrderById(orderId as string);
    if (!order) {
      throw new Error('La orden se creó pero no pudo recuperarse.');
    }

    return order;
  }

  /**
   * Obtiene todas las órdenes de un paciente
   */
  async getPatientOrders(patientId: string): Promise<PharmacyOrder[]> {
    const { data, error } = await supabase
      .from('pharmacy_orders')
      .select(`
        *,
        items:pharmacy_order_items(
          id, product_id, quantity, unit_price,
          product:pharmacy_products(name)
        )
      `)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      patientId: row.patient_id,
      prescriptionId: row.prescription_id,
      status: row.status,
      subtotal: Number(row.subtotal),
      coverageDiscount: Number(row.coverage_discount),
      total: Number(row.total),
      deliveryAddress: row.delivery_address,
      createdAt: row.created_at,
      items: (row.items || []).map((i: any) => ({
        id: i.id,
        productId: i.product_id,
        productName: i.product?.name || 'Producto',
        quantity: i.quantity,
        unitPrice: Number(i.unit_price)
      }))
    }));
  }

  /**
   * Obtiene los detalles de una orden por su ID
   */
  async getOrderById(orderId: string): Promise<PharmacyOrder | null> {
    const { data, error } = await supabase
      .from('pharmacy_orders')
      .select(`
        *,
        items:pharmacy_order_items(
          id, product_id, quantity, unit_price,
          product:pharmacy_products(name)
        )
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      patientId: data.patient_id,
      prescriptionId: data.prescription_id,
      status: data.status,
      subtotal: Number(data.subtotal),
      coverageDiscount: Number(data.coverage_discount),
      total: Number(data.total),
      deliveryAddress: data.delivery_address,
      createdAt: data.created_at,
      items: (data.items || []).map((i: any) => ({
        id: i.id,
        productId: i.product_id,
        productName: i.product?.name || 'Producto',
        quantity: i.quantity,
        unitPrice: Number(i.unit_price)
      }))
    };
  }

  /**
   * Obtiene todas las órdenes de la plataforma (Admin)
   */
  async getAllOrders(): Promise<(PharmacyOrder & { patientName?: string; deliveryStatus?: string; courierName?: string; otpCode?: string })[]> {
    const { data, error } = await supabase
      .from('pharmacy_orders')
      .select(`
        *,
        patient:profiles!patient_id(full_name),
        delivery:pharmacy_deliveries!order_id(tracking_status, courier_name, otp_code),
        items:pharmacy_order_items(
          id, product_id, quantity, unit_price,
          product:pharmacy_products(name)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error obteniendo todas las órdenes:", error);
      throw error;
    }

    return (data || []).map(row => {
      const deliv = Array.isArray(row.delivery) ? row.delivery[0] : row.delivery;
      return {
        id: row.id,
        patientId: row.patient_id,
        patientName: row.patient?.full_name || 'Paciente MEDINEX',
        prescriptionId: row.prescription_id,
        status: row.status,
        subtotal: Number(row.subtotal),
        coverageDiscount: Number(row.coverage_discount),
        total: Number(row.total),
        deliveryAddress: row.delivery_address,
        createdAt: row.created_at,
        deliveryStatus: deliv?.tracking_status || 'assigned',
        courierName: deliv?.courier_name || 'Cadete Asignado',
        otpCode: deliv?.otp_code || '0000',
        items: (row.items || []).map((i: any) => ({
          id: i.id,
          productId: i.product_id,
          productName: i.product?.name || 'Producto',
          quantity: i.quantity,
          unitPrice: Number(i.unit_price)
        }))
      };
    });
  }
}

export const pharmacyOrderRepository = new PharmacyOrderRepository();

