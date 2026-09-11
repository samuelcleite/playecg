import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveIdentity } from '../../shared/auth.ts';

// getPhaseCases — monta o baralho de casos de uma fase, no servidor.
// -----------------------------------------------------------------------------
// Antes o ModuleDetail baixava TODOS os casos da fase atual e de TODAS as fases
// anteriores do módulo (módulos chegam a 170 casos) para escolher 10 no cliente.
// Era a leitura mais pesada desta tela e uma das que estouravam a cota de volume
// de leituras do Base44 — quando estourava, o 429 derrubava a fase inteira.
//
// Mesmo padrão do getRandomCase: a leitura aqui é de POOLS pequenos com $nin
// fazendo a exclusão dos casos já completos dentro do banco. No máximo 10 casos
// atravessam a rede, em vez de centenas.

const CASOS_DA_FASE = 8;
const CASOS_DE_ANTERIORES = 2;
const POOL_FASE = 30;
const POOL_ANTERIORES = 15;

function embaralhar(array) {
  const s = [...array];
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
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

    // Casos já completos nesta fase, do UserProgress — é o que alimenta o $nin.
    const email = (identity.email || '').trim().toLowerCase();
    const progressos = await base44.asServiceRole.entities.UserProgress.filter({
      user_email: email,
      module_id: moduleId,
      phase_id: phaseId,
    });
    const completos = Array.isArray(progressos?.[0]?.completed_case_ids)
      ? progressos[0].completed_case_ids
      : [];

    const excluirFeitos = completos.length > 0 ? { id: { $nin: completos } } : {};

    // --- 8 da fase atual, inéditos na frente ---
    const ineditos = await base44.entities.ECGCase.filter(
      { module_id: moduleId, phase_id: phaseId, ...excluirFeitos },
      '-created_date',
      POOL_FASE
    );
    let daFase = embaralhar(ineditos).slice(0, CASOS_DA_FASE);

    // Revisão (ou inéditos insuficientes): completa com os já feitos.
    if (revisao && daFase.length < CASOS_DA_FASE) {
      const feitos = await base44.entities.ECGCase.filter(
        { module_id: moduleId, phase_id: phaseId, id: { $in: completos } },
        '-created_date',
        POOL_FASE
      );
      daFase = [
        ...daFase,
        ...embaralhar(feitos).slice(0, CASOS_DA_FASE - daFase.length),
      ];
    }

    // --- até 2 das fases anteriores, inéditos na frente ---
    let anteriores = [];
    if (idsAnteriores.length > 0) {
      const filtroAnteriores = {
        module_id: moduleId,
        phase_id: { $in: idsAnteriores },
        ...excluirFeitos,
      };
      const ineditasAnteriores = await base44.entities.ECGCase.filter(
        filtroAnteriores,
        '-created_date',
        POOL_ANTERIORES
      );
      anteriores = embaralhar(ineditasAnteriores).slice(0, CASOS_DE_ANTERIORES);

      if (revisao && anteriores.length < CASOS_DE_ANTERIORES) {
        const feitasAnteriores = await base44.entities.ECGCase.filter(
          { module_id: moduleId, phase_id: { $in: idsAnteriores }, id: { $in: completos } },
          '-created_date',
          POOL_ANTERIORES
        );
        anteriores = [
          ...anteriores,
          ...embaralhar(feitasAnteriores).slice(
            0,
            CASOS_DE_ANTERIORES - anteriores.length
          ),
        ];
      }
    }

    const casos = embaralhar([
      ...daFase.map((c) => ({ ...c, caseSource: 'current_phase' })),
      ...anteriores.map((c) => ({ ...c, caseSource: 'previous_phase' })),
    ]);

    return Response.json({ success: true, cases: casos });
  } catch (error) {
    console.error('Erro em getPhaseCases:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});