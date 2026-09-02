import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { getCurrentUser, refreshCurrentUser } from '@/lib/currentUser';
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { calculateStreakDays } from "@/components/StreakCalculator";
import { loadUserAchievements } from "@/components/AchievementChecker";
import FaleConoscoButton from "@/components/FaleConoscoButton";
import EnableNotifications from "@/components/EnableNotifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Trophy, 
  Target, 
  Zap, 
  Award, 
  TrendingUp,
  Calendar,
  Crown,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Loader2,
  XCircle,
  Trash2,
  Bell,
  LogOut,
  Clock
} from "lucide-react";
import { motion } from "framer-motion";
import { clearToken } from "@/lib/customAuth";

// Instrução de cancelamento por loja. `store` ausente => texto neutro: acontece
// com resposta de backend anterior ao campo ou quando o RevenueCat não respondeu.
// Nunca chutar a loja — quem assinou no iPhone abre o app Android com a mesma conta.
// `encerrada` é um estado à parte, e não um "cancelada mais forte": quem
// cancelou dentro do período pago ainda pode REATIVAR a renovação na loja, e
// quem já expirou não — para essa pessoa a assinatura não existe mais, e mandá-la
// procurar uma tela de reativação que não vai encontrar é pior que não dizer
// nada.
function instrucaoDaLoja(store, cancelada, encerrada) {
  if (store === 'APP_STORE') {
    if (encerrada) return 'Esta assinatura era gerenciada pela App Store e já foi encerrada. Para voltar ao Premium, é preciso assinar de novo pelo app.';
    return cancelada
      ? 'Sua assinatura é gerenciada pela App Store. Mudou de ideia? Você pode reativar a renovação em Ajustes > sua conta Apple > Assinaturas.'
      : 'Sua assinatura é gerenciada pela App Store. Para alterar ou cancelar, acesse Ajustes > sua conta Apple > Assinaturas.';
  }
  if (store === 'PLAY_STORE') {
    if (encerrada) return 'Esta assinatura era gerenciada pelo Google Play e já foi encerrada. Para voltar ao Premium, é preciso assinar de novo pelo app.';
    return cancelada
      ? 'Sua assinatura é gerenciada pelo Google Play. Mudou de ideia? Você pode reativar a renovação na Play Store > Pagamentos e assinaturas > Assinaturas.'
      : 'Sua assinatura é gerenciada pelo Google Play. Para alterar ou cancelar, acesse a Play Store > Pagamentos e assinaturas > Assinaturas.';
  }
  if (encerrada) return 'Esta assinatura era gerenciada pela loja onde você assinou e já foi encerrada. Para voltar ao Premium, é preciso assinar de novo pelo app.';
  return cancelada
    ? 'Sua assinatura é gerenciada pela loja onde você assinou. Mudou de ideia? Você pode reativar a renovação na área de Assinaturas da App Store ou da Google Play.'
    : 'Sua assinatura é gerenciada pela loja onde você assinou. Para alterar ou cancelar, acesse a área de Assinaturas na App Store ou na Google Play.';
}

