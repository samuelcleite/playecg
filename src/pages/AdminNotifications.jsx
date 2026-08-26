import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { sendTestPush } from "@/functions/sendTestPush";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Send, CheckCircle2, XCircle, Loader2, Smartphone, AlertTriangle, RefreshCw, Search, Globe } from "lucide-react";

// Rotas que fazem sentido como destino de notificação. O Despia lê este valor
// de `data.path`, atualiza a URL pela History API e dispara popstate — o router
// do app sincroniza sozinho, sem código de roteamento nosso.
//
// É um <select> e não campo livre de propósito: uma rota digitada errada só é
// descoberta depois que a notificação já saiu, e aí não tem volta.
const ROTAS_DESTINO = [
  { valor: "", rotulo: "Nenhuma (abre o app onde estiver)" },
  { valor: "/dashboard", rotulo: "Dashboard" },
  { valor: "/quiz", rotulo: "Quiz" },
  { valor: "/dailycase", rotulo: "Caso do Dia" },
  { valor: "/modules", rotulo: "Módulos" },
  { valor: "/achievements", rotulo: "Troféus" },
  { valor: "/upgrade", rotulo: "Upgrade" },
  { valor: "/profile", rotulo: "Perfil" }
];

// `errors` é o sinal que separa sucesso de problema no envio pelo OneSignal —
// não `recipients`, que a API rich simplesmente não devolve.
//
// Formatos observados até aqui: `null` no caso de SUCESSO (envio confirmado no
// device veio com errors null), e array de strings no caso de erro
// (["All included players are not subscribed"], antes do rebuild do binário).
// É só isso que sabemos, então aceitamos string, array e objeto: um .map() ou
// .join() direto derruba a tela inteira se algum outro cenário de erro
// responder diferente.
function renderErros(errors) {
  if (!errors) return null;
  if (typeof errors === "string") return <span>{errors}</span>;
  if (Array.isArray(errors)) {
    return (
      <ul className="list-disc list-inside space-y-0.5">
        {errors.map((e, i) => (
          <li key={i}>{typeof e === "string" ? e : JSON.stringify(e)}</li>
        ))}
      </ul>
    );
  }
  return (
    <pre className="whitespace-pre-wrap break-all text-xs">
      {JSON.stringify(errors, null, 2)}
    </pre>
  );
}

