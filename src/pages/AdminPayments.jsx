import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, XCircle, RefreshCw, Loader2, Plus, X } from "lucide-react";
import ResumoFinanceiro from "@/components/admin/financeiro/ResumoFinanceiro";
import TabelaMensal from "@/components/admin/financeiro/TabelaMensal";
import ListaDespesas from "@/components/admin/financeiro/ListaDespesas";
import FormDespesa from "@/components/admin/financeiro/FormDespesa";
import {
  REGIMES,
  CATEGORIAS,
  formatarMoeda,
  nomeDoMes,
  hojeBrasilia,
  somarUmMes,
  anosDisponiveis,
  linhasDoAno,
  somarLinhas,
  posicaoDeHoje,
  filtrarDespesas,
  somarPorCategoria,
} from "@/components/admin/financeiro/financeiro";

// Financeiro: receita (Payment, gravado pelos webhooks) contra despesa
// (Expense, lançada à mão), nos regimes de competência e de caixa.
//
// A rota continua /adminpayments: a tela antiga de pagamentos não era usada e
// foi substituída por esta. Uma leitura por visita (adminListFinanceiro, que
// já devolve a receita classificada com as duas datas); escrita pelo
// adminDespesas. Nada aqui lê entidade direto — ver README §2, o limite 429.

