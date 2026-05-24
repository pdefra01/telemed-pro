import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, Cell, AreaChart, Area, ComposedChart
} from 'recharts';
import { 
  FileBarChart, 
  Download, 
  Filter, 
  Calendar, 
  TrendingUp, 
  Activity, 
  AlertTriangle,
  ChevronDown,
  RefreshCcw,
  MousePointer2
} from 'lucide-react';
import { reportRepository, GrowthData, DensityData, RevenueAnalysis } from '../../repositories/ReportRepository';

const OCC_COLORS = {
  emerald: '#10b981',
  blue: '#3b82f6',
  indigo: '#6366f1',
  rose: '#f43f5e',
  amber: '#f59e0b',
  slate: '#94a3b8'
};

const OCCReports: React.FC = () => {
  const [growthData, setGrowthData] = useState<GrowthData[]>([]);
  const [densityData, setDensityData] = useState<DensityData[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [growth, density, revenue] = await Promise.all([
        reportRepository.getAffiliateGrowth(),
        reportRepository.getConsultationDensity(),
        reportRepository.getRevenueAnalysis()
      ]);
      setGrowthData(growth);
      setDensityData(density);
      setRevenueData(revenue);
    } catch (error) {
      console.error("Error loading report data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const GlassCard = ({ title, icon, children, className = "" }: any) => (
    <div className={`bg-[#0f172a]/40 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl ${className}`}>
      <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
            {icon}
          </div>
          <h3 className="font-bold text-slate-100 tracking-tight">{title}</h3>
        </div>
        <div className="flex space-x-2">
          <button className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
            <RefreshCcw size={14} />
          </button>
          <button className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
            <Download size={14} />
          </button>
        </div>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0f172a]/90 backdrop-blur-md border border-white/10 p-4 rounded-xl shadow-2xl">
          <p className="text-xs font-bold text-emerald-400 mb-2 uppercase tracking-widest">{label}</p>
          <div className="space-y-1">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between space-x-8 text-sm">
                <span className="text-slate-400">{entry.name}:</span>
                <span className="font-mono font-bold text-white">
                  {typeof entry.value === 'number' && entry.name.toLowerCase().includes('facturado') 
                    ? `$${entry.value.toLocaleString()}` 
                    : entry.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-emerald-500 mb-2">
            <TrendingUp size={16} />
            <span className="text-[10px] uppercase tracking-[0.3em] font-bold">Operational Intelligence</span>
          </div>
          <h2 className="text-4xl font-bold tracking-tighter bg-gradient-to-r from-white via-white to-slate-500 bg-clip-text text-transparent">
            Centro de Inteligencia
          </h2>
          <p className="text-slate-400 mt-2 max-w-2xl text-sm leading-relaxed">
            Monitoreo en tiempo real de crecimiento poblacional, demanda prestacional y salud financiera de la plataforma.
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="flex bg-[#0f172a]/60 backdrop-blur-md border border-white/5 p-1 rounded-xl">
            <button className="px-4 py-2 text-xs font-bold bg-emerald-500 text-white rounded-lg shadow-lg shadow-emerald-500/20">7 Días</button>
            <button className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-all">30 Días</button>
            <button className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-all">Histórico</button>
          </div>
          <button className="flex items-center space-x-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all">
            <Filter size={14} />
            <span>Filtros Avanzados</span>
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Main Analysis Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Affiliate Growth */}
        <GlassCard 
          title="Evolución de Padrones" 
          icon={<TrendingUp size={18} />}
          className="xl:col-span-2"
        >
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis 
                  dataKey="month" 
                  stroke="#64748b" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  dy={10}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  verticalAlign="top" 
                  align="right" 
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: '20px', fontSize: '12px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="Corporativo Alpha" 
                  stroke={OCC_COLORS.emerald} 
                  strokeWidth={4} 
                  dot={{ r: 4, fill: OCC_COLORS.emerald, strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="Sindicato Salud" 
                  stroke={OCC_COLORS.blue} 
                  strokeWidth={4} 
                  dot={{ r: 4, fill: OCC_COLORS.blue, strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="Prepaga Global" 
                  stroke={OCC_COLORS.indigo} 
                  strokeWidth={4} 
                  dot={{ r: 4, fill: OCC_COLORS.indigo, strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Consultation Density */}
        <GlassCard 
          title="Densidad Prestacional (Demanda)" 
          icon={<Activity size={18} />}
        >
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={densityData}>
                <defs>
                  <linearGradient id="colorCons" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={OCC_COLORS.emerald} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={OCC_COLORS.emerald} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="time" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="step" 
                  dataKey="consultations" 
                  name="Consultas"
                  stroke={OCC_COLORS.emerald} 
                  fillOpacity={1} 
                  fill="url(#colorCons)" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
            <div className="flex items-center space-x-2 text-emerald-400 mb-1">
              <MousePointer2 size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Insight Operativo</span>
            </div>
            <p className="text-xs text-slate-400">
              Pico de demanda detectado entre las **14:00 y 16:00 hs**. Se recomienda reforzar guardias virtuales en esta franja.
            </p>
          </div>
        </GlassCard>

        {/* Revenue Leakage */}
        <GlassCard 
          title="Fuga de Capital (Efficiency)" 
          icon={<AlertTriangle size={18} />}
        >
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={revenueData}>
                <XAxis 
                  dataKey="month" 
                  stroke="#64748b" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => `$${val/1000}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" />
                <Bar dataKey="recaudado" name="Recaudado" fill={OCC_COLORS.emerald} radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="mora" name="Mora" fill={OCC_COLORS.rose} radius={[4, 4, 0, 0]} barSize={20} />
                <Line type="monotone" dataKey="facturado" name="Total Facturado" stroke={OCC_COLORS.blue} strokeWidth={3} dot={{ fill: OCC_COLORS.blue }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 flex items-center justify-between p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Current Leakage</p>
              <p className="text-2xl font-bold text-rose-400">17.3%</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 max-w-[200px]">
                La tasa de morosidad ha subido un **4%** respecto al mes anterior. 
              </p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Summary Stats Footer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f172a]/20 border border-white/5 p-6 rounded-3xl">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Total Consultas (YTD)</p>
          <div className="flex items-baseline space-x-2">
            <p className="text-3xl font-bold text-white">24.8k</p>
            <span className="text-xs text-emerald-400 font-bold">+15%</span>
          </div>
        </div>
        <div className="bg-[#0f172a]/20 border border-white/5 p-6 rounded-3xl">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Churn Rate Afiliados</p>
          <div className="flex items-baseline space-x-2">
            <p className="text-3xl font-bold text-white">2.4%</p>
            <span className="text-xs text-emerald-400 font-bold">-0.8%</span>
          </div>
        </div>
        <div className="bg-[#0f172a]/20 border border-white/5 p-6 rounded-3xl">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Satisfacción Promedio</p>
          <div className="flex items-baseline space-x-2">
            <p className="text-3xl font-bold text-white">4.8</p>
            <div className="flex space-x-0.5">
              {[1, 2, 3, 4, 5].map(s => (
                <div key={s} className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OCCReports;
