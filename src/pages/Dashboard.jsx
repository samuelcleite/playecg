import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
// calculateStreakDays removed - using local version to avoid extra API call
import { loadUserAchievements } from "@/components/AchievementChecker";
import FaleConoscoButton from "@/components/FaleConoscoButton";
import StatsPanel from "@/components/home/StatsPanel";
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
import { motion, AnimatePresence } from "framer-motion";
import NotificationBanner from "@/components/NotificationBanner";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [streakDays, setStreakDays] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [dailyCaseAvailable, setDailyCaseAvailable] = useState(false);
  const [dailyCaseCompleted, setDailyCaseCompleted] = useState(false);
  const [stats, setStats] = useState({ total: 0, correct: 0, accuracy: 0 });

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const userData = await base44.auth.me();
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

      try {
        const res = await base44.functions.invoke("getDailyCase", {});
        if (res.data.success) {
          setDailyCaseAvailable(true);
          setDailyCaseCompleted(res.data.already_answered);
        }
      } catch (_) {}

    } catch (err) {
      console.error("Erro ao carregar Dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 w-full max-w-full">
      {/* Top Bar */}
      <header className="bg-white border-b border-blue-100 sticky top-0 z-40">
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
          <p className="text-gray-500 text-sm mt-1">
            {streakDays > 0
              ? `🔥 ${streakDays} dia${streakDays > 1 ? "s" : ""} em sequência! Continue assim!`
              : "Comece a praticar para iniciar sua sequência!"}
          </p>
        </motion.div>

        {/* Daily Challenge + Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <AnimatePresence>
            {dailyCaseAvailable && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <Link to={createPageUrl("DailyCase")}>
                  <Card className={`border-2 cursor-pointer hover:shadow-lg transition-all h-full ${dailyCaseCompleted ? "border-gray-200 bg-gray-50" : "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50"}`}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${dailyCaseCompleted ? "bg-gray-200" : "bg-gradient-to-br from-amber-400 to-orange-500 shadow-md"}`}>
                        ⭐
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm">Caso do Dia</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {dailyCaseCompleted ? "Concluído hoje ✓" : "Desafio diário disponível!"}
                        </p>
                      </div>
                      {!dailyCaseCompleted && (
                        <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0">
                          Fazer
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

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
                  <p className="font-bold text-gray-900 text-sm">Trilha de Aprendizado</p>
                  <p className="text-xs text-gray-500 mt-0.5">Continue seu aprendizado de onde parou!</p>
                </div>
                <ChevronRight className="w-5 h-5 text-green-400 flex-shrink-0" />
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        {/* Stats */}
        <StatsPanel
          stats={stats}
          streakDays={streakDays}
          earnedAchievements={earnedAchievements}
          isPremium={isPremium}
        />
      </div>

      <FaleConoscoButton />
    </div>
  );
}