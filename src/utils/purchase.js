import despia from "despia-native";

const PRODUCTS = {
  monthly: "com.despia.playecg.monthly",
  yearly:  "com.despia.playecg.yearly",
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
