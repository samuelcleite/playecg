import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { getCurrentUser } from '@/lib/currentUser';
import { calculateStreakDays } from "@/components/StreakCalculator";
import { loadUserAchievements } from "@/components/AchievementChecker";
import FaleConoscoButton from "@/components/FaleConoscoButton";
import StatsPanel from "@/components/home/StatsPanel";
import DashboardMobile from "@/components/home/DashboardMobile";
import { montarTrilha, proximaFase } from "@/lib/trilha";
import { carregarCatalogoTrilha } from "@/lib/catalogoTrilha";
import { inicioDoDiaBrasilia } from "@/lib/diaBrasilia";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Flame,
  Star,
  Brain,
  Crown,
  Loader2,
  BookOpen,
  ChevronRight
} from "lucide-react";
import { motion } from "framer-motion";
import NotificationBanner from "@/components/NotificationBanner";

// Meta do dia do redesenho. Coincide de propósito com o limite do plano
// gratuito (FREE_DAILY_LIMIT no Quiz.jsx): para quem é free, fechar a meta e
// esgotar a cota do dia são a mesma coisa, e a tela não promete um número que
// o servidor recusaria.
const META_DIARIA = 5;

// Mesmo corte do `md:` do Tailwind. Lido de forma SÍNCRONA na montagem — o
// useIsMobile começa em false e só depois vira true, o que no celular montaria
// o NotificationBanner no bloco desktop e em seguida o remontaria no mobile.
const CONSULTA_MOBILE = "(max-width: 767px)";

function useTelaMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(CONSULTA_MOBILE).matches);
  useEffect(() => {
    const mql = window.matchMedia(CONSULTA_MOBILE);
    const onChange = () => setMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [streakDays, setStreakDays] = useState(0);
  const [achievements, setAchievements] = useState([]);
  // O estado `stats` saiu junto com o painel de estatísticas: ninguém lia mais
  // total/correct/accuracy. O streakDays agora vem da Account (ver init).
  const [casosHoje, setCasosHoje] = useState(null); // null = ainda não chegou
  const [continuar, setContinuar] = useState(null); // ver DashboardMobile
  const containerRef = useRef(null);
  const telaMobile = useTelaMobile();

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);

      if (!userData.profile_completed) {
        navigate(createPageUrl("CompleteProfile"));
        return;
      }

      // --- ESSENCIAL: nada. As três opções de navegação e a saudação só
      // dependem da conta, que já veio acima. A tela pode aparecer aqui. ---
      setLoading(false);

      // --- SECUNDÁRIO: não bloqueia a tela, preenche os números depois ---
      // Antes estes dois awaits vinham em sequência e a tela inteira ficava
      // atrás deles: dois round-trips para escrever a sequência de dias num
      // canto e os troféus num painel que só existe no desktop.
      // A sequência sai da Account em cache (current_streak/last_practice_date,
      // mantidos pelo recordQuizAttempt), a mesma fonte de Troféus e Perfil —
      // antes era um getUserStats a cada visita. A prática feita na sessão
      // entra no cache pelo registrarTentativa, então o número não fica velho.
      calculateStreakDays(userData.email).then(setStreakDays);

      loadUserAchievements(userData)
        .then(setAchievements)
        .catch((err) => console.error("getUserAchievements:", err));

      // Meta do dia: casos DISTINTOS desde a meia-noite de Brasília, de
      // qualquer tipo — a mesma contagem que o recordQuizAttempt faz para o
      // limite do gratuito. Repetir um caso não conta duas vezes.
      //
      // Com `limit` e SEM `since`, de propósito. O `since` sem limite faz a
      // function ler um lote de 500 tentativas e só então descartar as de
      // outros dias — 500 leituras a cada visita à tela mais visitada, o
      // mesmo tipo de leitura que derrubava o app com 429. A meta só precisa
      // achar até 5 casos de hoje; as 20 tentativas mais recentes bastam, e o
      // corte do dia é feito aqui. (Com limit, a function ignora o since.)
      base44.functions
        .invoke("getMyQuizAttempts", { limit: 20 })
        .then((res) => {
          const inicio = inicioDoDiaBrasilia();
          const deHoje = (res?.data?.attempts || []).filter((t) => new Date(t.created_date) >= inicio);
          setCasosHoje(Math.min(new Set(deHoje.map((t) => t.case_id)).size, META_DIARIA));
        })
        .catch((err) => console.error("getMyQuizAttempts (meta do dia):", err));

      // Card CONTINUAR: a próxima fase da trilha, pela mesma regra que a
      // LearningTrail usa para destacar o nó (src/lib/trilha.js). O catálogo
      // (módulos e fases) vem em cache; o progresso é lido a cada visita.
      Promise.all([
        carregarCatalogoTrilha(),
        base44.functions.invoke("getUserProgress", {}),
      ])
        .then(([[modulos, fases], progressoRes]) => {
          const progresso = Array.isArray(progressoRes?.data?.data) ? progressoRes.data.data : [];
          const prox = proximaFase(montarTrilha(modulos, fases, progresso));
          if (!prox) {
            setContinuar({ concluida: true });
            return;
          }
          setContinuar({
            modulo: `Módulo ${prox.module.order} · ${prox.module.name}`,
            fase: `Fase ${prox.indice + 1} de ${prox.total} — ${prox.phase.name || `Fase ${prox.phase.order}`}`,
            url: `${createPageUrl("ModuleDetail")}?module_id=${prox.module.id}&phase_id=${prox.phase.id}`,
          });
        })
        .catch((err) => console.error("trilha (card Continuar):", err));

      // A consulta a getDailyCase saiu junto com o card do Caso do Dia: era o
      // único lugar que usava esse resultado.

    } catch (err) {
      console.error("Erro ao carregar Dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const isRefreshing = usePullToRefresh(init, containerRef);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
      </div>
    );
  }

  const isPremium = user?.subscription_type === "premium";
  const earnedAchievements = achievements.filter(a => a.earned);

  return (
    <div ref={containerRef} className="min-h-screen bg-[#F4F6F8] md:bg-gradient-to-br md:from-slate-50 md:via-blue-50 md:to-cyan-50 w-full max-w-full relative">
      {isRefreshing && (
        <div className="flex justify-center py-3 absolute top-0 left-0 right-0 z-50">
          <Loader2 className="animate-spin text-gray-400 w-6 h-6" />
        </div>
      )}

      {/* ══════════ MOBILE: redesenho (1b) ══════════
          Meta do dia, CONTINUAR direto na próxima fase, e dois atalhos. O card
          "Módulos" saiu: a trilha segue na barra inferior, e o CONTINUAR leva à
          fase — no plano gratuito, à tela de bloqueio do ModuleDetail com o
          nome do que a pessoa tentou abrir, que é onde a cobrança acontece. */}
      <div className="md:hidden">
        <DashboardMobile
          ofensiva={streakDays}
          xp={user?.points ?? 0}
          metaFeitos={casosHoje}
          metaTotal={META_DIARIA}
          continuar={continuar}
          isPremium={isPremium}
          aviso={telaMobile ? <NotificationBanner /> : null}
        />
      </div>

      {/* ══════════ DESKTOP (web): layout original ══════════ */}
      {/* Top Bar */}
      {/* `top` na safe-area, nao em 0: um elemento grudento se ancora na
          VIEWPORT, entao com top:0 ele encosta na borda fisica da tela e some
          debaixo do relogio e da camera assim que a pagina rola -- por mais que
          o conteudo parado ao redor esteja no lugar certo. O padding que ficava
          aqui saiu porque o <main> do Layout ja reserva o mesmo espaco: as duas
          reservas somadas empurravam o cabecalho para o meio da tela. */}
      <header className="hidden md:block bg-white border-b border-blue-100 sticky z-40" style={{ top: 'var(--app-safe-top, 0px)' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#0D3B66] to-[#1976D2] rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">PlayECG</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="font-bold text-orange-700 text-sm">{streakDays}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1.5">
              <Star className="w-4 h-4 text-yellow-500" />
              <span className="font-bold text-yellow-700 text-sm">{user?.points || 0}</span>
            </div>
            {!isPremium && (
              <Link to={createPageUrl("Upgrade")}>
                <Badge className="bg-amber-100 text-amber-800 border border-amber-300 cursor-pointer hover:bg-amber-200 transition-colors">
                  <Crown className="w-3 h-3 mr-1" />
                  Premium
                </Badge>
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="hidden md:block max-w-5xl mx-auto px-4 py-6">
        {/* Uma instância só: o banner roda o resgate da promoção de push ao
            montar, e duas cópias (uma escondida por CSS) resgatariam em dobro.
            No mobile ele entra dentro do DashboardMobile. */}
        {!telaMobile && <NotificationBanner />}

        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-gray-900">
            Olá, {user?.full_name?.split(" ")[0] || "Jogador"}! 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {streakDays > 0
              ? `🔥 ${streakDays} dia${streakDays > 1 ? "s" : ""} em sequência! Continue assim!`
              : "Comece a praticar para iniciar sua sequência!"}
          </p>
        </motion.div>

        <div>
        {/* Quick Actions — o card "Caso do Dia" saiu daqui também. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}>
            <Link to={createPageUrl("Quiz")}>
              <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 cursor-pointer hover:shadow-lg transition-all h-full">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1976D2] to-[#0D3B66] flex items-center justify-center shadow-md flex-shrink-0">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">Quiz Aleatório</p>
                    <p className="text-xs text-gray-500 mt-0.5">Pratique com casos variados</p>
                  </div>
                  <Button size="sm" className="bg-[#1976D2] hover:bg-[#0D3B66] text-white flex-shrink-0">
                    Jogar
                  </Button>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        </div>

        {/* Learning Trail */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
          <Link to={createPageUrl("Modules")}>
            <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 cursor-pointer hover:shadow-lg transition-all">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#22C55E] to-[#16a34a] flex items-center justify-center shadow-md flex-shrink-0">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">Módulos</p>
                  <p className="text-xs text-gray-500 mt-0.5">Continue seu aprendizado de onde parou!</p>
                </div>
                <ChevronRight className="w-5 h-5 text-green-400 flex-shrink-0" />
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        {/* Stats */}
        <StatsPanel
          streakDays={streakDays}
          earnedAchievements={earnedAchievements}
          isPremium={isPremium}
        />
        </div>
      </div>

      <FaleConoscoButton />
    </div>
  );
}