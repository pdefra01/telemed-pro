import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
import Affiliates from './pages/admin/Affiliates';
import Agreements from './pages/admin/Agreements';
import OCCBilling from './pages/admin/OCCBilling';
import OCCSettings from './pages/admin/OCCSettings';
import OCCReports from './pages/admin/OCCReports';
import { ProtectedRoute } from './components/ProtectedRoute';
import PostConsultation from './pages/doctor/PostConsultation';
import AdminLayout from './components/admin/AdminLayout';

import { ToastProvider } from './context/ToastContext';

import { authRepository } from './repositories/AuthRepository';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('telemed_user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    localStorage.setItem('telemed_user', JSON.stringify(loggedInUser));
  };

  const handleLogout = async () => {
    await authRepository.logout();
    setUser(null);
    localStorage.removeItem('telemed_user');
  };

  const MainContent = (
    <Routes>
      <Route
        path="/login"
        element={!user ? <Auth onLogin={handleLogin} /> : <Navigate to="/" />}
      />

      <Route
        path="/"
        element={
          <ProtectedRoute user={user}>
            {user?.role === 'patient' ? <PatientDashboard user={user as Patient} /> :
              user?.role === 'doctor' ? <DoctorDashboard user={user as Doctor} /> :
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
      <ToastProvider>
        {!user || user.role !== 'admin' ? (
          <Layout user={user} onLogout={handleLogout}>
            {MainContent}
          </Layout>
        ) : (
          <AdminLayout user={user} onLogout={handleLogout}>
            {MainContent}
          </AdminLayout>
        )}

        {/* AI Assistant is available for authenticated users */}
        {user && <AIChatBot />}
      </ToastProvider>
    </Router>
  );
};

export default App;
