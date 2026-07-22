import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Stethoscope,
  Activity,
  CreditCard,
  FileBarChart,
  ShoppingBag,
  Award,
  Clock
} from 'lucide-react';
import { User, Role } from '../types';
import logoMedinex from '../logo_medinex.jpeg';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) {
    return <>{children}</>;
  }

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const getNavItems = (role: Role) => {
    const common = [
      { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
    ];

    if (role === 'patient') {
      return [
        ...common,
        { name: 'Farmacia Digital', icon: <ShoppingBag size={20} />, path: '/pharmacy' },
        { name: 'Historia Clínica', icon: <Activity size={20} />, path: '/history' },
        { name: 'Mis Pagos', icon: <CreditCard size={20} />, path: '/payments' },
      ];
    }

    if (role === 'doctor') {
      return common;
    }

    if (role === 'advisor') {
      return [
        { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' }
      ];
    }

    if (role === 'admin') {
      return [
        ...common,
        { name: 'Médicos', icon: <Stethoscope size={20} />, path: '/doctors' },
        { name: 'Fichado Médico', icon: <Clock size={20} />, path: '/doctor-attendance' },
        { name: 'Afiliados', icon: <Users size={20} />, path: '/affiliates' },
        { name: 'Asesores Comerciales', icon: <Award size={20} />, path: '/admin/producers' },
        { name: 'Reportes', icon: <Activity size={20} />, path: '/reports' },
      ];
    }

    return common;
  };

  const navItems = getNavItems(user.role);

  return (
    <div className="h-screen overflow-hidden bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white shadow-sm p-4 flex justify-between items-center sticky top-0 z-50 flex-shrink-0 border-b border-gray-100">
        <div className="flex items-center space-x-2 font-bold text-teal-600 text-xl">
          <img src={logoMedinex} alt="Medinex Logo" className="w-10 h-10 object-contain rounded-md shadow-sm flex-shrink-0" />
          <span>MEDINEX</span>
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          className="text-gray-600"
          aria-label={isSidebarOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={isSidebarOpen}
        >
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition duration-200 ease-in-out z-40 w-64 h-full md:h-screen bg-white shadow-lg flex flex-col justify-between`}
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-4">
          <div className="p-8 flex flex-col items-center space-y-4 hidden md:flex border-b border-gray-100 mb-6 text-center">
            <div className="w-32 h-32 bg-white rounded-[1.75rem] shadow-lg ring-1 ring-[#0dbda9]/15 border border-gray-100 flex items-center justify-center p-4 hover:scale-105 transition-transform duration-500 select-none">
              <img src={logoMedinex} alt="Medinex Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-2xl font-extrabold tracking-[0.05em] text-[#002f54]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              MED<span className="text-[#0dbda9]">IN</span>EX
            </span>
          </div>

          <div className="px-6 mb-6">
            <div className="flex items-center p-3 bg-teal-50 rounded-lg space-x-3">
              <img src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}`} alt="Profile" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              <div className="overflow-hidden min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{user.name || 'Paciente'}</p>
                <p className="text-xs text-teal-600 capitalize font-medium">{user.role === 'patient' ? 'Afiliado' : user.role === 'doctor' ? 'Médico' : 'Admin'}</p>
              </div>
            </div>
          </div>

          <nav className="px-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${location.pathname === item.path
                    ? 'bg-teal-600 text-white shadow-md font-semibold'
                    : 'text-gray-600 hover:bg-teal-50 hover:text-teal-700 font-medium'
                  }`}
              >
                {item.icon}
                <span>{item.name}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-white">
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center justify-center w-full space-x-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors font-semibold active:scale-95 cursor-pointer border border-red-100"
          >
            <LogOut size={18} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-[calc(100vh-73px)] md:h-screen scroll-smooth">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

    </div>
  );
};

export default Layout;
