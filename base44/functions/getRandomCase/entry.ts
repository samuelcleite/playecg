import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveIdentity } from '../../shared/auth.ts';

// getRandomCase — sorteia UM caso para o Quiz aleatório, no servidor.
// -----------------------------------------------------------------------------
// Antes a tela de Quiz baixava a lista COMPLETA de casos (mais de mil
// registros) a cada carregamento para sortear um não-tentado no cliente. Era a
// leitura mais pesada que restava no app, e uma das que consumiam a cota de
// volume de leituras do Base44 — quando estourava, o getMyAccount de TODOS os
// usuários falhava com 500.
//
// Aqui a leitura é de um POOL pequeno: os casos já tentados vêm da própria
// Account (attempted_case_ids, mantidos pelo recordQuizAttempt) e o $nin faz a
// exclusão dentro do banco — o histórico não atravessa a rede em lugar nenhum.

// Tamanho do pool de onde o caso é sorteado. Pequeno de propósito: a leitura é
// de POOL registros por pergunta, não da lista inteira a cada carregamento.
const TAMANHO_POOL = 30;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    // `reiniciar` é o "Recomeçar Quiz" da tela de casos completos: ignora os
    // casos já tentados e sorteia entre todos. Não é porta de segurança
    // nenhuma — caso aleatório não é dado sensível, e o limite diário do
    // gratuito continua sendo aplicado pelo recordQuizAttempt.
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

    // Casos já tentados vêm da Account — nenhuma leitura de histórico.
    const jaTentados = Array.isArray(account.attempted_case_ids) ? account.attempted_case_ids : [];
    const consulta = reiniciar || jaTentados.length === 0
      ? {}
      : { id: { $nin: jaTentados } };

    // Só os IDs do pool atravessam a rede (`fields`, 5º parâmetro do filter,
    // projeta no servidor). O limite do Base44 é de VOLUME de leitura: 30 casos
    // inteiros — cada um com explicação, achados e alternativas — por pergunta
    // eram ~30x o que a resposta precisa. O sorteado é lido inteiro depois,
    // uma leitura de um registro.
    const pool = await base44.entities.ECGCase.filter(consulta, '-created_date', TAMANHO_POOL, 0, ['id']);

    if (pool.length === 0) {
      // Pool vazio: ou a pessoa tentou tudo (tela de "Parabéns") ou não existe
      // caso no app. Uma leitura decide qual.
      const existeAlgum = await base44.entities.ECGCase.filter({}, '-created_date', 1, 0, ['id']);
      return Response.json({
        success: true,
        case: null,
        completed: existeAlgum.length > 0
      });
    }

    const sorteado = pool[Math.floor(Math.random() * pool.length)];
    const caso = await base44.entities.ECGCase.get(sorteado.id);
    return Response.json({ success: true, case: caso, completed: false });
  } catch (error) {
    console.error('Erro em getRandomCase:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});