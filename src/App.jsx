import './App.css'
import { Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import PageTransition from '@/components/PageTransition';
import { ThemeProvider } from 'next-themes';
import InstallPWA from './pages/InstallPWA';
import Privacidade from './pages/Privacidade';
import Termos from './pages/Termos';
import Suporte from './pages/Suporte';
import ExcluirConta from './pages/ExcluirConta';
import Auth from './pages/Auth';
import AuthTest from './pages/AuthTest';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Navigate } from 'react-router-dom';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div></div>}>
    <AnimatePresence mode="wait">
    <Routes location={location} key={location.pathname}>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <PageTransition><MainPage /></PageTransition>
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            path === "Home" ? (
              <LayoutWrapper currentPageName={path}>
                <PageTransition><Page /></PageTransition>
              </LayoutWrapper>
            ) : (
              <ProtectedRoute>
                <LayoutWrapper currentPageName={path}>
                  <PageTransition><Page /></PageTransition>
                </LayoutWrapper>
              </ProtectedRoute>
            )
          }
        />
      ))}
      <Route path="/instale" element={<InstallPWA />} />
      <Route path="/privacidade" element={<Privacidade />} />
      <Route path="/termos" element={<Termos />} />
      <Route path="/suporte" element={<Suporte />} />
      <Route path="/excluir-conta" element={<ExcluirConta />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/authtest" element={<AuthTest />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </AnimatePresence>
    </Suspense>
  );
};


function App() {

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true}>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <NavigationTracker />
            <AuthenticatedApp />
          </Router>
          <Toaster />
          <VisualEditAgent />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App