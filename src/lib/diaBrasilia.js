// O instante em que o dia de Brasília começou.
//
// O dia do app é o de Brasília, não o local do aparelho: é nele que o
// recordQuizAttempt conta o limite diário do plano gratuito e que a sequência
// de dias é calculada (README §5). Quem contar "casos de hoje" com a meia-noite
// local diverge do servidor para quem estuda fora do Brasil.
//
// Mesma conta do `inicioDoDiaBrasilia` que vive dentro do Quiz.jsx — lá ela
// ficou local; aqui é para as telas novas (meta do dia no Dashboard).
export function inicioDoDiaBrasilia(agora = new Date()) {
  const [h, m, s] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(agora)
    .split(":")
    .map(Number);
  const decorridoMs = (((h % 24) * 60 + m) * 60 + s) * 1000 + agora.getMilliseconds();
  return new Date(agora.getTime() - decorridoMs);
}
