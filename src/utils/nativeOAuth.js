import { isIOSNativeApp, isDespiaApp } from "@/utils/platform";
import { appParams } from "@/lib/app-params";

// Deeplink scheme configurado no painel do Despia (Publish → Deeplink).
export const DESPIA_SCHEME = "playecg";

// Marcador anexado ao from_url quando o login é iniciado dentro do app nativo iOS.
// Ele volta intacto na URL de callback do Base44 e indica que, se a página estiver
// carregando FORA da WebView do Despia (aba nativa de OAuth, UA de Safari), devemos
// devolver o usuário ao app via deeplink.
export const NATIVE_RETURN_PARAM = "despia_oauth_return";

// Envolve a URL de retorno do login com o marcador — apenas no app iOS nativo.
// Na web (e no login e-mail/senha, que nunca sai da WebView) nada muda.
export function withNativeReturnMarker(url) {
  if (!isIOSNativeApp()) return url;
  try {
    const marked = new URL(url, window.location.origin);
    marked.searchParams.set(NATIVE_RETURN_PARAM, "1");
    return marked.toString();
  } catch {
    return url;
  }
}

// Chamado no boot (main.jsx), antes do render. Se estamos na aba nativa de OAuth
// (marcador presente + token recém-capturado + UA sem "despia"), dispara o deeplink
// `playecg://oauth/<rota>?access_token=...`. O prefixo "oauth/" instrui o Despia a
// FECHAR a aba nativa e navegar a WebView para `/<rota>?access_token=...`, onde o
// bootstrap existente (src/lib/app-params.js) captura o token e conclui o login.
export function maybeReturnToNativeApp() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get(NATIVE_RETURN_PARAM) !== "1") return false;

  if (isDespiaApp()) {
    // Já estamos na WebView (ex.: retorno do login e-mail/senha): o marcador é
    // inerte — apenas o removemos da URL por higiene.
    params.delete(NATIVE_RETURN_PARAM);
    const clean = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState({}, document.title, clean);
    return false;
  }

  // O access_token já foi lido (e removido da URL) pelo módulo app-params.
  const token = appParams.token;
  if (!token) return false;

  window.location.replace(
    `${DESPIA_SCHEME}://oauth${window.location.pathname}?access_token=${encodeURIComponent(token)}`
  );
  return true;
}
