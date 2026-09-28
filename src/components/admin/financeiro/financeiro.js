// Contas da tela Financeiro. Tudo puro: recebe as receitas já classificadas
// pelo adminListFinanceiro (cada uma com o dia de competência e o dia de caixa)
// e as despesas cruas, e devolve o que a tela mostra.
//
// Datas circulam como 'YYYY-MM-DD' (dia de Brasília) e meses como 'YYYY-MM':
// comparar string é comparar data, e nenhum fuso do aparelho entra na conta.

export const REGIMES = {
  competencia: {
    rotulo: "Competência",
    explicacao: "Receita no dia da venda; despesa no mês de competência.",
  },
  caixa: {
    rotulo: "Caixa",
    explicacao: "Receita no dia em que cai na conta (Stripe e Google +30 dias, Apple +60); despesa no dia do pagamento.",
  },
};

export const CANAIS = {
  stripe: "Stripe",
  google: "Google Play",
  apple: "App Store",
  outro: "Outros",
};

// Mesma lista (e mesma ordem) do enum de Expense.category e da validação no
// adminDespesas. Mudou aqui, muda lá.
export const CATEGORIAS = {
  infraestrutura: "Infraestrutura",
  software: "Ferramentas e software",
  impostos: "Impostos",
  taxas: "Taxas (Stripe e lojas)",
  marketing: "Marketing",
  pessoal: "Pessoal e pró-labore",
  servicos: "Serviços (contador, jurídico)",
  outros: "Outros",
};

export const COR_CATEGORIA = {
  infraestrutura: "bg-blue-100 text-blue-800 border-blue-200",
  software: "bg-indigo-100 text-indigo-800 border-indigo-200",
  impostos: "bg-red-100 text-red-800 border-red-200",
  taxas: "bg-orange-100 text-orange-800 border-orange-200",
  marketing: "bg-pink-100 text-pink-800 border-pink-200",
  pessoal: "bg-green-100 text-green-800 border-green-200",
  servicos: "bg-teal-100 text-teal-800 border-teal-200",
  outros: "bg-gray-100 text-gray-800 border-gray-200",
};

const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatarMoeda = (v) => moeda.format(v || 0);

export function formatarDia(dia) {
  if (!dia) return "—";
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

export function nomeDoMes(mes, { comAno = true } = {}) {
  const [a, m] = mes.split("-");
  const nome = NOMES_MES[Number(m) - 1];
  return comAno ? `${nome}/${a}` : nome;
}

export function hojeBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

// Mesmo dia no mês seguinte, preso ao último dia quando o mês é mais curto
// (31/01 → 28/02). É o "Duplicar" das despesas recorrentes.
export function somarUmMes(dia) {
  if (!dia) return dia;
  const [a, m, d] = dia.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m, Math.min(d, ultimoDia))).toISOString().slice(0, 10);
}

export const dataDaReceita = (r, regime) => (regime === "caixa" ? r.caixa : r.competencia);

// Despesa em aberto não tem data de caixa: ela só entra no caixa quando é paga.
export const dataDaDespesa = (d, regime) => (regime === "caixa" ? d.payment_date || null : d.competence_date);

export const emAberto = (d, hoje) => !d.payment_date || d.payment_date > hoje;

const noPeriodo = (dia, ano, mes) => !!dia && (mes ? dia.startsWith(mes) : dia.startsWith(`${ano}-`));

// Anos com algum lançamento, em qualquer dos dois regimes, mais o ano atual.
export function anosDisponiveis(receitas, despesas, hoje) {
  const anos = new Set([hoje.slice(0, 4)]);
  for (const r of receitas) {
    anos.add(r.competencia.slice(0, 4));
    anos.add(r.caixa.slice(0, 4));
  }
  for (const d of despesas) {
    if (d.competence_date) anos.add(d.competence_date.slice(0, 4));
    if (d.payment_date) anos.add(d.payment_date.slice(0, 4));
  }
  return [...anos].sort().reverse();
}

// Uma linha por mês do ano. `previsto` é a parte da linha com data depois de
// hoje: no caixa, venda recente que ainda não caiu; em qualquer regime, despesa
// lançada para o futuro.
export function linhasDoAno(receitas, despesas, regime, ano, hoje) {
  const linhas = Array.from({ length: 12 }, (_, i) => {
    const mes = `${ano}-${String(i + 1).padStart(2, "0")}`;
    return {
      mes,
      canais: { stripe: 0, google: 0, apple: 0, outro: 0 },
      vendas: 0,
      receita: 0,
      despesa: 0,
      resultado: 0,
      previsto: 0,
    };
  });
  const porMes = new Map(linhas.map((l) => [l.mes, l]));

  for (const r of receitas) {
    const dia = dataDaReceita(r, regime);
    const linha = porMes.get(dia.slice(0, 7));
    if (!linha) continue;
    linha.canais[r.canal] += r.valor;
    linha.receita += r.valor;
    linha.vendas++;
    if (dia > hoje) linha.previsto += r.valor;
  }

  for (const d of despesas) {
    const dia = dataDaDespesa(d, regime);
    const linha = dia && porMes.get(dia.slice(0, 7));
    if (!linha) continue;
    linha.despesa += d.amount || 0;
    if (dia > hoje) linha.previsto += d.amount || 0;
  }

  for (const l of linhas) l.resultado = l.receita - l.despesa;
  return linhas;
}

export function somarLinhas(linhas) {
  const total = { canais: { stripe: 0, google: 0, apple: 0, outro: 0 }, vendas: 0, receita: 0, despesa: 0, resultado: 0, previsto: 0 };
  for (const l of linhas) {
    for (const c of Object.keys(total.canais)) total.canais[c] += l.canais[c];
    total.vendas += l.vendas;
    total.receita += l.receita;
    total.despesa += l.despesa;
    total.resultado += l.resultado;
    total.previsto += l.previsto;
  }
  return total;
}

// Posição de hoje, independente do período escolhido.
export function posicaoDeHoje(receitas, despesas, hoje) {
  const aReceber = receitas.filter((r) => r.caixa > hoje);
  const aPagar = despesas.filter((d) => emAberto(d, hoje));
  return {
    aReceber: aReceber.reduce((s, r) => s + r.valor, 0),
    aReceberQtd: aReceber.length,
    aPagar: aPagar.reduce((s, d) => s + (d.amount || 0), 0),
    aPagarQtd: aPagar.length,
  };
}

export function filtrarDespesas(despesas, { regime, ano, mes, categoria, somenteEmAberto, hoje }) {
  return despesas
    .filter((d) =>
      somenteEmAberto ? emAberto(d, hoje) : noPeriodo(dataDaDespesa(d, regime), ano, mes)
    )
    .filter((d) => categoria === "todas" || d.category === categoria)
    .sort((a, b) =>
      (b.competence_date || "").localeCompare(a.competence_date || "") ||
      (b.amount || 0) - (a.amount || 0)
    );
}

export function somarPorCategoria(despesas) {
  const soma = {};
  for (const d of despesas) soma[d.category] = (soma[d.category] || 0) + (d.amount || 0);
  return Object.entries(soma).sort((a, b) => b[1] - a[1]);
}
