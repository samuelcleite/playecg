import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { calculateStreakDays } from "@/components/StreakCalculator";
import { loadUserAchievements } from "@/components/AchievementChecker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Award,
  Trophy,
  Lock,
  CheckCircle2,
  Target,
  Loader2
} from "lucide-react";
import { motion } from "framer-motion";

export default function Achievements() {
  const [user, setUser] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const userData = await base44.auth.me();
    setUser(userData);

    const streak = await calculateStreakDays(userData.email);

    const attempts = await base44.entities.QuizAttempt.filter({ user_email: userData.email });
    const correctCount = attempts.filter(a => a.correct).length;
    
    const progress = await base44.entities.UserProgress.filter({ user_email: userData.email });
    const completedCount = progress.filter(p => p.completed).length;

    const statsData = {
      totalAttempts: attempts.length,
      correctAnswers: correctCount,
      accuracy: attempts.length > 0 ? Math.round((correctCount / attempts.length) * 100) : 0,
      totalPoints: userData.points || 0,
      completedModules: completedCount
    };

    const userAchievements = await loadUserAchievements(userData, statsData, streak);
    setAchievements(userAchievements);
    setLoading(false);
  };

  const earnedCount = achievements.filter(a => a.earned).length;
  const totalCount = achievements.length;
  const completionPercentage = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Conquistas
          </h1>
          <p className="text-gray-600 text-lg">
            Acompanhe seu progresso e desbloqueie todas as conquistas
          </p>
        </div>

        {/* Progress Overview */}
        <Card className="border-none shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                  Seu Progresso
                </h2>
                <p className="text-gray-600">
                  {earnedCount} de {totalCount} conquistas desbloqueadas
                </p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-bold text-purple-600">
                  {completionPercentage}%
                </p>
                <p className="text-sm text-gray-600">Completo</p>
              </div>
            </div>
            <Progress value={completionPercentage} className="h-3" />
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="border-none shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Desbloqueadas</p>
                  <p className="text-3xl font-bold text-green-600">{earnedCount}</p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Bloqueadas</p>
                  <p className="text-3xl font-bold text-amber-600">{totalCount - earnedCount}</p>
                </div>
                <Lock className="w-10 h-10 text-amber-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="text-3xl font-bold text-blue-600">{totalCount}</p>
                </div>
                <Target className="w-10 h-10 text-blue-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Achievements Grid */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Award className="w-6 h-6 text-purple-600" />
            Todas as Conquistas
          </h2>

          {achievements.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {achievements.map((achievement, index) => (
                <motion.div
                  key={achievement.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className={`border-2 shadow-lg transition-all duration-300 h-full ${
                    achievement.earned 
                      ? 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-300 shadow-purple-100' 
                      : 'bg-gray-50 border-gray-200 opacity-75'
                  }`}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4 mb-4">
                        <div className={`text-5xl ${achievement.earned ? '' : 'grayscale opacity-50'}`}>
                          {achievement.icon}
                        </div>
                        <div className="flex-1">
                          {achievement.earned && (
                            <Badge className="bg-green-500 text-white mb-2">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Conquistada
                            </Badge>
                          )}
                          {!achievement.earned && (
                            <Badge variant="outline" className="bg-gray-100 mb-2">
                              <Lock className="w-3 h-3 mr-1" />
                              Bloqueada
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <h3 className={`text-lg font-bold mb-2 ${
                        achievement.earned ? 'text-gray-900' : 'text-gray-600'
                      }`}>
                        {achievement.name}
                      </h3>
                      
                      <p className={`text-sm mb-3 ${
                        achievement.earned ? 'text-gray-700' : 'text-gray-500'
                      }`}>
                        {achievement.description}
                      </p>

                      {!achievement.earned && achievement.requirement_type && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs text-gray-500">
                            <strong>Requisito:</strong> {achievement.requirement_type === 'first_correct' && 'Acerte sua primeira questão'}
                            {achievement.requirement_type === 'streak_days' && `Pratique por ${achievement.requirement_value} dias seguidos`}
                            {achievement.requirement_type === 'accuracy' && `Alcance ${achievement.requirement_value}% de precisão`}
                            {achievement.requirement_type === 'level' && `Chegue ao nível ${achievement.requirement_value}`}
                            {achievement.requirement_type === 'points' && `Acumule ${achievement.requirement_value} pontos`}
                            {achievement.requirement_type === 'completed_modules' && `Complete ${achievement.requirement_value} módulos`}
                            {achievement.requirement_type === 'total_attempts' && `Faça ${achievement.requirement_value} tentativas`}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            <Card className="border-none shadow-lg">
              <CardContent className="p-12 text-center">
                <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 mb-2">
                  Nenhuma conquista disponível ainda
                </p>
                <p className="text-sm text-gray-400">
                  As conquistas serão adicionadas em breve!
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}