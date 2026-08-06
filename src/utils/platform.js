import { Capacitor } from "@capacitor/core";

// Identificador EXATO do entitlement no RevenueCat (não editável no painel).
export const RC_ENTITLEMENT = "PlayECG Pro";

// SDK key pública do RevenueCat para Android. É pública por design (embarcada
// no binário); não usar variável de ambiente — o build do Base44 não as propaga
// de forma confiável.
export const RC_ANDROID_KEY = "goog_xykcvHbqJBJiAYCVpJnMHFUyDkd";

// Detecta se o app está rodando no wrapper nativo do Despia no iOS.
export function isIOSNativeApp() {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  return ua.includes("despia-iphone") || ua.includes("despia-ipad");
}

export function isDespiaApp() {
  if (typeof navigator === "undefined") return false;
  return (navigator.userAgent || "").toLowerCase().includes("despia");
}

// Detecta o wrapper Capacitor no Android. getPlatform() só retorna "android"
// quando o runtime nativo do Capacitor injeta window.androidBridge; o Despia
// não é um container Capacitor, então lá retorna "web" e o caminho iOS segue
// intocado.
export function isAndroidNativeApp() {
  return Capacitor.getPlatform() === "android";
}

// Aparelho Apple, não necessariamente dentro do wrapper nativo. O botão
// "Continuar com Apple" só faz sentido no iPhone/iPad, mas o login da Apple
// funciona também no Safari (SDK JS) — por isso não dá para usar
// isIOSNativeApp() aqui: quem abre o site pelo iPhone perderia a opção.
// No Android o Capacitor devolve "android" e esta função retorna false, que é
// o que o app Android precisa: o appleAuth.js nunca ganhou ponte lá.
export function isAppleDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  if (isIOSNativeApp()) return true;
  if (isAndroidNativeApp()) return false;
  // iPadOS 13+ se apresenta como Macintosh; o maxTouchPoints o denuncia.
  const iPadDesktopUA = ua.includes("macintosh") && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/.test(ua) || iPadDesktopUA;
}
