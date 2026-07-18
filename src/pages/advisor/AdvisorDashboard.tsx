import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Users, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Megaphone, 
  KeyRound, 
  Save, 
  MapPin, 
  Phone, 
  Mail, 
  Lock,
  User as UserIcon,
  ChevronRight
} from 'lucide-react';
import { User } from '../../types';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fevdxgmtrhvwiuulopcf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface AdvisorDashboardProps {
  user: User;
}

interface SaleRequest {
  id: string;
  titular_name: string;
  titular_dni: string;
  plan_type: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  read: boolean;
}

interface StatsData {
  totalSales: number;
  approvedSales: number;
  pendingSales: number;
  commissions: number;
  sales: SaleRequest[];
}

export const AdvisorDashboard: React.FC<AdvisorDashboardProps> = ({ user }) => {
  const [stats, setStats] = useState<StatsData>({
    totalSales: 0,
    approvedSales: 0,
    pendingSales: 0,
    commissions: 0,
    sales: []
  });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeAnn, setActiveAnn] = useState<Announcement | null>(null);
  
  // Estados de autogestión
  const [phone, setPhone] = useState(user.phone || '');
  const [address, setAddress] = useState('');
  const [locality, setLocality] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [email, setEmail] = useState(user.email || '');
  
  // Estados de clave
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(true);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Obtener Token de Acceso
  const getAccessToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const token = await getAccessToken();
      const headers = { 'Authorization': `Bearer ${token}` };

      // Cargar estadísticas
      const statsRes = await fetch('/api/advisor/stats', { headers });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // Cargar anuncios
      const annRes = await fetch('/api/announcements', { headers });
      if (annRes.ok) {
        const annData = await annRes.json();
        setAnnouncements(annData);
      }

      // Cargar perfil completo desde Supabase
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone, address, locality, neighborhood')
        .eq('id', user.id)
        .single();
      
      if (profile) {
        if (profile.phone) setPhone(profile.phone);
        if (profile.address) setAddress(profile.address);
        if (profile.locality) setLocality(profile.locality);
        if (profile.neighborhood) setNeighborhood(profile.neighborhood);
      }

    } catch (err) {
      console.error("Error cargando datos del dashboard de asesor:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleMarkAsRead = async (ann: Announcement) => {
    if (ann.read) {
      setActiveAnn(ann);
      return;
    }

    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/announcements/${ann.id}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        setAnnouncements(prev => prev.map(a => a.id === ann.id ? { ...a, read: true } : a));
        setActiveAnn({ ...ann, read: true });
      }
    } catch (err) {
      console.error("Error al marcar como leído:", err);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingProfile(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          phone,
          address,
          locality,
          neighborhood,
          email
        })
        .eq('id', user.id);

      if (error) throw error;
      setMessage({ text: 'Perfil actualizado correctamente.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Error al actualizar el perfil.', type: 'error' });
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'Las contraseñas no coinciden.', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ text: 'La contraseña debe tener al menos 6 caracteres.', type: 'error' });
      return;
    }

    setUpdatingPassword(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage({ text: 'Contraseña actualizada correctamente.', type: 'success' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMessage({ text: err.message || 'Error al actualizar la contraseña.', type: 'error' });
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-955 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400 font-medium font-sans">Cargando consola del asesor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 font-sans w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-200 to-indigo-400 bg-clip-text text-transparent">
            Consola del Asesor Comercial
          </h1>
          <p className="text-slate-400 mt-1">
            Bienvenido, <span className="font-semibold text-white">{user.name}</span>. Código Promotor: <span className="font-mono text-emerald-400">{user.promoter_code || 'PROMO_GLOBAL'}</span>
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-3">
          <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-sm font-medium text-emerald-400">Canal QR Activo</span>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {message && (
        <div className={`p-4 mb-6 rounded-2xl border flex items-center gap-3 ${
          message.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* KPI: Comisiones */}
        <div className="bg-slate-900/50 backdrop-blur-md rounded-3xl p-6 border border-amber-500/20 shadow-xl hover:shadow-amber-500/5 transition-all hover:scale-[1.01] duration-300">
          <div className="flex justify-between items-start mb-4">
            <span className="text-slate-400 font-semibold text-sm">Comisiones Acumuladas</span>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-400 tracking-tight">
            ${stats.commissions.toLocaleString('es-AR')}
          </div>
          <p className="text-xs text-slate-400 mt-2">Monto estimado por adhesiones aprobadas</p>
        </div>

        {/* KPI: Total Ventas */}
        <div className="bg-slate-900/50 backdrop-blur-md rounded-3xl p-6 border border-emerald-500/20 shadow-xl hover:shadow-emerald-500/5 transition-all hover:scale-[1.01] duration-300">
          <div className="flex justify-between items-start mb-4">
            <span className="text-slate-400 font-semibold text-sm">Ventas Totales (QR)</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="text-3xl font-black text-white tracking-tight">{stats.totalSales}</div>
          <p className="text-xs text-slate-400 mt-2">Total de solicitudes capturadas</p>
        </div>

        {/* KPI: Ventas Aprobadas */}
        <div className="bg-slate-900/50 backdrop-blur-md rounded-3xl p-6 border border-teal-500/20 shadow-xl hover:shadow-teal-500/5 transition-all hover:scale-[1.01] duration-300">
          <div className="flex justify-between items-start mb-4">
            <span className="text-slate-400 font-semibold text-sm">Adhesiones Aprobadas</span>
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 flex items-center justify-center text-teal-400">
              <CheckCircle size={20} />
            </div>
          </div>
          <div className="text-3xl font-black text-teal-400 tracking-tight">{stats.approvedSales}</div>
          <p className="text-xs text-slate-400 mt-2">Afiliados incorporados al padrón</p>
        </div>

        {/* KPI: Ventas Pendientes */}
        <div className="bg-slate-900/50 backdrop-blur-md rounded-3xl p-6 border border-indigo-500/20 shadow-xl hover:shadow-indigo-500/5 transition-all hover:scale-[1.01] duration-300">
          <div className="flex justify-between items-start mb-4">
            <span className="text-slate-400 font-semibold text-sm">Adhesiones Pendientes</span>
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Clock size={20} />
            </div>
          </div>
          <div className="text-3xl font-black text-indigo-400 tracking-tight">{stats.pendingSales}</div>
          <p className="text-xs text-slate-400 mt-2">En revisión por administración</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Columna Izquierda: Ventas y Comunicados */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Listado de Solicitudes QR */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-slate-800 p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
              <Users size={20} className="text-emerald-400" />
              Tus Solicitudes de Adhesión (QR)
            </h2>
            
            {stats.sales.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                Aún no registrás solicitudes de adhesión capturadas con tu código.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                      <th className="py-4 font-semibold">Titular</th>
                      <th className="py-4 font-semibold">DNI</th>
                      <th className="py-4 font-semibold">Plan</th>
                      <th className="py-4 font-semibold">Fecha</th>
                      <th className="py-4 font-semibold text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.sales.map((sale) => (
                      <tr key={sale.id} className="border-b border-slate-800/40 hover:bg-slate-900/20 transition-all text-sm">
                        <td className="py-4 font-medium text-white">{sale.titular_name}</td>
                        <td className="py-4 text-slate-300 font-mono">{sale.titular_dni}</td>
                        <td className="py-4 text-slate-400">{sale.plan_type}</td>
                        <td className="py-4 text-slate-400">
                          {new Date(sale.created_at).toLocaleDateString('es-AR')}
                        </td>
                        <td className="py-4 text-right">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            sale.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            sale.status === 'rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                            'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}>
                            {sale.status === 'approved' ? 'Aprobada' :
                             sale.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Cartelera de Comunicados */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-slate-800 p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
              <Megaphone size={20} className="text-teal-400" />
              Cartelera de Anuncios Oficiales
            </h2>

            {announcements.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                No hay comunicados oficiales en la cartelera por el momento.
              </div>
            ) : (
              <div className="space-y-4">
                {announcements.map((ann) => (
                  <div 
                    key={ann.id} 
                    onClick={() => handleMarkAsRead(ann)}
                    className="p-4 rounded-2xl border border-slate-800 bg-slate-900/30 hover:bg-slate-900/50 hover:border-slate-700/60 cursor-pointer transition-all duration-300 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ann.read ? 'bg-slate-700' : 'bg-emerald-500 animate-pulse'}`} />
                      <div>
                        <h3 className="font-semibold text-slate-200 group-hover:text-white transition-colors">{ann.title}</h3>
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(ann.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 group-hover:text-emerald-400 transition-colors">
                      <span className="text-xs">Leer</span>
                      <ChevronRight size={16} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Columna Derecha: Detalles del Anuncio / Autogestión */}
        <div className="space-y-8">
          
          {/* Lector de Comunicado Activo */}
          {activeAnn && (
            <div className="bg-gradient-to-b from-slate-900/80 to-slate-950/40 rounded-3xl border border-teal-500/20 p-6 shadow-xl">
              <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Comunicado</span>
                <button 
                  onClick={() => setActiveAnn(null)}
                  className="text-xs text-slate-400 hover:text-white bg-slate-800/40 px-3 py-1 rounded-xl transition-all"
                >
                  Cerrar
                </button>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{activeAnn.title}</h3>
              <p className="text-xs text-slate-400 mb-4">
                Publicado el {new Date(activeAnn.created_at).toLocaleDateString('es-AR')}
              </p>
              <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800 text-sm leading-relaxed text-slate-300 max-h-48 overflow-y-auto font-sans whitespace-pre-line">
                {activeAnn.content}
              </div>
            </div>
          )}

          {/* Autogestión de Datos */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-slate-800 p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
              <UserIcon size={20} className="text-indigo-400" />
              Autogestión de Datos
            </h2>
            
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Mail size={12} /> Email
                </label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-2xl px-4 py-3 text-sm text-white transition-all font-sans"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Phone size={12} /> Teléfono Celular
                </label>
                <input 
                  type="text" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-2xl px-4 py-3 text-sm text-white transition-all font-sans"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <MapPin size={12} /> Domicilio
                </label>
                <input 
                  type="text" 
                  placeholder="Calle y altura"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-2xl px-4 py-3 text-sm text-white transition-all font-sans"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Localidad</label>
                  <input 
                    type="text" 
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-2xl px-4 py-3 text-sm text-white transition-all font-sans"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Barrio</label>
                  <input 
                    type="text" 
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-2xl px-4 py-3 text-sm text-white transition-all font-sans"
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={updatingProfile}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/10 text-sm"
              >
                <Save size={18} />
                {updatingProfile ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </form>
          </div>

          {/* Seguridad (Contraseña) */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-slate-800 p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
              <KeyRound size={20} className="text-amber-500" />
              Seguridad
            </h2>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Lock size={12} /> Nueva Contraseña
                </label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-2xl px-4 py-3 text-sm text-white transition-all font-sans"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Lock size={12} /> Confirmar Contraseña
                </label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-2xl px-4 py-3 text-sm text-white transition-all font-sans"
                  required
                />
              </div>

              <button 
                type="submit" 
                disabled={updatingPassword}
                className="w-full mt-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 text-sm"
              >
                <KeyRound size={18} />
                {updatingPassword ? 'Actualizando...' : 'Cambiar Contraseña'}
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
};
export default AdvisorDashboard;
