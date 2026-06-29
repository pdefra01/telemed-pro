import React, { useState, useEffect } from 'react';
import { PharmacyProduct, PharmacyInventory, PharmacySupplier, PharmacySupplierOrder, SupplierAccountMovement } from '../../types';
import { pharmacyRepository } from '../../repositories/PharmacyRepository';
import { supplierRepository } from '../../repositories/SupplierRepository';
import { 
  Package, Plus, AlertTriangle, Calendar, Layers, Search, 
  CheckCircle, Truck, Building2, CreditCard, ShoppingCart, 
  Edit3, ShieldAlert, ArrowDownLeft, ArrowUpRight, DollarSign, RefreshCw, BarChart3, Zap
} from 'lucide-react';
import { Button } from '../../components/ui/Button';

export const PharmacyInventoryAdmin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'batches' | 'orders' | 'suppliers' | 'analytics'>('catalog');
  const [products, setProducts] = useState<Array<PharmacyProduct & { totalStock?: number }>>([]);
  const [suppliers, setSuppliers] = useState<PharmacySupplier[]>([]);
  const [orders, setOrders] = useState<PharmacySupplierOrder[]>([]);
  const [paretoData, setParetoData] = useState<Array<any>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected Product & Batches
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<PharmacyInventory[]>([]);

  // New Product Modal / Form
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodActiveIngredient, setProdActiveIngredient] = useState('');
  const [prodPresentation, setProdPresentation] = useState('');
  const [prodLaboratory, setProdLaboratory] = useState('');
  const [prodPrice, setProdPrice] = useState<number>(1500);
  const [prodCategory, setProdCategory] = useState('farmacia');
  const [prodRequiresPrescription, setProdRequiresPrescription] = useState(false);
  const [prodMinStock, setProdMinStock] = useState<number>(20);
  const [prodReorderQty, setProdReorderQty] = useState<number>(100);

  // New Batch Form
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [expirationDate, setExpirationDate] = useState<string>('');
  const [stockQuantity, setStockQuantity] = useState<number>(50);

  // New Supplier Modal / Form
  const [showSupplierModal, setShowSupplierModal] = useState<boolean>(false);
  const [supName, setSupName] = useState('');
  const [supCuit, setSupCuit] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supPhone, setSupPhone] = useState('');

  // Checking Account Movements Modal
  const [selectedSupplierForMovements, setSelectedSupplierForMovements] = useState<PharmacySupplier | null>(null);
  const [movements, setMovements] = useState<SupplierAccountMovement[]>([]);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDesc, setPaymentDesc] = useState('');

  // Receive Order Modal
  const [receivingOrder, setReceivingOrder] = useState<PharmacySupplierOrder | null>(null);
  const [rcvBatchNumber, setRcvBatchNumber] = useState('');
  const [rcvExpDate, setRcvExpDate] = useState('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string>('');

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [prods, sups, ords, pareto] = await Promise.all([
        pharmacyRepository.searchProductsWithStock(''),
        supplierRepository.getSuppliers(),
        supplierRepository.getSupplierOrders(),
        pharmacyRepository.getTopSellingAndParetoAnalysis()
      ]);
      setProducts(prods);
      setSuppliers(sups);
      setOrders(ords);
      setParetoData(pareto);
      if (prods.length > 0 && !selectedProductId) {
        handleSelectProduct(prods[0].id);
      }
    } catch (err) {
      console.error("Error cargando datos de farmacia ERP:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoApplyPareto = async () => {
    if (paretoData.length === 0) return;
    setIsSubmitting(true);
    try {
      for (const item of paretoData) {
        await pharmacyRepository.updateProduct(item.id, {
          minStockThreshold: item.suggestedMinStock,
          reorderQuantity: item.suggestedReorderQty
        });
      }
      setToastMsg("Mínimos de stock y reorden ajustados automáticamente según curva de Pareto ABC.");
      await loadAllData();
    } catch (err) {
      alert("Error al aplicar sugerencias Pareto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectProduct = async (productId: string) => {
    setSelectedProductId(productId);
    try {
      const inv = await pharmacyRepository.getProductInventory(productId);
      setInventory(inv);
    } catch (err) {
      console.error("Error cargando inventario:", err);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingProductId) {
        await pharmacyRepository.updateProduct(editingProductId, {
          name: prodName,
          activeIngredient: prodActiveIngredient,
          presentation: prodPresentation,
          laboratory: prodLaboratory,
          price: prodPrice,
          category: prodCategory,
          requiresPrescription: prodRequiresPrescription,
          minStockThreshold: prodMinStock,
          reorderQuantity: prodReorderQty
        });
        setToastMsg("Medicamento actualizado correctamente.");
      } else {
        await pharmacyRepository.createProduct({
          name: prodName,
          activeIngredient: prodActiveIngredient,
          presentation: prodPresentation,
          laboratory: prodLaboratory,
          price: prodPrice,
          category: prodCategory,
          requiresPrescription: prodRequiresPrescription,
          minStockThreshold: prodMinStock,
          reorderQuantity: prodReorderQty
        });
        setToastMsg("Nuevo medicamento añadido al catálogo.");
      }
      setShowProductModal(false);
      resetProductForm();
      await loadAllData();
    } catch (err) {
      alert("Error al guardar medicamento.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetProductForm = () => {
    setEditingProductId(null);
    setProdName('');
    setProdActiveIngredient('');
    setProdPresentation('');
    setProdLaboratory('');
    setProdPrice(1500);
    setProdCategory('farmacia');
    setProdRequiresPrescription(false);
    setProdMinStock(20);
    setProdReorderQty(100);
  };

  const handleEditProductClick = (p: PharmacyProduct) => {
    setEditingProductId(p.id);
    setProdName(p.name);
    setProdActiveIngredient(p.activeIngredient);
    setProdPresentation(p.presentation);
    setProdLaboratory(p.laboratory);
    setProdPrice(p.price);
    setProdCategory(p.category);
    setProdRequiresPrescription(p.requiresPrescription);
    setProdMinStock(p.minStockThreshold || 20);
    setProdReorderQty(p.reorderQuantity || 100);
    setShowProductModal(true);
  };

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !batchNumber || !expirationDate) return;
    setIsSubmitting(true);
    try {
      await pharmacyRepository.addInventoryBatch({
        productId: selectedProductId,
        batchNumber,
        expirationDate,
        stockQuantity
      });
      setToastMsg("Lote de stock ingresado correctamente.");
      setBatchNumber('');
      setExpirationDate('');
      handleSelectProduct(selectedProductId);
      await loadAllData();
    } catch (err) {
      alert("Error al registrar lote.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await supplierRepository.createSupplier({
        name: supName,
        cuit: supCuit,
        contactEmail: supEmail,
        phone: supPhone,
        status: 'active'
      });
      setToastMsg("Proveedor registrado exitosamente.");
      setShowSupplierModal(false);
      setSupName('');
      setSupCuit('');
      setSupEmail('');
      setSupPhone('');
      const sups = await supplierRepository.getSuppliers();
      setSuppliers(sups);
    } catch (err) {
      alert("Error al crear proveedor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerReorder = async (p: PharmacyProduct & { totalStock?: number }) => {
    if (suppliers.length === 0) {
      alert("Debe registrar al menos una droguería proveedora antes de generar Órdenes de Compra.");
      return;
    }
    const targetSupplier = suppliers[0]; // Asignar proveedor por defecto
    try {
      await supplierRepository.createSupplierOrder({
        supplierId: targetSupplier.id,
        productId: p.id,
        quantityOrdered: p.reorderQuantity || 100,
        unitCost: Math.round(p.price * 0.6) // Costo estimado de reposición
      });
      setToastMsg(`Órden de Compra generada para ${p.name} a ${targetSupplier.name}.`);
      const ords = await supplierRepository.getSupplierOrders();
      setOrders(ords);
      setActiveTab('orders');
    } catch (err) {
      alert("Error al generar Órden de Compra.");
    }
  };

  const handleConfirmReceiveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingOrder || !rcvBatchNumber || !rcvExpDate) return;
    setIsSubmitting(true);
    try {
      await supplierRepository.receiveSupplierOrder(receivingOrder, rcvBatchNumber, rcvExpDate);
      setToastMsg("Mercadería recibida: Stock acreditado y movimiento de Cuenta Corriente registrado.");
      setReceivingOrder(null);
      setRcvBatchNumber('');
      setRcvExpDate('');
      await loadAllData();
    } catch (err) {
      alert("Error al procesar la recepción de mercadería.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenMovements = async (sup: PharmacySupplier) => {
    setSelectedSupplierForMovements(sup);
    try {
      const movs = await supplierRepository.getAccountMovements(sup.id);
      setMovements(movs);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierForMovements || paymentAmount <= 0) return;
    setIsSubmitting(true);
    try {
      await supplierRepository.recordSupplierPayment(selectedSupplierForMovements.id, paymentAmount, paymentDesc);
      setToastMsg("Pago a proveedor registrado en la cuenta corriente.");
      setPaymentAmount(0);
      setPaymentDesc('');
      const sups = await supplierRepository.getSuppliers();
      setSuppliers(sups);
      const updatedSup = sups.find(s => s.id === selectedSupplierForMovements.id);
      if (updatedSup) setSelectedSupplierForMovements(updatedSup);
      const movs = await supplierRepository.getAccountMovements(selectedSupplierForMovements.id);
      setMovements(movs);
    } catch (err) {
      alert("Error al registrar pago.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.activeIngredient.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.laboratory.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-slate-900/60 p-6 rounded-3xl border border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-teal-500/10 text-teal-400 rounded-2xl flex items-center justify-center font-bold border border-teal-500/20 shadow-lg shadow-teal-500/5">
            <Package size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-[0.3em]">Institutional ERP</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Centro de Gestión de Farmacia e Insumos</h1>
            <p className="text-xs text-slate-400 mt-0.5">Control de catálogo, trazabilidad de lotes, órdenes de reposición y cuentas corrientes de proveedores.</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex p-1.5 bg-slate-950/80 rounded-2xl border border-white/5">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'catalog' ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers size={14} /> Catálogo
          </button>
          <button
            onClick={() => setActiveTab('batches')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'batches' ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar size={14} /> Stock & Lotes
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 relative ${
              activeTab === 'orders' ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingCart size={14} /> Órdenes (OC)
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'suppliers' ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 size={14} /> Proveedores & CC
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'analytics' ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 size={14} /> Ranking & Pareto ABC
          </button>
        </div>
      </div>

      {toastMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-emerald-400 text-xs font-bold flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg('')} className="hover:text-white">✕</button>
        </div>
      )}

      {/* TAB 1: CATÁLOGO COMERCIAL */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Buscar por nombre, droga o laboratorio..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900/60 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-white text-xs focus:outline-none focus:border-teal-500/50"
              />
            </div>
            <button
              onClick={() => { resetProductForm(); setShowProductModal(true); }}
              className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Plus size={16} /> Nuevo Medicamento
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map(p => (
              <div key={p.id} className="bg-slate-900/40 border border-white/5 hover:border-teal-500/30 rounded-3xl p-6 space-y-4 transition-all duration-300 backdrop-blur-xl relative group">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest px-2.5 py-1 bg-teal-500/10 rounded-full border border-teal-500/20 inline-block mb-2">
                      {p.category}
                    </span>
                    <h3 className="text-lg font-bold text-white tracking-tight">{p.name}</h3>
                    <p className="text-xs text-slate-400 font-medium">{p.activeIngredient} • {p.presentation}</p>
                  </div>
                  <button
                    onClick={() => handleEditProductClick(p)}
                    className="p-2 text-slate-500 hover:text-white bg-white/5 rounded-xl transition-colors"
                  >
                    <Edit3 size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Precio Venta</span>
                    <span className="font-mono font-bold text-white text-base">${p.price.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Stock Total</span>
                    <span className={`font-mono font-bold text-base ${
                      (p.totalStock || 0) < (p.minStockThreshold || 20) ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      {p.totalStock || 0} un.
                    </span>
                  </div>
                </div>

                {(p.totalStock || 0) <= (p.minStockThreshold || 20) && (
                  <div className="pt-2">
                    <button
                      onClick={() => handleTriggerReorder(p)}
                      className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                    >
                      <AlertTriangle size={14} /> Stock Crítico • Reponer ({p.reorderQuantity || 100} un)
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: STOCK Y LOTES */}
      {activeTab === 'batches' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 space-y-4 backdrop-blur-xl">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <Layers size={16} className="text-teal-400" /> Seleccionar Medicamento
            </h3>
            <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1 custom-scrollbar">
              {filteredProducts.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProduct(p.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition ${
                    selectedProductId === p.id 
                      ? 'bg-teal-500/20 border-teal-500/50 text-white font-bold shadow-lg shadow-teal-500/5' 
                      : 'bg-slate-950/50 border-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-sm font-bold">{p.name}</div>
                  <div className="text-[10px] text-slate-500">{p.laboratory} • Stock: {p.totalStock || 0} un.</div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {selectedProduct && (
              <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 space-y-6 shadow-2xl backdrop-blur-xl">
                <div className="border-b border-white/5 pb-4 flex justify-between items-start">
                  <div>
                    <span className="text-[10px] text-teal-400 font-bold uppercase tracking-widest">{selectedProduct.category}</span>
                    <h2 className="text-2xl font-bold text-white tracking-tight">{selectedProduct.name}</h2>
                    <p className="text-xs text-slate-400">{selectedProduct.activeIngredient} — {selectedProduct.presentation}</p>
                  </div>
                  <span className="text-xl font-extrabold text-white font-mono">${selectedProduct.price.toLocaleString()}</span>
                </div>

                <form onSubmit={handleAddBatch} className="bg-slate-950/60 p-5 rounded-2xl border border-white/5 space-y-4">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Plus size={16} className="text-teal-400" /> Registrar Ingreso de Nuevo Lote
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nº Lote:</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. LOT-2026-X"
                        value={batchNumber}
                        onChange={e => setBatchNumber(e.target.value)}
                        className="w-full p-3 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Vencimiento:</label>
                      <input
                        type="date"
                        required
                        value={expirationDate}
                        onChange={e => setExpirationDate(e.target.value)}
                        className="w-full p-3 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Unidades:</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={stockQuantity}
                        onChange={e => setStockQuantity(Number(e.target.value))}
                        className="w-full p-3 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all">
                    {isSubmitting ? 'Guardando...' : 'Acreditar Lote en Inventario'}
                  </button>
                </form>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lotes Registrados en Stock</h4>
                  {inventory.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs italic bg-slate-950/40 rounded-2xl border border-white/5">
                      No hay lotes activos para este medicamento.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {inventory.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between p-4 bg-slate-950/40 rounded-2xl border border-white/5 text-xs hover:border-white/10 transition-all">
                          <div className="flex items-center gap-3">
                            <Calendar size={18} className="text-teal-400" />
                            <div>
                              <span className="font-bold text-white block">Lote: {inv.batchNumber}</span>
                              <span className="text-slate-400 text-[10px]">Vence: {inv.expirationDate}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-extrabold text-teal-400 text-base font-mono block">{inv.stockQuantity} un.</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ÓRDENES DE COMPRA (OC) */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 backdrop-blur-xl space-y-4">
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-3">
              <ShoppingCart className="text-teal-400" size={24} />
              Órdenes de Compra y Reposición a Droguerías
            </h3>
            <p className="text-xs text-slate-400">Listado de solicitudes de reaprovisionamiento emitidas para mantener los niveles óptimos de farmacia.</p>
          </div>

          <div className="space-y-3">
            {orders.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-white/5 text-slate-500 text-xs italic">
                No hay Órdenes de Compra registradas.
              </div>
            ) : (
              orders.map(ord => (
                <div key={ord.id} className="bg-slate-900/40 border border-white/5 p-6 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6 hover:border-white/10 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold font-mono text-teal-400">OC #{ord.id.substring(0, 8).toUpperCase()}</span>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        ord.status === 'received' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        {ord.status === 'received' ? '✓ Mercadería Recibida' : '🚚 Pedido Enviado a Droguería'}
                      </span>
                    </div>
                    <h4 className="text-base font-bold text-white">{ord.productName}</h4>
                    <p className="text-xs text-slate-400">Proveedor: <span className="text-slate-200 font-bold">{ord.supplierName}</span> • Cantidad: <span className="font-bold text-white">{ord.quantityOrdered} un.</span></p>
                  </div>

                  <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Costo Total OC</span>
                      <span className="text-xl font-extrabold text-white font-mono">${ord.totalCost.toLocaleString()}</span>
                    </div>
                    {ord.status !== 'received' && (
                      <button
                        onClick={() => { setReceivingOrder(ord); setRcvExpDate(new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0]); }}
                        className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer"
                      >
                        Confirmar Recepción
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PROVEEDORES & CUENTAS CORRIENTES */}
      {activeTab === 'suppliers' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-white">Droguerías y Proveedores Registrados</h3>
              <p className="text-xs text-slate-400 mt-0.5">Control de cuentas corrientes y estados de deuda institucional.</p>
            </div>
            <button
              onClick={() => setShowSupplierModal(true)}
              className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Plus size={16} /> Nuevo Proveedor
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {suppliers.map(sup => (
              <div key={sup.id} className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 space-y-4 backdrop-blur-xl relative">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-lg font-bold text-white">{sup.name}</h4>
                    <p className="text-xs text-slate-400">CUIT: {sup.cuit} • Email: {sup.contactEmail}</p>
                  </div>
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20">
                    {sup.status}
                  </span>
                </div>

                <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Saldo en Cuenta Corriente</span>
                    <span className={`text-2xl font-extrabold font-mono ${sup.currentBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      ${sup.currentBalance.toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenMovements(sup)}
                    className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 border border-white/10"
                  >
                    <CreditCard size={14} /> Ver Cuenta Corriente
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: DASHBOARD RANKING & PARETO ABC */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Header & Auto-Adjust Button */}
          <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 flex flex-col md:flex-row justify-between items-center gap-6 backdrop-blur-xl shadow-2xl">
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <BarChart3 className="text-teal-400" size={24} />
                Análisis de Rotación Pareto ABC y Ranking de Ventas
              </h3>
              <p className="text-xs text-slate-400">
                Clasificación inteligente de inventario según el principio 80/20 para determinar umbrales óptimos de stock mínimo y reposición.
              </p>
            </div>
            <button
              onClick={handleAutoApplyPareto}
              disabled={isSubmitting || paretoData.length === 0}
              className="px-6 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2.5 active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Zap size={18} className="fill-slate-950" />
              Auto-Ajustar Umbrales Sugeridos por Pareto
            </button>
          </div>

          {/* Pareto Summary HUD Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-slate-900/40 border border-emerald-500/30 p-6 rounded-3xl backdrop-blur-xl relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block mb-1">Clase A • Alta Rotación (80% Vol)</span>
              <div className="text-3xl font-extrabold text-white font-mono">
                {paretoData.filter(p => p.paretoCategory === 'A').length} <span className="text-xs text-slate-400 font-normal">productos</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Sugerido: Stock Mínimo 50 un. • Reorden 200 un.</p>
            </div>

            <div className="bg-slate-900/40 border border-amber-500/30 p-6 rounded-3xl backdrop-blur-xl relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest block mb-1">Clase B • Rotación Media (15% Vol)</span>
              <div className="text-3xl font-extrabold text-white font-mono">
                {paretoData.filter(p => p.paretoCategory === 'B').length} <span className="text-xs text-slate-400 font-normal">productos</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Sugerido: Stock Mínimo 20 un. • Reorden 100 un.</p>
            </div>

            <div className="bg-slate-900/40 border border-slate-700 p-6 rounded-3xl backdrop-blur-xl relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-slate-500/10 rounded-full blur-xl pointer-events-none" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Clase C • Baja Rotación (5% Vol)</span>
              <div className="text-3xl font-extrabold text-white font-mono">
                {paretoData.filter(p => p.paretoCategory === 'C').length} <span className="text-xs text-slate-400 font-normal">productos</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Sugerido: Stock Mínimo 5 un. • Reorden 30 un.</p>
            </div>
          </div>

          {/* Table Ranking & Pareto Details */}
          <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 backdrop-blur-xl space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers size={16} className="text-teal-400" /> Ranking de Dispensación y Matriz Pareto
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                    <th className="py-3 px-4"># Pos</th>
                    <th className="py-3 px-4">Medicamento / Presentación</th>
                    <th className="py-3 px-4 text-center">Clasif. ABC</th>
                    <th className="py-3 px-4 text-right">Unidades Disp.</th>
                    <th className="py-3 px-4 text-right">% Acumulado</th>
                    <th className="py-3 px-4 text-center">Stock Actual</th>
                    <th className="py-3 px-4 text-center">Mín. Actual vs Sugerido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paretoData.map((item, index) => (
                    <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-4 font-mono font-bold text-slate-500">#{index + 1}</td>
                      <td className="py-4 px-4">
                        <span className="font-bold text-white block">{item.name}</span>
                        <span className="text-[10px] text-slate-400">{item.laboratory} • {item.presentation}</span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase border ${
                          item.paretoCategory === 'A' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                            : item.paretoCategory === 'B'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          Clase {item.paretoCategory}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-bold text-teal-400 text-sm">
                        {item.unitsSold} un.
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-300">
                        {item.cumulativePercentage}%
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-bold text-white">
                        {item.totalStock || 0} un.
                      </td>
                      <td className="py-4 px-4 text-center font-mono text-xs">
                        <span className="text-slate-400">{item.minStockThreshold || 20} un.</span>
                        <span className="text-slate-600 mx-1">→</span>
                        <span className="text-emerald-400 font-bold">{item.suggestedMinStock} un.</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR/EDITAR MEDICAMENTO */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-8 w-full max-w-xl shadow-2xl relative">
            <h3 className="text-xl font-bold text-white mb-6">
              {editingProductId ? 'Editar Medicamento Comercial' : 'Nuevo Medicamento en Catálogo'}
            </h3>
            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nombre Comercial:</label>
                  <input type="text" required value={prodName} onChange={e => setProdName(e.target.value)} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" placeholder="Ej. Amoxicilina 500" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Droga / Monodroga:</label>
                  <input type="text" required value={prodActiveIngredient} onChange={e => setProdActiveIngredient(e.target.value)} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" placeholder="Ej. Amoxicilina" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Presentación:</label>
                  <input type="text" required value={prodPresentation} onChange={e => setProdPresentation(e.target.value)} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" placeholder="Ej. 16 comprimidos" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Laboratorio:</label>
                  <input type="text" required value={prodLaboratory} onChange={e => setProdLaboratory(e.target.value)} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" placeholder="Ej. Roemmers" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Precio Venta ($):</label>
                  <input type="number" required value={prodPrice} onChange={e => setProdPrice(Number(e.target.value))} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Stock Mínimo:</label>
                  <input type="number" required value={prodMinStock} onChange={e => setProdMinStock(Number(e.target.value))} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Re-orden (OC):</label>
                  <input type="number" required value={prodReorderQty} onChange={e => setProdReorderQty(Number(e.target.value))} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowProductModal(false)} className="px-6 py-3 bg-white/5 text-slate-400 rounded-xl text-xs font-bold">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-teal-500 text-slate-950 rounded-xl text-xs font-bold">{isSubmitting ? 'Guardando...' : 'Guardar Producto'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR RECEPCIÓN DE MERCADERÍA */}
      {receivingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <div>
              <h3 className="text-xl font-bold text-white">Recepción de Mercadería (OC)</h3>
              <p className="text-xs text-slate-400 mt-1">Ingrese los datos del lote entregado por la droguería para impactar en el inventario.</p>
            </div>

            <form onSubmit={handleConfirmReceiveOrder} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nº de Lote del Fabricante:</label>
                <input type="text" required value={rcvBatchNumber} onChange={e => setRcvBatchNumber(e.target.value)} placeholder="Ej. FAB-990-2026" className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Fecha de Vencimiento:</label>
                <input type="date" required value={rcvExpDate} onChange={e => setRcvExpDate(e.target.value)} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setReceivingOrder(null)} className="px-6 py-3 bg-white/5 text-slate-400 rounded-xl text-xs font-bold">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-emerald-500 text-slate-950 rounded-xl text-xs font-bold">{isSubmitting ? 'Procesando...' : 'Acreditar en Stock'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR PROVEEDOR */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl relative space-y-6">
            <h3 className="text-xl font-bold text-white">Registrar Nueva Droguería</h3>
            <form onSubmit={handleSaveSupplier} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Razón Social / Nombre:</label>
                <input type="text" required value={supName} onChange={e => setSupName(e.target.value)} placeholder="Ej. Droguería Monza S.A." className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">CUIT Fiscal:</label>
                <input type="text" required value={supCuit} onChange={e => setSupCuit(e.target.value)} placeholder="30-12345678-9" className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Email Pedidos:</label>
                <input type="email" required value={supEmail} onChange={e => setSupEmail(e.target.value)} placeholder="pedidos@drogueria.com" className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowSupplierModal(false)} className="px-6 py-3 bg-white/5 text-slate-400 rounded-xl text-xs font-bold">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-teal-500 text-slate-950 rounded-xl text-xs font-bold">Guardar Proveedor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CUENTA CORRIENTE DE PROVEEDOR */}
      {selectedSupplierForMovements && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-8 w-full max-w-3xl shadow-2xl relative space-y-6 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-white/5 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white">Cuenta Corriente — {selectedSupplierForMovements.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">CUIT: {selectedSupplierForMovements.cuit} • Saldo Pendiente: <span className="font-mono font-bold text-amber-400">${selectedSupplierForMovements.currentBalance.toLocaleString()}</span></p>
              </div>
              <button onClick={() => setSelectedSupplierForMovements(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleRecordPayment} className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Monto a Cancelar ($):</label>
                <input type="number" min="1" required value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))} className="w-full p-3 bg-slate-900 border border-white/10 rounded-xl text-xs text-white" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Descripción / Ref:</label>
                <input type="text" value={paymentDesc} onChange={e => setPaymentDesc(e.target.value)} placeholder="Ej. Transferencia Banco Galicia #4881" className="w-full p-3 bg-slate-900 border border-white/10 rounded-xl text-xs text-white" />
              </div>
              <button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all">
                Registrar Pago
              </button>
            </form>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Libro de Movimientos Financieros</h4>
              {movements.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs italic">No hay movimientos registrados en la cuenta corriente.</div>
              ) : (
                movements.map(m => (
                  <div key={m.id} className="p-4 bg-slate-950/40 rounded-2xl border border-white/5 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-3">
                      {m.type === 'purchase_order' ? <ArrowUpRight className="text-amber-400" size={18} /> : <ArrowDownLeft className="text-emerald-400" size={18} />}
                      <div>
                        <span className="font-bold text-white block">{m.description}</span>
                        <span className="text-[10px] text-slate-500">{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <span className={`font-mono font-bold text-base ${m.type === 'purchase_order' ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {m.type === 'purchase_order' ? `+ $${m.amount.toLocaleString()}` : `- $${m.amount.toLocaleString()}`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PharmacyInventoryAdmin;
