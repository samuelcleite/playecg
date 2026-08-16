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
// A prevenção que a plataforma NÃO permite é a óbvia: um único módulo com a
// regra dentro, importado por todos. O Base44 não resolve import entre
// functions — é a mesma restrição que obriga o `resolveIdentity` a viver copiado
// em uma dúzia de arquivos. Então a regra fica duplicada, e o papel deste script
// é fazer com que a duplicação não possa derivar em silêncio.
//
// AS TRÊS CHECAGENS
//
// 1. PROXIMIDADE (a que importa). Toda escrita literal de `subscription_type`
//    precisa tratar `trial_ends_at` por perto — e tratar em CÓDIGO, não em
//    comentário. É a diferença entre "a linha que promove alguém a premium tem,
//    ao lado, a linha que tira a marca de cortesia" e "o arquivo menciona o
//    assunto". Colar o comentário e esquecer o código não passa.
//
//    Isso não é hipótese: a primeira versão desta checagem aceitava comentário,
//    e um arquivo de teste que promovia a premium com nada além do comentário
//    `// INVARIANTE trial_ends_at` passou limpo. O bug estava no verificador.
//
// 2. CÓPIAS IDÊNTICAS. `avaliarCortesia` decide quem é rebaixado e vive
//    duplicada por imposição da plataforma. As cópias são comparadas por hash do
//    código normalizado: se uma mudar sem a outra, o check quebra. A duplicação
//    continua, mas deixa de ser livre para divergir.
//
// 3. MARCADOR. O comentário `INVARIANTE ...` continua sendo exigido — agora como
//    documentação para quem lê depois, não como prova de nada.
//
// O QUE ELE **NÃO** RESOLVE
//
// Ele lê texto, não executa nada. Um arquivo pode ter as duas linhas na ordem
// errada, ou dentro de um `if` que nunca roda, e passar. Também só enxerga
// escrita LITERAL: quem monta o valor em variável (o `adminSetSubscription` faz
// isso, a partir do corpo da requisição) passa por fora. Quem cobre esses casos
// é a `auditTrialInvariants`, que olha os dados reais em vez do código.
//
// Não há CI neste projeto (verificado em 16/08/2026: não existe .github/), então
// isto roda na mão ou junto do lint. Se um dia houver CI, é aqui que ele pluga.
// -----------------------------------------------------------------------------

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIR_FUNCTIONS = join(RAIZ, 'base44', 'functions');

// Janela de proximidade, em linhas. Generosa de propósito: entre a linha que
// escreve `subscription_type` e a que trata `trial_ends_at` costuma haver um
// bloco de comentário explicando o invariante — no stripeWebhook são seis
// linhas. Apertar isso transformaria comentário bem escrito em erro.
const JANELA = 22;

// Arquivos que escrevem subscription_type e legitimamente NÃO precisam de um dos
// tratamentos. Cada dispensa carrega o motivo: sem ele, a lista vira um lugar
// para calar o check em vez de corrigir o código.
//
// Dispensa por arquivo é grosseira — desliga a checagem no arquivo inteiro. Para
// um caminho específico dentro de um arquivo grande, use a anotação inline (ver
// RE_DISPENSA_INLINE abaixo), que fica ao lado do código que a justifica.
const DISPENSAS = {
  'cancelStripeSubscription': {
    lifetime: 'Exige Payment com stripe_subscription_id, que a compra vitalícia não tem: recusa com 404 antes de chegar à escrita. Ver ARQUITETURA_AUTH.md §5.8.',
    trial: 'Mesma razão: cortesia não tem Payment com stripe_subscription_id, então nunca chega à escrita.'
  },
  'appleSignIn': {
    lifetime: "Escreve 'free' só na CRIAÇÃO de uma Account nova, que por definição não é vitalícia.",
    trial: 'Mesma razão: Account nova não tem cortesia.'
  },
  'googleSignIn': {
    lifetime: "Escreve 'free' só na CRIAÇÃO de uma Account nova, que por definição não é vitalícia.",
    trial: 'Mesma razão: Account nova não tem cortesia.'
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
    lifetime: 'O guard existe dentro de avaliarCortesia, verificada por hash na checagem 2.'
  },
  'getMyAccount': {
    lifetime: 'O guard existe dentro de avaliarCortesia, verificada por hash na checagem 2.'
  },
  'adminGrantTrial': {
    lifetime: 'Não rebaixa ninguém: só promove. A recusa de conta vitalícia está em avaliarElegibilidade.'
  }
};

