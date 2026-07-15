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
