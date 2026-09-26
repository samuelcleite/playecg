import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, XCircle, RefreshCw, Search, Loader2, Download } from "lucide-react";
import SegmentosUsuarios from "@/components/admin/usuarios/SegmentosUsuarios";
import TabelaUsuarios from "@/components/admin/usuarios/TabelaUsuarios";
import DetalheUsuario from "@/components/admin/usuarios/DetalheUsuario";
import {
  ROTULO_PLATAFORMA,
  ROTULO_ATIVIDADE,
  ORDENACOES,
  contarSegmentos,
  filtrar,
  ordenar,
  exportarCsv,
  formatarDataHora,
} from "@/components/admin/usuarios/classificacao";

// Tela de usuários: quem são, de onde vem o premium de cada um, quem já saiu,
// e o que cada pessoa já fez no app.
//
// Uma leitura por visita (adminListUsuarios, que já devolve tudo classificado)
// e uma por pessoa aberta (adminListUsuarioDetalhe). Nada aqui lê entidade
// direto nem baixa histórico de tentativas — ver README §2, o limite 429.

export default function AdminUsers() {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState([]);
  const [geradoEm, setGeradoEm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [message, setMessage] = useState(null);
  const [processingUser, setProcessingUser] = useState(null);
  const [selecionado, setSelecionado] = useState(null); // e-mail

  const [segmento, setSegmento] = useState("todos");
  const [busca, setBusca] = useState("");
  const [plataforma, setPlataforma] = useState("todas");
  const [atividade, setAtividade] = useState("todas");
  const [perfil, setPerfil] = useState("todos");
  const [ordem, setOrdem] = useState("cadastro");

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
  };

  const loadData = async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await base44.functions.invoke("adminListUsuarios", {});
      if (!res?.data?.success) throw new Error(res?.data?.error || "Resposta inesperada");
      setUsuarios(res.data.usuarios || []);
      setGeradoEm(res.data.gerado_em || null);
    } catch (e) {
      console.error("Erro ao carregar usuários:", e);
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  };

  const avisar = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleActivateUser = async (user) => {
    setProcessingUser(user.email);
    try {
      const response = await base44.functions.invoke("manuallyUpgradeToPremium", { user_email: user.email });
      if (response.data.success) {
        avisar("success", `Usuário ${user.email} ativado como Premium!`);
        await loadData();
      } else {
        avisar("error", response.data.error || "Erro ao ativar usuário");
      }
    } catch (error) {
      console.error("Error activating user:", error);
      avisar("error", "Erro ao ativar usuário: " + error.message);
    } finally {
      setProcessingUser(null);
    }
  };

  const handleDeactivateUser = async (user) => {
    setProcessingUser(user.email);
    try {
      // A Account tem `update` restrito a __service_only__: nem admin escreve
      // nela pelo cliente. Por isso a escrita passa por function.
      await base44.functions.invoke("adminSetSubscription", {
        user_email: user.email,
        subscription_type: "free",
      });
      avisar("success", `Usuário ${user.email} alterado para Free!`);
      await loadData();
    } catch (error) {
      console.error("Error deactivating user:", error);
      avisar("error", "Erro ao desativar usuário: " + error.message);
    } finally {
      setProcessingUser(null);
    }
  };

  const contagem = useMemo(() => contarSegmentos(usuarios), [usuarios]);
  const visiveis = useMemo(
    () => ordenar(filtrar(usuarios, { segmento, busca, plataforma, atividade, perfil }), ordem),
    [usuarios, segmento, busca, plataforma, atividade, perfil, ordem]
  );
  // Procurado de novo a cada recarga: depois de ativar/desativar, o painel
  // mostra a linha nova, não a que estava aberta.
  const usuarioAberto = usuarios.find((u) => u.email === selecionado) || null;

  const filtrosAtivos =
    segmento !== "todos" || busca || plataforma !== "todas" || atividade !== "todas" || perfil !== "todos";

  const limparFiltros = () => {
    setSegmento("todos");
    setBusca("");
    setPlataforma("todas");
    setAtividade("todas");
    setPerfil("todos");
  };

  if (loading && usuarios.length === 0) {
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
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Usuários</h1>
            <p className="text-gray-500 mt-1">
              Origem do premium, quem saiu e o que cada pessoa já fez no app
              {geradoEm && <span className="text-gray-400"> · atualizado {formatarDataHora(geradoEm)}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportarCsv(visiveis)} className="gap-2" disabled={visiveis.length === 0}>
              <Download className="w-4 h-4" />
              Exportar CSV ({visiveis.length})
            </Button>
            <Button variant="outline" onClick={loadData} className="gap-2" disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {message && (
          <Alert className={message.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
            {message.type === "success"
              ? <CheckCircle2 className="w-5 h-5 text-green-600" />
              : <XCircle className="w-5 h-5 text-red-600" />}
            <AlertDescription className={message.type === "success" ? "text-green-900" : "text-red-900"}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        {erro && (
          <Alert className="bg-red-50 border-red-200">
            <XCircle className="w-5 h-5 text-red-600" />
            <AlertDescription className="text-red-900">Não foi possível carregar os usuários: {erro}</AlertDescription>
          </Alert>
        )}

        <SegmentosUsuarios contagem={contagem} segmento={segmento} onSelecionar={setSegmento} />

        <Card className="border-none shadow-lg">
          <CardContent className="p-4 md:p-6 space-y-4">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Buscar por e-mail ou nome..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={plataforma} onValueChange={setPlataforma}>
                <SelectTrigger className="lg:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Toda plataforma</SelectItem>
                  {Object.entries(ROTULO_PLATAFORMA).map(([v, r]) => (
                    <SelectItem key={v} value={v}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={atividade} onValueChange={setAtividade}>
                <SelectTrigger className="lg:w-60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROTULO_ATIVIDADE).map(([v, r]) => (
                    <SelectItem key={v} value={v}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={perfil} onValueChange={setPerfil}>
                <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Qualquer perfil</SelectItem>
                  <SelectItem value="completo">Perfil completo</SelectItem>
                  <SelectItem value="incompleto">Perfil incompleto</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ordem} onValueChange={setOrdem}>
                <SelectTrigger className="lg:w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORDENACOES).map(([v, o]) => (
                    <SelectItem key={v} value={v}>{o.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                {visiveis.length} de {usuarios.length} usuários
                <span className="text-gray-400"> · * plano deduzido do valor pago</span>
              </span>
              {filtrosAtivos && (
                <button type="button" onClick={limparFiltros} className="text-purple-600 hover:text-purple-800">
                  Limpar filtros
                </button>
              )}
            </div>

            <TabelaUsuarios usuarios={visiveis} onAbrir={(u) => setSelecionado(u.email)} selecionado={selecionado} />
          </CardContent>
        </Card>
      </div>

      <DetalheUsuario
        usuario={usuarioAberto}
        aberto={!!usuarioAberto}
        onFechar={() => setSelecionado(null)}
        onAtivar={handleActivateUser}
        onDesativar={handleDeactivateUser}
        processando={!!usuarioAberto && processingUser === usuarioAberto.email}
      />
    </div>
  );
}
