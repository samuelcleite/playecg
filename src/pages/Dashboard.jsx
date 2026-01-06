import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { calculateStreakDays } from "@/components/StreakCalculator";
import { loadUserAchievements } from "@/components/AchievementChecker";
import { 
  Brain, 
  Trophy, 
  Target, 
  Zap, 
  BookOpen, 
  Crown,
  TrendingUp,
  Calendar,
  Award,
  Loader2,
  CheckCircle2,
  Sparkles,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [streakDays, setStreakDays] = useState(0);
  const [stats, setStats] = useState({
    totalAttempts: 0,
    correctAnswers: 0,
    accuracy: 0,
    recentAttempts: []
  });
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [achievements, setAchievements] = useState([]);
  const [nextIncompletePhase, setNextIncompletePhase] = useState(null);

  useEffect(() => {
    checkPaymentReturn();
    loadData();
  }, []);

  const checkPaymentReturn = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const collectionStatus = urlParams.get('collection_status');
    const paymentId = urlParams.get('payment_id');
    const paymentSuccess = urlParams.get('payment');
    
    if (paymentSuccess === 'success' || (collectionStatus === 'approved' && paymentId)) {
      setPaymentProcessing(true);
      pollUserStatus();
    }
  };

  const pollUserStatus = async () => {
    let attempts = 0;
    const maxAttempts = 20;
    
    const checkStatus = async () => {
      try {
        const userData = await base44.auth.me();
        
        if (userData.subscription_type === 'premium') {
          setPaymentProcessing(false);
          setPaymentSuccess(true);
          setUser(userData);
          
          window.history.replaceState({}, '', createPageUrl('Dashboard'));
          
          setTimeout(() => {
            setPaymentSuccess(false);
          }, 5000);
          
          return true;
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 2000);
        } else {
          setPaymentProcessing(false);
          setPaymentSuccess(true);
          window.history.replaceState({}, '', createPageUrl('Dashboard'));
          
          loadData();
        }
      } catch (error) {
        console.error('Erro ao verificar status:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 2000);
        } else {
          setPaymentProcessing(false);
          loadData();
        }
      }
    };
    
    checkStatus();
  };

  const loadData = async () => {
    const userData = await base44.auth.me();
    setUser(userData);

    if (!userData.profile_completed) {
      navigate(createPageUrl("CompleteProfile"));
      return;
    }

    const streak = await calculateStreakDays(userData.email);
    setStreakDays(streak);

    const attempts = await base44.entities.QuizAttempt.filter({ user_email: userData.email }, "-created_date", 100);
    const correctCount = attempts.filter(a => a.correct).length;
    
    const progress = await base44.entities.UserProgress.filter({ user_email: userData.email });
    const completedCount = progress.filter(p => p.completed).length;
    
    const statsData = {
      totalAttempts: attempts.length,
      correctAnswers: correctCount,
      accuracy: attempts.length > 0 ? Math.round((correctCount / attempts.length) * 100) : 0,
      recentAttempts: attempts.slice(0, 5),
      completedModules: completedCount
    };

    setStats(statsData);

    // Carregar todas as conquistas
    const userAchievements = await loadUserAchievements(userData, statsData, streak);
    setAchievements(userAchievements);
  };

  const isPremium = user?.subscription_type === "premium";
  const earnedAchievements = achievements.filter(a => a.earned);

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Payment Processing Alert */}
        <AnimatePresence>
          {paymentProcessing && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Alert className="bg-blue-50 border-blue-200">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <AlertDescription className="text-blue-900 ml-2">
                  <strong>Processando seu pagamento...</strong>
                  <p className="text-sm mt-1">Aguarde enquanto confirmamos sua assinatura Premium. Isso pode levar alguns segundos.</p>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {paymentSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Alert className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <AlertDescription className="ml-2">
                  <div className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-amber-600" />
                    <strong className="text-green-900 text-lg">Parabéns! {isPremium ? 'Você agora é Premium!' : 'Pagamento processado!'} 🎉</strong>
                  </div>
                  <p className="text-sm text-green-800 mt-2">
                    {isPremium 
                      ? 'Agora você tem acesso completo aos módulos estruturados, explicações detalhadas e gamificação avançada!'
                      : 'Seu pagamento foi processado com sucesso! Se você ainda não aparecer como Premium, aguarde alguns minutos ou recarregue a página.'}
                  </p>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800">
              Olá, {user?.full_name?.split(' ')[0] || 'Estudante'}! 👋
            </h1>
            <p className="text-gray-500 mt-2">
              {isPremium ? 'Continue sua jornada de aprendizado' : 'Pratique com nossos quizzes'}
            </p>
          </div>
          {!isPremium && (
            <Link to={createPageUrl("Upgrade")}>
              <Button className="bg-gradient-to-r from-amber-200 to-orange-200 hover:from-amber-300 hover:to-orange-300 text-amber-900 gap-2 border border-amber-300 shadow-md">
                <Crown className="w-5 h-5" />
                Upgrade Premium
              </Button>
            </Link>
          )}
        </div>



        {/* Main Actions */}
        <div className="grid md:grid-cols-2 gap-6">
          <Link to={createPageUrl("Quiz")}>
            <Card className="border border-blue-200 shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer h-full bg-gradient-to-br from-blue-50 to-indigo-100">
              <CardContent className="p-8">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-200 to-indigo-200 rounded-2xl flex items-center justify-center shadow-md border border-blue-300">
                    <Brain className="w-8 h-8 text-blue-700" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-800 mb-2">Quiz Aleatório</h3>
                    <p className="text-gray-600 mb-4">
                      Pratique com casos de ECG variados e teste seus conhecimentos
                    </p>
                    <Button className="bg-gradient-to-r from-blue-200 to-indigo-200 hover:from-blue-300 hover:to-indigo-300 text-blue-900 border border-blue-300">
                      Começar Quiz
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {isPremium ? (
            <Link to={createPageUrl("Modules")}>
              <Card className="border border-purple-200 shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer h-full bg-gradient-to-br from-purple-50 to-pink-100">
                <CardContent className="p-8">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-200 to-pink-200 rounded-2xl flex items-center justify-center shadow-md border border-purple-300">
                      <BookOpen className="w-8 h-8 text-purple-700" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-800 mb-2">Módulos Estruturados</h3>
                      <p className="text-gray-600 mb-4">
                        Aprenda de forma progressiva com trilha gamificada
                      </p>
                      <Button className="bg-gradient-to-r from-purple-200 to-pink-200 hover:from-purple-300 hover:to-pink-300 text-purple-900 border border-purple-300">
                        Ver Módulos
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ) : (
            <Link to={createPageUrl("Upgrade")}>
              <Card className="border-2 border-amber-200 shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer h-full bg-gradient-to-br from-amber-50 to-orange-100">
                <CardContent className="p-8">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-amber-200 to-orange-200 rounded-2xl flex items-center justify-center shadow-md border border-amber-300">
                      <Crown className="w-8 h-8 text-amber-700" />
                    </div>
                    <div className="flex-1">
                      <Badge className="bg-amber-200 text-amber-900 mb-3 border border-amber-300">Premium</Badge>
                      <h3 className="text-xl font-bold text-gray-800 mb-2">Desbloqueie Módulos</h3>
                      <p className="text-gray-600 mb-4">
                        Acesse trilha estruturada e gamificação completa
                      </p>
                      <Button className="bg-gradient-to-r from-amber-200 to-orange-200 hover:from-amber-300 hover:to-orange-300 text-amber-900 border border-amber-300">
                        Ver Planos
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>

        {/* Conquistas Atingidas */}
        <Card className="border border-purple-100 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-800">
              <Award className="w-6 h-6 text-purple-600" />
              Conquistas Atingidas ({earnedAchievements.length}/{achievements.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {earnedAchievements.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {earnedAchievements.map((achievement, index) => (
                  <motion.div
                    key={achievement.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-4 rounded-xl text-center transition-all duration-300 bg-gradient-to-br from-purple-100 to-pink-100 border-2 border-purple-300 shadow-md"
                  >
                    <div className="text-4xl mb-2">{achievement.icon}</div>
                    <p className="text-sm font-semibold text-gray-800 mb-1">
                      {achievement.name}
                    </p>
                    <p className="text-xs text-gray-600">{achievement.description}</p>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-purple-600" />
                </div>
                <p className="text-gray-600 mb-2">
                  Você ainda não desbloqueou nenhuma conquista
                </p>
                <p className="text-sm text-gray-500">
                  Continue praticando para desbloquear suas primeiras conquistas!
                </p>
              </div>
            )}
          </CardContent>
        </Card>


      </div>
    </div>
  );
}