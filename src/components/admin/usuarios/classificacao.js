// Rótulos, segmentos, filtros e exportação da tela de usuários.
// -----------------------------------------------------------------------------
// A classificação em si (situação, origem, plataforma, alerta) é feita no
// servidor, pelo adminListUsuarios. Aqui só se traduz para a tela — assim a
// regra de "o que é um ex-assinante" vive num lugar só.
// -----------------------------------------------------------------------------

const DIA_MS = 24 * 60 * 60 * 1000;

export const ROTULO_SITUACAO = {
  premium: "Premium",
  ex_assinante: "Ex-assinante",
  cortesia_vencida: "Cortesia vencida",
  nunca_pagou: "Nunca pagou",
};

export const ROTULO_ORIGEM = {
  mensal: "Mensal",
  anual: "Anual",
  vitalicio: "Vitalício",
  cortesia: "Cortesia",
  manual: "Manual",
  assinatura: "Assinatura (plano ?)",
};

export const COR_ORIGEM = {
  mensal: "bg-blue-100 text-blue-800 border-blue-200",
  anual: "bg-indigo-100 text-indigo-800 border-indigo-200",
  vitalicio: "bg-amber-100 text-amber-800 border-amber-300",
  cortesia: "bg-emerald-100 text-emerald-800 border-emerald-200",
  manual: "bg-purple-100 text-purple-800 border-purple-200",
  assinatura: "bg-slate-100 text-slate-800 border-slate-200",
};

export const COR_SITUACAO = {
  premium: "bg-amber-100 text-amber-800 border-amber-300",
  ex_assinante: "bg-red-100 text-red-800 border-red-200",
  cortesia_vencida: "bg-orange-100 text-orange-800 border-orange-200",
  nunca_pagou: "bg-gray-100 text-gray-700 border-gray-200",
};

export const ROTULO_PLATAFORMA = {
  stripe: "Stripe",
  app_store: "App Store",
  play_store: "Google Play",
  loja: "Loja",
};

export const ROTULO_ALERTA = {
  cortesia_vencida_pendente: "Cortesia vencida, ainda premium (a pessoa não voltou ao app)",
  prazo_loja_vencido: "Prazo da loja vencido, ainda premium (o app confere quando a pessoa voltar)",
  sem_pagamento_recente: "Sem pagamento registrado dentro do ciclo do plano",
};

export const ROTULO_QUIZ = {
  random: "Quiz aleatório",
  module: "Módulos",
  daily: "Caso do dia",
};

// Premium de assinatura com o plano deduzido do valor pago: a tela marca como
// estimativa. O detalhe do usuário traz a resposta exata do Stripe/RevenueCat.
export const planoEstimado = (u) => u.origem === "mensal" || u.origem === "anual";

// ── DATAS ────────────────────────────────────────────────────────────────

