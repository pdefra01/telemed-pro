import React, { useState, useEffect } from 'react';
import { 
  DollarSign, Download, FileText, Filter, 
  Search, ExternalLink, Calendar, Receipt,
  CheckCircle2, Clock, AlertCircle, Plus, Trash2, TrendingUp, BarChart3
} from 'lucide-react';
import { invoiceRepository } from '../../repositories/InvoiceRepository';
import { accountingService } from '../../services/AccountingService';
import { billingService } from '../../services/BillingService';
import { financialService } from '../../services/FinancialService';
import { Invoice, OperatingExpense, PLSummary } from '../../types';

/**
 * Formats the `runMonthlyBillingCycle` result summary for the post-cycle
 * alert. Appends the affiliates that were skipped for having a plan but no
 * coverage window (cuenta-corriente-billing PR3's `skippedNoWindow`) so the
 * admin can act on them (reassign/renew) instead of only finding out via a
 * server-side log line.
 */
export function formatCycleResultMessage(result: {
  processedAgreements: number;
  processedIndividuals: number;
  totalAmount: number;
  skippedNoWindow: { id: string; name: string }[];
}): string {
  let message = `Ciclo completado con éxito.\nConvenios: ${result.processedAgreements}\nDirectos: ${result.processedIndividuals}\nTotal: $${result.totalAmount.toLocaleString()}`;

  if (result.skippedNoWindow.length > 0) {
    const names = result.skippedNoWindow.map(a => a.name).join(', ');
    message += `\nOmitidos (sin ventana de cobertura): ${names}`;
  }

  return message;
}

const GlassCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <div className={`bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden transition-all duration-300 hover:border-white/20 ${className}`}>
    {children}
  </div>
);

