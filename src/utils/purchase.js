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

// Reduz uma entrada do histórico ao que cabe num diálogo, em LINHAS CURTAS.
//
// Não é JSON de propósito: a primeira versão deste diagnóstico usava
// JSON.stringify e saiu ilegível no iPhone — uma linha só, sem espaço onde
// quebrar, transbordando a lateral da tela. Isto aqui é para ser fotografado.
//
// O `receipt` fica FORA: é blob base64 enorme e é credencial de compra, não vai
// para a tela de ninguém.
function resumirEntrada(p, i) {
  return [
    `${i + 1}) ${p?.productId ?? "sem productId"}`,
    `   ent   ${p?.entitlementId ?? "-"}`,
    `   ativo ${p?.isActive === undefined ? "-" : String(p.isActive)}`,
    `   ext   ${p?.externalUserId ?? "-"}`
  ].join("\n");
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
// POR QUE NÃO COMPARAMOS O entitlementId — agora com prova de aparelho
//
// A versão anterior exigia `entitlementId === RC_ENTITLEMENT` ("PlayECG Pro").
// Ela recusava restaurar uma assinatura ATIVA, confirmada ao mesmo tempo nos
// Ajustes do iPhone e no painel do RevenueCat. O diagnóstico em aparelho
// mostrou por quê:
//
//   ms 101 · array · total 1 · ativas 1
//   1) com.despia.playecg.monthly
//      ent   com.despia.playecg.monthly     <-- o PRODUTO, não o entitlement
//      ativo true
//
// A ponte do Despia preenche `entitlementId` com o product ID. A comparação
// nunca poderia acertar, e o restore do iOS estava quebrado para todo mundo
// desde que o botão existe.
//
// Isto é da PONTE, não do RevenueCat: no Android usamos o SDK de verdade, onde
// `entitlements.active` é mesmo indexado pelo identifier — lá a comparação
// continua certa e não foi tocada.
//
// O projeto tem UM único entitlement, e este histórico é do nosso app. Então
// "existe entrada ativa" é equivalente a "PlayECG Pro está ativo", sem depender
// de string nenhuma. ISSO DEIXA DE VALER no dia em que houver um segundo
// entitlement — aí a comparação volta, com o campo certo conferido no aparelho.
export async function restoreIOSPurchases(userId) {
  const inicio = Date.now();
  try {
    const data = await despia("getpurchasehistory://", ["restoredData"]);
    const bruto = data?.restoredData;
    const entradas = Array.isArray(bruto) ? bruto : [];
    const ativas = entradas.filter((p) => p?.isActive);

    const tipo = bruto === undefined ? "undefined" : Array.isArray(bruto) ? "array" : typeof bruto;

    return {
      restaurado: ativas.length > 0,
      diagnostico: [
        `ms ${Date.now() - inicio} · ${tipo} · total ${entradas.length} · ativas ${ativas.length}`,
        ...entradas.map(resumirEntrada)
      ].join("\n")
    };
  } catch (error) {
    console.error("Erro ao restaurar compras iOS:", error);
    return { restaurado: false, diagnostico: `erro: ${error?.message || String(error)}` };
  }
}
