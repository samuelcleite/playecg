import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveIdentity } from '../../shared/auth.ts';

// getPhaseCases — monta o baralho de casos de uma fase, no servidor.
// -----------------------------------------------------------------------------
// Antes o ModuleDetail baixava TODOS os casos da fase atual e de TODAS as fases
// anteriores do módulo (módulos chegam a 170 casos) para escolher 10 no cliente.
// Era a leitura mais pesada desta tela e uma das que estouravam a cota de volume
// de leituras do Base44 — quando estourava, o 429 derrubava a fase inteira.
//
// A leitura aqui é de POOLS pequenos com $nin fazendo a exclusão dos casos já
// completos dentro do banco. Os pools trazem SÓ O ID (`fields`, 5º parâmetro do
// filter): o limite do Base44 é de volume de leitura, e 45 casos inteiros —
// explicação, achados, alternativas — por abertura de fase eram quase cinco
// vezes o que o baralho usa. Os até 10 escolhidos são lidos inteiros no fim,
// numa única leitura por $in.
//
// A JANELA DO POOL VAI NUMA POSIÇÃO ALEATÓRIA, não no topo da lista. Com
// `-created_date` e skip 0, o pool era sempre o dos casos mais recentes do
// recorte: numa fase com mais de 30 casos, os mais antigos dela praticamente
// nunca entravam no baralho. É a mesma raiz do que quebrou o sorteio do Quiz
// aleatório (getRandomCase), só que limitada a uma fase, e por isso bem menos
// visível — quem relatou lá era o catálogo inteiro sendo reduzido a 30.
//
// Aqui não é preciso descobrir o tamanho da consulta por sondagem como no Quiz:
// a function já lê as fases do módulo, e o `total_cases` da fase (digitado no
// admin) posiciona a janela de graça. Estimativa ALTA não estraga o baralho —
// janela curta significa que ela passou do fim, e o pool se reposiciona com o
// tamanho que acabou de descobrir. Estimativa BAIXA (total_cases zerado ou
// defasado no admin) faz a janela ficar no topo: é exatamente o comportamento
// anterior, sem piora, mas também sem o ganho. Quem quiser o efeito completo
// mantém o total_cases das fases em dia.

const CASOS_DA_FASE = 8;
const CASOS_DE_ANTERIORES = 2;
const POOL_FASE = 30;
const POOL_ANTERIORES = 15;
const SO_ID = ['id'];

function embaralhar(array) {
  const s = [...array];
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}

