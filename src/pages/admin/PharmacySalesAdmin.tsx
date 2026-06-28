import React, { useState, useEffect } from 'react';
import { PharmacyOrder } from '../../types';
import { pharmacyOrderRepository } from '../../repositories/PharmacyOrderRepository';
import { ShoppingCart, DollarSign, Truck, Pill, ShieldCheck, Search, FileText, CheckCircle2, Clock, MapPin } from 'lucide-react';

export const PharmacySalesAdmin: React.FC = () => {
  const [orders, setOrders] = useState<(PharmacyOrder & { patientName?: string; deliveryStatus?: string; courierName?: string; otpCode?: string })[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    loadSalesData();
  }, []);

  const loadSalesData = async () => {
    setLoading(true);
    try {
      const data = await pharmacyOrderRepository.getAllOrders();
      setOrders(data);
    } catch (err) {
      console.error("Error cargando reporte de ventas:", err);
    } finally {
      setLoading(false);
    }
  };

  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const totalDiscount = orders.reduce((sum, o) => sum + o.coverageDiscount, 0);
  const totalPrescriptionsDispensed = orders.filter(o => o.prescriptionId).length;
  const activeDeliveriesCount = orders.filter(o => o.deliveryStatus === 'assigned' || o.deliveryStatus === 'in_transit').length;

  const filteredOrders = orders.filter(o => 
    o.patientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.deliveryAddress.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center font-bold">
            <ShoppingCart size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Dashboard de Ventas de Farmacia y Cadetería</h1>
            <p className="text-xs text-slate-400">Seguimiento en tiempo real de facturación, dispensación de recetas y entregas.</p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Facturación Total</span>
            <DollarSign className="text-emerald-400" size={20} />
          </div>
          <div className="text-2xl font-extrabold text-slate-100">$ {totalRevenue.toLocaleString()}</div>
          <p className="text-[11px] text-emerald-400">Descuentos aplicados: $ {totalDiscount.toLocaleString()}</p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Órdenes Procesadas</span>
            <ShoppingCart className="text-cyan-400" size={20} />
          </div>
          <div className="text-2xl font-extrabold text-slate-100">{orders.length}</div>
          <p className="text-[11px] text-slate-400">Pedidos de farmacia registrados</p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Recetas Dispensadas</span>
            <Pill className="text-teal-400" size={20} />
          </div>
          <div className="text-2xl font-extrabold text-slate-100">{totalPrescriptionsDispensed}</div>
          <p className="text-[11px] text-teal-400">Firma digital ECDSA P-256 validada</p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Cadetería Activa</span>
            <Truck className="text-amber-400" size={20} />
          </div>
          <div className="text-2xl font-extrabold text-slate-100">{activeDeliveriesCount}</div>
          <p className="text-[11px] text-amber-400">En tránsito / asignadas en vivo</p>
        </div>
      </div>

      {/* Tabla de Órdenes */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-slate-700 pb-4">
          <h3 className="text-base font-bold text-slate-100">Órdenes de Compra y Despacho</h3>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por paciente, orden o dirección..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">Cargando órdenes de venta...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">No se encontraron órdenes registradas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Orden #</th>
                  <th className="py-3 px-4">Paciente</th>
                  <th className="py-3 px-4">Resumen Ítems</th>
                  <th className="py-3 px-4">Receta Vinculada</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Estado Entrega</th>
                  <th className="py-3 px-4">PIN OTP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {filteredOrders.map(ord => (
                  <tr key={ord.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-teal-400">#{ord.id.substring(0, 8)}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-100">{ord.patientName}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs">{ord.deliveryAddress}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <ul className="space-y-0.5">
                        {ord.items?.map((it, idx) => (
                          <li key={idx} className="text-slate-300">
                            {it.quantity}x {it.productName}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-3.5 px-4">
                      {ord.prescriptionId ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-md border border-teal-500/20 font-semibold">
                          <ShieldCheck size={12} /> Validada
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">Venta Libre</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-emerald-400">$ {ord.total}</div>
                      <div className="text-[10px] text-slate-500">Desc: $ {ord.coverageDiscount}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                        ord.deliveryStatus === 'delivered'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {ord.deliveryStatus === 'delivered' ? <CheckCircle2 size={12} /> : <Truck size={12} />}
                        {ord.deliveryStatus === 'delivered' ? 'Entregado' : 'En Camino / Asignado'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-300">{ord.otpCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
