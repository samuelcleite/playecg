import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { withNativeReturnMarker } from '@/utils/nativeOAuth';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { getToken, clearToken } from '@/lib/customAuth';

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
        const jwt = getToken();
        let resolvido = false;
        if (jwt) {
          resolvido = await checkJwtAuth();
        }

        if (!resolvido) {
          if (appParams.token) {
            await checkUserAuth();
          } else {
            setIsLoadingAuth(false);
            setIsAuthenticated(false);
          }
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

  // Resolve a sessão pelo JWT próprio. Devolve true se conseguiu; false manda o
  // chamador cair no fluxo do Base44.
  //
  // A Account tem `read: false` no RLS, então ela NÃO é lida por
  // base44.entities — só pelo getMyAccount, que usa service role atrás do
  // resolveIdentity.
  const checkJwtAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const res = await base44.functions.invoke('getMyAccount', {});
      const account = res?.data?.account;
      if (!account) {
        setIsLoadingAuth(false);
        return false;
      }
      setUser(account);
      setAuthMode('jwt');
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      return true;
    } catch (error) {
      // 401 = token expirado ou inválido (o nosso vale 30 dias e não tem
      // revogação). 404 = autenticado mas sem Account, caso do admin que nunca
      // usou o app. Nos dois casos o token local não serve: limpar evita que o
      // usuário fique preso num loop de sessão morta a cada abertura do app.
      if (error?.status === 401 || error?.status === 404) {
        clearToken();
      }
      console.error('JWT auth check failed:', error);
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
    if (authMode === 'jwt') {
      setAuthMode('base44');
      window.location.href = '/';
      return;
    }
    base44.auth.logout("/");
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(withNativeReturnMarker(window.location.href));
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