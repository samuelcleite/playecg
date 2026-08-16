import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Loader2,
  Send,
  AlertTriangle,
  CheckCircle2,
  XCircle
} from "lucide-react";

// TrialBulkGrant — concessão de cortesia para um grupo filtrado.
// -----------------------------------------------------------------------------
// O FILTRO RODA AQUI, MAS QUEM VAI PARA O SERVIDOR É A LISTA DE E-MAILS.
//
// Seria mais curto mandar o filtro ("todos os cardiologistas do RS") e deixar o
// backend resolver. Seria também irreversível de conferir: o admin clicaria sem
// nunca ver quem exatamente ia receber, e um filtro mal montado concederia
// acesso a um grupo que ninguém revisou. Mandando a lista, o que a tela mostra é
// exatamente o que o servidor recebe — e o registro de auditoria fica com os
// nomes, não com um critério que pode significar coisas diferentes amanhã.
//
// O backend não confia nesta lista para nada além de "quem tentar": cada e-mail
// ainda passa pela mesma regra de elegibilidade da concessão individual, e os
// recusados voltam nomeados.
// -----------------------------------------------------------------------------

// Espelha o LOTE_MAX do adminGrantTrial. Se os dois divergirem, quem manda é o
// backend — aqui o número serve para avisar ANTES de o admin montar uma lista
// que vai ser recusada inteira.
const LOTE_MAX = 200;

const DIA_MS = 24 * 60 * 60 * 1000;

function emCortesia(conta) {
  if (!conta?.trial_ends_at) return false;
  const fim = new Date(conta.trial_ends_at);
  return !isNaN(fim.getTime()) && fim > new Date();
}

