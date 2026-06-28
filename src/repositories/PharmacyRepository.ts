import { supabase } from '../services/supabase';
import { PharmacyProduct, PharmacyInventory } from '../types';

export class PharmacyRepository {
  /**
   * Obtiene la lista completa de productos del catálogo con soporte para búsqueda y categoría.
   */
  async getProducts(filters?: { query?: string; category?: string; requiresPrescription?: boolean }): Promise<PharmacyProduct[]> {
    let q = supabase.from('pharmacy_products').select('*');

    if (filters?.category && filters.category !== 'all') {
      q = q.eq('category', filters.category);
    }
    if (filters?.requiresPrescription !== undefined) {
      q = q.eq('requires_prescription', filters.requiresPrescription);
    }
    if (filters?.query) {
      q = q.or(`name.ilike.%${filters.query}%,active_ingredient.ilike.%${filters.query}%,laboratory.ilike.%${filters.query}%`);
    }

    const { data, error } = await q.order('name', { ascending: true });

    if (error) {
      console.error("Error obteniendo catálogo de farmacia:", error);
      throw error;
    }

    return (data || []).map(row => ({
      id: row.id,
      name: row.name,
      activeIngredient: row.active_ingredient,
      presentation: row.presentation,
      laboratory: row.laboratory,
      price: Number(row.price),
      requiresPrescription: row.requires_prescription,
      category: row.category,
      imageUrl: row.image_url
    }));
  }

  /**
   * Obtiene un producto por su ID
   */
  async getProductById(productId: string): Promise<PharmacyProduct | null> {
    const { data, error } = await supabase
      .from('pharmacy_products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      activeIngredient: data.active_ingredient,
      presentation: data.presentation,
      laboratory: data.laboratory,
      price: Number(data.price),
      requiresPrescription: data.requires_prescription,
      category: data.category,
      imageUrl: data.image_url
    };
  }

  /**
   * Obtiene el stock disponible por lotes para un producto
   */
  async getProductInventory(productId: string): Promise<PharmacyInventory[]> {
    const { data, error } = await supabase
      .from('pharmacy_inventory')
      .select('*')
      .eq('product_id', productId)
      .order('expiration_date', { ascending: true });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      productId: row.product_id,
      batchNumber: row.batch_number,
      expirationDate: row.expiration_date,
      stockQuantity: row.stock_quantity,
      reservedQuantity: row.reserved_quantity
    }));
  }

  /**
   * Registra un nuevo lote de producto en el inventario
   */
  async addInventoryBatch(batchData: {
    productId: string;
    batchNumber: string;
    expirationDate: string;
    stockQuantity: number;
  }): Promise<PharmacyInventory> {
    const { data, error } = await supabase
      .from('pharmacy_inventory')
      .insert({
        product_id: batchData.productId,
        batch_number: batchData.batchNumber.trim(),
        expiration_date: batchData.expirationDate,
        stock_quantity: batchData.stockQuantity
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      productId: data.product_id,
      batchNumber: data.batch_number,
      expirationDate: data.expiration_date,
      stockQuantity: data.stock_quantity,
      reservedQuantity: data.reserved_quantity
    };
  }

  /**
   * Agrega un nuevo producto al catálogo (Admin)
   */
  async createProduct(productData: Omit<PharmacyProduct, 'id'>): Promise<PharmacyProduct> {
    const { data, error } = await supabase
      .from('pharmacy_products')
      .insert({
        name: productData.name.trim(),
        active_ingredient: productData.activeIngredient.trim(),
        presentation: productData.presentation.trim(),
        laboratory: productData.laboratory.trim(),
        price: productData.price,
        requires_prescription: productData.requiresPrescription,
        category: productData.category,
        image_url: productData.imageUrl
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      activeIngredient: data.active_ingredient,
      presentation: data.presentation,
      laboratory: data.laboratory,
      price: Number(data.price),
      requiresPrescription: data.requires_prescription,
      category: data.category,
      imageUrl: data.image_url
    };
  }
}

export const pharmacyRepository = new PharmacyRepository();
