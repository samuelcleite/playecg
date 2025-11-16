
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
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
  CheckCircle2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    totalAttempts: 0,
    correctAnswers: 0,
    accuracy: 0,
    recentAttempts: []
  });
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    checkPaymentReturn();
    loadData();
  }, []);

  const checkPaymentReturn = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const collectionStatus = urlParams.get('collection_status');
    const paymentId = urlParams.get('payment_id');
    const paymentSuccess = urlParams.get('payment');
    
    // Se retornou com payment=success ou do Mercado Pago com pagamento aprovado
    if (paymentSuccess === 'success' || (collectionStatus === 'approved' && paymentId)) {
      setPaymentProcessing(true);
      // Iniciar polling para verificar se o usuário foi atualizado para premium
      pollUserStatus();
    }
  };

  const pollUserStatus = async () => {
    let attempts = 0;
    const maxAttempts = 20; // 20 tentativas = 40 segundos (2s de intervalo)
    
    const checkStatus = async () => {
      try {
        const userData = await base44.auth.me();
        
        if (userData.subscription_type === 'premium') {
          setPaymentProcessing(false);
          setPaymentSuccess(true);
          setUser(userData);
          
          // Limpar os parâmetros da URL
          window.history.replaceState({}, '', createPageUrl('Dashboard'));
          
          // Esconder mensagem de sucesso após 5 segundos
          setTimeout(() => {
            setPaymentSuccess(false);
          }, 5000);
          
          return true;
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 2000); // Verificar novamente em 2 segundos
        } else {
          // Após 40 segundos, parar de tentar e mostrar mensagem
          setPaymentProcessing(false);
          setPaymentSuccess(true); // Mostrar mensagem mesmo sem confirmação automática
          window.history.replaceState({}, '', createPageUrl('Dashboard'));
          
          // Recarregar dados
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

    // Verificar se o perfil foi completado
    if (!userData.profile_completed) {
      navigate(createPageUrl("CompleteProfile"));
      return;
    }

    const attempts = await base44.entities.QuizAttempt.filter({ user_email: userData.email }, "-created_date", 100);
    const correctCount = attempts.filter(a => a.correct).length;
    
    setStats({
      totalAttempts: attempts.length,
      correctAnswers: correctCount,
      accuracy: attempts.length > 0 ? Math.round((correctCount / attempts.length) * 100) : 0,
      recentAttempts: attempts.slice(0, 5)
    });
  };

  const isPremium = user?.subscription_type === "premium";

  const badges = [
    { id: "first_correct", name: "Primeira Acerto", icon: "🎯", earned: (user?.badges || []).includes("first_correct") },
    { id: "streak_7", name: "7 Dias Seguidos", icon: "🔥", earned: (user?.badges || []).includes("streak_7") },
    { id: "level_5", name: "Nível 5", icon: "⭐", earned: (user?.level || 1) >= 5 },
    { id: "master", name: "Mestre do ECG", icon: "👑", earned: (user?.badges || []).includes("master") },
  ];

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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-none shadow-md bg-gradient-to-br from-blue-100 to-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="text-blue-900">
                  <p className="text-sm font-medium opacity-90">Nível</p>
                  <p className="text-3xl font-bold mt-1">{user?.level || 1}</p>
                </div>
                <div className="w-12 h-12 bg-white/50 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-blue-700" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-md bg-gradient-to-br from-amber-100 to-orange-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="text-amber-900">
                  <p className="text-sm font-medium opacity-90">Pontos</p>
                  <p className="text-3xl font-bold mt-1">{user?.points || 0}</p>
                </div>
                <div className="w-12 h-12 bg-white/50 rounded-xl flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-amber-700" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-md bg-gradient-to-br from-green-100 to-emerald-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="text-green-900">
                  <p className="text-sm font-medium opacity-90">Precisão</p>
                  <p className="text-3xl font-bold mt-1">{stats.accuracy}%</p>
                </div>
                <div className="w-12 h-12 bg-white/50 rounded-xl flex items-center justify-center">
                  <Target className="w-6 h-6 text-green-700" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-md bg-gradient-to-br from-purple-100 to-indigo-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="text-purple-900">
                  <p className="text-sm font-medium opacity-90">Sequência</p>
                  <p className="text-3xl font-bold mt-1">{user?.streak_days || 0} dias</p>
                </div>
                <div className="w-12 h-12 bg-white/50 rounded-xl flex items-center justify-center">
                  <Zap className="w-6 h-6 text-purple-700" />
                </div>
              </div>
            </CardContent>
          </Card>
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

        {/* Badges */}
        <Card className="border border-purple-100 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-800">
              <Award className="w-6 h-6 text-purple-600" />
              Conquistas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {badges.map(badge => (
                <div
                  key={badge.id}
                  className={`p-4 rounded-xl text-center transition-all duration-300 ${
                    badge.earned 
                      ? 'bg-gradient-to-br from-purple-100 to-pink-100 border-2 border-purple-300' 
                      : 'bg-gray-50 opacity-50 border border-gray-200'
                  }`}
                >
                  <div className="text-4xl mb-2">{badge.icon}</div>
                  <p className={`text-sm font-medium ${badge.earned ? 'text-gray-800' : 'text-gray-500'}`}>
                    {badge.name}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        {stats.recentAttempts.length > 0 && (
          <Card className="border border-blue-100 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-800">
                <Calendar className="w-6 h-6 text-blue-600" />
                Atividade Recente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.recentAttempts.map((attempt, index) => (
                  <div
                    key={attempt.id}
                    className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        attempt.correct ? 'bg-green-100 border-2 border-green-300' : 'bg-rose-100 border-2 border-rose-300'
                      }`}>
                        <span className={attempt.correct ? 'text-green-700' : 'text-rose-700'}>
                          {attempt.correct ? '✓' : '✗'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">Quiz #{stats.recentAttempts.length - index}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(attempt.created_date).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <Badge className={attempt.correct ? 'bg-green-200 text-green-800 border border-green-300' : 'bg-rose-200 text-rose-800 border border-rose-300'}>
                      {attempt.points_earned || 0} pts
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
