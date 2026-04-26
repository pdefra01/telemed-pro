import React from 'react';
import { Navigate } from 'react-router-dom';
import { User, Role } from '../types';

interface ProtectedRouteProps {
    user: User | null;
    allowedRoles?: Role[];
    children: React.ReactElement;
    redirectPath?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    user,
    allowedRoles,
    children,
    redirectPath = '/login',
}) => {
    if (!user) {
        return <Navigate to={redirectPath} replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to="/" replace />;
    }

    return children;
};
