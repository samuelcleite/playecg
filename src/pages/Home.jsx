import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { calculateStreakDays } from "@/components/StreakCalculator";
import { loadUserAchievements } from "@/components/AchievementChecker";
import FaleConoscoButton from "@/components/FaleConoscoButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Target, Trophy, Zap, BookOpen, TrendingUp,
  CheckCircle, Activity, Crown, ArrowRight, Flame,
  Star, Lock, Play, ChevronRight, Award, Calendar, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ────────────────────────────────────────────────
// Landing page (non-authenticated)
// ────────────────────────────────────────────────
function LandingPage({ onLogin }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-purple-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-xl">PlayECG</h1>
              <p className="text-xs text-gray-500">Aprenda ECG jogando</p>
            </div>
          </div>
          <Button onClick={onLogin} className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
            Entrar
          </Button>
        </div>
      </header>

      <section className="py-24 px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="text-6xl mb-6">❤️</div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 mb-6 leading-tight">
            Domine a leitura de<br />
            <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">ECG de vez</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Aprenda interpretação de eletrocardiograma com casos reais, gamificação e trilhas de aprendizado progressivas.
          </p>
          <Button onClick={onLogin} size="lg" className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-lg px-10 py-6 shadow-2xl rounded-2xl">
            Começar Gratuitamente
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <p className="text-sm text-gray-400 mt-4">✨ Sem cartão de crédito necessário</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-4xl mx-auto"
        >
          {[
            { icon: Brain, title: "Quiz Inteligente", desc: "Casos reais com feedback imediato" },
            { icon: BookOpen, title: "Trilha Estruturada", desc: "Aprenda do básico ao avançado" },
            { icon: Trophy, title: "Conquistas", desc: "Desbloqueie troféus e acompanhe seu progresso" }
          ].map((f, i) => (
            <Card key={i} className="border-none shadow-lg bg-white/80">
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <f.icon className="w-7 h-7 text-purple-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      </section>

      <footer className="bg-white/80 border-t border-purple-100 py-8 px-6 text-center text-sm text-gray-500">
        © 2026 PlayECG. Todos os direitos reservados.
      </footer>
    </div>
  );
}

// ────────────────────────────────────────────────
// Duolingo-style app (authenticated)
// ────────────────────────────────────────────────
function AppHome({ user }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [streakDays, setStreakDays] = useState(0);
  const [dailyCaseAvailable, setDailyCaseAvailable] = useState(false);
  const [dailyCaseCompleted, setDailyCaseCompleted] = useState(false);
  const [stats, setStats] = useState({ totalAttempts: 0, accuracy: 0, correctAnswers: 0 });
  const [earnedAchievements, setEarnedAchievements] = useState([]);
  const [modules, setModules] = useState([]);
  const [phases, setPhases] = useState([]);
  const [phaseProgress, setPhaseProgress] = useState({});
  const [nextPhase, setNextPhase] = useState(null);
  const isPremium = user?.subscription_type === "premium";

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const [streak, attempts, mods, phs, dailyRes, achievements] = await Promise.all([
      calculateStreakDays(user.email),
      base44.entities.QuizAttempt.filter({ user_email: user.email }, "-created_date", 1000),
      base44.entities.Module.list("order"),
      base44.entities.Phase.list("order"),
      base44.functions.invoke('getDailyCase', {}).catch(() => null),
      loadUserAchievements(user, {}, 0)
    ]);

    setStreakDays(streak);

    const correct = attempts.filter(a => a.correct).length;
    setStats({
      totalAttempts: attempts.length,
      correctAnswers: correct,
      accuracy: attempts.length > 0 ? Math.round((correct / attempts.length) * 100) : 0
    });

    setEarnedAchievements(achievements.filter(a => a.earned).slice(0, 4));

    if (dailyRes?.data?.success) {
      setDailyCaseAvailable(true);
      setDailyCaseCompleted(dailyRes.data.already_answered);
    }

    setModules(mods);
    setPhases(phs);

    // Calculate phase progress
    const moduleAttempts = attempts.filter(a => a.quiz_type === "module");
    const progress = {};
    let foundNext = null;

    for (const mod of mods) {
      const modPhases = phs.filter(p => p.module_id === mod.id).sort((a, b) => a.order - b.order);
      for (const phase of modPhases) {
        const phaseAtts = moduleAttempts.filter(a => a.phase_id === phase.id);
        const byCase = {};
        phaseAtts.forEach(a => {
          if (!byCase[a.case_id]) byCase[a.case_id] = [];
          byCase[a.case_id].push(a);
        });
        const completed = Object.values(byCase).filter(
          arr => arr.some(a => a.correct) || arr.length >= 3
        ).length;
        const total = phase.total_cases || 0;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        progress[phase.id] = { completed, total, pct };

        if (!foundNext && pct < 100) {
          foundNext = { module: mod, phase, completed, total, pct };
        }
      }
    }
    setPhaseProgress(progress);
    setNextPhase(foundNext);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-20 space-y-5">

        {/* Top bar: greeting + streak */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">
              Olá, {user?.full_name?.split(" ")[0] || "Jogador"}! 👋
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Continue sua jornada</p>
          </div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="flex items-center gap-2 bg-orange-100 border border-orange-200 rounded-2xl px-4 py-2 cursor-pointer"
            onClick={() => navigate(createPageUrl("Dashboard"))}
          >
            <Flame className="w-5 h-5 text-orange-500" />
            <span className="font-extrabold text-orange-600 text-lg">{streakDays}</span>
            <span className="text-xs text-orange-500 font-medium">dias</span>
          </motion.div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Tentativas", value: stats.totalAttempts, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Acertos", value: stats.correctAnswers, color: "text-green-600", bg: "bg-green-50" },
            { label: "Precisão", value: `${stats.accuracy}%`, color: "text-purple-600", bg: "bg-purple-50" }
          ].map((s, i) => (
            <Card key={i} className={`border-none shadow-sm ${s.bg}`}>
              <CardContent className="p-3 text-center">
                <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Daily Case CTA */}
        <AnimatePresence>
          {dailyCaseAvailable && !dailyCaseCompleted && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Link to={createPageUrl("DailyCase")}>
                <Card className="border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 shadow-lg hover:shadow-xl transition-all cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-md flex-shrink-0">
                        <Star className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <Badge className="bg-amber-200 text-amber-900 text-xs mb-1">Novo desafio ✨</Badge>
                        <p className="font-bold text-gray-900">Caso do Dia</p>
                        <p className="text-xs text-gray-500">Desafio exclusivo com explicação completa</p>
                      </div>
                    </div>
                    <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0">
                      Fazer <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Continue Learning (next phase) */}
        {isPremium && nextPhase && (
          <Link to={`${createPageUrl("ModuleDetail")}?module_id=${nextPhase.module.id}&phase_id=${nextPhase.phase.id}`}>
            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
              <Card className="border-2 border-indigo-300 bg-gradient-to-r from-indigo-50 to-purple-50 shadow-lg hover:shadow-xl transition-all cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-md">
                        <Play className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <Badge className="bg-indigo-100 text-indigo-800 text-xs mb-1">Continue de onde parou</Badge>
                        <p className="font-bold text-gray-900 text-sm">{nextPhase.module.name}</p>
                        <p className="text-xs text-gray-500">{nextPhase.phase.name}</p>
                      </div>
                    </div>
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white flex-shrink-0">
                      Continuar <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{nextPhase.completed}/{nextPhase.total} casos</span>
                      <span>{nextPhase.pct}%</span>
                    </div>
                    <Progress value={nextPhase.pct} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link to={createPageUrl("Quiz")}>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Card className="border-none shadow-md bg-gradient-to-br from-blue-500 to-indigo-600 hover:shadow-lg transition-all cursor-pointer h-full">
                <CardContent className="p-4">
                  <Brain className="w-8 h-8 text-white/80 mb-3" />
                  <p className="font-bold text-white text-sm">Quiz Aleatório</p>
                  <p className="text-xs text-blue-100 mt-1">Pratique com casos variados</p>
                  <div className="mt-3 flex items-center gap-1 text-white/90 text-xs font-medium">
                    Jogar Agora <ArrowRight className="w-3 h-3" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>

          {isPremium ? (
            <Link to={createPageUrl("Modules")}>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                <Card className="border-none shadow-md bg-gradient-to-br from-purple-500 to-pink-500 hover:shadow-lg transition-all cursor-pointer h-full">
                  <CardContent className="p-4">
                    <BookOpen className="w-8 h-8 text-white/80 mb-3" />
                    <p className="font-bold text-white text-sm">Ver Módulos</p>
                    <p className="text-xs text-purple-100 mt-1">Trilha estruturada de aprendizado</p>
                    <div className="mt-3 flex items-center gap-1 text-white/90 text-xs font-medium">
                      Explorar <ArrowRight className="w-3 h-3" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          ) : (
            <Link to={createPageUrl("Upgrade")}>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                <Card className="border-2 border-amber-300 shadow-md bg-gradient-to-br from-amber-50 to-orange-100 hover:shadow-lg transition-all cursor-pointer h-full">
                  <CardContent className="p-4">
                    <Crown className="w-8 h-8 text-amber-500 mb-3" />
                    <p className="font-bold text-amber-900 text-sm">Seja Premium</p>
                    <p className="text-xs text-amber-700 mt-1">Acesse a trilha completa</p>
                    <div className="mt-3 flex items-center gap-1 text-amber-700 text-xs font-medium">
                      Ver Planos <ArrowRight className="w-3 h-3" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          )}
        </div>

        {/* Learning path (modules + phases) */}
        {isPremium && modules.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" /> Trilha de Aprendizado
              </h2>
              <Link to={createPageUrl("Modules")} className="text-xs text-indigo-600 font-medium flex items-center gap-1">
                Ver tudo <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {modules.map((mod, modIdx) => {
                const modPhases = phases.filter(p => p.module_id === mod.id).sort((a, b) => a.order - b.order);
                if (modPhases.length === 0) return null;
                const completedPhases = modPhases.filter(p => phaseProgress[p.id]?.pct >= 100).length;
                const modPct = Math.round((completedPhases / modPhases.length) * 100);

                return (
                  <motion.div
                    key={mod.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: modIdx * 0.05 }}
                  >
                    <Card className="border-none shadow-sm bg-white">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${modPct >= 100 ? "bg-green-100 text-green-700" : "bg-indigo-100 text-indigo-700"}`}>
                              {modPct >= 100 ? "✓" : modIdx + 1}
                            </div>
                            <span className="font-semibold text-gray-900 text-sm">{mod.name}</span>
                          </div>
                          <span className="text-xs text-gray-400">{completedPhases}/{modPhases.length} fases</span>
                        </div>
                        <Progress value={modPct} className="h-1.5 mb-3" />
                        <div className="flex flex-wrap gap-2">
                          {modPhases.map((phase) => {
                            const prog = phaseProgress[phase.id] || { pct: 0 };
                            const done = prog.pct >= 100;
                            const active = nextPhase?.phase.id === phase.id;
                            return (
                              <Link
                                key={phase.id}
                                to={`${createPageUrl("ModuleDetail")}?module_id=${mod.id}&phase_id=${phase.id}`}
                              >
                                <motion.div
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  className={`relative w-10 h-10 rounded-full flex items-center justify-center shadow-sm border-2 transition-all
                                    ${done ? "bg-green-500 border-green-400" :
                                      active ? "bg-indigo-500 border-indigo-400 ring-2 ring-indigo-300 ring-offset-1" :
                                      "bg-gray-100 border-gray-200"}`}
                                >
                                  {done ? (
                                    <CheckCircle className="w-5 h-5 text-white" />
                                  ) : active ? (
                                    <Play className="w-4 h-4 text-white" />
                                  ) : (
                                    <span className="text-xs font-bold text-gray-400">{phase.order}</span>
                                  )}
                                </motion.div>
                              </Link>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent achievements */}
        {earnedAchievements.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                <Award className="w-5 h-5 text-purple-600" /> Conquistas Recentes
              </h2>
              <Link to={createPageUrl("Achievements")} className="text-xs text-indigo-600 font-medium flex items-center gap-1">
                Ver todas <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {earnedAchievements.map((ach, i) => (
                <motion.div
                  key={ach.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="border-none shadow-sm bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
                    <CardContent className="p-3 text-center">
                      <div className="text-3xl mb-1">{ach.icon}</div>
                      <p className="text-[10px] font-semibold text-gray-700 leading-tight line-clamp-2">{ach.name}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Aprenda ECG link */}
        <Link to={createPageUrl("AprendaECG")}>
          <Card className="border-none shadow-sm bg-white hover:shadow-md transition-all cursor-pointer">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Aprenda ECG</p>
                  <p className="text-xs text-gray-500">Conteúdo educacional completo</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </CardContent>
          </Card>
        </Link>

      </div>

      <FaleConoscoButton />
    </div>
  );
}

// ────────────────────────────────────────────────
// Root component
// ────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me()
      .then((u) => {
        if (u) setUser(u);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = () => {
    base44.auth.redirectToLogin(window.location.origin + createPageUrl("Dashboard"));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!user) return <LandingPage onLogin={handleLogin} />;

  return <AppHome user={user} />;
}