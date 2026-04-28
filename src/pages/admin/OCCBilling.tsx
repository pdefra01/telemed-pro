import React, { useState, useEffect } from 'react';
import { 
  DollarSign, Download, FileText, Filter, 
  Search, ExternalLink, Calendar, Receipt,
  CheckCircle2, Clock, AlertCircle
} from 'lucide-react';
import { invoiceRepository } from '../../repositories/InvoiceRepository';
import { accountingService } from '../../services/AccountingService';
import { billingService } from '../../services/BillingService';
import { Invoice } from '../../types';

const GlassCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <div className={`bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden transition-all duration-300 hover:border-white/20 ${className}`}>
    {children}
  </div>
);

const OCCBilling: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

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

  useEffect(() => {
    loadInvoices();
  }, []);

  const handleExport = () => {
    const csvContent = accountingService.generateCSVExport(invoices);
    const filename = `telemed-billing-export-${new Date().toISOString().split('T')[0]}.csv`;
    accountingService.downloadCSV(csvContent, filename);
  };

  const handleProcessCycle = async () => {
    if (!window.confirm('¿Estás seguro de iniciar el ciclo de facturación mensual? Se generarán comprobantes para todos los convenios y afiliados directos.')) return;
    
    try {
      setIsLoading(true);
      const period = new Date().toISOString().substring(0, 7); // Formato YYYY-MM
      const result = await billingService.runMonthlyBillingCycle(period);
      alert(`Ciclo completado con éxito.\nConvenios: ${result.processedAgreements}\nDirectos: ${result.processedIndividuals}\nTotal: $${result.totalAmount.toLocaleString()}`);
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

  const filteredInvoices = invoices.filter(inv => 
    inv.period.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.entityId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">Financial Engine</h2>
          <h1 className="text-4xl font-black text-white tracking-tighter">
            OCC <span className="text-slate-500 font-light italic">Billing</span> Center
          </h1>
        </div>
        <div className="flex flex-col md:flex-row gap-4">
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
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard className="p-6 border-l-4 border-l-blue-500">
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Total Facturado (Mes)</p>
          <h4 className="text-3xl font-black text-white">$1.240.500</h4>
          <p className="text-emerald-400 text-[10px] font-bold mt-2">+12.5% vs mes anterior</p>
        </GlassCard>
        <GlassCard className="p-6 border-l-4 border-l-amber-500">
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Pendiente de Cobro</p>
          <h4 className="text-3xl font-black text-white">$320.000</h4>
          <p className="text-amber-400 text-[10px] font-bold mt-2">14 facturas vencidas</p>
        </GlassCard>
        <GlassCard className="p-6 border-l-4 border-l-indigo-500">
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Próximo Cierre</p>
          <h4 className="text-3xl font-black text-white">30 Abr</h4>
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
                    <span className="text-sm font-black text-white">${inv.totalAmount.toLocaleString()}</span>
                  </td>
                  <td className="py-4">
                    <div className={`inline-flex items-center px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-tighter ${
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

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedInvoice(null)}></div>
          <GlassCard className="relative w-full max-w-lg p-8 animate-in zoom-in duration-300">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-emerald-500 font-bold text-[10px] uppercase tracking-widest mb-1">Detalle de Comprobante</p>
                <h3 className="text-2xl font-black text-white tracking-tighter">#{selectedInvoice.id.substring(0, 12).toUpperCase()}</h3>
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
                <span className="text-white text-xs font-black uppercase">{selectedInvoice.entityId}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-slate-500 text-xs font-bold uppercase">Periodo</span>
                <span className="text-white text-xs font-black">{selectedInvoice.period}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-slate-500 text-xs font-bold uppercase">Neto</span>
                <span className="text-white text-xs font-black">${selectedInvoice.netAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-slate-500 text-xs font-bold uppercase">IVA (21%)</span>
                <span className="text-white text-xs font-black">${selectedInvoice.taxAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-4">
                <span className="text-slate-400 text-sm font-bold uppercase">Total a Pagar</span>
                <span className="text-emerald-400 text-xl font-black">${selectedInvoice.totalAmount.toLocaleString()}</span>
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
          <h3 className="text-xl font-black text-white mt-8 tracking-tighter uppercase">Procesando Motor Financiero</h3>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2 animate-pulse">Sincronizando con la red de pagos...</p>
        </div>
      )}
    </div>
  );
};

export default OCCBilling;
