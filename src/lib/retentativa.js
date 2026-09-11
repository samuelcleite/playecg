// Retentativa com espera exponencial — para o 429 do Base44
// -----------------------------------------------------------------------------
// O Base44 limita o volume de leituras de entidades por janela curta e responde
// HTTP 429 ("App entity read traffic volume limit exceeded") quando estoura. A
// janela é curta: a mesma leitura, repetida um ou dois segundos depois, costuma
// passar. Sem isto, UMA leitura recusada dentro de um Promise.all derrubava a
// tela inteira ("Não foi possível abrir este conteúdo") — e a pessoa apertava
// "Tentar novamente" à mão, fazendo exatamente o que este helper faz sozinho.
//
// Só 429 e 503 são retentados. 4xx de verdade (401, 404) e 5xx da própria
// function não são transitórios e repetir só gastaria cota. Quem chama decide
// o que é seguro repetir: leituras sempre são; escritas, nunca por aqui (ver
// comRetentativaNasLeituras, que só embrulha leituras e functions de leitura).
//
// Sem import de '@/...' de propósito: este arquivo roda em Node puro, para o
// teste de fumaça do embrulho do cliente.
// -----------------------------------------------------------------------------

const STATUS_RETENTAVEIS = new Set([429, 503]);

function statusDe(erro) {
  return erro?.status ?? erro?.response?.status;
}

// Espera antes da repetição `i` (0-based). Respeita Retry-After quando o
// servidor manda; senão, exponencial com jitter para não sincronizar as
// retentativas de leituras paralelas (um Promise.all de cinco leituras que
// tomam 429 juntas voltaria a bater junto sem o jitter).
function esperaPara(erro, i, baseMs, tetoMs) {
  const cabecalho = erro?.originalError?.response?.headers?.['retry-after'];
  const segundos = Number(cabecalho);
  if (Number.isFinite(segundos) && segundos > 0) {
    return Math.min(segundos * 1000, tetoMs);
  }
  const exponencial = baseMs * 2 ** i;
  return Math.min(exponencial + Math.random() * exponencial * 0.5, tetoMs);
}

export function ehRetentavel(erro) {
  return STATUS_RETENTAVEIS.has(statusDe(erro));
}

// `tentativas` é o número de REPETIÇÕES além da primeira chamada. Com 3, o pior
// caso espera ~0,7 + 1,4 + 2,8s (mais jitter) — abaixo dos 20s do comTimeout
// de carregamento.js, então a tela ainda cai no tratamento de erro normal se
// nada disso resolver.
export async function comRetentativa(fn, { tentativas = 3, baseMs = 700, tetoMs = 6000, rotulo = 'leitura' } = {}) {
  let ultimoErro;
  for (let i = 0; i <= tentativas; i++) {
    try {
      return await fn();
    } catch (erro) {
      ultimoErro = erro;
      if (!ehRetentavel(erro) || i === tentativas) throw erro;
      const espera = esperaPara(erro, i, baseMs, tetoMs);
      console.warn(`[retentativa] ${rotulo}: HTTP ${statusDe(erro)}; repetindo (${i + 1}/${tentativas}) em ${Math.round(espera)}ms`);
      await new Promise((resolve) => setTimeout(resolve, espera));
    }
  }
  throw ultimoErro;
}

// -----------------------------------------------------------------------------
// Embrulha um cliente do SDK do Base44 para que as LEITURAS repitam em 429:
//   - cliente.entities.X.list/filter/get;
//   - cliente.functions.invoke, só para functions de leitura (prefixo
//     `get`/`adminList` e o ensureMyAccount, que é idempotente).
//
// Escritas (create/update/delete, recordQuizAttempt, updateUserProgress...)
// passam direto. Um 429 do gateway antes de a function rodar até seria seguro
// repetir, mas nenhuma function deste app devolve 429 por conta própria hoje e
// isso pode mudar — e repetir uma escrita por engano (tentativa gravada duas
// vezes, pontos em dobro) custa mais do que a tela mostrar o erro.
//
// Feito no cliente, e não em cada chamada, de propósito: são ~160 pontos de
// leitura no app, e a proteção tem que valer para o próximo que alguém escrever.
// -----------------------------------------------------------------------------

const METODOS_DE_LEITURA = new Set(['list', 'filter', 'get']);

export function ehFunctionDeLeitura(nome) {
  return /^(get|adminList)/.test(nome) || nome === 'ensureMyAccount';
}

export function comRetentativaNasLeituras(cliente, opcoes = {}) {
  const entidades = new Proxy({}, {
    get(_alvo, nome) {
      if (typeof nome !== 'string' || nome === 'then' || nome.startsWith('_')) return undefined;
      const entidade = cliente.entities[nome];
      return new Proxy(entidade, {
        get(alvo, metodo) {
          const original = Reflect.get(alvo, metodo);
          if (typeof original !== 'function' || !METODOS_DE_LEITURA.has(metodo)) return original;
          return (...args) =>
            comRetentativa(() => original.apply(alvo, args), { ...opcoes, rotulo: `${nome}.${String(metodo)}` });
        }
      });
    }
  });

  const funcoes = {
    ...cliente.functions,
    invoke(nome, dados) {
      const chamar = () => cliente.functions.invoke(nome, dados);
      if (!ehFunctionDeLeitura(nome)) return chamar();
      return comRetentativa(chamar, { ...opcoes, rotulo: `functions.${nome}` });
    }
  };

  return new Proxy(cliente, {
    get(alvo, prop) {
      if (prop === 'entities') return entidades;
      if (prop === 'functions') return funcoes;
      const valor = Reflect.get(alvo, prop, alvo);
      return typeof valor === 'function' ? valor.bind(alvo) : valor;
    }
  });
}
