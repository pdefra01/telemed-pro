import { supabase } from '../services/supabase';
import { PharmacyDelivery } from '../types';

export class DeliveryRepository {
  /**
   * Obtiene la información de entrega y seguimiento de una orden
   */
  async getDeliveryByOrderId(orderId: string): Promise<PharmacyDelivery | null> {
    const { data, error } = await supabase
      .from('pharmacy_deliveries')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      orderId: data.order_id,
      courierId: data.courier_id,
      courierName: data.courier_name || 'Cadete Asignado',
      courierPhone: data.courier_phone || '+54 387 500 0000',
      trackingStatus: data.tracking_status,
      currentLat: data.current_lat ? Number(data.current_lat) : undefined,
      currentLng: data.current_lng ? Number(data.current_lng) : undefined,
      otpCode: data.otp_code,
      updatedAt: data.updated_at
    };
  }

  /**
   * Actualiza el estado del seguimiento y coordenadas del cadete
   */
  async updateTrackingStatus(
    deliveryId: string,
    status: 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed',
    coords?: { lat: number; lng: number }
  ): Promise<void> {
    const payload: any = {
      tracking_status: status,
      updated_at: new Date().toISOString()
    };
    if (coords) {
      payload.current_lat = coords.lat;
      payload.current_lng = coords.lng;
    }

    const { error } = await supabase
      .from('pharmacy_deliveries')
      .update(payload)
      .eq('id', deliveryId);

    if (error) throw error;
  }

  /**
   * Valida la entrega comparando el código OTP ingresado por el cadete
   */
  async verifyOtpAndDeliver(deliveryId: string, inputOtp: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('pharmacy_deliveries')
      .select('otp_code, order_id')
      .eq('id', deliveryId)
      .single();

    if (error || !data) return false;

    if (data.otp_code.trim() === inputOtp.trim()) {
      // 1. Marcar delivery como delivered
      await this.updateTrackingStatus(deliveryId, 'delivered');
      // 2. Marcar orden como delivered
      await supabase
        .from('pharmacy_orders')
        .update({ status: 'delivered' })
        .eq('id', data.order_id);
      return true;
    }

    return false;
  }
}

export const deliveryRepository = new DeliveryRepository();
