import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import {
  Activity,
  CheckCircle2,
  XCircle,
  TrendingUp,
  BookOpen,
  Target,
  Loader2,
  Users,
  BarChart3
} from "lucide-react";
import { motion } from "framer-motion";

export default function AdminActivity() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("geral");
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activityData, setActivityData] = useState(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [generalData, setGeneralData] = useState(null);
  const [loadingGeneral, setLoadingGeneral] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (activeTab === "geral" && !generalData && !loadingGeneral) {
      loadGeneralStats();
    }
  }, [activeTab]);

  const checkAdmin = async () => {
    const userData = await base44.auth.me();
    if (userData.role !== "admin") {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    const usersData = await base44.entities.User.list("full_name");
    setUsers(usersData);
    setLoading(false);
    loadGeneralStats();
  };

  const loadGeneralStats = async () => {
    setLoadingGeneral(true);
    try {
      const attempts = await base44.entities.QuizAttempt.filter({}, "-created_date", 5000);
      const modules = await base44.entities.Module.list("order");

      // Tentativas por dia (últimos 30 dias)
      const today = new Date();
      const last30 = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const dayAttempts = attempts.filter(a =>
          new Date(a.created_date).toISOString().split("T")[0] === dateStr
        );
        last30.push({
          date: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          tentativas: dayAttempts.length,
          corretas: dayAttempts.filter(a => a.correct).length
        });
      }

      // Distribuição por tipo de quiz
      const quizTypeData = [
        { name: "Aleatório", value: attempts.filter(a => a.quiz_type === "random").length, color: "#3D6EA8" },
        { name: "Módulo", value: attempts.filter(a => a.quiz_type === "module").length, color: "#39FF6A" },
        { name: "Diário", value: attempts.filter(a => a.quiz_type === "daily").length, color: "#F5A623" }
      ];

      // Tentativas por módulo
      const moduleData = modules.map(m => {
        const mAttempts = attempts.filter(a => a.module_id === m.id);
        return {
          name: m.name.length > 18 ? m.name.substring(0, 18) + "…" : m.name,
          tentativas: mAttempts.length,
          corretas: mAttempts.filter(a => a.correct).length
        };
      }).filter(m => m.tentativas > 0);

      // Usuários ativos por dia (últimos 30 dias)
      const activeUsers = last30.map(day => {
        const dayStr = day.date;
        const [d, m] = dayStr.split("/");
        const fullDate = `${new Date().getFullYear()}-${m}-${d}`;
        const uniqueUsers = new Set(
          attempts
            .filter(a => new Date(a.created_date).toISOString().split("T")[0] === fullDate)
            .map(a => a.user_email)
        ).size;
        return { date: dayStr, usuarios: uniqueUsers };
      });

      // Totais gerais
      const totalAttempts = attempts.length;
      const totalCorrect = attempts.filter(a => a.correct).length;
      const uniqueActiveUsers = new Set(attempts.map(a => a.user_email)).size;

      // Usuários mais ativos
      const userActivityMap = {};
      attempts.forEach(a => {
        if (!userActivityMap[a.user_email]) {
          userActivityMap[a.user_email] = { email: a.user_email, quiz: 0, modulo: 0 };
        }
        if (a.quiz_type === "random" || a.quiz_type === "daily") {
          userActivityMap[a.user_email].quiz++;
        } else if (a.quiz_type === "module") {
          userActivityMap[a.user_email].modulo++;
        }
      });
      const mostActiveUsers = Object.values(userActivityMap)
        .map(u => ({ ...u, total: u.quiz + u.modulo }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      setGeneralData({
        last30,
        quizTypeData,
        moduleData,
        activeUsers,
        mostActiveUsers,
        totals: {
          attempts: totalAttempts,
          correct: totalCorrect,
          accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
          uniqueUsers: uniqueActiveUsers
        }
      });
    } catch (error) {
      console.error("Error loading general stats:", error);
    } finally {
      setLoadingGeneral(false);
    }
  };

  const handleUserSelect = async (userId) => {
    setSelectedUserId(userId);
    const user = users.find(u => u.id === userId);
    setSelectedUser(user);
    if (user) {
      await loadUserActivity(user.email);
    }
  };

  const loadUserActivity = async (userEmail) => {
    setLoadingActivity(true);
    try {
      const attempts = await base44.entities.QuizAttempt.filter({ user_email: userEmail }, "-created_date", 2000);
      const modules = await base44.entities.Module.list("order");
      const phases = await base44.entities.Phase.list("order");

      const moduleStats = {};
      modules.forEach(module => {
        const modulePhases = phases.filter(p => p.module_id === module.id);
        const phaseStats = {};
        modulePhases.forEach(phase => {
          const phaseAttempts = attempts.filter(a =>
            a.module_id === module.id && a.phase_id === phase.id && a.quiz_type === "module"
          );
          if (phaseAttempts.length > 0) {
            const correct = phaseAttempts.filter(a => a.correct).length;
            const incorrect = phaseAttempts.length - correct;
            const accuracy = Math.round((correct / phaseAttempts.length) * 100);
            const attemptsByCase = {};
            phaseAttempts.forEach(att => {
              if (!attemptsByCase[att.case_id]) attemptsByCase[att.case_id] = [];
              attemptsByCase[att.case_id].push(att);
            });
            let completedCases = 0;
            Object.keys(attemptsByCase).forEach(caseId => {
              const ca = attemptsByCase[caseId];
              if (ca.some(a => a.correct) || ca.length >= 3) completedCases++;
            });
            const progress = phase.total_cases > 0 ? Math.round((completedCases / phase.total_cases) * 100) : 0;
            phaseStats[phase.id] = {
              phase, total: phaseAttempts.length, correct, incorrect, accuracy,
              completedCases, totalCases: phase.total_cases, progress,
              quizTypes: {
                random: phaseAttempts.filter(a => a.quiz_type === "random").length,
                module: phaseAttempts.filter(a => a.quiz_type === "module").length,
                daily: phaseAttempts.filter(a => a.quiz_type === "daily").length
              }
            };
          }
        });
        if (Object.keys(phaseStats).length > 0) {
          const moduleAttempts = attempts.filter(a => a.module_id === module.id);
          const moduleCorrect = moduleAttempts.filter(a => a.correct).length;
          moduleStats[module.id] = {
            module, total: moduleAttempts.length, correct: moduleCorrect,
            incorrect: moduleAttempts.length - moduleCorrect,
            accuracy: moduleAttempts.length > 0 ? Math.round((moduleCorrect / moduleAttempts.length) * 100) : 0,
            phases: phaseStats
          };
        }
      });

      const totalAttempts = attempts.length;
      const totalCorrect = attempts.filter(a => a.correct).length;
      setActivityData({
        modules: moduleStats,
        overall: {
          total: totalAttempts,
          correct: totalCorrect,
          incorrect: totalAttempts - totalCorrect,
          accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
          quizTypes: {
            random: attempts.filter(a => a.quiz_type === "random").length,
            module: attempts.filter(a => a.quiz_type === "module").length,
            daily: attempts.filter(a => a.quiz_type === "daily").length
          }
        }
      });
    } catch (error) {
      console.error("Error loading user activity:", error);
    } finally {
      setLoadingActivity(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gerenciar Atividade</h1>
            <p className="text-gray-500 mt-1">Análise detalhada da atividade dos usuários</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <Button
            onClick={() => setActiveTab("geral")}
            className={activeTab === "geral"
              ? "bg-[#0D3B66] hover:bg-[#0D3B66] text-white"
              : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Geral
          </Button>
          <Button
            onClick={() => setActiveTab("usuario")}
            className={activeTab === "usuario"
              ? "bg-[#0D3B66] hover:bg-[#0D3B66] text-white"
              : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}
          >
            <Users className="w-4 h-4 mr-2" />
            Usuário
          </Button>
        </div>

        {/* ── ABA GERAL ── */}
        {activeTab === "geral" && (
          <div className="space-y-6">
            {loadingGeneral ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
              </div>
            ) : generalData ? (
              <>
                {/* Totais */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="border-none shadow-md">
                    <CardContent className="p-5 flex flex-col items-center">
                      <Activity className="w-6 h-6 text-blue-600 mb-1" />
                      <p className="text-xs text-gray-500">Total de Tentativas</p>
                      <p className="text-3xl font-bold text-gray-900">{generalData.totals.attempts.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-md">
                    <CardContent className="p-5 flex flex-col items-center">
                      <CheckCircle2 className="w-6 h-6 text-green-600 mb-1" />
                      <p className="text-xs text-gray-500">Respostas Corretas</p>
                      <p className="text-3xl font-bold text-green-600">{generalData.totals.correct.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-md">
                    <CardContent className="p-5 flex flex-col items-center">
                      <Target className="w-6 h-6 text-purple-600 mb-1" />
                      <p className="text-xs text-gray-500">Taxa de Acerto</p>
                      <p className="text-3xl font-bold text-purple-600">{generalData.totals.accuracy}%</p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-md">
                    <CardContent className="p-5 flex flex-col items-center">
                      <Users className="w-6 h-6 text-amber-600 mb-1" />
                      <p className="text-xs text-gray-500">Usuários Ativos</p>
                      <p className="text-3xl font-bold text-amber-600">{generalData.totals.uniqueUsers}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Tentativas por dia */}
                <Card className="border-none shadow-md">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                      Tentativas nos Últimos 30 Dias
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={generalData.last30}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="tentativas" stroke="#3D6EA8" strokeWidth={2} dot={false} name="Total" />
                        <Line type="monotone" dataKey="corretas" stroke="#39FF6A" strokeWidth={2} dot={false} name="Corretas" />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Usuários ativos por dia */}
                <Card className="border-none shadow-md">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-5 h-5 text-amber-600" />
                      Usuários Ativos por Dia (Últimos 30 Dias)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={generalData.activeUsers}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="usuarios" fill="#F5A623" radius={[4, 4, 0, 0]} name="Usuários" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Distribuição por tipo */}
                  <Card className="border-none shadow-md">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="w-5 h-5 text-indigo-600" />
                        Distribuição por Tipo de Quiz
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={generalData.quizTypeData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {generalData.quizTypeData.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Usuários mais ativos */}
                  {generalData.mostActiveUsers.length > 0 && (
                    <Card className="border-none shadow-md">
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Users className="w-5 h-5 text-purple-600" />
                          Usuários Mais Ativos (Top 10)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="text-left px-4 py-2 text-gray-600 font-medium">#</th>
                              <th className="text-left px-4 py-2 text-gray-600 font-medium">Usuário</th>
                              <th className="text-center px-4 py-2 text-blue-600 font-medium">Quiz</th>
                              <th className="text-center px-4 py-2 text-green-600 font-medium">Módulo</th>
                              <th className="text-center px-4 py-2 text-gray-600 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {generalData.mostActiveUsers.map((u, i) => (
                              <tr key={u.email} className={`border-b ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                                <td className="px-4 py-2 font-bold text-gray-400">{i + 1}</td>
                                <td className="px-4 py-2 text-gray-900 truncate max-w-[180px]">{u.email}</td>
                                <td className="px-4 py-2 text-center">
                                  <Badge className="bg-blue-100 text-blue-700 font-semibold">{u.quiz}</Badge>
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <Badge className="bg-green-100 text-green-700 font-semibold">{u.modulo}</Badge>
                                </td>
                                <td className="px-4 py-2 text-center font-bold text-gray-900">{u.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Tentativas por módulo */}
                  {generalData.moduleData.length > 0 && (
                    <Card className="border-none shadow-md">
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <BookOpen className="w-5 h-5 text-green-600" />
                          Tentativas por Módulo
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={generalData.moduleData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis type="number" tick={{ fontSize: 11 }} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                            <Tooltip />
                            <Bar dataKey="tentativas" fill="#3D6EA8" radius={[0, 4, 4, 0]} name="Tentativas" />
                            <Bar dataKey="corretas" fill="#39FF6A" radius={[0, 4, 4, 0]} name="Corretas" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ── ABA USUÁRIO ── */}
        {activeTab === "usuario" && (
          <div className="space-y-6">
            {/* User Selector */}
            <Card className="border-none shadow-lg">
              <CardContent className="p-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Selecionar Usuário</label>
                  <Select value={selectedUserId} onValueChange={handleUserSelect}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Escolha um usuário para analisar" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.email} ({u.email})
                          {u.subscription_type === "premium" && (
                            <Badge className="ml-2 bg-amber-500">Premium</Badge>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {loadingActivity && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
              </div>
            )}

            {!loadingActivity && activityData && (
              <div className="space-y-6">
                {/* Overall Stats */}
                <Card className="border-none shadow-md">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
                      <div className="flex flex-col items-center justify-center p-3 bg-blue-50 rounded-lg">
                        <Activity className="w-5 h-5 text-blue-600 mb-1" />
                        <span className="text-xs text-gray-600">Total</span>
                        <p className="text-xl font-bold text-gray-900">{activityData.overall.total}</p>
                      </div>
                      <div className="flex flex-col items-center justify-center p-3 bg-green-50 rounded-lg">
                        <CheckCircle2 className="w-5 h-5 text-green-600 mb-1" />
                        <span className="text-xs text-gray-600">Corretas</span>
                        <p className="text-xl font-bold text-green-600">{activityData.overall.correct}</p>
                      </div>
                      <div className="flex flex-col items-center justify-center p-3 bg-red-50 rounded-lg">
                        <XCircle className="w-5 h-5 text-red-600 mb-1" />
                        <span className="text-xs text-gray-600">Incorretas</span>
                        <p className="text-xl font-bold text-red-600">{activityData.overall.incorrect}</p>
                      </div>
                      <div className="flex flex-col items-center justify-center p-3 bg-purple-50 rounded-lg">
                        <Target className="w-5 h-5 text-purple-600 mb-1" />
                        <span className="text-xs text-gray-600">Acerto</span>
                        <p className="text-xl font-bold text-purple-600">{activityData.overall.accuracy}%</p>
                      </div>
                      <div className="flex flex-col items-center justify-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <span className="text-xs text-gray-600 mb-1">Aleatório</span>
                        <p className="text-lg font-bold text-blue-600">{activityData.overall.quizTypes.random}</p>
                      </div>
                      <div className="flex flex-col items-center justify-center p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                        <span className="text-xs text-gray-600 mb-1">Módulo</span>
                        <p className="text-lg font-bold text-indigo-600">{activityData.overall.quizTypes.module}</p>
                      </div>
                      <div className="flex flex-col items-center justify-center p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <span className="text-xs text-gray-600 mb-1">Diário</span>
                        <p className="text-lg font-bold text-amber-600">{activityData.overall.quizTypes.daily}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Modules and Phases */}
                {Object.keys(activityData.modules).length > 0 ? (
                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-blue-600" />
                      Atividade por Módulo e Fase
                    </h2>
                    {Object.values(activityData.modules).map((moduleData, index) => (
                      <motion.div
                        key={moduleData.module.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <Card className="border-none shadow-md">
                          <CardHeader className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <CardTitle className="text-base font-semibold">{moduleData.module.name}</CardTitle>
                                <p className="text-xs text-gray-600 mt-0.5">{moduleData.module.description}</p>
                              </div>
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-gray-600">Total: <strong>{moduleData.total}</strong></span>
                                <span className="text-green-600">✓ <strong>{moduleData.correct}</strong></span>
                                <span className="text-red-600">✗ <strong>{moduleData.incorrect}</strong></span>
                                <Badge className="bg-blue-600">{moduleData.accuracy}%</Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="p-3">
                            <div className="space-y-2">
                              {Object.values(moduleData.phases).map((phaseData) => (
                                <div
                                  key={phaseData.phase.id}
                                  className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200 text-sm"
                                >
                                  <span className="font-medium text-gray-900 flex-1">{phaseData.phase.name}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-gray-600">Tentativas: <strong>{phaseData.total}</strong></span>
                                    <span className="text-green-600">✓ <strong>{phaseData.correct}</strong></span>
                                    <span className="text-red-600">✗ <strong>{phaseData.incorrect}</strong></span>
                                    <span className="text-gray-600">Taxa Acerto: <strong>{phaseData.accuracy}%</strong></span>
                                    <span className="text-indigo-600">Casos: <strong>{phaseData.completedCases}/{phaseData.totalCases}</strong></span>
                                    <Badge className={phaseData.progress >= 100 ? 'bg-green-500' : phaseData.progress >= 50 ? 'bg-amber-500' : 'bg-red-500'}>
                                      Progresso: {phaseData.progress}%
                                    </Badge>
                                    <span className="text-xs text-gray-500">
                                      (A:{phaseData.quizTypes.random} M:{phaseData.quizTypes.module} D:{phaseData.quizTypes.daily})
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <Card className="border-none shadow-lg">
                    <CardContent className="p-12 text-center">
                      <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Nenhuma atividade em módulos</h3>
                      <p className="text-gray-600">Este usuário ainda não fez tentativas em módulos organizados.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {!loadingActivity && !activityData && (
              <Card className="border-none shadow-lg">
                <CardContent className="p-12 text-center">
                  <Activity className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Selecione um usuário</h3>
                  <p className="text-gray-600">Escolha um usuário no menu acima para visualizar sua atividade detalhada</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}