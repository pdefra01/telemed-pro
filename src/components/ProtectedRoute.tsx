import React from 'react';
import { Navigate } from 'react-router-dom';
import { User, Role } from '../types';
import { isAffiliate } from '../utils/affiliate';

interface ProtectedRouteProps {
    user: User | null;
    allowedRoles?: Role[];
    /** Only affiliates: patients and advisors that hold a plan. */
    affiliateOnly?: boolean;
    children: React.ReactElement;
    redirectPath?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    user,
    allowedRoles,
    affiliateOnly,
    children,
    redirectPath = '/login',
}) => {
    if (!user) {
        return <Navigate to={redirectPath} replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to="/" replace />;
    }

    if (affiliateOnly && !isAffiliate(user)) {
        return <Navigate to="/" replace />;
    }

    return children;
};
