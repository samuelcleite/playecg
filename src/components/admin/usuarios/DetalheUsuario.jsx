import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { carregarCatalogoTrilha } from "@/lib/catalogoTrilha";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Crown, Loader2, XCircle } from "lucide-react";
import { SeloSituacao } from "./TabelaUsuarios";
import {
  ROTULO_ALERTA,
  ROTULO_PLATAFORMA,
  ROTULO_QUIZ,
  planoEstimado,
  formatarData,
  formatarDataHora,
  formatarReais,
  textoDiasDesde,
  precisao,
  sequenciaAtual,
  jornada,
} from "./classificacao";

// Painel lateral com tudo o que se sabe de UMA pessoa. A parte que já veio na
// listagem aparece na hora; o resto (uso por tipo de quiz, fases, conquistas,
// estado real da assinatura) vem do adminListUsuarioDetalhe, uma chamada por
// abertura.

const ROTULO_STATUS_PAGAMENTO = {
  PAID: "Pago",
  CANCELED: "Cancelado/estornado",
  PENDING: "Pendente",
  DECLINED: "Recusado",
  EXPIRED: "Expirado",
};

const ROTULO_METODO = {
  STRIPE_SUBSCRIPTION: "Stripe (assinatura)",
  STRIPE_LIFETIME: "Stripe (vitalício)",
  APP_STORE_SUBSCRIPTION: "App Store",
  PLAY_STORE_SUBSCRIPTION: "Google Play",
};

function Secao({ titulo, children }) {
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-900">{titulo}</h4>
      {children}
    </section>
  );
}

function Linha({ rotulo, children }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-500">{rotulo}</span>
      <span className="text-gray-900 text-right">{children}</span>
    </div>
  );
}

function Metrica({ rotulo, valor }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{rotulo}</p>
      <p className="text-lg font-bold text-gray-900 tabular-nums">{valor}</p>
    </div>
  );
}

// Estado vindo do Stripe ou do RevenueCat. `null` = não se aplica.
function EstadoExterno({ fonte, estado }) {
  if (!estado) return null;
  if (estado.erro) {
    return <Linha rotulo={fonte}><span className="text-gray-500">sem resposta</span></Linha>;
  }
  const intervalo = estado.interval === "year" ? "anual" : estado.interval === "month" ? "mensal" : "plano ?";
  let texto;
  let cor;
  if (estado.expirada) {
    texto = `encerrada em ${formatarData(estado.expiresAt)}`;
    cor = "text-gray-600";
  } else if (estado.willRenew === false) {
    texto = `renovação desligada: acesso até ${formatarData(estado.expiresAt)}`;
    cor = "text-red-700 font-medium";
  } else {
    texto = `renova em ${formatarData(estado.expiresAt)}`;
    cor = "text-green-700";
  }
  const loja = estado.store ? ` · ${ROTULO_PLATAFORMA[estado.store === "PLAY_STORE" ? "play_store" : "app_store"]}` : "";
  return (
    <Linha rotulo={fonte}>
      <span className={cor}>{intervalo}{loja}, {texto}</span>
    </Linha>
  );
}

function linhaDoTempo(u, detalhe) {
  const eventos = [];
  const add = (data, texto, tom = "neutro") => {
    if (data) eventos.push({ data, texto, tom });
  };
  add(u.created_date, "Cadastro");
  add(detalhe?.uso?.primeira_tentativa_em, "Respondeu o primeiro caso", "bom");
  for (const c of u.cortesias || []) {
    const origem = c.origem === "admin" ? "admin" : `promoção ${c.origem}`;
    add(c.granted_at, `${c.kind === "extension" ? "Cortesia estendida" : "Ganhou cortesia"}: ${c.days || "?"} dias (${origem})${c.reason ? ` · ${c.reason}` : ""}`);
    add(c.revoked_at, "Cortesia revogada", "ruim");
    if (!c.revoked_at && c.expires_at && new Date(c.expires_at) <= new Date()) add(c.expires_at, "Cortesia venceu", "ruim");
  }
  for (const p of u.pagamentos || []) {
    add(
      p.data,
      `${ROTULO_STATUS_PAGAMENTO[p.status] || p.status}: ${formatarReais(p.amount)} · ${ROTULO_METODO[p.payment_method] || p.payment_method || "método ?"}`,
      p.status === "PAID" ? "bom" : p.status === "CANCELED" ? "ruim" : "neutro"
    );
  }
  add(u.last_login_at, "Último login");
  return eventos.sort((a, b) => new Date(a.data) - new Date(b.data));
}

