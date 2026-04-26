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
  Wand2
} from 'lucide-react';
import { User, Role } from '../types';

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

    // AI Tools available for everyone
    const tools = [
      { name: 'Editor IA', icon: <Wand2 size={20} />, path: '/ai-editor' },
    ];

    if (role === 'patient') {
      return [
        ...common,
        { name: 'Historia Clínica', icon: <Activity size={20} />, path: '/history' },
        { name: 'Mis Pagos', icon: <CreditCard size={20} />, path: '/payments' },
        ...tools
      ];
    }

    if (role === 'doctor') {
      return [
        ...common,
        { name: 'Agenda', icon: <Calendar size={20} />, path: '/schedule' },
        { name: 'Pacientes', icon: <Users size={20} />, path: '/patients' },
        ...tools
      ];
    }

    if (role === 'admin') {
      return [
        ...common,
        { name: 'Médicos', icon: <Stethoscope size={20} />, path: '/doctors' },
        { name: 'Afiliados', icon: <Users size={20} />, path: '/affiliates' },
        { name: 'Reportes', icon: <Activity size={20} />, path: '/reports' },
        ...tools
      ];
    }

    return common;
  };

  const navItems = getNavItems(user.role);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white shadow-sm p-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center space-x-2 font-bold text-teal-600 text-xl">
          <Stethoscope />
          <span>TeleMed Pro</span>
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
        className={`fixed inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition duration-200 ease-in-out z-40 w-64 bg-white shadow-lg flex flex-col justify-between`}
      >
        <div>
          <div className="p-6 flex items-center space-x-2 font-bold text-teal-600 text-2xl hidden md:flex">
            <Stethoscope size={28} />
            <span>TeleMed Pro</span>
          </div>

          <div className="px-6 mb-6">
            <div className="flex items-center p-3 bg-teal-50 rounded-lg space-x-3">
              <img src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}`} alt="Profile" className="w-10 h-10 rounded-full object-cover" />
              <div className="overflow-hidden">
                <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
                <p className="text-xs text-teal-600 capitalize">{user.role === 'patient' ? 'Afiliado' : user.role === 'doctor' ? 'Médico' : 'Admin'}</p>
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
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'text-gray-600 hover:bg-teal-50 hover:text-teal-700'
                  }`}
              >
                {item.icon}
                <span className="font-medium">{item.name}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center w-full space-x-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Cerrar Sesión</span>
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
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen scroll-smooth">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

    </div>
  );
};

export default Layout;
