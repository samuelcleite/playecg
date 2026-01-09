import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
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
  CheckCircle2
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
  const [couponCode, setCouponCode] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [errorDialog, setErrorDialog] = useState({ open: false, title: '', message: '', details: '' });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const userData = await base44.auth.me();
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
        coupon_code: couponCode
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

  const handleUpgrade = async () => {
    setProcessing(true);

    try {
      const payload = {
        coupon_code: appliedCoupon?.coupon?.code || ""
      };

      console.log('Sending payment request:', payload);

      const response = await base44.functions.invoke('createMercadoPagoCharge', payload);

      console.log('Payment response:', response.data);

      if (response.data.success) {
        const checkoutUrl = response.data.init_point;
        
        console.log('Redirecting to checkout:', checkoutUrl);
        
        if (checkoutUrl) {
          // Redirecionar para o checkout de produção
          window.location.href = checkoutUrl;
        } else {
          setErrorDialog({
            open: true,
            title: 'Erro no Checkout',
            message: 'URL de checkout não foi retornada pelo Mercado Pago. Por favor, tente novamente.',
            details: JSON.stringify(response.data, null, 2)
          });
        }
      } else {
        const errorMsg = response.data.error || "Erro ao gerar cobrança. Tente novamente.";
        console.error('Payment error:', response.data);
        
        setErrorDialog({
          open: true,
          title: 'Erro ao Processar Pagamento',
          message: errorMsg,
          details: response.data.debug ? JSON.stringify(response.data.debug, null, 2) : ''
        });
      }
    } catch (error) {
      console.error("Error creating charge:", error);
      const errorMessage = error.response?.data?.error || error.message || "Erro desconhecido";
      const errorDetails = error.response?.data?.debug 
        ? JSON.stringify(error.response.data.debug, null, 2)
        : error.stack || '';
      
      setErrorDialog({
        open: true,
        title: 'Erro ao Processar Pagamento',
        message: errorMessage,
        details: errorDetails
      });
    } finally {
      setProcessing(false);
    }
  };

  // PREÇO BASE ALTERADO PARA R$ 10,00 (Temporariamente para testar o problema do botão desabilitado)
  const originalPrice = 10;
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
            className="w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl"
          >
            <Crown className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Desbloqueie Todo o Potencial
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
                <span className="text-4xl font-bold text-gray-900">R$ 0</span>
                <span className="text-gray-600">/mês</span>
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
          <Card className="border-none shadow-2xl bg-gradient-to-br from-amber-50 to-orange-50 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-gradient-to-br from-amber-500 to-orange-500 text-white px-4 py-1 text-sm font-semibold">
              Mais Popular
            </div>
            <CardHeader className="text-center pb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Crown className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl flex items-center justify-center gap-2">
                Versão Premium
                <Sparkles className="w-5 h-5 text-amber-600" />
              </CardTitle>
              <div className="mt-4">
                {appliedCoupon ? (
                  <div>
                    <span className="text-2xl line-through text-gray-500">R$ {originalPrice.toFixed(2)}</span>
                    <div className="text-4xl font-bold text-gray-900 mt-1">
                      R$ {finalPrice.toFixed(2)}
                    </div>
                    {discountAmount > 0 && (
                      <Badge className="bg-green-500 text-white mt-2">
                        Economia de R$ {discountAmount.toFixed(2)}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <>
                    <span className="text-4xl font-bold text-gray-900">R$ 10</span>
                    <span className="text-gray-600">/mês</span>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Coupon Section */}
              <div className="mb-6 p-4 bg-white rounded-lg border-2 border-amber-200">
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
                        className="border-amber-300"
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

              <ul className="space-y-3 mb-6">
                {premiumFeatures.map((feature, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-start gap-3"
                  >
                    <Check className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
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
                      Pagamento Seguro com Mercado Pago
                    </p>
                    <p className="text-sm">
                      Você será redirecionado para a página segura do Mercado Pago. 
                      Aceita cartão de crédito, débito, PIX e boleto.
                    </p>
                    <p className="text-xs font-semibold text-blue-700">
                      🔒 Pagamento de R$ {finalPrice.toFixed(2)}
                    </p>
                  </div>
                </AlertDescription>
              </Alert>

              <Button
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-6 text-lg shadow-lg"
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
                    Ir para Checkout Seguro - R$ {finalPrice.toFixed(2)}
                  </>
                )}
              </Button>
              <p className="text-center text-sm text-gray-600 mt-4 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Checkout 100% seguro processado pelo Mercado Pago
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Benefits Section */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="border-none shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-blue-600" />
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
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-8 h-8 text-purple-600" />
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
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-green-600" />
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
                Completamente! Utilizamos o Mercado Pago, uma das maiores plataformas de pagamento da América Latina. 
                Seus dados de pagamento são processados diretamente pelo Mercado Pago e nunca passam pelos nossos servidores.
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
              
              {errorDialog.details && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Detalhes técnicos:</p>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap overflow-auto max-h-60">
                    {errorDialog.details}
                  </pre>
                </div>
              )}

              <Alert className="bg-blue-50 border-blue-200">
                <AlertDescription className="text-sm text-blue-900">
                  <strong>💡 Dica:</strong> Verifique os logs da função no Dashboard → Code → Functions → createMercadoPagoCharge para ver mais detalhes do erro retornado pelo Mercado Pago.
                </AlertDescription>
              </Alert>
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