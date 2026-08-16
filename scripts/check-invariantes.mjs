#!/usr/bin/env node
// check-invariantes — guarda de código para as regras que protegem o acesso pago.
// -----------------------------------------------------------------------------
// npm run check:invariantes
//
// O QUE ELE RESOLVE
//
// Duas regras deste projeto vivem espalhadas por vários arquivos e dependem de
// alguém lembrar delas (ARQUITETURA_AUTH.md §5.8 e §5.9):
//
//   - quem escreve `subscription_type: 'free'` precisa poupar o vitalício e a
//     cortesia em curso;
//   - quem escreve `subscription_type: 'premium'` precisa limpar a marca de
//     cortesia, senão o acesso de um pagante ganha data de validade.
//
// A documentação manda rodar `grep -rn "INVARIANTE ..."` e conferir se o número
// de arquivos bate. Isso funciona enquanto alguém lembra de rodar o grep e sabe
// qual número esperar. Este script transforma essa conferência num comando que
// falha sozinho: caminho novo que escreve subscription_type sem declarar o
// invariante quebra o check.
//
// O QUE ELE **NÃO** RESOLVE
//
// Ele confere a presença do comentário, não a corretude do código. Um arquivo
// que escreva o marcador e faça a coisa errada passa. É um lembrete automático,
// não uma prova — a prova é a auditTrialInvariants, que olha os dados reais.
//
// E ele só enxerga escrita LITERAL (`subscription_type: 'free'`). Quem escreve
// por variável passa despercebido — é o caso do adminSetSubscription, que monta
// `{ subscription_type }` a partir do corpo da requisição. Ampliar a regex para
// pegar isso traria mais ruído do que sinal; o que cobre esse caminho é a
// auditoria de dados.
//
// Não há CI neste projeto (verificado em 16/08/2026: não existe .github/), então
// isto roda na mão ou junto do lint. Se um dia houver CI, é aqui que ele pluga.
// -----------------------------------------------------------------------------

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIR_FUNCTIONS = join(RAIZ, 'base44', 'functions');

// Arquivos que escrevem subscription_type e legitimamente NÃO precisam de um
// dos marcadores. Cada dispensa carrega o motivo: sem ele, a lista vira um lugar
// para calar o check em vez de corrigir o código.
const DISPENSAS = {
  'cancelStripeSubscription': {
    lifetime: 'Exige Payment com stripe_subscription_id, que a compra vitalícia não tem: recusa com 404 antes de chegar à escrita. Ver ARQUITETURA_AUTH.md §5.8.',
    trial: 'Mesma razão: cortesia não tem Payment com stripe_subscription_id, então nunca chega à escrita.'
  },
  'appleSignIn': {
    lifetime: "Grava subscription_type: 'free' apenas na CRIAÇÃO de uma Account nova, que por definição não é vitalícia.",
    trial: "Mesma razão: Account nova não tem cortesia."
  },
  'googleSignIn': {
    lifetime: "Grava subscription_type: 'free' apenas na CRIAÇÃO de uma Account nova, que por definição não é vitalícia.",
    trial: "Mesma razão: Account nova não tem cortesia."
  },
  'onUserCreated': {
    lifetime: 'Trigger de criação do User, hoje inerte. Escreve só no registro recém-criado.',
    trial: 'Mesma razão.'
  },
  'ensureMyAccount': {
    lifetime: 'Cria a Account que falta a partir do User; não altera assinatura de conta existente.',
    trial: 'Cria a Account que falta a partir do User; não altera assinatura de conta existente.'
  },
  'backfillAccountFromUser': {
    lifetime: 'Só escreve assinatura ao CRIAR Account inexistente. Em Account existente não toca no campo — ver ARQUITETURA_AUTH.md §5.6.',
    trial: 'Só escreve assinatura ao CRIAR Account inexistente. Em Account existente não toca no campo — ver ARQUITETURA_AUTH.md §5.6.'
  },
  'adminExpireTrials': {
    lifetime: 'O guard existe, na função avaliarCortesia, sob o marcador INVARIANTE trial_ends_at (que cobre os dois casos).'
  },
  'getMyAccount': {
    lifetime: 'O guard existe, na função avaliarCortesia, sob o marcador INVARIANTE trial_ends_at (que cobre os dois casos).'
  },
  'adminRevokeTrial': {
    trial: 'É o caminho que APAGA a cortesia; o marcador que ele carrega é o de lifetime_access.'
  },
  'adminGrantTrial': {
    lifetime: 'Não rebaixa ninguém: só promove. A recusa de conta vitalícia está sob o marcador INVARIANTE trial_ends_at.'
  }
};

