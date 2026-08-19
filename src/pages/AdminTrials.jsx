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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Gift,
  Clock,
  CheckCircle2,
  XCircle,
  Crown,
  Search,
  Loader2,
  RefreshCw,
  Ban,
  Plus,
  AlertTriangle,
  Mail,
  CalendarClock,
  Eraser,
  Users
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TrialBulkGrant from "@/components/admin/TrialBulkGrant";
import TrialAuditPanel from "@/components/admin/TrialAuditPanel";
import { motion, AnimatePresence } from "framer-motion";

// AdminTrials — concessão e acompanhamento de acesso de cortesia.
// -----------------------------------------------------------------------------
// Tela só de admin, só web. O gate de verdade está no backend: adminGrantTrial,
// adminRevokeTrial, adminListTrials e adminExpireTrials todos exigem
// `role === 'admin'`, que só a sessão hospedada do Base44 concede — JWT próprio
// nunca vira admin, por decisão de arquitetura (ARQUITETURA_AUTH.md §1). O
// checkAdmin daqui é conveniência de navegação, não segurança: ele evita que um
// não-admin veja a tela vazia, mas não é ele que protege os dados.
//
// A tela NÃO expira nada por conta própria. Quem tira o acesso vencido é o
// getMyAccount, no acesso do próprio usuário. O botão "Encerrar vencidos" existe
// só para limpar quem não voltou ao app e continua contando como premium nos
// relatórios.
// -----------------------------------------------------------------------------

// Durações oferecidas. São atalhos, não uma regra: 7 dias é o padrão de teste,
// 30 cobre um ciclo mensal inteiro e 90 é para parceria/palestra.
const DURACOES = [3, 7, 14, 30, 60, 90];

const ESTADOS = {
  ativo: {
    label: "Em cortesia",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    icon: Clock
  },
  premium: {
    label: "Virou premium",
    badge: "bg-amber-100 text-amber-800 border-amber-300",
    icon: Crown
  },
  expirado: {
    label: "Expirado",
    badge: "bg-gray-100 text-gray-700 border-gray-300",
    icon: CheckCircle2
  },
  revogado: {
    label: "Revogado",
    badge: "bg-red-100 text-red-800 border-red-300",
    icon: Ban
  },
  sem_conta: {
    label: "Conta excluída",
    badge: "bg-slate-100 text-slate-600 border-slate-300",
    icon: AlertTriangle
  }
};

