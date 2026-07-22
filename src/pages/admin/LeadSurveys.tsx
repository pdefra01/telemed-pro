import React, { useEffect, useState } from 'react';
import { Filter, Download, Users, DollarSign } from 'lucide-react';
import { leadSurveyRepository, LeadSurveyResponse } from '../../repositories/LeadSurveyRepository';
import { producerRepository } from '../../repositories/ProducerRepository';
import { accountingService } from '../../services/AccountingService';
import { Producer } from '../../types';

// Glass Card for Table Container (matches DoctorAttendance.tsx visual language)
const GlassTableContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
    {children}
  </div>
);

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value?: number): string {
  if (value === undefined || value === null) return '—';
  return `$${value.toLocaleString('es-AR')}`;
}

function buildCsv(rows: LeadSurveyResponse[], producerNameByCode: Record<string, string>): string {
  const headers = ['Nombre y Apellido', 'WhatsApp', 'Edad', 'Asesor', 'Fecha', 'Valor Mensual Justo'];
  const csvRows = rows.map(row => {
    const advisor = row.promoterCode ? (producerNameByCode[row.promoterCode] || row.promoterCode) : 'Sin asesor';
    return [
      row.fullName,
      row.whatsapp,
      row.age ?? '',
      advisor,
      row.createdAt,
      row.fairMonthlyValue,
    ].map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',');
  });
  return [headers.join(','), ...csvRows].join('\n');
}

const LeadSurveys: React.FC = () => {
  const [responses, setResponses] = useState<LeadSurveyResponse[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  const [promoterCode, setPromoterCode] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const loadOptions = async () => {
      try {
        setIsLoadingOptions(true);
        const producersData = await producerRepository.getProducers();
        setProducers(producersData);
      } catch (error) {
        console.error('Error cargando asesores:', error);
      } finally {
        setIsLoadingOptions(false);
      }
    };
    loadOptions();
  }, []);

  useEffect(() => {
    const loadResponses = async () => {
      try {
        setIsLoading(true);
        const data = await leadSurveyRepository.getResponses({
          promoterCode: promoterCode || undefined,
          from: from || undefined,
          // A bare date ("2026-07-20") is read as midnight by Postgres —
          // without the end-of-day time, responses from later that same day
          // would be silently excluded from the range.
          to: to ? `${to}T23:59:59` : undefined,
        });
        setResponses(data);
      } catch (error) {
        console.error('Error cargando respuestas de la encuesta:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadResponses();
  }, [promoterCode, from, to]);

  const producerNameByCode = producers.reduce<Record<string, string>>((acc, p) => {
    acc[p.producerCode] = p.name;
    return acc;
  }, {});

  const totalResponses = responses.length;
  const avgFairValue = totalResponses > 0
    ? responses.reduce((sum, r) => sum + (r.fairMonthlyValue || 0), 0) / totalResponses
    : 0;

  const handleDownloadCsv = () => {
    const csv = buildCsv(responses, producerNameByCode);
    const filename = `encuesta-de-opinion_${new Date().toISOString().split('T')[0]}.csv`;
    accountingService.downloadCSV(csv, filename);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">Comercial / Leads</h2>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tighter">Encuesta <span className="text-slate-500 font-light italic">de Opinión</span></h1>
        </div>
        <button
          type="button"
          onClick={handleDownloadCsv}
          disabled={responses.length === 0}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.25)] active:scale-95 cursor-pointer"
        >
          <Download size={16} />
          Descargar Excel
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4 transition-all hover:border-emerald-500/30">
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400">
            <Users size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Respuestas en el período</p>
            <h4 className="text-xl font-bold text-white">{totalResponses}</h4>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4 transition-all hover:border-blue-500/30">
          <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400">
            <DollarSign size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Valor mensual justo promedio</p>
            <h4 className="text-xl font-bold text-white">{formatCurrency(Math.round(avgFairValue))}</h4>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
        <div className="flex items-center space-x-2 mb-4 text-slate-400">
          <Filter size={14} />
          <span className="text-[10px] uppercase tracking-widest font-bold">Filtros</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Asesor</label>
            <select
              disabled={isLoadingOptions}
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-white text-sm outline-none focus:border-emerald-500/50 transition-colors appearance-none disabled:opacity-50"
              value={promoterCode}
              onChange={e => setPromoterCode(e.target.value)}
            >
              <option value="" className="bg-[#0f172a]">Todos</option>
              {producers.map(p => (
                <option key={p.id} value={p.producerCode} className="bg-[#0f172a]">{p.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Desde</label>
            <input
              type="date"
              className="w-full bg-slate-900 border border-white/10 rounded-2xl p-3 text-white text-sm outline-none focus:border-emerald-500/50 transition-colors"
              value={from}
              onChange={e => setFrom(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Hasta</label>
            <input
              type="date"
              className="w-full bg-slate-900 border border-white/10 rounded-2xl p-3 text-white text-sm outline-none focus:border-emerald-500/50 transition-colors"
              value={to}
              onChange={e => setTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <GlassTableContainer>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/5 text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                <th className="px-8 py-5">Nombre y Apellido</th>
                <th className="px-6 py-5">WhatsApp</th>
                <th className="px-6 py-5">Edad</th>
                <th className="px-6 py-5">Asesor</th>
                <th className="px-6 py-5">Fecha</th>
                <th className="px-8 py-5 text-right">Valor Mensual Justo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={6} className="px-8 py-20 text-center text-slate-500 italic animate-pulse">Cargando respuestas...</td></tr>
              ) : responses.length === 0 ? (
                <tr><td colSpan={6} className="px-8 py-20 text-center text-slate-500 italic">No hay respuestas registradas para estos filtros.</td></tr>
              ) : responses.map((row) => (
                <tr key={row.id} className="group hover:bg-white/5 transition-all duration-200">
                  <td className="px-8 py-5">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 font-bold text-sm transition-transform group-hover:scale-110">
                        {row.fullName.charAt(0)}
                      </div>
                      <div className="ml-4 text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                        {row.fullName}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-xs font-mono text-slate-300">{row.whatsapp}</td>
                  <td className="px-6 py-5 text-xs font-mono text-slate-300">{row.age ?? '—'}</td>
                  <td className="px-6 py-5 text-xs font-semibold text-slate-300">
                    {row.promoterCode ? (producerNameByCode[row.promoterCode] || row.promoterCode) : 'Sin asesor'}
                  </td>
                  <td className="px-6 py-5 text-xs font-mono text-slate-300">{formatDateTime(row.createdAt)}</td>
                  <td className="px-8 py-5 text-right text-sm font-bold text-emerald-400">{formatCurrency(row.fairMonthlyValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassTableContainer>
    </div>
  );
};

export default LeadSurveys;
