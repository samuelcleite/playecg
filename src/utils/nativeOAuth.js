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

// DEBUG TEMPORÁRIO — remover depois. Coleta o estado das condições de
// maybeReturnToNativeApp() e o exibe num banner fixo no topo da tela, visível em
// qualquer página — inclusive na aba nativa do Safari (UA sem "despia"), onde não
// há devtools. Injetado direto no DOM (irmão do #root) para sobreviver ao render
// do React e aparecer mesmo se o app não montar.
function showOauthDiag() {
  const diag = {
    href: window.location.href,
    hasMarker: new URLSearchParams(window.location.search).get(NATIVE_RETURN_PARAM),
    isDespia: isDespiaApp(),
    ua: navigator.userAgent,
    token: (appParams && appParams.token) ? "PRESENTE" : "AUSENTE",
  };
  window.__oauthDiag = diag;
  const render = () => {
    let el = document.getElementById("oauth-diag-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "oauth-diag-banner";
      el.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483647;" +
        "background:#fde047;color:#000;font-size:10px;line-height:1.3;" +
        "padding:calc(4px + env(safe-area-inset-top, 0px)) 6px 4px;" +
        "word-break:break-all;white-space:pre-wrap;font-family:monospace;" +
        "pointer-events:none;";
      document.body.appendChild(el);
    }
    el.textContent = "OAUTH DIAG: " + JSON.stringify(window.__oauthDiag);
  };
  if (document.body) {
    render();
  } else {
    document.addEventListener("DOMContentLoaded", render);
  }
}

// Chamado no boot (main.jsx), antes do render. Se estamos na aba nativa de OAuth
// (marcador presente + token recém-capturado + UA sem "despia"), dispara o deeplink
// `playecg://oauth/<rota>?access_token=...`. O prefixo "oauth/" instrui o Despia a
// FECHAR a aba nativa e navegar a WebView para `/<rota>?access_token=...`, onde o
// bootstrap existente (src/lib/app-params.js) captura o token e conclui o login.
export function maybeReturnToNativeApp() {
  if (typeof window === "undefined") return false;
  showOauthDiag(); // DEBUG TEMPORÁRIO — remover depois
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