// Lê uma janela de ids em posição aleatória dentro da consulta. `estimativa` é
// quantos registros se espera que a consulta tenha; quando ela é 0 ou menor que
// a janela, o comportamento é o de antes (skip 0), que nesse caso já cobre tudo
// e não enviesa nada.
async function poolAleatorio(base44, consulta, janela, estimativa) {
  const ler = async (skip) =>
    (await base44.entities.ECGCase.filter(consulta, '-created_date', janela, skip, SO_ID)) || [];
  const sortearSkip = (total) => {
    const maximo = Math.max((total || 0) - janela, 0);
    return maximo > 0 ? Math.floor(Math.random() * (maximo + 1)) : 0;
  };

  let skip = sortearSkip(estimativa);
  let ids = await ler(skip);

  // Janela curta com skip > 0: a estimativa passou do fim da consulta. O que
  // veio dá um teto melhor (`skip + tamanho`) e a janela é resorteada dentro
  // dele — o mesmo ajuste que o getRandomCase faz com o teto do catálogo.
  // Janela VAZIA não diz o tamanho, só que ele é menor que o skip, e por isso
  // pode precisar de mais de uma volta até cair na faixa certa.
  for (let ajuste = 0; ajuste < 3 && skip > 0 && ids.length < janela; ajuste++) {
    const novoSkip = sortearSkip(skip + ids.length);
    if (novoSkip === skip) break;
    skip = novoSkip;
    ids = await ler(skip);
  }

  // Rede de segurança: nada encontrado depois dos ajustes. Ler do começo é o
  // comportamento antigo e sempre devolve a janela cheia se ela existir — um
  // baralho curto seria pior que uma leitura a mais.
  if (skip > 0 && ids.length === 0) ids = await ler(0);

  return ids;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const moduleId = body?.module_id;
    const phaseId = body?.phase_id;
    // `revisao` = fase já concluída: o baralho pode repetir casos já feitos.
    const revisao = body?.revisao === true;

    if (!moduleId || !phaseId) {
      return Response.json(
        { error: 'module_id e phase_id são obrigatórios' },
        { status: 400 }
      );
    }

    // As fases do módulo dizem quais são as anteriores (order menor que a atual).
    const fases = await base44.entities.Phase.filter({ module_id: moduleId });
    const faseAtual = fases.find((p) => p.id === phaseId);
    if (!faseAtual) {
      return Response.json({ error: 'Fase não encontrada' }, { status: 404 });
    }
    const idsAnteriores = fases
      .filter((p) => p.order < faseAtual.order)
      .map((p) => p.id);

    // Casos já completos, do UserProgress — é o que alimenta o $nin.
    //
    // A leitura é do MÓDULO, não só desta fase: os 2 casos de revisão vêm das
    // fases anteriores, e saber o que já foi feito nelas é o que separa um caso
    // inédito de um repetido. Antes o $nin dos anteriores recebia os completos
    // da fase ATUAL — ids que, por definição, não estão nas fases anteriores —,
    // então ele não excluía nada, e a consulta de revisão (`$in` dos mesmos
    // ids, dentro das fases anteriores) não podia devolver nada: o baralho de
    // revisão vinha sem os 2 casos. São poucos registros a mais, um por fase
    // do módulo.
    const email = (identity.email || '').trim().toLowerCase();
    const progressos = await base44.asServiceRole.entities.UserProgress.filter({
      user_email: email,
      module_id: moduleId,
    });
    const idsDeProgresso = (id) => {
      const p = (progressos || []).find((x) => x.phase_id === id);
      return Array.isArray(p?.completed_case_ids) ? p.completed_case_ids : [];
    };
    const completos = idsDeProgresso(phaseId);
    const completosAnteriores = idsAnteriores.flatMap(idsDeProgresso);

    // O $nin da fase atual continua no banco: são 8 casos a tirar de lá, e a
    // exclusão precisa valer para a fase inteira, não só para a janela lida. A
    // lista é do tamanho de UMA fase, então a URL da consulta fica curta — o
    // filter do SDK manda a consulta na query string de um GET, e é por isso
    // que a dos anteriores, que seria do tamanho do módulo, é filtrada em
    // memória mais abaixo.
    const excluirFeitos = completos.length > 0 ? { id: { $nin: completos } } : {};

    // Quantos casos cada consulta deve ter, para posicionar a janela do pool.
    // `total_cases` é digitado no admin e pode estar defasado — daí o
    // poolAleatorio se corrigir sozinho quando a janela vem curta.
    const restantesNaFase = (faseAtual.total_cases || 0) - completos.length;
    const totalAnteriores = fases
      .filter((p) => idsAnteriores.includes(p.id))
      .reduce((soma, p) => soma + (p.total_cases || 0), 0);

    // --- 8 da fase atual, inéditos na frente ---
    const ineditos = await poolAleatorio(
      base44,
      { module_id: moduleId, phase_id: phaseId, ...excluirFeitos },
      POOL_FASE,
      restantesNaFase
    );
    let daFase = embaralhar(ineditos).slice(0, CASOS_DA_FASE);

    // Revisão (ou inéditos insuficientes): completa com os já feitos. Aqui o
    // tamanho da consulta é exato — é a própria lista de completos.
    if (revisao && daFase.length < CASOS_DA_FASE) {
      const feitos = await poolAleatorio(
        base44,
        { module_id: moduleId, phase_id: phaseId, id: { $in: completos } },
        POOL_FASE,
        completos.length
      );
      daFase = [
        ...daFase,
        ...embaralhar(feitos).slice(0, CASOS_DA_FASE - daFase.length),
      ];
    }

    // --- até 2 das fases anteriores, inéditos na frente ---
    let anteriores = [];
    if (idsAnteriores.length > 0) {
      // Uma janela só, e a separação entre inédito e já feito acontece aqui
      // dentro. A lista de completos das fases anteriores é do tamanho do
      // módulo — que chega a 170 casos —, grande demais para ir num $nin pela
      // query string; e são 2 casos a escolher de uma janela de 15, então
      // filtrar em memória basta.
      const janela = await poolAleatorio(
        base44,
        { module_id: moduleId, phase_id: { $in: idsAnteriores } },
        POOL_ANTERIORES,
        totalAnteriores
      );
      const feitos = new Set(completosAnteriores);

      anteriores = embaralhar(janela.filter((c) => !feitos.has(c.id))).slice(0, CASOS_DE_ANTERIORES);

      // Faltou inédito na janela: completa com os já feitos dela. Em revisão é
      // o esperado; fora dela, é melhor que entregar um baralho curto — e é o
      // que a tela já recebia antes, quando o $nin daqui não excluía nada.
      if (anteriores.length < CASOS_DE_ANTERIORES) {
        anteriores = [
          ...anteriores,
          ...embaralhar(janela.filter((c) => feitos.has(c.id))).slice(
            0,
            CASOS_DE_ANTERIORES - anteriores.length
          ),
        ];
      }
    }

    // Os escolhidos, agora inteiros: uma leitura por $in com os até 10 ids.
    const escolhidos = [
      ...daFase.map((c) => ({ id: c.id, caseSource: 'current_phase' })),
      ...anteriores.map((c) => ({ id: c.id, caseSource: 'previous_phase' })),
    ];
    const ids = escolhidos.map((e) => e.id);
    const registros = ids.length > 0
      ? await base44.entities.ECGCase.filter({ id: { $in: ids } }, null, ids.length)
      : [];
    const porId = new Map(registros.map((c) => [c.id, c]));

    const casos = embaralhar(
      escolhidos
        .filter((e) => porId.has(e.id))
        .map((e) => ({ ...porId.get(e.id), caseSource: e.caseSource }))
    );

    return Response.json({ success: true, cases: casos });
  } catch (error) {
    console.error('Erro em getPhaseCases:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});