import React, { useEffect } from 'react';
import { notificationRepository } from '../../repositories/NotificationRepository';
import { useToast } from '../../context/ToastContext';
import { Bell } from 'lucide-react';

interface Props {
  userId: string;
}

/**
 * Headless component that listens for new notifications and triggers global toasts.
 */
export const NotificationListener: React.FC<Props> = ({ userId }) => {
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;

    const subscription = notificationRepository.subscribeToNotifications(userId, (notification) => {
      // Trigger global toast
      toast(notification.message, notification.type);
      
      // We could also play a subtle sound here if desired
      try {
        const audio = new Audio('/assets/notification-pop.mp3');
        audio.volume = 0.2;
        // audio.play(); // Usually blocked by browsers without interaction, but good to have
      } catch (e) {
        // Ignore audio errors
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [userId, toast]);

  return null; // Headless
};
