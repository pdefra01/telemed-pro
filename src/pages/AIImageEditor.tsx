import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Wand2, Download, X, AlertCircle, RefreshCw } from 'lucide-react';
import { editImageWithAI } from '../services/geminiService';

const AIImageEditor: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setGeneratedImage(null);
        setError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!selectedImage || !prompt.trim()) return;

    setIsLoading(true);
    setError('');
    setGeneratedImage(null);

    try {
      const result = await editImageWithAI(selectedImage, prompt);
      if (result) {
        setGeneratedImage(result);
      } else {
        setError('No se pudo generar la imagen. Intenta con otra descripción.');
      }
    } catch (err) {
      setError('Ocurrió un error al procesar la imagen con IA.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (generatedImage) {
      const link = document.createElement('a');
      link.href = generatedImage;
      link.download = 'medinex-ia-edit.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-2xl font-bold text-gray-800 flex items-center">
             <Wand2 className="mr-2 text-teal-600" /> Editor de Imágenes IA
           </h1>
           <p className="text-gray-500">Mejora o modifica imágenes médicas o de perfil usando inteligencia artificial.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden min-h-[600px] flex flex-col md:flex-row">
        
        {/* Sidebar / Controls */}
        <div className="w-full md:w-1/3 bg-gray-50 p-6 border-r border-gray-200 flex flex-col">
           
           {/* Upload Section */}
           <div className="mb-6">
             <label className="block text-sm font-bold text-gray-700 mb-2">1. Imagen Original</label>
             <div 
               onClick={() => fileInputRef.current?.click()}
               className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition h-48 bg-white"
             >
                {selectedImage ? (
                  <div className="relative w-full h-full">
                    <img src={selectedImage} alt="Original" className="w-full h-full object-contain rounded-lg" />
                    <button 
                      onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="text-gray-400 mb-2" size={32} />
                    <p className="text-sm text-gray-500 text-center">Clic para subir imagen</p>
                    <p className="text-xs text-gray-400 mt-1">JPG, PNG</p>
                  </>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleImageUpload} 
                />
             </div>
           </div>

           {/* Prompt Section */}
           <div className="mb-6 flex-1">
             <label className="block text-sm font-bold text-gray-700 mb-2">2. Descripción del cambio</label>
             <textarea
               value={prompt}
               onChange={(e) => setPrompt(e.target.value)}
               placeholder="Ej: 'Añadir un filtro retro', 'Mejorar la iluminación', 'Quitar el fondo'..."
               className="w-full h-32 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none resize-none text-sm"
               disabled={!selectedImage}
             />
           </div>

           {/* Actions */}
           <div className="mt-auto">
             {error && (
               <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-start">
                 <AlertCircle size={16} className="mt-0.5 mr-2 flex-shrink-0" />
                 {error}
               </div>
             )}
             
             <button
               onClick={handleGenerate}
               disabled={isLoading || !selectedImage || !prompt.trim()}
               className="w-full bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
             >
               {isLoading ? (
                 <>
                   <RefreshCw className="animate-spin mr-2" size={20} /> Procesando...
                 </>
               ) : (
                 <>
                   <Wand2 className="mr-2" size={20} /> Generar con IA
                 </>
               )}
             </button>
           </div>
        </div>

        {/* Preview Area */}
        <div className="w-full md:w-2/3 p-6 bg-gray-100 flex items-center justify-center relative">
           {!generatedImage && !isLoading && (
             <div className="text-center text-gray-400">
                <ImageIcon size={64} className="mx-auto mb-4 opacity-20" />
                <p>La imagen generada aparecerá aquí</p>
             </div>
           )}

           {isLoading && (
             <div className="text-center">
                <div className="w-16 h-16 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-teal-800 font-medium animate-pulse">Gemini está trabajando...</p>
             </div>
           )}

           {generatedImage && (
             <div className="relative w-full h-full flex flex-col items-center justify-center">
                <img src={generatedImage} alt="Generated" className="max-w-full max-h-[500px] object-contain rounded-lg shadow-2xl" />
                <div className="mt-6 flex space-x-4">
                  <button 
                    onClick={handleDownload}
                    className="bg-white text-gray-800 px-6 py-2 rounded-lg font-bold shadow-md hover:bg-gray-50 transition flex items-center border border-gray-200"
                  >
                    <Download size={18} className="mr-2" /> Descargar
                  </button>
                  <button 
                    onClick={() => setGeneratedImage(null)}
                    className="text-gray-500 hover:text-gray-700 px-4 py-2 font-medium"
                  >
                    Descartar
                  </button>
                </div>
             </div>
           )}
        </div>

      </div>
    </div>
  );
};

export default AIImageEditor;
