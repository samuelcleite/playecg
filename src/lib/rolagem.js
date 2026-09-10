import { useEffect } from "react";

// Volta a tela ao topo quando `chave` muda — pergunta → resultado → próxima
// pergunta nas telas de caso, que trocam o conteúdo inteiro sem trocar de rota.
//
// Quem rola não é o mesmo em toda plataforma: no Android é o documento, no
// resto é o <main> do Layout (ver o comentário longo lá). Zerar os dois cobre
// as duas situações sem precisar saber em qual se está. Não usa scrollIntoView,
// que rola TODOS os ancestrais de uma vez e desloca o layout no iPhone.
export function useRolarAoTopo(chave) {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll("main").forEach((m) => {
      m.scrollTop = 0;
    });
  }, [chave]);
}
