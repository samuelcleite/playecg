// Link promocional de cupom: playecg.app/upgrade?promo=FULANA99
// -----------------------------------------------------------------------------
// O parceiro divulga UMA url. Quem clica cai na tela de Upgrade com o cupom já
// aplicado, escolhe mensal ou anual e paga. Não há tela nova nem rota nova: a
// /upgrade já é rota protegida, então o login antes da compra sai de graça —
// o ProtectedRoute guarda `pathname + search` (a query INTEIRA, com o promo
// dentro) e a Home devolve para lá depois que a sessão existe.
//
// Por que um módulo para tão pouco: o formato do link é um contrato entre o
// admin, que o gera para o parceiro colar no story, e a tela de Upgrade, que o
// lê. Os dois lados escrevendo 'promo' na mão é como um deles vira '?cupom='
// num refactor e todo link já impresso morre em silêncio.
// -----------------------------------------------------------------------------

export const PARAM_PROMO = 'promo';

// Onde os links são gerados. Constante e não window.location.origin: o admin é
// aberto do preview do Base44 e do localhost também, e um link com
// 'localhost:5173' dentro chegaria ao parceiro sem ninguém notar.
const DOMINIO_PUBLICO = 'https://playecg.app';

// Mesmo alfabeto que o campo de cupom da tela aceita (Input maxLength=20 +
// uppercase). Recusar aqui o que não pode ser um código evita mandar lixo de
// URL para o validateCoupon — e evita ecoar na tela de erro o que veio na
// query, que é texto de terceiro.
const CODIGO_VALIDO = /^[A-Z0-9_-]{1,20}$/;

// Normaliza para a MESMA forma que o backend usa (trim + uppercase), para que o
// link funcione digitado em minúsculas — que é como um link acaba sendo
// redigitado de um story.
export function normalizarCodigoPromocional(valor) {
  if (typeof valor !== 'string') return null;
  const codigo = valor.trim().toUpperCase();
  return CODIGO_VALIDO.test(codigo) ? codigo : null;
}

// Aceita o URLSearchParams do useSearchParams. Devolve null quando não há
// promo na url ou quando o valor não tem cara de código.
export function lerCodigoPromocional(searchParams) {
  if (!searchParams || typeof searchParams.get !== 'function') return null;
  return normalizarCodigoPromocional(searchParams.get(PARAM_PROMO));
}

// O link que o parceiro recebe. Devolve null para código inválido em vez de
// montar uma url quebrada: o admin usa isso para não oferecer o botão.
export function montarLinkPromocional(code) {
  const codigo = normalizarCodigoPromocional(code);
  if (!codigo) return null;
  return `${DOMINIO_PUBLICO}/upgrade?${PARAM_PROMO}=${encodeURIComponent(codigo)}`;
}
