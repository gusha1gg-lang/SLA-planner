import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import { buildHash, isPageAllowed, readRoute, Route } from './navigation';

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
const GroupsPage = lazy(() => import('./pages/GroupsPage'));
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
  const { user, can, isAdmin } = useAuth();

  // Маршрут живёт в hash URL: перезагрузка (F5), закладки и «назад/вперёд» остаются
  // на текущей странице, а не сбрасывают на дашборд.
  const [route, setRoute] = useState<Route>(() => readRoute());

  const navigateTo = useCallback((page: string, params?: Record<string, string>) => {
    setRoute({ page, params: params || {} });
    const hash = buildHash(page, params);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }, []);

  // Синхронизация состояния с URL (кнопки браузера, ручная правка hash).
  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Не пускаем на страницу без права (например, после смены пользователя) — на дашборд.
  useEffect(() => {
    if (user && !isPageAllowed(route.page, can, isAdmin)) {
      navigateTo('dashboard');
    }
  }, [user, route.page, can, isAdmin, navigateTo]);

  // При выходе возвращаем маршрут на дашборд (в т.ч. чтобы следующий вход начался с него).
  const wasLoggedIn = useRef(false);
  useEffect(() => {
    if (user) {
      wasLoggedIn.current = true;
    } else if (wasLoggedIn.current) {
      wasLoggedIn.current = false;
      setRoute({ page: 'dashboard', params: {} });
      window.location.hash = buildHash('dashboard');
    }
  }, [user]);

  if (!user) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (route.page) {
      case 'dashboard': return <DashboardPage onNavigate={navigateTo} />;
      case 'graph': return <GraphPage />;
      case 'works': return <WorksPage />;
      case 'report': return <ReportPage />;
      case 'audit': return <AuditPage />;
      case 'users': return <UsersPage />;
      case 'groups': return <GroupsPage />;
      case 'settings': return <SettingsPage />;
      case 'sla-detail': return <SLADetailPage slaId={route.params.id} onBack={() => navigateTo('dashboard')} />;
      default: return <DashboardPage onNavigate={navigateTo} />;
    }
  };

  return (
    <Layout
      currentPage={route.page}
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