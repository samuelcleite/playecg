import { useAuth } from "@/lib/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { guardarDestinoPosLogin } from "@/lib/postLoginRedirect";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoadingAuth, isLoadingPublicSettings } = useAuth();
  const location = useLocation();

  if (isLoadingAuth || isLoadingPublicSettings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Anota para onde a pessoa estava indo antes de mandá-la para o login. Só
    // anota — quem decide voltar é a Home, depois que a sessão existir. Não
    // muda o fluxo de autenticação: nenhum token, nenhuma credencial, nenhuma
    // decisão de sessão passa por aqui.
    guardarDestinoPosLogin(location.pathname + location.search);
    return <Navigate to="/" replace />;
  }

  return children;
}