import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { calculateStreakDays } from "@/components/StreakCalculator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Trophy, 
  Target, 
  Zap, 
  Award, 
  TrendingUp,
  Calendar,
  Crown,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Loader2,
  XCircle
} from "lucide-react";
import { motion } from "framer-motion";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [streakDays, setStreakDays] = useState(0);
  const [stats, setStats] = useState({
    totalAttempts: 0,
    correctAnswers: 0,
    accuracy: 0,
    totalPoints: 0,
    completedModules: 0
  });
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    specialty: "",
    state: "",
    city: ""
  });
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const userData = await base44.auth.me();
    setUser(userData);
    
    setFormData({
      full_name: userData.full_name || "",
      specialty: userData.specialty || "",
      state: userData.state || "",
      city: userData.city || ""
    });

    // Calcular streak_days a partir de QuizAttempt
    const streak = await calculateStreakDays(userData.email);
    setStreakDays(streak);

    const attempts = await base44.entities.QuizAttempt.filter({ user_email: userData.email });
    const correctCount = attempts.filter(a => a.correct).length;
    
    const progress = await base44.entities.UserProgress.filter({ user_email: userData.email });
    const completedCount = progress.filter(p => p.completed).length;

    setStats({
      totalAttempts: attempts.length,
      correctAnswers: correctCount,
      accuracy: attempts.length > 0 ? Math.round((correctCount / attempts.length) * 100) : 0,
      totalPoints: userData.points || 0,
      completedModules: completedCount
    });

    if (userData.subscription_type === 'premium') {
      await loadSubscriptionInfo();
    } else {
      setSubscriptionInfo(null);
    }
  };

  const loadSubscriptionInfo = async () => {
    try {
      console.log('🔍 Loading subscription info via backend function...');
      
      const response = await base44.functions.invoke('getUserSubscriptionInfo', {});

      console.log('📦 Function response:', response.data);

      if (response.data.success && response.data.hasSubscription) {
        const info = response.data.subscriptionInfo;
        
        setSubscriptionInfo({
          amount: info.amount,
          lastRenewal: new Date(info.lastRenewal),
          nextRenewal: new Date(info.nextRenewal),
          paymentMethod: info.paymentMethod,
          paymentId: info.paymentId
        });
        
        console.log('✅ Subscription info loaded successfully');
      } else {
        console.warn('⚠️ No subscription info available, using fallback data');
        
        const startDate = user?.subscription_start_date 
          ? new Date(user.subscription_start_date)
          : new Date(user?.created_date);
        
        const nextRenewal = new Date(startDate);
        nextRenewal.setDate(nextRenewal.getDate() + 30);

        setSubscriptionInfo({
          amount: 10.00,
          lastRenewal: startDate,
          nextRenewal: nextRenewal,
          paymentMethod: 'Manual',
          paymentId: null
        });
        
        console.log('✅ Using fallback subscription info');
      }
    } catch (error) {
      console.error('❌ Error loading subscription info:', error);
      
      const startDate = new Date(user?.subscription_start_date || user?.created_date);
      const nextRenewal = new Date(startDate);
      nextRenewal.setDate(nextRenewal.getDate() + 30);

      setSubscriptionInfo({
        amount: 10.00,
        lastRenewal: startDate,
        nextRenewal: nextRenewal,
        paymentMethod: 'Manual',
        paymentId: null
      });
    }
  };

  const handleSaveProfile = async () => {
    await base44.auth.updateMe(formData);
    setIsEditing(false);
    await loadData();
  };

  const handleCancelSubscription = async () => {
    setCancelling(true);
    setCancelError(null);

    try {
      const response = await base44.functions.invoke('cancelMercadoPagoSubscription', {});

      if (response.data.success) {
        setCancelSuccess(true);
        setShowCancelDialog(false);
        
        setTimeout(async () => {
          await loadData();
          setCancelSuccess(false);
        }, 3000);
      } else {
        setCancelError(response.data.error || 'Erro ao cancelar assinatura');
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      setCancelError(error.message || 'Erro ao cancelar assinatura. Tente novamente.');
    } finally {
      setCancelling(false);
    }
  };

  const isPremium = user?.subscription_type === "premium";

  const badges = [
    { 
      id: "first_correct", 
      name: "Primeira Vitória", 
      icon: "🎯", 
      description: "Acerte seu primeiro caso",
      earned: (user?.badges || []).includes("first_correct") || stats.correctAnswers > 0
    },
    { 
      id: "streak_7", 
      name: "Disciplina", 
      icon: "🔥", 
      description: "7 dias consecutivos praticando",
      earned: streakDays >= 7
    },
    { 
      id: "accuracy_80", 
      name: "Precisão", 
      icon: "🎪", 
      description: "80% de acurácia",
      earned: stats.accuracy >= 80 && stats.totalAttempts >= 10
    },
    { 
      id: "level_5", 
      name: "Ascensão", 
      icon: "⭐", 
      description: "Alcance o nível 5",
      earned: (user?.level || 1) >= 5
    },
    { 
      id: "level_10", 
      name: "Especialista", 
      icon: "💫", 
      description: "Alcance o nível 10",
      earned: (user?.level || 1) >= 10
    },
    { 
      id: "module_complete", 
      name: "Primeiro Módulo", 
      icon: "📚", 
      description: "Complete um módulo inteiro",
      earned: stats.completedModules > 0
    },
    { 
      id: "points_500", 
      name: "Colecionador", 
      icon: "💎", 
      description: "Acumule 500 pontos",
      earned: stats.totalPoints >= 500
    },
    { 
      id: "master", 
      name: "Mestre do ECG", 
      icon: "👑", 
      description: "Complete todos os módulos",
      earned: (user?.badges || []).includes("master")
    },
  ];

  const nextLevelPoints = (user?.level || 1) * 100;
  const currentLevelProgress = ((user?.points || 0) % 100);

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Cancel Success Alert */}
        {cancelSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <AlertDescription className="text-green-900 ml-2">
                <strong>Assinatura cancelada com sucesso!</strong>
                <p className="text-sm mt-1">Você foi retornado ao plano gratuito. Você ainda pode acessar os quizzes aleatórios.</p>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Header */}
        <div className="text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-4xl font-bold">
              {user?.full_name?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {user?.full_name || 'Usuário'}
          </h1>
          <p className="text-gray-600">{user?.email}</p>
          {user?.specialty && (
            <p className="text-blue-600 font-medium mt-1">{user.specialty}</p>
          )}
          {user?.city && user?.state && (
            <p className="text-gray-500 text-sm mt-1">
              {user.city}, {user.state}
            </p>
          )}
          <Badge className={`mt-3 ${isPremium ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gray-500'}`}>
            {isPremium ? (
              <span className="flex items-center gap-1">
                <Crown className="w-3 h-3" />
                Premium
              </span>
            ) : 'Gratuito'}
          </Badge>
        </div>

        {/* Subscription Info - Only for Premium Users */}
        {isPremium && (
          <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-6 h-6 text-amber-600" />
                Informações da Assinatura
              </CardTitle>
            </CardHeader>
            <CardContent>
              {subscriptionInfo ? (
                <>
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Plano Atual</p>
                      <p className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Crown className="w-5 h-5 text-amber-600" />
                        Premium - R$ {subscriptionInfo.amount.toFixed(2).replace('.', ',')}/mês
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Última Renovação</p>
                      <p className="text-lg font-medium text-gray-900">
                        {subscriptionInfo.lastRenewal.toLocaleDateString('pt-BR', { 
                          day: '2-digit', 
                          month: 'long', 
                          year: 'numeric' 
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Próxima Renovação</p>
                      <p className="text-lg font-medium text-gray-900">
                        {subscriptionInfo.nextRenewal.toLocaleDateString('pt-BR', { 
                          day: '2-digit', 
                          month: 'long', 
                          year: 'numeric' 
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Forma de Pagamento</p>
                      <p className="text-lg font-medium text-gray-900">
                        {subscriptionInfo.paymentMethod}
                      </p>
                    </div>
                  </div>

                  <Alert className="bg-blue-50 border-blue-200 mb-4">
                    <AlertCircle className="w-5 h-5 text-blue-600" />
                    <AlertDescription className="text-blue-900 ml-2">
                      <strong>Renovação Automática:</strong> Sua assinatura será renovada automaticamente todo mês. 
                      Você pode cancelar a qualquer momento sem multas.
                    </AlertDescription>
                  </Alert>

                  {subscriptionInfo.paymentMethod === 'Mercado Pago' && subscriptionInfo.paymentId && (
                    <Button
                      variant="outline"
                      className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setShowCancelDialog(true)}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancelar Assinatura
                    </Button>
                  )}

                  {(subscriptionInfo.paymentMethod === 'Manual' || !subscriptionInfo.paymentId) && (
                    <Alert className="bg-amber-50 border-amber-200">
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                      <AlertDescription className="text-amber-900">
                        Esta assinatura foi ativada manualmente. Entre em contato com o suporte para cancelamento.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-600 mx-auto mb-4" />
                  <p className="text-gray-600">Carregando informações da assinatura...</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Edit Profile Section */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Informações do Perfil</CardTitle>
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} variant="outline">
                  Editar Perfil
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => setIsEditing(false)} variant="outline">
                    Cancelar
                  </Button>
                  <Button onClick={handleSaveProfile} className="bg-blue-600 hover:bg-blue-700">
                    Salvar
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nome Completo</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="specialty">Especialidade</Label>
                  <Input
                    id="specialty"
                    value={formData.specialty}
                    onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Nome Completo</p>
                  <p className="text-lg font-medium text-gray-900">{user?.full_name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Especialidade</p>
                  <p className="text-lg font-medium text-gray-900">{user?.specialty || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Estado</p>
                  <p className="text-lg font-medium text-gray-900">{user?.state || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Cidade</p>
                  <p className="text-lg font-medium text-gray-900">{user?.city || '-'}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-none shadow-lg">
            <CardContent className="p-6 text-center">
              <Trophy className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900">{user?.level || 1}</p>
              <p className="text-sm text-gray-600">Nível</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardContent className="p-6 text-center">
              <Zap className="w-8 h-8 text-amber-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900">{stats.totalPoints}</p>
              <p className="text-sm text-gray-600">Pontos</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardContent className="p-6 text-center">
              <Target className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900">{stats.accuracy}%</p>
              <p className="text-sm text-gray-600">Precisão</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardContent className="p-6 text-center">
              <TrendingUp className="w-8 h-8 text-purple-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900">{stats.totalAttempts}</p>
              <p className="text-sm text-gray-600">Tentativas</p>
            </CardContent>
          </Card>
        </div>

        {/* Level Progress */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-blue-600" />
              Progresso de Nível
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Nível {user?.level || 1}</span>
                <span className="text-gray-600">
                  {currentLevelProgress}/100 pontos
                </span>
              </div>
              <Progress value={currentLevelProgress} className="h-3" />
              <p className="text-sm text-gray-600">
                Faltam {100 - currentLevelProgress} pontos para o próximo nível
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Badges */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-6 h-6 text-blue-600" />
              Conquistas ({badges.filter(b => b.earned).length}/{badges.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {badges.map((badge, index) => (
                <motion.div
                  key={badge.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-4 rounded-xl text-center transition-all duration-300 ${
                    badge.earned 
                      ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 shadow-md' 
                      : 'bg-gray-100 opacity-50'
                  }`}
                >
                  <div className="text-4xl mb-2">{badge.icon}</div>
                  <p className={`text-sm font-semibold mb-1 ${badge.earned ? 'text-gray-900' : 'text-gray-500'}`}>
                    {badge.name}
                  </p>
                  <p className="text-xs text-gray-600">{badge.description}</p>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Streak */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              Sequência de Dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-6xl mb-4">🔥</div>
              <p className="text-4xl font-bold text-gray-900 mb-2">
                {streakDays} dias
              </p>
              <p className="text-gray-600">
                Continue praticando para manter sua sequência!
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Stats */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Estatísticas Detalhadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total de Tentativas</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalAttempts}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Respostas Corretas</p>
                <p className="text-2xl font-bold text-green-600">{stats.correctAnswers}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Taxa de Acerto</p>
                <p className="text-2xl font-bold text-blue-600">{stats.accuracy}%</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Módulos Completos</p>
                <p className="text-2xl font-bold text-purple-600">{stats.completedModules}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cancel Subscription Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Cancelar Assinatura Premium?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Tem certeza que deseja cancelar sua assinatura Premium?</p>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="font-semibold text-amber-900 mb-2">O que você vai perder:</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-amber-800">
                  <li>Acesso aos módulos estruturados</li>
                  <li>Explicações detalhadas dos casos</li>
                  <li>Sistema completo de gamificação</li>
                  <li>Badges e conquistas exclusivas</li>
                  <li>Análise de desempenho detalhada</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="font-semibold text-blue-900 mb-2">Você ainda terá:</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
                  <li>Acesso aos quizzes aleatórios</li>
                  <li>Casos básicos de ECG</li>
                  <li>Pontuação básica</li>
                </ul>
              </div>

              {cancelError && (
                <Alert className="bg-red-50 border-red-200">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <AlertDescription className="text-red-900 ml-2">
                    {cancelError}
                  </AlertDescription>
                </Alert>
              )}

              <p className="text-sm text-gray-600">
                Após o cancelamento, você continuará com acesso Premium até o fim do período já pago.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>
              Manter Premium
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelando...
                </>
              ) : (
                'Sim, Cancelar Assinatura'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}