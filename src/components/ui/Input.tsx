import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
    error?: string;
    icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, icon, className = '', ...props }, ref) => {
        const id = props.id || props.name;

        return (
            <div className="w-full">
                <label htmlFor={id} className="block text-xs font-semibold text-slate-300 dark:text-slate-300 mb-1.5 pl-1">
                    {label}
                </label>
                <div className="relative">
                    {icon && (
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                            {icon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        id={id}
                        className={`w-full ${icon ? 'pl-10' : 'pl-4'} pr-4 py-3 border rounded-xl focus:ring-2 outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-400 disabled:bg-slate-800/50 disabled:text-slate-500 ${error
                                ? 'border-red-500 focus:ring-red-200'
                                : 'border-slate-700/60 focus:ring-emerald-500/20 focus:border-emerald-500'
                            } ${className}`}
                        aria-invalid={!!error}
                        aria-describedby={error ? `${id}-error` : undefined}
                        {...props}
                    />
                </div>
                {error && (
                    <p id={`${id}-error`} className="mt-1 text-sm text-red-600 flex items-center">
                        <span role="alert">{error}</span>
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';
