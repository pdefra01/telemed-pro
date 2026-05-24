import React, { useState, useEffect } from 'react';
import { 
  Building2, Plus, Search, Edit2, Trash2, 
  ChevronRight, Filter, Briefcase, Users, 
  Calendar, CheckCircle2, XCircle
} from 'lucide-react';
import { AgreementRepository } from '../../repositories/AgreementRepository';
import { PlanRepository } from '../../repositories/PlanRepository';
import { bulkImportService } from '../../services/BulkImportService';
import { useToast } from '../../context/ToastContext';
import { Agreement, Plan } from '../../types';

const OCC_COLORS = {
  emerald: '#10b981',
  blue: '#3b82f6',
  indigo: '#6366f1',
  rose: '#f43f5e',
  amber: '#f59e0b'
};

const GlassCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <div className={`bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden transition-all duration-300 hover:border-white/20 ${className}`}>
    {children}
  </div>
);

const agreementRepo = new AgreementRepository();
const planRepo = new PlanRepository();

const Agreements: React.FC = () => {
  const { toast } = useToast();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'agreements' | 'plans'>('agreements');
  const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, agreement: Agreement) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      try {
        const result = await bulkImportService.processCSV(content, agreement.id, 'Plan Corp');
        toast(`Importación exitosa: ${result.success} afiliados creados.`, 'success');
        if (result.failed > 0) {
          toast(`${result.failed} registros fallidos.`, 'error');
        }
      } catch (error) {
        toast("Error procesando el archivo.", 'error');
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [agreementsData, plansData] = await Promise.all([
          agreementRepo.getAll(),
          planRepo.getAll()
        ]);
        setAgreements(agreementsData);
        setPlans(plansData);
      } catch (error) {
        console.error("Error loading commercial data", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const filteredAgreements = agreements.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.cuit?.includes(searchTerm)
  );

  const filteredPlans = plans.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-indigo-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">Commercial Hub</h2>
          <h1 className="text-4xl font-bold text-white tracking-tighter">
            Convenios <span className="text-slate-500 font-light italic">& Planes</span>
          </h1>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setActiveTab('agreements')}
            className={`px-6 py-2.5 rounded-2xl font-bold text-sm transition-all duration-300 ${activeTab === 'agreements' ? 'bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5'}`}
          >
            Convenios
          </button>
          <button 
            onClick={() => setActiveTab('plans')}
            className={`px-6 py-2.5 rounded-2xl font-bold text-sm transition-all duration-300 ${activeTab === 'plans' ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5'}`}
          >
            Planes
          </button>
          <button className="p-3 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 transition-colors shadow-xl">
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <GlassCard className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder={`Buscar ${activeTab === 'agreements' ? 'convenios' : 'planes'}...`}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center space-x-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-slate-300 font-bold text-sm hover:bg-white/10 transition-colors">
            <Filter size={16} />
            <span>Filtros</span>
          </button>
        </div>
      </GlassCard>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => (
            <GlassCard key={i} className="h-[200px] animate-pulse p-6">
              <div className="w-12 h-12 bg-white/10 rounded-2xl mb-4"></div>
              <div className="w-3/4 h-6 bg-white/10 rounded-lg mb-2"></div>
              <div className="w-1/2 h-4 bg-white/10 rounded-lg"></div>
            </GlassCard>
          ))
        ) : activeTab === 'agreements' ? (
          filteredAgreements.map((agreement) => (
            <GlassCard key={agreement.id} className="p-6 group relative">
              <div className="flex justify-between items-start mb-6">
                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:scale-110 transition-transform duration-300">
                  <Building2 size={24} />
                </div>
                <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => document.getElementById(`import-${agreement.id}`)?.click()}
                    className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-emerald-400 transition-colors"
                    title="Importar Afiliados"
                  >
                    <Plus size={16} />
                    <input 
                      id={`import-${agreement.id}`}
                      type="file" 
                      accept=".csv"
                      className="hidden" 
                      onChange={(e) => handleFileUpload(e, agreement)}
                    />
                  </button>
                  <button className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-rose-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white mb-1">{agreement.name}</h3>
                <p className="text-slate-400 text-sm mb-4">CUIT: {agreement.cuit || 'N/D'}</p>
                
                <div className="flex items-center space-x-4 mb-6">
                  <div className="flex items-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    <Users size={12} className="mr-1.5" />
                    <span>248 Afiliados</span>
                  </div>
                  <div className="flex items-center text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                    <CheckCircle2 size={12} className="mr-1.5" />
                    <span>Activo</span>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Plan Base</p>
                    <p className="text-sm font-bold text-white">Premium Corp</p>
                  </div>
                  <button className="text-indigo-400 hover:text-indigo-300 transition-colors">
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            </GlassCard>
          ))
        ) : (
          filteredPlans.map((plan) => (
            <GlassCard key={plan.id} className="p-6 group border-l-4" style={{ borderLeftColor: OCC_COLORS.emerald }}>
              <div className="flex justify-between items-start mb-6">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform duration-300">
                  <Briefcase size={24} />
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Costo Mensual</p>
                  <p className="text-2xl font-bold text-white">${plan.monthlyCost}</p>
                </div>
              </div>

              <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-center text-sm text-slate-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2"></div>
                  {plan.bonifiedConsultations} Consultas bonificadas
                </div>
                <div className="flex items-center text-sm text-slate-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2"></div>
                  Hasta {plan.maxFamilyMembers} familiares
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex justify-between items-center">
                <div className="flex -space-x-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-[#020617] bg-white/10 flex items-center justify-center text-[10px] font-bold text-white">
                      {i}
                    </div>
                  ))}
                  <div className="w-8 h-8 rounded-full border-2 border-[#020617] bg-white/5 flex items-center justify-center text-[10px] font-bold text-slate-500">
                    +12
                  </div>
                </div>
                <button className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white hover:bg-white/10 transition-colors">
                  Editar Plan
                </button>
              </div>
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );
};

export default Agreements;
