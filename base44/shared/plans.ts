// FONTE ÚNICA DE PLANOS
// -----------------------------------------------------------------------------
// Este arquivo é a fonte da verdade sobre preço, price ID do Stripe e modo de
// cobrança de cada plano. Antes disso, os price IDs viviam hardcoded dentro do
// createStripeCheckout e os valores em reais viviam hardcoded, separadamente,
// dentro do validateCoupon — duas listas que precisavam concordar e que nada
// obrigava a concordar.
//
// POR QUE ELE NÃO É IMPORTADO POR NINGUÉM
//
// O Base44 não tem código compartilhado entre functions: cada function é um
// único `entry.ts` isolado, sem resolução de import relativo. É a mesma razão
// pela qual o `resolveIdentity` aparece copiado inline em uma dúzia de
// arquivos (ver ARQUITETURA_AUTH.md, seção 2) — a duplicação é imposta pela
// plataforma, não é preferência.
//
// Então o contrato aqui é o mesmo do resolveIdentity: **este arquivo é o
// original; as cópias inline nas functions são cópias.** Ao mudar um preço ou
// um price ID, mude aqui primeiro e propague para os arquivos listados abaixo.
// Um grep por `PLANOS` encontra todas as cópias de uma vez.
//
// Cópias inline hoje:
//   - base44/functions/createStripeCheckout/entry.ts   (price ID + mode)
//   - base44/functions/getLifetimeSeats/entry.ts       (só LIFETIME_VAGAS)
//
// O validateCoupon NÃO recebeu cópia, de propósito: ver a nota no fim do
// arquivo.
// -----------------------------------------------------------------------------

export const PLANOS = {
  monthly: {
    id: 'monthly',
    priceId: 'price_1TkQEzLZdvjM2hGBtJTOirwu',
    valor: 59,
    mode: 'subscription'
  },
  annual: {
    id: 'annual',
    priceId: 'price_1Tpp38LZdvjM2hGBeSCKbKWh',
    valor: 499,
    mode: 'subscription'
  },
  lifetime: {
    id: 'lifetime',
    priceId: 'price_1U1jqCLZdvjM2hGBNWpDkSn9',
    valor: 400,
    mode: 'payment'
  }
};

// Plano usado quando o cliente manda um `plan` desconhecido. Mensal por ser o
// mais barato: errar para baixo cobra menos do que o usuário esperava, errar
// para cima cobra mais.
export const PLANO_PADRAO = 'monthly';

// Limite de vagas do vitalício. Configurável por variável de ambiente para
// mudar o número sem republicar function; 100 é o valor de lançamento.
export const LIFETIME_VAGAS_PADRAO = 100;

// payment_method gravado no Payment de uma compra vitalícia. É o discriminador
// que o charge.refunded usa para saber se aquele estorno é de um vitalício —
// nunca o valor da cobrança, que colidiria com o plano anual.
export const LIFETIME_PAYMENT_METHOD = 'STRIPE_LIFETIME';

// -----------------------------------------------------------------------------
// NOTA SOBRE O validateCoupon
//
// O escopo previa que o validateCoupon também lesse daqui, desde que isso não
// mudasse nenhum comportamento atual de cupom. Ele muda, então ele não lê.
//
// A linha lá é `plan === 'annual' ? 499.00 : 59.00`: qualquer plano que não
// seja 'annual' — inclusive um `plan` ausente, vazio ou desconhecido — cai em
// 59. Trocar isso por uma consulta à tabela acima obrigaria a escolher entre
// dois comportamentos, e os dois seriam mudanças:
//
//   - `PLANOS[plan].valor` estoura em plano desconhecido, onde hoje devolve 59;
//   - `(PLANOS[plan] ?? PLANOS.monthly).valor` preserva o 59, mas passa a
//     aceitar 'lifetime' e devolver preço 400 com desconto aplicado — um cupom
//     válido para o vitalício, que é exatamente o que a regra proíbe.
//
// Como o cupom fica para depois, o validateCoupon fica intocado.
// -----------------------------------------------------------------------------
