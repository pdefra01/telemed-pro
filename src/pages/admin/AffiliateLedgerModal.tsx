import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Plus, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { accountMovementRepository, AccountMovement } from '../../repositories/AccountMovementRepository';
import { affiliateRepository } from '../../repositories/AffiliateRepository';
import { Patient } from '../../types';
import { supabase } from '../../services/supabase';
import { PdfService } from '../../services/PdfService';
import { FileText } from 'lucide-react';

interface AffiliateLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
}

export const AffiliateLedgerModal: React.FC<AffiliateLedgerModalProps> = ({ isOpen, onClose, patientId }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [movements, setMovements] = useState<AccountMovement[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'payment' | 'adjustment' | 'charge'>('payment');
  const [source, setSource] = useState('Efectivo / Manual');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && patientId) {
      loadData();
    } else {
      setShowForm(false);
    }
  }, [isOpen, patientId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: p, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', patientId)
        .single();
      
      if (pErr) throw pErr;
      
      const mappedPatient = {
        id: p.id,
        name: p.full_name,
        dni: p.dni,
        planName: p.plan_name,
        email: p.email
      } as any;

      setPatient(mappedPatient);

      const bal = await accountMovementRepository.getBalance(patientId);
      setBalance(bal);

      const movs = await accountMovementRepository.getMovements(patientId);
      setMovements(movs);
    } catch (error) {
      console.error('Error loading ledger data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handleSubmit triggered with amount:', amount);
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      console.log('Invalid amount, returning early');
      return;
    }

    setIsSubmitting(true);
    try {
      await accountMovementRepository.postManualAdjustment({
        entityId: patientId,
        amount: Number(amount),
        type,
        source,
        externalRef: `MANUAL-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      });
      setAmount('');
      setShowForm(false);
      await loadData();
    } catch (error: any) {
      console.error('Error posting manual adjustment:', error);
      alert(`Hubo un error al registrar el movimiento: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-slate-900 border border-white/10 w-full max-w-4xl max-h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity className="text-emerald-400" />
              Cuenta Corriente
            </h3>
            {patient && <p className="text-sm text-slate-400 mt-1">{patient.name} - DNI {patient.dni}</p>}
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <RefreshCw className="animate-spin mb-4" size={32} />
              <p>Cargando movimientos...</p>
            </div>
          ) : (
            <>
              {/* Balance Card */}
              <div className={`p-6 rounded-2xl border ${balance > 0 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/20'} flex justify-between items-center`}>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest ${balance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    Saldo Actual
                  </p>
                  <h2 className="text-4xl font-bold text-white mt-1">
                    ${Math.abs(balance).toLocaleString()}
                  </h2>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-300">
                    {balance > 0 ? 'El paciente tiene deuda.' : 'Cuenta al día.'}
                  </p>
                  <button 
                    onClick={() => setShowForm(!showForm)}
                    className="mt-3 flex items-center space-x-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-bold transition-all"
                  >
                    <Plus size={16} />
                    <span>Nuevo Movimiento</span>
                  </button>
                </div>
              </div>

              {/* Form */}
              {showForm && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 animate-in slide-in-from-top-4">
                  <h4 className="text-white font-bold mb-4">Cargar Ajuste o Cobro Manual</h4>
                  <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">Tipo</label>
                      <select 
                        value={type} 
                        onChange={(e: any) => setType(e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                      >
                        <option value="payment">Pago (Acredita saldo)</option>
                        <option value="adjustment">Ajuste a favor</option>
                        <option value="charge">Cargo (Suma deuda)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">Monto ($)</label>
                      <input 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Ej. 15000"
                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                        required
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">Concepto / Origen</label>
                      <input 
                        type="text" 
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        placeholder="Ej. Efectivo Sucursal"
                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                    <div className="flex items-end">
                      <button 
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-2.5 rounded-xl transition-all flex justify-center items-center h-[42px]"
                      >
                        {isSubmitting ? <RefreshCw className="animate-spin" size={18} /> : 'Registrar'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Table */}
              <div className="overflow-hidden border border-white/10 rounded-2xl bg-white/5">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 text-xs uppercase tracking-wider font-bold">
                      <th className="px-6 py-4">Fecha</th>
                      <th className="px-6 py-4">Concepto</th>
                      <th className="px-6 py-4">Ref / Factura</th>
                      <th className="px-6 py-4 text-right">Monto</th>
                      <th className="px-6 py-4 text-right">Recibo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {movements.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-slate-500 italic">
                          No hay movimientos registrados.
                        </td>
                      </tr>
                    ) : (
                      movements.map(mov => {
                        const isCredit = mov.type === 'payment' || mov.type === 'adjustment';
                        return (
                          <tr key={mov.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4 text-sm text-slate-300">
                              {new Date(mov.createdAt).toLocaleDateString()} {new Date(mov.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center space-x-2">
                                <span className={`p-1.5 rounded-lg ${isCredit ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                  {isCredit ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                                </span>
                                <span className="text-sm font-medium text-white capitalize">
                                  {mov.type === 'payment' ? 'Pago' : mov.type === 'charge' ? 'Cargo' : 'Ajuste'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs">
                              <div className="text-slate-300">{mov.source || 'Sistema'}</div>
                              <div className="text-slate-500 font-mono mt-0.5 max-w-[150px] truncate" title={mov.externalRef || ''}>
                                {mov.invoiceId ? `Factura: ${mov.invoiceId.split('-')[0]}` : mov.externalRef}
                              </div>
                            </td>
                            <td className={`px-6 py-4 text-sm font-bold text-right ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isCredit ? '+' : '-'}${mov.amount.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {isCredit && patient && (
                                <button
                                  onClick={() => PdfService.generateMovementReceiptPDF(mov, patient)}
                                  className="p-2 bg-white/5 hover:bg-emerald-500/20 text-emerald-400 rounded-xl transition-colors border border-white/5"
                                  title="Descargar Recibo"
                                >
                                  <FileText size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
