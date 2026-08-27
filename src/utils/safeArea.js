// Quem manda na safe-area é o app — e só ele.
// -----------------------------------------------------------------------------
// O painel do Despia tem a opção "Auto Inject Safe Area", que reserva o entalhe
// empurrando as MARGENS do body. Isso conserta metade do problema e não tem como
// consertar a outra: margem de body só afeta conteúdo em fluxo. Quem está em
// `position: fixed` ou `position: sticky` se ancora na viewport e ignora a
// margem — o header grudento do Dashboard, por exemplo, continua passando por
// cima do entalhe com a opção ligada.
//
// Como o app precisa do número de qualquer jeito para esses elementos, ele passa
// a reservar o topo sozinho (--app-safe-top, ver index.css) e zera a margem que
// o Despia injeta. Sem isso as duas reservas se somam e sobra uma faixa branca
// do tamanho de dois entalhes.
//
// SÓ O TOPO. O rodapé é do wrapper e continua sendo: medido no iPhone em
// 27/08/2026, a barra de baixo já estava no lugar certo antes de qualquer
// mudança, e reservar o indicador de home pela segunda vez descolou a barra do
// fim da tela. Onde o aparelho diz que está bom, não se mexe.
//
// Zerar não é só evitar a soma: com a margem no lugar, o `html, body, #root {
// height: 100% }` do Layout faz o body terminar N pixels ABAIXO da tela, e o
// app ganha uma rolagem fantasma do tamanho do entalhe.
//
// A troca só acontece quando há um valor real para colocar no lugar: se
// `--safe-area-top` não estiver definida (runtime antigo do Despia, ou fora do
// app), a margem do Despia fica onde está. É o que impede esta função de tirar
// a única proteção existente e não pôr nada no lugar.

function comprimentoEmPx(valor) {
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
}

// Guarda de reentrância: escrever no style do body dispara o MutationObserver
// lá embaixo, que chamaria esta função de novo. O `if` de "já está zerado"
// sozinho já interromperia a cadeia, mas o custo de um recálculo de layout por
// mutação não vale a economia de uma linha.
let aplicando = false;

function aplicar() {
  if (aplicando) return;
  aplicando = true;

  try {
    const estiloDoBody = getComputedStyle(document.body);

    // Lê a variável JÁ RESOLVIDA pela cadeia do index.css. Serve para os dois
    // ambientes: no Despia vem de --safe-area-top, no navegador vem do env().
    const topo = comprimentoEmPx(estiloDoBody.getPropertyValue("--app-safe-top"));

    if (topo <= 0) return;

    // Só escreve o que está fora do lugar. É isto que impede o observer de
    // virar um laço, e o que deixa o no-op ser de fato um no-op no navegador,
    // onde a margem do body já é zero pelo preflight do Tailwind.
    //
    // A margem do Despia é injetada em linha no body; `!important` no
    // setProperty é o que garante a precedência sobre ela.
    if (comprimentoEmPx(estiloDoBody.marginTop) !== 0) {
      document.body.style.setProperty("margin-top", "0px", "important");
    }
  } finally {
    aplicando = false;
  }
}

export function assumirSafeArea() {
  if (typeof document === "undefined" || !document.body) return;

  // O runtime do Despia injeta a margem quando quer, não necessariamente antes
  // do primeiro paint, e reinjeta quando a tela gira. O observer cobre os dois
  // casos e qualquer terceiro que a gente não conheça — é a diferença entre
  // "funciona no boot" e "continua funcionando".
  aplicar();

  new MutationObserver(aplicar).observe(document.body, {
    attributes: true,
    attributeFilter: ["style"]
  });

  window.addEventListener("load", aplicar);
  window.addEventListener("orientationchange", aplicar);
  window.addEventListener("resize", aplicar);
}
