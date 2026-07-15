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
  BookOpen,
  Trophy,
  Target,
  Sparkles,
  Loader2,
  Tag,
  X,
  CreditCard,
  XCircle,
  ShieldCheck,
  CheckCircle2,
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
} from "@/components/ui/alert-dialog";

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
      setProcessing(true);
      try {
        const result = await purchaseAndroidPlan(selectedPlan, user?.id);
        if (result === PURCHASE_SUCCESS) {
          // Reaproveita o polling já usado no iOS: aguarda o revenuecatWebhook
          // marcar subscription_type === "premium" e recarrega a rota.
          await window.iapSuccess();
          return;
        }
        setProcessing(false);
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
        setProcessing(false);
        setErrorDialog({
          open: true,
          title: 'Erro ao Iniciar Compra',
          message: error?.message || "Não foi possível iniciar a compra. Tente novamente.",
          details: ''
        });
      }
      return;
    }

    // --- Fluxo Stripe (web) — inalterado ---
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
        setProcessing(false);
        setErrorDialog({
          open: true,
          title: 'Nenhuma Compra Encontrada',
          message: 'Não encontramos nenhuma assinatura ativa para restaurar nesta conta do Google Play. Verifique se está logado com a mesma conta usada na compra.',
          details: ''
        });
      } catch (error) {
        console.error("Erro ao restaurar compras Android:", error);
        setProcessing(false);
        setErrorDialog({
          open: true,
          title: 'Erro ao Restaurar Compras',
          message: error?.message || "Não foi possível restaurar suas compras. Tente novamente.",
          details: ''
        });
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

  // No app iOS a compra é processada pela App Store (StoreKit/RevenueCat),
  // não pelo Stripe — os textos de pagamento variam por plataforma.
  const isIOS = isIOSNativeApp();

  const originalPrice = selectedPlan === "annual" ? 499 : 59;
  const finalPrice = appliedCoupon?.pricing?.final_price || originalPrice;
  const discountAmount = appliedCoupon?.pricing?.discount_amount || 0;

  const freeFeatures = [
    "Acesso a quizzes aleatórios",
    "Casos básicos de ECG",
    "Pontuação básica",
    "Acesso limitado a conteúdo"
  ];

  const premiumFeatures = [
    "Trilha de aprendizado estruturada",
    "Todos os módulos e fases desbloqueados",
    "Explicações detalhadas de cada caso",
    "Sistema completo de gamificação",
    "Badges e troféus exclusivos",
    "Análise de desempenho detalhada",
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
              <div className="mt-4">
                <span className="text-2xl font-bold text-gray-500">Gratuito</span>
              </div>
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
            <div className="absolute top-0 right-0 bg-[#22C55E] text-white px-4 py-1 text-sm font-semibold">
              Mais Popular
            </div>
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

              {/* Coupon Section — oculto no app iOS nativo: o desconto é
                  concedido fora do IAP (exigência da Apple, Guideline 3.1.1).
                  Na web (Stripe) permanece inalterado. */}
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
                      {isIOS
                        ? "Pagamento Seguro pela App Store"
                        : "Pagamento Seguro com Stripe"}
                    </p>
                    <p className="text-sm">
                      {isIOS
                        ? "A compra será processada com segurança pela App Store."
                        : "Você será redirecionado para a página segura do Stripe. Aceita os principais cartões de crédito e débito."}
                    </p>
                    <p className="text-xs font-semibold text-blue-700">
                      {isIOS
                        ? "🔒 Pagamento seguro via App Store"
                        : "🔒 Pagamento seguro via Stripe"}
                    </p>
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
                    Ir para Checkout Seguro
                  </>
                )}
              </Button>
              <p className="text-center text-sm text-gray-600 mt-4 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {isIOS
                  ? "Compra processada com segurança pela App Store"
                  : "Checkout 100% seguro processado pelo Stripe"}
              </p>

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

        {/* Benefits Section */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="border-none shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-[#0D3B66] rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Aprendizado Estruturado
              </h3>
              <p className="text-gray-600">
                Siga uma trilha progressiva do básico ao avançado
              </p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-[#1976D2] rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Gamificação Completa
              </h3>
              <p className="text-gray-600">
                Conquiste badges, níveis e mantenha sua motivação
              </p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-[#22C55E] rounded-full flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Feedback Detalhado
              </h3>
              <p className="text-gray-600">
                Explicações completas e análise de cada caso
              </p>
            </CardContent>
          </Card>
        </div>

        {/* FAQ Section */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="text-center text-2xl">Perguntas Frequentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                Posso cancelar a qualquer momento?
              </h4>
              <p className="text-gray-600">
                Sim! Você pode cancelar sua assinatura quando quiser, sem multas ou taxas de cancelamento.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                Qual a diferença para a versão gratuita?
              </h4>
              <p className="text-gray-600">
                A versão gratuita oferece apenas quizzes aleatórios. A Premium inclui trilha estruturada,
                explicações detalhadas, gamificação completa e muito mais.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                Os casos são baseados em situações reais?
              </h4>
              <p className="text-gray-600">
                Sim! Todos os casos são baseados em ECGs reais e situações clínicas autênticas,
                cuidadosamente selecionados para seu aprendizado.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                O pagamento é seguro?
              </h4>
              <p className="text-gray-600">
                {isIOS
                  ? "Completamente! Utilizamos o sistema de pagamentos da App Store. Seus dados de pagamento são processados diretamente pela Apple e nunca passam pelos nossos servidores."
                  : "Completamente! Utilizamos o Stripe, uma das maiores plataformas de pagamento do mundo. Seus dados de pagamento são processados diretamente pelo Stripe e nunca passam pelos nossos servidores."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error Dialog */}
      <AlertDialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog({ ...errorDialog, open })}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" />
              {errorDialog.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p className="text-base text-gray-900">{errorDialog.message}</p>
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