export function formatarData(v) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export function formatarDataHora(v) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatarReais(v) {
  if (typeof v !== "number") return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// `last_practice_date` é YYYY-MM-DD no fuso de quem praticou. Lido como data
// local para "hoje" não virar "ontem" por causa do UTC.
function dataLocal(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function diasDesde(v) {
  const d = dataLocal(v);
  if (!d) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(d);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((hoje - alvo) / DIA_MS);
}

export function textoDiasDesde(v) {
  const dias = diasDesde(v);
  if (dias === null) return "nunca";
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

// ── MÉTRICAS ─────────────────────────────────────────────────────────────

export function precisao(u) {
  if (u.total_correct_attempts === null || !u.total_attempts) return null;
  return Math.round((u.total_correct_attempts / u.total_attempts) * 100);
}

// O streak gravado não zera sozinho: quem parou de praticar continua com o
// número antigo na Account até praticar de novo. Só vale se a última prática
// foi hoje ou ontem.
export function sequenciaAtual(u) {
  const dias = diasDesde(u.last_practice_date);
  return dias !== null && dias <= 1 ? u.current_streak || 0 : 0;
}

export function atividade(u) {
  if (!u.total_attempts) return "nunca_praticou";
  const dias = diasDesde(u.last_practice_date);
  if (dias === null) return "parado_30";
  if (dias <= 7) return "ativo_7";
  if (dias <= 30) return "parado_7";
  return "parado_30";
}

export const ROTULO_ATIVIDADE = {
  todas: "Qualquer atividade",
  nunca_praticou: "Nunca praticou",
  ativo_7: "Praticou nos últimos 7 dias",
  parado_7: "Parado de 8 a 30 dias",
  parado_30: "Parado há mais de 30 dias",
};

// Jornada: o que a pessoa já fez, em ordem. Cada passo é um booleano tirado da
// linha da listagem, sem leitura extra.
export function jornada(u) {
  const pagou = (u.assinatura?.qtd_pagamentos || 0) > 0;
  return [
    { chave: "perfil", rotulo: "Completou o perfil", feito: u.profile_completed },
    { chave: "caso", rotulo: "Respondeu o 1º caso", feito: u.total_attempts > 0 },
    { chave: "modulos", rotulo: "Praticou nos Módulos", feito: u.module_first_attempts > 0 },
    { chave: "fase", rotulo: "Concluiu uma fase", feito: u.fases_concluidas > 0 },
    { chave: "cortesia", rotulo: "Recebeu cortesia", feito: (u.cortesias?.length || 0) > 0 },
    { chave: "pagou", rotulo: "Pagou", feito: pagou },
  ];
}

// ── SEGMENTOS E FILTROS ──────────────────────────────────────────────────

// Cada segmento é um filtro. `premium:<origem>` filtra pela origem dentro dos
// premium; `alerta` junta os premium com algo a conferir.
export function noSegmento(u, segmento) {
  if (segmento === "todos") return true;
  if (segmento === "alerta") return !!u.alerta;
  if (segmento.startsWith("premium:")) return u.premium && u.origem === segmento.slice(8);
  return u.situacao === segmento;
}

export function contarSegmentos(usuarios) {
  const c = { todos: usuarios.length, alerta: 0 };
  for (const u of usuarios) {
    c[u.situacao] = (c[u.situacao] || 0) + 1;
    if (u.premium && u.origem) c[`premium:${u.origem}`] = (c[`premium:${u.origem}`] || 0) + 1;
    if (u.alerta) c.alerta += 1;
  }
  return c;
}

export function filtrar(usuarios, { segmento, busca, plataforma, atividade: ativ, perfil }) {
  const termo = (busca || "").trim().toLowerCase();
  return usuarios.filter((u) => {
    if (!noSegmento(u, segmento)) return false;
    if (termo && !u.email.includes(termo) && !(u.full_name || "").toLowerCase().includes(termo)) return false;
    if (plataforma !== "todas" && u.plataforma !== plataforma) return false;
    if (ativ !== "todas" && atividade(u) !== ativ) return false;
    if (perfil === "completo" && !u.profile_completed) return false;
    if (perfil === "incompleto" && u.profile_completed) return false;
    return true;
  });
}

const tempo = (v) => {
  const d = v ? new Date(v).getTime() : NaN;
  return isNaN(d) ? -Infinity : d;
};

export const ORDENACOES = {
  cadastro: { rotulo: "Cadastro mais recente", chave: (u) => tempo(u.created_date) },
  pratica: { rotulo: "Última prática", chave: (u) => tempo(u.last_practice_date) },
  login: { rotulo: "Último login", chave: (u) => tempo(u.last_login_at) },
  casos: { rotulo: "Mais tentativas", chave: (u) => u.total_attempts },
  pagamento: { rotulo: "Último pagamento", chave: (u) => tempo(u.assinatura?.ultimo_pagamento_em) },
};

export function ordenar(usuarios, criterio) {
  const chave = (ORDENACOES[criterio] || ORDENACOES.cadastro).chave;
  return [...usuarios].sort((a, b) => chave(b) - chave(a));
}

// ── CSV ──────────────────────────────────────────────────────────────────

// Ponto e vírgula e BOM: é o que o Excel em português abre sem assistente de
// importação, com acentos certos.
export function exportarCsv(usuarios) {
  const colunas = [
    ["Nome", (u) => u.full_name || ""],
    ["E-mail", (u) => u.email],
    ["Cadastro", (u) => formatarData(u.created_date)],
    ["Situação", (u) => ROTULO_SITUACAO[u.situacao] || u.situacao],
    ["Origem do premium", (u) => (u.origem ? ROTULO_ORIGEM[u.origem] : "")],
    ["Plataforma", (u) => (u.plataforma ? ROTULO_PLATAFORMA[u.plataforma] : "")],
    ["Plano pago (estimado)", (u) => u.assinatura?.plano || ""],
    ["Primeiro pagamento", (u) => formatarData(u.assinatura?.primeiro_pagamento_em)],
    ["Último pagamento", (u) => formatarData(u.assinatura?.ultimo_pagamento_em)],
    ["Último valor", (u) => (typeof u.assinatura?.ultimo_valor === "number" ? u.assinatura.ultimo_valor.toFixed(2).replace(".", ",") : "")],
    ["Total pago", (u) => (u.assinatura ? u.assinatura.total_pago.toFixed(2).replace(".", ",") : "")],
    ["Cortesias", (u) => u.cortesias?.length || 0],
    ["Último login", (u) => formatarData(u.last_login_at)],
    ["Última prática", (u) => formatarData(u.last_practice_date)],
    ["Tentativas", (u) => u.total_attempts],
    ["Precisão %", (u) => precisao(u) ?? ""],
    ["Fases concluídas", (u) => u.fases_concluidas],
    ["Pontos", (u) => u.points],
    ["Perfil completo", (u) => (u.profile_completed ? "sim" : "não")],
    ["Especialidade", (u) => u.specialty || ""],
    ["Cidade", (u) => u.city || ""],
    ["Estado", (u) => u.state || ""],
    ["Cupom de indicação", (u) => u.referred_by_code || u.pending_referral_code || ""],
    ["Alerta", (u) => (u.alerta ? ROTULO_ALERTA[u.alerta] : "")],
  ];

  const escapar = (v) => {
    const s = String(v ?? "");
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const linhas = [
    colunas.map(([titulo]) => titulo).join(";"),
    ...usuarios.map((u) => colunas.map(([, valor]) => escapar(valor(u))).join(";")),
  ];

  const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `usuarios-playecg-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
