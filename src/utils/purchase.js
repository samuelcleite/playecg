import despia from "despia-native";

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

// Restaura compras anteriores via RevenueCat (iOS). userId = User.id do Base44.
// Exigido pela Apple na tela de assinatura. Se bem-sucedido, o restore
// reidentifica o usuário no RevenueCat e dispara o mesmo fluxo de entitlement
// da compra (webhook + window.iapSuccess na tela).
export function restoreIOSPurchases(userId) {
  if (!userId) throw new Error("userId ausente para restaurar compras");
  // TODO: confirmar sintaxe exata do restore na doc do Despia.
  // Assumindo o mesmo formato do purchase (revenuecat://<ação>?external_id=...).
  despia(
    `revenuecat://restore?external_id=${encodeURIComponent(userId)}`
  );
}
