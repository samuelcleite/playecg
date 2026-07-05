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
