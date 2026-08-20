// Carregamento de tela — timeout e descrição de erro
// -----------------------------------------------------------------------------
// Existe por causa de um caso de suporte real: uma assinante vitalícia no
// Android abria uma fase e ficava em "Carregando módulo..." para sempre. A
// trilha (Modules) e o Perfil carregavam normalmente na mesma sessão, então a
// conta e o plano estavam certos — o que faltava era a tela do módulo saber o
// que fazer quando uma das requisições NÃO volta.
//
// São dois modos de falha diferentes e os dois terminam no mesmo spinner eterno:
//
//   1. a requisição REJEITA e ninguém captura. Um `await` que estoura dentro de
//      um `loadData` sem try/catch nunca chega no `setLoading(false)`.
//   2. a requisição NUNCA resolve. Try/catch não ajuda aqui: não há exceção,
//      há uma promessa pendurada. Acontece em rede móvel que cai no meio do
//      handshake — a WebView do Android mantém o fetch aberto indefinidamente.
//
// O `comTimeout` resolve o segundo caso, transformando "pendurado" em rejeição,
// para que o try/catch da tela consiga tratar os dois do mesmo jeito.
// -----------------------------------------------------------------------------

// Teto padrão. Generoso de propósito: numa rede 3G ruim uma resposta legítima
// pode levar mais de 10s, e cortar cedo trocaria um bug por outro (tela de erro
// em quem ia carregar). O que ele impede é o spinner de minutos.
export const TIMEOUT_PADRAO_MS = 20000;

export function comTimeout(promise, ms = TIMEOUT_PADRAO_MS, rotulo = 'requisição') {
  let timer;
  const estouro = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const erro = new Error(`Tempo esgotado em ${rotulo} (${ms}ms)`);
      erro.code = 'timeout';
      erro.rotulo = rotulo;
      reject(erro);
    }, ms);
  });

  // finally e não then: o timer precisa morrer mesmo quando a promessa rejeita,
  // senão um erro rápido deixa um setTimeout vivo segurando o callback.
  return Promise.race([promise, estouro]).finally(() => clearTimeout(timer));
}

// Texto curto que o usuário vê e que o suporte consegue usar. A distinção que
// importa é entre "sua conexão" e "nosso servidor": ela muda o que a pessoa
// deve fazer, e é a primeira pergunta que o suporte faz de qualquer forma.
export function descreverErro(error) {
  if (!error) return 'Erro desconhecido.';

  if (error.code === 'timeout') {
    return 'A conexão demorou demais para responder. Verifique sua internet e tente de novo.';
  }

  const status = error?.status ?? error?.response?.status;

  if (status === 401 || status === 403) {
    return 'Sua sessão expirou. Saia da conta e entre novamente.';
  }
  if (status === 404) {
    return 'Este conteúdo não foi encontrado.';
  }
  if (typeof status === 'number' && status >= 500) {
    return 'O servidor não respondeu corretamente. Tente novamente em instantes.';
  }

  // Sem status = a requisição não chegou a ter resposta (DNS, offline, CORS).
  if (status === undefined) {
    return 'Não foi possível falar com o servidor. Verifique sua internet e tente de novo.';
  }

  return error.message || 'Erro inesperado.';
}

// Linha técnica para a tela de erro. Some no uso normal e é o que o usuário
// consegue printar e mandar para o suporte quando o texto acima não basta.
export function detalheTecnico(error) {
  if (!error) return '';
  const status = error?.status ?? error?.response?.status;
  const partes = [];
  if (error.rotulo) partes.push(error.rotulo);
  if (status !== undefined) partes.push(`HTTP ${status}`);
  if (error.message) partes.push(error.message);
  return partes.join(' · ');
}
