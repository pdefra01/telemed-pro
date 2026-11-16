import React from 'react';

/**
 * The commercial CRM screens are designed for the light advisor portal. Inside the
 * dark admin layout they inherit light text and their dark headings disappear, so
 * the admin renders them on this light surface instead.
 */
export const LightSurface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div data-testid="light-surface" className="rounded-3xl bg-gray-50 p-4 text-slate-900 md:p-8">
    {children}
  </div>
);
