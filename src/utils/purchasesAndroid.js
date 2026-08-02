import { RC_ANDROID_KEY, RC_ENTITLEMENT, isAndroidNativeApp } from "./platform";

// O configure() do RevenueCat só pode rodar uma vez por sessão. Guardamos a
// promise em vez de um boolean para que chamadas concorrentes aguardem a mesma
// inicialização, em vez de duas passarem pelo guard antes de qualquer uma
// concluir.
let configurePromise = null;

// Carrega o plugin nativo sob demanda. O import é dinâmico de propósito: um
// import estático colocaria o SDK do RevenueCat no bundle que roda em
// playecg.app e dentro do Despia (iOS), onde ele nunca é usado.
async function loadPurchases() {
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  return Purchases;
}

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
      // O import dinâmico também precisa de teto: se o chunk do plugin não
      // chegar, esta linha pendura ANTES de qualquer chamada nativa, e o teto do
      // configure abaixo nunca chega a existir. Foi o buraco da primeira versão
      // deste fix — o sintoma continuou idêntico porque o travamento era aqui.
      const Purchases = await comTeto(loadPurchases(), "carregar plugin");
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

// Dispara a compra do plano no Android. Nunca usa product ID fixo: no Google
// Play o identificador é subscriptionId:basePlanId e vem do Offering do painel.
export async function purchaseAndroidPlan(plan, appUserId) {
  if (!isAndroidNativeApp()) return PURCHASE_UNAVAILABLE;

  await initAndroidPurchases(appUserId);
  const Purchases = await comTeto(loadPurchases(), "carregar plugin");

  const offerings = await comTeto(Purchases.getOfferings(), "getOfferings");
  const aPackage = pickPackage(offerings?.current, plan);
  // Offering vazio/sem o plano: esperado enquanto os produtos não existem no
  // Play Console. Retorna em vez de lançar.
  if (!aPackage) return PURCHASE_UNAVAILABLE;

  try {
    // Sem teto de tempo aqui, de propósito: a pessoa pode levar minutos
    // legitimamente na folha de pagamento do Google Play.
    const { customerInfo } = await Purchases.purchasePackage({ aPackage });
    return hasEntitlement(customerInfo) ? PURCHASE_SUCCESS : PURCHASE_PENDING;
  } catch (error) {
    if (error?.code === RC_CANCELLED_CODE || error?.userCancelled) {
      return PURCHASE_CANCELLED;
    }
    throw error;
  }
}

// Restaura compras anteriores no Android. Retorna true se o entitlement estiver
// ativo após a restauração. Diferente do restore iOS, não engole erros: quem
// chama distingue "nada a restaurar" (false) de falha real (exceção).
export async function restoreAndroidPurchases(appUserId) {
  if (!isAndroidNativeApp()) return false;

  await initAndroidPurchases(appUserId);
  const Purchases = await comTeto(loadPurchases(), "carregar plugin");

  const { customerInfo } = await comTeto(
    Purchases.restorePurchases(),
    "restorePurchases"
  );
  return hasEntitlement(customerInfo);
}
