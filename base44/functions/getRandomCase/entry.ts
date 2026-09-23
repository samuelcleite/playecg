import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveIdentity } from '../../shared/auth.ts';

// getRandomCase — sorteia UM caso para o Quiz aleatório, no servidor.
// -----------------------------------------------------------------------------
// Como chegamos aqui, porque as duas versões anteriores explicam as regras
// desta:
//
//   1. A tela baixava a lista COMPLETA de casos (mais de mil) a cada pergunta
//      para sortear no cliente. Sorteio certo, leitura absurda — uma das que
//      estouravam a cota de volume do Base44 (o 429 que derrubava o
//      getMyAccount de todo mundo).
//   2. Trocou-se aquilo por um pool dos 30 casos MAIS NOVOS (-created_date,
//      skip 0) com $nin dos já tentados. Matou o 429 e matou o sorteio junto:
//      como os casos são cadastrados em lote, por tema, os 30 do topo são quase
//      todos do mesmo assunto e a pessoa ficava presa no último lote. Foi o que
//      os alunos relataram — "só apareceu IAM e DHE", "um tanto de criança".
//
// Agora o sorteio é de POSIÇÃO: escolhe-se um offset aleatório e lê-se o id que
// está lá. O catálogo inteiro é elegível e nada além daquele id atravessa a
// rede. Por pergunta: 1 id + a Account + o caso escolhido — menos leitura que o
// pool de 30 e uma ida a menos ao servidor.
//
// O tamanho do catálogo não é consultável (o SDK não tem count) e descobri-lo
// por sondagem custaria idas ao servidor a cada pergunta. Ele é APRENDIDO: o
// offset sai de [0, teto) e, quando a leitura volta vazia, ficou provado que o
// catálogo é menor que aquele offset — o teto desce e a pergunta é resorteada.
// Isso não enviesa nada: offset vazio é descartado, então o que sai é uniforme
// sobre os casos que EXISTEM. O teto só decide quantas sondas se gasta até lá,
// e converge nas primeiras perguntas de cada isolate.
//
// Repetição: os já tentados são filtrados EM MEMÓRIA (a lista já vem na
// Account, custo zero), e não mais por $nin. Além de tirar da URL um array que
// crescia sem limite — o filter do SDK manda a consulta na query string de um
// GET —, é o que permite o sorteio por posição. Casos respondidos ANTES de
// 11/09/2026 não estão nessa lista (ela nasceu com o recordQuizAttempt, sem
// backfill) e podem reaparecer de vez em quando: decisão consciente, já que o
// sorteio agora é sobre o catálogo todo e a chance disso é pequena e difusa.

// Teto inicial do tamanho do catálogo. Alto de propósito: precisa ser um limite
// SUPERIOR de verdade, senão o fim da lista (os casos mais antigos) nunca seria
// sorteado. Se estiver folgado demais, as primeiras sondas do isolate voltam
// vazias e o próprio teto se corrige.
const TETO_INICIAL = 2500;
// O teto aprendido só vale enquanto o catálogo não cresce. Casos novos entram
// no TOPO (-created_date) e empurram os antigos para além do teto, então ele é
// reaberto de tempos em tempos para o fim da lista não sumir.
const TETO_TTL_MS = 30 * 60 * 1000;
// Sondas por pergunta, contando as que voltam vazias (teto folgado) e as que
// caem em caso já tentado.
const MAX_SONDAS = 6;
// A primeira sonda lê 1 id só. Se cair em caso já tentado, as seguintes leem
// uma janela — para quem já respondeu muito, achar um inédito numa tacada só
// sai mais barato que sondar de um em um.
const JANELA_AMPLA = 15;
// Varredura: só para quem está no fim do catálogo, quando nenhuma sonda achou
// inédito. É o único caminho caro, e é o que responde com certeza se ainda
// existe caso novo ou se é hora da tela de "Parabéns".
const PAGINA_VARREDURA = 200;
const MAX_PAGINAS_VARREDURA = 12;

const SO_ID = ['id'];

// Estado por isolate. Não é cache de dado: é o que o processo já aprendeu sobre
// o tamanho da lista. Perder isso num isolate frio não muda resposta nenhuma,
// só gasta uma sonda a mais.
let teto = TETO_INICIAL;
let tetoAprendidoEm = 0;

