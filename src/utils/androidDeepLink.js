import { isAndroidNativeApp } from "@/utils/platform";

// Retorno do OAuth do Google no app Android (Capacitor).
//
// O Google recusa OAuth dentro de WebView embutida (disallowed_useragent), então
// o login abre numa Custom Tab — ver signInWithGoogle em src/lib/customAuth.js.
// A Custom Tab é um processo à parte: o deeplink é o único caminho de volta.
//
// Cadeia completa:
//   googleAuthUrl recebe deeplink_scheme='playecg' e o devolve como `state`
//   Google redireciona para https://playecg.app/native-callback.html?code=…&state=playecg
//   native-callback.html emite playecg://oauth/auth?code=…
//   o intent-filter do AndroidManifest entrega à MainActivity (launchMode=singleTop)
//   o Capacitor dispara appUrlOpen, tratado aqui
//
// A troca do code pelo token NÃO acontece aqui: navegamos para /auth?code=, que
// é a mesma tela que o iOS e a web já usam. Um segundo caminho de troca seria um
// segundo lugar para dar errado.
function tratarUrl(url) {
  if (!url) return;

  let params;
  try {
    params = new URL(url).searchParams;
  } catch {
    return; // URL malformada: nada a fazer.
  }

  const code = params.get("code");
  const erro = params.get("error");
  if (!code && !erro) return; // deeplink que não é do OAuth.

  // A Custom Tab pode continuar na frente depois do deeplink. Fechar é
  // best-effort: se ela já fechou, o close() é inofensivo.
  import("@capacitor/browser")
    .then(({ Browser }) => Browser.close())
    .catch(() => {});

  // Erro (cancelamento, consentimento negado) vai para a Home, NÃO para /auth:
  // aquela tela só sabe extrair `code` e ficaria girando num spinner eterno.
  window.location.href = code
    ? `/auth?code=${encodeURIComponent(code)}`
    : "/";
}

// Chamado no boot (main.jsx). No-op fora do Android: no Despia e na web o
// Capacitor.getPlatform() não devolve "android", então o guard sai antes de
// qualquer import do plugin — o SDK não entra no bundle que roda em playecg.app.
export async function registrarDeepLinkAndroid() {
  if (!isAndroidNativeApp()) return;

  try {
    const { App } = await import("@capacitor/app");
    App.addListener("appUrlOpen", (evento) => tratarUrl(evento?.url));

    // Se o Android matou o app enquanto a Custom Tab estava na frente, o
    // deeplink faz cold start e o listener acima não recebe essa primeira URL.
    // Sem isto o login falharia de forma intermitente e difícil de reproduzir.
    const launch = await App.getLaunchUrl();
    if (launch?.url) tratarUrl(launch.url);
  } catch (error) {
    console.error("Falha ao registrar o deeplink do Android:", error);
  }
}
