import './App.css'
import { Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import PageTransition from '@/components/PageTransition';
import { ThemeProvider } from 'next-themes';
import InstallPWA from './pages/InstallPWA';
import Baixar from './pages/Baixar';
import Privacidade from './pages/Privacidade';
import Termos from './pages/Termos';
import Suporte from './pages/Suporte';
import ExcluirConta from './pages/ExcluirConta';
import Auth from './pages/Auth';
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

  // A /baixar é o link único de divulgação: lê o user agent e manda para a loja
  // certa. Ela sai antes do gate de auth de propósito — quem chega de um post
  // não pode ver o spinner da checagem de sessão antes do redirecionamento, e a
  // página não lê nada da sessão.
  if (location.pathname.toLowerCase() === '/baixar') return <Baixar />;

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Rotas que precisam funcionar SEM sessão. A /auth é a mais importante: é onde
  // o retorno do OAuth entrega o `code`, e ela roda por definição com o usuário
  // deslogado. Mandá-la para a tela de login descarta o code e o login nunca
  // conclui — o usuário fica preso num ciclo de "entrar" que volta para a Home.
  const rotasPublicas = ['/', '/auth', '/home', '/instale', '/baixar',
                         '/privacidade', '/termos', '/suporte', '/excluir-conta'];
  const rotaEhPublica = rotasPublicas.includes(location.pathname.toLowerCase());

  // Handle authentication errors
  if (authError && !rotaEhPublica) {
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
      <Route path="/baixar" element={<Baixar />} />
      <Route path="/privacidade" element={<Privacidade />} />
      <Route path="/termos" element={<Termos />} />
      <Route path="/suporte" element={<Suporte />} />
      <Route path="/excluir-conta" element={<ExcluirConta />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </AnimatePresence>
    </Suspense>
  );
};


function App() {

  // O ThemeProvider existe so porque o Toaster (components/ui/sonner.jsx) chama
  // useTheme(). Ele NAO deve seguir o tema do sistema: o app e claro por design e
  // as cores estao hardcoded (text-gray-*, bg-white) nas telas, entao ativar o
  // bloco `.dark` do index.css trocava so os fundos e deixava o texto escuro sobre
  // fundo escuro. forcedTheme ignora o sistema e o localStorage.
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} forcedTheme="light">
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