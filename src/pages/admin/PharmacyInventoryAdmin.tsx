import React, { useState, useEffect } from 'react';
import { PharmacyProduct, PharmacyInventory } from '../../types';
import { pharmacyRepository } from '../../repositories/PharmacyRepository';
import { Package, Plus, AlertTriangle, Calendar, Layers, Search, CheckCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export const PharmacyInventoryAdmin: React.FC = () => {
  const [products, setProducts] = useState<PharmacyProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<PharmacyInventory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form Lote
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [expirationDate, setExpirationDate] = useState<string>('');
  const [stockQuantity, setStockQuantity] = useState<number>(50);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const prods = await pharmacyRepository.getProducts();
      setProducts(prods);
      if (prods.length > 0) {
        handleSelectProduct(prods[0].id);
      }
    } catch (err) {
      console.error("Error cargando productos:", err);
    } finally {
      setLoading(false);
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
      setSuccessMsg("Lote registrado con éxito en el inventario.");
      setBatchNumber('');
      setExpirationDate('');
      handleSelectProduct(selectedProductId);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      alert("Error al registrar lote.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-teal-500/20 text-teal-400 rounded-xl flex items-center justify-center font-bold">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Gestión de Inventario y Lotes de Farmacia</h1>
            <p className="text-xs text-slate-400">Administración de stock, trazabilidad por lote y fechas de vencimiento.</p>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-4 text-emerald-300 text-sm flex items-center gap-2 animate-fade-in">
          <CheckCircle size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Productos */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Layers size={16} className="text-teal-400" /> Catálogo de Medicamentos
          </h3>
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
            {products.map(p => (
              <button
                key={p.id}
                onClick={() => handleSelectProduct(p.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition ${
                  selectedProductId === p.id 
                    ? 'bg-teal-500/20 border-teal-500/50 text-slate-100 font-semibold' 
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="text-sm font-bold">{p.name}</div>
                <div className="text-xs text-slate-400">{p.activeIngredient} • {p.laboratory}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Detalle e Inventario de Lotes */}
        <div className="lg:col-span-2 space-y-6">
          {selectedProduct && (
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 space-y-6 shadow-xl">
              <div className="border-b border-slate-700 pb-4 flex justify-between items-start">
                <div>
                  <span className="text-xs text-teal-400 font-bold uppercase tracking-wider">{selectedProduct.category}</span>
                  <h2 className="text-xl font-bold text-slate-100">{selectedProduct.name}</h2>
                  <p className="text-xs text-slate-400">{selectedProduct.activeIngredient} — {selectedProduct.presentation}</p>
                </div>
                <span className="text-lg font-extrabold text-teal-400">$ {selectedProduct.price}</span>
              </div>

              {/* Formulario para ingresar nuevo Lote */}
              <form onSubmit={handleAddBatch} className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/60 space-y-4">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Plus size={16} className="text-teal-400" /> Registrar Nuevo Lote Ingresado
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Nº de Lote:</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: LOT-2026-A"
                      value={batchNumber}
                      onChange={e => setBatchNumber(e.target.value)}
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Fecha Vencimiento:</label>
                    <input
                      type="date"
                      required
                      value={expirationDate}
                      onChange={e => setExpirationDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Cantidad Unidades:</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={stockQuantity}
                      onChange={e => setStockQuantity(Number(e.target.value))}
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200"
                    />
                  </div>
                </div>
                <Button variant="primary" type="submit" disabled={isSubmitting} className="text-xs">
                  {isSubmitting ? 'Guardando...' : 'Agregar Lote al Stock'}
                </Button>
              </form>

              {/* Lista de Lotes Existentes */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lotes Registrados en Stock</h4>
                {inventory.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs bg-slate-900/40 rounded-xl border border-slate-800">
                    No hay lotes registrados actualmente para este producto.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {inventory.map(inv => (
                      <div key={inv.id} className="flex items-center justify-between p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 text-xs">
                        <div className="flex items-center gap-3">
                          <Calendar size={16} className="text-teal-400" />
                          <div>
                            <span className="font-bold text-slate-200 block">Lote: {inv.batchNumber}</span>
                            <span className="text-slate-400 text-[11px]">Vence: {inv.expirationDate}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-teal-400 text-sm block">{inv.stockQuantity} unidades</span>
                          <span className="text-slate-500 text-[10px]">Reservadas: {inv.reservedQuantity}</span>
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
    </div>
  );
};
