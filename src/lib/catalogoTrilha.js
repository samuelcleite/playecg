import { base44 } from "@/api/base44Client";

// Catálogo da trilha (Module, Phase e o índice de Content) com cache.
// -----------------------------------------------------------------------------
// O catálogo só muda quando um admin edita; o que muda a cada sessão é o
// PROGRESSO, e esse continua sendo lido a cada visita. Mesmo assim, Dashboard,
// Módulos, Aprenda ECG, Conteúdo e cada abertura de fase reliam módulos e fases
// do servidor — e o Módulos baixava TODOS os conteúdos (o corpo em HTML de cada
// um) só para achar a introdução. Leitura de entidade conta no limite de volume
// do Base44 (o 429), e estas eram as mais repetidas do app.
//
// Duas regras:
//   - o ÍNDICE de conteúdos (id, module_id, phase_id) é o que as telas usam
//     para saber se um conteúdo existe e montar links. O corpo só é lido
//     quando alguém abre o conteúdo (buscarConteudo), um registro por vez.
//   - cache por TTL, não por carregamento: no app nativo a WebView vive dias,
//     e "por carregamento" viraria "para sempre". 15 minutos deixa uma edição
//     do admin aparecer sozinha; puxar para atualizar (invalidarCatalogo) faz
//     aparecer na hora.
//
// Uma falha não fica guardada — a próxima chamada tenta de novo.
// -----------------------------------------------------------------------------

const TTL_MS = 15 * 60 * 1000;
const CAMPOS_DO_INDICE = ["id", "module_id", "phase_id"];

const novoSlot = () => ({ promessa: null, em: 0 });
let catalogo = novoSlot();
let indice = novoSlot();
const conteudos = new Map(); // id -> promessa do Content completo

function lembrar(slot, carregar) {
  const agora = Date.now();
  if (slot.promessa && agora - slot.em < TTL_MS) return slot.promessa;
  slot.em = agora;
  slot.promessa = carregar().catch((erro) => {
    slot.promessa = null;
    throw erro;
  });
  return slot.promessa;
}

// [modulos, fases], ambos ordenados por `order`.
export function carregarCatalogoTrilha() {
  return lembrar(catalogo, () =>
    Promise.all([
      base44.entities.Module.list("order"),
      base44.entities.Phase.list("order"),
    ])
  );
}

// Só id/module_id/phase_id de cada Content. O `fields` é o 4º parâmetro de
// list(sort, limit, skip, fields) e projeta as colunas no servidor. Se o
// servidor ignorar o parâmetro, volta o registro inteiro e tudo continua
// funcionando (só sem a economia); se recusar, cai na lista completa.
export function carregarIndiceDeConteudos() {
  return lembrar(indice, async () => {
    try {
      return await base44.entities.Content.list(null, null, null, CAMPOS_DO_INDICE);
    } catch (erro) {
      console.warn("Content.list com fields falhou, caindo para a lista completa:", erro);
      return base44.entities.Content.list();
    }
  });
}

// Corpo de UM conteúdo, pelo id do índice.
export function buscarConteudo(id) {
  if (!conteudos.has(id)) {
    const promessa = base44.entities.Content.get(id).catch((erro) => {
      conteudos.delete(id);
      throw erro;
    });
    conteudos.set(id, promessa);
  }
  return conteudos.get(id);
}

export function invalidarCatalogo() {
  catalogo = novoSlot();
  indice = novoSlot();
  conteudos.clear();
}

// --- Consultas de conveniência sobre o cache ---------------------------------

export const ehIntroducao = (c) => !c.module_id && !c.phase_id;

// { modulo, fases } de um módulo — fases já ordenadas. `modulo` é null se o id
// não existe (a tela decide o que fazer, normalmente voltar para a trilha).
export async function moduloEFases(moduleId) {
  const [modulos, fases] = await carregarCatalogoTrilha();
  return {
    modulo: modulos.find((m) => m.id === moduleId) || null,
    fases: fases.filter((f) => f.module_id === moduleId).sort((a, b) => a.order - b.order),
  };
}

// Entrada do índice do conteúdo geral de um módulo (sem phase_id), ou null.
export async function conteudoDoModulo(moduleId) {
  const lista = await carregarIndiceDeConteudos();
  return lista.find((c) => c.module_id === moduleId && !c.phase_id) || null;
}

// Entrada do índice do conteúdo de uma fase, ou null. É o bastante para saber
// se o botão "Tem dúvidas?" existe — o corpo só é lido em ConteudoECG.
export async function conteudoDaFase(moduleId, phaseId) {
  const lista = await carregarIndiceDeConteudos();
  return lista.find((c) => c.module_id === moduleId && c.phase_id === phaseId) || null;
}
