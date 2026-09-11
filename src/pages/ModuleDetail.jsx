import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCurrentUser, clearCurrentUserCache } from '@/lib/currentUser';
import { comTimeout, descreverErro, detalheTecnico } from '@/lib/carregamento';
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { triggerAchievementCheck } from "@/components/AchievementChecker";
import AchievementToast from "@/components/AchievementToast";
import {
  Loader2,
  Trophy,
  Pencil,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  BookOpen,
  Lock
} from "lucide-react";
import CaseQuestion, { AcaoDoCaso } from "@/components/caso/CaseQuestion";
import CaseResult from "@/components/caso/CaseResult";
import EcgZoomDialog from "@/components/caso/EcgZoomDialog";
import ReportarErroDialog from "@/components/caso/ReportarErroDialog";
import TelaDeAviso, { QuadroAviso } from "@/components/caso/TelaDeAviso";
import { BotaoPrincipal, BotaoSecundario } from "@/components/BarraDeAcao";
import { MAX_TENTATIVAS, respostasCorretas, acertou, alternar, alternativasDe, marcarRespostas } from "@/lib/caso";
import { useRolarAoTopo } from "@/lib/rolagem";
import { registrarTentativa } from "@/lib/registrarTentativa";

export default function ModuleDetail() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [module, setModule] = useState(null);
  const [phase, setPhase] = useState(null);
  const [cases, setCases] = useState([]);
  const [currentCaseIndex, setCurrentCaseIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [loading, setLoading] = useState(true);
  // Falha de carregamento. Antes disto, qualquer erro dentro do loadData
  // deixava `loading` em true para sempre — o usuário via "Carregando
  // módulo..." indefinidamente, sem mensagem e sem como tentar de novo.
  const [loadError, setLoadError] = useState(null);
  // Plano free chegou até aqui: a trilha em Modules é aberta a todos e o pedido
  // de assinatura acontece nesta tela, na hora de abrir a fase.
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [completedCasesCount, setCompletedCasesCount] = useState(0);
  const [totalPhaseCases, setTotalPhaseCases] = useState(0);
  const [sessionCompletedCases, setSessionCompletedCases] = useState([]);

  // Modo revisão: a fase já foi concluída antes e o usuário voltou para
  // praticar. O baralho passa a aceitar casos repetidos e o UserProgress
  // não é mais tocado — quem já completou a fase não tem o que progredir.
  const [isReview, setIsReview] = useState(false);
  const [reviewAnswered, setReviewAnswered] = useState(0);

  // Diálogos de zoom e de reportar erro: o estado de cada um mora no próprio
  // componente (EcgZoomDialog, ReportarErroDialog); aqui só abre e fecha.
  const [showZoom, setShowZoom] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [phaseContent, setPhaseContent] = useState(null);
  const [showPhaseCompletion, setShowPhaseCompletion] = useState(false);
  const [nextPhase, setNextPhase] = useState(null);

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
  useRolarAoTopo(`${currentCaseIndex}-${casoFinalizado}-${showPhaseCompletion}`);

  useEffect(() => {
    // Só faz sentido buscar a próxima fase quando esta acabou de ser concluída.
    // Em revisão a trilha já está liberada; numa sessão encerrada sem atingir a
    // meta ainda não há próxima fase a oferecer.
    const goalReached = totalPhaseCases > 0 && completedCasesCount >= totalPhaseCases;
    if (showPhaseCompletion && !isReview && goalReached && module && phase) {
      findNextPhase();
    }
  }, [showPhaseCompletion, isReview, completedCasesCount, totalPhaseCases, module, phase]);

  const findNextPhase = async () => {
    // filter e não list: só as fases DESTE módulo interessam, e a linha de
    // baixo já as filtrava em memória depois de baixar as de todos.
    const phasesData = await base44.entities.Phase.filter({ module_id: module.id });
    const modulePhasesOrdered = phasesData
      .filter(p => p.module_id === module.id)
      .sort((a, b) => a.order - b.order);
    
    const currentPhaseIndex = modulePhasesOrdered.findIndex(p => p.id === phase.id);
    if (currentPhaseIndex !== -1 && currentPhaseIndex < modulePhasesOrdered.length - 1) {
      setNextPhase(modulePhasesOrdered[currentPhaseIndex + 1]);
    }
  };

  // loadData é só a casca de erro. Toda falha aqui dentro terminava num spinner
  // eterno: sem catch, o `setLoading(false)` do fim nunca era alcançado, e a
  // tela não tinha estado para "deu errado" — só "carregando" e "pronto".
  // Modules.jsx já tratava assim (try/catch + desliga o loading), o que explica
  // o relato de suporte em que a trilha abria e a fase não.
  const loadData = async (opts = {}) => {
    try {
      setLoadError(null);
      await executarCarga(opts);
    } catch (error) {
      console.error('ModuleDetail: falha ao carregar', error);
      setLoadError(error);
      setLoading(false);
    }
  };

  const executarCarga = async ({ skipReturnCase = false } = {}) => {
    const urlParams = new URLSearchParams(window.location.search);
    const moduleId = urlParams.get('module_id');
    const phaseId = urlParams.get('phase_id');

    if (!moduleId || !phaseId) {
      navigate(createPageUrl("Modules"));
      return;
    }

    const userData = await comTimeout(getCurrentUser(), undefined, 'sua conta');

    // getCurrentUser devolve null (não lança) quando a resposta vem sem
    // `account`. Sem esta guarda, o `userData.email` logo abaixo estourava um
    // TypeError — e como o Modules chama getUserProgress sem email, a trilha
    // continuava abrindo enquanto só esta tela quebrava.
    if (!userData) {
      const erro = new Error('Não foi possível carregar sua conta.');
      erro.code = 'sem_conta';
      throw erro;
    }
    setUser(userData);

    // --- CRÍTICO: tudo que só depende de moduleId/phaseId/email roda em paralelo ---
    const [moduleData, phaseData, progressResp, allUserAttempts] = await Promise.all([
      // Estas duas eram `.list()` e traziam TODOS os módulos e TODAS as fases do
      // app para escolher um de cada por `.find`. É leitura de entidade que
      // conta na cota do Base44 — e foi um estouro dessa cota
      // ("App entity read traffic volume limit exceeded") que apareceu nos logs.
      // O `.find`/`.filter` logo abaixo continua correto sobre o conjunto menor.
      comTimeout(base44.entities.Module.filter({ id: moduleId }), undefined, 'lista de módulos'),
      comTimeout(base44.entities.Phase.filter({ module_id: moduleId }), undefined, 'lista de fases'),
      // getUserProgress via service role (evita problema de RLS no modo "agindo como")
      comTimeout(
        base44.functions.invoke('getUserProgress', { user_email: userData.email }),
        undefined,
        'seu progresso'
      ).catch(err => {
        console.warn('Failed to load user progress:', err.message);
        return null;
      }),
      // Tentativas apenas para saber se usuário já entrou na fase (verificar redirect)
      //
      // O catch aqui é deliberado e o valor de falha é `null`, não `[]`. Esta
      // leitura só decide UM desvio de conveniência (mandar quem nunca entrou
      // para a teoria antes do quiz) — derrubar a fase inteira por causa dela
      // seria trocar um desvio por uma tela morta. E `[]` mentiria: significa
      // "nunca entrou", o que empurraria para a teoria quem já estava no meio
      // da fase. `null` = não sabemos, e não sabendo não se desvia.
      comTimeout(
        base44.functions.invoke('getMyQuizAttempts', {
          module_id: moduleId,
          phase_id: phaseId,
          quiz_type: "module",
          sort: "-created_date",
          limit: 1
        }),
        undefined,
        'suas tentativas'
      )
        .then(r => r?.data?.attempts || [])
        .catch(err => {
          console.warn('Failed to load quiz attempts:', err.message);
          return null;
        }),
    ]);

    const foundModule = moduleData.find(m => m.id === moduleId);
    if (!foundModule) {
      navigate(createPageUrl("Modules"));
      return;
    }
    setModule(foundModule);

    const foundPhase = phaseData.find(p => p.id === phaseId);
    if (!foundPhase) {
      navigate(createPageUrl("Modules"));
      return;
    }
    setPhase(foundPhase);

    // PAYWALL — daqui para baixo começa o conteúdo pago (os casos de ECG).
    // Parar exatamente nesta linha é intencional: Module e Phase já foram
    // lidos, então a tela de bloqueio consegue dizer o nome do que a pessoa
    // tentou abrir, mas selectAndCombineCases ainda não rodou — nenhum caso
    // chega ao navegador de quem não assinou.
    if (userData?.subscription_type !== 'premium') {
      setNeedsUpgrade(true);
      setLoading(false);
      return;
    }

    const allProgress = progressResp?.data?.data || [];
    const progressRecord = allProgress.find(p => p.module_id === moduleId && p.phase_id === phaseId) || null;

    const completedCaseIds = progressRecord?.completed_case_ids || [];
    const totalCases = progressRecord?.completion_goal || foundPhase.total_cases || 0;
    setTotalPhaseCases(totalCases);
    setCompletedCasesCount(Math.min(completedCaseIds.length, totalCases));

    // Fase já concluída => sessão de revisão. Além do status, aceitamos o
    // contador no teto: se o usuário já fez tantos casos quanto a meta, não há
    // progresso a fazer e insistir no modo normal encerraria a fase na primeira
    // resposta (o `newCompletedCount >= totalPhaseCases` já seria verdadeiro).
    const review =
      progressRecord?.status === 'completed' ||
      (totalCases > 0 && completedCaseIds.length >= totalCases);
    setIsReview(review);
    setReviewAnswered(0);

    // Selecionar casos e buscar conteúdo da fase em paralelo (não dependem entre si)
    const [combinedCasesRaw, phaseContentData] = await Promise.all([
      // Selecionar e combinar casos (80% fase atual + 20% fases anteriores)
      comTimeout(
        selectAndCombineCases(moduleId, phaseId, review),
        undefined,
        'casos da fase'
      ),
      // Conteúdo teórico: como as tentativas, só alimenta o desvio para a
      // teoria. Falhar aqui não pode custar a fase — sem conteúdo, segue direto
      // para os casos, que é o mesmo que acontece nas fases que não têm teoria.
      comTimeout(
        base44.entities.Content.filter({ module_id: moduleId, phase_id: phaseId }),
        undefined,
        'conteúdo da fase'
      )
        .then(r => r?.[0] || null)
        .catch(err => {
          console.warn('Failed to load phase content:', err.message);
          return null;
        }),
    ]);

    let combinedCases = combinedCasesRaw;

    // Restaurar caso se veio do ConteudoECG (botão "Tem dúvidas?").
    // Numa nova rodada de revisão ignoramos o parâmetro, senão toda rodada
    // começaria fixada no mesmo caso que sobrou na URL.
    const returnCaseId = skipReturnCase ? null : urlParams.get('case_id');
    if (returnCaseId) {
      let idx = combinedCases.findIndex(c => c.id === returnCaseId);
      // Se o caso não está no conjunto reembaralhado, buscá-lo e inseri-lo no início
      if (idx === -1) {
        const found = await base44.entities.ECGCase.filter({ id: returnCaseId });
        if (found.length > 0) {
          const restored = { ...found[0], caseSource: found[0].phase_id === phaseId ? 'current_phase' : 'previous_phase' };
          combinedCases = [restored, ...combinedCases];
          idx = 0;
        }
      }
      if (idx !== -1) {
        setCurrentCaseIndex(idx);
      }
    }

    setCases(combinedCases);
    setPhaseContent(phaseContentData);

    // Só redirecionar para conteúdo se o usuário nunca fez NENHUMA tentativa nesta fase
    const fromParam = urlParams.get('from');
    // `allUserAttempts === null` significa que a leitura falhou: nesse caso não
    // desviamos, porque desviar por engano tira o usuário da fase que ele pediu.
    if (allUserAttempts?.length === 0 && phaseContentData && fromParam !== 'phase_transition' && fromParam !== 'content') {
      navigate(`${createPageUrl("ConteudoECG")}?type=phase&module_id=${moduleId}&phase_id=${phaseId}&from=phase_transition`, { replace: true });
      return;
    }

    setLoading(false);
  };

  // O baralho agora é montado NO SERVIDOR (getPhaseCases), no mesmo padrão do
  // getRandomCase do Quiz. Baixar TODOS os casos da fase e das fases anteriores
  // — módulos chegam a 170 casos — para escolher 10 aqui no cliente era a
  // leitura mais pesada desta tela, e uma das que estouravam a cota de volume
  // de leituras do Base44 (o 429 que a pessoa via ao abrir a fase). O servidor
  // lê um pool pequeno com o $nin dentro do banco e devolve no máximo 10 casos.
  const selectAndCombineCases = async (moduleId, phaseId, revisao = false) => {
    const res = await base44.functions.invoke('getPhaseCases', {
      module_id: moduleId,
      phase_id: phaseId,
      revisao
    });
    return res?.data?.cases || [];
  };

  const currentCase = cases[currentCaseIndex];

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

    // Se acertou ou já tentou 3 vezes, registrar
    if (correct || newAttemptCount >= MAX_TENTATIVAS) {
      setRegistro({ pendente: true });
      try {
        const res = await registrarTentativa({
          case_id: currentCase.id,
          module_id: currentCase.module_id,
          phase_id: currentCase.phase_id,
          user_answer: selectedAnswers.join(", "),
          correct: correct,
          quiz_type: "module",
          case_source: currentCase.caseSource
        });
        setRegistro({ pontos: res?.data?.pontos_ganhos, sequencia: res?.data?.sequencia });
      } catch (err) {
        console.warn('Failed to record quiz attempt:', err.message);
        setRegistro(null);
      }

      // Verificar novos troféus e notificar o usuário se ganhou algum
      triggerAchievementCheck().then((earned) => {
        if (earned && earned.length > 0) setNewAchievements(earned);
      });

      // Apenas casos da fase atual contam para o progresso
      const isCaseFromCurrentPhase = currentCase.caseSource === 'current_phase' || !currentCase.caseSource;

      if (isReview) {
        // Revisão não mexe no UserProgress: a fase já está concluída e não há
        // progresso a somar. O histórico da prática fica na QuizAttempt, criada
        // logo acima por recordQuizAttempt — que já pontua revisão a menos que
        // acerto de primeira e ignora repetições no cálculo da taxa de acerto.
        // Sem isso, a fase se encerrava na primeira resposta, porque o contador
        // já entrava na sessão com o valor da meta.
        if (!sessionCompletedCases.includes(currentCase.id)) {
          setSessionCompletedCases([...sessionCompletedCases, currentCase.id]);
          setReviewAnswered(prev => prev + 1);
        }
      } else if (isCaseFromCurrentPhase && !sessionCompletedCases.includes(currentCase.id)) {
        const updatedSessionCompleted = [...sessionCompletedCases, currentCase.id];
        setSessionCompletedCases(updatedSessionCompleted);

        const newCompletedCount = Math.min(completedCasesCount + 1, totalPhaseCases);
        setCompletedCasesCount(newCompletedCount);

        // Atualizar UserProgress (fonte da verdade) — aguardar persistência
        // para que, ao voltar do conteúdo no mobile, o progresso não apareça zerado.
        await base44.functions.invoke('updateUserProgress', {
          user_email: user.email,
          module_id: currentCase.module_id,
          phase_id: currentCase.phase_id,
          case_id: currentCase.id
        });

        // Atingir a meta NÃO encerra mais a sessão aqui. A fase já foi marcada
        // como concluída no banco, na linha acima — o que faltava era só a tela,
        // e ela agora espera o baralho acabar (handleNextCase).
        //
        // Encerrar neste ponto cortava a sessão no meio: as cartas restantes,
        // incluindo os casos de revisão de fases anteriores, sumiam sem serem
        // vistas sempre que o embaralhamento as deixava para o fim.
      }
    }
  };

  const handleTryAgain = () => {
    setShowResult(false);
    setSelectedAnswers([]);
  };

  const handleNextCase = () => {
    if (currentCaseIndex < cases.length - 1) {
      setCurrentCaseIndex(currentCaseIndex + 1);
      setSelectedAnswers([]);
      setShowResult(false);
      setAttemptCount(0);
      setShowCorrectAnswer(false);
      setRegistro(null);
    } else {
      // Acabaram os casos do baralho — tela de conclusão (ou de revisão)
      setShowPhaseCompletion(true);
    }
  };

  // Monta um baralho novo sem sair da página. Serve aos dois botões da tela
  // final: "Continuar praticando" (fase ainda incompleta) e "Revisar novamente"
  // (fase concluída). Recarrega o progresso do zero de propósito, para partir do
  // que acabou de ser gravado nesta sessão.
  const startNewRound = async () => {
    setShowPhaseCompletion(false);
    setNextPhase(null);
    setCurrentCaseIndex(0);
    setSelectedAnswers([]);
    setShowResult(false);
    setIsCorrect(false);
    setAttemptCount(0);
    setShowCorrectAnswer(false);
    setSessionCompletedCases([]);
    setRegistro(null);
    setCases([]);
    setLoading(true);
    await loadData({ skipReturnCase: true });
  };

  if (loading) {
    return (
      <div className="font-nunito flex min-h-full items-center justify-center bg-[#F4F6F8] py-24">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-ecg-midnight-2" />
          <p className="text-sm font-bold text-[#6B7785]">Carregando módulo...</p>
        </div>
      </div>
    );
  }

  // Falha de carregamento. Precisa vir antes do paywall e de tudo que depende de
  // `cases`: quando a carga estoura, nenhum desses estados foi preenchido, e o
  // que a pessoa precisa é poder tentar de novo — não um bloqueio de plano que
  // seria falso, nem um spinner que nunca acaba.
  if (loadError) {
    return (
      <TelaDeAviso
        Icone={AlertTriangle}
        tom="ambar"
        titulo="Não foi possível abrir esta fase"
        texto={descreverErro(loadError)}
        acoes={
          <>
            <BotaoPrincipal
              onClick={() => {
                // Limpar o cache é o que faz o retry ser um retry de verdade.
                // Quando a falha foi timeout, a promessa original do
                // getCurrentUser continua pendurada e guardada em `inflight`
                // — sem limpar, a nova tentativa recebe a MESMA promessa que
                // já não respondia e falha de novo pelo mesmo motivo.
                clearCurrentUserCache();
                setLoading(true);
                loadData();
              }}
            >
              TENTAR NOVAMENTE
            </BotaoPrincipal>
            <BotaoSecundario to={createPageUrl("Modules")}>Voltar à trilha</BotaoSecundario>
          </>
        }
        // Linha para o suporte: é o que a pessoa consegue printar e mandar
        // quando o texto acima não basta para explicar o que houve.
        rodape={detalheTecnico(loadError)}
      />
    );
  }

  // Tela de bloqueio por plano. Precisa vir antes de tudo que depende de
  // `cases`: no plano free os casos nunca foram carregados.
  if (needsUpgrade) {
    return (
      <TelaDeAviso
        Icone={Lock}
        tom="escuro"
        sobretitulo={module?.name}
        titulo={phase?.name || `Fase ${phase?.order}`}
        texto="Esta fase faz parte do plano premium. Assine para estudar os casos de ECG deste módulo e destravar a trilha inteira."
        acoes={
          <>
            <BotaoPrincipal to={createPageUrl("Upgrade")}>ASSINAR AGORA</BotaoPrincipal>
            <BotaoSecundario to={createPageUrl("Modules")}>Voltar à trilha</BotaoSecundario>
          </>
        }
      />
    );
  }

  // A tela final agora aparece num momento só (baralho acabou) e consulta estes
  // dois valores para decidir o que dizer — em vez de assumir que acabar as
  // questões é o mesmo que concluir a fase.
  const phaseGoalReached = totalPhaseCases > 0 && completedCasesCount >= totalPhaseCases;
  const casesRemaining = Math.max(0, totalPhaseCases - completedCasesCount);

  // Tela de conclusão da fase
  if (showPhaseCompletion) {
    const nomes = (
      <>
        a fase <strong className="text-[#15803D]">{phase?.name}</strong> do módulo{" "}
        <strong className="text-ecg-midnight-2">{module?.name}</strong>
      </>
    );
    return (
      <TelaDeAviso
        Icone={isReview ? RefreshCw : phaseGoalReached ? Trophy : BookOpen}
        tom={isReview || phaseGoalReached ? "verde" : "azul"}
        titulo={isReview ? "Rodada de revisão concluída" : phaseGoalReached ? "Fase concluída!" : "Sessão encerrada"}
        texto={
          <>
            {isReview ? "Você revisou" : phaseGoalReached ? "Você completou" : "Você praticou"} {nomes}
          </>
        }
        acoes={
          isReview || !phaseGoalReached ? (
            <>
              <BotaoPrincipal onClick={startNewRound}>
                {isReview ? "REVISAR NOVAMENTE" : "CONTINUAR PRATICANDO"}
              </BotaoPrincipal>
              <BotaoSecundario to={createPageUrl("Modules")}>Voltar aos módulos</BotaoSecundario>
            </>
          ) : nextPhase ? (
            <>
              <BotaoPrincipal
                onClick={() => navigate(`${createPageUrl("ConteudoECG")}?type=phase&module_id=${module.id}&phase_id=${nextPhase.id}&from=phase_transition`)}
              >
                PRÓXIMA FASE: {nextPhase.name?.toUpperCase()}
              </BotaoPrincipal>
              <BotaoSecundario to={createPageUrl("Modules")}>Ver módulos</BotaoSecundario>
            </>
          ) : (
            <BotaoPrincipal to={createPageUrl("Modules")}>CONTINUAR O APRENDIZADO</BotaoPrincipal>
          )
        }
      >
        <QuadroAviso tom={isReview || phaseGoalReached ? "verde" : "azul"}>
          {isReview ? (
            <>
              <p>
                <span className="text-2xl font-black">{reviewAnswered}</span> casos revisados
              </p>
              <p className="mt-1">Quantas rodadas você quiser — a fase continua concluída.</p>
            </>
          ) : phaseGoalReached ? (
            <>
              <p>
                <span className="text-2xl font-black">{Math.min(completedCasesCount, totalPhaseCases)}</span> casos completados
              </p>
              <p className="mt-1">Continue sua jornada nas próximas fases!</p>
            </>
          ) : (
            <>
              <p>
                Faltam <span className="text-2xl font-black">{casesRemaining}</span> {casesRemaining === 1 ? "caso" : "casos"} para concluir esta fase
              </p>
              <p className="mt-1">
                Você já fez {completedCasesCount} de {totalPhaseCases}. Continue praticando para liberar a próxima fase.
              </p>
            </>
          )}
        </QuadroAviso>
      </TelaDeAviso>
    );
  }

  if (!currentCase) {
    return (
      <TelaDeAviso
        Icone={Trophy}
        tom="cinza"
        titulo="Nenhum caso nesta fase"
        acoes={<BotaoPrincipal to={createPageUrl("Modules")}>VOLTAR AOS MÓDULOS</BotaoPrincipal>}
      />
    );
  }

  const correctAnswers = respostasCorretas(currentCase);
  const tentativasRestantes = MAX_TENTATIVAS - attemptCount;
  // Errou, mas ainda tem tentativa: a resposta certa NÃO aparece. As
  // alternativas travam até TENTAR DE NOVO, como antes.
  const errouComChance = showResult && !isCorrect && !showCorrectAnswer;
  const feitosNaFase = Math.min(completedCasesCount, totalPhaseCases);

  const dialogos = (
    <>
      <EcgZoomDialog open={showZoom} onClose={() => setShowZoom(false)} src={currentCase.image_url} />
      <ReportarErroDialog open={showReportDialog} onOpenChange={setShowReportDialog} caso={currentCase} />
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
            isReview
              ? { v: reviewAnswered, l: "revisados", c: "#15803D" }
              : { v: totalPhaseCases > 0 ? `${feitosNaFase}/${totalPhaseCases}` : null, l: "casos da fase", c: "#0D1E30" },
          ]}
          explicacao={currentCase.explanation}
          achados={currentCase.key_findings || []}
          onVerEcg={currentCase.image_url ? () => setShowZoom(true) : undefined}
          rotuloBotao={currentCaseIndex < cases.length - 1 ? "PRÓXIMO CASO" : "FINALIZAR FASE"}
          onContinuar={handleNextCase}
          // Reportar depois da resposta é o caso mais comum: é ao ver o
          // gabarito que a pessoa percebe que ele está errado.
          rotuloSecundario="Reportar erro neste caso"
          onSecundario={() => setShowReportDialog(true)}
        />
        {dialogos}
      </>
    );
  }

  // Topo: fase em andamento mostra o progresso DA FASE (a meta que libera a
  // próxima); revisão mostra a posição na rodada, porque não há o que
  // progredir.
  const progresso = isReview
    ? { passo: currentCaseIndex + 1, total: cases.length }
    : totalPhaseCases > 0
      ? { passo: feitosNaFase, total: totalPhaseCases }
      : {};

  return (
    <>
      <CaseQuestion
        titulo={phase?.name}
        {...progresso}
        onFechar={() => navigate(createPageUrl("Modules"))}
        faixa={
          <div className={`border-t ${isReview ? "border-[#CDEFD8] bg-[#E6F9EC]" : "border-[#F2F5F7] bg-[#F8FAFB]"}`}>
            <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2">
              {isReview && <RefreshCw className="h-3.5 w-3.5 flex-none text-[#15803D]" />}
              <span className={`min-w-0 truncate text-xs font-bold ${isReview ? "text-[#15803D]" : "text-[#6B7785]"}`}>
                {isReview
                  ? `Revisando ${phase?.name} · não altera seu progresso`
                  : `${module?.name} · ${phase?.name}`}
              </span>
            </div>
          </div>
        }
        contexto={currentCase.patient_info}
        ecgUrl={currentCase.image_url}
        onAmpliarEcg={() => setShowZoom(true)}
        pergunta={currentCase.title}
        codigo={currentCase.id?.slice(-8)}
        acoes={
          <>
            {phaseContent && (
              <AcaoDoCaso
                Icone={BookOpen}
                to={`${createPageUrl("ConteudoECG")}?type=phase&module_id=${module.id}&phase_id=${phase.id}&case_id=${currentCase.id}&from=module`}
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