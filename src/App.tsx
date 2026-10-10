import React, { lazy, Suspense, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';

/**
 * Code-splitting: страницы (особенно «Модель здоровья» с vis-network) грузим
 * лениво — при первом открытии портала в бандле только React + роутер + оболочка,
 * а тяжёлые экраны догружаются при переходе на них.
 */
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const GraphPage = lazy(() => import('./pages/GraphPage'));
const WorksPage = lazy(() => import('./pages/WorksPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SLADetailPage = lazy(() => import('./pages/SLADetailPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <i className="fas fa-spinner fa-spin text-3xl text-blue-600"></i>
    </div>
  );
}

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
    <Layout
      currentPage={currentPage}
      onNavigate={(page) => navigateTo(page)}
      onSync={() => window.location.reload()}
    >
      <Suspense fallback={<PageLoader />}>
        {renderPage()}
      </Suspense>
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