// Funções cujas cópias precisam ser idênticas entre si (depois de normalizadas).
// São as que DECIDEM acesso, não as utilitárias: uma divergência aqui significa
// dois lugares do sistema discordando sobre quem perde o premium.
const COPIAS_IDENTICAS = ['avaliarCortesia'];

const ESCREVE_FREE = /subscription_type:\s*['"]free['"]/;
const ESCREVE_PREMIUM = /subscription_type:\s*['"]premium['"]/;
const MARCA_LIFETIME = /INVARIANTE lifetime_access/;
const MARCA_TRIAL = /INVARIANTE trial_ends_at/;

// Dispensa pontual, escrita ao lado do código que a justifica:
//   // check-invariantes: dispensa trial_ends_at — <motivo>
//
// O motivo depois do nome do campo não é decorativo: é o que distingue "analisei
// e não se aplica" de "queria que o check calasse". O separador pode ser
// travessão, hífen ou dois-pontos — depender de um caractere específico já
// quebrou uma vez, quando uma edição reescreveu o arquivo em outra codificação.
const RE_DISPENSA_INLINE = /check-invariantes:\s*dispensa\s+(trial_ends_at|lifetime_access)\b\s*\S+/;

function semComentarios(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(linha => !linha.trim().startsWith('//'))
    .join('\n');
}

// Extrai o corpo de `function <nome>(...) { ... }` contando chaves. Sem AST de
// propósito: uma dependência a mais para um script que precisa rodar em máquina
// limpa não se paga.
function extrairFuncao(src, nome) {
  const inicio = src.indexOf(`function ${nome}(`);
  if (inicio === -1) return null;

  const abre = src.indexOf('{', inicio);
  if (abre === -1) return null;

  let nivel = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}') {
      nivel--;
      if (nivel === 0) return src.slice(inicio, i + 1);
    }
  }
  return null;
}

// Hash do código sem comentários e sem espaçamento: reformatar ou reescrever um
// comentário não deve quebrar o check; mudar uma condição deve.
function assinatura(codigo) {
  const normalizado = semComentarios(codigo).replace(/\s+/g, ' ').trim();
  return createHash('sha1').update(normalizado).digest('hex').slice(0, 8);
}

// Quais linhas são comentário. Precisa ser exato: sem isto, a própria linha
// `// INVARIANTE trial_ends_at` contaria como tratamento do campo — e o check
// voltaria a ser "tem o comentário?", que é justamente o que ele existe para
// deixar de ser.
function mapaDeComentarios(linhas) {
  const ehComentario = new Array(linhas.length).fill(false);
  let dentroDeBloco = false;
  for (let i = 0; i < linhas.length; i++) {
    const t = linhas[i].trim();
    if (dentroDeBloco) {
      ehComentario[i] = true;
      if (t.includes('*/')) dentroDeBloco = false;
      continue;
    }
    if (t.startsWith('//') || t.startsWith('*')) {
      ehComentario[i] = true;
      continue;
    }
    if (t.startsWith('/*')) {
      ehComentario[i] = true;
      if (!t.includes('*/')) dentroDeBloco = true;
    }
  }
  return ehComentario;
}

