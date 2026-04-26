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
                <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                </label>
                <div className="relative">
                    {icon && (
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                            {icon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        id={id}
                        className={`w-full ${icon ? 'pl-10' : 'pl-4'} pr-4 py-3 border rounded-xl focus:ring-2 outline-none transition disabled:bg-gray-100 disabled:text-gray-500 ${error
                                ? 'border-red-500 focus:ring-red-200'
                                : 'border-gray-300 focus:ring-teal-500 focus:border-transparent'
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
