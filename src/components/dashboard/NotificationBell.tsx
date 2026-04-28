import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, ExternalLink, Clock } from 'lucide-react';
import { notificationRepository, Notification } from '../../repositories/NotificationRepository';

interface Props {
  userId: string;
}

export const NotificationBell: React.FC<Props> = ({ userId }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    // Initial fetch
    const fetchNotifications = async () => {
      try {
        const data = await notificationRepository.getMyNotifications(userId);
        setNotifications(data);
      } catch (err) {
        console.error('Error fetching notifications:', err);
      }
    };

    fetchNotifications();

    // Subscribe to new notifications
    const subscription = notificationRepository.subscribeToNotifications(userId, (newNotif) => {
      setNotifications(prev => [newNotif, ...prev]);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [userId]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationRepository.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id);
    if (unreadIds.length === 0) return;

    try {
      // For simplicity, mark one by one or we could add a bulk method to repo
      await Promise.all(unreadIds.map(id => notificationRepository.markAsRead(id)));
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'success': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'warning': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'error': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all group"
      >
        <Bell size={24} className={unreadCount > 0 ? 'animate-bounce-subtle' : ''} />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-5 h-5 bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.5)]">
            {unreadCount > 9 ? '+9' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 w-96 max-h-[500px] bg-slate-900/90 backdrop-blur-3xl border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
            <h3 className="font-black text-white text-lg tracking-tight">Notificaciones</h3>
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllAsRead}
                className="text-[10px] font-black text-emerald-400 hover:text-emerald-300 uppercase tracking-widest transition-colors"
              >
                Marcar todo como leído
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-[380px] p-2 space-y-2">
            {notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell size={40} className="mx-auto text-slate-700 mb-4 opacity-20" />
                <p className="text-slate-500 font-medium italic">No hay novedades por ahora</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div 
                  key={notif.id}
                  className={`group/item relative p-4 rounded-2xl border transition-all duration-300 ${
                    notif.isRead 
                      ? 'bg-transparent border-transparent opacity-60' 
                      : 'bg-white/5 border-white/5 hover:border-white/10 shadow-lg'
                  }`}
                >
                  {!notif.isRead && (
                    <div className="absolute top-4 left-2 w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                  )}
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter border ${getTypeStyles(notif.type)}`}>
                      {notif.type}
                    </div>
                    <div className="flex-1">
                      <h4 className={`text-sm font-black tracking-tight mb-1 ${notif.isRead ? 'text-slate-400' : 'text-white'}`}>
                        {notif.title}
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed mb-3">
                        {notif.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center text-[9px] text-slate-600 font-bold uppercase tracking-widest">
                          <Clock size={10} className="mr-1" />
                          {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="flex items-center gap-2">
                          {notif.link && (
                            <a 
                              href={notif.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all"
                              title="Ver detalle"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                          {!notif.isRead && (
                            <button 
                              onClick={() => handleMarkAsRead(notif.id)}
                              className="p-1.5 rounded-lg bg-white/5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                              title="Marcar como leído"
                            >
                              <Check size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 bg-white/5 border-t border-white/10 text-center">
            <button className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.3em] transition-colors">
              Ver historial completo
            </button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 2s infinite;
        }
      `}} />
    </div>
  );
};