export default function AdminPayments() {
  const navigate = useNavigate();
  const hoje = hojeBrasilia();

  const [receitas, setReceitas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [foraDaReceita, setForaDaReceita] = useState(null);
  const [loading, setLoading] = useState(true);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState(null);
  const [message, setMessage] = useState(null);

  const [regime, setRegime] = useState("competencia");
  const [ano, setAno] = useState(hoje.slice(0, 4));
  const [mes, setMes] = useState(null);
  const [categoria, setCategoria] = useState("todas");
  const [somenteEmAberto, setSomenteEmAberto] = useState(false);

  const [formAberto, setFormAberto] = useState(false);
  const [formInicial, setFormInicial] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState(null);
  const [excluindo, setExcluindo] = useState(null);

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
      const res = await base44.functions.invoke("adminListFinanceiro", {});
      if (!res?.data?.success) throw new Error(res?.data?.error || "Resposta inesperada");
      setReceitas(res.data.receitas || []);
      setDespesas(res.data.despesas || []);
      setForaDaReceita(res.data.fora_da_receita || null);
      setCarregado(true);
    } catch (e) {
      console.error("Erro ao carregar financeiro:", e);
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  };

  const avisar = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const abrirForm = (inicial) => {
    setErroForm(null);
    setFormInicial(inicial);
    setFormAberto(true);
  };

  const novaDespesa = () => {
    // Competência sugerida: o mês selecionado na tabela, senão hoje.
    const competencia = mes ? `${mes}-01` : hoje;
    abrirForm({ competence_date: competencia });
  };

  const duplicar = (d) =>
    abrirForm({
      name: d.name,
      category: d.category,
      amount: d.amount,
      competence_date: somarUmMes(d.competence_date),
      payment_date: somarUmMes(d.payment_date),
      notes: d.notes,
    });

  const salvar = async (dados) => {
    setSalvando(true);
    setErroForm(null);
    try {
      const editando = !!formInicial?.id;
      const res = await base44.functions.invoke("adminDespesas", {
        action: editando ? "update" : "create",
        id: formInicial?.id,
        data: dados,
      });
      if (!res?.data?.success) throw new Error(res?.data?.error || "Resposta inesperada");
      const salva = res.data.despesa;
      setDespesas((lista) => (editando ? lista.map((d) => (d.id === salva.id ? salva : d)) : [salva, ...lista]));
      setFormAberto(false);
      avisar("success", editando ? "Despesa atualizada." : `Despesa "${salva.name}" lançada.`);
    } catch (e) {
      // O invoke lança em 4xx; a mensagem da validação vem no corpo.
      setErroForm(e?.response?.data?.error || e.message);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (d) => {
    if (!confirm(`Excluir a despesa "${d.name}" (${formatarMoeda(d.amount)})?`)) return;
    setExcluindo(d.id);
    try {
      const res = await base44.functions.invoke("adminDespesas", { action: "delete", id: d.id });
      if (!res?.data?.success) throw new Error(res?.data?.error || "Resposta inesperada");
      setDespesas((lista) => lista.filter((x) => x.id !== d.id));
      avisar("success", "Despesa excluída.");
    } catch (e) {
      avisar("error", "Erro ao excluir: " + (e?.response?.data?.error || e.message));
    } finally {
      setExcluindo(null);
    }
  };

  const anos = useMemo(() => anosDisponiveis(receitas, despesas, hoje), [receitas, despesas, hoje]);
  const linhas = useMemo(
    () => linhasDoAno(receitas, despesas, regime, ano, hoje),
    [receitas, despesas, regime, ano, hoje]
  );
  const totalAno = useMemo(() => somarLinhas(linhas), [linhas]);
  const totalPeriodo = mes ? somarLinhas(linhas.filter((l) => l.mes === mes)) : totalAno;
  const posicao = useMemo(() => posicaoDeHoje(receitas, despesas, hoje), [receitas, despesas, hoje]);

  // Canal só vira coluna se tem receita em algum mês do ano: "Outros" (Mercado
  // Pago legado, registro manual) não aparece em ano que não tem.
  const canaisVisiveis = ["stripe", "google", "apple", "outro"].filter((c) => totalAno.canais[c] > 0);

  const despesasVisiveis = useMemo(
    () => filtrarDespesas(despesas, { regime, ano, mes, categoria, somenteEmAberto, hoje }),
    [despesas, regime, ano, mes, categoria, somenteEmAberto, hoje]
  );
  const porCategoria = useMemo(() => somarPorCategoria(despesasVisiveis), [despesasVisiveis]);

  const rotuloPeriodo = mes ? nomeDoMes(mes) : ano;

  if (loading && !carregado) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando financeiro...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Financeiro</h1>
            <p className="text-gray-500 mt-1">Receitas, despesas e resultado por competência e por caixa</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadData} className="gap-2" disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={novaDespesa} className="bg-purple-600 hover:bg-purple-700 gap-2">
              <Plus className="w-4 h-4" />
              Nova despesa
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
            <AlertDescription className="text-red-900">Não foi possível carregar o financeiro: {erro}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {Object.entries(REGIMES).map(([id, r]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRegime(id)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  regime === id ? "bg-purple-600 text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {r.rotulo}
              </button>
            ))}
          </div>
          <Select
            value={ano}
            onValueChange={(v) => {
              setAno(v);
              setMes(null);
            }}
          >
            <SelectTrigger className="sm:w-28 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mes && (
            <button
              type="button"
              onClick={() => setMes(null)}
              className="inline-flex items-center gap-1 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-3 py-1"
            >
              {nomeDoMes(mes)}
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <p className="text-sm text-gray-500 sm:ml-auto">{REGIMES[regime].explicacao}</p>
        </div>

        <ResumoFinanceiro
          total={totalPeriodo}
          posicao={posicao}
          rotuloPeriodo={rotuloPeriodo}
          somenteEmAberto={somenteEmAberto}
          onAlternarEmAberto={() => setSomenteEmAberto((v) => !v)}
        />

        <Card className="border-none shadow-lg">
          <CardContent className="p-4 md:p-6 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-900">
                Mês a mês · {REGIMES[regime].rotulo.toLowerCase()}
              </h2>
              <span className="text-xs text-gray-400">clique num mês para filtrar</span>
            </div>
            <TabelaMensal
              linhas={linhas}
              total={totalAno}
              canaisVisiveis={canaisVisiveis}
              mesAtual={hoje.slice(0, 7)}
              mesSelecionado={mes}
              onSelecionarMes={setMes}
            />
            <p className="text-xs text-gray-500">
              Receita bruta, antes da taxa do Stripe e das lojas (lance a taxa como despesa do tipo
              "{CATEGORIAS.taxas}"). Plano anual entra inteiro no mês da venda.
              {foraDaReceita && (foraDaReceita.estornado > 0 || foraDaReceita.nao_pago > 0) && (
                <>
                  {" "}Fora da receita: {foraDaReceita.estornado} vitalício(s) estornado(s) e{" "}
                  {foraDaReceita.nao_pago} pagamento(s) não concluído(s).
                </>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg">
          <CardContent className="p-4 md:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900 flex-1">
                {somenteEmAberto
                  ? "Despesas em aberto"
                  : `Despesas · ${rotuloPeriodo} · ${regime === "caixa" ? "pagas no período" : "por competência"}`}
              </h2>
              {somenteEmAberto && (
                <button
                  type="button"
                  onClick={() => setSomenteEmAberto(false)}
                  className="text-sm text-purple-600 hover:text-purple-800"
                >
                  Voltar ao período
                </button>
              )}
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="md:w-60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todos os tipos</SelectItem>
                  {Object.entries(CATEGORIAS).map(([v, r]) => (
                    <SelectItem key={v} value={v}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {porCategoria.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {porCategoria.map(([cat, soma]) => (
                  <span key={cat} className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
                    {CATEGORIAS[cat] || cat}: <span className="font-semibold">{formatarMoeda(soma)}</span>
                  </span>
                ))}
              </div>
            )}

            {regime === "caixa" && !somenteEmAberto && posicao.aPagarQtd > 0 && (
              <p className="text-xs text-gray-500">
                Despesa sem data de pagamento não entra no caixa — veja em "A pagar".
              </p>
            )}

            <ListaDespesas
              despesas={despesasVisiveis}
              hoje={hoje}
              onEditar={abrirForm}
              onDuplicar={duplicar}
              onExcluir={excluir}
              excluindo={excluindo}
            />
          </CardContent>
        </Card>
      </div>

      <FormDespesa
        aberto={formAberto}
        inicial={formInicial}
        salvando={salvando}
        erro={erroForm}
        onSalvar={salvar}
        onFechar={() => setFormAberto(false)}
      />
    </div>
  );
}
