import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { sendTestPush } from "@/functions/sendTestPush";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Send, Users, CheckCircle2, XCircle, Loader2, Smartphone, AlertTriangle } from "lucide-react";

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

// O formato de `errors` do OneSignal NÃO é estável: array de strings na API v1,
// objeto (invalid_aliases: { external_id: [...] }) na API rich com
// include_aliases. Um .map() ou .join() direto quebra a tela — e quebraria
// justamente no primeiro teste real, que é quando o alvo ainda não existe.
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
    } finally {
      setLoading(false);
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

        {/* Stat */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-5 h-5 text-ecg-blue" />
            {/* Este contador é SÓ de Web Push (navegador e PWA). Ele não inclui
                os iPhones: o app iOS não tem linha em PushSubscription, e o
                número autoritativo daquele lado vive no painel do OneSignal. */}
            <span className="text-sm text-gray-600">
              <strong className="text-ecg-midnight">{subscriptions.length}</strong> dispositivo{subscriptions.length !== 1 ? "s" : ""} cadastrado{subscriptions.length !== 1 ? "s" : ""} no Web Push
            </span>
          </CardContent>
        </Card>

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
                {/* Mostrar subscriptions para facilitar */}
                {subscriptions.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
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
              : (result.recipients ?? 0) === 0 ? "border-amber-300 bg-amber-50"
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
              ) : (result.recipients ?? 0) === 0 ? (
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-800">Nenhum dispositivo inscrito</p>
                    <p className="text-sm text-amber-700 mt-1">
                      A chamada ao OneSignal funcionou, mas nenhuma inscrição carrega esse
                      identificador. É o resultado esperado antes do rebuild do binário do Despia —
                      ou se o usuário nunca autorizou notificações.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-green-800">Notificação enviada!</p>
                    <p className="text-sm text-green-700 mt-1">
                      ✅ {result.recipients} dispositivo{result.recipients !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              )}

              {/* Bloco de diagnóstico. Sem ele, um recipients 0 não diz se o
                  problema é a vinculação ou se miramos a conta errada. */}
              <div className="text-xs text-gray-600 border-t border-gray-200/70 pt-3 space-y-1">
                {result.status != null && (
                  <p><span className="font-semibold">HTTP:</span> {result.status}</p>
                )}
                {result.external_id_alvo && (
                  <p className="break-all">
                    <span className="font-semibold">External ID alvo:</span>{" "}
                    <span className="font-mono">{result.external_id_alvo}</span>
                  </p>
                )}
                {result.recipients != null && (
                  <p><span className="font-semibold">recipients:</span> {result.recipients}</p>
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