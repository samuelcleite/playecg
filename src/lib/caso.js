// Regras de correção de um caso de ECG, num lugar só.
//
// Viviam copiadas no Quiz, no ModuleDetail e no DailyCase — a mesma conta de
// "acertou?" escrita três vezes. Se uma cópia mudasse sem as outras, o mesmo
// caso daria certo numa tela e errado na outra.

// Tentativas por caso antes de revelar a resposta (Quiz e ModuleDetail). O
// Caso do dia é de tentativa única e não usa isto.
export const MAX_TENTATIVAS = 3;

// `correct_answers` é o campo novo; casos antigos só têm `correct_diagnosis`.
export function respostasCorretas(caso) {
  return caso?.correct_answers?.length > 0 ? caso.correct_answers : [caso?.correct_diagnosis];
}

// Múltipla escolha só está certa com o conjunto EXATO: marcar a mais ou a
// menos conta como erro.
export function acertou(caso, selecionadas) {
  const corretas = respostasCorretas(caso);
  if (caso?.multiple_correct) {
    const sel = new Set(selecionadas);
    const cor = new Set(corretas);
    return sel.size === cor.size && [...sel].every((r) => cor.has(r));
  }
  return selecionadas.length === 1 && corretas.includes(selecionadas[0]);
}

// Alternar uma alternativa: em múltipla escolha soma/tira, senão substitui.
export function alternar(caso, selecionadas, opcao) {
  if (!caso?.multiple_correct) return [opcao];
  return selecionadas.includes(opcao)
    ? selecionadas.filter((a) => a !== opcao)
    : [...selecionadas, opcao];
}

// Para o CaseResult: cada resposta marcada, dizendo se era certa.
export function marcarRespostas(caso, selecionadas) {
  const corretas = respostasCorretas(caso);
  return selecionadas.map((texto) => ({ texto, certa: corretas.includes(texto) }));
}

// As alternativas no formato do CaseQuestion. O id é o próprio texto: é ele que
// o banco guarda em correct_answers e que o recordQuizAttempt recebe.
export function alternativasDe(caso) {
  return (caso?.options || []).map((texto) => ({ id: texto, texto }));
}