// Faixas de linha ocupadas por `Response.json(...)`. O que está lá dentro é
// resposta HTTP, não escrita no banco: o manuallyUpgradeToPremium devolve
// `subscription_type: 'premium'` no corpo para a tela mostrar, e cobrar um
// tratamento de invariante ali seria acusar quem não escreveu nada.
function faixasDeResposta(src) {
  const faixas = [];
  const alvo = 'Response.json(';
  let de = src.indexOf(alvo);
  while (de !== -1) {
    let nivel = 0;
    let ate = de;
    for (let i = de + alvo.length - 1; i < src.length; i++) {
      if (src[i] === '(') nivel++;
      else if (src[i] === ')') {
        nivel--;
        if (nivel === 0) { ate = i; break; }
      }
    }
    faixas.push([
      src.slice(0, de).split('\n').length,
      src.slice(0, ate).split('\n').length
    ]);
    de = src.indexOf(alvo, ate);
  }
  return faixas;
}

function dispensadoNaLinha(linhas, alvo, campo) {
  const ini = Math.max(0, alvo - 1 - 14);
  for (let i = ini; i < alvo; i++) {
    const m = linhas[i].match(RE_DISPENSA_INLINE);
    if (m && m[1] === campo) return true;
  }
  return false;
}

// Linhas (1-based) em que o padrão aparece, ignorando comentários e respostas
// HTTP.
function linhasCom(src, padrao) {
  const linhas = src.split('\n');
  const ehComentario = mapaDeComentarios(linhas);
  const respostas = faixasDeResposta(src);
  const out = [];
  for (let i = 0; i < linhas.length; i++) {
    if (ehComentario[i]) continue;
    if (!padrao.test(linhas[i])) continue;
    const n = i + 1;
    if (respostas.some(([de, ate]) => n >= de && n <= ate)) continue;
    out.push(n);
  }
  return out;
}

// Procura o tratamento de um campo numa janela em volta da linha — SÓ EM CÓDIGO.
// Não basta o nome do campo aparecer: ele precisa estar sendo escrito
// (`campo:`) ou lido (`.campo`, `campo ===`), que é o que distingue tratar de
// mencionar.
function temPerto(linhas, ehComentario, alvo, campo, antes = 8, depois = JANELA) {
  const usos = [
    new RegExp(`${campo}\\s*:`),
    new RegExp(`\\.${campo}\\b`),
    new RegExp(`\\b${campo}\\s*[=!<>]`)
  ];
  const ini = Math.max(0, alvo - 1 - antes);
  const fim = Math.min(linhas.length, alvo - 1 + depois);
  for (let i = ini; i < fim; i++) {
    if (i === alvo - 1) continue;
    if (ehComentario[i]) continue;
    if (usos.some(re => re.test(linhas[i]))) return true;
  }
  return false;
}

if (!existsSync(DIR_FUNCTIONS)) {
  console.error(`✗ Não achei ${DIR_FUNCTIONS}`);
  process.exit(1);
}

const falhas = [];
const copias = new Map(COPIAS_IDENTICAS.map(nome => [nome, []]));
let analisados = 0;

