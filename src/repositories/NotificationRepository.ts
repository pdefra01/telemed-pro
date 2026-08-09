import type { RealtimeChannel } from '@supabase/supabase-js';
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
  // Un solo canal realtime por userId, compartido entre todos los suscriptores
  // (NotificationBell, NotificationListener, dashboards) para evitar abrir
  // múltiples conexiones redundantes a la misma tabla/filtro.
  private notificationChannels = new Map<
    string,
    {
      channel: RealtimeChannel;
      listeners: Set<(payload: Notification) => void>;
      pendingTeardown: object | null;
    }
  >();

  /**
   * Obtiene las notificaciones del usuario actual
   */
  async getMyNotifications(userId: string): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
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
    let entry = this.notificationChannels.get(userId);

    if (!entry) {
      const listeners = new Set<(payload: Notification) => void>();
      const channel = supabase
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
            const notification: Notification = {
              id: row.id,
              userId: row.user_id,
              title: row.title,
              message: row.message,
              type: row.type as any,
              isRead: row.is_read,
              link: row.link,
              createdAt: row.created_at
            };
            listeners.forEach(listener => listener(notification));
          }
        )
        .subscribe();

      entry = { channel, listeners, pendingTeardown: null };
      this.notificationChannels.set(userId, entry);
    } else {
      // A re-subscribe for this userId cancels any teardown scheduled by a
      // previous unsubscribe() so the still-open channel keeps being reused
      // instead of racing supabase-js's async removeChannel() teardown.
      entry.pendingTeardown = null;
    }

    entry.listeners.add(onNotification);

    return {
      unsubscribe: () => {
        const current = this.notificationChannels.get(userId);
        if (!current) return;

        current.listeners.delete(onNotification);
        if (current.listeners.size === 0) {
          const token = {};
          current.pendingTeardown = token;
          setTimeout(() => {
            const latest = this.notificationChannels.get(userId);
            if (
              latest === current &&
              latest.pendingTeardown === token &&
              latest.listeners.size === 0
            ) {
              supabase.removeChannel(latest.channel);
              this.notificationChannels.delete(userId);
            }
          }, 0);
        }
      }
    };
  }
}

export const notificationRepository = new NotificationRepository();
