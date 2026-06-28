import React, { useState, useEffect } from 'react';
import { PharmacyProduct, Prescription } from '../../types';
import { pharmacyRepository } from '../../repositories/PharmacyRepository';
import { pharmacyOrderRepository } from '../../repositories/PharmacyOrderRepository';
import { prescriptionRepository } from '../../repositories/PrescriptionRepository';
import { Search, ShoppingBag, Pill, ShieldCheck, CheckCircle, ArrowRight, Truck, Plus, Minus, X, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface PharmacyCatalogProps {
  patientId: string;
  patientAddress?: string;
  onNavigateToTracking?: (orderId: string) => void;
}

export const PharmacyCatalog: React.FC<PharmacyCatalogProps> = ({
  patientId,
  patientAddress = "Av. Belgrano 1234, Salta Capital",
  onNavigateToTracking
}) => {
  const [products, setProducts] = useState<PharmacyProduct[]>([]);
  const [activePrescriptions, setActivePrescriptions] = useState<Prescription[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  
  // Carrito
  const [cart, setCart] = useState<{ product: PharmacyProduct; quantity: number }[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string | undefined>();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [orderSuccessId, setOrderSuccessId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedCategory, searchQuery]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, rxList] = await Promise.all([
        pharmacyRepository.getProducts({ category: selectedCategory, query: searchQuery }),
        prescriptionRepository.getPrescriptionsByPatientId(patientId)
      ]);
      setProducts(prods);
      setActivePrescriptions(rxList.filter(r => r.status === 'active'));
    } catch (err) {
      console.error("Error cargando farmacia:", err);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: PharmacyProduct) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.product.id === productId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as { product: PharmacyProduct; quantity: number }[];
    });
  };

  const handleDispensePrescription = (rx: Prescription) => {
    // Dispansación en 1-Click desde receta: buscar medicamentos recetados e incoporarlos
    const newCartItems: { product: PharmacyProduct; quantity: number }[] = [];
    rx.medications.forEach(med => {
      const matchedProd = products.find(p => p.name.toLowerCase().includes(med.name.toLowerCase()) || med.name.toLowerCase().includes(p.name.toLowerCase())) || {
        id: `rx-prod-${Math.random()}`,
        name: med.name,
        activeIngredient: med.name,
        presentation: 'Recetado por profesional',
        laboratory: 'Farmacia Certificada',
        price: 2500,
        requiresPrescription: true,
        category: 'recetados'
      };
      newCartItems.push({ product: matchedProd, quantity: med.quantity || 1 });
    });

    setCart(newCartItems);
    setSelectedPrescriptionId(rx.id);
    setIsCheckoutOpen(true);
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const discount = Math.round(subtotal * 0.4); // 40% Co-pago Bonificado por Plan Médicos
  const total = subtotal - discount;

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      const order = await pharmacyOrderRepository.createOrder({
        patientId,
        prescriptionId: selectedPrescriptionId,
        deliveryAddress: patientAddress,
        subtotal,
        coverageDiscount: discount,
        total,
        items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity, unitPrice: i.product.price }))
      });
      setOrderSuccessId(order.id);
      setCart([]);
      setIsCheckoutOpen(false);
    } catch (err) {
      alert("Error al procesar la orden de compra.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-cyan-700 rounded-3xl p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row items-center justify-between">
        <div className="space-y-3 max-w-2xl text-center md:text-left mb-6 md:mb-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider">
            <ShieldCheck size={14} /> Farmacia Digital & Despacho 24h
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Farmacia Digital MEDINEX</h1>
          <p className="text-teal-100 text-sm md:text-base">
            Pedí tus medicamentos con cobertura directa de tu plan. Despacho por cadetería con seguimiento en tiempo real hasta tu puerta.
          </p>
        </div>
        
        {/* Carrito Flotante / Contador */}
        <button 
          onClick={() => setIsCheckoutOpen(true)}
          className="relative bg-white text-teal-700 font-bold px-6 py-3.5 rounded-2xl shadow-lg hover:bg-teal-50 transition flex items-center gap-3"
        >
          <ShoppingBag size={22} />
          <span>Ver Carrito</span>
          {cart.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-xs font-extrabold w-6 h-6 rounded-full flex items-center justify-center animate-bounce">
              {cart.reduce((a, b) => a + b.quantity, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Orden Creada con Éxito Modal Banner */}
      {orderSuccessId && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500 text-white rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">¡Pedido Confirmado y en Preparación!</h3>
              <p className="text-sm text-slate-300">Tu orden #{orderSuccessId.substring(0, 8)} ya fue asignada a cadetería.</p>
            </div>
          </div>
          <Button 
            variant="primary"
            icon={<Truck size={18} />}
            onClick={() => onNavigateToTracking && onNavigateToTracking(orderSuccessId)}
          >
            Seguir Cadete en Vivo
          </Button>
        </div>
      )}

      {/* Sección 1-Click desde Receta Electrónica Activa */}
      {activePrescriptions.length > 0 && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Pill className="text-teal-400" size={22} />
            <h2 className="text-lg font-bold text-slate-100">Tus Recetas Electrónicas Disponibles para Dispensar</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePrescriptions.map(rx => (
              <div key={rx.id} className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-md border border-teal-500/20">
                      Emitida por Dr. {rx.doctorName}
                    </span>
                    <span className="text-xs text-slate-400">{rx.date}</span>
                  </div>
                  <ul className="text-sm space-y-1 text-slate-200 mt-2">
                    {rx.medications.map((m, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-teal-400 rounded-full"></span>
                        <span className="font-medium">{m.name}</span>
                        <span className="text-xs text-slate-400">({m.instructions})</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => handleDispensePrescription(rx)}
                  className="w-full py-2.5 px-4 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 font-semibold rounded-lg border border-teal-500/40 text-xs flex items-center justify-center gap-2 transition"
                >
                  <span>Comprar Medicamentos de la Receta (40% Cobertura)</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros y Buscador */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por remedio, droga o laboratorio..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500 placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'venta_libre', label: 'Venta Libre' },
            { id: 'analgesicos', label: 'Analgésicos' },
            { id: 'antibacterianos', label: 'Antibióticos' },
            { id: 'pediatria', label: 'Pediatría' },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat.id 
                  ? 'bg-teal-500 text-white font-bold shadow-md' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grilla de Productos */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Cargando catálogo de farmacia...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map(prod => (
            <div key={prod.id} className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-600 transition group">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-md ${
                    prod.requiresPrescription ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {prod.requiresPrescription ? 'Bajo Receta' : 'Venta Libre'}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">{prod.laboratory}</span>
                </div>
                <h3 className="text-base font-bold text-slate-100 group-hover:text-teal-300 transition">{prod.name}</h3>
                <p className="text-xs text-slate-400 mt-1">{prod.activeIngredient} • {prod.presentation}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block line-through">$ {Math.round(prod.price * 1.4)}</span>
                  <span className="text-lg font-extrabold text-teal-400">$ {prod.price}</span>
                </div>
                <button
                  onClick={() => addToCart(prod)}
                  className="p-2.5 bg-teal-500/20 hover:bg-teal-500 text-teal-300 hover:text-white rounded-xl border border-teal-500/40 transition flex items-center justify-center"
                  title="Agregar al carrito"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Carrito / Checkout */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5 text-slate-100 font-bold text-lg">
                <ShoppingBag className="text-teal-400" size={22} />
                <span>Resumen de tu Compra</span>
              </div>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-8 text-slate-400">El carrito está vacío.</div>
            ) : (
              <div className="space-y-4 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                {cart.map(item => (
                  <div key={item.product.id} className="flex items-center justify-between bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">{item.product.name}</h4>
                      <span className="text-xs text-teal-400">$ {item.product.price} c/u</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center bg-slate-900 rounded-lg border border-slate-700">
                        <button onClick={() => updateCartQuantity(item.product.id, -1)} className="p-1.5 text-slate-400 hover:text-white"><Minus size={14} /></button>
                        <span className="px-2.5 text-xs font-bold text-slate-100">{item.quantity}</span>
                        <button onClick={() => updateCartQuantity(item.product.id, 1)} className="p-1.5 text-slate-400 hover:text-white"><Plus size={14} /></button>
                      </div>
                      <span className="text-sm font-bold text-slate-100 min-w-[60px] text-right">$ {item.product.price * item.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-slate-800/80 p-4 rounded-2xl space-y-2 text-sm">
              <div className="flex justify-between text-slate-400"><span>Subtotal Comercial:</span><span>$ {subtotal}</span></div>
              <div className="flex justify-between text-emerald-400 font-semibold"><span>Cobertura Plan Médicos (40%):</span><span>- $ {discount}</span></div>
              <div className="flex justify-between text-slate-100 font-extrabold text-base pt-2 border-t border-slate-700"><span>Total a Pagar:</span><span className="text-teal-400">$ {total}</span></div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Dirección de Entrega (Cadetería):</label>
              <input type="text" value={patientAddress} readOnly className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300" />
            </div>

            <Button
              variant="primary"
              className="w-full py-3.5 text-base font-bold"
              disabled={cart.length === 0 || isProcessing}
              onClick={handleCheckout}
            >
              {isProcessing ? 'Procesando Pedido...' : 'Confirmar Pedido y Enviar Cadete'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
