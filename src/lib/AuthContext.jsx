import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { getToken, clearToken } from '@/lib/customAuth';
import { initAndroidPurchases } from '@/utils/purchasesAndroid';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  // 'base44' | 'jwt' — de onde veio a sessão. As telas usam isto na fatia 2 para
  // saber se `user` é um User do Base44 ou uma Account.
  const [authMode, setAuthMode] = useState('base44');
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `${appParams.serverUrl}/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token, // Include token if available
        interceptResponses: true
      });
      
      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
        
        // Ordem de precedência da sessão:
        //   1. JWT próprio (googleSignIn/appleSignIn), se houver token no cofre;
        //   2. sessão hospedada do Base44, como sempre foi.
        //
        // Os dois modos são mutuamente exclusivos por desenho: o token do
        // Base44 e o nosso ocupam o mesmo header. Na prática, mobile é usuário
        // por JWT e web é admin por Base44.
        //
        // Se o caminho JWT falhar por qualquer motivo, caímos no caminho antigo
        // em vez de deixar o usuário sem sessão — degradar para o comportamento
        // de hoje é sempre melhor do que uma tela de login inesperada.
        // CORTE: a Account é o registro do usuário, e é ela que o app lê —
        // independentemente de a pessoa ter entrado pelo JWT próprio ou pela
        // sessão hospedada do Base44. O getMyAccount resolve as duas
        // identidades e devolve sempre a Account.
        //
        // É isso que torna o corte indolor: ninguém é deslogado, ninguém
        // precisa relogar, e mesmo assim todo mundo passa a ler e gravar no
        // registro novo. Cada usuário migra para o JWT naturalmente na próxima
        // vez que sair e entrar.
        const temSessao = !!getToken() || !!appParams.token;

        if (temSessao) {
          const ok = await carregarConta();
          if (!ok) {
            // Só cai para o auth.me() quando a Account não pôde ser resolvida.
            // Estado degradado, não normal: `user` volta a ser um User do
            // Base44, com agregados que já não são mais atualizados.
            if (appParams.token) {
              await checkUserAuth();
            } else {
              setIsLoadingAuth(false);
              setIsAuthenticated(false);
            }
          }
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  // Carrega a Account do usuário autenticado, seja qual for a identidade.
  // Devolve true se conseguiu; false manda o chamador degradar.
  //
  // Android: configura o RevenueCat com o Account.id — o MESMO id que o iOS
  // manda como external_id e que o revenuecatWebhook/syncStoreSubscription
  // resolvem. Aquecimento, não pré-requisito: purchaseAndroidPlan também
  // inicializa por conta própria. Guard de plataforma vive dentro da função
  // (no-op na web e no Despia). Sem await: não pode atrasar nem quebrar o auth.
  const aquecerComprasAndroid = (account) =>
    initAndroidPurchases(account?.id).catch((error) =>
      console.error('Falha ao inicializar RevenueCat (Android):', error)
    );

  // A Account tem `read: false` no RLS, então ela NÃO é lida por
  // base44.entities — só por function com service role atrás do resolveIdentity.
  const carregarConta = async () => {
    const temJwt = !!getToken();
    try {
      setIsLoadingAuth(true);
      const res = await base44.functions.invoke('getMyAccount', {});
      const account = res?.data?.account;
      if (!account) {
        setIsLoadingAuth(false);
        return false;
      }
      setUser(account);
      setAuthMode(temJwt ? 'jwt' : 'base44');
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      aquecerComprasAndroid(account);
      return true;
    } catch (error) {
      // 404: autenticado, mas sem Account. Acontece com quem se cadastrou pelo
      // login hospedado do Base44 depois do corte. Provisiona e segue — sem
      // isso a pessoa ficaria como usuário legado, sem progresso e sem
      // assinatura, invisível para todo o backend novo.
      if (error?.status === 404) {
        try {
          const res = await base44.functions.invoke('ensureMyAccount', {});
          const account = res?.data?.account;
          if (account) {
            setUser(account);
            setAuthMode(temJwt ? 'jwt' : 'base44');
            setIsAuthenticated(true);
            setIsLoadingAuth(false);
            aquecerComprasAndroid(account);
            return true;
          }
        } catch (e2) {
          console.error('ensureMyAccount falhou:', e2);
        }
      }

      // 401 com token nosso = expirado ou inválido (vale 30 dias e não tem
      // revogação). Limpar evita o usuário ficar preso num loop de sessão morta
      // a cada abertura do app. Só limpamos o NOSSO token: a sessão do Base44
      // não é nossa para invalidar.
      if (error?.status === 401 && temJwt) {
        clearToken();
      }
      console.error('Falha ao carregar a conta:', error);
      setIsLoadingAuth(false);
      return false;
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    // Limpa a sessão própria SEMPRE, inclusive no modo base44: token nosso
    // sobrando no cofre faria a próxima abertura do app voltar logado como o
    // usuário anterior, que é o pior tipo de bug de sessão.
    clearToken();

    // E encerra a sessão hospedada SE ela existir, mesmo estando no modo jwt.
    // Durante a transição as duas coexistem: limpar só a nossa devolve o
    // usuário para a identidade antiga, e "Sair da Conta" acaba não saindo de
    // conta nenhuma — só troca de qual.
    if (appParams.token) {
      base44.auth.logout("/");
      return;
    }

    setAuthMode('base44');
    window.location.href = '/';
  };

  const navigateToLogin = () => {
    // Manda para a Home, onde ficam os botões de Google e Apple, em vez do
    // login hospedado do Base44. É o caminho pelo qual cada usuário migra para
    // o JWT: quem precisa se autenticar de novo já entra pelo fluxo novo.
    //
    // Não usamos o router aqui porque este contexto vive ACIMA do <Router> na
    // árvore (App.jsx monta AuthProvider fora dele), então não há navigate
    // disponível — e a recarga completa é desejável de qualquer forma, para o
    // bootstrapAuth rodar de novo do zero.
    //
    // A GUARDA NÃO É OPCIONAL: sem ela, um authError na própria Home vira laço
    // infinito de recarga — '/' redireciona para '/', que recarrega, que
    // redireciona de novo. O redirectToLogin anterior mandava para um domínio
    // externo e por isso não fechava o ciclo; mandar para dentro do app fecha.
    if (window.location.pathname === '/') return;
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{
      user,
      authMode,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};