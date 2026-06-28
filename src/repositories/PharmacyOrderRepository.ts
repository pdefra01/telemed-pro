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
    subtotal: number;
    coverageDiscount: number;
    total: number;
    items: { productId: string; quantity: number; unitPrice: number }[];
  }): Promise<PharmacyOrder> {
    // 1. Insertar cabecera de la orden
    const { data: orderRow, error: orderError } = await supabase
      .from('pharmacy_orders')
      .insert({
        patient_id: orderData.patientId,
        prescription_id: orderData.prescriptionId || null,
        status: 'paid', // En este MVP asumimos checkout exitoso simulado
        subtotal: orderData.subtotal,
        coverage_discount: orderData.coverageDiscount,
        total: orderData.total,
        delivery_address: orderData.deliveryAddress.trim()
      })
      .select()
      .single();

    if (orderError) {
      console.error("Error creando orden de farmacia:", orderError);
      throw orderError;
    }

    // 2. Insertar ítems de la orden
    const itemsToInsert = orderData.items.map(item => ({
      order_id: orderRow.id,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice
    }));

    const { error: itemsError } = await supabase
      .from('pharmacy_order_items')
      .insert(itemsToInsert);

    if (itemsError) {
      console.error("Error insertando ítems de orden de farmacia:", itemsError);
      throw itemsError;
    }

    // 3. Descontar stock del inventario (FIFO por fecha de vencimiento)
    for (const item of orderData.items) {
      const { data: batches } = await supabase
        .from('pharmacy_inventory')
        .select('*')
        .eq('product_id', item.productId)
        .gt('stock_quantity', 0)
        .order('expiration_date', { ascending: true });

      if (batches && batches.length > 0) {
        let remainingNeeded = item.quantity;
        for (const batch of batches) {
          if (remainingNeeded <= 0) break;
          const deduct = Math.min(batch.stock_quantity, remainingNeeded);
          const newStock = batch.stock_quantity - deduct;
          await supabase
            .from('pharmacy_inventory')
            .update({ stock_quantity: newStock })
            .eq('id', batch.id);
          remainingNeeded -= deduct;
        }
      }
    }

    // 4. Si la compra proviene de una receta electrónica, marcarla como dispensada
    if (orderData.prescriptionId) {
      await supabase
        .from('prescriptions')
        .update({ status: 'dispensed' })
        .eq('id', orderData.prescriptionId);
    }

    // 5. Crear automáticamente el registro de cadetería asignado
    await supabase.from('pharmacy_deliveries').insert({
      order_id: orderRow.id,
      courier_name: 'Marcos Benítez (Cadete MEDINEX)',
      courier_phone: '+54 387 512 3456',
      tracking_status: 'assigned',
      current_lat: -24.7859,
      current_lng: -65.4117
    });

    return {
      id: orderRow.id,
      patientId: orderRow.patient_id,
      prescriptionId: orderRow.prescription_id,
      status: orderRow.status,
      subtotal: Number(orderRow.subtotal),
      coverageDiscount: Number(orderRow.coverage_discount),
      total: Number(orderRow.total),
      deliveryAddress: orderRow.delivery_address,
      createdAt: orderRow.created_at,
    };
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

