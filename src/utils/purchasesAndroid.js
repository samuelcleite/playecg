import { Purchases } from "@revenuecat/purchases-capacitor";
import { RC_ANDROID_KEY, RC_ENTITLEMENT, isAndroidNativeApp } from "./platform";

// O configure() do RevenueCat só pode rodar uma vez por sessão. Guardamos a
// promise em vez de um boolean para que chamadas concorrentes aguardem a mesma
// inicialização, em vez de duas passarem pelo guard antes de qualquer uma
// concluir.
let configurePromise = null;

// O import do plugin é ESTÁTICO, e isso foi uma correção, não um descuido.
//
// A versão original usava import() dinâmico para manter o RevenueCat fora do
// bundle que roda em playecg.app e dentro do Despia. A premissa estava errada: o
// SDK de verdade é nativo (Kotlin, dentro do APK), e o que o import traz é só a
// casca JavaScript — 7 KB de constantes de enum e proxies de método.
//
// Em troca desses 7 KB, o import dinâmico introduzia uma requisição de rede no
// meio do fluxo de compra. Num tablet Samsung ela pendurava indefinidamente, com
// o chunk servido corretamente pelo servidor (HTTP 200, MIME certo, topo de
// módulo síncrono) — causa nunca identificada. Estático, a etapa deixa de
// existir: o módulo já está carregado quando a tela abre.
//
// Importar não ativa nada fora do Android: registerPlugin apenas cria um proxy,
// e a implementação web continua atrás de import preguiçoso do próprio plugin.

// Teto de tempo para QUALQUER etapa que possa pendurar. Duas coisas aqui podem
// não responder nunca: o import dinâmico do plugin (rede) e as chamadas da ponte
// nativa do Capacitor (que simplesmente não invocam o callback em certas
// falhas). Uma promise pendente para sempre — ainda por cima memoizada, no caso
// do configure — envenena toda compra e todo restore da sessão. Foi o que
// travou num tablet Samsung: os dois botões em "Processando..." sem erro, sem
// saída a não ser fechar o app.
//
// Ao estourar, o configurePromise é zerado (ver o .catch abaixo), então a
// tentativa seguinte refaz tudo do zero em vez de esperar pela morta.
const CONFIGURE_TIMEOUT_MS = 15000;

function comTeto(promise, nome, ms = CONFIGURE_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`RevenueCat: ${nome} não respondeu em ${ms}ms`)),
        ms
      )
    ),
  ]);
}

// Configura o RevenueCat no Android. No-op em qualquer outra plataforma.
// appUserId DEVE ser o Account.id: é o external_id que o iOS também usa, e o
// revenuecatWebhook resolve por ele (com fallback para o User.id legado das
// compras anteriores ao corte). Configurar com outro valor faz a compra
// completar sem liberar o premium.
export async function initAndroidPurchases(appUserId) {
  if (!isAndroidNativeApp()) return;
  if (!appUserId) {
    // Antes isto era um `return` silencioso, e quem chamava seguia adiante para
    // um SDK não configurado — onde a ponte nativa pode nunca responder.
    // Interromper aqui é o comportamento correto: sem id não há compra possível.
    throw new Error("RevenueCat: appUserId ausente — configure() abortado");
  }

  if (!configurePromise) {
    configurePromise = (async () => {
      await comTeto(
        Purchases.configure({
          apiKey: RC_ANDROID_KEY,
          appUserID: String(appUserId),
        }),
        "configure"
      );
    })().catch((error) => {
      // Libera o guard para permitir nova tentativa numa chamada posterior.
      configurePromise = null;
      throw error;
    });
  }

  return configurePromise;
}

// Resultados de purchaseAndroidPlan. Cancelar não é erro, e pagamento pendente
// (cartão aguardando confirmação) também não — por isso não são exceções.
export const PURCHASE_SUCCESS = "success";
export const PURCHASE_CANCELLED = "cancelled";
export const PURCHASE_UNAVAILABLE = "unavailable";
export const PURCHASE_PENDING = "pending";
// A oferta do parceiro não veio no device e quem chamou ainda não decidiu se
// aceita o preço cheio. Não é erro e não abre a folha do Google: é uma pergunta
// devolvida para a tela fazer ao usuário.
export const PURCHASE_OFFER_UNAVAILABLE = "offer_unavailable";

// Código do RevenueCat para "usuário cancelou"; chega como string pela ponte.
const RC_CANCELLED_CODE = "1";

const PLAN_PACKAGE_TYPE = { monthly: "MONTHLY", annual: "ANNUAL" };

// Escolhe o Package do plano no offering atual. Os acessores .monthly/.annual
// vêm preenchidos quando o package usa o tipo padrão do RevenueCat; se o
// offering for montado com identificadores customizados eles vêm null, então
// caímos na busca por packageType.
function pickPackage(offering, plan) {
  if (!offering) return null;
  const direct = plan === "annual" ? offering.annual : offering.monthly;
  if (direct) return direct;
  const wanted = PLAN_PACKAGE_TYPE[plan];
  if (!wanted) return null;
  return (offering.availablePackages ?? []).find((p) => p.packageType === wanted) ?? null;
}

function hasEntitlement(customerInfo) {
  return Boolean(customerInfo?.entitlements?.active?.[RC_ENTITLEMENT]);
}

