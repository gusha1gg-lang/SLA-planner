import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import GraphPage from './pages/GraphPage';
import WorksPage from './pages/WorksPage';
import ReportPage from './pages/ReportPage';
import AuditPage from './pages/AuditPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import Layout from './components/Layout';

function AppContent() {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

  if (!user) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage />;
      case 'graph': return <GraphPage />;
      case 'works': return <WorksPage />;
      case 'report': return <ReportPage />;
      case 'audit': return <AuditPage />;
      case 'users': return <UsersPage />;
      case 'settings': return <SettingsPage />;
      default: return <DashboardPage />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
