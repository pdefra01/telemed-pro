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
import { ProtectedRoute } from './components/ProtectedRoute';

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

  return (
    <Router>
      <ToastProvider>
        <Layout user={user} onLogout={handleLogout}>
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

            {/* Patient Routes */}
            <Route
              path="/history"
              element={
                <ProtectedRoute user={user} allowedRoles={['patient']}>
                  <MedicalHistory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments"
              element={
                <ProtectedRoute user={user} allowedRoles={['patient']}>
                  <Payments />
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
        </Layout>

        {/* AI Assistant is available for authenticated users */}
        {user && <AIChatBot />}
      </ToastProvider>
    </Router>
  );
};

export default App;
