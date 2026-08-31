// A reserva do entalhe deixa de ser suposta e passa a ser MEDIDA.
// -----------------------------------------------------------------------------
// Duas versões anteriores erraram pelo mesmo motivo: as duas apostaram no que o
// wrapper do Despia faz, em vez de olhar.
//
//   1ª: o app tomava a reserva para si e zerava a margem que o "Auto Inject
//       Safe Area" injeta no body. Perdeu a corrida -- a margem chega quando o
//       runtime quer, e o observador nunca via a injeção. Resultado no
//       aparelho: dois entalhes de espaço no topo.
//   2ª: o app parou de reservar dentro do Despia, confiando que a margem do
//       wrapper faria o trabalho. Resultado no aparelho: conteúdo cortado no
//       topo em Módulos, Troféus, Aprenda ECG e Perfil -- ou seja, a margem
//       NÃO estava fazendo o trabalho, ou não inteiro.
//
// As duas apostas eram sobre o mesmo número, e esse número dá para ler. É o que
// esta versão faz: mede quanto o wrapper já empurrou o body e reserva só o que
// falta para completar um entalhe. Não importa se o wrapper empurra tudo, um
// pedaço ou nada -- a soma dá sempre exatamente um entalhe.
//
//     falta = max(0, entalhe - margem que o wrapper já pôs)
//
// O padrão do CSS é reservar o entalhe INTEIRO, e a medição só tira o excesso.
// A direção da falha importa: se a medição atrasar ou falhar, sobra espaço --
// nunca falta. Espaço a mais é feio; espaço a menos corta conteúdo.
//
// Sem checagem de plataforma de propósito. Fora do app nativo a margem do body é
// zero (preflight do Tailwind) e o entalhe vem do env(), então a mesma conta
// devolve o mesmo resultado de sempre. Um caminho só, exercitado em todo lugar.
//
// As duas variáveis que isto escreve (ver index.css):
//   --app-safe-top-fluxo  o que o conteúdo em fluxo ainda precisa reservar
//   --app-margem-wrapper  o que o wrapper tomou -- descontado das alturas de
//                         tela cheia, senão `100vh` pede mais do que existe e
//                         sobra uma rolagem fantasma do tamanho do entalhe

function px(valor) {
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
}

function medir() {
  const estilo = getComputedStyle(document.body);

  // O entalhe real. Dentro do Despia vem da custom property deles; fora, do
  // env() padrão. A cadeia está no index.css.
  const entalhe = px(estilo.getPropertyValue("--app-safe-top"));

  // Quanto o wrapper já empurrou. O app nunca escreve `margin` no body, então o
  // valor computado aqui é só o que veio de fora.
  const margem = px(estilo.marginTop);

  document.body.style.setProperty("--app-margem-wrapper", `${margem}px`);
  document.body.style.setProperty("--app-safe-top-fluxo", `${Math.max(0, entalhe - margem)}px`);
}

export function sincronizarSafeArea() {
  if (typeof document === "undefined" || !document.body) return;

  medir();

  // A injeção do wrapper não tem hora marcada. Medir de novo é barato e
  // idempotente -- ao contrário de brigar com a margem, remedir sempre converge
  // para o mesmo número.
  window.addEventListener("load", medir);
  window.addEventListener("resize", medir);
  window.addEventListener("orientationchange", medir);

  // Cobre a injeção que chega depois do boot e antes de qualquer evento.
  [0, 100, 300, 800, 1500].forEach((ms) => setTimeout(medir, ms));
}
