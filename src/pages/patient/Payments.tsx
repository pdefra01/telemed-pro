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
        const file = new Blob([`Factura TeleMed Pro\nPeriodo: ${period}\nAfiliado: ${MOCK_PATIENT.name}\nEstado: PAGADO`], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `Factura-${period}.txt`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-800">Mi Plan y Pagos</h1>

            {/* Plan Status Card */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <ShieldCheck size={120} />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-center">
                    <div className="mb-6 md:mb-0">
                        <p className="text-slate-400 text-sm uppercase tracking-wider mb-1">Plan Actual</p>
                        <h2 className="text-3xl font-bold mb-2">{MOCK_PATIENT.planName}</h2>
                        <p className="flex items-center text-green-400 text-sm font-medium">
                            <CheckCircle size={16} className="mr-1" /> Cobertura Activa
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-slate-400 text-sm mb-1">Grupo Familiar</p>
                        <p className="text-xl font-bold">{MOCK_PATIENT.familyMembers?.length ? MOCK_PATIENT.familyMembers.length + 1 : 1} Integrantes</p>
                    </div>
                </div>
            </div>

            {/* Pending Payment Alert */}
            {pendingPayment ? (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between shadow-sm animate-pulse-slow">
                    <div className="flex items-center mb-4 md:mb-0">
                        <div className="p-3 bg-orange-100 text-orange-600 rounded-full mr-4">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-orange-800 text-lg">Factura Pendiente</h3>
                            <p className="text-orange-700">Período: {pendingPayment.period}</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4 w-full md:w-auto">
                        <span className="text-2xl font-bold text-gray-800">${pendingPayment.amount.toLocaleString()}</span>
                        <Button
                            onClick={handlePay}
                            isLoading={isProcessing}
                            className="flex-1 md:flex-none bg-orange-600 hover:bg-orange-700 text-white min-w-[140px] shadow-lg shadow-orange-500/20 justification-center"
                        >
                            Pagar Ahora
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex items-center justify-center text-green-800 font-medium">
                    <CheckCircle className="mr-2" /> Tus pagos están al día.
                </div>
            )}

            {/* Payment History */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800">Historial de Pagos</h3>
                </div>
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Período</th>
                            <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Fecha Pago</th>
                            <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Monto</th>
                            <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                            <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Comprobante</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {payments.map(payment => (
                            <tr key={payment.id} className="hover:bg-gray-50 transition">
                                <td className="py-4 px-6 font-medium text-gray-800">{payment.period}</td>
                                <td className="py-4 px-6 text-gray-500 text-sm">{payment.date || '-'}</td>
                                <td className="py-4 px-6 font-medium text-gray-800">${payment.amount.toLocaleString()}</td>
                                <td className="py-4 px-6">
                                    {payment.status === 'paid' ? (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                            Pagado
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                            Pendiente
                                        </span>
                                    )}
                                </td>
                                <td className="py-4 px-6 text-right">
                                    {payment.status === 'paid' && (
                                        <button
                                            type="button"
                                            onClick={() => handleDownload(payment.period)}
                                            className="text-teal-600 hover:text-teal-800 p-1"
                                        >
                                            <Download size={18} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Payments;