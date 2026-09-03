import despia from "despia-native";

// Identificador do app na App Store, usado na URL de resgate.
const APPLE_APP_ID = "6787499219";

// Códigos de oferta CUSTOM da App Store — um por tier e periodicidade.
//
// São reutilizáveis e existem UM POR TIER, não por parceiro: é o que faz o
// parceiro nº 21 entrar sem tocar em configuração de loja. O código que a
// pessoa digita no app (FULANO20) identifica QUEM indicou, do nosso lado; o
// desconto quem dá é a Apple, por estes códigos aqui.
//
// Espelham as ofertas do Play, que são escolhidas por tag em vez de código.
const CODIGOS_DE_OFERTA = {
  "tier-a": { monthly: "PARCMA", annual: "PARCAA" },
  "tier-b": { monthly: "PARCMB", annual: "PARCAB" }
};

// null quando o tier ou o plano não têm oferta cadastrada — o chamador não
// oferece o resgate em vez de mandar a pessoa para uma URL que não resolve.
export function codigoDeOfertaIOS(tier, plano) {
  return CODIGOS_DE_OFERTA[tier]?.[plano] ?? null;
}

// Abre a folha de resgate da App Store.
//
// window.open e não uma chamada da ponte: o Despia NÃO expõe a folha nativa de
// resgate do StoreKit (confirmado com o suporte deles, que registrou como
// pedido de feature). O domínio apps.apple.com precisa estar em
// "Open Always in Browser" no Despia Studio — sem isso o link abre no browser
// interno e o resgate não completa.
//
// Devolve false quando não há código para a combinação, para a tela não
// mostrar um botão que não leva a lugar nenhum.
export function abrirResgateIOS(tier, plano) {
  const codigo = codigoDeOfertaIOS(tier, plano);
  if (!codigo) return false;
  window.open(
    `https://apps.apple.com/redeem?ctx=offercodes&id=${APPLE_APP_ID}` +
      `&code=${encodeURIComponent(codigo)}`,
    "_blank"
  );
  return true;
}

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

// RESTORE DE VERDADE, e a diferença importa.
//
// O getpurchasehistory:// abaixo apenas LÊ o recibo do StoreKit — confirmado
// pelo suporte do Despia e observado em aparelho: depois de chamá-lo, a
// assinatura continuou presa no App User ID anônimo anterior, e o customer
// atual seguiu com "No current entitlements" e USD 0.
//
// O Customer Center é o único caminho que SINCRONIZA: ele posta o recibo sob o
// external_id passado e o RevenueCat RE-APONTA o entitlement para o usuário
// identificado. É o que faz uma compra feita fora do app (offer code resgatado
// na App Store) chegar até a nossa Account.
//
// Não devolve nada — a folha é nativa e o desfecho chega por
// window.onRevenueCatCenter ('restoreCompleted' | 'dismissed'). Ver o handler
// no Upgrade.jsx.
//
// external_id vazio, nulo ou numérico faz o runtime cair numa sessão anônima, e
// a compra volta a ficar presa num id de aparelho — exatamente o defeito que
// isto existe para resolver. Por isso lança em vez de seguir em silêncio.
export function abrirCustomerCenterIOS(userId) {
  const id = typeof userId === "string" ? userId.trim() : "";
  if (!id) throw new Error("userId ausente para abrir o Customer Center");
  despia(`revenuecat://center?external_id=${encodeURIComponent(id)}`);
}

// Lê o histórico local. NÃO restaura de verdade — ver abrirCustomerCenterIOS. Exigido pela Apple na tela
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
export async function lerHistoricoComprasIOS() {
  const inicio = Date.now();
  try {
    const data = await despia("getpurchasehistory://", ["restoredData"]);
    const bruto = data?.restoredData;
    const entradas = Array.isArray(bruto) ? bruto : [];
    const ativas = entradas.filter((p) => p?.isActive);

    const tipo = bruto === undefined ? "undefined" : Array.isArray(bruto) ? "array" : typeof bruto;

    return {
      temAtiva: ativas.length > 0,
      diagnostico: [
        `ms ${Date.now() - inicio} · ${tipo} · total ${entradas.length} · ativas ${ativas.length}`,
        ...entradas.map(resumirEntrada)
      ].join("\n")
    };
  } catch (error) {
    console.error("Erro ao restaurar compras iOS:", error);
    // Mesma forma do caminho feliz. A chave `restaurado` era sobra da
    // renomeação: quem desestruturasse `temAtiva` receberia undefined no ramo
    // de erro e o trataria como "não tem", em silêncio.
    return { temAtiva: false, diagnostico: `erro: ${error?.message || String(error)}` };
  }
}
