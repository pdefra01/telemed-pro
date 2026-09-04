import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { User, Patient, Doctor } from './types';
import Auth from './pages/Auth';
import Layout from './components/Layout';
import PatientDashboard from './pages/patient/PatientDashboard';
import DoctorDashboard from './pages/doctor/DoctorDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';
import MedicalHistory from './pages/patient/MedicalHistory';
import Payments from './pages/patient/Payments';
import AIChatBot from './components/AIChatBot';
import VideoRoom from './pages/VideoRoom';
import AIImageEditor from './pages/AIImageEditor';
import Doctors from './pages/admin/Doctors';
import DoctorAttendance from './pages/admin/DoctorAttendance';
import Affiliates from './pages/admin/Affiliates';
import Agreements from './pages/admin/Agreements';
import OCCBilling from './pages/admin/OCCBilling';
import OCCSettings from './pages/admin/OCCSettings';
import OCCReports from './pages/admin/OCCReports';
import SurveyBuilder from './pages/admin/SurveyBuilder';
import Campaigns from './pages/admin/Campaigns';
import Profile from './pages/patient/Profile';
import PatientSurveys from './pages/patient/PatientSurveys';
import { PharmacyCatalog } from './pages/patient/PharmacyCatalog';
import { PatientOrderTracking } from './pages/patient/PatientOrderTracking';
import { PharmacyInventoryAdmin } from './pages/admin/PharmacyInventoryAdmin';
import { PharmacySalesAdmin } from './pages/admin/PharmacySalesAdmin';
import ProducersAdmin from './pages/admin/ProducersAdmin';
import { ProtectedRoute } from './components/ProtectedRoute';
import PostConsultation from './pages/doctor/PostConsultation';
import AdminLayout from './components/admin/AdminLayout';
import { AdhesionForm } from './pages/AdhesionForm';
import SetPassword from './pages/SetPassword';
import { LeadSurvey } from './pages/LeadSurvey';
import LeadSurveys from './pages/admin/LeadSurveys';
import { AdvisorDashboard } from './pages/advisor/AdvisorDashboard';
import { getBranding } from './config/branding';

import { ToastProvider, useToast } from './context/ToastContext';

import { authRepository } from './repositories/AuthRepository';
import { supabase } from './services/supabase';
import { AlertCircle, RefreshCw } from 'lucide-react';

// Error Boundary simple para capturar errores de renderizado
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  state: {hasError: boolean, error: any} = { hasError: false, error: null };
  props: {children: React.ReactNode};

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white font-sans">
          <div className="max-w-md w-full bg-slate-800 rounded-3xl p-8 border border-slate-700 shadow-2xl">
            <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center text-red-500 mb-6">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-2xl font-bold mb-2 tracking-tight">Oops! Algo salió mal</h1>
            <p className="text-slate-400 mb-6 leading-relaxed">
              La aplicación encontró un error inesperado. No te preocupes, tus datos están seguros.
            </p>
            <div className="bg-slate-900/50 rounded-xl p-4 mb-8 font-mono text-xs text-red-400 overflow-auto max-h-32 border border-red-500/20">
              {this.state.error?.toString()}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              <RefreshCw size={20} />
              Reintentar ahora
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Componente para manejar la inactividad de sesión según el rol
const SessionTimeoutHandler: React.FC<{ user: User | null; onLogout: () => void }> = ({ user, onLogout }) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    // Cargar política de inactividad
    let timeoutMinutes = 0;
    try {
      const cached = localStorage.getItem('medinex_session_policy') || sessionStorage.getItem('medinex_session_policy');
      if (cached) {
        const policy = JSON.parse(cached);
        timeoutMinutes = policy[user.role]?.timeoutMinutes || 0;
      } else {
        // Fallback defaults
        if (user.role === 'admin' || user.role === 'advisor') timeoutMinutes = 15;
        else if (user.role === 'doctor') timeoutMinutes = 30;
      }
    } catch (e) {
      console.error("Error reading timeout from policy:", e);
    }

    if (timeoutMinutes <= 0) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    const timeoutMs = timeoutMinutes * 60 * 1000;

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        console.log(`[SessionTimeoutHandler] Logout due to inactivity of ${timeoutMinutes} minutes`);
        onLogout();
        toast("Tu sesión ha expirado por inactividad por motivos de seguridad.", "error");
      }, timeoutMs);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    resetTimer();
    events.forEach(event => window.addEventListener(event, resetTimer));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [user, onLogout, toast]);

  return null;
};

