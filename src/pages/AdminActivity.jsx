import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  CheckCircle2,
  XCircle,
  TrendingUp,
  BookOpen,
  Target,
  Loader2
} from "lucide-react";
import { motion } from "framer-motion";

export default function AdminActivity() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activityData, setActivityData] = useState(null);
  const [loadingActivity, setLoadingActivity] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const userData = await base44.auth.me();
    if (userData.role !== "admin") {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    setUser(userData);
    await loadUsers();
  };

  const loadUsers = async () => {
    const usersData = await base44.entities.User.list("full_name");
    setUsers(usersData);
    setLoading(false);
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
      // Buscar todas as tentativas do usuário
      const attempts = await base44.entities.QuizAttempt.filter({ 
        user_email: userEmail 
      }, "-created_date", 2000);

      // Buscar módulos e fases
      const modules = await base44.entities.Module.list("order");
      const phases = await base44.entities.Phase.list("order");

      // Agrupar por módulo e fase
      const moduleStats = {};
      
      modules.forEach(module => {
        const modulePhases = phases.filter(p => p.module_id === module.id);
        
        const phaseStats = {};
        
        modulePhases.forEach(phase => {
          const phaseAttempts = attempts.filter(a => 
            a.module_id === module.id && a.phase_id === phase.id
          );
          
          if (phaseAttempts.length > 0) {
            const correct = phaseAttempts.filter(a => a.correct).length;
            const incorrect = phaseAttempts.length - correct;
            const accuracy = phaseAttempts.length > 0 
              ? Math.round((correct / phaseAttempts.length) * 100) 
              : 0;
            
            phaseStats[phase.id] = {
              phase: phase,
              total: phaseAttempts.length,
              correct,
              incorrect,
              accuracy,
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
          const moduleIncorrect = moduleAttempts.length - moduleCorrect;
          const moduleAccuracy = moduleAttempts.length > 0 
            ? Math.round((moduleCorrect / moduleAttempts.length) * 100) 
            : 0;
          
          moduleStats[module.id] = {
            module: module,
            total: moduleAttempts.length,
            correct: moduleCorrect,
            incorrect: moduleIncorrect,
            accuracy: moduleAccuracy,
            phases: phaseStats
          };
        }
      });

      // Estatísticas gerais
      const totalAttempts = attempts.length;
      const totalCorrect = attempts.filter(a => a.correct).length;
      const totalIncorrect = totalAttempts - totalCorrect;
      const overallAccuracy = totalAttempts > 0 
        ? Math.round((totalCorrect / totalAttempts) * 100) 
        : 0;

      const quizTypeStats = {
        random: attempts.filter(a => a.quiz_type === "random").length,
        module: attempts.filter(a => a.quiz_type === "module").length,
        daily: attempts.filter(a => a.quiz_type === "daily").length
      };

      setActivityData({
        modules: moduleStats,
        overall: {
          total: totalAttempts,
          correct: totalCorrect,
          incorrect: totalIncorrect,
          accuracy: overallAccuracy,
          quizTypes: quizTypeStats
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

        {/* User Selector */}
        <Card className="border-none shadow-lg">
          <CardContent className="p-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Selecionar Usuário
              </label>
              <Select value={selectedUserId} onValueChange={handleUserSelect}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Escolha um usuário para analisar" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name || user.email} ({user.email})
                      {user.subscription_type === "premium" && (
                        <Badge className="ml-2 bg-amber-500">Premium</Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {loadingActivity && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
          </div>
        )}

        {/* Activity Data */}
        {!loadingActivity && activityData && (
          <div className="space-y-6">
            {/* Overall Stats */}
            <div className="grid md:grid-cols-4 gap-4">
              <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Total de Tentativas</span>
                    <Activity className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {activityData.overall.total}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Respostas Corretas</span>
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <p className="text-3xl font-bold text-green-600">
                    {activityData.overall.correct}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg bg-gradient-to-br from-red-50 to-rose-50">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Respostas Incorretas</span>
                    <XCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <p className="text-3xl font-bold text-red-600">
                    {activityData.overall.incorrect}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Taxa de Acerto</span>
                    <Target className="w-5 h-5 text-purple-600" />
                  </div>
                  <p className="text-3xl font-bold text-purple-600">
                    {activityData.overall.accuracy}%
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Quiz Type Stats */}
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Distribuição por Tipo de Quiz</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-gray-600 mb-1">Quiz Aleatório</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {activityData.overall.quizTypes.random}
                    </p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-sm text-gray-600 mb-1">Quiz por Módulo</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {activityData.overall.quizTypes.module}
                    </p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-sm text-gray-600 mb-1">Caso do Dia</p>
                    <p className="text-2xl font-bold text-amber-600">
                      {activityData.overall.quizTypes.daily}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Modules and Phases Stats */}
            {Object.keys(activityData.modules).length > 0 ? (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-blue-600" />
                  Atividade por Módulo e Fase
                </h2>

                {Object.values(activityData.modules).map((moduleData, index) => (
                  <motion.div
                    key={moduleData.module.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="border-none shadow-lg">
                      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-xl">{moduleData.module.name}</CardTitle>
                            <p className="text-sm text-gray-600 mt-1">
                              {moduleData.module.description}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600">Taxa de Acerto</p>
                            <p className="text-2xl font-bold text-blue-600">
                              {moduleData.accuracy}%
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="grid md:grid-cols-4 gap-4 mb-6">
                          <div>
                            <p className="text-sm text-gray-600">Total</p>
                            <p className="text-xl font-bold text-gray-900">{moduleData.total}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Corretas</p>
                            <p className="text-xl font-bold text-green-600">{moduleData.correct}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Incorretas</p>
                            <p className="text-xl font-bold text-red-600">{moduleData.incorrect}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Precisão</p>
                            <p className="text-xl font-bold text-purple-600">{moduleData.accuracy}%</p>
                          </div>
                        </div>

                        {/* Phases */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-gray-900">Fases</h4>
                          {Object.values(moduleData.phases).map((phaseData) => (
                            <div 
                              key={phaseData.phase.id}
                              className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <h5 className="font-medium text-gray-900">{phaseData.phase.name}</h5>
                                <Badge 
                                  className={
                                    phaseData.accuracy >= 80 
                                      ? 'bg-green-500' 
                                      : phaseData.accuracy >= 60 
                                        ? 'bg-amber-500' 
                                        : 'bg-red-500'
                                  }
                                >
                                  {phaseData.accuracy}% de acerto
                                </Badge>
                              </div>
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <p className="text-gray-600">Tentativas</p>
                                  <p className="font-bold text-gray-900">{phaseData.total}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Corretas</p>
                                  <p className="font-bold text-green-600">{phaseData.correct}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Incorretas</p>
                                  <p className="font-bold text-red-600">{phaseData.incorrect}</p>
                                </div>
                              </div>
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <p className="text-xs text-gray-500 mb-2">Distribuição por tipo:</p>
                                <div className="flex gap-3 text-xs">
                                  <span className="text-gray-600">
                                    Aleatório: <strong>{phaseData.quizTypes.random}</strong>
                                  </span>
                                  <span className="text-gray-600">
                                    Módulo: <strong>{phaseData.quizTypes.module}</strong>
                                  </span>
                                  <span className="text-gray-600">
                                    Diário: <strong>{phaseData.quizTypes.daily}</strong>
                                  </span>
                                </div>
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
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Nenhuma atividade em módulos
                  </h3>
                  <p className="text-gray-600">
                    Este usuário ainda não fez tentativas em módulos organizados.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* No User Selected State */}
        {!loadingActivity && !activityData && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <Activity className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Selecione um usuário
              </h3>
              <p className="text-gray-600">
                Escolha um usuário no menu acima para visualizar sua atividade detalhada
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}