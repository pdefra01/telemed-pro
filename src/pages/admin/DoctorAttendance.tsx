import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, AlertTriangle, Filter, Building2, CalendarRange } from 'lucide-react';
import { doctorShiftRepository } from '../../repositories/DoctorShiftRepository';
import { doctorRepository } from '../../repositories/DoctorRepository';
import { officeLocationRepository } from '../../repositories/OfficeLocationRepository';
import { Doctor, DoctorWorkShift, OfficeLocation } from '../../types';

type ShiftHistoryRow = DoctorWorkShift & { doctorName: string };

// Glass Card for Table Container (matches Doctors.tsx visual language)
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

function formatDuration(minutes?: number): string {
  if (minutes === undefined || minutes === null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

const StatusPill: React.FC<{ status: DoctorWorkShift['status'] }> = ({ status }) => {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
        <div className="w-1.5 h-1.5 rounded-full mr-2 bg-emerald-500 animate-pulse"></div>
        En curso
      </span>
    );
  }

  if (status === 'abandoned') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-500 border border-amber-500/20">
        <AlertTriangle size={11} className="mr-1.5" />
        Abandonada
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-white/5 text-slate-400 border border-white/10">
      <div className="w-1.5 h-1.5 rounded-full mr-2 bg-slate-500"></div>
      Completada
    </span>
  );
};

const DoctorAttendance: React.FC = () => {
  const [searchParams] = useSearchParams();

  const [shifts, setShifts] = useState<ShiftHistoryRow[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [offices, setOffices] = useState<OfficeLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  const [doctorId, setDoctorId] = useState(searchParams.get('doctorId') || '');
  const [officeLocationId, setOfficeLocationId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const loadOptions = async () => {
      try {
        setIsLoadingOptions(true);
        const [doctorsData, officesData] = await Promise.all([
          doctorRepository.getAllDoctors(),
          officeLocationRepository.getAllOffices(),
        ]);
        setDoctors(doctorsData);
        setOffices(officesData);
      } catch (error) {
        console.error('Error cargando opciones de filtro:', error);
      } finally {
        setIsLoadingOptions(false);
      }
    };
    loadOptions();
  }, []);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setIsLoading(true);
        const data = await doctorShiftRepository.getShiftHistory({
          doctorId: doctorId || undefined,
          officeLocationId: officeLocationId || undefined,
          from: from || undefined,
          // A bare date ("2026-07-20") is read as midnight by Postgres —
          // without the end-of-day time, shifts from later that same day
          // would be silently excluded from the range.
          to: to ? `${to}T23:59:59` : undefined,
        });
        setShifts(data);
      } catch (error) {
        console.error('Error cargando fichadas:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadHistory();
  }, [doctorId, officeLocationId, from, to]);

  const totalShifts = shifts.length;
  const totalHours = shifts.reduce((sum, s) => sum + (s.durationMinutes || 0), 0) / 60;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div>
        <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">Recursos Humanos / Médico</h2>
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tighter">Fichado <span className="text-slate-500 font-light italic">Médico</span></h1>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4 transition-all hover:border-emerald-500/30">
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Jornadas en el período</p>
            <h4 className="text-xl font-bold text-white">{totalShifts}</h4>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center space-x-4 transition-all hover:border-blue-500/30">
          <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400">
            <CalendarRange size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Horas totales</p>
            <h4 className="text-xl font-bold text-white">{totalHours.toFixed(1)} hs</h4>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
        <div className="flex items-center space-x-2 mb-4 text-slate-400">
          <Filter size={14} />
          <span className="text-[10px] uppercase tracking-widest font-bold">Filtros</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Médico</label>
            <select
              disabled={isLoadingOptions}
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-white text-sm outline-none focus:border-emerald-500/50 transition-colors appearance-none disabled:opacity-50"
              value={doctorId}
              onChange={e => setDoctorId(e.target.value)}
            >
              <option value="" className="bg-[#0f172a]">Todos</option>
              {doctors.map(doc => (
                <option key={doc.id} value={doc.id} className="bg-[#0f172a]">{doc.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Oficina</label>
            <select
              disabled={isLoadingOptions}
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-white text-sm outline-none focus:border-emerald-500/50 transition-colors appearance-none disabled:opacity-50"
              value={officeLocationId}
              onChange={e => setOfficeLocationId(e.target.value)}
            >
              <option value="" className="bg-[#0f172a]">Todas</option>
              {offices.map(office => (
                <option key={office.id} value={office.id} className="bg-[#0f172a]">{office.name}</option>
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
                <th className="px-8 py-5">Médico</th>
                <th className="px-6 py-5">Oficina</th>
                <th className="px-6 py-5">Entrada</th>
                <th className="px-6 py-5">Salida</th>
                <th className="px-6 py-5">Duración</th>
                <th className="px-8 py-5 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={6} className="px-8 py-20 text-center text-slate-500 italic animate-pulse">Sincronizando fichadas...</td></tr>
              ) : shifts.length === 0 ? (
                <tr><td colSpan={6} className="px-8 py-20 text-center text-slate-500 italic">No hay fichadas registradas para estos filtros.</td></tr>
              ) : shifts.map((shift) => (
                <tr key={shift.id} className="group hover:bg-white/5 transition-all duration-200">
                  <td className="px-8 py-5">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 font-bold text-sm transition-transform group-hover:scale-110">
                        {shift.doctorName.charAt(0)}
                      </div>
                      <div className="ml-4 text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                        {shift.doctorName}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center space-x-2 text-sm font-semibold text-slate-300">
                      <Building2 size={13} className="text-slate-500" />
                      <span>{shift.officeName || 'Oficina'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-xs font-mono text-slate-300">{formatDateTime(shift.clockIn)}</td>
                  <td className="px-6 py-5 text-xs font-mono text-slate-300">{formatDateTime(shift.clockOut)}</td>
                  <td className="px-6 py-5 text-xs font-bold text-slate-300">{formatDuration(shift.durationMinutes)}</td>
                  <td className="px-8 py-5 text-right">
                    <StatusPill status={shift.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassTableContainer>
    </div>
  );
};

export default DoctorAttendance;
