import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import GraphPage from './pages/GraphPage';
import WorksPage from './pages/WorksPage';
import ReportPage from './pages/ReportPage';
import AuditPage from './pages/AuditPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import SLADetailPage from './pages/SLADetailPage';
import Layout from './components/Layout';

function AppContent() {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [pageParams, setPageParams] = useState<Record<string, string>>({});

  if (!user) {
    return <LoginPage />;
  }

  const navigateTo = (page: string, params?: Record<string, string>) => {
    setCurrentPage(page);
    setPageParams(params || {});
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage onNavigate={navigateTo} />;
      case 'graph': return <GraphPage />;
      case 'works': return <WorksPage />;
      case 'report': return <ReportPage />;
      case 'audit': return <AuditPage />;
      case 'users': return <UsersPage />;
      case 'settings': return <SettingsPage />;
      case 'sla-detail': return <SLADetailPage slaId={pageParams.id} onBack={() => navigateTo('dashboard')} />;
      default: return <DashboardPage onNavigate={navigateTo} />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={(page) => navigateTo(page)}>
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