const App: React.FC = () => {
  useEffect(() => {
    const branding = getBranding();
    document.title = `${branding.shortName} – ${branding.tagline}`;
    
    let favicon = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    if (favicon) {
      favicon.href = branding.favicon;
    }
  }, []);

  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = sessionStorage.getItem('medinex_user') || localStorage.getItem('medinex_user');
      if (!saved) return null;
      // Validar que sea un JSON válido y que tenga estructura de usuario
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && parsed.role) {
        return parsed;
      }
      return null;
    } catch (e) {
      console.error("Error al cargar usuario de almacenamiento:", e);
      sessionStorage.removeItem('medinex_user');
      localStorage.removeItem('medinex_user');
      return null;
    }
  });

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    
    // Leer política de persistencia para guardar en storage adecuado
    let isPersistent = true;
    try {
      const cached = localStorage.getItem('medinex_session_policy') || sessionStorage.getItem('medinex_session_policy');
      if (cached) {
        const policy = JSON.parse(cached);
        isPersistent = policy[loggedInUser.role]?.persistent ?? true;
      } else {
        if (['admin', 'doctor', 'advisor'].includes(loggedInUser.role)) {
          isPersistent = false;
        }
      }
    } catch (e) {
      console.error("Error determining persistence path at login:", e);
    }

    if (isPersistent) {
      localStorage.setItem('medinex_user', JSON.stringify(loggedInUser));
      sessionStorage.removeItem('medinex_user');
    } else {
      sessionStorage.setItem('medinex_user', JSON.stringify(loggedInUser));
      localStorage.removeItem('medinex_user');
    }
  };

  const handleLogout = async () => {
    try {
      await authRepository.logout();
    } catch (e) {
      console.error("Error al cerrar sesión en Supabase:", e);
    } finally {
      setUser(null);
      localStorage.removeItem('medinex_user');
      sessionStorage.removeItem('medinex_user');
    }
  };

  // Sincronizar la política desde la base de datos
  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'session_security_policy')
          .maybeSingle();

        if (error) throw error;

        if (data?.value) {
          const policyStr = JSON.stringify(data.value);
          localStorage.setItem('medinex_session_policy', policyStr);
          sessionStorage.setItem('medinex_session_policy', policyStr);
        }
      } catch (err) {
        console.error("Error fetching session security policy from DB:", err);
      }
    };

    fetchPolicy();
  }, [user]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setUser(null);
        localStorage.removeItem('medinex_user');
        sessionStorage.removeItem('medinex_user');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Redireccionar accesos directos por pathname a HashRouter para compatibilidad
  useEffect(() => {
    if (window.location.pathname === '/adhesion' || window.location.pathname.endsWith('/adhesion')) {
      window.location.replace(window.location.origin + '/#/adhesion');
    }
    if (window.location.pathname === '/encuesta' || window.location.pathname.endsWith('/encuesta')) {
      window.location.replace(window.location.origin + '/#/encuesta');
    }
    if (window.location.pathname === '/activar' || window.location.pathname.endsWith('/activar')) {
      window.location.replace(window.location.origin + '/#/activar' + window.location.search);
    }
  }, []);

  const isAdhesionPath = window.location.hash.includes('/adhesion') || window.location.pathname.includes('/adhesion');
  const isEncuestaPath = window.location.hash.includes('/encuesta') || window.location.pathname.includes('/encuesta');
  const isActivarPath = window.location.hash.includes('/activar') || window.location.pathname.includes('/activar');
  const isPublicPath = isAdhesionPath || isEncuestaPath || isActivarPath;

  const MainContent = (
    <Routes>
      <Route
        path="/login"
        element={!user ? <Auth onLogin={handleLogin} /> : <Navigate to="/" />}
      />

      <Route
        path="/adhesion"
        element={<AdhesionForm />}
      />

      <Route
        path="/encuesta"
        element={<LeadSurvey />}
      />

      <Route
        path="/activar"
        element={<SetPassword />}
      />

      <Route
        path="/"
        element={
          <ProtectedRoute user={user}>
            {user?.role === 'patient' ? <PatientDashboard user={user as Patient} /> :
              user?.role === 'doctor' ? <DoctorDashboard user={user as Doctor} /> :
                user?.role === 'advisor' ? <AdvisorDashboard user={user} /> :
                  <AdminDashboard />}
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/doctors"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <Doctors />
          </ProtectedRoute>
        }
      />
      <Route
        path="/doctor-attendance"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <DoctorAttendance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/lead-surveys"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <LeadSurveys />
          </ProtectedRoute>
        }
      />
      <Route
        path="/affiliates"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <Affiliates />
          </ProtectedRoute>
        }
      />
      <Route
        path="/agreements"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <Agreements />
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <OCCBilling />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <OCCReports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <OCCSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/survey-builder"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <SurveyBuilder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/campaigns"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <Campaigns />
          </ProtectedRoute>
        }
      />

      {/* Patient Routes */}
      <Route
        path="/history"
        element={
          <ProtectedRoute user={user} allowedRoles={['patient']}>
            <MedicalHistory user={user as Patient} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute user={user} allowedRoles={['patient']}>
            <Payments user={user as Patient} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/producers"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <ProducersAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute user={user} allowedRoles={['patient']}>
            <Profile user={user as Patient} onLogin={handleLogin} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patient-surveys"
        element={
          <ProtectedRoute user={user} allowedRoles={['patient']}>
            <PatientSurveys user={user as Patient} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pharmacy"
        element={
          <ProtectedRoute user={user} allowedRoles={['patient']}>
            <PharmacyCatalog 
              patientId={user?.id || ''} 
              patientAddress={(user as Patient)?.address || 'Av. Belgrano 1234, Salta Capital'} 
              onNavigateToTracking={(orderId) => window.location.hash = `#/pharmacy-tracking/${orderId}`}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pharmacy-tracking/:orderId"
        element={
          <ProtectedRoute user={user} allowedRoles={['patient']}>
            <PatientOrderTrackingWrapper onBack={() => window.location.hash = '#/pharmacy'} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/pharmacy-inventory"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <PharmacyInventoryAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/pharmacy-sales"
        element={
          <ProtectedRoute user={user} allowedRoles={['admin']}>
            <PharmacySalesAdmin />
          </ProtectedRoute>
        }
      />

      {/* Video Room */}
      <Route
        path="/room/:appointmentId"
        element={
          <ProtectedRoute user={user}>
            <VideoRoom user={user!} />
          </ProtectedRoute>
        }
      />

      {/* Post-Consultation (Doctor Only) */}
      <Route
        path="/doctor/post-consultation/:appointmentId"
        element={
          <ProtectedRoute user={user} allowedRoles={['doctor']}>
            <PostConsultation user={user as Doctor} />
          </ProtectedRoute>
        }
      />

      {/* AI Image Editor */}
      <Route
        path="/ai-editor"
        element={
          <ProtectedRoute user={user}>
            <AIImageEditor />
          </ProtectedRoute>
        }
      />

      {/* Placeholder Routes for features not fully implemented in this demo */}
      <Route path="*" element={user ? <Navigate to="/" /> : <Navigate to="/login" />} />
    </Routes>
  );

  return (
    <Router>
      <ErrorBoundary>
        <ToastProvider>
          <SessionTimeoutHandler user={user} onLogout={handleLogout} />
          {isPublicPath ? (
            MainContent
          ) : !user || user.role !== 'admin' ? (
            <Layout user={user} onLogout={handleLogout}>
              {MainContent}
            </Layout>
          ) : (
            <AdminLayout user={user} onLogout={handleLogout}>
              {MainContent}
            </AdminLayout>
          )}

          {/* AI Assistant is available for authenticated users, but not on the public adhesion/encuesta pages */}
          {user && !isPublicPath && <AIChatBot />}
        </ToastProvider>
      </ErrorBoundary>
    </Router>
  );
};

const PatientOrderTrackingWrapper: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { orderId } = useParams<{ orderId: string }>();
  return <PatientOrderTracking orderId={orderId || ''} onBack={onBack} />;
};

export default App;