function sortearDe(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// Uma sonda: offset aleatório, janela de ids, devolve os que a pessoa ainda não
// tentou. Devolve null quando o offset caiu além do fim da lista (e aí o teto
// já foi corrigido).
async function sondar(base44, janela, tentados) {
  // O offset é sorteado de forma que a janela ainda caiba: sem isso, janelas
  // perto do fim voltariam curtas e os casos mais antigos seriam sorteados
  // menos que os do meio.
  const limite = Math.max(teto - janela + 1, 1);
  const skip = Math.floor(Math.random() * limite);

  // Offset além do fim devolve lista vazia. Se algum dia devolver erro, o
  // tratamento é o mesmo — baixar o teto e sortear de novo —, e não derrubar a
  // pergunta: a varredura logo abaixo lê a partir do offset 0 e continua sendo
  // o caminho por onde uma falha de verdade aparece.
  let pagina;
  try {
    pagina = await base44.entities.ECGCase.filter({}, '-created_date', janela, skip, SO_ID);
  } catch (_e) {
    pagina = null;
  }

  if (!pagina || pagina.length === 0) {
    teto = Math.max(skip, 1);
    return null;
  }

  return pagina.filter((caso) => !tentados.has(caso.id));
}

// Varredura do catálogo em páginas de ids, para quem já tentou quase tudo. As
// sondas aleatórias erram demais nessa faixa (quase todo offset cai em caso já
// feito), e é aqui que se decide entre "achei um inédito" e "acabaram os
// casos" — a tela de "Parabéns" não pode ser um chute.
async function varrerInedito(base44, tentados) {
  let viuAlgum = false;

  for (let pagina = 0; pagina < MAX_PAGINAS_VARREDURA; pagina++) {
    const ids = await base44.entities.ECGCase.filter(
      {},
      '-created_date',
      PAGINA_VARREDURA,
      pagina * PAGINA_VARREDURA,
      SO_ID
    );
    if (!ids || ids.length === 0) return { id: null, fim: true, catalogoVazio: !viuAlgum };
    viuAlgum = true;

    const livres = ids.filter((caso) => !tentados.has(caso.id));
    if (livres.length > 0) return { id: sortearDe(livres).id, fim: false, catalogoVazio: false };

    // Página incompleta = fim da lista. Se nada era inédito até aqui, acabou
    // mesmo.
    if (ids.length < PAGINA_VARREDURA) return { id: null, fim: true, catalogoVazio: false };
  }

  // Estourou o teto de páginas: não dá para afirmar que acabou, então não
  // afirmamos. Quem chama devolve erro à tela, em vez de um "Parabéns"
  // mentiroso.
  return { id: null, fim: false, catalogoVazio: false };
}

// Escolhe o caso da vez. Três saídas possíveis e mutuamente exclusivas:
//   { id }            — sorteado, é o caso da pergunta
//   { completed }     — existem casos, mas a pessoa já tentou todos
//   { indisponivel }  — não deu para decidir; a tela mostra erro, não "Parabéns"
async function escolherCaso(base44, tentados) {
  for (let sonda = 0; sonda < MAX_SONDAS; sonda++) {
    const livres = await sondar(base44, sonda === 0 ? 1 : JANELA_AMPLA, tentados);
    if (livres === null) continue; // offset além do fim: o teto já se corrigiu
    if (livres.length > 0) return { id: sortearDe(livres).id };
  }

  const varredura = await varrerInedito(base44, tentados);
  if (varredura.id) return { id: varredura.id };
  if (varredura.fim) return { completed: !varredura.catalogoVazio };
  return { indisponivel: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    // `reiniciar` é o "Recomeçar Quiz" da tela de casos completos: zera os já
    // tentados e sorteia entre todos de novo. Não é porta de segurança nenhuma
    // — caso aleatório não é dado sensível, e o limite diário do gratuito
    // continua sendo aplicado pelo recordQuizAttempt.
    const reiniciar = body?.reiniciar === true;

    const email = (identity.email || '').trim().toLowerCase();
    const contas = await base44.asServiceRole.entities.Account.filter({ email });
    const account = contas && contas.length > 0 ? contas[0] : null;
    if (!account) {
      return Response.json(
        { error: 'Conta não encontrada', code: 'account_not_found' },
        { status: 404 }
      );
    }

    if (Date.now() - tetoAprendidoEm > TETO_TTL_MS) {
      teto = TETO_INICIAL;
      tetoAprendidoEm = Date.now();
    }

    // Casos já tentados vêm da Account — nenhuma leitura de histórico.
    //
    // No "Recomeçar Quiz" a lista é zerada NO SERVIDOR. Antes só o estado da
    // tela era limpo: o servidor continuava com todos os casos marcados, o
    // botão dava um caso e a pessoa caía de volta no "Parabéns". A QuizAttempt
    // continua guardando o histórico de verdade; esta lista é só o espelho que
    // diz o que não repetir.
    const listaDaConta = Array.isArray(account.attempted_case_ids) ? account.attempted_case_ids : [];
    if (reiniciar && listaDaConta.length > 0) {
      await base44.asServiceRole.entities.Account.update(account.id, { attempted_case_ids: [] });
    }
    const tentados = new Set(reiniciar ? [] : listaDaConta);

    const escolha = await escolherCaso(base44, tentados);

    if (escolha.indisponivel) {
      return Response.json(
        { error: 'Não foi possível sortear um caso agora', code: 'sorteio_indisponivel' },
        { status: 503 }
      );
    }

    if (!escolha.id) {
      // Ou a pessoa tentou tudo (tela de "Parabéns") ou não existe caso no app
      // — `completed` separa os dois.
      return Response.json({ success: true, case: null, completed: escolha.completed === true });
    }

    const caso = await base44.entities.ECGCase.get(escolha.id);
    return Response.json({ success: true, case: caso, completed: false });
  } catch (error) {
    console.error('Erro em getRandomCase:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
