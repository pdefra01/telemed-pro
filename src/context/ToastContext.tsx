import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Date.now().toString();
        setToasts((prev) => [...prev, { id, message, type }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    }, []);

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`flex items-center p-4 rounded-lg shadow-lg text-white transform transition-all duration-300 animate-slide-in ${t.type === 'success' ? 'bg-teal-600' :
                                t.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
                            }`}
                    >
                        <div className="mr-3">
                            {t.type === 'success' && <CheckCircle size={20} />}
                            {t.type === 'error' && <AlertCircle size={20} />}
                            {t.type === 'info' && <Info size={20} />}
                        </div>
                        <p className="font-medium text-sm">{t.message}</p>
                        <button
                            onClick={() => removeToast(t.id)}
                            className="ml-4 hover:opacity-75 transition"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
