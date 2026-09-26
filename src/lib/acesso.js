// O que cada plano abre na trilha e na teoria.
// -----------------------------------------------------------------------------
// UM lugar só, como a correção do caso (caso.js) e a progressão da trilha
// (trilha.js). A regra de plano já esteve espalhada por várias telas, e mudar
// uma sem as outras deixou gente presa no meio do caminho (README §5).
//
// Desde 26/09/2026 o Módulo 1 inteiro é gratuito — as fases, os casos (com a
// explicação de cada um) e a teoria —, e a "Introdução ao ECG" também. Do
// Módulo 2 em diante, só Premium. "Módulo 1" é o de `order` 1: se o admin
// reordenar a trilha, o grátis acompanha o primeiro módulo, que é o que se
// quer. Sem limite diário lá dentro: o recordQuizAttempt só recusa
// `quiz_type: 'random'` (README §5).
//
// Como todas as checagens de plano deste app, isto é decisão do CLIENTE:
// nenhuma function da trilha confere plano.
// -----------------------------------------------------------------------------

export const ORDEM_DO_MODULO_GRATUITO = 1;

export const ehPremium = (conta) => conta?.subscription_type === "premium";

export function moduloGratuito(modulo) {
  return Number(modulo?.order) === ORDEM_DO_MODULO_GRATUITO;
}

// Fases e casos do módulo (ModuleDetail).
export function podeAbrirModulo(conta, modulo) {
  return ehPremium(conta) || moduloGratuito(modulo);
}

// Teoria (ConteudoECG e o índice do Aprenda ECG). A introdução é de todos; o
// conteúdo de módulo e o de fase seguem o módulo. Sem módulo conhecido, fecha:
// falhar aberto aqui entregaria teoria paga a quem não assinou.
export function podeLerConteudo(conta, tipo, modulo) {
  if (ehPremium(conta)) return true;
  if (tipo === "intro") return true;
  return moduloGratuito(modulo);
}
