import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Loader2, Calendar } from "lucide-react";
import DailyCaseMobile from "@/components/caso/DailyCaseMobile";
import CaseQuestion from "@/components/caso/CaseQuestion";
import CaseResult from "@/components/caso/CaseResult";
import EcgZoomDialog from "@/components/caso/EcgZoomDialog";
import TelaDeAviso from "@/components/caso/TelaDeAviso";
import { BotaoPrincipal } from "@/components/BarraDeAcao";
import { respostasCorretas, acertou, alternar, alternativasDe, marcarRespostas } from "@/lib/caso";
import { registrarTentativa } from "@/lib/registrarTentativa";
import { calculateStreakDays } from "@/components/StreakCalculator";

// Pontos de um acerto de primeira no recordQuizAttempt (PONTOS_ACERTO_PRIMEIRA).
// Só para ANUNCIAR na abertura quanto o caso vale; o número que a pessoa vê no
// resultado é o que o servidor devolve.
const XP_EM_JOGO = 10;

// "quarta-feira, 10 de setembro" → "Quarta-feira, 10 de setembro"
function dataDeHoje() {
  const d = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export default function DailyCase() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dailyCase, setDailyCase] = useState(null);
  const [ecgCase, setEcgCase] = useState(null);
  const [userAttempt, setUserAttempt] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [isCorrect, setIsCorrect] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [noCaseAvailable, setNoCaseAvailable] = useState(false);
  const [ofensiva, setOfensiva] = useState(null);
  const [zoomAberto, setZoomAberto] = useState(false);
  // abertura → pergunta → resultado. Quem já respondeu hoje entra direto no
  // resultado, como antes (a tela mostrava a explicação com a resposta dada).
  const [etapa, setEtapa] = useState("abertura");
  // O que o recordQuizAttempt devolveu: pontos e sequência para o resultado.
  // null = ainda não respondeu nesta visita (ou veio de uma resposta antiga).
  const [registro, setRegistro] = useState(null);
  const [respondidoAntes, setRespondidoAntes] = useState(false);

  useEffect(() => {
    loadDailyCase();
    // A ofensiva é enfeite da abertura: não segura a tela. Sai da Account em
    // cache (calculateStreakDays), sem ida ao servidor.
    calculateStreakDays().then(setOfensiva);
  }, []);

  const loadDailyCase = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke("getDailyCase", {});

      if (response.data.success) {
        setDailyCase(response.data.daily_case);
        setEcgCase(response.data.ecg_case);
        setUserAttempt(response.data.user_attempt);

        if (response.data.already_answered) {
          setRespondidoAntes(true);
          setIsCorrect(response.data.user_attempt.correct);
          setSelectedAnswers([response.data.user_attempt.user_answer]);
          setEtapa("resultado");
        }
      } else {
        setNoCaseAvailable(true);
      }
    } catch (error) {
      console.error("Error loading daily case:", error);
      setNoCaseAvailable(true);
    } finally {
      setLoading(false);
    }
  };

  const iniciar = () => {
    // O cronômetro começa ao tocar em RESOLVER, não ao abrir a tela: a
    // abertura já mostra o traçado, mas o tempo que conta é o de responder.
    setStartTime(Date.now());
    setEtapa("pergunta");
  };

  const handleSubmitAnswer = async () => {
    if (selectedAnswers.length === 0) return;

    // O caso do dia é de tentativa única: respondeu, está registrado.
    const correct = acertou(ecgCase, selectedAnswers);
    setIsCorrect(correct);
    setRegistro({ pendente: true });
    setEtapa("resultado");

    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    // recordQuizAttempt é o caminho canônico (o create direto na entidade
    // falhava sob JWT). Efeito desejável: o caso do dia conta nos agregados.
    try {
      const res = await registrarTentativa({
        case_id: ecgCase.id,
        module_id: ecgCase.module_id,
        phase_id: ecgCase.phase_id,
        user_answer: selectedAnswers.join(", "),
        correct: correct,
        quiz_type: "daily",
        time_spent: timeSpent,
      });
      setRegistro({ pontos: res?.data?.pontos_ganhos, sequencia: res?.data?.sequencia });
    } catch (error) {
      console.error("recordQuizAttempt (caso do dia):", error);
      setRegistro(null);
    }
  };

  if (loading) {
    return (
      <div className="font-nunito flex min-h-full items-center justify-center bg-[#F4F6F8] py-24">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-ecg-midnight-2" />
          <p className="text-sm font-bold text-[#6B7785]">Carregando caso do dia...</p>
        </div>
      </div>
    );
  }

  if (noCaseAvailable) {
    return (
      <TelaDeAviso
        Icone={Calendar}
        tom="cinza"
        titulo="Nenhum caso disponível"
        texto="Não há caso do dia programado para hoje. Volte amanhã!"
        acoes={<BotaoPrincipal to={createPageUrl("Dashboard")}>VOLTAR AO INÍCIO</BotaoPrincipal>}
      />
    );
  }

  const zoom = (
    <EcgZoomDialog open={zoomAberto} onClose={() => setZoomAberto(false)} src={ecgCase.image_url} />
  );

  if (etapa === "abertura") {
    return (
      <>
        <DailyCaseMobile
          data={dataDeHoje()}
          ofensiva={ofensiva}
          ecgUrl={ecgCase.image_url}
          resumo={ecgCase.patient_info || ecgCase.title}
          indicadores={[
            { v: `+${XP_EM_JOGO}`, l: "XP em jogo", c: "#1B3A5C" },
            { v: "1", l: "tentativa só", c: "#0D1E30" },
          ]}
          recado="Leia o traçado com calma: o caso do dia aceita uma resposta só. No fim vem a explicação completa."
          onResolver={iniciar}
        />
        {zoom}
      </>
    );
  }

  if (etapa === "pergunta") {
    return (
      <>
        <CaseQuestion
          titulo="Caso do dia"
          onFechar={() => navigate(createPageUrl("Dashboard"))}
          contexto={ecgCase.patient_info}
          ecgUrl={ecgCase.image_url}
          onAmpliarEcg={() => setZoomAberto(true)}
          pergunta={ecgCase.title}
          alternativas={alternativasDe(ecgCase)}
          multipla={ecgCase.multiple_correct}
          selecionadas={selectedAnswers}
          onAlternar={(op) => setSelectedAnswers((sel) => alternar(ecgCase, sel, op))}
          rotuloBotao={
            ecgCase.multiple_correct && selectedAnswers.length > 0
              ? `VERIFICAR (${selectedAnswers.length})`
              : "VERIFICAR"
          }
          onBotao={handleSubmitAnswer}
        />
        {zoom}
      </>
    );
  }

  // Resposta antiga (já respondeu hoje): o banco guarda as marcadas numa
  // string só, então ela aparece inteira, com o veredito que foi gravado.
  const suasRespostas = respondidoAntes
    ? [{ texto: userAttempt.user_answer, certa: userAttempt.correct }]
    : marcarRespostas(ecgCase, selectedAnswers);

  return (
    <>
      <CaseResult
        acertou={isCorrect}
        respostaCorreta={respostasCorretas(ecgCase)}
        suasRespostas={suasRespostas}
        indicadores={
          registro
            ? [
                { v: registro.pendente ? "…" : registro.pontos != null ? `+${registro.pontos}` : null, l: "XP ganho", c: "#1B3A5C" },
                { v: registro.pendente ? "…" : registro.sequencia ?? null, l: "dias de ofensiva", c: "#C2410C" },
              ]
            : []
        }
        explicacaoHtml={dailyCase.detailed_explanation}
        achados={ecgCase.key_findings || []}
        extra={
          respondidoAntes && (
            <section className="rounded-[20px] border border-[#DDD3FF] bg-[#F1EEFF] p-4 text-[13px] font-bold leading-relaxed text-[#3B2A80]">
              Você já resolveu o caso de hoje. Amanhã tem um novo desafio.
            </section>
          )
        }
        onVerEcg={ecgCase.image_url ? () => setZoomAberto(true) : undefined}
        rotuloBotao="VOLTAR AO INÍCIO"
        onContinuar={() => navigate(createPageUrl("Dashboard"))}
      />
      {zoom}
    </>
  );
}