export default function AdminNotifications() {
  const [user, setUser] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  // null | "web" | "ios" — qual transporte está enviando. Os dois botões ficam
  // desabilitados enquanto qualquer um dos dois roda, para não disparar dois
  // envios sobrepostos por engano.
  const [sending, setSending] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetMode, setTargetMode] = useState("all"); // "all" | "user"
  const [targetUserEmail, setTargetUserEmail] = useState("");
  const [path, setPath] = useState("");
  const [result, setResult] = useState(null);

  // Alcance do app iOS, lido do OneSignal. Uma chamada só (ver adminPushStats):
  // `inscritos` = messageable_players, `ja_inscreveram` = players.
  const [resumo, setResumo] = useState(null);
  const [lendoResumo, setLendoResumo] = useState(true);
  const [lidoEm, setLidoEm] = useState(null);

  // Varredura conta a conta — cara, e por isso só sob gesto. `null` enquanto
  // ninguém pediu; a tela mostra o botão e não finge saber quem são.
  const [varredura, setVarredura] = useState(null);
  const [varrendo, setVarrendo] = useState(false);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      if (userData.role !== "admin") return;
      const resSubs = await base44.functions.invoke('adminListRecords', {
        entity: 'PushSubscription', sort: '-created_date', limit: 200
      });
      const subs = resSubs?.data?.records || [];
      setSubscriptions(subs);
      // Sem await: o resumo é uma chamada a um terceiro (OneSignal) e não pode
      // segurar a tela inteira. Ele tem estado de carregamento próprio.
      carregarResumo();
    } finally {
      setLoading(false);
    }
  };

  const carregarResumo = async () => {
    setLendoResumo(true);
    try {
      const res = await base44.functions.invoke("adminPushStats", { acao: "resumo" });
      setResumo(res?.data?.resumo ?? null);
      setLidoEm(new Date());
    } catch (err) {
      const dados = err?.response?.data;
      setResumo({ ok: false, erro: dados?.error || err.message });
      setLidoEm(new Date());
    } finally {
      setLendoResumo(false);
    }
  };

  // A varredura vem em lotes porque são N chamadas ao OneSignal — uma por conta.
  // Quem costura os lotes é aqui, e é o que dá o progresso: a function devolve
  // `proximo_offset` e este laço continua de onde parou.
  //
  // TETO DE LOTES como cinto de segurança. Não é o caminho esperado (a function
  // devolve `proximo_offset: null` quando acabam as contas); é o que impede um
  // laço infinito na tela caso algum dia o contrato mude e o offset pare de
  // avançar.
  const rodarVarredura = async () => {
    setVarrendo(true);
    setVarredura({ ativos: [], sem: 0, indisponiveis: 0, processadas: 0, completa: false });

    let offset = 0;
    let lotes = 0;
    const TETO_LOTES = 50;

    try {
      while (lotes < TETO_LOTES) {
        const res = await base44.functions.invoke("adminPushStats", {
          acao: "varredura",
          offset
        });
        const d = res?.data;
        if (!d?.success) throw new Error(d?.error || "Falha na varredura");

        setVarredura(anterior => ({
          ativos: [...anterior.ativos, ...(d.ativos || [])],
          sem: anterior.sem + (d.sem || 0),
          indisponiveis: anterior.indisponiveis + (d.indisponiveis || 0),
          processadas: anterior.processadas + (d.processadas || 0),
          completa: d.proximo_offset == null
        }));

        if (d.proximo_offset == null) break;
        offset = d.proximo_offset;
        lotes++;
      }
    } catch (err) {
      const dados = err?.response?.data;
      // Mantém o que já foi varrido e marca o erro: meia varredura ainda diz
      // mais que nenhuma, desde que a tela não a apresente como completa.
      setVarredura(anterior => ({
        ...(anterior || { ativos: [], sem: 0, indisponiveis: 0, processadas: 0 }),
        completa: false,
        erro: dados?.error || err.message
      }));
    } finally {
      setVarrendo(false);
    }
  };

  // Web Push (navegador e PWA). Inalterado — só o estado de `sending` mudou de
  // booleano para o nome do transporte, e o resultado passou a ser etiquetado.
  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending("web");
    setResult(null);
    try {
      const payload = { title, body };
      if (targetMode === "user" && targetUserEmail.trim()) {
        payload.user_email = targetUserEmail.trim();
      }
      const res = await sendTestPush(payload);
      setResult({ transporte: "web", success: res.data.success, results: res.data.results });
    } catch (err) {
      setResult({ transporte: "web", success: false, error: err.message });
    } finally {
      setSending(null);
    }
  };

  // App iOS nativo (Despia + OneSignal). Botão SEPARADO, não um seletor de
  // transporte: os dois públicos são disjuntos por construção (o WKWebView do
  // Despia não expõe PushManager, então nenhum usuário do app nativo tem linha
  // em PushSubscription). Um seletor sugeriria que são intercambiáveis, e eles
  // não são — nem a chave de alvo é a mesma (user_email aqui, Account.id lá).
  //
  // Exige destinatário: a v1 da função não faz broadcast.
  const handleSendOneSignal = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending("ios");
    setResult(null);
    try {
      const res = await base44.functions.invoke("sendOneSignalPush", {
        title,
        body,
        path,
        user_email: targetUserEmail.trim()
      });
      setResult({ transporte: "ios", ...res.data });
    } catch (err) {
      // O erro do invoke traz o corpo da function em err.response?.data quando
      // houve resposta (400/403/404); err.message cobre falha de rede.
      const dados = err?.response?.data;
      setResult({
        transporte: "ios",
        success: false,
        status: err?.status ?? null,
        error: dados?.error || err.message
      });
    } finally {
      setSending(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ecg-blue" />
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Acesso negado.</p>
      </div>
    );
  }

  const sentCount = result?.results?.filter(r => r.status === "sent").length ?? 0;
  const failedCount = result?.results?.filter(r => r.status !== "sent").length ?? 0;

  return (
    <div className="min-h-screen bg-ecg-gray p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ecg-midnight flex items-center justify-center">
            <Bell className="w-5 h-5 text-ecg-green" />
          </div>
          <div>
            <h1 className="text-xl font-black text-ecg-midnight">Envio de Notificações</h1>
            <p className="text-sm text-gray-500">Envie push notifications para os usuários</p>
          </div>
        </div>

        {/* ALCANCE DO APP iOS — o número que a tela devia ter desde sempre.
            Ele vem do OneSignal, não de contador nosso: a verdade sobre a
            permissão mora no aparelho, e o app não sabe (ver pushNativo.js e o
            cabeçalho de adminPushStats). */}
        <Card className="border-2 border-ecg-midnight/15">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-ecg-blue" />
                <h2 className="font-bold text-ecg-midnight text-sm">App iOS</h2>
              </div>
              <button
                onClick={carregarResumo}
                disabled={lendoResumo}
                className="text-gray-400 hover:text-ecg-midnight disabled:opacity-40 p-1"
                aria-label="Recarregar"
              >
                <RefreshCw className={`w-4 h-4 ${lendoResumo ? "animate-spin" : ""}`} />
              </button>
            </div>

            {lendoResumo && !resumo ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                Consultando o OneSignal...
              </div>
            ) : !resumo?.ok ? (
              /* NÃO mostra zero. Número que não foi lido é ausência, não
                 ausência de inscritos — é a mesma lição do `recipients`, que
                 fazia esta tela acusar "ninguém inscrito" em envio entregue. */
              <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-bold text-amber-800">Não foi possível ler a contagem</p>
                  <p className="text-amber-700 mt-0.5">{resumo?.erro || "Falha ao consultar o OneSignal."}</p>
                  {resumo?.status_http != null && (
                    <p className="text-amber-700/80 text-xs mt-1">HTTP {resumo.status_http}</p>
                  )}
                  {resumo?.dica && (
                    <p className="text-amber-800 text-xs mt-2 bg-amber-100 rounded-lg px-2 py-1.5">
                      {resumo.dica}
                    </p>
                  )}
                  {resumo?.corpo_cru && (
                    <pre className="text-[10px] text-amber-700/70 mt-2 whitespace-pre-wrap break-all">
                      {resumo.corpo_cru}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="text-center py-2">
                  <p className="text-5xl font-black text-ecg-midnight leading-none">
                    {resumo.inscritos ?? "—"}
                  </p>
                  <p className="text-sm font-semibold text-gray-600 mt-1.5">
                    podem receber notificação agora
                  </p>
                </div>

                {/* A DIFERENÇA entre os dois números é o dado mais útil dos
                    três: quem se inscreveu e hoje não recebe desinstalou o app
                    ou desligou nos Ajustes. */}
                {resumo.ja_inscreveram != null && resumo.inscritos != null && (
                  <div className="flex items-center justify-center gap-2 text-xs text-gray-500 mt-2 flex-wrap">
                    <span><strong className="text-gray-700">{resumo.ja_inscreveram}</strong> já se inscreveram</span>
                    {resumo.ja_inscreveram - resumo.inscritos > 0 && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span>
                          <strong className="text-gray-700">{resumo.ja_inscreveram - resumo.inscritos}</strong> não recebem mais
                          <span className="text-gray-400"> (desinstalaram ou desligaram)</span>
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Ressalva dita em voz alta: sozinho, este número seria lido
                    como "usuários", e ele não é. */}
                <p className="text-[11px] text-gray-400 text-center mt-3 leading-snug">
                  São aparelhos, não pessoas — quem tem iPhone e iPad conta duas vezes.
                  {lidoEm && ` Lido às ${lidoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`}
                </p>
              </>
            )}

            {/* QUEM — varredura conta a conta. Fora do bloco de erro acima de
                propósito: ela usa outro endpoint (o mesmo do promocoes), então
                funciona mesmo quando a contagem agregada falha por chave. */}
            <div className="border-t border-gray-100 mt-4 pt-3">
              {!varredura ? (
                <Button
                  onClick={rodarVarredura}
                  variant="outline"
                  className="w-full gap-2 rounded-xl h-10 text-sm"
                >
                  <Search className="w-4 h-4" />
                  Ver quem tem push ativo
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-ecg-midnight">
                      {varrendo
                        ? "Verificando..."
                        : varredura.completa
                          ? "Contas com push iOS ativo"
                          : "Contas com push iOS ativo (parcial)"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {varrendo && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
                      {varredura.processadas} conta{varredura.processadas !== 1 ? "s" : ""} verificada{varredura.processadas !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex gap-2 text-xs">
                    <Badge className="bg-green-100 text-green-800 border border-green-200">
                      {varredura.ativos.length} ativo{varredura.ativos.length !== 1 ? "s" : ""}
                    </Badge>
                    <Badge className="bg-gray-100 text-gray-600 border border-gray-200">
                      {varredura.sem} sem push
                    </Badge>
                    {/* Nunca somado aos "sem push": falha de rede não é ausência
                        de inscrição, e contá-la como tal faria a base parecer
                        ter desativado em massa. */}
                    {varredura.indisponiveis > 0 && (
                      <Badge className="bg-amber-100 text-amber-800 border border-amber-200">
                        {varredura.indisponiveis} não verificad{varredura.indisponiveis !== 1 ? "as" : "a"}
                      </Badge>
                    )}
                  </div>

                  {varredura.erro && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                      A varredura parou antes do fim: {varredura.erro}
                    </p>
                  )}

                  {varredura.ativos.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1 pt-1">
                      {varredura.ativos.map((c, i) => (
                        <button
                          key={`${c.email}-${i}`}
                          onClick={() => {
                            // Mirar o envio é o uso natural desta lista — sem
                            // ela, o e-mail do destinatário iOS tinha de ser
                            // digitado de cabeça (a lista de baixo é de Web
                            // Push, público disjunto).
                            setTargetMode("user");
                            setTargetUserEmail(c.email || "");
                          }}
                          disabled={!c.email}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-all disabled:opacity-50 ${c.email && targetUserEmail === c.email ? "border-ecg-green bg-ecg-green/10 text-ecg-midnight font-bold" : "border-gray-100 bg-white hover:bg-gray-50 text-gray-600"}`}
                        >
                          <span className="font-mono">{c.email || "(sem e-mail)"}</span>
                          {c.nome && <span className="ml-2 text-gray-400">{c.nome}</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {!varrendo && (
                    <button
                      onClick={rodarVarredura}
                      className="text-xs text-gray-400 hover:text-ecg-midnight underline"
                    >
                      Verificar de novo
                    </button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Web Push — rebaixado a uma linha. O canal continua de pé (é o que o
            Chrome recebe), mas não disputa mais a atenção com o número do iOS,
            que é o que se usa. O contador é limitado aos 200 registros que o
            adminListRecords traz, então acima disso ele é um piso, não o total —
            e por isso o "+". */}
        <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
          <Globe className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Web Push (navegador e PWA): {subscriptions.length}{subscriptions.length >= 200 ? "+" : ""} dispositivo{subscriptions.length !== 1 ? "s" : ""} cadastrado{subscriptions.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Form */}
        <Card>
          <CardHeader className="pb-2">
            <h2 className="font-bold text-ecg-midnight">Compor Notificação</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Target */}
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">Destinatário</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTargetMode("all")}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${targetMode === "all" ? "border-ecg-midnight bg-ecg-midnight text-white" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                >
                  Todos os usuários
                </button>
                <button
                  onClick={() => setTargetMode("user")}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${targetMode === "user" ? "border-ecg-midnight bg-ecg-midnight text-white" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                >
                  Usuário específico
                </button>
              </div>
            </div>

            {targetMode === "user" && (
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">E-mail do usuário</label>
                <input
                  type="text"
                  value={targetUserEmail}
                  onChange={e => setTargetUserEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ecg-green"
                />
                {/* Atalhos de Web Push. NÃO servem para o envio iOS: os
                    públicos são disjuntos, então ninguém desta lista tem
                    subscription no OneSignal. Para mirar um iPhone, use a lista
                    da varredura, no card do App iOS lá em cima. */}
                {subscriptions.length > 0 && (
                  <>
                    <p className="text-[11px] text-gray-400 mt-2 mb-1">Inscritos no Web Push:</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                    {subscriptions.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setTargetUserEmail(s.user_email || "")}
                        disabled={!s.user_email}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-all disabled:opacity-50 ${s.user_email && targetUserEmail === s.user_email ? "border-ecg-green bg-ecg-green/10 text-ecg-midnight font-bold" : "border-gray-100 bg-white hover:bg-gray-50 text-gray-600"}`}
                      >
                        <span className="font-mono">{s.user_email || '(sem e-mail)'}</span>
                        <span className="ml-2 text-gray-400 truncate">{s.endpoint?.slice(0, 40)}...</span>
                      </button>
                    ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">Título</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Novo Caso do Dia disponível!"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ecg-green"
              />
            </div>

            {/* Body */}
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">Mensagem</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Ex: Venha praticar e manter sua sequência!"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ecg-green resize-none"
              />
            </div>

            {/* Destino do toque — só o app iOS usa. O Web Push ignora este
                campo: o sendTestPush não manda `url` no payload, e o
                notificationclick do service worker hoje só foca a aba. */}
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">
                Abrir ao tocar <span className="font-normal text-gray-400">(só app iOS)</span>
              </label>
              <select
                value={path}
                onChange={e => setPath(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ecg-green"
              >
                {ROTAS_DESTINO.map(r => (
                  <option key={r.valor} value={r.valor}>{r.rotulo}</option>
                ))}
              </select>
            </div>

            {/* DOIS BOTÕES, não um seletor de transporte. Os públicos são
                disjuntos (Web Push = navegador/PWA; OneSignal = app iOS), as
                chaves de alvo são diferentes, e um seletor sugeriria que dá
                para escolher — quando na verdade são dois canais para dois
                públicos que não se sobrepõem. */}
            <Button
              onClick={handleSend}
              disabled={!!sending || !title.trim() || !body.trim()}
              className="w-full bg-ecg-midnight hover:bg-ecg-midnight/90 text-white font-black rounded-xl h-11"
            >
              {sending === "web" ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Enviando...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Enviar por Web Push (navegador)</>
              )}
            </Button>

            <Button
              onClick={handleSendOneSignal}
              disabled={!!sending || !title.trim() || !body.trim() || !targetUserEmail.trim()}
              className="w-full bg-ecg-blue hover:bg-ecg-blue/90 text-white font-black rounded-xl h-11"
            >
              {sending === "ios" ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Enviando...</>
              ) : (
                <><Smartphone className="w-4 h-4 mr-2" /> Enviar para o app iOS</>
              )}
            </Button>

            {!targetUserEmail.trim() && (
              <p className="text-xs text-gray-400 -mt-2">
                O envio para o app iOS exige um e-mail de destinatário — ainda não há envio em massa.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Resultado — app iOS (OneSignal).
            Três estados, não dois. O do meio é o que importa: HTTP 200 com
            recipients 0 significa que a chamada funcionou e NINGUÉM estava
            inscrito naquele external_id. É o estado esperado enquanto o binário
            do Despia não for reconstruído, e pintá-lo de vermelho mandaria
            procurar bug onde não há. */}
        {result?.transporte === "ios" && (
          <Card className={`border-2 ${
            !result.success ? "border-red-300 bg-red-50"
              : result.errors ? "border-amber-300 bg-amber-50"
              : "border-green-300 bg-green-50"
          }`}>
            <CardContent className="p-4 space-y-3">
              {!result.success ? (
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-red-800">Erro ao enviar</p>
                    <p className="text-sm text-red-700 mt-1">{result.error || "Falha na chamada ao OneSignal."}</p>
                  </div>
                </div>
              ) : result.errors ? (
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-800">Enviada com ressalva</p>
                    <p className="text-sm text-amber-700 mt-1">
                      A chamada ao OneSignal funcionou, mas ele sinalizou algo — veja abaixo.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-green-800">Notificação enviada ao OneSignal</p>
                    <p className="text-sm text-green-700 mt-1">
                      A contagem de entrega fica no painel do OneSignal, em Delivery — a API
                      resolve os destinatários depois de responder, então esse número não chega aqui.
                    </p>
                  </div>
                </div>
              )}

              {/* Bloco de diagnóstico. Sem ele, uma ressalva não diz se o
                  problema é a vinculação ou se miramos a conta errada.
                  `recipients` NÃO aparece: a API rich não devolve esse campo,
                  e exibi-lo era exatamente a origem do falso alarme. */}
              <div className="text-xs text-gray-600 border-t border-gray-200/70 pt-3 space-y-1">
                {result.status != null && (
                  <p><span className="font-semibold">HTTP:</span> {result.status}</p>
                )}
                {result.id && (
                  <p className="break-all">
                    <span className="font-semibold">ID da mensagem:</span>{" "}
                    <span className="font-mono">{result.id}</span>
                  </p>
                )}
                {result.external_id_alvo && (
                  <p className="break-all">
                    <span className="font-semibold">External ID alvo:</span>{" "}
                    <span className="font-mono">{result.external_id_alvo}</span>
                  </p>
                )}
                {result.errors && (
                  <div>
                    <span className="font-semibold">errors:</span>
                    <div className="mt-1">{renderErros(result.errors)}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Resultado — Web Push. Inalterado. */}
        {result?.transporte === "web" && (
          <Card className={`border-2 ${result.success ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
            <CardContent className="p-4">
              {result.success ? (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-green-800">Notificações enviadas!</p>
                    <p className="text-sm text-green-700 mt-1">
                      ✅ {sentCount} enviada{sentCount !== 1 ? "s" : ""}
                      {failedCount > 0 && <span className="ml-2 text-red-600">❌ {failedCount} falha{failedCount !== 1 ? "s" : ""}</span>}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-red-800">Erro ao enviar</p>
                    <p className="text-sm text-red-700 mt-1">{result.error || "Nenhuma inscrição encontrada."}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}