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

// Configura o RevenueCat no Android. No-op em qualquer outra plataforma.
// appUserId DEVE ser o Account.id: é o external_id que o iOS também usa, e o
// revenuecatWebhook resolve por ele (com fallback para o User.id legado das
// compras anteriores ao corte). Configurar com outro valor faz a compra
// completar sem liberar o premium.
export async function initAndroidPurchases(appUserId) {
  if (!isAndroidNativeApp()) return;
  if (!appUserId) {
    console.error("RevenueCat: appUserId ausente — configure() abortado");
    return;
  }

  if (!configurePromise) {
    configurePromise = (async () => {
      const Purchases = await loadPurchases();
      await Purchases.configure({
        apiKey: RC_ANDROID_KEY,
        appUserID: String(appUserId),
      });
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
  const Purchases = await loadPurchases();

  const offerings = await Purchases.getOfferings();
  const aPackage = pickPackage(offerings?.current, plan);
  // Offering vazio/sem o plano: esperado enquanto os produtos não existem no
  // Play Console. Retorna em vez de lançar.
  if (!aPackage) return PURCHASE_UNAVAILABLE;

  try {
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
  const Purchases = await loadPurchases();

  const { customerInfo } = await Purchases.restorePurchases();
  return hasEntitlement(customerInfo);
}
