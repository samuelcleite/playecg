import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ECGCase } from "@/entities/ECGCase";
import { getCurrentUser, clearCurrentUserCache } from '@/lib/currentUser';
import { comTimeout, descreverErro, detalheTecnico } from '@/lib/carregamento';
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Heart,
  Pencil,
  AlertTriangle,
  Lock,
  AlertCircle,
  BookOpen,
  Trophy
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { triggerAchievementCheck } from "@/components/AchievementChecker";
import AchievementToast from "@/components/AchievementToast";
import CaseQuestion, { AcaoDoCaso } from "@/components/caso/CaseQuestion";
import CaseResult from "@/components/caso/CaseResult";
import EcgZoomDialog from "@/components/caso/EcgZoomDialog";
import ReportarErroDialog from "@/components/caso/ReportarErroDialog";
import TelaDeAviso, { QuadroAviso } from "@/components/caso/TelaDeAviso";
import { BotaoPrincipal, BotaoSecundario } from "@/components/BarraDeAcao";
import { MAX_TENTATIVAS, respostasCorretas, acertou, alternar, alternativasDe, marcarRespostas } from "@/lib/caso";
import { useRolarAoTopo } from "@/lib/rolagem";

const FREE_DAILY_LIMIT = 5;
const FREE_HOURLY_LIMIT = 1; // 1 questão por hora após esgotar as 5 diárias