// Comentários fora antes de procurar escrita. Estes arquivos citam a escrita
// antiga em prosa ("antes isto era User.update({ subscription_type: 'free' })"),
// e sem esta limpeza o check acusa quem só está explicando o passado.
function semComentarios(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(linha => !linha.trim().startsWith('//'))
    .join('\n');
}

const ESCREVE_FREE = /subscription_type:\s*['"]free['"]/;
const ESCREVE_PREMIUM = /subscription_type:\s*['"]premium['"]/;
const MARCA_LIFETIME = /INVARIANTE lifetime_access/;
const MARCA_TRIAL = /INVARIANTE trial_ends_at/;

if (!existsSync(DIR_FUNCTIONS)) {
  console.error(`✗ Não achei ${DIR_FUNCTIONS}`);
  process.exit(1);
}

const falhas = [];
let analisados = 0;

for (const nome of readdirSync(DIR_FUNCTIONS)) {
  const arquivo = join(DIR_FUNCTIONS, nome, 'entry.ts');
  if (!existsSync(arquivo)) continue;

  const src = readFileSync(arquivo, 'utf8');
  const codigo = semComentarios(src);
  const dispensa = DISPENSAS[nome] || {};

  const escreveFree = ESCREVE_FREE.test(codigo);
  const escrevePremium = ESCREVE_PREMIUM.test(codigo);
  if (!escreveFree && !escrevePremium) continue;

  analisados++;

  if (escreveFree && !MARCA_LIFETIME.test(src) && !dispensa.lifetime) {
    falhas.push({
      nome,
      regra: 'INVARIANTE lifetime_access',
      motivo: "escreve subscription_type: 'free' sem poupar quem tem lifetime_access"
    });
  }

  if (escrevePremium && !MARCA_TRIAL.test(src) && !dispensa.trial) {
    falhas.push({
      nome,
      regra: 'INVARIANTE trial_ends_at',
      motivo: "escreve subscription_type: 'premium' sem limpar a marca de cortesia (trial_ends_at)"
    });
  }

  if (escreveFree && !MARCA_TRIAL.test(src) && !dispensa.trial) {
    falhas.push({
      nome,
      regra: 'INVARIANTE trial_ends_at',
      motivo: "escreve subscription_type: 'free' sem poupar a cortesia em curso nem limpar a marca"
    });
  }
}

console.log(`check-invariantes: ${analisados} function(s) escrevem subscription_type.`);

if (falhas.length === 0) {
  console.log('✓ Todas declaram os invariantes que lhes cabem.');
  process.exit(0);
}

console.error(`\n✗ ${falhas.length} problema(s):\n`);
for (const f of falhas) {
  console.error(`  base44/functions/${f.nome}/entry.ts`);
  console.error(`    ${f.motivo}`);
  console.error(`    Falta o comentário "${f.regra}" explicando o tratamento.\n`);
}
console.error('Leia ARQUITETURA_AUTH.md §5.8 e §5.9 antes de mexer.');
console.error('Se o caminho realmente não precisa do guard, registre a dispensa COM MOTIVO');
console.error('em scripts/check-invariantes.mjs.\n');
process.exit(1);
