import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Users,
  Crown,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  UserCheck,
  Search,
  Loader2,
  Trophy,
  Target,
  CreditCard,
  Mail,
  MapPin,
  Briefcase,
  TrendingUp,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";



export default function AdminUsers() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [attempts, setAttempts] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [processingUser, setProcessingUser] = useState(null);
  const [message, setMessage] = useState(null);
  const [expandedUser, setExpandedUser] = useState(null);
  const [selectedUserDetails, setSelectedUserDetails] = useState(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const userData = await base44.auth.me();
    if (userData.role !== "admin") {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    setCurrentUser(userData);
    await loadData();
  };

  const loadData = async () => {
    setLoading(true);
    
    // Carregar todos os usuários
    const usersData = await base44.entities.User.list('-created_date');
    setUsers(usersData);

    // Carregar todos os pagamentos
    const paymentsData = await base44.entities.Payment.list('-created_date');
    setPayments(paymentsData);

    // Carregar estatísticas de tentativas por usuário
    const allAttempts = await base44.entities.QuizAttempt.list();
    const attemptsMap = {};
    allAttempts.forEach(attempt => {
      if (!attemptsMap[attempt.user_email]) {
        attemptsMap[attempt.user_email] = {
          total: 0,
          correct: 0
        };
      }
      attemptsMap[attempt.user_email].total++;
      if (attempt.correct) {
        attemptsMap[attempt.user_email].correct++;
      }
    });
    setAttempts(attemptsMap);

    setLoading(false);
  };

  const handleActivateUser = async (userEmail) => {
    setProcessingUser(userEmail);
    setMessage(null);

    try {
      const response = await base44.functions.invoke('manuallyUpgradeToPremium', {
        user_email: userEmail
      });

      if (response.data.success) {
        setMessage({ type: 'success', text: `Usuário ${userEmail} ativado como Premium!` });
        await loadData();
      } else {
        setMessage({ type: 'error', text: response.data.error || 'Erro ao ativar usuário' });
      }
    } catch (error) {
      console.error('Error activating user:', error);
      setMessage({ type: 'error', text: 'Erro ao ativar usuário: ' + error.message });
    } finally {
      setProcessingUser(null);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleDeactivateUser = async (user) => {
    setProcessingUser(user.email);
    setMessage(null);

    try {
      await base44.entities.User.update(user.id, {
        subscription_type: 'free'
      });

      setMessage({ type: 'success', text: `Usuário ${user.email} alterado para Free!` });
      await loadData();
    } catch (error) {
      console.error('Error deactivating user:', error);
      setMessage({ type: 'error', text: 'Erro ao desativar usuário: ' + error.message });
    } finally {
      setProcessingUser(null);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const getUserPayments = (userEmail) => {
    return payments.filter(p => p.user_email === userEmail);
  };

  const getUserStats = (userEmail) => {
    const userAttempts = attempts[userEmail] || { total: 0, correct: 0 };
    return {
      totalAttempts: userAttempts.total,
      correctAnswers: userAttempts.correct,
      accuracy: userAttempts.total > 0 ? Math.round((userAttempts.correct / userAttempts.total) * 100) : 0
    };
  };

  const getStatusBadge = (status) => {
    const styles = {
      PAID: 'bg-green-100 text-green-800 border-green-200',
      PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      DECLINED: 'bg-red-100 text-red-800 border-red-200',
      CANCELED: 'bg-gray-100 text-gray-800 border-gray-200',
      EXPIRED: 'bg-orange-100 text-orange-800 border-orange-200'
    };

    const icons = {
      PAID: <CheckCircle2 className="w-3 h-3" />,
      PENDING: <Clock className="w-3 h-3" />,
      DECLINED: <XCircle className="w-3 h-3" />,
      CANCELED: <XCircle className="w-3 h-3" />,
      EXPIRED: <AlertCircle className="w-3 h-3" />
    };

    return (
      <Badge className={`${styles[status]} border flex items-center gap-1`}>
        {icons[status]}
        {status}
      </Badge>
    );
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || user.subscription_type === filterType;

    return matchesSearch && matchesType;
  });

  // Estatísticas gerais
  const stats = {
    total: users.length,
    premium: users.filter(u => u.subscription_type === 'premium').length,
    free: users.filter(u => u.subscription_type === 'free').length,
    totalRevenue: payments.filter(p => p.status === 'PAID').reduce((sum, p) => sum + p.amount, 0)
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando usuários...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gerenciar Usuários</h1>
          <p className="text-gray-500 mt-1">Visualize e gerencie todos os usuários da plataforma</p>
        </div>

        {/* Message Alert */}
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Alert className={message.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
                {message.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <AlertDescription className={message.type === 'success' ? 'text-green-900' : 'text-red-900'}>
                  {message.text}
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6">
          <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total de Usuários</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <Users className="w-10 h-10 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Usuários Premium</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.premium}</p>
                </div>
                <Crown className="w-10 h-10 text-amber-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-gray-50 to-slate-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Usuários Free</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.free}</p>
                </div>
                <Users className="w-10 h-10 text-gray-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Receita Total</p>
                  <p className="text-3xl font-bold text-gray-900">R$ {stats.totalRevenue.toFixed(2)}</p>
                </div>
                <CreditCard className="w-10 h-10 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-none shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  placeholder="Buscar por email ou nome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={filterType === 'all' ? 'default' : 'outline'}
                  onClick={() => setFilterType('all')}
                >
                  Todos
                </Button>
                <Button
                  variant={filterType === 'premium' ? 'default' : 'outline'}
                  onClick={() => setFilterType('premium')}
                  className={filterType === 'premium' ? 'bg-amber-600' : ''}
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Premium
                </Button>
                <Button
                  variant={filterType === 'free' ? 'default' : 'outline'}
                  onClick={() => setFilterType('free')}
                >
                  Free
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={loadData}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users List */}
        <div className="space-y-4">
          {filteredUsers.map(user => {
            const userPayments = getUserPayments(user.email);
            const userStats = getUserStats(user.email);
            const isPremium = user.subscription_type === 'premium';
            const isExpanded = expandedUser === user.id;
            const latestPayment = userPayments.filter(p => p.status === 'PAID').sort((a, b) => 
              new Date(b.created_date) - new Date(a.created_date)
            )[0];

            return (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
                  <CardContent className="p-6">
                    {/* User Header */}
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Avatar & Basic Info */}
                      <div className="flex items-start gap-4 flex-1">
                        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                          {user.full_name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="font-bold text-gray-900 text-lg truncate">
                              {user.full_name || 'Nome não informado'}
                            </h3>
                            <Badge className={isPremium ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-gray-100 text-gray-800'}>
                              {isPremium ? (
                                <span className="flex items-center gap-1">
                                  <Crown className="w-3 h-3" />
                                  Premium
                                </span>
                              ) : 'Free'}
                            </Badge>
                            {user.role === 'admin' && (
                              <Badge className="bg-purple-100 text-purple-800 border-purple-300">
                                Admin
                              </Badge>
                            )}
                          </div>
                          
                          <div className="space-y-1 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4" />
                              <span className="truncate">{user.email}</span>
                            </div>
                            {user.specialty && (
                              <div className="flex items-center gap-2">
                                <Briefcase className="w-4 h-4" />
                                <span>{user.specialty}</span>
                              </div>
                            )}
                            {user.city && user.state && (
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4" />
                                <span>{user.city}, {user.state}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <Trophy className="w-4 h-4 text-purple-600" />
                            <p className="text-xs text-gray-500">Nível</p>
                          </div>
                          <p className="text-xl font-bold text-gray-900">{user.level || 1}</p>
                        </div>
                        <div>
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <Target className="w-4 h-4 text-green-600" />
                            <p className="text-xs text-gray-500">Precisão</p>
                          </div>
                          <p className="text-xl font-bold text-gray-900">{userStats.accuracy}%</p>
                        </div>
                        <div>
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <TrendingUp className="w-4 h-4 text-blue-600" />
                            <p className="text-xs text-gray-500">Tentativas</p>
                          </div>
                          <p className="text-xl font-bold text-gray-900">{userStats.totalAttempts}</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 justify-center">
                        {isPremium ? (
                          <Button
                            onClick={() => handleDeactivateUser(user)}
                            disabled={processingUser === user.email}
                            variant="outline"
                            className="border-red-200 text-red-600 hover:bg-red-50"
                          >
                            {processingUser === user.email ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <XCircle className="w-4 h-4 mr-2" />
                                Desativar Premium
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleActivateUser(user.email)}
                            disabled={processingUser === user.email}
                            className="bg-amber-600 hover:bg-amber-700"
                          >
                            {processingUser === user.email ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <UserCheck className="w-4 h-4 mr-2" />
                                Ativar Premium
                              </>
                            )}
                          </Button>
                        )}
                        
                        <Button
                          variant="outline"
                          onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                          className="gap-2"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              Ocultar Detalhes
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              Ver Detalhes
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="mt-6 pt-6 border-t border-gray-200"
                        >
                          <div className="grid md:grid-cols-2 gap-6">
                            {/* Subscription Info */}
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <Crown className="w-5 h-5 text-amber-600" />
                                Informações de Assinatura
                              </h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Tipo:</span>
                                  <Badge className={isPremium ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}>
                                    {isPremium ? 'Premium' : 'Free'}
                                  </Badge>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Cadastrado em:</span>
                                  <span className="font-medium">{new Date(user.created_date).toLocaleDateString('pt-BR')}</span>
                                </div>
                                {isPremium && user.subscription_start_date && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Premium desde:</span>
                                    <span className="font-medium">{new Date(user.subscription_start_date).toLocaleDateString('pt-BR')}</span>
                                  </div>
                                )}
                                {latestPayment && (
                                  <>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Último pagamento:</span>
                                      <span className="font-medium">R$ {latestPayment.amount.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Data do pagamento:</span>
                                      <span className="font-medium">{new Date(latestPayment.created_date).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Payment History */}
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-green-600" />
                                Histórico de Pagamentos
                              </h4>
                              {userPayments.length > 0 ? (
                                <div className="space-y-2">
                                  {userPayments.slice(0, 3).map(payment => (
                                    <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">R$ {payment.amount.toFixed(2)}</p>
                                        <p className="text-xs text-gray-500">{new Date(payment.created_date).toLocaleDateString('pt-BR')}</p>
                                      </div>
                                      {getStatusBadge(payment.status)}
                                    </div>
                                  ))}
                                  {userPayments.length > 3 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-full text-purple-600 hover:text-purple-700"
                                    >
                                      Ver todos ({userPayments.length})
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <div className="text-center py-4 text-gray-500 text-sm">
                                  Nenhum pagamento registrado
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Activity Stats */}
                          <div className="mt-6">
                            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                              <TrendingUp className="w-5 h-5 text-blue-600" />
                              Estatísticas de Atividade
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="p-4 bg-blue-50 rounded-lg">
                                <p className="text-sm text-gray-600 mb-1">Pontos</p>
                                <p className="text-2xl font-bold text-blue-600">{user.points || 0}</p>
                              </div>
                              <div className="p-4 bg-purple-50 rounded-lg">
                                <p className="text-sm text-gray-600 mb-1">Nível</p>
                                <p className="text-2xl font-bold text-purple-600">{user.level || 1}</p>
                              </div>
                              <div className="p-4 bg-orange-50 rounded-lg">
                                <p className="text-sm text-gray-600 mb-1">Sequência</p>
                                <p className="text-2xl font-bold text-orange-600">{user.streak_days || 0} dias</p>
                              </div>
                              <div className="p-4 bg-green-50 rounded-lg">
                                <p className="text-sm text-gray-600 mb-1">Acertos</p>
                                <p className="text-2xl font-bold text-green-600">{userStats.correctAnswers}</p>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {filteredUsers.length === 0 && (
            <Card className="border-none shadow-lg">
              <CardContent className="p-12 text-center">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Nenhum usuário encontrado
                </h3>
                <p className="text-gray-600">
                  {searchTerm || filterType !== 'all' 
                    ? 'Tente ajustar os filtros de busca'
                    : 'Não há usuários cadastrados ainda'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}