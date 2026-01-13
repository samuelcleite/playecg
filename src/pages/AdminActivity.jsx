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
            a.module_id === module.id && a.phase_id === phase.id && a.quiz_type === "module"
          );
          
          if (phaseAttempts.length > 0) {
            const correct = phaseAttempts.filter(a => a.correct).length;
            const incorrect = phaseAttempts.length - correct;
            const accuracy = phaseAttempts.length > 0 
              ? Math.round((correct / phaseAttempts.length) * 100) 
              : 0;
            
            // Calcular progresso de casos completados (igual à visão do usuário)
            const attemptsByCase = {};
            phaseAttempts.forEach(att => {
              if (!attemptsByCase[att.case_id]) {
                attemptsByCase[att.case_id] = [];
              }
              attemptsByCase[att.case_id].push(att);
            });

            let completedCases = 0;
            Object.keys(attemptsByCase).forEach(caseId => {
              const caseAttempts = attemptsByCase[caseId];
              const hasCorrect = caseAttempts.some(a => a.correct);
              const hasThreeAttempts = caseAttempts.length >= 3;

              if (hasCorrect || hasThreeAttempts) {
                completedCases++;
              }
            });

            const progress = phase.total_cases > 0 
              ? Math.round((completedCases / phase.total_cases) * 100)
              : 0;
            
            phaseStats[phase.id] = {
              phase: phase,
              total: phaseAttempts.length,
              correct,
              incorrect,
              accuracy,
              completedCases,
              totalCases: phase.total_cases,
              progress,
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

            {/* Modules and Phases Stats */}
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
                               <Badge 
                                 className={
                                   phaseData.progress >= 100 
                                     ? 'bg-green-500' 
                                     : phaseData.progress >= 50 
                                       ? 'bg-amber-500' 
                                       : 'bg-red-500'
                                 }
                               >
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