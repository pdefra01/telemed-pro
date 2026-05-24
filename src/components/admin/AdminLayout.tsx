import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  Activity,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  FileBarChart,
  ShieldCheck,
  Building2
} from 'lucide-react';
import { User } from '../../types';
import logoMedinex from '../../logo_medinex.jpeg';

interface AdminLayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, user, onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
    { name: 'Médicos', icon: <Stethoscope size={20} />, path: '/doctors' },
    { name: 'Afiliados', icon: <Users size={20} />, path: '/affiliates' },
    { name: 'Convenios', icon: <Building2 size={20} />, path: '/agreements' },
    { name: 'Facturación', icon: <CreditCard size={20} />, path: '/billing' },
    { name: 'Reportes', icon: <FileBarChart size={20} />, path: '/reports' },
    { name: 'Configuración', icon: <Settings size={20} />, path: '/settings' },
  ];

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex flex-col md:flex-row font-sans selection:bg-emerald-500/30">
      {/* Dynamic Ambient Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden bg-[#0f172a]/80 backdrop-blur-md border-b border-white/5 p-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center space-x-2 font-bold text-emerald-400 text-xl tracking-tight">
          <img src={logoMedinex} alt="Medinex Logo" className="w-10 h-10 object-contain rounded-lg border border-white/10" />
          <span>MEDINEX <span className="text-slate-400 font-light text-sm">v2.0</span></span>
        </div>
        <button
          type="button"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 text-slate-400 hover:text-white transition-colors"
        >
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-out z-40 w-72 bg-[#0f172a]/40 backdrop-blur-xl border-r border-white/5 flex flex-col`}
      >
        <div className="p-8">
          <div className="flex flex-col items-center space-y-4 mb-10 hidden md:flex text-center border-b border-white/5 pb-6 w-full">
            <div className="w-24 h-24 bg-white/5 rounded-2xl shadow-xl border border-white/10 flex items-center justify-center p-2 hover:scale-105 transition-transform duration-500 select-none">
              <img src={logoMedinex} alt="Medinex Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-extrabold text-xl tracking-[0.05em] bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                MEDINEX
              </h1>
              <p className="text-[9px] uppercase tracking-[0.25em] text-emerald-500/70 font-bold mt-1">Command Center</p>
            </div>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={`group flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  location.pathname === item.path
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className={`transition-transform duration-300 ${location.pathname === item.path ? 'scale-110' : 'group-hover:scale-110'}`}>
                  {item.icon}
                </span>
                <span className="font-medium text-sm tracking-wide">{item.name}</span>
                {location.pathname === item.path && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]"></div>
                )}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm">
            <div className="flex items-center space-x-3 mb-3">
              <div className="relative">
                <img 
                  src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}&background=10b981&color=fff`} 
                  alt="Profile" 
                  className="w-10 h-10 rounded-full border border-white/10" 
                />
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0f172a] rounded-full"></div>
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-white truncate">{user.name}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Root Administrator</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center justify-center w-full space-x-2 py-2 text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
            >
              <LogOut size={14} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative z-10 h-screen overflow-y-auto overflow-x-hidden custom-scrollbar">
        <div className="p-4 md:p-10 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
