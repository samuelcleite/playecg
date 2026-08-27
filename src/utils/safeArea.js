// Quem reserva o entalhe: o wrapper para o conteúdo em fluxo, o app para o resto.
// -----------------------------------------------------------------------------
// DEPENDÊNCIA DE PAINEL: isto só fecha a conta com a opção **"Auto Inject Safe
// Area" LIGADA** no dashboard do Despia. Ela é peça obrigatória, não
// conveniência. Se alguém desligar, o topo do app volta para debaixo da câmera e
// nada no código avisa.
//
// A divisão de trabalho, e por que ela não é simétrica:
//
//   Conteúdo em fluxo -> do wrapper. O "Auto Inject Safe Area" empurra as
//   MARGENS do body, e isso já põe toda tela normal abaixo do entalhe. O app
//   NÃO pode reservar de novo: as duas somam e sobra uma faixa branca do
//   tamanho de dois entalhes. Foi o que apareceu no aparelho em 27/08/2026.
//
//   `position: fixed` / `sticky` -> do app. Esses se ancoram na viewport e
//   ignoram margem de body, então o wrapper não tem como alcançá-los. É o caso
//   da faixa que cobre o entalhe e do header grudento do Dashboard, que usam
//   `--app-safe-top` direto.
//
// Houve uma versão anterior (revertida no mesmo dia) em que o app tomava a
// reserva para si e zerava a margem injetada. Não funcionou no aparelho: a
// margem chega quando o runtime do Despia quer, e o observador de mutação nunca
// via a injeção. Trocar a corrida por uma checagem de user agent é o ponto desta
// versão -- a marca abaixo é decidida por `isDespiaApp()`, antes do primeiro
// render, e não depende de o wrapper já ter feito a parte dele.
//
// O par de variáveis está no index.css:
//   --app-safe-top        -> o valor real do entalhe. Para quem é fixed/sticky.
//   --app-safe-top-fluxo  -> 0px aqui dentro, porque o body já desceu.

import { isDespiaApp } from "@/utils/platform";

export function assumirSafeArea() {
  if (typeof document === "undefined") return;
  if (!isDespiaApp()) return;

  // No <html> e não no <body>: o React não toca no elemento raiz, então a marca
  // sobrevive a qualquer re-render.
  document.documentElement.setAttribute("data-safe-area-do-wrapper", "1");
}
