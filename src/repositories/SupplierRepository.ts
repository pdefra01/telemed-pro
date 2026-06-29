import { supabase } from '../services/supabase';
import { PharmacySupplier, PharmacySupplierOrder, SupplierAccountMovement } from '../types';

export class SupplierRepository {
  /**
   * Obtiene todos los proveedores / droguerías
   */
  async getSuppliers(): Promise<PharmacySupplier[]> {
    const { data, error } = await supabase
      .from('pharmacy_suppliers')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      name: row.name,
      cuit: row.cuit,
      contactEmail: row.contact_email,
      phone: row.phone,
      currentBalance: Number(row.current_balance),
      status: row.status,
      createdAt: row.created_at
    }));
  }

  /**
   * Crea un nuevo proveedor en el sistema
   */
  async createSupplier(supplierData: Omit<PharmacySupplier, 'id' | 'currentBalance'>): Promise<PharmacySupplier> {
    const { data, error } = await supabase
      .from('pharmacy_suppliers')
      .insert({
        name: supplierData.name.trim(),
        cuit: supplierData.cuit.trim(),
        contact_email: supplierData.contactEmail.trim(),
        phone: supplierData.phone?.trim() || null,
        status: supplierData.status || 'active'
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      cuit: data.cuit,
      contactEmail: data.contact_email,
      phone: data.phone,
      currentBalance: Number(data.current_balance),
      status: data.status,
      createdAt: data.created_at
    };
  }

  /**
   * Actualiza datos de un proveedor
   */
  async updateSupplier(id: string, supplierData: Partial<PharmacySupplier>): Promise<void> {
    const payload: any = {};
    if (supplierData.name) payload.name = supplierData.name.trim();
    if (supplierData.cuit) payload.cuit = supplierData.cuit.trim();
    if (supplierData.contactEmail) payload.contact_email = supplierData.contactEmail.trim();
    if (supplierData.phone !== undefined) payload.phone = supplierData.phone;
    if (supplierData.status) payload.status = supplierData.status;

    const { error } = await supabase
      .from('pharmacy_suppliers')
      .update(payload)
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Obtiene las Órdenes de Compra a droguería
   */
  async getSupplierOrders(): Promise<PharmacySupplierOrder[]> {
    const { data, error } = await supabase
      .from('pharmacy_supplier_orders')
      .select('*, pharmacy_suppliers(name), pharmacy_products(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      supplierId: row.supplier_id,
      productId: row.product_id,
      quantityOrdered: row.quantity_ordered,
      unitCost: Number(row.unit_cost),
      totalCost: Number(row.total_cost),
      status: row.status,
      createdAt: row.created_at,
      supplierName: row.pharmacy_suppliers?.name || 'Droguería',
      productName: row.pharmacy_products?.name || 'Medicamento'
    }));
  }

  /**
   * Emite una nueva Órden de Compra (OC) a un proveedor
   */
  async createSupplierOrder(orderData: {
    supplierId: string;
    productId: string;
    quantityOrdered: number;
    unitCost: number;
  }): Promise<PharmacySupplierOrder> {
    const totalCost = orderData.quantityOrdered * orderData.unitCost;

    const { data, error } = await supabase
      .from('pharmacy_supplier_orders')
      .insert({
        supplier_id: orderData.supplierId,
        product_id: orderData.productId,
        quantity_ordered: orderData.quantityOrdered,
        unit_cost: orderData.unitCost,
        total_cost: totalCost,
        status: 'sent'
      })
      .select('*, pharmacy_suppliers(name), pharmacy_products(name)')
      .single();

    if (error) throw error;

    return {
      id: data.id,
      supplierId: data.supplier_id,
      productId: data.product_id,
      quantityOrdered: data.quantity_ordered,
      unitCost: Number(data.unit_cost),
      totalCost: Number(data.total_cost),
      status: data.status,
      createdAt: data.created_at,
      supplierName: data.pharmacy_suppliers?.name || 'Droguería',
      productName: data.pharmacy_products?.name || 'Medicamento'
    };
  }

  /**
   * Recibe una Órden de Compra: acredita el stock en un nuevo lote y registra el movimiento de cuenta corriente
   */
  async receiveSupplierOrder(order: PharmacySupplierOrder, batchNumber: string, expirationDate: string): Promise<void> {
    // 1. Marcar OC como recibida
    const { error: orderErr } = await supabase
      .from('pharmacy_supplier_orders')
      .update({ status: 'received' })
      .eq('id', order.id);

    if (orderErr) throw orderErr;

    // 2. Insertar lote en inventario
    const cleanBatch = batchNumber.trim() || `OC-${order.id.substring(0, 6).toUpperCase()}`;
    const { error: batchErr } = await supabase
      .from('pharmacy_inventory')
      .insert({
        product_id: order.productId,
        batch_number: cleanBatch,
        expiration_date: expirationDate,
        stock_quantity: order.quantityOrdered
      });

    if (batchErr) throw batchErr;

    // 3. Registrar débito en Cuenta Corriente del Proveedor (Deuda por OC)
    const { error: moveErr } = await supabase
      .from('supplier_account_movements')
      .insert({
        supplier_id: order.supplierId,
        order_id: order.id,
        type: 'purchase_order',
        amount: order.totalCost,
        description: `Recepción OC #${order.id.substring(0, 8).toUpperCase()} - ${order.quantityOrdered} un. de ${order.productName || 'Medicamento'}`
      });

    if (moveErr) console.warn("Error al registrar movimiento en CC:", moveErr);

    // 4. Actualizar saldo actual del proveedor
    const { data: sup } = await supabase
      .from('pharmacy_suppliers')
      .select('current_balance')
      .eq('id', order.supplierId)
      .single();

    if (sup) {
      const newBalance = Number(sup.current_balance) + order.totalCost;
      await supabase
        .from('pharmacy_suppliers')
        .update({ current_balance: newBalance })
        .eq('id', order.supplierId);
    }
  }

  /**
   * Registra un Pago a Proveedor en la Cuenta Corriente
   */
  async recordSupplierPayment(supplierId: string, amount: number, description: string): Promise<void> {
    const { error: moveErr } = await supabase
      .from('supplier_account_movements')
      .insert({
        supplier_id: supplierId,
        type: 'payment',
        amount,
        description: description.trim() || 'Pago / Cancelación de Saldo'
      });

    if (moveErr) throw moveErr;

    const { data: sup } = await supabase
      .from('pharmacy_suppliers')
      .select('current_balance')
      .eq('id', supplierId)
      .single();

    if (sup) {
      const newBalance = Math.max(0, Number(sup.current_balance) - amount);
      await supabase
        .from('pharmacy_suppliers')
        .update({ current_balance: newBalance })
        .eq('id', supplierId);
    }
  }

  /**
   * Obtiene los movimientos de Cuenta Corriente de un proveedor
   */
  async getAccountMovements(supplierId: string): Promise<SupplierAccountMovement[]> {
    const { data, error } = await supabase
      .from('supplier_account_movements')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      supplierId: row.supplier_id,
      orderId: row.order_id,
      type: row.type,
      amount: Number(row.amount),
      description: row.description,
      createdAt: row.created_at
    }));
  }
}

export const supplierRepository = new SupplierRepository();
