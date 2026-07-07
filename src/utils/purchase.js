import despia from "despia-native";
import { RC_ENTITLEMENT } from "./platform";

const PRODUCTS = {
  monthly: "com.despia.playecg.monthly",
  annual:  "com.despia.playecg.yearly",
};

// Dispara a compra via RevenueCat (iOS). userId = User.id do Base44.
export function startIOSPurchase(plan, userId) {
  const product = PRODUCTS[plan];
  if (!product) throw new Error("Plano inválido: " + plan);
  if (!userId)  throw new Error("userId ausente para a compra");
  despia(
    `revenuecat://purchase?external_id=${encodeURIComponent(userId)}` +
    `&product=${encodeURIComponent(product)}`
  );
}

// Restaura compras anteriores via RevenueCat (iOS). Exigido pela Apple na tela
// de assinatura. O comando 'getpurchasehistory://' RETORNA os dados (não dispara
// evento): consultamos o histórico e verificamos se há um item ativo com o
// entitlement deste app. Retorna true se o premium foi encontrado, false caso
// contrário (ou em erro).
// NOTA: confirmar no device o nome exato do campo do entitlement no retorno
// (entitlementId) e se o valor casa com RC_ENTITLEMENT.
export async function restoreIOSPurchases(userId) {
  try {
    const data = await despia("getpurchasehistory://", ["restoredData"]);
    const active = (data?.restoredData ?? []).filter((p) => p.isActive);
    return active.some((p) => p.entitlementId === RC_ENTITLEMENT);
  } catch (error) {
    console.error("Erro ao restaurar compras iOS:", error);
    return false;
  }
}
