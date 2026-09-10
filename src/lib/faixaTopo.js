import { useEffect } from "react";

// Cor da faixa que o Layout pinta sobre o entalhe/status bar no mobile.
//
// A faixa precisa ter a cor do que está logo abaixo dela, senão vira uma tarja
// no alto da tela (ver o comentário da faixa no Layout, medido em 27/08/2026).
// Antes a regra era por PÁGINA — branco no Dashboard, cinza no resto —, mas no
// redesenho a mesma página troca de topo: o Quiz tem topo branco na pergunta e
// fundo cinza no resultado. Então quem declara a cor é o componente que está na
// tela, e o Layout só lê a variável (com a regra antiga como padrão).
//
// A limpeza remove a variável ao desmontar. Numa troca de tela o React roda as
// limpezas dos que saem antes dos efeitos dos que entram, então a cor da tela
// nova prevalece.
export const FAIXA_BRANCA = "#FFFFFF";
export const FAIXA_CINZA = "#F4F6F8";

export function useCorDaFaixa(cor) {
  useEffect(() => {
    const raiz = document.documentElement.style;
    raiz.setProperty("--app-faixa-cor", cor);
    return () => raiz.removeProperty("--app-faixa-cor");
  }, [cor]);
}
