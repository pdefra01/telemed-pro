import React, { useState, useEffect } from 'react';
import { PharmacyDelivery, PharmacyOrder } from '../../types';
import { deliveryRepository } from '../../repositories/DeliveryRepository';
import { pharmacyOrderRepository } from '../../repositories/PharmacyOrderRepository';
import { Truck, CheckCircle2, MapPin, Phone, ShieldCheck, Clock, Navigation } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface PatientOrderTrackingProps {
  orderId: string;
  onBack?: () => void;
}

export const PatientOrderTracking: React.FC<PatientOrderTrackingProps> = ({ orderId, onBack }) => {
  const [delivery, setDelivery] = useState<PharmacyDelivery | null>(null);
  const [order, setOrder] = useState<PharmacyOrder | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadTrackingData();
    const interval = setInterval(loadTrackingData, 10000); // Polling cada 10 seg
    return () => clearInterval(interval);
  }, [orderId]);

  const loadTrackingData = async () => {
    try {
      const [deliv, ord] = await Promise.all([
        deliveryRepository.getDeliveryByOrderId(orderId),
        pharmacyOrderRepository.getOrderById(orderId)
      ]);
      setDelivery(deliv);
      setOrder(ord);
    } catch (err) {
      console.error("Error cargando tracking:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Cargando seguimiento en tiempo real...</div>;
  }

  const getStatusStep = (status: string) => {
    switch (status) {
      case 'assigned': return 1;
      case 'picked_up': return 2;
      case 'in_transit': return 3;
      case 'delivered': return 4;
      default: return 1;
    }
  };

  const currentStep = delivery ? getStatusStep(delivery.trackingStatus) : 1;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Navigation Bar */}
      <div className="flex justify-between items-center bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-500/20 text-teal-400 rounded-xl flex items-center justify-center font-bold">
            <Truck size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Seguimiento de Cadetería en Vivo</h1>
            <p className="text-xs text-slate-400">Orden #{orderId.substring(0, 8)}</p>
          </div>
        </div>
        {onBack && (
          <Button variant="secondary" onClick={onBack} className="text-xs">
            Volver al Catálogo
          </Button>
        )}
      </div>

      {/* Pipeline Stepper */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 shadow-xl">
        <div className="grid grid-cols-4 gap-2 relative">
          {[
            { step: 1, title: 'Asignado', desc: 'Cadete confirmado' },
            { step: 2, title: 'En Retiro', desc: 'Retirando en farmacia' },
            { step: 3, title: 'En Camino', desc: 'Viajando a tu domicilio' },
            { step: 4, title: 'Entregado', desc: 'Recibido en mano' },
          ].map((item) => (
            <div key={item.step} className="text-center space-y-2 z-10">
              <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                currentStep >= item.step ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30 ring-4 ring-teal-500/20' : 'bg-slate-900 text-slate-500 border border-slate-700'
              }`}>
                {currentStep > item.step ? <CheckCircle2 size={20} /> : item.step}
              </div>
              <div>
                <h4 className={`text-xs font-bold ${currentStep >= item.step ? 'text-teal-300' : 'text-slate-500'}`}>{item.title}</h4>
                <p className="text-[10px] text-slate-400 hidden sm:block">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Simulación de Mapa Interactivo de GPS */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative min-h-[320px] flex items-center justify-center p-6">
        {/* Simulación de Red Visual del Mapa */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40"></div>
        
        <div className="relative z-10 text-center space-y-4 max-w-md bg-slate-950/80 backdrop-blur-md p-6 rounded-2xl border border-slate-800 shadow-xl">
          <div className="w-16 h-16 bg-gradient-to-tr from-teal-500 to-cyan-500 text-white rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-teal-500/30 animate-pulse">
            <Navigation size={32} />
          </div>
          <div>
            <span className="text-xs font-bold text-teal-400 uppercase tracking-wider block mb-1">GPS Cadetería MEDINEX</span>
            <h3 className="text-lg font-bold text-slate-100">Cadete: {delivery?.courierName}</h3>
            <p className="text-xs text-slate-400 mt-1">Ubicación aproximada: Salta Centro • Tiempo estimado: 15-20 min</p>
          </div>
          <div className="pt-2 border-t border-slate-800 flex justify-center gap-4 text-xs text-slate-300">
            <span className="flex items-center gap-1.5"><Phone size={14} className="text-teal-400" /> {delivery?.courierPhone}</span>
          </div>
        </div>
      </div>

      {/* OTP y Código de Entrega */}
      {delivery && (
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-1 text-center md:text-left">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-400 uppercase">
              <ShieldCheck size={14} /> Código PIN de Validación Presencial
            </span>
            <h3 className="text-base font-bold text-slate-100">Mostrale este código al cadete al recibir el paquete</h3>
            <p className="text-xs text-slate-400">Garantiza que nadie más pueda recibir tus medicamentos recetados.</p>
          </div>
          <div className="bg-slate-950 border border-teal-500/40 px-6 py-3 rounded-2xl shadow-inner text-center">
            <span className="text-3xl font-mono font-extrabold tracking-[0.25em] text-teal-400">{delivery.otpCode}</span>
          </div>
        </div>
      )}
    </div>
  );
};
