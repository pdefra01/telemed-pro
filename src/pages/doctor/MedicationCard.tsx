import React, { useEffect, useState } from 'react';
import { Pill, Clock, Trash2 } from 'lucide-react';
import { pharmacyRepository } from '../../repositories/PharmacyRepository';

// One medication row of a receta: catalog autocomplete with pharmacy stock.
// Used by PostConsultation and NewPrescriptionModal.

export interface MedicationItem {
  name: string;
  instructions: string;
  productId?: string;
  stockAvailable?: number;
}

interface MedicationCardProps {
  med: MedicationItem;
  index: number;
  onChange: (index: number, field: 'name' | 'instructions' | 'productId' | 'stockAvailable', value: any) => void;
  onRemove: (index: number) => void;
  showRemove: boolean;
}

export const MedicationCard: React.FC<MedicationCardProps> = ({ 
  med, 
  index, 
  onChange, 
  onRemove, 
  showRemove 
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [catalogSuggestions, setCatalogSuggestions] = useState<Array<{ id: string; name: string; activeIngredient: string; presentation: string; totalStock: number }>>([]);

  useEffect(() => {
    if (!med.name.trim()) {
      setCatalogSuggestions([]);
      return;
    }
    const searchCatalog = async () => {
      try {
        const results = await pharmacyRepository.searchProductsWithStock(med.name);
        setCatalogSuggestions(results.map(r => ({
          id: r.id,
          name: `${r.name} (${r.presentation})`,
          activeIngredient: r.activeIngredient,
          presentation: r.presentation,
          totalStock: r.totalStock
        })));
      } catch (e) {
        console.warn(e);
      }
    };
    const timer = setTimeout(searchCatalog, 300);
    return () => clearTimeout(timer);
  }, [med.name]);

  return (
    <div className="relative grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-900/40 border border-white/5 rounded-2xl group/med animate-fade-in-up hover:border-blue-500/30 transition-all duration-300">
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Medicamento #{index + 1}</label>
        <div className="relative">
          <input
            type="text"
            value={med.name}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setShowSuggestions(false)}
            onChange={(e) => onChange(index, 'name', e.target.value)}
            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all pl-12 text-sm"
            placeholder="Ej. Amoxicilina 500mg"
          />
          <Pill className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
          
          {showSuggestions && catalogSuggestions.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 divide-y divide-white/5">
              {catalogSuggestions.map((item) => (
                <button
                  key={item.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(index, 'name', item.name);
                    onChange(index, 'productId', item.id);
                    onChange(index, 'stockAvailable', item.totalStock);
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-600/30 transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div>
                    <p className="text-xs font-bold text-white group-hover:text-blue-300">{item.name}</p>
                    <p className="text-[10px] text-slate-400">{item.activeIngredient}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                    item.totalStock > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}>
                    {item.totalStock > 0 ? `Stock: ${item.totalStock} un.` : 'Sin Stock'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {med.stockAvailable !== undefined && (
          <div className="pt-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-block border ${
              med.stockAvailable > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}>
              {med.stockAvailable > 0 ? `✓ Stock verificado en farmacia: ${med.stockAvailable} unidades` : '⚠️ Producto sin stock en farmacia'}
            </span>
          </div>
        )}
      </div>
      
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Posología / Instrucciones</label>
        <div className="relative">
          <input
            type="text"
            value={med.instructions}
            onChange={(e) => onChange(index, 'instructions', e.target.value)}
            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all pl-12 text-sm"
            placeholder="Cada 8hs por 7 días..."
          />
          <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
        </div>
      </div>

      {showRemove && (
        <button 
          onClick={() => onRemove(index)}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover/med:opacity-100 shadow-xl"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
};