function dataCurta(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export default function AdminTrials() {
  const navigate = useNavigate();
  const [trials, setTrials] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [contas, setContas] = useState([]);
  const [auditoria, setAuditoria] = useState(null);
  const [auditando, setAuditando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const [email, setEmail] = useState("");
  const [dias, setDias] = useState("7");
  const [motivo, setMotivo] = useState("");
  const [concedendo, setConcedendo] = useState(false);

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [processando, setProcessando] = useState(null);
  const [expirando, setExpirando] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const userData = await base44.auth.me();
    if (userData.role !== "admin") {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    await loadData();
    // Fora do await de cima: a auditoria varre Account, TrialGrant e Payment, e
    // é a chamada mais cara da tela. Segurar a lista por causa dela deixaria o
    // admin olhando um spinner por causa de um painel secundário.
    auditar();
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [resTrials, resContas] = await Promise.all([
        base44.functions.invoke("adminListTrials", {}),
        // A lista de contas alimenta os filtros do lote. Vem do mesmo endpoint
        // que a tela de usuários usa — nenhuma leitura nova de entidade.
        base44.functions.invoke("adminListAccounts", {})
      ]);
      setTrials(resTrials?.data?.trials || []);
      setResumo(resTrials?.data?.resumo || null);
      setContas(resContas?.data?.accounts || []);
    } catch (error) {
      console.error("Erro ao carregar cortesias:", error);
      avisar("error", "Não foi possível carregar as cortesias: " + error.message);
    }
    setLoading(false);
  };

  const auditar = async () => {
    setAuditando(true);
    try {
      const res = await base44.functions.invoke("auditTrialInvariants", {});
      setAuditoria(res?.data || null);
    } catch (error) {
      console.error("Erro na auditoria de cortesias:", error);
      setAuditoria({
        erro: error?.response?.data?.error || error?.message || "falha ao verificar"
      });
    }
    setAuditando(false);
  };

  // 8 segundos, e não os 5 do AdminUsers: as mensagens de recusa aqui explicam
  // POR QUE não deu (conta paga, vitalícia, inexistente) e são o único lugar
  // onde essa explicação aparece.
  const avisar = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 8000);
  };

  const handleConceder = async () => {
    const alvo = email.trim().toLowerCase();
    if (!alvo) return;

    setConcedendo(true);
    try {
      const res = await base44.functions.invoke("adminGrantTrial", {
        user_email: alvo,
        days: Number(dias),
        reason: motivo.trim()
      });

      const d = res?.data;
      if (d?.success) {
        avisar(
          "success",
          `${alvo}: ${d.extension ? "prazo estendido" : "cortesia concedida"} por ${d.days} dias, até ${dataCurta(d.trial_ends_at)}.`
        );
        setEmail("");
        setMotivo("");
        await loadData();
      } else {
        avisar("error", d?.error || "Não foi possível conceder a cortesia.");
      }
    } catch (error) {
      // As recusas de regra (conta paga, vitalícia, inexistente) chegam como
      // status 4xx e viram exceção no SDK. A mensagem do backend é a parte útil
      // — ela diz qual regra barrou —, então é ela que vai para a tela.
      const msg = error?.response?.data?.error || error?.message || "Erro ao conceder";
      avisar("error", msg);
    }
    setConcedendo(false);
  };

  const handleRevogar = async (t) => {
    if (!window.confirm(
      `Encerrar agora a cortesia de ${t.user_email}? O acesso premium é removido imediatamente.`
    )) return;

    setProcessando(t.user_email);
    try {
      const res = await base44.functions.invoke("adminRevokeTrial", {
        user_email: t.user_email
      });
      if (res?.data?.success) {
        avisar("success", `Cortesia de ${t.user_email} encerrada.`);
        await loadData();
      } else {
        avisar("error", res?.data?.error || "Não foi possível revogar.");
      }
    } catch (error) {
      const msg = error?.response?.data?.error || error?.message || "Erro ao revogar";
      avisar("error", msg);
    }
    setProcessando(null);
  };

  const handleExpirarVencidos = async () => {
    setExpirando(true);
    try {
      const res = await base44.functions.invoke("adminExpireTrials", {});
      const d = res?.data;
      if (d?.success) {
        avisar(
          "success",
          d.rebaixadas === 0 && d.preservadas === 0
            ? "Nenhuma cortesia vencida pendente."
            : `${d.rebaixadas} conta(s) rebaixada(s) para free.` +
              (d.preservadas > 0 ? ` ${d.preservadas} preservada(s) por terem acesso pago.` : "")
        );
        await loadData();
      } else {
        avisar("error", d?.error || "Não foi possível rodar a varredura.");
      }
    } catch (error) {
      const msg = error?.response?.data?.error || error?.message || "Erro na varredura";
      avisar("error", msg);
    }
    setExpirando(false);
  };

  // Quem já apareceu alguma vez numa concessão. Alimenta o filtro "nunca
  // recebeu cortesia" do lote — inclui expirados e revogados, porque a pergunta
  // é sobre histórico, não sobre estado atual.
  const emailsComHistorico = new Set(trials.map(t => t.user_email));

  const filtrados = trials.filter(t => {
    const casaBusca =
      t.user_email.toLowerCase().includes(busca.toLowerCase()) ||
      (t.full_name || "").toLowerCase().includes(busca.toLowerCase());
    const casaFiltro = filtro === "todos" || t.estado === filtro;
    return casaBusca && casaFiltro;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando cortesias...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Acessos de Cortesia</h1>
          <p className="text-gray-500 mt-1">
            Libere o premium por tempo limitado para quem você quer que experimente
          </p>
        </div>

        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Alert className={message.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
                {message.type === "success" ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <AlertDescription className={message.type === "success" ? "text-green-900" : "text-red-900"}>
                  {message.text}
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Integridade dos acessos. Fica no topo de propósito: se uma conta paga
            está em rota de perder acesso, é a primeira coisa que precisa ser
            vista, antes de qualquer concessão nova. */}
        <TrialAuditPanel auditoria={auditoria} carregando={auditando} onRecarregar={auditar} />

        {/* Conceder */}
        <Tabs defaultValue="individual">
          <TabsList>
            <TabsTrigger value="individual" className="gap-2">
              <Mail className="w-4 h-4" />
              Um usuário
            </TabsTrigger>
            <TabsTrigger value="lote" className="gap-2">
              <Users className="w-4 h-4" />
              Em lote
            </TabsTrigger>
          </TabsList>

          <TabsContent value="individual" className="mt-4">
        <Card className="border-none shadow-lg">
          <CardContent className="p-6">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Gift className="w-5 h-5 text-purple-600" />
              Conceder acesso
            </h2>
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="flex-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="E-mail do usuário já cadastrado"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !concedendo) handleConceder(); }}
                  className="pl-9"
                  type="email"
                />
              </div>
              <Select value={dias} onValueChange={setDias}>
                <SelectTrigger className="w-full lg:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURACOES.map(d => (
                    <SelectItem key={d} value={String(d)}>{d} dias</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Motivo (opcional)"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={handleConceder}
                disabled={concedendo || !email.trim()}
                className="bg-purple-600 hover:bg-purple-700 gap-2"
              >
                {concedendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Conceder
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              O usuário precisa já ter entrado no app pelo menos uma vez. Quem já é assinante
              pagante não recebe cortesia — o prazo faria o acesso dele vencer. Conceder de novo
              para quem já está em cortesia soma dias ao que resta.
            </p>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="lote" className="mt-4">
            <TrialBulkGrant
              contas={contas}
              emailsComHistorico={emailsComHistorico}
              duracoes={DURACOES}
              onConcluido={async () => { await loadData(); auditar(); }}
            />
          </TabsContent>
        </Tabs>

        {/* Resumo */}
        {resumo && (
          <div className="grid md:grid-cols-4 gap-6">
            <Card className="border-none shadow-lg bg-gradient-to-br from-emerald-50 to-teal-50">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Em cortesia agora</p>
                  <p className="text-3xl font-bold text-gray-900">{resumo.ativos}</p>
                </div>
                <Clock className="w-10 h-10 text-emerald-600" />
              </CardContent>
            </Card>
            <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Viraram premium</p>
                  <p className="text-3xl font-bold text-gray-900">{resumo.premium}</p>
                  {/* Recorte da promoção automática dentro do total. Sem ele,
                      não dá para saber se a campanha se paga: o número cheio
                      mistura quem você escolheu a dedo com quem entrou sozinho
                      por ter ativado as notificações. */}
                  {resumo.promocao_total > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {resumo.promocao_virou_premium} de {resumo.promocao_total} vindos de promoção
                    </p>
                  )}
                </div>
                <Crown className="w-10 h-10 text-amber-600" />
              </CardContent>
            </Card>
            <Card className="border-none shadow-lg bg-gradient-to-br from-gray-50 to-slate-50">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Encerrados</p>
                  <p className="text-3xl font-bold text-gray-900">{resumo.expirados + resumo.revogados}</p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-gray-500" />
              </CardContent>
            </Card>
            <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm text-gray-600">Vencidos pendentes</p>
                    <p className="text-3xl font-bold text-gray-900">{resumo.vencidos_pendentes}</p>
                  </div>
                  <CalendarClock className="w-10 h-10 text-blue-600" />
                </div>
                {/* Estes NÃO têm acesso: o getMyAccount encerra a cortesia na
                    primeira vez que a pessoa abre o app. O que sobra é o
                    registro desatualizado de quem não voltou. */}
                <p className="text-xs text-gray-500 mb-2">
                  Já perderam o acesso; só o registro está desatualizado.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleExpirarVencidos}
                  disabled={expirando || resumo.vencidos_pendentes === 0}
                >
                  {expirando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
                  Encerrar vencidos
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filtros */}
        <Card className="border-none shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  placeholder="Buscar por e-mail ou nome..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {[
                  ["todos", "Todos"],
                  ["ativo", "Em cortesia"],
                  ["premium", "Viraram premium"],
                  ["expirado", "Expirados"],
                  ["revogado", "Revogados"]
                ].map(([valor, rotulo]) => (
                  <Button
                    key={valor}
                    variant={filtro === valor ? "default" : "outline"}
                    onClick={() => setFiltro(valor)}
                  >
                    {rotulo}
                  </Button>
                ))}
              </div>
              <Button variant="outline" onClick={loadData} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista */}
        <div className="space-y-3">
          {filtrados.map(t => {
            const est = ESTADOS[t.estado] || ESTADOS.expirado;
            const EstIcon = est.icon;
            return (
              <motion.div key={t.user_email} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-bold text-gray-900 truncate">
                            {t.full_name || "Nome não informado"}
                          </h3>
                          <Badge className={`${est.badge} border flex items-center gap-1`}>
                            <EstIcon className="w-3 h-3" />
                            {est.label}
                          </Badge>
                          {t.lifetime_access && (
                            <Badge className="bg-purple-100 text-purple-800 border-purple-300">
                              Vitalício
                            </Badge>
                          )}
                          {t.origens?.some(o => o !== "admin") && (
                            <Badge className="bg-purple-100 text-purple-800 border-purple-300">
                              <span className="flex items-center gap-1">
                                <Gift className="w-3 h-3" />
                                Promoção
                              </span>
                            </Badge>
                          )}
                          {t.concessoes > 1 && (
                            <Badge variant="outline" className="text-gray-600">
                              {t.concessoes} concessões · {t.dias_totais} dias
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">{t.user_email}</p>
                        {t.reason && (
                          <p className="text-sm text-gray-500 italic mt-1">“{t.reason}”</p>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-6 text-sm">
                        <div>
                          <p className="text-xs text-gray-500">Concedido em</p>
                          <p className="font-medium text-gray-900">{dataCurta(t.ultima_concessao)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">
                            {t.estado === "ativo" ? "Vence em" : "Venceu em"}
                          </p>
                          <p className="font-medium text-gray-900">{dataCurta(t.ultimo_prazo)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Restam</p>
                          <p className={`font-bold ${
                            t.dias_restantes == null ? "text-gray-400"
                              : t.dias_restantes <= 2 ? "text-red-600"
                              : "text-emerald-600"
                          }`}>
                            {t.dias_restantes == null ? "—" : `${t.dias_restantes} dia(s)`}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {t.estado === "ativo" && (
                          <Button
                            variant="outline"
                            className="border-red-200 text-red-600 hover:bg-red-50 gap-2"
                            onClick={() => handleRevogar(t)}
                            disabled={processando === t.user_email}
                          >
                            {processando === t.user_email
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Ban className="w-4 h-4" />}
                            Encerrar
                          </Button>
                        )}
                      </div>
                    </div>

                    {t.revoked_at && (
                      <p className="text-xs text-red-600 mt-3 pt-3 border-t border-gray-100">
                        Revogado em {dataCurta(t.revoked_at)}
                        {t.revoked_by ? ` por ${t.revoked_by}` : ""}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {filtrados.length === 0 && (
            <Card className="border-none shadow-lg">
              <CardContent className="p-12 text-center">
                <Gift className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {trials.length === 0 ? "Nenhuma cortesia concedida ainda" : "Nenhum resultado"}
                </h3>
                <p className="text-gray-600">
                  {trials.length === 0
                    ? "Use o campo acima para liberar o premium por tempo limitado."
                    : "Tente ajustar a busca ou o filtro."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