// Acha a oferta do Play pela tag. As ofertas NÃO são produtos e não viram
// package no painel do RevenueCat: elas são subscriptionOptions dentro do
// StoreProduct, resolvidas no device. Por isso não há offering alternativa a
// procurar — a `current` é a única, e o que muda é a option comprada dentro
// dela.
//
// subscriptionOptions é anulável nos types (é conceito do Google; no iOS vem
// null), daí o `?? []`.
function acharOfertaPorTag(aPackage, tag) {
  if (!tag) return null;
  const opcoes = aPackage?.product?.subscriptionOptions ?? [];
  return opcoes.find((o) => (o.tags ?? []).includes(tag)) ?? null;
}

// Envolve a compra com o tratamento de cancelamento, que é igual nos três
// caminhos. Sem teto de tempo de propósito: a pessoa pode levar minutos
// legitimamente na folha de pagamento do Google Play.
async function concluirCompra(executar) {
  try {
    const { customerInfo } = await executar();
    return hasEntitlement(customerInfo) ? PURCHASE_SUCCESS : PURCHASE_PENDING;
  } catch (error) {
    if (error?.code === RC_CANCELLED_CODE || error?.userCancelled) {
      return PURCHASE_CANCELLED;
    }
    throw error;
  }
}

// Dispara a compra do plano no Android. Nunca usa product ID fixo: no Google
// Play o identificador é subscriptionId:basePlanId e vem do Offering do painel.
//
// `offerTag` é a tag da oferta do parceiro no Play ('tier-a' / 'tier-b').
// Sem ela, o caminho é EXATAMENTE o de antes — purchasePackage sobre o package
// do plano. Isso é deliberado: a compra sem cupom é a maioria, e ela não pode
// carregar o risco de uma regressão do caminho de parceria.
//
// `aceitarPrecoCheio` só é consultado quando a tag foi pedida e NÃO foi
// encontrada no device. Nesse caso a função não decide sozinha: devolve
// PURCHASE_OFFER_UNAVAILABLE para a tela perguntar. Cair calado no preço cheio
// cobraria R$ 59,90 de quem digitou um código de desconto e viu a tela aceitar
// — a pessoa descobriria na fatura.
export async function purchaseAndroidPlan(
  plan,
  appUserId,
  { offerTag = null, aceitarPrecoCheio = false } = {}
) {
  if (!isAndroidNativeApp()) return PURCHASE_UNAVAILABLE;

  await initAndroidPurchases(appUserId);
  const offerings = await comTeto(Purchases.getOfferings(), "getOfferings");
  const aPackage = pickPackage(offerings?.current, plan);
  // Offering vazio/sem o plano: esperado enquanto os produtos não existem no
  // Play Console. Retorna em vez de lançar.
  if (!aPackage) return PURCHASE_UNAVAILABLE;

  if (!offerTag) {
    return concluirCompra(() => Purchases.purchasePackage({ aPackage }));
  }

  const oferta = acharOfertaPorTag(aPackage, offerTag);
  if (oferta) {
    return concluirCompra(() =>
      Purchases.purchaseSubscriptionOption({ subscriptionOption: oferta })
    );
  }

  if (!aceitarPrecoCheio) return PURCHASE_OFFER_UNAVAILABLE;

  // Preço cheio, com o usuário já avisado. defaultOption é anulável nos types;
  // quando falta, cai no purchasePackage, que é o caminho de sempre.
  const padrao = aPackage.product?.defaultOption ?? null;
  return padrao
    ? concluirCompra(() => Purchases.purchaseSubscriptionOption({ subscriptionOption: padrao }))
    : concluirCompra(() => Purchases.purchasePackage({ aPackage }));
}

// Diagnóstico: o que o aparelho REALMENTE devolveu. Só é chamado quando a
// oferta do parceiro não foi encontrada.
//
// Existe porque não há console acessível no aparelho de outra pessoa. Sem
// isto, "o desconto não apareceu" é indiagnosticável à distância — e as três
// causas prováveis exigem correções diferentes: tag escrita errada no Play
// Console, oferta inativa, ou produto sem subscriptionOptions (que seria o
// SDK ou o Play devolvendo outra coisa).
//
// Nunca lança: é caminho de diagnóstico e não pode virar um segundo erro em
// cima do primeiro.
export async function diagnosticarOfertasAndroid(plan) {
  if (!isAndroidNativeApp()) return null;
  try {
    const offerings = await comTeto(Purchases.getOfferings(), "getOfferings");
    const aPackage = pickPackage(offerings?.current, plan);
    const opcoes = aPackage?.product?.subscriptionOptions ?? null;
    return {
      offering: offerings?.current?.identifier ?? null,
      pacote: aPackage?.identifier ?? null,
      produto: aPackage?.product?.identifier ?? null,
      padrao: aPackage?.product?.defaultOption?.id ?? null,
      opcoes: opcoes === null
        ? null
        : opcoes.map((o) => ({ id: o.id, tags: o.tags ?? [] }))
    };
  } catch (error) {
    return { erro: error?.message || String(error) };
  }
}

// Restaura compras anteriores no Android. Retorna true se o entitlement estiver
// ativo após a restauração. Diferente do restore iOS, não engole erros: quem
// chama distingue "nada a restaurar" (false) de falha real (exceção).
export async function restoreAndroidPurchases(appUserId) {
  if (!isAndroidNativeApp()) return false;

  await initAndroidPurchases(appUserId);
  const { customerInfo } = await comTeto(
    Purchases.restorePurchases(),
    "restorePurchases"
  );
  return hasEntitlement(customerInfo);
}
