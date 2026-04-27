import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { 
  TrendingUp, Users, DollarSign, AlertTriangle, 
  Building2, ArrowUpRight, Activity, ShieldCheck,
  CreditCard, Clock
} from 'lucide-react';
import { dashboardRepository, AdminMetrics, WeeklyStat } from '../../repositories/DashboardRepository';
import { doctorRepository } from '../../repositories/DoctorRepository';
import { Doctor } from '../../types';

const OCC_COLORS = {
  emerald: '#10b981',
  blue: '#3b82f6',
  indigo: '#6366f1',
  rose: '#f43f5e',
  amber: '#f59e0b'
};

// Glass Card Component
const GlassCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <div className={`bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden transition-all duration-300 hover:border-white/20 ${className}`}>
    {children}
  </div>
);

// High-Impact Metric Card
const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: string;
  color: keyof typeof OCC_COLORS;
}> = ({ icon, label, value, trend, color }) => (
  <GlassCard className="p-6 group">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-2xl bg-white/5 border border-white/10 text-white transition-transform duration-300 group-hover:scale-110`} style={{ color: OCC_COLORS[color] }}>
        {icon}
      </div>
      {trend && (
        <span className="flex items-center text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
          <ArrowUpRight size={10} className="mr-1" />
          {trend}
        </span>
      )}
    </div>
    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">{label}</p>
    <h4 className="text-3xl font-bold text-white tracking-tight">{value}</h4>
  </GlassCard>
);

const AdminDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<AdminMetrics>({
    totalDoctors: 0,
    totalAffiliates: 0,
    recentAppointments: 0,
    activeAgreements: 0,
    monthlyRevenue: 0,
    pendingInvoices: 0
  });
  const [topDoctors, setTopDoctors] = useState<Doctor[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [metricsData, doctorsData, weeklyStats] = await Promise.all([
          dashboardRepository.getMetrics(),
          doctorRepository.getAllDoctors(),
          dashboardRepository.getWeeklyStats()
        ]);
        setMetrics(metricsData);
        setWeeklyData(weeklyStats);
        setTopDoctors([...doctorsData].sort((a, b) => b.rating - a.rating).slice(0, 5));
      } catch (error) {
        console.error("Error loading dashboard data", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">Live Monitor</h2>
          <h1 className="text-4xl font-black text-white tracking-tighter">
            Operational <span className="text-slate-500 font-light italic">Command</span> Center
          </h1>
        </div>
        <div className="flex items-center space-x-3 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]"></div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Sistemas Estables</span>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link to="/affiliates" className="block transform transition-transform hover:scale-[1.02]">
          <MetricCard
            icon={<Users size={20} />}
            label="Afiliados"
            value={isLoading ? "---" : metrics.totalAffiliates.toLocaleString()}
            trend="+12%"
            color="blue"
          />
        </Link>
        <Link to="/agreements" className="block transform transition-transform hover:scale-[1.02]">
          <MetricCard
            icon={<Building2 size={20} />}
            label="Convenios"
            value={isLoading ? "---" : metrics.activeAgreements}
            trend="+3"
            color="indigo"
          />
        </Link>
        <Link to="/billing" className="block transform transition-transform hover:scale-[1.02]">
          <MetricCard
            icon={<DollarSign size={20} />}
            label="Recaudación"
            value={isLoading ? "---" : `$${(metrics.monthlyRevenue / 1000).toFixed(1)}k`}
            trend="+8.4%"
            color="emerald"
          />
        </Link>
        <Link to="/billing" className="block transform transition-transform hover:scale-[1.02]">
          <MetricCard
            icon={<CreditCard size={20} />}
            label="Facturas Pend."
            value={isLoading ? "---" : metrics.pendingInvoices}
            color="amber"
          />
        </Link>
      </div>

      {/* Charts & Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Revenue/Activity Chart */}
        <GlassCard className="lg:col-span-2 p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-xl font-bold text-white">Flujo de Consultas</h3>
              <p className="text-sm text-slate-500">Actividad semanal consolidada</p>
            </div>
            <div className="flex space-x-2">
              <button className="px-3 py-1 text-[10px] font-bold uppercase bg-white/10 text-white rounded-lg border border-white/10">7 Días</button>
              <button className="px-3 py-1 text-[10px] font-bold uppercase text-slate-500 hover:text-white transition-colors">30 Días</button>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData}>
                <defs>
                  <linearGradient id="colorConsultations" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={OCC_COLORS.emerald} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={OCC_COLORS.emerald} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '16px',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                  itemStyle={{ color: OCC_COLORS.emerald }}
                />
                <Area 
                  type="monotone" 
                  dataKey="consultations" 
                  stroke={OCC_COLORS.emerald} 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorConsultations)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Status / Health Cards */}
        <div className="space-y-6">
          <GlassCard className="p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center">
              <Activity size={18} className="mr-2 text-blue-400" />
              Estado Operativo
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Médicos Online</span>
                <span className="text-white font-bold">{metrics.totalDoctors}</span>
              </div>
              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full w-[85%] rounded-full shadow-[0_0_8px_#3b82f6]"></div>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Cupo Consultas</span>
                <span className="text-white font-bold">72%</span>
              </div>
              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full w-[72%] rounded-full shadow-[0_0_8px_#10b981]"></div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6 bg-rose-500/5 border-rose-500/20">
            <h3 className="text-lg font-bold text-rose-400 mb-4 flex items-center">
              <AlertTriangle size={18} className="mr-2" />
              Alertas Críticas
            </h3>
            <div className="space-y-3">
              <div className="flex items-start space-x-3 text-xs">
                <div className="w-2 h-2 mt-1 rounded-full bg-rose-500 flex-shrink-0 animate-ping"></div>
                <p className="text-slate-300 italic">3 afiliados con deuda superaron el periodo de gracia.</p>
              </div>
              <div className="flex items-start space-x-3 text-xs">
                <div className="w-2 h-2 mt-1 rounded-full bg-amber-500 flex-shrink-0"></div>
                <p className="text-slate-300 italic">Tasa de ausentismo médico > 15% en Clínica Médica.</p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Rankings / Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <GlassCard className="lg:col-span-3 p-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-white">Top Performance Médico</h3>
            <button className="text-xs font-bold text-emerald-400 hover:underline">Ver Reporte Completo</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                  <th className="pb-4">Profesional</th>
                  <th className="pb-4">Especialidad</th>
                  <th className="pb-4">Consultas</th>
                  <th className="pb-4 text-right">Satisfacción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr><td colSpan={4} className="py-8 text-center text-slate-500 animate-pulse">Analizando métricas...</td></tr>
                ) : topDoctors.map((doc) => (
                  <tr key={doc.id} className="group hover:bg-white/5 transition-colors">
                    <td className="py-4">
                      <div className="flex items-center space-x-3">
                        <img 
                          src={doc.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(doc.name)}&background=10b981&color=fff`} 
                          className="w-10 h-10 rounded-xl border border-white/10" 
                          alt="" 
                        />
                        <span className="font-bold text-white group-hover:text-emerald-400 transition-colors">{doc.name}</span>
                      </div>
                    </td>
                    <td className="py-4 text-sm text-slate-400 font-medium">{doc.specialty}</td>
                    <td className="py-4">
                      <div className="flex items-center text-xs font-bold text-slate-200">
                        <Clock size={12} className="mr-1 text-blue-400" />
                        {Math.floor(Math.random() * 50) + 10}
                      </div>
                    </td>
                    <td className="py-4 text-right">
                      <div className="inline-flex items-center bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl">
                        <span className="text-emerald-400 font-black text-xs mr-1">{doc.rating}</span>
                        <ShieldCheck size={12} className="text-emerald-500" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default AdminDashboard;