export default function Quiz() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [currentCase, setCurrentCase] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [loading, setLoading] = useState(true);
  // Mesmo defeito que travava o ModuleDetail: sem isto, qualquer falha no
  // carregamento deixava "Carregando caso..." na tela para sempre.
  const [loadError, setLoadError] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [attemptedCaseIds, setAttemptedCaseIds] = useState([]);
  const [allCasesCompleted, setAllCasesCompleted] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [dailyQuizCount, setDailyQuizCount] = useState(0);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);
  const [nextAvailableTime, setNextAvailableTime] = useState(null); // quando pode fazer a próxima questão
  const [lastAttemptTime, setLastAttemptTime] = useState(null); // hora da última tentativa

  // Diálogos de reportar erro e de zoom: o estado de cada um mora no próprio
  // componente (ReportarErroDialog, EcgZoomDialog); aqui só abre e fecha.
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showZoom, setShowZoom] = useState(false);

  // Content suggestion states
  const [showContentSuggestionDialog, setShowContentSuggestionDialog] = useState(false);
  const [suggestedModuleId, setSuggestedModuleId] = useState(null);
  const [suggestedPhaseId, setSuggestedPhaseId] = useState(null);

  // Content state
  const [caseContent, setCaseContent] = useState(null);

  // O que o recordQuizAttempt devolveu, para os números da tela de resultado.
  // { pendente: true } enquanto a resposta não chega; null se falhou.
  const [registro, setRegistro] = useState(null);

  // Novos troféus conquistados (para notificação)
  const [newAchievements, setNewAchievements] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  // Pergunta e resultado trocam a tela inteira: cada troca volta ao topo, senão
  // o resultado abre rolado até onde estava o VERIFICAR.
  const casoFinalizado = showResult && (isCorrect || showCorrectAnswer);
  useRolarAoTopo(`${currentCase?.id}-${casoFinalizado}`);

  // O dia do limite é o de BRASÍLIA, não o local do aparelho.
  //
  // Quem aplica o limite agora é o recordQuizAttempt, e lá o dia é o de
  // Brasília — o mesmo que a sequência de dias já usava. Se esta tela
  // continuasse cortando à meia-noite local, quem estuda fora do Brasil veria
  // "5 disponíveis" logo depois da própria meia-noite e tomaria recusa do
  // servidor na primeira questão. Um fuso só, nos dois lados.
  const diaBrasilia = (d) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);

  // O instante em que o dia de Brasília começou, para pedir ao servidor só as
  // tentativas de hoje. Subtrai do agora o quanto do dia já passou lá.
  const inicioDoDiaBrasilia = () => {
    const agora = new Date();
    const [h, m, s] = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    })
      .format(agora)
      .split(":")
      .map(Number);
    const decorridoMs = (((h % 24) * 60 + m) * 60 + s) * 1000 + agora.getMilliseconds();
    return new Date(agora.getTime() - decorridoMs);
  };

  const checkFreeLimit = (todayAttempts) => {
    // Ordenar tentativas por data
    const sorted = [...todayAttempts].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    const uniqueCasesMap = new Map();
    for (const attempt of sorted) {
      if (!uniqueCasesMap.has(attempt.case_id)) {
        uniqueCasesMap.set(attempt.case_id, new Date(attempt.created_date));
      }
    }
    const uniqueCases = [...uniqueCasesMap.values()].sort((a, b) => a - b);
    const count = uniqueCases.length;

    if (count < FREE_DAILY_LIMIT) {
      // Ainda tem questões diárias disponíveis
      return { limited: false, count };
    }

    // Esgotou as 5 diárias — verificar regra de 1 por hora
    // A hora de "recarga" começa a partir da 5ª questão concluída
    const fifthCaseTime = uniqueCases[FREE_DAILY_LIMIT - 1];
    const now = new Date();

    // Quantas horas completas se passaram desde a 5ª questão?
    const hoursElapsed = Math.floor((now - fifthCaseTime) / (1000 * 60 * 60));

    // Questões extras disponíveis = horas completas decorridas
    const extraAllowed = hoursElapsed;
    const extraUsed = count - FREE_DAILY_LIMIT;

    if (extraUsed < extraAllowed) {
      // Ainda tem crédito horário disponível
      return { limited: false, count };
    }

    // Limite atingido — calcular quando pode fazer a próxima
    const nextTime = new Date(fifthCaseTime.getTime() + (extraUsed + 1) * 60 * 60 * 1000);
    return { limited: true, count, nextAvailableTime: nextTime, fifthCaseTime };
  };

  const loadData = async () => {
    try {
      setLoadError(null);
      await executarCarga();
    } catch (error) {
      console.error('Quiz: falha ao carregar', error);
      setLoadError(error);
      setLoading(false);
    }
  };

  const executarCarga = async () => {
    const userData = await comTimeout(getCurrentUser(), undefined, 'sua conta');
    if (!userData) {
      const erro = new Error('Não foi possível carregar sua conta.');
      erro.code = 'sem_conta';
      throw erro;
    }
    setUser(userData);

    // Casos, e — só para o gratuito — as tentativas de HOJE para o contador.
    //
    // O histórico inteiro não entra mais: os casos já tentados vêm da própria
    // Account (attempted_case_ids, mantidos pelo recordQuizAttempt), e baixar
    // tudo a cada carregamento era a leitura mais cara do app para quem
    // pratica muito — uma das que estouravam o limite de volume do Base44.
    //
    // A conta do dia é só para EXIBIR o contador e abrir a tela de limite sem
    // uma ida a mais ao servidor. Quem recusa de verdade é o recordQuizAttempt
    // — por isso o recorte usa o mesmo fuso que ele usa.
    const [allCases, resHoje] = await Promise.all([
      comTimeout(ECGCase.list(), undefined, 'casos de ECG'),
      userData.subscription_type !== "premium"
        ? comTimeout(
            base44.functions.invoke('getMyQuizAttempts', {
              since: inicioDoDiaBrasilia().toISOString()
            }),
            undefined,
            'suas tentativas'
          )
        : null,
    ]);

    if (userData.subscription_type !== "premium") {
      const todayAttempts = resHoje?.data?.attempts || [];
      const result = checkFreeLimit(todayAttempts);
      setDailyQuizCount(result.count);

      if (result.limited) {
        setNextAvailableTime(result.nextAvailableTime);
        // Guardar hora da última tentativa (5ª questão)
        setLastAttemptTime(result.fifthCaseTime);
        setDailyLimitReached(true);
        setLoading(false);
        return;
      }
    }

    const attemptedIds = Array.isArray(userData.attempted_case_ids)
      ? userData.attempted_case_ids
      : [];
    setAttemptedCaseIds(attemptedIds);

    // Se veio da página de conteúdo com um case_id específico, carregar esse caso
    const urlParams = new URLSearchParams(window.location.search);
    const returnCaseId = urlParams.get('case_id');
    if (returnCaseId) {
      const targetCase = allCases.find(c => c.id === returnCaseId);
      if (targetCase) {
        setCurrentCase(targetCase);
        setStartTime(Date.now());
        if (targetCase.module_id && targetCase.phase_id) {
          const contents = await base44.entities.Content.filter({
            module_id: targetCase.module_id,
            phase_id: targetCase.phase_id
          });
          setCaseContent(contents?.[0] || null);
        }
        setLoading(false);
        return;
      }
    }

    // Reaproveitar os casos já carregados para evitar um segundo ECGCase.list()
    await loadNextCase(attemptedIds, allCases);
  };

  // Casca própria porque os botões de "próxima questão" chamam isto direto, sem
  // await e sem catch: uma falha aqui escapava como rejeição não tratada com o
  // setLoading(true) da primeira linha já aplicado — spinner eterno de novo.
  const loadNextCase = async (attemptedIds = attemptedCaseIds, prefetchedCases = null) => {
    try {
      setLoadError(null);
      await carregarProximoCaso(attemptedIds, prefetchedCases);
    } catch (error) {
      console.error('Quiz: falha ao carregar o próximo caso', error);
      setLoadError(error);
      setLoading(false);
    }
  };

  const carregarProximoCaso = async (attemptedIds, prefetchedCases) => {
    setLoading(true);
    setSelectedAnswers([]);
    setShowResult(false);
    setAllCasesCompleted(false);
    setAttemptCount(0);
    setShowCorrectAnswer(false);
    setCaseContent(null);
    setRegistro(null);

    const allCases = prefetchedCases || await comTimeout(ECGCase.list(), undefined, 'casos de ECG');
    const unansweredCases = allCases.filter(c => !attemptedIds.includes(c.id));

    if (unansweredCases.length > 0) {
      const randomCase = unansweredCases[Math.floor(Math.random() * unansweredCases.length)];
      setCurrentCase(randomCase);
      setStartTime(Date.now());
      
      // Buscar conteúdo se o caso tiver módulo e fase
      if (randomCase.module_id && randomCase.phase_id) {
        const contents = await base44.entities.Content.filter({
          module_id: randomCase.module_id,
          phase_id: randomCase.phase_id
        });
        setCaseContent(contents?.[0] || null);
      }
    } else if (allCases.length > 0) {
      setAllCasesCompleted(true);
      setCurrentCase(null);
    } else {
      setCurrentCase(null);
    }
    
    setLoading(false);
  };

  const handleAnswerToggle = (answer) => {
    if (showResult) return;
    setSelectedAnswers(sel => alternar(currentCase, sel, answer));
  };

  const handleSubmitAnswer = async () => {
    if (selectedAnswers.length === 0) return;

    const correct = acertou(currentCase, selectedAnswers);

    setIsCorrect(correct);
    setShowResult(true);

    const newAttemptCount = attemptCount + 1;
    setAttemptCount(newAttemptCount);

    // Mostrar resposta correta após 3 tentativas erradas
    if (!correct && newAttemptCount >= MAX_TENTATIVAS) {
      setShowCorrectAnswer(true);
    }

    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    // Se acertou ou já tentou 3 vezes, registrar no banco e adicionar à lista de respondidos
    if (correct || newAttemptCount >= MAX_TENTATIVAS) {
      let limiteDiario = null;
      setRegistro({ pendente: true });

      try {
        const resRegistro = await base44.functions.invoke('recordQuizAttempt', {
          case_id: currentCase.id,
          module_id: currentCase.module_id,
          phase_id: currentCase.phase_id,
          user_answer: selectedAnswers.join(", "),
          correct: correct,
          time_spent: timeSpent,
          quiz_type: "random"
        });
        // Estado do limite já calculado pelo servidor. É o que substitui a
        // segunda chamada que esta tela fazia a cada resposta só para recontar.
        limiteDiario = resRegistro?.data?.limite_diario || null;
        setRegistro({
          pontos: resRegistro?.data?.pontos_ganhos,
          sequencia: resRegistro?.data?.sequencia
        });
      } catch (error) {
        setRegistro(null);
        // 403 = o servidor recusou por limite diário. Em condição normal a tela
        // nem chega aqui: ela já teria bloqueado antes. Isto cobre o caso em que
        // as duas contas discordam — e, quando discordam, quem vale é a do
        // servidor. Recontamos para saber a que horas libera e mostramos a tela
        // de limite, em vez de deixar a resposta sumir em silêncio.
        if (error?.status === 403) {
          // A resposta NÃO foi gravada: nada de tela de resultado, vai direto
          // para a de limite.
          setShowResult(false);
          await recalcularLimiteDiario();
          return;
        }
        throw error;
      }

      // Verificar se o usuário errou 5 questões da mesma fase
      if (!correct && currentCase.module_id && currentCase.phase_id) {
        const resIncorretas = await base44.functions.invoke('getMyQuizAttempts', {
          module_id: currentCase.module_id,
          phase_id: currentCase.phase_id,
          correct: false
        });
        const incorrectAttemptsInPhase = resIncorretas?.data?.attempts || [];

        // Contar casos únicos errados nesta fase
        const uniqueIncorrectCases = new Set(incorrectAttemptsInPhase.map(attempt => attempt.case_id));

        if (uniqueIncorrectCases.size >= 5) {
          setShowContentSuggestionDialog(true);
          setSuggestedModuleId(currentCase.module_id);
          setSuggestedPhaseId(currentCase.phase_id);
        }
      }

      // Verificar novos troféus e notificar o usuário se ganhou algum
      triggerAchievementCheck().then((earned) => {
        if (earned && earned.length > 0) setNewAchievements(earned);
      });

      const updatedAttemptedIds = [...attemptedCaseIds, currentCase.id];
      setAttemptedCaseIds(updatedAttemptedIds);

      // Atualizar contador diário para usuários gratuitos.
      //
      // O número vem do servidor, que acabou de fazer essa conta para decidir
      // se aceitava a resposta. Antes esta tela disparava uma SEGUNDA chamada
      // (getMyQuizAttempts com `since`) a cada questão só para recontar o
      // mesmo — duas viagens em sequência por resposta, onde uma bastava.
      if (user.subscription_type !== "premium") {
        if (limiteDiario) {
          setDailyQuizCount(limiteDiario.feitos);
          if (limiteDiario.bloqueado) {
            setNextAvailableTime(limiteDiario.proxima_em ? new Date(limiteDiario.proxima_em) : null);
            setLastAttemptTime(limiteDiario.quinta_em ? new Date(limiteDiario.quinta_em) : null);
            setDailyLimitReached(true);
          }
        } else {
          // Resposta sem `limite_diario`: function ainda não publicada, ou a
          // conta virou premium no servidor entre o carregamento e agora. O
          // caminho antigo continua correto, só custa uma chamada a mais.
          await recalcularLimiteDiario();
        }
      }
    }
  };

  // Reconta o dia pelo servidor e aplica o resultado à tela. Só é usada nos dois
  // caminhos de exceção acima — no fluxo normal o recordQuizAttempt já devolve
  // essa conta pronta.
  const recalcularLimiteDiario = async () => {
    try {
      const resTodas = await base44.functions.invoke('getMyQuizAttempts', {
        since: inicioDoDiaBrasilia().toISOString()
      });
      const todayAttempts = resTodas?.data?.attempts || [];
      const result = checkFreeLimit(todayAttempts);
      setDailyQuizCount(result.count);
      if (result.limited) {
        setNextAvailableTime(result.nextAvailableTime);
        setLastAttemptTime(result.fifthCaseTime);
        setDailyLimitReached(true);
      }
    } catch (error) {
      console.error('Quiz: falha ao recontar o limite diário', error);
    }
  };

  const handleTryAgain = () => {
    setShowResult(false);
    setSelectedAnswers([]);
  };

  const handleResetProgress = async () => {
    setLoading(true);
    setAllCasesCompleted(false);
    setAttemptedCaseIds([]);
    await loadNextCase([]);
  };

  const isPremium = user?.subscription_type === "premium";

  if (loading) {
    return (
      <div className="font-nunito flex min-h-full items-center justify-center bg-[#F4F6F8] py-24">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-ecg-midnight-2" />
          <p className="text-sm font-bold text-[#6B7785]">Carregando caso...</p>
        </div>
      </div>
    );
  }

  // Precisa vir antes do bloco de limite diário e de tudo que depende de
  // `currentCase`: quando a carga falha, nada disso foi preenchido, e mostrar
  // "limite atingido" ou "acabaram os casos" seria mentira.
  if (loadError) {
    return (
      <TelaDeAviso
        Icone={AlertTriangle}
        tom="ambar"
        titulo="Não foi possível carregar o quiz"
        texto={descreverErro(loadError)}
        acoes={
          <>
            <BotaoPrincipal
              onClick={() => {
                clearCurrentUserCache();
                setLoading(true);
                loadData();
              }}
            >
              TENTAR NOVAMENTE
            </BotaoPrincipal>
            <BotaoSecundario to={createPageUrl("Dashboard")}>Voltar ao início</BotaoSecundario>
          </>
        }
        rodape={detalheTecnico(loadError)}
      />
    );
  }

  // Daily limit reached for free users
  //
  // Não quando o caso acabou de ser respondido: antes, responder o 5º caso do
  // dia trocava a tela pelo limite na hora, e a pessoa nunca via se tinha
  // acertado nem qual era a resposta. Agora o resultado aparece primeiro e o
  // botão dele é que leva ao limite (ver onContinuar abaixo).
  if (dailyLimitReached && !isPremium && !casoFinalizado) {
    const now = new Date();
    const minutesUntilNext = nextAvailableTime
      ? Math.max(0, Math.ceil((nextAvailableTime - now) / 60000))
      : null;
    const hoursUntilNext = minutesUntilNext !== null ? Math.floor(minutesUntilNext / 60) : null;
    const minsRemainder = minutesUntilNext !== null ? minutesUntilNext % 60 : null;

    const nextTimeFormatted = nextAvailableTime
      ? nextAvailableTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;

    const isHourlyPhase = dailyQuizCount >= FREE_DAILY_LIMIT;

    return (
      <TelaDeAviso
        Icone={Lock}
        tom="ambar"
        titulo={isHourlyPhase ? "Aguarde para a próxima questão" : "Limite diário atingido"}
        texto={
          <>
            {/* Era `questão` + sufixo `ões`, o que produzia "questãoões". */}
            Você realizou <strong className="text-ecg-midnight">{dailyQuizCount}</strong> {dailyQuizCount === 1 ? 'questão' : 'questões'} hoje.
            {isHourlyPhase
              ? " Continue aguardando ou assine o Premium para ter acesso ilimitado."
              : " Volte amanhã ou assine o Premium para ter acesso ilimitado."}
          </>
        }
        acoes={
          <>
            <BotaoPrincipal to={createPageUrl("Upgrade")}>ASSINAR O PREMIUM</BotaoPrincipal>
            <BotaoSecundario to={createPageUrl("Dashboard")}>Voltar ao início</BotaoSecundario>
          </>
        }
      >
        <div className="flex flex-col gap-2.5">
          {isHourlyPhase && nextTimeFormatted && (
            <QuadroAviso tom="ambar">
              <p className="font-extrabold">Próxima questão disponível às</p>
              <p className="mt-0.5 text-3xl font-black">{nextTimeFormatted}</p>
              {minutesUntilNext !== null && minutesUntilNext > 0 && (
                <p className="mt-0.5">
                  em {hoursUntilNext > 0 ? `${hoursUntilNext}h ` : ''}{minsRemainder}min
                </p>
              )}
            </QuadroAviso>
          )}
          <QuadroAviso tom="azul">
            <p className="mb-1 font-extrabold">Como funciona o plano gratuito</p>
            <ul className="list-disc pl-5">
              <li><strong>{FREE_DAILY_LIMIT} questões</strong> liberadas por dia</li>
              <li>Depois delas, <strong>1 questão por hora</strong></li>
            </ul>
          </QuadroAviso>
          <QuadroAviso tom="escuro">
            <p className="mb-1 font-extrabold">Com Premium você tem</p>
            <ul className="list-disc pl-5">
              <li>Quizzes ilimitados por dia</li>
              <li>Módulos estruturados</li>
            </ul>
          </QuadroAviso>
        </div>
      </TelaDeAviso>
    );
  }

  if (allCasesCompleted) {
    return (
      <TelaDeAviso
        Icone={Trophy}
        tom="verde"
        titulo="Parabéns!"
        texto="Você completou todos os casos de ECG disponíveis! Quer recomeçar e praticar novamente?"
        acoes={
          <>
            <BotaoPrincipal onClick={handleResetProgress}>RECOMEÇAR QUIZ</BotaoPrincipal>
            <BotaoSecundario to={createPageUrl("Dashboard")}>Voltar ao início</BotaoSecundario>
          </>
        }
      />
    );
  }

  if (!currentCase) {
    return (
      <TelaDeAviso
        Icone={Heart}
        tom="cinza"
        titulo="Nenhum caso disponível"
        texto="Adicione casos de ECG para começar a praticar."
        acoes={<BotaoSecundario to={createPageUrl("Dashboard")}>Voltar ao início</BotaoSecundario>}
      />
    );
  }

  const correctAnswers = respostasCorretas(currentCase);
  const tentativasRestantes = MAX_TENTATIVAS - attemptCount;
  // Errou, mas ainda tem tentativa: a resposta certa NÃO aparece. As
  // alternativas travam até TENTAR DE NOVO, como antes.
  const errouComChance = showResult && !isCorrect && !showCorrectAnswer;

  const dialogos = (
    <>
      <EcgZoomDialog open={showZoom} onClose={() => setShowZoom(false)} src={currentCase.image_url} />
      <ReportarErroDialog open={showReportDialog} onOpenChange={setShowReportDialog} caso={currentCase} />

      {/* Content Suggestion Dialog */}
      <Dialog open={showContentSuggestionDialog} onOpenChange={setShowContentSuggestionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1976D2]">
              <BookOpen className="w-5 h-5" />
              Sugestão de Estudo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-700">
              Percebemos que você tem encontrado dificuldades em casos desta fase. Que tal revisar o conteúdo para fortalecer seu aprendizado?
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowContentSuggestionDialog(false);
                  loadNextCase();
                }}
              >
                Continuar Quiz
              </Button>
              <Link to={`${createPageUrl("ConteudoECG")}?type=phase&module_id=${suggestedModuleId}&phase_id=${suggestedPhaseId}&from=quiz&case_id=${currentCase.id}`}>
                <Button onClick={() => setShowContentSuggestionDialog(false)} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <BookOpen className="w-4 h-4 mr-2" />
                  Revisar Conteúdo
                </Button>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {newAchievements.length > 0 && (
        <AchievementToast
          achievements={newAchievements}
          onClose={() => setNewAchievements([])}
        />
      )}
    </>
  );

  if (casoFinalizado) {
    const pendente = registro?.pendente;
    return (
      <>
        <CaseResult
          acertou={isCorrect}
          respostaCorreta={correctAnswers}
          suasRespostas={marcarRespostas(currentCase, selectedAnswers)}
          indicadores={[
            { v: pendente ? "…" : registro?.pontos != null ? `+${registro.pontos}` : null, l: "XP ganho", c: "#1B3A5C" },
            { v: pendente ? "…" : registro?.sequencia ?? null, l: "dias de ofensiva", c: "#C2410C" },
            ...(!isPremium
              ? [{ v: pendente ? "…" : `${dailyQuizCount}/${FREE_DAILY_LIMIT}`, l: "casos hoje", c: "#0D1E30" }]
              : []),
          ]}
          // A explicação do caso é do Premium, como já era. O gratuito vê a
          // resposta certa e o convite no lugar da explicação.
          explicacao={isPremium ? currentCase.explanation : ""}
          achados={isPremium ? currentCase.key_findings || [] : []}
          extra={!isPremium && (
            <section className="rounded-[20px] bg-ecg-midnight p-[18px]">
              <p className="text-[15px] font-black text-ecg-green">A explicação é do Premium</p>
              <p className="mb-3 mt-1 text-xs font-semibold leading-relaxed text-white/75">
                Aprenda a teoria junto com a prática nos módulos estruturados, com a explicação de cada caso.
              </p>
              <Link
                to={createPageUrl("Upgrade")}
                className="inline-block rounded-[11px] bg-ecg-green px-4 py-2.5 text-[13px] font-black text-ecg-midnight shadow-[0_3px_0_#16a34a] transition-transform active:translate-y-[2px] active:shadow-[0_1px_0_#16a34a]"
              >
                VER PLANOS
              </Link>
            </section>
          )}
          onVerEcg={currentCase.image_url ? () => setShowZoom(true) : undefined}
          rotuloBotao={dailyLimitReached && !isPremium ? "CONTINUAR" : "PRÓXIMO CASO"}
          onContinuar={() => (dailyLimitReached && !isPremium ? setShowResult(false) : loadNextCase())}
          // Reportar depois da resposta é o caso mais comum: é ao ver o
          // gabarito que a pessoa percebe que ele está errado.
          rotuloSecundario="Reportar erro neste caso"
          onSecundario={() => setShowReportDialog(true)}
        />
        {dialogos}
      </>
    );
  }

  return (
    <>
      <CaseQuestion
        titulo="Quiz aleatório"
        // No gratuito o topo mostra a cota do dia, que é o que ele precisa
        // saber enquanto joga; o Premium não tem cota e vê só o título.
        {...(!isPremium && {
          passo: Math.min(dailyQuizCount, FREE_DAILY_LIMIT),
          total: FREE_DAILY_LIMIT,
          rotuloProgresso: dailyQuizCount >= FREE_DAILY_LIMIT ? "1 por hora" : `${dailyQuizCount}/${FREE_DAILY_LIMIT} hoje`,
        })}
        onFechar={() => navigate(createPageUrl("Dashboard"))}
        faixa={!isPremium && (
          <div className="border-t border-[#F2E3B8] bg-[#FFF6E0]">
            <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-2">
              <span className="text-xs font-bold text-[#946200]">
                Plano gratuito · {FREE_DAILY_LIMIT} casos por dia, depois 1 por hora
              </span>
              <Link to={createPageUrl("Upgrade")} className="flex-none text-xs font-black text-[#946200] underline underline-offset-2">
                Ver Premium
              </Link>
            </div>
          </div>
        )}
        contexto={currentCase.patient_info}
        ecgUrl={currentCase.image_url}
        onAmpliarEcg={() => setShowZoom(true)}
        pergunta={currentCase.title}
        codigo={currentCase.id?.slice(-8)}
        acoes={
          <>
            {caseContent && (
              <AcaoDoCaso
                Icone={BookOpen}
                to={`${createPageUrl("ConteudoECG")}?type=phase&module_id=${currentCase.module_id}&phase_id=${currentCase.phase_id}&from=quiz&case_id=${currentCase.id}`}
              >
                Tem dúvidas?
              </AcaoDoCaso>
            )}
            <AcaoDoCaso Icone={AlertCircle} tom="perigo" onClick={() => setShowReportDialog(true)}>
              Reportar erro
            </AcaoDoCaso>
            {user?.role === "admin" && (
              <AcaoDoCaso Icone={Pencil} onClick={() => navigate(`${createPageUrl("AdminCases")}?edit_case=${currentCase.id}`)}>
                Editar caso
              </AcaoDoCaso>
            )}
          </>
        }
        alternativas={alternativasDe(currentCase)}
        multipla={currentCase.multiple_correct}
        selecionadas={selectedAnswers}
        onAlternar={handleAnswerToggle}
        bloqueada={errouComChance}
        aviso={errouComChance ? {
          titulo: "Resposta incorreta",
          texto: `Você tem ${tentativasRestantes} tentativa${tentativasRestantes !== 1 ? 's' : ''} restante${tentativasRestantes !== 1 ? 's' : ''}.`,
        } : null}
        rotuloBotao={
          errouComChance
            ? "TENTAR DE NOVO"
            : currentCase.multiple_correct && selectedAnswers.length > 0
              ? `VERIFICAR (${selectedAnswers.length})`
              : "VERIFICAR"
        }
        onBotao={errouComChance ? handleTryAgain : handleSubmitAnswer}
      />
      {dialogos}
    </>
  );
}