for (const nome of readdirSync(DIR_FUNCTIONS)) {
  const arquivo = join(DIR_FUNCTIONS, nome, 'entry.ts');
  if (!existsSync(arquivo)) continue;

  const src = readFileSync(arquivo, 'utf8');
  const linhas = src.split('\n');
  const ehComentario = mapaDeComentarios(linhas);
  const codigo = semComentarios(src);
  const dispensa = DISPENSAS[nome] || {};

  // ── Checagem 2: cópias que precisam concordar ─────────────────────────────
  for (const alvo of COPIAS_IDENTICAS) {
    const corpo = extrairFuncao(src, alvo);
    if (corpo) copias.get(alvo).push({ nome, hash: assinatura(corpo) });
  }

  const escreveFree = ESCREVE_FREE.test(codigo);
  const escrevePremium = ESCREVE_PREMIUM.test(codigo);
  if (!escreveFree && !escrevePremium) continue;

  analisados++;

  // ── Checagem 1: proximidade (a que pega o esquecimento de verdade) ────────
  if (!dispensa.trial) {
    for (const linha of linhasCom(src, ESCREVE_PREMIUM)) {
      if (dispensadoNaLinha(linhas, linha, 'trial_ends_at')) continue;
      if (!temPerto(linhas, ehComentario, linha, 'trial_ends_at')) {
        falhas.push({
          nome,
          linha,
          regra: 'INVARIANTE trial_ends_at',
          motivo: "promove a 'premium' sem tratar trial_ends_at por perto",
          consequencia: 'um assinante pagante ficaria com data de validade e seria rebaixado no vencimento'
        });
      }
    }

    for (const linha of linhasCom(src, ESCREVE_FREE)) {
      if (dispensadoNaLinha(linhas, linha, 'trial_ends_at')) continue;
      if (!temPerto(linhas, ehComentario, linha, 'trial_ends_at')) {
        falhas.push({
          nome,
          linha,
          regra: 'INVARIANTE trial_ends_at',
          motivo: "escreve 'free' sem tratar trial_ends_at por perto",
          consequencia: 'uma cortesia recém-concedida seria apagada, ou a marca ficaria armada numa conta free'
        });
      }
    }
  }

  if (!dispensa.lifetime) {
    for (const linha of linhasCom(src, ESCREVE_FREE)) {
      if (dispensadoNaLinha(linhas, linha, 'lifetime_access')) continue;
      if (!temPerto(linhas, ehComentario, linha, 'lifetime_access')) {
        falhas.push({
          nome,
          linha,
          regra: 'INVARIANTE lifetime_access',
          motivo: "escreve 'free' sem checar lifetime_access por perto",
          consequencia: 'quem comprou acesso permanente perderia o acesso'
        });
      }
    }
  }

  // ── Checagem 3: o marcador, como documentação ─────────────────────────────
  if (escreveFree && !MARCA_LIFETIME.test(src) && !dispensa.lifetime) {
    falhas.push({
      nome,
      regra: 'INVARIANTE lifetime_access',
      motivo: 'falta o comentário do invariante explicando o tratamento',
      consequencia: 'quem ler depois não sabe que a regra existe'
    });
  }
  if ((escreveFree || escrevePremium) && !MARCA_TRIAL.test(src) && !dispensa.trial) {
    falhas.push({
      nome,
      regra: 'INVARIANTE trial_ends_at',
      motivo: 'falta o comentário do invariante explicando o tratamento',
      consequencia: 'quem ler depois não sabe que a regra existe'
    });
  }
}

// ── Resultado da checagem 2 ──────────────────────────────────────────────────
const divergencias = [];
for (const [alvo, achadas] of copias) {
  if (achadas.length < 2) continue;
  const hashes = new Set(achadas.map(c => c.hash));
  if (hashes.size > 1) divergencias.push({ alvo, achadas });
}

console.log(`check-invariantes: ${analisados} function(s) escrevem subscription_type.`);
for (const [alvo, achadas] of copias) {
  if (achadas.length > 0) {
    const hashes = [...new Set(achadas.map(c => c.hash))].join(', ');
    console.log(`  ${alvo}: ${achadas.length} cópia(s) — ${hashes}`);
  }
}

if (falhas.length === 0 && divergencias.length === 0) {
  console.log('✓ Escritas de acesso tratam os invariantes, e as cópias concordam.');
  process.exit(0);
}

console.error('');

for (const d of divergencias) {
  console.error(`✗ ${d.alvo} divergiu entre as cópias:\n`);
  for (const c of d.achadas) {
    console.error(`    base44/functions/${c.nome}/entry.ts   sha ${c.hash}`);
  }
  console.error('\n  As duas decidem quem perde o acesso premium e precisam ser idênticas.');
  console.error('  A duplicação é imposta pela plataforma (sem import entre functions);');
  console.error('  a divergência, não.\n');
}

for (const f of falhas) {
  console.error(`✗ base44/functions/${f.nome}/entry.ts${f.linha ? `:${f.linha}` : ''}`);
  console.error(`    ${f.motivo}`);
  console.error(`    → ${f.consequencia}`);
  console.error(`    Regra: ${f.regra}\n`);
}

console.error('Leia ARQUITETURA_AUTH.md §5.8 e §5.9 antes de mexer.');
console.error('Se o caminho realmente não precisa do tratamento, registre a dispensa');
console.error('COM MOTIVO — inline, ao lado do código, ou em scripts/check-invariantes.mjs.\n');
process.exit(1);
