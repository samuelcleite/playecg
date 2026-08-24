import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCurrentUser, refreshCurrentUser } from '@/lib/currentUser';
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { isIOSNativeApp, isAndroidNativeApp } from "@/utils/platform";
import { startIOSPurchase, restoreIOSPurchases } from "@/utils/purchase";
import {
  purchaseAndroidPlan,
  restoreAndroidPurchases,
  PURCHASE_OFFER_UNAVAILABLE,
  PURCHASE_SUCCESS,
  PURCHASE_CANCELLED,
  PURCHASE_PENDING,
} from "@/utils/purchasesAndroid";
import FaleConoscoButton from "@/components/FaleConoscoButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Crown,
  Check,
  Zap,
  Sparkles,
  Loader2,
  Tag,
  X,
  CreditCard,
  XCircle,
  ShieldCheck,
  RotateCcw
} from "lucide-react";
import { motion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// Qualifica o preço com desconto quando o cupom NÃO dura para sempre.
//
// Sem isto a tela afirma "R$ 29,50/mês" para um cupom que vale 6 meses, e o
// cliente descobre a diferença pela fatura. A tela do próprio Stripe é mais
// honesta que a nossa aqui: ela diz "Total devido hoje", que não promete nada
// sobre o mês que vem.
//
// Devolve null quando não há o que qualificar — em 'forever' o preço com
// desconto É o preço recorrente, e a linha extra só faria ruído.
function textoDaDuracao(appliedCoupon, plano, precoCheio) {
  const c = appliedCoupon?.coupon;
  if (!c) return null;

  // Ausência = forever. Mesmo fallback do createStripeCheckout: cupom gravado
  // antes de o campo existir chega sem `duration`, e sempre se comportou assim.
  const duracao = c.duration ?? "forever";
  if (duracao === "forever") return null;

  const cheio = `R$ ${precoCheio.toFixed(2)}${plano === "annual" ? "/ano" : "/mês"}`;
  if (duracao === "once") return `Preço da 1ª cobrança. Depois, ${cheio}.`;

  const meses = Number(c.duration_in_months);
  if (!Number.isInteger(meses) || meses <= 0) return null;

  // MESES CORRIDOS, não cobranças. O anual cobra uma vez a cada 12 meses, então
  // qualquer duração abaixo de 12 não alcança a segunda cobrança — o desconto
  // vale só pela primeira, por mais que o cupom diga "6 meses".
  if (plano === "annual") {
    return meses < 12
      ? `Preço da 1ª cobrança. Depois, ${cheio}.`
      : `Preço das cobranças nos primeiros ${meses} meses. Depois, ${cheio}.`;
  }
  return `Preço das ${meses} primeiras cobranças. Depois, ${cheio}.`;
}

export default function Upgrade() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("monthly");
  const [couponCode, setCouponCode] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [errorDialog, setErrorDialog] = useState({ open: false, title: '', message: '', details: '' });
  // Confirmação de preço cheio: a oferta do parceiro não veio no aparelho e a
  // pessoa precisa decidir antes de a folha do Google abrir. Sem isto ela
  // pagaria o preço normal achando que tinha desconto.
  const [confirmaPrecoCheio, setConfirmaPrecoCheio] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  // Handler global de sucesso do Despia (compra iOS via RevenueCat).
  //
  // Antes isto era só um laço de polling à espera do revenuecatWebhook: até 20s
  // de "Processando...", e se o webhook demorasse mais que a janela o usuário
  // caía num diálogo pedindo para atualizar a tela. Numa compra real foi
  // exatamente o que aconteceu — o pagamento passou, mas só apareceu depois de
  // fechar e reabrir o app.
  //
  // Agora perguntamos ao RevenueCat em vez de esperar que ele avise. Ele já sabe
  // da compra no instante em que ela acontece. O polling continua como rede de
  // segurança, para o caso da consulta falhar por rede.
  useEffect(() => {
    window.iapSuccess = async () => {
      setProcessing(true);

      const irParaDashboard = (conta) => {
        if (conta) setUser(conta);
        window.location.href = createPageUrl("Dashboard");
      };

      // 1) Caminho rápido: consulta direta ao RevenueCat.
      try {
        const res = await base44.functions.invoke('syncStoreSubscription', {});
        if (res?.data?.premium) {
          irParaDashboard(await refreshCurrentUser());
          return;
        }
      } catch (error) {
        console.error("syncStoreSubscription falhou, caindo no polling:", error);
      }

      // 2) Rede de segurança: espera o webhook, como antes.
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          // refreshCurrentUser, NÃO getCurrentUser: este laço existe para
          // esperar o webhook confirmar o pagamento, e ler do cache devolveria
          // para sempre o mesmo "free" da carga inicial da tela — o usuário
          // pagaria e ficaria preso no paywall.
          const current = await refreshCurrentUser();
          if (current?.subscription_type === "premium") {
            irParaDashboard(current);
            return;
          }
        } catch (error) {
          console.error("Erro ao verificar assinatura (iapSuccess):", error);
        }
      }

      // Esgotou ~20s sem confirmar premium.
      setProcessing(false);
      setErrorDialog({
        open: true,
        title: 'Confirmando seu pagamento',
        message: 'Recebemos sua compra e ela está sendo processada. Aguarde alguns instantes e atualize a tela. Se o acesso não liberar, use a opção Restaurar Compras no app.',
        details: ''
      });
    };

    return () => {
      delete window.iapSuccess;
    };
  }, []);

  const loadUser = async () => {
    const userData = await getCurrentUser();
    setUser(userData);
  };

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError("Digite um código de cupom");
      return;
    }

    setValidatingCoupon(true);
    setCouponError(null);

    try {
      const response = await base44.functions.invoke('validateCoupon', {
        coupon_code: couponCode,
        plan: selectedPlan
      });

      if (response.data.valid) {
        setAppliedCoupon(response.data);
        setCouponError(null);
      } else {
        setCouponError(response.data.error || "Cupom inválido");
        setAppliedCoupon(null);
      }
    } catch (error) {
      console.error("Error validating coupon:", error);
      setCouponError("Erro ao validar cupom. Tente novamente.");
      setAppliedCoupon(null);
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  };

  const handlePlanChange = (newPlan) => {
    setSelectedPlan(newPlan);
    if (appliedCoupon) {
      setAppliedCoupon(null);
      setCouponError(null);
    }
  };

  const handleUpgrade = async () => {
    // Desvio por plataforma: no app iOS nativo (Despia), compra via RevenueCat.
    if (isIOSNativeApp()) {
      try {
        setProcessing(true);
        // Confirmação vem por window.iapSuccess.
        startIOSPurchase(selectedPlan, user?.id);
      } catch (error) {
        console.error("Erro ao iniciar compra iOS:", error);
        setProcessing(false);
        setErrorDialog({
          open: true,
          title: 'Erro ao Iniciar Compra',
          message: error.message || "Não foi possível iniciar a compra. Tente novamente.",
          details: ''
        });
      }
      return;
    }

    // Android nativo (Capacitor): compra via RevenueCat usando Offerings.
    if (isAndroidNativeApp()) {
      await comprarNoAndroid({ aceitarPrecoCheio: false });
      return;
    }

    // --- Fluxo Stripe (web) — inalterado ---
    return seguirParaStripe();
  };

  // Compra do Android, isolada porque acontece em dois momentos: no clique
  // normal e de novo quando a pessoa aceita pagar o preço cheio no diálogo.
  const comprarNoAndroid = async ({ aceitarPrecoCheio }) => {
      setProcessing(true);
      try {
        const result = await purchaseAndroidPlan(selectedPlan, user?.id, {
          // A tag da oferta do Play vem do cupom validado. Sem cupom de
          // parceria, vai nulo e o caminho é o de sempre.
          offerTag: appliedCoupon?.coupon?.tier || null,
          aceitarPrecoCheio
        });

        // A oferta do parceiro não está no aparelho. NÃO compramos calado: a
        // pessoa digitou um código de desconto e a tela aceitou, então cobrar
        // o preço normal sem avisar seria descoberto na fatura.
        if (result === PURCHASE_OFFER_UNAVAILABLE) {
          setProcessing(false);
          setConfirmaPrecoCheio(true);
          return;
        }

        if (result === PURCHASE_SUCCESS) {
          // Reaproveita o polling já usado no iOS: aguarda o revenuecatWebhook
          // marcar subscription_type === "premium" e recarrega a rota.
          await window.iapSuccess();
          return;
        }
        if (result === PURCHASE_CANCELLED) return; // usuário desistiu: sem diálogo
        setErrorDialog({
          open: true,
          title: result === PURCHASE_PENDING ? 'Confirmando seu pagamento' : 'Assinatura Indisponível',
          message: result === PURCHASE_PENDING
            ? 'Recebemos sua compra e ela está sendo processada. Aguarde alguns instantes e atualize a tela. Se o acesso não liberar, use a opção "Restaurar Compras".'
            : 'A assinatura não está disponível no momento. Tente novamente em alguns instantes.',
          details: ''
        });
      } catch (error) {
        console.error("Erro ao iniciar compra Android:", error);
        setErrorDialog({
          open: true,
          title: 'Erro ao Iniciar Compra',
          message: "Não foi possível iniciar a compra. Tente novamente.",
          // A mensagem crua vai para details de propósito: sem acesso ao console
          // do aparelho, esta é a única forma de diagnosticar em campo.
          details: error?.message || String(error)
        });
      } finally {
        // Sem este finally, qualquer caminho que não passe pelos returns acima
        // deixa os dois botões desabilitados para sempre.
        setProcessing(false);
      }
  };

  const seguirParaStripe = async () => {
    // Stripe Checkout não funciona dentro de iframe (preview)
    if (window.self !== window.top) {
      setErrorDialog({
        open: true,
        title: 'Abra o app publicado',
        message: 'O checkout só funciona no app publicado. Abra o app em uma nova aba para finalizar o pagamento.',
        details: ''
      });
      return;
    }

    setProcessing(true);

    try {
      const response = await base44.functions.invoke('createStripeCheckout', {
        coupon_code: appliedCoupon?.coupon?.code || "",
        plan: selectedPlan
      });

      if (response.data.success && response.data.url) {
        window.location.href = response.data.url;
      } else {
        setErrorDialog({
          open: true,
          title: 'Erro ao Processar Pagamento',
          message: response.data.error || "Erro ao gerar checkout. Tente novamente.",
          details: ''
        });
      }
    } catch (error) {
      console.error("Error creating checkout:", error);
      setErrorDialog({
        open: true,
        title: 'Erro ao Processar Pagamento',
        message: error.response?.data?.error || error.message || "Erro desconhecido",
        details: ''
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRestore = async () => {
    // Android nativo (Capacitor): restore via RevenueCat.
    if (isAndroidNativeApp()) {
      setProcessing(true);
      try {
        const restored = await restoreAndroidPurchases(user?.id);
        if (restored) {
          // Mesmo polling da compra: aguarda o webhook refletir o premium.
          await window.iapSuccess();
          return;
        }
        setErrorDialog({
          open: true,
          title: 'Nenhuma Compra Encontrada',
          message: 'Não encontramos nenhuma assinatura ativa para restaurar nesta conta do Google Play. Verifique se está logado com a mesma conta usada na compra.',
          details: ''
        });
      } catch (error) {
        console.error("Erro ao restaurar compras Android:", error);
        setErrorDialog({
          open: true,
          title: 'Erro ao Restaurar Compras',
          message: "Não foi possível restaurar suas compras. Tente novamente.",
          // Mensagem crua para diagnóstico em campo — ver o mesmo em handleUpgrade.
          details: error?.message || String(error)
        });
      } finally {
        setProcessing(false);
      }
      return;
    }

    // Restaura compras via RevenueCat (iOS). getpurchasehistory:// retorna os
    // dados; restoreIOSPurchases resolve true se houver premium ativo.
    setProcessing(true);
    try {
      const restored = await restoreIOSPurchases(user?.id);
      if (restored) {
        // Mesmo caminho da compra: consulta o RevenueCat e, se houver assinatura
        // ativa, libera na hora. Restaurar não gera webhook nenhum — a compra é
        // antiga —, então aqui a consulta direta não é otimização, é o único
        // jeito de o acesso voltar sem intervenção.
        await window.iapSuccess?.();
        return;
      }
      // Nenhuma compra ativa encontrada para este usuário.
      setProcessing(false);
      setErrorDialog({
        open: true,
        title: 'Nenhuma Compra Encontrada',
        message: 'Não encontramos nenhuma assinatura ativa para restaurar nesta conta da App Store. Se você acredita que isso é um erro, verifique se está logado com o mesmo ID Apple usado na compra.',
        details: ''
      });
    } catch (error) {
      console.error("Erro ao restaurar compras iOS:", error);
      setProcessing(false);
      setErrorDialog({
        open: true,
        title: 'Erro ao Restaurar Compras',
        message: error.message || "Não foi possível restaurar suas compras. Tente novamente.",
        details: ''
      });
    }
  };

  // Em app nativo a compra é processada pela loja (RevenueCat sobre StoreKit no
  // iOS, sobre Play Billing no Android), não pelo Stripe. Os textos precisam
  // acompanhar: dizer "Stripe" dentro do app Android não é só impreciso — a
  // política de pagamentos do Google proíbe indicar pagamento externo para bens
  // digitais, do mesmo jeito que a da Apple. `loja` é null só na web.
  const isIOS = isIOSNativeApp();
  const isAndroid = isAndroidNativeApp();
  const loja = isIOS ? "App Store" : isAndroid ? "Google Play" : null;
  // `donoDaLoja` (Apple / Google) saiu junto com o FAQ, que era seu único uso.

  const originalPrice = selectedPlan === "annual" ? 499 : 59;

  // NO ANDROID O CUPOM NÃO MEXE NO PREÇO EXIBIDO.
  //
  // Quem cobra lá é o Google, pelo preço da oferta cadastrada no Play — não
  // pelo percentual do nosso cupom. Mostrar um valor calculado aqui e o Google
  // cobrar outro é pior do que não mostrar desconto nenhum. O valor real
  // aparece na folha de pagamento do Google, que é a fonte da verdade.
  const descontoValeAqui = !isAndroidNativeApp();
  const finalPrice = (descontoValeAqui && appliedCoupon?.pricing?.final_price) || originalPrice;
  const discountAmount = (descontoValeAqui && appliedCoupon?.pricing?.discount_amount) || 0;
  const avisoDeDuracao = descontoValeAqui
    ? textoDaDuracao(appliedCoupon, selectedPlan, originalPrice)
    : null;

  const freeFeatures = [
    "Acesso a quizzes aleatórios",
    "Casos básicos de ECG",
    "Pontuação básica",
    "Acesso limitado a conteúdo"
  ];

  const premiumFeatures = [
    "Aprenda do básico ao avançado em módulos estruturados",
    "Acesso à teoria antes de cada fase",
    "Acesso ilimitado a todos os casos",
    "Conteúdo atualizado regularmente",
    "Suporte prioritário"
  ];

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.6 }}
            className="w-20 h-20 bg-[#0D3B66] rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl"
          >
            <Crown className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Desbloqueie Todo o Potencial do PlayECG
          </h1>
          <p className="text-xl text-gray-600">
            Torne-se um especialista em ECG com nossa versão Premium
          </p>
        </div>

        {/* Comparison Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Free Plan */}
          <Card className="border-2 border-gray-200">
            <CardHeader className="text-center pb-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-gray-600" />
              </div>
              <CardTitle className="text-2xl">Versão Gratuita</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {freeFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-600">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                className="w-full mt-6"
                disabled
              >
                Plano Atual
              </Button>
            </CardContent>
          </Card>

          {/* Premium Plan */}
          <Card className="border-none shadow-2xl bg-blue-50 relative overflow-hidden">
            <CardHeader className="text-center pb-4">
              <div className="w-16 h-16 bg-[#0D3B66] rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Crown className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl flex items-center justify-center gap-2">
                Versão Premium
                <Sparkles className="w-5 h-5 text-amber-600" />
              </CardTitle>
              <div className="mt-4">
                {discountAmount > 0 && (
                  <span className="text-xl text-gray-400 line-through mr-2">R$ {originalPrice.toFixed(2)}</span>
                )}
                <span className="text-4xl font-bold text-gray-900">R$ {finalPrice.toFixed(2)}</span>
                <span className="text-gray-600">{selectedPlan === "annual" ? "/ano" : "/mês"}</span>
              </div>
              {/* O "/mês" logo acima é uma afirmação sobre TODO mês. Quando o
                  cupom tem prazo, ela deixa de ser verdade — e esta linha é a
                  única coisa entre o cliente e uma fatura inesperada. */}
              {avisoDeDuracao && (
                <p className="mt-2 text-sm font-medium text-amber-700">
                  {avisoDeDuracao}
                </p>
              )}
              {appliedCoupon && discountAmount > 0 && (
                <div className="mt-4">
                  <Badge className="bg-green-500 text-white">
                    Desconto de R$ {discountAmount.toFixed(2)} aplicado!
                  </Badge>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {/* Plan Selector */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => handlePlanChange("monthly")}
                  className={`rounded-lg border-2 p-4 text-center transition-all ${
                    selectedPlan === "monthly"
                      ? "border-[#22C55E] bg-green-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <p className="font-semibold text-gray-900">Mensal</p>
                  <p className="text-sm text-gray-600">R$ 59/mês</p>
                </button>
                <button
                  type="button"
                  onClick={() => handlePlanChange("annual")}
                  className={`rounded-lg border-2 p-4 text-center transition-all ${
                    selectedPlan === "annual"
                      ? "border-[#22C55E] bg-green-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <p className="font-semibold text-gray-900">Anual</p>
                  <p className="text-sm text-gray-600">R$ 499/ano</p>
                </button>
              </div>

              {/* Coupon Section — visível na web e no ANDROID; ainda oculto no
                  iOS.
                  O motivo de esconder era que o desconto vinha de fora da compra
                  da loja, o que a Apple proíbe (3.1.1) e o Google também. Isso
                  deixou de valer no Android: o desconto agora é uma OFERTA do
                  próprio Play, escolhida pela tag do cupom, e quem cobra é o
                  Google. O código identifica o parceiro; o desconto é da loja.
                  No iOS continua escondido até o resgate por offer code existir. */}
              {!isIOSNativeApp() && (
                <div className="mb-6 p-4 bg-white rounded-lg border-2 border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Tag className="w-5 h-5 text-amber-600" />
                    <span className="font-semibold text-gray-900">Tem um cupom de desconto?</span>
                  </div>

                  {appliedCoupon ? (
                    <Alert className="bg-green-50 border-green-200">
                      <Check className="w-4 h-4 text-green-600" />
                      <AlertDescription className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-green-900">
                            Cupom {appliedCoupon.coupon.code} aplicado!
                          </span>
                          <p className="text-sm text-green-700 mt-1">
                            {appliedCoupon.coupon.description}
                          </p>
                          {/* No Android o preço com desconto é do Google, não
                              nosso — a tela não promete valor nenhum, só diz
                              onde ele vai aparecer. E cupom sem tier não tem
                              oferta correspondente no Play: avisar aqui evita
                              a pessoa seguir até a folha de pagamento para
                              descobrir que não havia desconto. */}
                          {isAndroid && (
                            <p className="text-sm mt-2 font-medium text-green-800">
                              {appliedCoupon.coupon.tier
                                ? 'O valor com desconto aparece na tela de pagamento do Google Play.'
                                : 'Atenção: este código só vale no site. Aqui no app a assinatura sai pelo preço normal.'}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleRemoveCoupon}
                          className="text-green-700 hover:text-green-900"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          placeholder="Digite o código"
                          className="font-mono"
                          maxLength={20}
                          disabled={validatingCoupon}
                        />
                        <Button
                          onClick={handleValidateCoupon}
                          disabled={validatingCoupon || !couponCode.trim()}
                          variant="outline"
                          className="border-[#1976D2]"
                        >
                          {validatingCoupon ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Aplicar"
                          )}
                        </Button>
                      </div>
                      {couponError && (
                        <p className="text-sm text-red-600">{couponError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <ul className="space-y-3 mb-6">
                {premiumFeatures.map((feature, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-start gap-3"
                  >
                    <Check className="w-5 h-5 text-[#22C55E] flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700 font-medium">{feature}</span>
                  </motion.li>
                ))}
              </ul>

              {/* Payment Info */}
              <Alert className="bg-blue-50 border-blue-200 mb-6">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <AlertDescription className="text-blue-900">
                  <div className="space-y-2">
                    <p className="font-semibold flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      {loja
                        ? `Pagamento Seguro pela ${loja}`
                        : "Pagamento Seguro com Stripe"}
                    </p>
                    <p className="text-sm">
                      {loja
                        ? `A compra será processada com segurança pela ${loja}.`
                        : "Você será redirecionado para a página segura do Stripe. Aceita os principais cartões de crédito e débito."}
                    </p>
                    {/* Terceira linha removida: repetia o título do próprio
                        bloco, duas linhas acima. As duas que sobraram já usam
                        o nome da loja certa (App Store / Google Play). */}
                  </div>
                </AlertDescription>
              </Alert>

              <Button
                className="w-full bg-[#22C55E] hover:bg-green-600 text-white font-semibold py-6 text-lg shadow-lg"
                onClick={handleUpgrade}
                disabled={processing}
              >
                {processing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 mr-2" />
                    Adquirir Premium
                  </>
                )}
              </Button>
              {/* Aviso de pagamento seguro removido daqui: o bloco azul logo
                  acima do botão já diz a mesma coisa. */}

              {/* Restaurar Compras — apps nativos. Exigência da Apple no iOS;
                  no Android a compra também é do RevenueCat e precisa do restore. */}
              {(isIOSNativeApp() || isAndroidNativeApp()) && (
                <Button
                  variant="outline"
                  className="w-full mt-4 border-[#1976D2] text-[#0D3B66] font-semibold"
                  onClick={handleRestore}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-5 h-5 mr-2" />
                      Restaurar Compras
                    </>
                  )}
                </Button>
              )}

              {/* Links legais exigidos pela Apple (Guideline 3.1.2(c)) —
                  visíveis em todas as plataformas, próximos ao botão de assinatura */}
              <p className="text-center text-xs text-gray-500 mt-6">
                Ao assinar, você concorda com nossos{" "}
                <a
                  href="https://playecg.app/termos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-gray-700"
                >
                  Termos de Uso
                </a>{" "}
                e nossa{" "}
                <a
                  href="https://playecg.app/privacidade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-gray-700"
                >
                  Política de Privacidade
                </a>
                .
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Cards de benefício e FAQ removidos de vez — app e web. De
            "Aprendizado Estruturado" para baixo a página virava peça de site:
            três cards institucionais e um FAQ inteiro depois do botão de
            compra. */}

      </div>

      {/* Error Dialog */}
      {/* Oferta do parceiro ausente no aparelho. Perguntar antes é o que
          impede a pessoa de pagar o preço cheio achando que tinha desconto.
          Se ela seguir, a atribuição do parceiro continua valendo: a pendência
          já foi gravada no validateCoupon e o webhook a promove do mesmo
          jeito — ele trouxe o cliente, ainda que o desconto tenha falhado. */}
      <AlertDialog open={confirmaPrecoCheio} onOpenChange={setConfirmaPrecoCheio}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <Tag className="w-5 h-5" />
              Desconto indisponível no app
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="text-base text-gray-900">
                O desconto do cupom {appliedCoupon?.coupon?.code} não está disponível
                neste aparelho agora. Se você continuar, a assinatura sai pelo
                <strong> preço normal</strong>.
              </p>
              <p className="text-sm text-gray-600">
                O valor exato aparece na tela de pagamento do Google Play antes de
                você confirmar.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmaPrecoCheio(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmaPrecoCheio(false);
                comprarNoAndroid({ aceitarPrecoCheio: true });
              }}
            >
              Continuar pelo preço normal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog({ ...errorDialog, open })}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" />
              {errorDialog.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p className="text-base text-gray-900">{errorDialog.message}</p>
              {/* Detalhe técnico. Existe porque em app nativo não há console
                  acessível: sem isto, uma falha de compra no aparelho de outra
                  pessoa é indiagnosticável. Discreto de propósito — serve para
                  ser lido em voz alta ou fotografado, não para assustar. */}
              {errorDialog.details && (
                <p className="text-xs text-gray-500 font-mono break-words border-t border-gray-200 pt-3">
                  {errorDialog.details}
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorDialog({ ...errorDialog, open: false })}>
              Fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FaleConoscoButton />
    </div>
  );
}
