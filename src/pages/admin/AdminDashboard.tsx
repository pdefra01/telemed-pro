import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { 
  TrendingUp, Users, DollarSign, AlertTriangle, 
  Building2, ArrowUpRight, Activity, ShieldCheck,
  CreditCard, Clock, Stethoscope
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
  tooltip?: string;
}> = ({ icon, label, value, trend, color, tooltip }) => (
  <GlassCard className="p-6 group relative overflow-visible">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-2xl bg-white/5 border border-white/10 text-white transition-transform duration-300 group-hover:scale-110`} style={{ color: OCC_COLORS[color] }}>
        {icon}
      </div>
      <div className="flex items-center gap-2">
        {trend && (
          <span className="flex items-center text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
            <ArrowUpRight size={10} className="mr-1" />
            {trend}
          </span>
        )}
        {tooltip && (
          <div className="group/tooltip relative flex items-center">
            <div className="w-5 h-5 rounded-full bg-white/5 border border-white/10 text-slate-400 group-hover/tooltip:text-white group-hover/tooltip:border-white/20 flex items-center justify-center text-[10px] font-bold font-mono cursor-help transition-colors">
              ?
            </div>
            <div className="absolute right-0 bottom-full mb-2 hidden group-hover/tooltip:block w-48 p-2.5 bg-slate-900/95 border border-white/10 text-slate-300 text-[10px] rounded-xl shadow-2xl z-50 pointer-events-none leading-normal backdrop-blur-md">
              {tooltip}
            </div>
          </div>
        )}
      </div>
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
  const [doctorsList, setDoctorsList] = useState<Doctor[]>([]);
  const [topDoctors, setTopDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros globales de analítica evolutiva
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('global');
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [analyticsData, setAnalyticsData] = useState<{
    timeSeries: Array<{ name: string; consultations: number; avgDuration: number; workHours: number }>;
    summary: {
      totalConsultations: number;
      avgSessionTime: number;
      totalWorkHours: number;
      consultationTrend: string;
      durationTrend: string;
    };
  }>({
    timeSeries: [],
    summary: {
      totalConsultations: 0,
      avgSessionTime: 15,
      totalWorkHours: 0,
      consultationTrend: "+0%",
      durationTrend: "0 min"
    }
  });

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [metricsData, doctorsData] = await Promise.all([
          dashboardRepository.getMetrics(),
          doctorRepository.getAllDoctors()
        ]);
        setMetrics(metricsData);
        setDoctorsList(doctorsData);
        setTopDoctors([...doctorsData].sort((a, b) => b.rating - a.rating).slice(0, 5));
      } catch (error) {
        console.error("Error loading dashboard data", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  useEffect(() => {
    const loadAnalytics = async () => {
      const data = await dashboardRepository.getAdminAnalytics(selectedDoctorId, timeframe);
      setAnalyticsData(data);
    };
    loadAnalytics();
  }, [selectedDoctorId, timeframe]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">Live Monitor</h2>
          <h1 className="text-4xl font-bold text-white tracking-tighter">
            Operational <span className="text-slate-500 font-light italic">Command</span> Center
          </h1>
        </div>
        <div className="flex items-center space-x-3 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]"></div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Sistemas Estables</span>
        </div>
      </div>

      {/* Barra de Filtros de Analítica (Médico + Temporal) */}
      <GlassCard className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 border-emerald-500/20 bg-emerald-500/5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <Stethoscope size={18} className="text-emerald-400" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Médico:</span>
          </div>
          <select
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            className="bg-slate-900/80 border border-white/10 text-white rounded-xl px-4 py-2 text-xs font-bold focus:outline-none focus:border-emerald-500/50"
          >
            <option value="global">🌐 Red Clínica Global (Todos los Médicos)</option>
            {doctorsList.map((doc) => (
              <option key={doc.id} value={doc.id}>Dr. {doc.name} — {doc.specialty}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">Rango Temporal:</span>
          <div className="flex p-1 bg-slate-950/80 rounded-xl border border-white/10 gap-1">
            <button
              onClick={() => setTimeframe('daily')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                timeframe === 'daily' ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              Diario
            </button>
            <button
              onClick={() => setTimeframe('weekly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                timeframe === 'weekly' ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semanal
            </button>
            <button
              onClick={() => setTimeframe('monthly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                timeframe === 'monthly' ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              Mensual
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Link to="/affiliates" className="block transform transition-transform hover:scale-[1.02]">
          <MetricCard
            icon={<Users size={20} />}
            label="Afiliados"
            value={isLoading ? "---" : metrics.totalAffiliates.toLocaleString()}
            trend="+12%"
            color="blue"
            tooltip="Total de pacientes y familiares registrados activos en la plataforma."
          />
        </Link>
        <Link to="/doctors" className="block transform transition-transform hover:scale-[1.02]">
          <MetricCard
            icon={<Stethoscope size={20} />}
            label="Médicos Activos"
            value={isLoading ? "---" : metrics.totalDoctors}
            trend="+2"
            color="emerald"
            tooltip="Cantidad de profesionales con matrícula verificada y perfil activo."
          />
        </Link>
        <Link to="/agreements" className="block transform transition-transform hover:scale-[1.02]">
          <MetricCard
            icon={<Building2 size={20} />}
            label="Convenios"
            value={isLoading ? "---" : metrics.activeAgreements}
            trend="+3"
            color="indigo"
            tooltip="Empresas y obras sociales con convenio institucional vigente."
          />
        </Link>
        <Link to="/billing" className="block transform transition-transform hover:scale-[1.02]">
          <MetricCard
            icon={<DollarSign size={20} />}
            label="Recaudación"
            value={isLoading ? "---" : `$${(metrics.monthlyRevenue / 1000).toFixed(1)}k`}
            trend="+8.4%"
            color="emerald"
            tooltip="Monto total acumulado por facturas liquidadas y pagadas."
          />
        </Link>
        <Link to="/billing" className="block transform transition-transform hover:scale-[1.02]">
          <MetricCard
            icon={<CreditCard size={20} />}
            label="Facturas Pend."
            value={isLoading ? "---" : metrics.pendingInvoices}
            color="amber"
            tooltip="Facturas emitidas pendientes de cobro o liquidación."
          />
        </Link>
      </div>

      {/* Charts & Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Revenue/Activity Chart */}
        <GlassCard className="lg:col-span-2 p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                Flujo Evolutivo de Consultas
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  {analyticsData.summary.consultationTrend}
                </span>
              </h3>
              <p className="text-sm text-slate-500">
                {selectedDoctorId === 'global' ? 'Actividad global consolidada de la clínica' : 'Actividad evolutiva del médico seleccionado'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-white font-mono">{analyticsData.summary.totalConsultations}</span>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Total Período</p>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analyticsData.timeSeries}>
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
                  name="Consultas"
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
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white flex items-center">
                <Activity size={18} className="mr-2 text-blue-400" />
                Estado Operativo
              </h3>
              <div className="group/tooltip relative flex items-center">
                <div className="w-5 h-5 rounded-full bg-white/5 border border-white/10 text-slate-400 group-hover/tooltip:text-white group-hover/tooltip:border-white/20 flex items-center justify-center text-[10px] font-bold font-mono cursor-help transition-colors">
                  ?
                </div>
                <div className="absolute right-0 bottom-full mb-2 hidden group-hover/tooltip:block w-52 p-2.5 bg-slate-900/95 border border-white/10 text-slate-300 text-[10px] rounded-xl shadow-2xl z-50 pointer-events-none leading-normal backdrop-blur-md">
                  Médicos con turno de guardia activo en tiempo real (fichados sin salida) respecto del total registrado.
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Médicos Online / Guardia</span>
                <span className="text-white font-bold">{metrics.onlineDoctors || 0} / {metrics.totalDoctors}</span>
              </div>
              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-500 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_#3b82f6]"
                  style={{ width: `${metrics.totalDoctors > 0 ? Math.min(100, Math.round(((metrics.onlineDoctors || 0) / metrics.totalDoctors) * 100)) : 0}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-500 font-mono">
                <span>Cobertura Activa</span>
                <span>{metrics.totalDoctors > 0 ? Math.round(((metrics.onlineDoctors || 0) / metrics.totalDoctors) * 100) : 0}%</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className={`p-6 ${metrics.criticalAlerts && metrics.criticalAlerts.length > 0 ? 'bg-rose-500/5 border-rose-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-bold flex items-center ${metrics.criticalAlerts && metrics.criticalAlerts.length > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                <AlertTriangle size={18} className="mr-2" />
                Alertas Críticas {metrics.criticalAlerts && metrics.criticalAlerts.length > 0 && `(${metrics.criticalAlerts.length})`}
              </h3>
              <div className="group/tooltip relative flex items-center">
                <div className="w-5 h-5 rounded-full bg-white/5 border border-white/10 text-slate-400 group-hover/tooltip:text-white group-hover/tooltip:border-white/20 flex items-center justify-center text-[10px] font-bold font-mono cursor-help transition-colors">
                  ?
                </div>
                <div className="absolute right-0 bottom-full mb-2 hidden group-hover/tooltip:block w-52 p-2.5 bg-slate-900/95 border border-white/10 text-slate-300 text-[10px] rounded-xl shadow-2xl z-50 pointer-events-none leading-normal backdrop-blur-md">
                  Monitoreo automático de anomalías operativas (tasa de ausentismo no_show &gt; 15%, guardias desiertas y mora de facturación).
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {metrics.criticalAlerts && metrics.criticalAlerts.length > 0 ? (
                metrics.criticalAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-start space-x-3 text-xs">
                    <div className={`w-2 h-2 mt-1 rounded-full flex-shrink-0 ${alert.type === 'danger' ? 'bg-rose-500 animate-ping' : 'bg-amber-500'}`}></div>
                    <p className="text-slate-300 font-medium">{alert.message}</p>
                  </div>
                ))
              ) : (
                <div className="flex items-center space-x-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 shadow-[0_0_8px_#10b981]"></div>
                  <p className="text-slate-300 font-medium">Todos los parámetros dentro del rango normal. Sin alertas críticas.</p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Secundary Trend Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Promedio de Sesión Chart */}
        <GlassCard className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                Tendencia Promedio de Sesión
                <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                  {analyticsData.summary.durationTrend}
                </span>
              </h4>
              <p className="text-xs text-slate-400">Minutos por atención efectiva en el período</p>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold text-blue-400 font-mono">{analyticsData.summary.avgSessionTime} min</span>
            </div>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analyticsData.timeSeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                />
                <Bar dataKey="avgDuration" name="Duración (min)" fill={OCC_COLORS.blue} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Horas Fichadas Chart */}
        <GlassCard className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                Horas de Guardia / Jornada Fichadas
                <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                  Fichado Real
                </span>
              </h4>
              <p className="text-xs text-slate-400">Total horas trabajadas en sucursales autorizadas</p>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold text-indigo-400 font-mono">{analyticsData.summary.totalWorkHours} hs</span>
            </div>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analyticsData.timeSeries}>
                <defs>
                  <linearGradient id="colorWorkHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={OCC_COLORS.indigo} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={OCC_COLORS.indigo} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="workHours" name="Horas Guardia" stroke={OCC_COLORS.indigo} strokeWidth={2} fillOpacity={1} fill="url(#colorWorkHours)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
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
                        <span className="text-emerald-400 font-bold text-xs mr-1">{doc.rating}</span>
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
