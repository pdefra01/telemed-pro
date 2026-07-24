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
  Building2,
  FileText,
  Megaphone,
  Package,
  ShoppingCart,
  Award,
  Clock,
  ClipboardList
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

  type NavChild = { name: string; icon: React.ReactNode; path: string };
  type NavItem = NavChild & { children?: NavChild[] };

  const navItems: NavItem[] = [
    { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
    {
      name: 'Médicos', icon: <Stethoscope size={20} />, path: '/doctors',
      children: [
        { name: 'Fichado Médico', icon: <Clock size={16} />, path: '/doctor-attendance' },
      ],
    },
    { name: 'Afiliados', icon: <Users size={20} />, path: '/affiliates' },
    { name: 'Asesores Comerciales', icon: <Award size={20} />, path: '/admin/producers' },
    { name: 'Convenios', icon: <Building2 size={20} />, path: '/agreements' },
    { name: 'Ventas y Cadetería', icon: <ShoppingCart size={20} />, path: '/admin/pharmacy-sales' },
    { name: 'Inventario Farmacia', icon: <Package size={20} />, path: '/admin/pharmacy-inventory' },
    {
      name: 'Encuestas', icon: <FileText size={20} />, path: '/survey-builder',
      children: [
        { name: 'Encuesta de Opinión', icon: <ClipboardList size={16} />, path: '/admin/lead-surveys' },
      ],
    },
    { name: 'Campañas', icon: <Megaphone size={20} />, path: '/campaigns' },
    { name: 'Facturación', icon: <CreditCard size={20} />, path: '/billing' },
    { name: 'Reportes', icon: <FileBarChart size={20} />, path: '/reports' },
    { name: 'Configuración', icon: <Settings size={20} />, path: '/settings' },
  ];

  const isGroupActive = (item: NavItem) =>
    location.pathname === item.path ||
    (item.children?.some((c) => location.pathname === c.path) ?? false);

  return (
    <div className="h-screen overflow-hidden bg-[#020617] text-slate-200 flex flex-col md:flex-row font-sans selection:bg-emerald-500/30">
      {/* Dynamic Ambient Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden bg-[#0f172a]/80 backdrop-blur-md border-b border-white/5 p-4 flex justify-between items-center sticky top-0 z-50 flex-shrink-0">
        <div className="flex items-center space-x-2 font-bold text-emerald-400 text-xl tracking-tight">
          <img src={logoMedinex} alt="Medinex Logo" className="w-10 h-10 object-contain rounded-lg border border-white/10 flex-shrink-0" />
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
        className={`fixed inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-out z-40 w-72 h-full md:h-screen bg-[#0f172a]/90 backdrop-blur-xl border-r border-white/5 flex flex-col justify-between`}
      >
        {/* Scrollable Navigation Area */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
          <div className="flex flex-col items-center space-y-3 hidden md:flex text-center border-b border-white/5 pb-6 w-full">
            <div className="w-20 h-20 bg-white/5 rounded-2xl shadow-xl border border-white/10 flex items-center justify-center p-2 hover:scale-105 transition-transform duration-500 select-none">
              <img src={logoMedinex} alt="Medinex Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-extrabold text-xl tracking-[0.05em] bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                MEDINEX
              </h1>
              <p className="text-[9px] uppercase tracking-[0.25em] text-emerald-500/70 font-bold mt-1">Command Center</p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <div key={item.path}>
                <Link
                  to={item.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`group flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    location.pathname === item.path
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                      : isGroupActive(item)
                        ? 'text-emerald-300 bg-white/3 border border-transparent'
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
                {item.children && item.children.length > 0 && (
                  <div className="mt-0.5 ml-4 pl-4 border-l border-white/10 space-y-0.5">
                    {item.children.map((child) => (
                      <Link
                        key={child.path}
                        to={child.path}
                        onClick={() => setIsSidebarOpen(false)}
                        className={`group flex items-center space-x-2.5 px-3 py-2 rounded-lg transition-all duration-200 ${
                          location.pathname === child.path
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <span className="transition-transform duration-300 group-hover:scale-110">
                          {child.icon}
                        </span>
                        <span className="font-medium text-xs tracking-wide">{child.name}</span>
                        {location.pathname === child.path && (
                          <div className="ml-auto w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,1)]"></div>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Fixed User Profile Footer & Logout */}
        <div className="flex-shrink-0 p-5 border-t border-white/10 bg-[#0f172a] backdrop-blur-md">
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5">
            <div className="flex items-center space-x-3 mb-3">
              <div className="relative flex-shrink-0">
                <img 
                  src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}&background=10b981&color=fff`} 
                  alt="Profile" 
                  className="w-10 h-10 rounded-full border border-white/10" 
                />
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0f172a] rounded-full"></div>
              </div>
              <div className="overflow-hidden min-w-0">
                <p className="text-sm font-bold text-white truncate">{user.name}</p>
                <p className="text-[10px] text-slate-400 font-semibold truncate">Administrador Root</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center justify-center w-full space-x-2 py-2.5 px-3 text-xs font-bold text-slate-300 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all border border-white/5 hover:border-red-500/20 active:scale-95 cursor-pointer"
            >
              <LogOut size={15} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative z-10 h-[calc(100vh-73px)] md:h-screen overflow-y-auto overflow-x-hidden custom-scrollbar">
        <div className="p-4 md:p-10 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
