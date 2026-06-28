import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    isLoading?: boolean;
    icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    isLoading = false,
    icon,
    className = '',
    disabled,
    ...props
}) => {
    const baseStyles = "w-full font-semibold py-3.5 px-5 rounded-2xl transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.98] cursor-pointer text-sm sm:text-base tracking-normal";

    const variants = {
        primary: "bg-teal-600 text-white hover:bg-teal-700 shadow-lg shadow-teal-500/30 focus:ring-teal-500",
        secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500",
        outline: "bg-transparent border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500",
        ghost: "bg-transparent text-teal-600 hover:bg-teal-50 focus:ring-teal-500",
        danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className}`}
            disabled={isLoading || disabled}
            aria-busy={isLoading}
            {...props}
        >
            {isLoading ? (
                <Loader2 className="animate-spin mr-2" size={20} />
            ) : icon ? (
                <span className="mr-2">{icon}</span>
            ) : null}
            <span>{children}</span>
        </button>
    );
};
