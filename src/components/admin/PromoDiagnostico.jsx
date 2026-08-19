import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Stethoscope, Loader2, CheckCircle2, XCircle, Search, Gift } from "lucide-react";

// PromoDiagnostico — por que a promoção deu (ou não deu) para uma pessoa.
//
// Existe por causa de uma falha real: um usuário ativou as notificações, o push
// chegou nele, e o premium não veio. Do lado de fora, "não funcionou" cobria
// cinco causas diferentes — promoção desligada, conta inelegível, já resgatada,
// sem inscrição no OneSignal, ou a permissão já estar concedida quando o app
// abriu (caso em que o banner some de propósito, porque a promoção não é
// retroativa). Sem ferramenta, a única saída era adivinhar.
//
// Ele mostra a cadeia inteira, incluindo o que o OneSignal respondeu de verdade
// — o elo que ninguém consegue inspecionar de fora. Só leitura: consultar o
// diagnóstico não concede nada a ninguém.

function Linha({ ok, rotulo, valor }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0">
      {ok === null ? (
        <span className="w-4 h-4 rounded-full bg-gray-200 flex-shrink-0" />
      ) : ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
      )}
      <span className="text-sm text-gray-600 flex-1">{rotulo}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{valor}</span>
    </div>
  );
}

export default function PromoDiagnostico() {
  const [email, setEmail] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [r, setR] = useState(null);
  const [erro, setErro] = useState(null);
  const [liberando, setLiberando] = useState(false);
  const [liberado, setLiberado] = useState(null);

  const diagnosticar = async () => {
    const alvo = email.trim().toLowerCase();
    if (!alvo) return;
    setCarregando(true);
    setErro(null);
    setR(null);
    try {
      const res = await base44.functions.invoke("promocoes", {
        acao: "diagnostico",
        promocao: "push_ios",
        user_email: alvo
      });
      if (res?.data?.success) setR(res.data);
      else setErro(res?.data?.error || "Não foi possível diagnosticar.");
    } catch (error) {
      setErro(error?.response?.data?.error || error?.message || "Erro no diagnóstico");
    }
    setCarregando(false);
  };

  // Libera a promoção para quem JÁ tinha as notificações ativas — os únicos que
  // a tela do app não alcança, porque a promoção não é retroativa e o iOS não
  // reabre o prompt de permissão já decidida.
  //
  // O botão só aparece quando o diagnóstico mostrou inscrição iOS confirmada: é
  // uma liberação para quem cumpriu o combinado, não um atalho para conceder
  // premium a quem se pedir. O backend recusa de novo se não for o caso — aqui
  // a checagem existe só para não oferecer um botão que vai falhar.
  const liberar = async () => {
    if (!window.confirm(
      `Liberar ${r.dias} dias de Premium para ${r.user_email}?\n\n` +
      `A inscrição de notificações dele já foi confirmada no OneSignal.`
    )) return;

    setLiberando(true);
    setErro(null);
    try {
      const res = await base44.functions.invoke("promocoes", {
        acao: "resgatar_admin",
        promocao: "push_ios",
        user_email: r.user_email
      });
      if (res?.data?.success) {
        setLiberado({ dias: res.data.dias, ate: res.data.trial_ends_at });
        await diagnosticar();
      } else {
        setErro(res?.data?.error || "Não foi possível liberar.");
      }
    } catch (error) {
      setErro(error?.response?.data?.error || error?.message || "Erro ao liberar");
    }
    setLiberando(false);
  };

  const os = r?.onesignal;
  const podeLiberar = r?.conta_encontrada && r?.elegivel && r?.promocao_ativa && os?.inscrita_ios;

  return (
    <Card className="border-none shadow-lg">
      <CardContent className="p-6">
        <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-blue-600" />
          Diagnóstico da promoção de notificações
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Responde por que uma pessoa recebeu — ou não — os dias de cortesia. Só leitura.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="E-mail do usuário"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !carregando) diagnosticar(); }}
              className="pl-9"
              type="email"
            />
          </div>
          <Button onClick={diagnosticar} disabled={carregando || !email.trim()} className="gap-2">
            {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
            Diagnosticar
          </Button>
        </div>

        {erro && (
          <p className="text-sm text-red-600 mt-3">{erro}</p>
        )}

        {r && (
          <div className="mt-5 space-y-4">
            {/* O veredito primeiro: é a frase que responde a pergunta. O detalhe
                abaixo existe para quem duvidar dela. */}
            <div className={`rounded-xl p-4 ${r.elegivel && os?.inscrita_ios ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
              <p className="text-sm font-semibold text-gray-900">{r.veredito}</p>

              {podeLiberar && !liberado && (
                <div className="mt-3">
                  <Button
                    onClick={liberar}
                    disabled={liberando}
                    className="bg-purple-600 hover:bg-purple-700 gap-2"
                  >
                    {liberando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                    Liberar os {r.dias} dias para esta pessoa
                  </Button>
                  <p className="text-xs text-gray-600 mt-2">
                    Use quando a pessoa já tinha as notificações ativas e por isso a tela
                    não ofereceu — é o caso que a promoção, sendo não-retroativa, não alcança
                    sozinha. Serve também para testar a cadeia inteira sem reinstalar o app.
                  </p>
                </div>
              )}

              {liberado && (
                <p className="mt-3 text-sm font-semibold text-green-800">
                  ✅ {liberado.dias} dias liberados — vale até{" "}
                  {new Date(liberado.ate).toLocaleDateString("pt-BR")}.
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Campanha</p>
              <Linha
                ok={r.promocao_ativa}
                rotulo="PROMO_PUSH_DIAS configurada"
                valor={r.promocao_ativa ? `${r.dias} dias` : "desligada"}
              />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Conta</p>
              <Linha ok={r.conta_encontrada} rotulo="Conta existe" valor={r.conta_encontrada ? "sim" : "não"} />
              {r.conta_encontrada && (
                <>
                  <Linha ok={null} rotulo="Plano atual" valor={r.subscription_type || "—"} />
                  <Linha ok={null} rotulo="Account.id (external_id)" valor={<code className="text-xs">{r.account_id}</code>} />
                  <Linha
                    ok={!r.ja_resgatou}
                    rotulo="Ainda não resgatou esta promoção"
                    valor={r.ja_resgatou ? "JÁ resgatou" : "não resgatou"}
                  />
                  <Linha
                    ok={!r.em_cortesia}
                    rotulo="Fora de cortesia"
                    valor={r.em_cortesia ? `em cortesia até ${new Date(r.trial_ends_at).toLocaleDateString("pt-BR")}` : "sim"}
                  />
                  <Linha ok={r.elegivel} rotulo="Elegível pela regra" valor={r.elegivel ? "sim" : "não"} />
                </>
              )}
            </div>

            {os && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">OneSignal</p>
                <Linha ok={os.configurado} rotulo="Chaves configuradas" valor={os.configurado ? "sim" : "FALTANDO"} />
                {os.status_http != null && (
                  <Linha
                    ok={os.status_http === 200}
                    rotulo="Resposta da API"
                    valor={`HTTP ${os.status_http}`}
                  />
                )}
                <Linha
                  ok={os.tem_usuario}
                  rotulo="Usuário existe no OneSignal"
                  valor={os.tem_usuario ? "sim" : "não encontrado"}
                />
                <Linha
                  ok={os.inscrita_ios}
                  rotulo="Inscrição iOS ativa"
                  valor={os.inscrita_ios ? "sim" : "não"}
                />
                {os.erro && (
                  <p className="text-xs text-red-600 mt-2 font-mono break-all">{os.erro}</p>
                )}
                {os.corpo_cru && (
                  <p className="text-xs text-red-600 mt-1 font-mono break-all">{os.corpo_cru}</p>
                )}
                {/* As subscriptions cruas. Quando `type` não for iOSPush, é aqui
                    que isso fica visível — e é a diferença entre "não funciona"
                    e "funciona, mas o canal é outro". */}
                {os.subscriptions?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {os.subscriptions.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-xs font-mono">
                        {s.type} · enabled={String(s.enabled)} · types={String(s.notification_types)}
                      </Badge>
                    ))}
                  </div>
                )}
                {os.tem_usuario && os.subscriptions?.length === 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    O usuário existe no OneSignal, mas sem nenhuma subscription.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