const OCCBilling: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'billing' | 'pl'>('billing');
  
  // Billing States
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // P&L States
  const [plPeriod, setPlPeriod] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [plSummary, setPlSummary] = useState<PLSummary | null>(null);
  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({
    category: 'administrative' as OperatingExpense['category'],
    amount: '',
    description: ''
  });

  const loadInvoices = async () => {
    try {
      setIsLoading(true);
      const data = await invoiceRepository.getAll();
      setInvoices(data);
    } catch (error) {
      console.error("Error loading invoices", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPLData = async () => {
    try {
      setIsLoading(true);
      const [summary, expList] = await Promise.all([
        financialService.getPLSummary(plPeriod),
        financialService.getExpensesByPeriod(plPeriod)
      ]);
      setPlSummary(summary);
      setExpenses(expList);
    } catch (error) {
      console.error("Error loading P&L data", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'billing') {
      loadInvoices();
    } else {
      loadPLData();
    }
  }, [activeTab, plPeriod]);

  const handleExport = () => {
    const csvContent = accountingService.generateCSVExport(invoices);
    const filename = `medinex-billing-export-${new Date().toISOString().split('T')[0]}.csv`;
    accountingService.downloadCSV(csvContent, filename);
  };

  const handleProcessCycle = async () => {
    if (!window.confirm('¿Estás seguro de iniciar el ciclo de facturación mensual? Se generarán comprobantes para todos los convenios y afiliados directos.')) return;
    
    try {
      setIsLoading(true);
      const period = new Date().toISOString().substring(0, 7); // Formato YYYY-MM
      const result = await billingService.runMonthlyBillingCycle(period);
      alert(formatCycleResultMessage(result));
      await loadInvoices();
    } catch (error) {
      console.error("Error en ciclo de facturación", error);
      alert("Error al procesar el ciclo.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconcile = async (invoiceId: string) => {
    try {
      await billingService.reconcileInvoice(invoiceId);
      setSelectedInvoice(null);
      await loadInvoices();
    } catch (error) {
      console.error("Error al conciliar", error);
      alert("Error al conciliar la factura.");
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.amount || !newExpense.description) {
      alert("Por favor completa todos los campos");
      return;
    }

    try {
      setIsLoading(true);
      await financialService.saveExpense({
        period: plPeriod,
        category: newExpense.category,
        amount: parseFloat(newExpense.amount),
        description: newExpense.description
      });
      setShowAddExpenseModal(false);
      setNewExpense({ category: 'administrative', amount: '', description: '' });
      await loadPLData();
    } catch (error) {
      console.error("Error al registrar egreso", error);
      alert("Error al guardar el egreso");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm("¿Estás seguro de eliminar este egreso?")) return;

    try {
      setIsLoading(true);
      await financialService.deleteExpense(id);
      await loadPLData();
    } catch (error) {
      console.error("Error al eliminar egreso", error);
      alert("Error al eliminar el egreso");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.period.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.entityId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Dynamic Metrics Computation
  const now = new Date();
  const currentPeriodStr = now.toISOString().substring(0, 7); // YYYY-MM
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevPeriodStr = prevDate.toISOString().substring(0, 7);

  // Current vs Prev Month Billing
  const currentMonthInvoices = invoices.filter(inv => inv.period.startsWith(currentPeriodStr) && inv.status !== 'cancelled');
  const prevMonthInvoices = invoices.filter(inv => inv.period.startsWith(prevPeriodStr) && inv.status !== 'cancelled');

  const totalFacturadoMes = currentMonthInvoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
  const totalFacturadoPrev = prevMonthInvoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
  
  // If no invoices for specific YYYY-MM period format, fallback to all active invoices sum
  const displayFacturado = totalFacturadoMes > 0 ? totalFacturadoMes : invoices.filter(i => i.status !== 'cancelled').reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);

  let varPercentage = 0;
  if (totalFacturadoPrev > 0) {
    varPercentage = Math.round(((totalFacturadoMes - totalFacturadoPrev) / totalFacturadoPrev) * 100);
  }

  // Pending Payments
  const pendingInvoices = invoices.filter(inv => inv.status === 'issued');
  const pendienteMonto = pendingInvoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
  const pendingCount = pendingInvoices.length;

  // Dynamic Next Closure Date (Last day of current month)
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const formattedNextClosure = lastDayOfMonth.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">Financial Engine</h2>
          <h1 className="text-4xl font-bold text-white tracking-tighter">
            OCC <span className="text-slate-500 font-light italic">Billing</span> Center
          </h1>
        </div>
        <div className="flex items-center space-x-2 bg-white/5 border border-white/10 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab('billing')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'billing' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            Facturación
          </button>
          <button 
            onClick={() => setActiveTab('pl')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'pl' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            Pérdidas y Ganancias (P&L)
          </button>
        </div>
      </div>

      {activeTab === 'billing' ? (
        <>
          {/* Action Buttons for Billing */}
          <div className="flex justify-end space-x-4">
            <button 
              onClick={handleProcessCycle}
              disabled={isLoading}
              className="flex items-center space-x-2 px-6 py-3 bg-white/5 border border-white/10 text-white rounded-2xl font-bold text-sm hover:bg-white/10 transition-all"
            >
              <Calendar size={18} />
              <span>Procesar Ciclo Mensual</span>
            </button>
            <button 
              onClick={handleExport}
              className="flex items-center space-x-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-bold text-sm hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              <Download size={18} />
              <span>Exportar para Estudio</span>
            </button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GlassCard className="p-6 border-l-4 border-l-blue-500">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Total Facturado (Mes)</p>
              <h4 className="text-3xl font-bold text-white">${displayFacturado.toLocaleString()}</h4>
              <p className="text-emerald-400 text-[10px] font-bold mt-2">
                {varPercentage >= 0 ? `+${varPercentage}% vs mes anterior` : `${varPercentage}% vs mes anterior`}
              </p>
            </GlassCard>
            <GlassCard className="p-6 border-l-4 border-l-amber-500">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Pendiente de Cobro</p>
              <h4 className="text-3xl font-bold text-white">${pendienteMonto.toLocaleString()}</h4>
              <p className="text-amber-400 text-[10px] font-bold mt-2">{pendingCount} {pendingCount === 1 ? 'factura emitida sin cobrar' : 'facturas emitidas sin cobrar'}</p>
            </GlassCard>
            <GlassCard className="p-6 border-l-4 border-l-indigo-500">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Próximo Cierre</p>
              <h4 className="text-3xl font-bold text-white capitalize">{formattedNextClosure}</h4>
              <p className="text-indigo-400 text-[10px] font-bold mt-2">Cierre automático programado</p>
            </GlassCard>
          </div>

          {/* Table Section */}
          <GlassCard className="p-8">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
              <h3 className="text-xl font-bold text-white">Registro de Comprobantes</h3>
              <div className="flex items-center space-x-4 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input 
                    type="text" 
                    placeholder="Buscar por periodo o ID..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors">
                  <Filter size={18} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                    <th className="pb-4">Comprobante</th>
                    <th className="pb-4">Entidad</th>
                    <th className="pb-4">Periodo</th>
                    <th className="pb-4">Monto Neto</th>
                    <th className="pb-4">Impuestos</th>
                    <th className="pb-4">Total</th>
                    <th className="pb-4">Estado</th>
                    <th className="pb-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isLoading ? (
                    Array(5).fill(0).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={8} className="py-6 bg-white/5 rounded-lg mb-2"></td>
                      </tr>
                    ))
                  ) : filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="group hover:bg-white/5 transition-colors">
                      <td className="py-4">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 rounded-lg bg-white/5 text-slate-400">
                            <FileText size={16} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white uppercase">{inv.id.substring(0, 8)}</p>
                            <p className="text-[10px] text-slate-500">{new Date(inv.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center space-x-2">
                          <span className={`w-2 h-2 rounded-full ${inv.entityType === 'agreement' ? 'bg-indigo-500' : 'bg-blue-500'}`}></span>
                          <span className="text-xs font-bold text-white uppercase tracking-tighter">
                            {inv.entityType === 'agreement' ? 'CONVENIO' : 'AFILIADO'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 text-xs text-slate-400 font-medium">{inv.period}</td>
                      <td className="py-4 text-xs text-white font-bold">${inv.netAmount.toLocaleString()}</td>
                      <td className="py-4 text-xs text-slate-400">${inv.taxAmount.toLocaleString()}</td>
                      <td className="py-4">
                        <span className="text-sm font-bold text-white">${inv.totalAmount.toLocaleString()}</span>
                      </td>
                      <td className="py-4">
                        <div className={`inline-flex items-center px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-tighter ${
                          inv.status === 'paid' 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : inv.status === 'issued'
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        }`}>
                          {inv.status === 'paid' && <CheckCircle2 size={10} className="mr-1" />}
                          {inv.status === 'issued' && <Clock size={10} className="mr-1" />}
                          {inv.status === 'cancelled' && <AlertCircle size={10} className="mr-1" />}
                          {inv.status}
                        </div>
                      </td>
                      <td className="py-4 text-right">
                        <div className="flex justify-end space-x-2">
                          <button className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors">
                            <Download size={14} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedInvoice(inv);
                            }}
                            className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors"
                          >
                            <ExternalLink size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      ) : (
        <>
          {/* P&L Layout */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center space-x-4 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl">
              <span className="text-xs font-bold text-slate-400">Filtrar Periodo:</span>
              <input 
                type="month" 
                value={plPeriod} 
                onChange={(e) => setPlPeriod(e.target.value)} 
                className="bg-transparent text-sm font-bold text-white outline-none cursor-pointer"
              />
            </div>
            <button 
              onClick={() => setShowAddExpenseModal(true)}
              className="flex items-center space-x-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-bold text-sm hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              <Plus size={18} />
              <span>Cargar Egreso</span>
            </button>
          </div>

          {plSummary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <GlassCard className="p-6 border-l-4 border-l-emerald-500">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Ingreso Consolidado</p>
                <h4 className="text-3xl font-bold text-white">${plSummary.totalRevenue.toLocaleString()}</h4>
                <p className="text-slate-500 text-[10px] mt-2">Facturas cobradas del periodo</p>
              </GlassCard>
              <GlassCard className="p-6 border-l-4 border-l-rose-500">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Egreso Consolidado</p>
                <h4 className="text-3xl font-bold text-white">${plSummary.totalExpenses.toLocaleString()}</h4>
                <p className="text-slate-500 text-[10px] mt-2">Honorarios + Gastos registrados</p>
              </GlassCard>
              <GlassCard className={`p-6 border-l-4 ${plSummary.netProfit >= 0 ? 'border-l-teal-500' : 'border-l-red-500'}`}>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Rendimiento Neto</p>
                <h4 className={`text-3xl font-bold ${plSummary.netProfit >= 0 ? 'text-teal-400' : 'text-red-400'}`}>
                  ${plSummary.netProfit.toLocaleString()}
                </h4>
                <p className="text-slate-500 text-[10px] mt-2">Margen operativo real</p>
              </GlassCard>
              <GlassCard className="p-6 border-l-4 border-l-indigo-500">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Margen Neto (%)</p>
                <h4 className="text-3xl font-bold text-white">{plSummary.netMargin.toFixed(1)}%</h4>
                <p className="text-slate-500 text-[10px] mt-2">Eficiencia del periodo</p>
              </GlassCard>
            </div>
          )}

          {plSummary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Desglose de Ingresos */}
              <GlassCard className="p-8">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                  <TrendingUp className="text-emerald-400" size={18} />
                  <span>Desglose de Ingresos</span>
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                    <span className="text-slate-400">Convenios Corporativos (B2B)</span>
                    <span className="font-bold text-white">${plSummary.breakdown.revenue.b2b.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                    <span className="text-slate-400">Afiliados Directos (B2C)</span>
                    <span className="font-bold text-white">${plSummary.breakdown.revenue.b2c.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                    <span className="text-slate-400">Copagos de Farmacia</span>
                    <span className="font-bold text-white">${plSummary.breakdown.revenue.pharmacy.toLocaleString()}</span>
                  </div>
                </div>
              </GlassCard>

              {/* Desglose de Egresos */}
              <GlassCard className="p-8">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                  <BarChart3 className="text-rose-400" size={18} />
                  <span>Desglose de Egresos</span>
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                    <span className="text-slate-400">Honorarios Médicos (Consultas)</span>
                    <span className="font-bold text-white">${plSummary.breakdown.expenses.medicalFees.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                    <span className="text-slate-400">Costos de Infraestructura / Servidores</span>
                    <span className="font-bold text-white">${plSummary.breakdown.expenses.infrastructure.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                    <span className="text-slate-400">Marketing & Publicidad</span>
                    <span className="font-bold text-white">${plSummary.breakdown.expenses.marketing.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                    <span className="text-slate-400">Gastos Administrativos / Alquiler / Impuestos</span>
                    <span className="font-bold text-white">${plSummary.breakdown.expenses.administrative.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                    <span className="text-slate-400">Otros</span>
                    <span className="font-bold text-white">${plSummary.breakdown.expenses.other.toLocaleString()}</span>
                  </div>
                </div>
              </GlassCard>
            </div>
          )}

          {/* Historial de Egresos Cargados */}
          <GlassCard className="p-8">
            <h3 className="text-xl font-bold text-white mb-6">Detalle de Gastos Manuales</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                    <th className="pb-4">Descripción</th>
                    <th className="pb-4">Categoría</th>
                    <th className="pb-4">Monto</th>
                    <th className="pb-4">Fecha de Carga</th>
                    <th className="pb-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500 font-medium italic">
                        No hay gastos manuales cargados en este periodo.
                      </td>
                    </tr>
                  ) : (
                    expenses.map(exp => (
                      <tr key={exp.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-4 text-white font-bold">{exp.description}</td>
                        <td className="py-4">
                          <span className="text-xs uppercase font-bold px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-300">
                            {exp.category}
                          </span>
                        </td>
                        <td className="py-4 text-white font-bold">${exp.amount.toLocaleString()}</td>
                        <td className="py-4 text-slate-400 text-xs">{new Date(exp.createdAt).toLocaleDateString()}</td>
                        <td className="py-4 text-right">
                          <button 
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Add Expense Modal */}
          {showAddExpenseModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddExpenseModal(false)}></div>
              <GlassCard className="relative w-full max-w-md p-8 animate-in zoom-in duration-300">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="text-2xl font-bold text-white tracking-tighter">Registrar Egreso</h3>
                  <button 
                    onClick={() => setShowAddExpenseModal(false)}
                    className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors"
                  >
                    <AlertCircle size={20} className="rotate-45" />
                  </button>
                </div>

                <form onSubmit={handleAddExpense} className="space-y-4">
                  <div>
                    <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Categoría</label>
                    <select 
                      value={newExpense.category}
                      onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value as any })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    >
                      <option value="infrastructure" className="bg-slate-900">Infraestructura / APIs</option>
                      <option value="marketing" className="bg-slate-900">Marketing & Difusión</option>
                      <option value="administrative" className="bg-slate-900">Gastos Administrativos / Alquileres / Impuestos</option>
                      <option value="other" className="bg-slate-900">Otros</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Monto ($)</label>
                    <input 
                      type="number" 
                      placeholder="Monto total del gasto..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs font-bold uppercase mb-2">Descripción</label>
                    <input 
                      type="text" 
                      placeholder="Ej. Pago de alquiler de oficinas comerciales..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                      value={newExpense.description}
                      onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                      required
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-4 mt-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-bold text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  >
                    Guardar Egreso
                  </button>
                </form>
              </GlassCard>
            </div>
          )}
        </>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedInvoice(null)}></div>
          <GlassCard className="relative w-full max-w-lg p-8 animate-in zoom-in duration-300">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-emerald-500 font-bold text-[10px] uppercase tracking-widest mb-1">Detalle de Comprobante</p>
                <h3 className="text-2xl font-bold text-white tracking-tighter">#{selectedInvoice.id.substring(0, 12).toUpperCase()}</h3>
              </div>
              <button 
                onClick={() => setSelectedInvoice(null)}
                className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors"
              >
                <AlertCircle size={20} className="rotate-45" />
              </button>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-slate-500 text-xs font-bold uppercase">Entidad</span>
                <span className="text-white text-xs font-bold uppercase">{selectedInvoice.entityId}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-slate-500 text-xs font-bold uppercase">Periodo</span>
                <span className="text-white text-xs font-bold">{selectedInvoice.period}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-slate-500 text-xs font-bold uppercase">Neto</span>
                <span className="text-white text-xs font-bold">${selectedInvoice.netAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-slate-500 text-xs font-bold uppercase">IVA (21%)</span>
                <span className="text-white text-xs font-bold">${selectedInvoice.taxAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-4">
                <span className="text-slate-400 text-sm font-bold uppercase">Total a Pagar</span>
                <span className="text-emerald-400 text-xl font-bold">${selectedInvoice.totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button className="flex items-center justify-center space-x-2 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-bold text-xs hover:bg-white/10 transition-all">
                <Download size={14} />
                <span>Descargar PDF</span>
              </button>
              {selectedInvoice.status !== 'paid' ? (
                <button 
                  onClick={() => handleReconcile(selectedInvoice.id)}
                  className="flex items-center justify-center space-x-2 py-3 bg-emerald-500 text-white rounded-xl font-bold text-xs hover:bg-emerald-400 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                >
                  <CheckCircle2 size={14} />
                  <span>Conciliar Pago</span>
                </button>
              ) : (
                <div className="flex items-center justify-center space-x-2 py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl font-bold text-xs">
                  <CheckCircle2 size={14} />
                  <span>Pago Conciliado</span>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {/* Global Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-500">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
            <DollarSign className="absolute inset-0 m-auto text-emerald-500 animate-pulse" size={32} />
          </div>
          <h3 className="text-xl font-bold text-white mt-8 tracking-tighter uppercase">Procesando Motor Financiero</h3>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2 animate-pulse">Sincronizando con la red de pagos...</p>
        </div>
      )}
    </div>
  );
};

export default OCCBilling;