// Converte para Date, ou null. QUALQUER entrada que não vire data válida sai
// como null — inclusive `undefined`, que `new Date()` transforma num objeto
// Date perfeitamente truthy cujo único conteúdo é NaN. Foi exatamente assim
// que um comprador viu "Invalid Date" no lugar das duas datas da assinatura.
function paraData(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Data por extenso, tolerante a nulo E a data inválida.
//
// As datas de assinatura passaram a poder vir nulas do backend — o vitalício
// manda `nextRenewal: null` de propósito, porque não existe próxima renovação.
// Chamar toLocaleDateString direto num campo que pode ser null é uma tela
// branca esperando acontecer, e trocar "data errada" por "app quebrado" seria
// piorar. Travessão é o pior caso aceitável.
//
// O `paraData` aqui é a última barreira, não a primeira: quem monta o estado já
// filtra. Ele existe porque a barreira anterior já falhou uma vez em produção.
function dataLonga(d) {
  const data = paraData(d);
  if (!data) return '—';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Rótulo da linha "Forma de Pagamento". Sem `store`, não dá para nomear a loja.
// Sufixo do valor no rótulo do plano. Antes era "/mês" fixo, o que rotulava
// TODO assinante anual como mensal — inclusive quem paga R$ 499/ano.
//
// null cai em "/mês", que é o comportamento de sempre: sem resposta da consulta
// externa não há motivo para trocar o rótulo por outro palpite.
function sufixoDoPeriodo(interval) {
  if (interval === 'year') return '/ano';
  return '/mês';
}

function rotuloDaFormaDePagamento(paymentMethod, store) {
  if (paymentMethod !== 'APP_STORE_SUBSCRIPTION') return paymentMethod;
  if (store === 'APP_STORE') return 'App Store';
  if (store === 'PLAY_STORE') return 'Google Play';
  return 'App Store / Google Play';
}

export default function Profile() {
  const [user, setUser] = useState(null);
  const [streakDays, setStreakDays] = useState(0);
  // O estado `stats` saiu junto com o painel de estatísticas: nada na tela lia
  // mais totalAttempts/accuracy/completedModules.
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    specialty: "",
    state: "",
    city: ""
  });
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  // Falhou ao carregar o plano. Estado PRÓPRIO, e não um subscriptionInfo
  // qualquer: a tela precisa poder dizer "não consegui" em vez de preencher
  // o vazio com números plausíveis.
  const [subscriptionErro, setSubscriptionErro] = useState(false);
  const [recarregandoPlano, setRecarregandoPlano] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const isRefreshing = usePullToRefresh(loadData, containerRef);

  async function loadData() {
    const userData = await getCurrentUser();
    setUser(userData);
    
    setFormData({
      full_name: userData.full_name || "",
      specialty: userData.specialty || "",
      state: userData.state || "",
      city: userData.city || ""
    });

    // Antes daqui saíam cinco round-trips em fila, e dois deles eram a MESMA
    // consulta: calculateStreakDays pede as tentativas do usuário e o
    // getMyQuizAttempts logo abaixo pedia de novo. O que consumia a segunda
    // cópia — o bloco de estatísticas e a contagem de módulos completos, que
    // ainda varria Phase.list inteira — saiu da tela; sobrou o streak.
    //
    // O que restou não depende um do outro e agora vai junto.
    const isPremium = userData.subscription_type === 'premium';
    if (!isPremium) {
      setSubscriptionInfo(null);
      setSubscriptionErro(false);
    }

    const [streak, userAchievements] = await Promise.all([
      calculateStreakDays(userData.email),
      loadUserAchievements(userData),
      isPremium ? loadSubscriptionInfo(userData) : null,
    ]);

    setStreakDays(streak);
    setAchievements(userAchievements);
  };

  // Monta o card de assinatura da tela.
  //
  // Recebe a conta POR PARÂMETRO. Ler o state `user` aqui não funcionava: o
  // loadData chama isto no mesmo tick do setUser, então o closure ainda enxerga
  // o valor anterior (null, no primeiro carregamento). Era daí que saíam as
  // duas "Invalid Date" — `new Date(undefined)`.
  const loadSubscriptionInfo = async (conta) => {
    // VITALÍCIO NÃO DEPENDE DESTA FUNCTION.
    //
    // `lifetime_access` é a fonte da verdade do invariante (ver ARQUITETURA_AUTH
    // §5.8) e já veio na Account que o getCurrentUser carregou — a tela não
    // precisa de rede nenhuma para saber que esta pessoa comprou acesso
    // permanente. Desenhar o card agora, antes da chamada, é o que garante que
    // uma falha do getUserSubscriptionInfo (401, 429, timeout) não volte a
    // exibir o comprador de vitalício como assinante mensal.
    //
    // A chamada continua acontecendo, mas só para ENRIQUECER: valor pago e data
    // da compra saem do Payment, que a Account não tem.
    const vitalicio = conta?.lifetime_access === true;
    if (vitalicio) {
      setSubscriptionInfo({
        lifetime: true,
        // null = ainda não sabemos quanto foi pago. A tela omite o valor em vez
        // de chutar R$400: o preço do vitalício já mudou uma vez, e um número
        // errado aqui é pior que número nenhum.
        amount: null,
        lastRenewal: paraData(conta.subscription_start_date),
        nextRenewal: null,
        paymentMethod: 'LIFETIME',
        store: null,
        paymentId: null,
        willRenew: null
      });
    }

    setSubscriptionErro(false);

    try {
      const response = await base44.functions.invoke('getUserSubscriptionInfo', {});

      if (response?.data?.success && response.data.hasSubscription) {
        const info = response.data.subscriptionInfo;

        // Backend discordando da Account sobre o vitalício: a Account vence.
        // Não deveria acontecer (o backend lê a mesma flag), mas se acontecer,
        // rebaixar na tela quem pagou por acesso permanente é o erro caro.
        if (vitalicio && info.lifetime !== true) {
          console.warn('getUserSubscriptionInfo não reconheceu o vitalício; mantendo a Account');
          return;
        }

        setSubscriptionInfo({
          // Acesso vitalício: pagamento único, sem renovação. A tela ramifica
          // por isto antes de olhar qualquer outro campo.
          lifetime: info.lifetime === true,
          // Acesso de cortesia: premium com prazo, sem cobrança. Mesmo tipo de
          // discriminador do lifetime, e pela mesma razão — o bloco de
          // assinatura abaixo é todo sobre renovação e valor pago, e aqui não
          // existe nem uma coisa nem outra.
          trial: info.trial === true,
          trialEndsAt: paraData(info.trialEndsAt),
          amount: info.amount,
          // As datas podem vir nulas — o vitalício manda `nextRenewal: null`
          // de propósito. Sem esta guarda, `new Date(null)` vira 01/01/1970 e
          // a tela exibiria isso como se fosse uma data de verdade.
          lastRenewal: paraData(info.lastRenewal),
          nextRenewal: paraData(info.nextRenewal),
          paymentMethod: info.paymentMethod,
          // 'APP_STORE' | 'PLAY_STORE' | null. null quando o backend não soube
          // dizer a loja (ou é uma resposta anterior a este campo).
          store: info.store ?? null,
          paymentId: info.paymentId,
          // null quando o backend não sabe (Stripe/manual/RevenueCat fora do ar):
          // nesse caso a tela mantém o texto de renovação automática.
          willRenew: info.willRenew ?? null,
          // O ciclo pago já acabou, segundo a loja ou o Stripe. Diferente de
          // `willRenew: false`, que é "acaba em tal dia" — aqui já acabou.
          // Ausente vira false: resposta antiga do backend não afirma o fim.
          expired: info.expired === true,
          // 'month' | 'year' | null. Este objeto é montado CAMPO A CAMPO, não
          // por spread: campo novo no backend que não for copiado aqui chega na
          // tela como undefined e cai no fallback sem erro nenhum — foi o que
          // aconteceu com este, que ficou exibindo "/mês" num plano anual.
          interval: info.interval ?? null
        });
        return;
      }

      // Resposta veio, mas sem assinatura para mostrar. NÃO inventar uma.
      if (!vitalicio) setSubscriptionErro(true);
    } catch (error) {
      console.error('Error loading subscription info:', error);
      // NADA DE FALLBACK INVENTADO.
      //
      // Aqui existiam dois blocos que, diante de qualquer falha, montavam uma
      // assinatura "Manual de R$10,00/mês" com datas tiradas de um state vazio.
      // Um comprador do vitalício viu, um minuto depois de pagar R$400, o
      // Perfil anunciar cobrança recorrente de R$10 e mandá-lo falar com o
      // suporte. Falha de rede tem que aparecer como falha de rede.
      if (!vitalicio) setSubscriptionErro(true);
    }
  };

  // Tentar de novo, a partir da conta que a tela já tem em mãos.
  const recarregarPlano = async () => {
    setRecarregandoPlano(true);
    try {
      await loadSubscriptionInfo(user);
    } finally {
      setRecarregandoPlano(false);
    }
  };

  const handleSaveProfile = async () => {
    // base44.auth.updateMe escrevia no User pela sessão hospedada — não existe
    // mais sob JWT, e o registro do usuário agora é a Account.
    await base44.functions.invoke('updateMyProfile', formData);
    await refreshCurrentUser();
    setIsEditing(false);
    await loadData();
  };

  const handleCancelSubscription = async () => {
    setCancelling(true);
    setCancelError(null);

    try {
      const response = await base44.functions.invoke('cancelStripeSubscription', {});

      if (response.data.success) {
        setCancelSuccess(true);
        setShowCancelDialog(false);
        
        setTimeout(async () => {
          await loadData();
          setCancelSuccess(false);
        }, 3000);
      } else {
        setCancelError(response.data.error || 'Erro ao cancelar assinatura');
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      setCancelError(error.message || 'Erro ao cancelar assinatura. Tente novamente.');
    } finally {
      setCancelling(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);

    try {
      const response = await base44.functions.invoke('deleteUserAccount', {});

      if (response.data.success) {
        // A conta foi apagada: o token nosso aponta para uma Account que nao
        // existe mais. Deixa-lo no cofre faria a proxima abertura tentar
        // restaurar uma sessao morta.
        clearToken();
        await base44.auth.logout();
      } else {
        setDeleteError(response.data.error || 'Erro ao deletar conta');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      setDeleteError(error.message || 'Erro ao deletar conta. Tente novamente.');
    } finally {
      setDeleting(false);
    }
  };

  const isPremium = user?.subscription_type === "premium";
  // O ciclo pago ACABOU — a loja (ou o Stripe) já encerrou a assinatura.
  //
  // Vem antes da `assinaturaCancelada` e tem precedência sobre ela em toda a
  // tela: uma assinatura encerrada é também uma que não renova, então as duas
  // são verdadeiras ao mesmo tempo e só uma pode falar. Dizer "você continua
  // com acesso até 29 de agosto" em setembro é a mensagem errada com a data
  // certa.
  //
  // Esta tela ainda pode ser vista com o acesso encerrado: o rebaixamento
  // depende de o RevenueCat CONFIRMAR o fim (ver INVARIANTE store_expires_at no
  // getMyAccount), e quando ele não confirma — id do aparelho não resolvido,
  // API fora do ar — o premium continua de propósito. Nesses casos a tela é o
  // único lugar onde a verdade aparece.
  const assinaturaEncerrada = subscriptionInfo?.expired === true;
  // Cancelada na loja mas ainda dentro do período pago: o acesso continua até a
  // data de expiração, e é justamente isso que a tela precisa dizer.
  const assinaturaCancelada = subscriptionInfo?.willRenew === false && !assinaturaEncerrada;

  const nextLevelPoints = (user?.level || 1) * 100;
  const currentLevelProgress = ((user?.points || 0) % 100);

  return (
    <div ref={containerRef} className="min-h-screen p-6 md:p-8 relative">
      {isRefreshing && (
        <div className="flex justify-center py-3 absolute top-0 left-0 right-0 z-50">
          <Loader2 className="animate-spin text-gray-400 w-6 h-6" />
        </div>
      )}
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Cancel Success Alert */}
        {cancelSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <AlertDescription className="text-green-900 ml-2">
                <strong>Assinatura cancelada com sucesso!</strong>
                <p className="text-sm mt-1">Você foi retornado ao plano gratuito. Você ainda pode acessar os quizzes aleatórios.</p>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Header */}
        <div className="text-center">
          <div className="w-24 h-24 bg-[#0D3B66] rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-4xl font-bold">
              {user?.full_name?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {user?.full_name || 'Usuário'}
          </h1>
          <p className="text-gray-600">{user?.email}</p>
          {user?.specialty && (
            <p className="text-blue-600 font-medium mt-1">{user.specialty}</p>
          )}
          {user?.city && user?.state && (
            <p className="text-gray-500 text-sm mt-1">
              {user.city}, {user.state}
            </p>
          )}
          <Badge className={`mt-3 ${isPremium ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gray-500'}`}>
            {isPremium ? (
              <span className="flex items-center gap-1">
                <Crown className="w-3 h-3" />
                Premium
              </span>
            ) : 'Gratuito'}
          </Badge>
          <div className="mt-5">
            <Button
              variant="outline"
              onClick={() => { clearToken(); base44.auth.logout("/"); }}
              className="gap-2 border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              <LogOut className="w-4 h-4" />
              Sair da Conta
            </Button>
          </div>

        </div>

        {/* Subscription Info - Only for Premium Users */}
        {isPremium && (
          <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-6 h-6 text-amber-600" />
                {/* "Assinatura" está errado para quem comprou o vitalício e
                    para quem está em cortesia: nenhum dos dois tem assinatura
                    nenhuma no registro. */}
                {subscriptionInfo?.lifetime
                  ? 'Informações do Plano'
                  : subscriptionInfo?.trial
                    ? 'Seu Acesso de Cortesia'
                    : 'Informações da Assinatura'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {subscriptionInfo ? (subscriptionInfo.lifetime ? (
                /* ACESSO VITALÍCIO — layout próprio.
                   Não dá para reaproveitar o bloco de assinatura abaixo
                   trocando rótulos: metade dele é sobre renovação, e aqui não
                   existe renovação nenhuma. "Próxima Renovação", "Renovação
                   Automática" e o aviso de cancelar pela loja não têm
                   equivalente vitalício — eles simplesmente não vão à tela. */
                <>
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Plano Atual</p>
                      <p className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Crown className="w-5 h-5 text-amber-600" />
                        Acesso Vitalício
                      </p>
                    </div>
                    {/* Só entra na tela quando o valor é CONHECIDO. Ele vem
                        do Payment, via getUserSubscriptionInfo; quando o card é
                        desenhado a partir da Account (function fora do ar, ou
                        ainda respondendo), não existe valor para mostrar — e um
                        R$400 chutado seria errado para quem pagou outro preço. */}
                    {subscriptionInfo.amount != null && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Valor Pago</p>
                        <p className="text-lg font-medium text-gray-900">
                          R$ {subscriptionInfo.amount.toFixed(2).replace('.', ',')}
                          <span className="text-sm text-gray-600"> — pagamento único</span>
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Data da Compra</p>
                      <p className="text-lg font-medium text-gray-900">
                        {dataLonga(subscriptionInfo.lastRenewal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Validade</p>
                      <p className="text-lg font-medium text-green-700">Permanente</p>
                    </div>
                  </div>

                  <Alert className="bg-green-50 border-green-200">
                    <Crown className="w-5 h-5 text-green-600" />
                    <AlertDescription className="text-green-900 ml-2">
                      <strong>Acesso permanente:</strong> você fez um pagamento único e
                      seu acesso não expira. Não há renovação, não há cobrança
                      recorrente e não há nada para cancelar.
                    </AlertDescription>
                  </Alert>
                </>
              ) : subscriptionInfo.trial ? (
                /* ACESSO DE CORTESIA — layout próprio, pela mesma razão do
                   vitalício: o bloco de assinatura abaixo é quase todo sobre
                   renovação, valor pago e cancelamento, e aqui não existe
                   nenhum dos três. Reaproveitá-lo trocando rótulos anunciaria
                   uma cobrança de R$59/mês que ninguém fez, e mandaria o
                   usuário ao suporte para cancelar o que não existe.

                   O que esta tela precisa dizer é uma coisa só, e é o oposto de
                   tranquilizar: o acesso tem data para acabar, e assinar é o
                   que o mantém. */
                <>
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Plano Atual</p>
                      <p className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-emerald-600" />
                        Premium de cortesia
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Válido até</p>
                      <p className="text-lg font-bold text-emerald-700">
                        {dataLonga(subscriptionInfo.trialEndsAt)}
                      </p>
                    </div>
                  </div>

                  <Alert className="bg-emerald-50 border-emerald-200 mb-4">
                    <Clock className="w-5 h-5 text-emerald-600" />
                    <AlertDescription className="text-emerald-900 ml-2">
                      <strong>Acesso liberado por cortesia:</strong> você tem o Premium completo
                      até {dataLonga(subscriptionInfo.trialEndsAt)}, sem nenhuma cobrança e sem
                      renovação automática. Depois dessa data sua conta volta ao plano gratuito —
                      seu progresso, seus pontos e suas conquistas continuam salvos.
                    </AlertDescription>
                  </Alert>

                  <Link to={createPageUrl("Upgrade")}>
                    <Button className="w-full bg-amber-600 hover:bg-amber-700">
                      <Crown className="w-4 h-4 mr-2" />
                      Assinar e manter o acesso
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Plano Atual</p>
                      <p className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Crown className="w-5 h-5 text-amber-600" />
                        {/* Sem valor conhecido, "Premium" seco. `amount` passou
                            a poder ser null desde que a tela deixou de inventar
                            preço quando não sabe qual foi. */}
                        {subscriptionInfo.amount != null
                          ? `Premium - R$ ${subscriptionInfo.amount.toFixed(2).replace('.', ',')}${sufixoDoPeriodo(subscriptionInfo.interval)}`
                          : 'Premium'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Última Renovação</p>
                      <p className="text-lg font-medium text-gray-900">
                        {dataLonga(subscriptionInfo.lastRenewal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">
                        {assinaturaEncerrada
                          ? 'Acesso Premium encerrado em'
                          : assinaturaCancelada ? 'Acesso Premium até' : 'Próxima Renovação'}
                      </p>
                      <p className={`text-lg font-medium ${assinaturaEncerrada || assinaturaCancelada ? 'text-red-600' : 'text-gray-900'}`}>
                        {dataLonga(subscriptionInfo.nextRenewal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Forma de Pagamento</p>
                      <p className="text-lg font-medium text-gray-900">
                        {rotuloDaFormaDePagamento(subscriptionInfo.paymentMethod, subscriptionInfo.store)}
                      </p>
                    </div>
                  </div>

                  {assinaturaEncerrada ? (
                    <Alert className="bg-red-50 border-red-200 mb-4">
                      <XCircle className="w-5 h-5 text-red-600" />
                      <AlertDescription className="text-red-900 ml-2">
                        <strong>Assinatura encerrada:</strong> ela terminou em{' '}
                        {dataLonga(subscriptionInfo.nextRenewal)}
                        {' '}e não foi renovada. Para voltar a ter acesso Premium, é preciso
                        assinar de novo.
                      </AlertDescription>
                    </Alert>
                  ) : assinaturaCancelada ? (
                    <Alert className="bg-red-50 border-red-200 mb-4">
                      <XCircle className="w-5 h-5 text-red-600" />
                      <AlertDescription className="text-red-900 ml-2">
                        <strong>Assinatura cancelada:</strong> a renovação automática foi desligada.
                        Você continua com acesso Premium até{' '}
                        {dataLonga(subscriptionInfo.nextRenewal)}
                        . Depois dessa data sua conta volta para o plano gratuito.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert className="bg-blue-50 border-blue-200 mb-4">
                      <AlertCircle className="w-5 h-5 text-blue-600" />
                      <AlertDescription className="text-blue-900 ml-2">
                        <strong>Renovação Automática:</strong> Sua assinatura será renovada
                        automaticamente {subscriptionInfo.interval === 'year' ? 'todo ano' : 'todo mês'}.
                        Você pode cancelar a qualquer momento sem multas.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* !assinaturaCancelada: até agora o willRenew do Stripe era
                      sempre null, então o alerta vermelho nunca aparecia neste
                      ramo e o botão podia ficar incondicional. Agora que o
                      getUserSubscriptionInfo consulta o Stripe de verdade, os
                      dois apareceriam juntos — "sua assinatura está cancelada" e
                      "cancelar assinatura" na mesma tela. */}
                  {subscriptionInfo.paymentMethod === 'Stripe' && subscriptionInfo.paymentId && !assinaturaCancelada && !assinaturaEncerrada && (
                    <Button
                      variant="outline"
                      className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setShowCancelDialog(true)}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancelar Assinatura
                    </Button>
                  )}

                  {subscriptionInfo.paymentMethod === 'APP_STORE_SUBSCRIPTION' ? (
                    <Alert className="bg-blue-50 border-blue-200">
                      <AlertCircle className="w-5 h-5 text-blue-600" />
                      <AlertDescription className="text-blue-900">
                        {/* paymentMethod === 'APP_STORE_SUBSCRIPTION' significa
                            "compra de loja", não "Apple": é o discriminador
                            legado, mantido para não jogar cliente em cache no
                            ramo 'Manual'. Quem diz a loja é `store`. */}
                        {instrucaoDaLoja(subscriptionInfo.store, assinaturaCancelada, assinaturaEncerrada)}
                      </AlertDescription>
                    </Alert>
                  ) : (subscriptionInfo.paymentMethod === 'Manual' || !subscriptionInfo.paymentId) && (
                    <Alert className="bg-amber-50 border-amber-200">
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                      <AlertDescription className="text-amber-900">
                        Esta assinatura foi ativada manualmente. Entre em contato com o suporte para cancelamento.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )) : subscriptionErro ? (
                /* FALHA HONESTA. O que havia aqui antes era pior que uma tela de
                   erro: diante de qualquer falha a tela montava uma assinatura
                   "Manual de R$10,00/mês" com datas inválidas e mandava o
                   usuário ao suporte. Seu acesso não depende desta caixa — só a
                   informação sobre ele depende, e é só isso que o texto promete. */
                <div className="text-center py-6">
                  <AlertCircle className="w-8 h-8 text-amber-600 mx-auto mb-3" />
                  <p className="text-gray-900 font-medium mb-1">
                    Não foi possível carregar as informações do seu plano.
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    Seu acesso Premium continua ativo normalmente.
                  </p>
                  <Button
                    variant="outline"
                    onClick={recarregarPlano}
                    disabled={recarregandoPlano}
                    className="border-amber-300 text-amber-800 hover:bg-amber-100"
                  >
                    {recarregandoPlano ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Tentando...</>
                    ) : 'Tentar de novo'}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-600 mx-auto mb-4" />
                  <p className="text-gray-600">Carregando informações da assinatura...</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Edit Profile Section */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Informações do Perfil</CardTitle>
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} variant="outline">
                  Editar Perfil
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => setIsEditing(false)} variant="outline">
                    Cancelar
                  </Button>
                  <Button onClick={handleSaveProfile} className="bg-[#1976D2] hover:bg-[#0D3B66]">
                    Salvar
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nome Completo</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="specialty">Especialidade</Label>
                  <Input
                    id="specialty"
                    value={formData.specialty}
                    onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Nome Completo</p>
                  <p className="text-lg font-medium text-gray-900">{user?.full_name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Especialidade</p>
                  <p className="text-lg font-medium text-gray-900">{user?.specialty || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Estado</p>
                  <p className="text-lg font-medium text-gray-900">{user?.state || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Cidade</p>
                  <p className="text-lg font-medium text-gray-900">{user?.city || '-'}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>



        {/* Badges */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-6 h-6 text-blue-600" />
              Conquistas ({achievements.filter(b => b.earned).length}/{achievements.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {achievements.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {achievements.map((achievement, index) => (
                  <motion.div
                    key={achievement.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className={`p-4 rounded-xl text-center transition-all duration-300 ${
                      achievement.earned 
                        ? 'bg-blue-50 border-2 border-blue-200 shadow-md' 
                        : 'bg-gray-100 opacity-50'
                    }`}
                  >
                    <div className="text-4xl mb-2">{achievement.icon}</div>
                    <p className={`text-sm font-semibold mb-1 ${achievement.earned ? 'text-gray-900' : 'text-gray-500'}`}>
                      {achievement.name}
                    </p>
                    <p className="text-xs text-gray-600">{achievement.description}</p>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Nenhuma conquista cadastrada ainda
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notificações */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-6 h-6 text-blue-600" />
              Notificações Push
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Receba lembretes e novidades diretamente no seu celular ou computador.
            </p>
            <EnableNotifications />
          </CardContent>
        </Card>

        {/* Streak */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              Sequência de Dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-6xl mb-4">🔥</div>
              <p className="text-4xl font-bold text-gray-900 mb-2">
                {streakDays} dias
              </p>
              <p className="text-gray-600">
                Continue praticando para manter sua sequência!
              </p>
            </div>
          </CardContent>
        </Card>

        {/* "Estatísticas Detalhadas" removido junto com os demais blocos de
            estatística do app: os números não fecham com a realidade e a
            correção não é prioridade agora. */}

        {/* Danger Zone */}
        <Card className="border-red-200 bg-red-50/30 shadow-lg">
          <CardHeader>
            <CardTitle className="text-red-600">Zona de Perigo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-700 mb-3">
                  Deletar sua conta é uma ação permanente e não pode ser desfeita. 
                  Todos os seus dados, progresso e conquistas serão perdidos.
                </p>
                <Button
                  variant="outline"
                  className="w-full border-red-300 text-red-600 hover:bg-red-100 hover:text-red-700"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Deletar Minha Conta
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center pt-2">
          <div className="flex items-center justify-center gap-2 text-sm">
            <Link
              to="/suporte"
              className="inline-flex items-center gap-1.5 text-gray-500 hover:text-ecg-midnight transition-colors"
            >
              Suporte
            </Link>
            <span className="text-gray-300">•</span>
            <Link
              to="/privacidade"
              className="inline-flex items-center gap-1.5 text-gray-500 hover:text-ecg-midnight transition-colors"
            >
              Política de Privacidade
            </Link>
            <span className="text-gray-300">•</span>
            <Link
              to="/termos"
              className="inline-flex items-center gap-1.5 text-gray-500 hover:text-ecg-midnight transition-colors"
            >
              Termos de Uso
            </Link>
          </div>
        </div>
      </div>

      {/* Cancel Subscription Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Cancelar Assinatura Premium?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Tem certeza que deseja cancelar sua assinatura Premium?</p>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="font-semibold text-amber-900 mb-2">O que você vai perder:</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-amber-800">
                  <li>Acesso aos módulos estruturados</li>
                  <li>Acesso à teoria antes de cada fase</li>
                  <li>Análise de desempenho detalhada</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="font-semibold text-blue-900 mb-2">Você ainda terá:</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
                  <li>Acesso aos quizzes aleatórios</li>
                  <li>Casos básicos de ECG</li>
                  <li>Pontuação básica</li>
                </ul>
              </div>

              {cancelError && (
                <Alert className="bg-red-50 border-red-200">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <AlertDescription className="text-red-900 ml-2">
                    {cancelError}
                  </AlertDescription>
                </Alert>
              )}

              <p className="text-sm text-gray-600">
                Após o cancelamento, você continuará com acesso Premium até o fim do período já pago.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>
              Manter Premium
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelando...
                </>
              ) : (
                'Sim, Cancelar Assinatura'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Deletar Conta Permanentemente?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-semibold text-gray-900">
                Esta ação é IRREVERSÍVEL e não pode ser desfeita!
              </p>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="font-semibold text-red-900 mb-2">O que será deletado:</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-red-800">
                  <li>Seus dados pessoais e de perfil</li>
                  <li>Seu histórico de tentativas e estatísticas diárias</li>
                  <li>Suas conquistas e troféus</li>
                  <li>Seu progresso nos módulos, pontuação e nível</li>
                  <li>Suas notificações e registros de pagamento</li>
                </ul>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="font-semibold text-amber-900 mb-2">Sobre sua assinatura:</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-amber-800">
                  <li>
                    Assinatura pela web (Stripe): será cancelada automaticamente
                    durante a exclusão.
                  </li>
                  <li>
                    Assinatura pela App Store ou Google Play: cancele-a primeiro
                    na loja — não conseguimos cancelar por você. Enquanto estiver
                    ativa, a exclusão da conta ficará bloqueada.
                  </li>
                </ul>
              </div>

              {deleteError && (
                <Alert className="bg-red-50 border-red-200">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <AlertDescription className="text-red-900 ml-2">
                    {deleteError}
                  </AlertDescription>
                </Alert>
              )}

              <p className="text-sm text-gray-600">
                Você precisará criar uma nova conta se quiser usar o PlayECG novamente.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deletando...
                </>
              ) : (
                'Sim, Deletar Permanentemente'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FaleConoscoButton />
    </div>
  );
}