export default function TrialBulkGrant({ contas, emailsComHistorico, duracoes, onConcluido }) {
  const [publico, setPublico] = useState("free");
  const [especialidade, setEspecialidade] = useState("todas");
  const [estado, setEstado] = useState("todos");
  const [cadastro, setCadastro] = useState("sempre");
  const [atividade, setAtividade] = useState("qualquer");
  const [semHistorico, setSemHistorico] = useState(false);

  const [dias, setDias] = useState("7");
  const [motivo, setMotivo] = useState("");
  const [excluidos, setExcluidos] = useState(new Set());
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const especialidades = useMemo(() => {
    const s = new Set(contas.map(c => c.specialty).filter(Boolean));
    return [...s].sort();
  }, [contas]);

  const estados = useMemo(() => {
    const s = new Set(contas.map(c => c.state).filter(Boolean));
    return [...s].sort();
  }, [contas]);

  const candidatos = useMemo(() => {
    const agora = Date.now();
    return contas.filter(c => {
      const cortesia = emCortesia(c);

      // Quem paga nunca entra na seleção — o backend recusaria de qualquer
      // forma, mas deixá-lo aparecer na prévia daria a impressão de que ele vai
      // receber. Vitalício sai pelo mesmo motivo.
      if (c.lifetime_access === true) return false;
      if (c.subscription_type === "premium" && !cortesia) return false;

      if (publico === "free" && cortesia) return false;
      if (publico === "cortesia" && !cortesia) return false;

      if (especialidade !== "todas" && c.specialty !== especialidade) return false;
      if (estado !== "todos" && c.state !== estado) return false;

      if (cadastro !== "sempre") {
        const criado = c.created_date ? new Date(c.created_date).getTime() : null;
        if (!criado) return false;
        if (agora - criado > Number(cadastro) * DIA_MS) return false;
      }

      if (atividade !== "qualquer") {
        if ((c.total_attempts || 0) < Number(atividade)) return false;
      }

      if (semHistorico && emailsComHistorico.has((c.email || "").toLowerCase())) return false;

      return true;
    });
  }, [contas, publico, especialidade, estado, cadastro, atividade, semHistorico, emailsComHistorico]);

  const selecionados = candidatos.filter(c => !excluidos.has(c.email));
  const excedeu = selecionados.length > LOTE_MAX;

  const alternar = (email) => {
    setExcluidos(prev => {
      const novo = new Set(prev);
      if (novo.has(email)) novo.delete(email);
      else novo.add(email);
      return novo;
    });
  };

  const handleEnviar = async () => {
    if (selecionados.length === 0 || excedeu) return;
    if (!window.confirm(
      `Conceder ${dias} dias de acesso premium para ${selecionados.length} usuário(s)?`
    )) return;

    setEnviando(true);
    setResultado(null);
    try {
      const res = await base44.functions.invoke("adminGrantTrial", {
        user_emails: selecionados.map(c => c.email),
        days: Number(dias),
        reason: motivo.trim()
      });
      const d = res?.data;
      if (d?.success) {
        setResultado({ concedidos: d.concedidos || [], recusados: d.recusados || [] });
        setExcluidos(new Set());
        setMotivo("");
        if (onConcluido) await onConcluido();
      } else {
        setResultado({ erro: d?.error || "Não foi possível concluir o lote." });
      }
    } catch (error) {
      setResultado({
        erro: error?.response?.data?.error || error?.message || "Erro ao conceder em lote"
      });
    }
    setEnviando(false);
  };

  return (
    <Card className="border-none shadow-lg">
      <CardContent className="p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Conceder em lote
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Filtre o público, revise a lista e conceda de uma vez. Assinantes pagantes
            e vitalícios ficam de fora da seleção automaticamente.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Público</label>
            <Select value={publico} onValueChange={setPublico}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Somente gratuitos</SelectItem>
                <SelectItem value="cortesia">Somente em cortesia (estender)</SelectItem>
                <SelectItem value="ambos">Gratuitos e em cortesia</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Especialidade</label>
            <Select value={especialidade} onValueChange={setEspecialidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {especialidades.map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Estado</label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {estados.map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Cadastro</label>
            <Select value={cadastro} onValueChange={setCadastro}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sempre">Qualquer data</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Atividade</label>
            <Select value={atividade} onValueChange={setAtividade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="qualquer">Qualquer</SelectItem>
                <SelectItem value="1">Com ao menos 1 tentativa</SelectItem>
                <SelectItem value="10">Com ao menos 10 tentativas</SelectItem>
                <SelectItem value="50">Com ao menos 50 tentativas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <Checkbox
                checked={semHistorico}
                onCheckedChange={(v) => setSemHistorico(v === true)}
              />
              Nunca recebeu cortesia
            </label>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-end">
          <div className="w-full lg:w-40">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Duração</label>
            <Select value={dias} onValueChange={setDias}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {duracoes.map(d => (
                  <SelectItem key={d} value={String(d)}>{d} dias</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 w-full">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Motivo (opcional)</label>
            <Input
              placeholder="Ex.: participantes da aula de arritmias"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <Button
            onClick={handleEnviar}
            disabled={enviando || selecionados.length === 0 || excedeu}
            className="bg-purple-600 hover:bg-purple-700 gap-2 w-full lg:w-auto"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Conceder para {selecionados.length}
          </Button>
        </div>

        {excedeu && (
          <Alert className="bg-amber-50 border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <AlertDescription className="text-amber-900 ml-2">
              A seleção tem {selecionados.length} pessoas e o limite por vez é {LOTE_MAX}.
              Aperte os filtros ou desmarque alguns antes de conceder.
            </AlertDescription>
          </Alert>
        )}

        {/* Prévia. Existe para que ninguém conceda acesso a um grupo que não
            olhou — é a diferença entre revisar uma lista e confiar num filtro. */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">
              {candidatos.length === 0
                ? "Nenhum usuário atende aos filtros"
                : `${selecionados.length} selecionado(s) de ${candidatos.length} encontrado(s)`}
            </p>
            {excluidos.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setExcluidos(new Set())}>
                Restaurar {excluidos.size} desmarcado(s)
              </Button>
            )}
          </div>

          {candidatos.length > 0 && (
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {candidatos.map(c => {
                const fora = excluidos.has(c.email);
                return (
                  <label
                    key={c.email}
                    className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${fora ? "opacity-40" : ""}`}
                  >
                    <Checkbox checked={!fora} onCheckedChange={() => alternar(c.email)} />
                    <span className="font-medium text-gray-900 truncate flex-1">
                      {c.full_name || "Sem nome"}
                    </span>
                    <span className="text-gray-500 truncate flex-1">{c.email}</span>
                    {emCortesia(c) && (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 shrink-0">
                        já em cortesia
                      </Badge>
                    )}
                    <span className="text-xs text-gray-400 shrink-0 w-20 text-right">
                      {c.total_attempts || 0} tent.
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {resultado && (
          <div className="space-y-2">
            {resultado.erro ? (
              <Alert className="bg-red-50 border-red-200">
                <XCircle className="w-5 h-5 text-red-600" />
                <AlertDescription className="text-red-900 ml-2">{resultado.erro}</AlertDescription>
              </Alert>
            ) : (
              <>
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <AlertDescription className="text-green-900 ml-2">
                    {resultado.concedidos.length} concessão(ões) feita(s).
                  </AlertDescription>
                </Alert>
                {resultado.recusados.length > 0 && (
                  <Alert className="bg-amber-50 border-amber-200">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <AlertDescription className="text-amber-900 ml-2">
                      <strong>{resultado.recusados.length} recusada(s):</strong>
                      <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                        {resultado.recusados.map(r => (
                          <li key={r.user_email} className="text-sm">
                            {r.user_email} — {r.error}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
