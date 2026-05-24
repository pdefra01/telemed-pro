import React, { useState } from 'react';
import { MOCK_PAYMENTS, MOCK_PATIENT } from '../../constants';
import { CreditCard, Download, CheckCircle, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';

const Payments: React.FC = () => {
    const { toast } = useToast();
    const [payments, setPayments] = useState(MOCK_PAYMENTS);
    const [isProcessing, setIsProcessing] = useState(false);

    const pendingPayment = payments.find(p => p.status === 'pending');

    const handlePay = () => {
        if (!pendingPayment) return;

        setIsProcessing(true);
        // Simulate payment gateway
        setTimeout(() => {
            setPayments(prev => prev.map(p =>
                p.id === pendingPayment.id ? { ...p, status: 'paid', date: new Date().toISOString().split('T')[0] } : p
            ));
            setIsProcessing(false);
            toast("¡Pago exitoso! Gracias por mantener tu plan al día.", 'success');
        }, 2000);
    };

    const handleDownload = (period: string) => {
        // Simulate file download
        const element = document.createElement("a");
        const file = new Blob([`Factura MEDINEX\nPeriodo: ${period}\nAfiliado: ${MOCK_PATIENT.name}\nEstado: PAGADO`], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `Factura-${period}.txt`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };    return (
        <div className="space-y-10 animate-in fade-in duration-700 pb-20">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                            <CreditCard size={24} />
                        </div>
                        <h1 className="text-4xl font-bold text-white tracking-tight">Plan y Facturación</h1>
                    </div>
                    <p className="text-slate-400 font-medium max-w-xl text-lg leading-relaxed">
                        Gestioná tu suscripción y accedé a tus comprobantes fiscales con validez legal.
                    </p>
                </div>
            </div>

            {/* Plan Status Card - Premium View */}
            <div className="group relative bg-slate-900 rounded-[3rem] p-10 border border-white/10 shadow-2xl overflow-hidden transition-all duration-700 hover:shadow-emerald-500/10">
                <div className="absolute top-0 right-0 p-12 text-emerald-500/5 group-hover:scale-125 group-hover:text-emerald-500/10 transition-all duration-1000">
                    <ShieldCheck size={280} />
                </div>
                
                <div className="relative z-10 flex flex-col lg:flex-row gap-12 items-start lg:items-center">
                    <div className="flex-1 space-y-6">
                        <div className="space-y-1">
                            <p className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em]">Estado de Cobertura</p>
                            <h2 className="text-5xl font-bold text-white tracking-tighter">{MOCK_PATIENT.planName}</h2>
                        </div>
                        
                        <div className="flex flex-wrap gap-4">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl flex items-center gap-2">
                                <CheckCircle size={16} className="text-emerald-500" />
                                <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Activo</span>
                            </div>
                            <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-2">
                                <ShieldCheck size={16} className="text-slate-400" />
                                <span className="text-slate-300 text-xs font-bold uppercase tracking-widest">Cobertura Nacional</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full lg:w-px h-px lg:h-24 bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>

                    <div className="grid grid-cols-2 gap-12">
                        <div className="space-y-1">
                            <p className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.2em]">Grupo Familiar</p>
                            <p className="text-2xl font-bold text-white">{MOCK_PATIENT.familyMembers?.length ? MOCK_PATIENT.familyMembers.length + 1 : 1} <span className="text-slate-500 text-sm font-bold uppercase tracking-widest ml-2">Integrantes</span></p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.2em]">Próximo Vencimiento</p>
                            <p className="text-2xl font-bold text-white">05 <span className="text-slate-500 text-sm font-bold uppercase tracking-widest ml-2">May 2026</span></p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Billing Action Section */}
            <div className="grid grid-cols-1 gap-10">
                {pendingPayment ? (
                    <div className="group relative bg-orange-500/10 backdrop-blur-xl border border-orange-500/20 rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl transition-all duration-500 hover:bg-orange-500/[0.15]">
                        <div className="flex items-center gap-6">
                            <div className="p-5 bg-orange-500 text-white rounded-[1.5rem] shadow-xl shadow-orange-500/20 animate-pulse">
                                <AlertTriangle size={28} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-white tracking-tight">Pago Pendiente Detectado</h3>
                                <p className="text-orange-300 font-bold text-sm mt-1 uppercase tracking-widest">Período correspondiente a {pendingPayment.period}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-8 w-full md:w-auto">
                            <div className="text-right">
                                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Monto a Abonar</p>
                                <span className="text-4xl font-bold text-white tracking-tighter">${pendingPayment.amount.toLocaleString()}</span>
                            </div>
                            <Button
                                onClick={handlePay}
                                isLoading={isProcessing}
                                className="h-16 px-10 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl shadow-2xl shadow-orange-600/30 font-bold text-sm uppercase tracking-[0.2em] transition-all hover:scale-105 active:scale-95"
                            >
                                Regularizar Ahora
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-emerald-500/5 backdrop-blur-xl border border-emerald-500/20 rounded-[2.5rem] p-8 flex items-center justify-center gap-4 shadow-xl">
                        <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500">
                            <CheckCircle size={20} />
                        </div>
                        <p className="text-emerald-400 font-bold text-lg tracking-tight uppercase tracking-[0.1em]">Tus pagos están al día. ¡Gracias por confiar en nosotros!</p>
                    </div>
                )}

                {/* Transaction History - Modern List View */}
                <div className="space-y-8">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-3">
                            Historial de Transacciones
                            <span className="bg-white/5 text-slate-500 text-[10px] px-3 py-1 rounded-full border border-white/5">{payments.length} Registros</span>
                        </h3>
                    </div>

                    <div className="space-y-4">
                        {payments.map(payment => (
                            <div key={payment.id} className="group bg-white/5 backdrop-blur-xl p-6 rounded-3xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-500 hover:bg-white/[0.08] hover:translate-x-1">
                                <div className="flex items-center gap-6 flex-1">
                                    <div className={`p-4 rounded-2xl border ${
                                        payment.status === 'paid' 
                                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                                        : 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                                    }`}>
                                        <CreditCard size={20} />
                                    </div>
                                    <div>
                                        <p className="text-white font-bold text-lg tracking-tight">{payment.period}</p>
                                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
                                            {payment.date ? `Pagado el ${new Date(payment.date).toLocaleDateString()}` : 'Pendiente de Procesamiento'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-10">
                                    <div className="text-right">
                                        <p className="text-white font-bold text-xl">${payment.amount.toLocaleString()}</p>
                                        <div className="flex items-center justify-end gap-2 mt-1">
                                            <div className={`w-1.5 h-1.5 rounded-full ${payment.status === 'paid' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-orange-500 animate-pulse'}`}></div>
                                            <p className={`text-[10px] font-bold uppercase tracking-widest ${payment.status === 'paid' ? 'text-emerald-500' : 'text-orange-500'}`}>
                                                {payment.status === 'paid' ? 'Completado' : 'Pendiente'}
                                            </p>
                                        </div>
                                    </div>

                                    {payment.status === 'paid' && (
                                        <Button
                                            variant="ghost"
                                            onClick={() => handleDownload(payment.period)}
                                            className="w-12 h-12 p-0 bg-white/5 hover:bg-emerald-500 hover:text-white rounded-xl border border-white/5 transition-all group-hover:scale-110"
                                            icon={<Download size={18} />}
                                        />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Payments;