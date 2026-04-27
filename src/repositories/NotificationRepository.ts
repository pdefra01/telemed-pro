import { supabase } from '../services/supabase';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export class NotificationRepository {
  /**
   * Obtiene las notificaciones del usuario actual
   */
  async getMyNotifications(): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }

    return (data || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      message: row.message,
      type: row.type as any,
      isRead: row.is_read,
      link: row.link,
      createdAt: row.created_at
    }));
  }

  /**
   * Marca una notificación como leída
   */
  async markAsRead(notificationId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;
  }

  /**
   * Suscripción en tiempo real a nuevas notificaciones
   */
  subscribeToNotifications(userId: string, onNotification: (payload: Notification) => void) {
    return supabase
      .channel(`user-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          const row = payload.new as any;
          onNotification({
            id: row.id,
            userId: row.user_id,
            title: row.title,
            message: row.message,
            type: row.type as any,
            isRead: row.is_read,
            link: row.link,
            createdAt: row.created_at
          });
        }
      )
      .subscribe();
  }
}

export const notificationRepository = new NotificationRepository();
