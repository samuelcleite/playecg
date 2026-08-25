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

// Reduz uma entrada do histórico ao que cabe num diálogo. O `receipt` fica de
// FORA de propósito: é blob base64 enorme e é credencial de compra — não vai
// para a tela de ninguém.
function resumirEntrada(p) {
  return {
    productId: p?.productId,
    entitlementId: p?.entitlementId,
    isActive: p?.isActive,
    externalUserId: p?.externalUserId
  };
}

// Restaura compras anteriores via RevenueCat (iOS). Exigido pela Apple na tela
// de assinatura. O comando 'getpurchasehistory://' RETORNA os dados (não dispara
// evento): consultamos o histórico e verificamos se há um item ativo com o
// entitlement deste app.
//
// DUAS FALHAS DIFERENTES CHEGAM AQUI IGUAIS, e isso é da biblioteca:
//
//   - a ponte não responde  -> despia() RESOLVE com undefined depois de 30s,
//                              nunca rejeita, então não há exceção para pegar
//   - não há compra alguma  -> o nativo põe [] em window.restoredData, o
//                              observer trata array vazio como "ainda não
//                              pronto", espera os 30s e devolve undefined
//
// Ou seja: `restoredData === undefined` significa "não sei" e não "não tem".
// Não dá para separar os dois do nosso lado — o que dá é MEDIR: resposta real
// volta rápido, timeout volta em ~30000ms. Daí o `ms` no diagnóstico.
//
// NOTA que continua de pé: o valor exato de entitlementId no retorno da ponte
// nunca foi conferido em aparelho. Mantido como está — há relato de restore
// funcionando, então a comparação acerta pelo menos em alguns casos, e trocá-la
// sem evidência seria enfraquecer a checagem no escuro.
export async function restoreIOSPurchases(userId) {
  const inicio = Date.now();
  try {
    const data = await despia("getpurchasehistory://", ["restoredData"]);
    const bruto = data?.restoredData;
    const entradas = Array.isArray(bruto) ? bruto : [];
    const ativas = entradas.filter((p) => p?.isActive);

    return {
      restaurado: ativas.some((p) => p.entitlementId === RC_ENTITLEMENT),
      diagnostico: JSON.stringify({
        ms: Date.now() - inicio,
        tipo: bruto === undefined ? "undefined" : Array.isArray(bruto) ? "array" : typeof bruto,
        total: entradas.length,
        ativas: ativas.length,
        esperado: RC_ENTITLEMENT,
        entradas: entradas.map(resumirEntrada)
      })
    };
  } catch (error) {
    console.error("Erro ao restaurar compras iOS:", error);
    return { restaurado: false, diagnostico: `erro: ${error?.message || String(error)}` };
  }
}
