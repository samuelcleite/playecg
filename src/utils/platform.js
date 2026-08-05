// Identificador EXATO do entitlement no RevenueCat (não editável no painel).
export const RC_ENTITLEMENT = "PlayECG Pro";

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

// Aparelho Apple, não necessariamente dentro do wrapper nativo. O botão
// "Continuar com Apple" só faz sentido no iPhone/iPad, mas o login da Apple
// funciona também no Safari (SDK JS) — por isso não dá para usar
// isIOSNativeApp() aqui: quem abre o site pelo iPhone perderia a opção.
export function isAppleDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  if (isIOSNativeApp()) return true;
  // iPadOS 13+ se apresenta como Macintosh; o maxTouchPoints o denuncia.
  const iPadDesktopUA = ua.includes("macintosh") && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/.test(ua) || iPadDesktopUA;
}