export default function DetalheUsuario({ usuario: u, aberto, onFechar, onAtivar, onDesativar, processando }) {
  const [detalhe, setDetalhe] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [catalogo, setCatalogo] = useState({ modulos: [], fases: [] });
  const [confirmar, setConfirmar] = useState(null); // 'ativar' | 'desativar'

  const email = u?.email;

  useEffect(() => {
    if (!email) return;
    let vivo = true;
    setDetalhe(null);
    setErro(null);
    setCarregando(true);

    // A assinatura do Stripe mais recente; a da loja é achada no servidor pelos
    // ids da conta.
    const pags = u.pagamentos || [];
    const stripeSub = [...pags].reverse().find((p) => p.stripe_subscription_id)?.stripe_subscription_id || null;
    const temLoja = pags.some((p) => p.payment_method === "APP_STORE_SUBSCRIPTION" || p.payment_method === "PLAY_STORE_SUBSCRIPTION");

    base44.functions
      .invoke("adminListUsuarioDetalhe", { email, stripe_subscription_id: stripeSub, tem_pagamento_loja: temLoja })
      .then((res) => {
        if (!vivo) return;
        if (res?.data?.success) setDetalhe(res.data);
        else setErro(res?.data?.error || "Não foi possível carregar o detalhe");
      })
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));

    return () => {
      vivo = false;
    };
    // O detalhe depende só de quem é a pessoa; recarregar a listagem (depois de
    // uma ação) não deve refazer as consultas externas.
  }, [email]);

  useEffect(() => {
    carregarCatalogoTrilha()
      .then(([modulos, fases]) => setCatalogo({ modulos: modulos || [], fases: fases || [] }))
      .catch(() => {});
  }, []);

  // Fases concluídas agrupadas por módulo, na ordem da trilha.
  const porModulo = useMemo(() => {
    if (!detalhe) return [];
    const progressoPorFase = new Map((detalhe.progresso || []).map((p) => [p.phase_id, p]));
    return catalogo.modulos
      .map((m) => {
        const fases = catalogo.fases.filter((f) => f.module_id === m.id);
        const concluidas = fases.filter((f) => progressoPorFase.get(f.id)?.status === "completed").length;
        const iniciadas = fases.filter((f) => progressoPorFase.has(f.id)).length;
        return { id: m.id, nome: m.name, total: fases.length, concluidas, iniciadas };
      })
      .filter((m) => m.total > 0);
  }, [detalhe, catalogo]);

  if (!u) return null;

  const p = precisao(u);
  const acertoPrimeira = u.total_first_attempts > 0
    ? `${Math.round((u.correct_first_attempts / u.total_first_attempts) * 100)}%`
    : "—";
  const a = u.assinatura;
  const eventos = linhaDoTempo(u, detalhe);
  const passos = jornada(u);

  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            {u.full_name || "Sem nome"}
            <SeloSituacao usuario={u} />
            {u.role === "admin" && <Badge className="bg-purple-100 text-purple-800 border border-purple-200">Admin</Badge>}
          </SheetTitle>
          <SheetDescription className="break-all">{u.email}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {u.alerta && (
            <div className="flex gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {ROTULO_ALERTA[u.alerta]}
            </div>
          )}

          <Secao titulo="Jornada">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {passos.map((s) => (
                <div key={s.chave} className="flex items-center gap-2 text-sm">
                  {s.feito
                    ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                    : <XCircle className="w-4 h-4 text-gray-300" />}
                  <span className={s.feito ? "text-gray-900" : "text-gray-400"}>{s.rotulo}</span>
                </div>
              ))}
            </div>
          </Secao>

          <Secao titulo="Conta">
            <Linha rotulo="Cadastro">{formatarData(u.created_date)}</Linha>
            <Linha rotulo="Entra com">
              {[u.login_google && "Google", u.login_apple && "Apple"].filter(Boolean).join(" e ") || "—"}
            </Linha>
            <Linha rotulo="Último login">{formatarDataHora(u.last_login_at)}</Linha>
            <Linha rotulo="Especialidade">{u.specialty || "—"}</Linha>
            <Linha rotulo="Local">{[u.city, u.state, u.country].filter(Boolean).join(", ") || "—"}</Linha>
            {(u.referred_by_code || u.pending_referral_code) && (
              <Linha rotulo="Cupom de indicação">
                {u.referred_by_code || `${u.pending_referral_code} (digitado, sem compra)`}
              </Linha>
            )}
          </Secao>

          <Secao titulo="Assinatura">
            {u.premium && (
              <Linha rotulo="Premium desde">{formatarData(u.subscription_start_date)}</Linha>
            )}
            {u.trial_ends_at && <Linha rotulo="Cortesia até">{formatarData(u.trial_ends_at)}</Linha>}
            {u.store_expires_at && <Linha rotulo="Prazo da loja">{formatarData(u.store_expires_at)}</Linha>}
            {a ? (
              <>
                <Linha rotulo="Plataforma">{a.plataforma ? ROTULO_PLATAFORMA[a.plataforma] : "—"}</Linha>
                <Linha rotulo="Plano">
                  {a.plano === "vitalicio" ? "Vitalício" : a.plano === "anual" ? "Anual" : a.plano === "mensal" ? "Mensal" : "—"}
                  {(planoEstimado(u) || (!u.premium && (a.plano === "mensal" || a.plano === "anual"))) && (
                    <span className="text-gray-400"> (pelo valor pago)</span>
                  )}
                </Linha>
                <Linha rotulo="Pagamentos">{a.qtd_pagamentos} · total {formatarReais(a.total_pago)}</Linha>
                <Linha rotulo="Primeiro / último">
                  {formatarData(a.primeiro_pagamento_em)} / {formatarData(a.ultimo_pagamento_em)}
                </Linha>
                {a.vitalicio_estornado && <Linha rotulo="Vitalício"><span className="text-red-700">estornado</span></Linha>}
              </>
            ) : (
              <p className="text-sm text-gray-500">Nenhum pagamento registrado.</p>
            )}
            {carregando && <p className="text-xs text-gray-400">Consultando Stripe e lojas…</p>}
            {detalhe && (
              <>
                <EstadoExterno fonte="Stripe agora" estado={detalhe.assinatura_externa?.stripe} />
                <EstadoExterno fonte="Loja agora" estado={detalhe.assinatura_externa?.loja} />
              </>
            )}
          </Secao>

          <Secao titulo="Uso do app">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metrica rotulo="Tentativas" valor={u.total_attempts} />
              <Metrica rotulo="Acerto geral" valor={p === null ? "—" : `${p}%`} />
              <Metrica rotulo="Casos distintos" valor={u.total_first_attempts} />
              <Metrica rotulo="Acerto de 1ª" valor={acertoPrimeira} />
              <Metrica rotulo="Pontos" valor={u.points} />
              <Metrica rotulo="Nível" valor={u.level} />
              <Metrica rotulo="Sequência" valor={`${sequenciaAtual(u)} d`} />
              <Metrica rotulo="Última prática" valor={textoDiasDesde(u.last_practice_date)} />
            </div>
            {detalhe && (
              <div className="pt-2 space-y-1">
                {Object.entries(ROTULO_QUIZ).map(([tipo, rotulo]) => (
                  <Linha key={tipo} rotulo={rotulo}>
                    {detalhe.uso.ultimo_uso[tipo]
                      ? `último uso ${textoDiasDesde(detalhe.uso.ultimo_uso[tipo])} (${formatarData(detalhe.uso.ultimo_uso[tipo])})`
                      : <span className="text-gray-400">nunca usou</span>}
                  </Linha>
                ))}
              </div>
            )}
          </Secao>

          {detalhe && porModulo.length > 0 && (
            <Secao titulo={`Fases concluídas: ${u.fases_concluidas}`}>
              <div className="space-y-1.5">
                {porModulo.map((m) => (
                  <div key={m.id} className="text-sm">
                    <div className="flex justify-between">
                      <span className={m.iniciadas ? "text-gray-900" : "text-gray-400"}>{m.nome}</span>
                      <span className="tabular-nums text-gray-600">{m.concluidas}/{m.total}</span>
                    </div>
                    <div className="h-1.5 rounded bg-gray-100 overflow-hidden">
                      <div className="h-full bg-purple-500" style={{ width: `${(m.concluidas / m.total) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Secao>
          )}

          {detalhe && (
            <Secao titulo={`Conquistas: ${detalhe.conquistas.length} de ${detalhe.conquistas_ativas}`}>
              {detalhe.conquistas.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma ainda.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {detalhe.conquistas.map((c) => (
                    <Badge key={c.achievement_id} variant="outline" title={formatarData(c.earned_at)}>
                      {c.icon ? `${c.icon} ` : ""}{c.name || "Conquista removida"}
                    </Badge>
                  ))}
                </div>
              )}
            </Secao>
          )}

          <Secao titulo="Linha do tempo">
            <ol className="space-y-1.5 border-l border-gray-200 pl-4">
              {eventos.map((e, i) => (
                <li key={i} className="text-sm relative">
                  <span className={`absolute -left-[21px] top-1.5 w-2 h-2 rounded-full ${
                    e.tom === "bom" ? "bg-green-500" : e.tom === "ruim" ? "bg-red-500" : "bg-gray-400"
                  }`} />
                  <span className="text-gray-500 tabular-nums mr-2">{formatarData(e.data)}</span>
                  <span className="text-gray-900">{e.texto}</span>
                </li>
              ))}
            </ol>
          </Secao>

          {detalhe && detalhe.uso.recentes.length > 0 && (
            <Secao titulo="Últimas tentativas">
              <div className="space-y-1">
                {detalhe.uso.recentes.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {t.correct
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                      {ROTULO_QUIZ[t.quiz_type] || t.quiz_type || "—"}
                    </span>
                    <span className="text-gray-500 tabular-nums">{formatarDataHora(t.created_date)}</span>
                  </div>
                ))}
              </div>
            </Secao>
          )}

          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {carregando && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando uso, fases e conquistas…
            </div>
          )}

          <Secao titulo="Ações">
            <div className="flex gap-2">
              {u.premium ? (
                <Button
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  disabled={processando}
                  onClick={() => setConfirmar("desativar")}
                >
                  {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 mr-2" />Desativar premium</>}
                </Button>
              ) : (
                <Button
                  className="bg-amber-600 hover:bg-amber-700"
                  disabled={processando}
                  onClick={() => setConfirmar("ativar")}
                >
                  {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Crown className="w-4 h-4 mr-2" />Ativar premium</>}
                </Button>
              )}
            </div>
          </Secao>
        </div>

        <AlertDialog open={!!confirmar} onOpenChange={(v) => !v && setConfirmar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmar === "ativar" ? "Ativar premium manual?" : "Desativar premium?"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  {confirmar === "ativar" ? (
                    <p>{u.email} passa a ter premium sem prazo. Se estiver em cortesia, ela vira premium permanente.</p>
                  ) : (
                    <>
                      <p>{u.email} volta para Free.</p>
                      <p>Isto <strong>não cancela cobrança</strong> no Stripe nem na loja: só altera o nosso registro.</p>
                      {u.origem === "vitalicio" && (
                        <p className="text-red-700">Esta conta comprou o vitalício. Confira antes de continuar.</p>
                      )}
                    </>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const acao = confirmar;
                  setConfirmar(null);
                  if (acao === "ativar") onAtivar(u);
                  else onDesativar(u);
                }}
              >
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
