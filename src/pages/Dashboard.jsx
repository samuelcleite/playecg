import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { getCurrentUser } from '@/lib/currentUser';
// calculateStreakDays removed - using local version to avoid extra API call
import { loadUserAchievements } from "@/components/AchievementChecker";
import FaleConoscoButton from "@/components/FaleConoscoButton";
import StatsPanel from "@/components/home/StatsPanel";
import PremiumUpsellCard from "@/components/home/PremiumUpsellCard";
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
  ListOrdered,
  ChevronRight
} from "lucide-react";
import { motion } from "framer-motion";
import NotificationBanner from "@/components/NotificationBanner";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [streakDays, setStreakDays] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [stats, setStats] = useState({ total: 0, correct: 0, accuracy: 0 });
  const containerRef = useRef(null);

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

      // Buscar estatísticas via backend (service role - confiável, sem limites de RLS no frontend)
      const statsRes = await base44.functions.invoke("getUserStats", {});
      const s = statsRes.data;
      setStats({
        total: s.total,
        correct: s.correct,
        accuracy: s.accuracy,
        completedModules: 0
      });
      setStreakDays(s.streakDays);

      try {
        const userAchievements = await loadUserAchievements(userData);
        setAchievements(userAchievements);
      } catch (_) {}

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
    <div ref={containerRef} className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 w-full max-w-full relative">
      {isRefreshing && (
        <div className="flex justify-center py-3 absolute top-0 left-0 right-0 z-50">
          <Loader2 className="animate-spin text-gray-400 w-6 h-6" />
        </div>
      )}
      {/* Top Bar */}
      <header className="bg-white border-b border-blue-100 sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
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

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Notification Banner */}
        <NotificationBanner />

        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-gray-900">
            Olá, {user?.full_name?.split(" ")[0] || "Jogador"}! 👋
          </h1>
          {/* No mobile a sequência ganhou card próprio logo abaixo das opções;
              repetir aqui seria a terceira vez na mesma tela. */}
          <p className="hidden md:block text-gray-500 text-sm mt-1">
            {streakDays > 0
              ? `🔥 ${streakDays} dia${streakDays > 1 ? "s" : ""} em sequência! Continue assim!`
              : "Comece a praticar para iniciar sua sequência!"}
          </p>
        </motion.div>

        {/* ══════════ MOBILE: 3 opções + 1 informação ══════════
            Ordem proposital: Módulos e Aprenda ECG (o que a assinatura vende)
            antes do Quiz (o que já é gratuito). Os dois primeiros aparecem
            para quem é gratuito com selo Premium — é assim que ele descobre o
            que está perdendo; sem assinatura o toque leva à tela de planos.
            Aprenda ECG é bloqueado por inteiro para quem não assina, então o
            selo diz a verdade. */}
        <div className="md:hidden space-y-3 mb-6">
          <Link to={createPageUrl(isPremium ? "Modules" : "Upgrade")} className="block">
            <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 active:scale-[0.99] transition-transform">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#22C55E] to-[#16a34a] flex items-center justify-center shadow-md flex-shrink-0">
                  <ListOrdered className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900 text-base">Módulos</p>
                    {!isPremium && (
                      <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] px-1.5 py-0">
                        <Crown className="w-2.5 h-2.5 mr-0.5" />
                        Premium
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">Siga uma trilha de aprendizado treinando desde o básico até casos mais avançados</p>
                </div>
                <ChevronRight className="w-5 h-5 text-green-400 flex-shrink-0" />
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl("AprendaECG")} className="block">
            <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 active:scale-[0.99] transition-transform">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1976D2] to-indigo-700 flex items-center justify-center shadow-md flex-shrink-0">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900 text-base">Aprenda ECG</p>
                    {!isPremium && (
                      <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] px-1.5 py-0">
                        <Crown className="w-2.5 h-2.5 mr-0.5" />
                        Premium
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">Ficou na dúvida ao resolver as questões? Aprenda a teoria aqui</p>
                </div>
                <ChevronRight className="w-5 h-5 text-indigo-400 flex-shrink-0" />
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl("Quiz")} className="block">
            <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 active:scale-[0.99] transition-transform">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1976D2] to-[#0D3B66] flex items-center justify-center shadow-md flex-shrink-0">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-base">Quiz</p>
                  <p className="text-xs text-gray-600 mt-0.5">Pratique ECG com casos variados e aleatórios</p>
                </div>
                <ChevronRight className="w-5 h-5 text-blue-400 flex-shrink-0" />
              </CardContent>
            </Card>
          </Link>

          {/* A informação */}
          <Card className="border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl flex items-center justify-center shadow-md flex-shrink-0">
                <Flame className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-black text-orange-600 leading-none">{streakDays}</p>
                <p className="text-sm text-orange-700 font-medium mt-0.5">
                  {streakDays === 1 ? "dia em sequência" : "dias em sequência"}
                </p>
              </div>
            </CardContent>
          </Card>

          {!isPremium && <PremiumUpsellCard />}
        </div>

        {/* ══════════ DESKTOP (web): layout original ══════════ */}
        <div className="hidden md:block">
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