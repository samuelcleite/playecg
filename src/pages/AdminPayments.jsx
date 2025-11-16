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
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  UserCheck,
  Search,
  Loader2
} from "lucide-react";
import { motion } from "framer-motion";

export default function AdminPayments() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [payments, setPayments] = useState([]);
  const [users, setUsers] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(null);
  const [message, setMessage] = useState(null);

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
    await loadData();
  };

  const loadData = async () => {
    setLoading(true);
    
    // Carregar todos os pagamentos
    const paymentsData = await base44.entities.Payment.list('-created_date');
    setPayments(paymentsData);

    // Carregar usuários correspondentes
    const allUsers = await base44.entities.User.list();
    const usersMap = {};
    allUsers.forEach(u => {
      usersMap[u.email] = u;
    });
    setUsers(usersMap);

    setLoading(false);
  };

  const handleActivateUser = async (payment) => {
    setProcessingPayment(payment.id);
    setMessage(null);

    try {
      const response = await base44.functions.invoke('manuallyUpgradeToPremium', {
        user_email: payment.user_email
      });

      if (response.data.success) {
        setMessage({ type: 'success', text: `Usuário ${payment.user_email} ativado como Premium!` });
        await loadData(); // Recarregar dados
      } else {
        setMessage({ type: 'error', text: response.data.error || 'Erro ao ativar usuário' });
      }
    } catch (error) {
      console.error('Error activating user:', error);
      setMessage({ type: 'error', text: 'Erro ao ativar usuário: ' + error.message });
    } finally {
      setProcessingPayment(null);
      
      // Limpar mensagem após 5 segundos
      setTimeout(() => setMessage(null), 5000);
    }
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

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = 
      payment.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.reference_id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || payment.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  // Estatísticas
  const stats = {
    total: payments.length,
    paid: payments.filter(p => p.status === 'PAID').length,
    pending: payments.filter(p => p.status === 'PENDING').length,
    problemPayments: payments.filter(p => 
      p.status === 'PAID' && users[p.user_email]?.subscription_type !== 'premium'
    ).length
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando pagamentos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gerenciar Pagamentos</h1>
          <p className="text-gray-500 mt-1">Visualize e resolva problemas com pagamentos</p>
        </div>

        {/* Message Alert */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
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

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6">
          <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <CreditCard className="w-10 h-10 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Pagos</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.paid}</p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-yellow-50 to-amber-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Pendentes</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.pending}</p>
                </div>
                <Clock className="w-10 h-10 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-red-50 to-rose-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Problemas</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.problemPayments}</p>
                </div>
                <AlertCircle className="w-10 h-10 text-red-600" />
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
                  placeholder="Buscar por email ou referência..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={filterStatus === 'all' ? 'default' : 'outline'}
                  onClick={() => setFilterStatus('all')}
                >
                  Todos
                </Button>
                <Button
                  variant={filterStatus === 'PAID' ? 'default' : 'outline'}
                  onClick={() => setFilterStatus('PAID')}
                  className={filterStatus === 'PAID' ? 'bg-green-600' : ''}
                >
                  Pagos
                </Button>
                <Button
                  variant={filterStatus === 'PENDING' ? 'default' : 'outline'}
                  onClick={() => setFilterStatus('PENDING')}
                  className={filterStatus === 'PENDING' ? 'bg-yellow-600' : ''}
                >
                  Pendentes
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

        {/* Payments List */}
        <div className="space-y-4">
          {filteredPayments.map(payment => {
            const userInfo = users[payment.user_email];
            const isProblem = payment.status === 'PAID' && userInfo?.subscription_type !== 'premium';

            return (
              <motion.div
                key={payment.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className={`border-none shadow-lg ${isProblem ? 'ring-2 ring-red-200' : ''}`}>
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Payment Info */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-bold text-gray-900">{payment.user_email}</h3>
                              {isProblem && (
                                <Badge className="bg-red-100 text-red-800 border-red-200">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  Ação Necessária
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">
                              Referência: {payment.reference_id}
                            </p>
                          </div>
                          {getStatusBadge(payment.status)}
                        </div>

                        <div className="grid md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Valor</p>
                            <p className="font-medium text-gray-900">
                              R$ {payment.amount.toFixed(2).replace('.', ',')}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Criado em</p>
                            <p className="font-medium text-gray-900">
                              {new Date(payment.created_date).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Status do Usuário</p>
                            <p className="font-medium">
                              {userInfo ? (
                                <Badge className={userInfo.subscription_type === 'premium' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}>
                                  {userInfo.subscription_type === 'premium' ? 'Premium' : 'Free'}
                                </Badge>
                              ) : (
                                <span className="text-gray-400">Usuário não encontrado</span>
                              )}
                            </p>
                          </div>
                        </div>

                        {payment.paid_at && (
                          <p className="text-sm text-gray-600">
                            Pago em: {new Date(payment.paid_at).toLocaleString('pt-BR')}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      {isProblem && (
                        <div className="flex items-center">
                          <Button
                            onClick={() => handleActivateUser(payment)}
                            disabled={processingPayment === payment.id}
                            className="bg-green-600 hover:bg-green-700 gap-2"
                          >
                            {processingPayment === payment.id ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Ativando...
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-4 h-4" />
                                Ativar Premium
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {filteredPayments.length === 0 && (
            <Card className="border-none shadow-lg">
              <CardContent className="p-12 text-center">
                <CreditCard className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Nenhum pagamento encontrado
                </h3>
                <p className="text-gray-600">
                  {searchTerm || filterStatus !== 'all' 
                    ? 'Tente ajustar os filtros de busca'
                    : 'Os pagamentos aparecerão aqui quando forem realizados'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}