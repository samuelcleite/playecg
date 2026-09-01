// Memória local do estado da permissão de push no app iOS.
// -----------------------------------------------------------------------------
// Existe porque o Despia devolve UM BOOLEANO só. O `estadoDaPermissaoNativa`
// não distingue "nunca perguntou" de "já recusou" — as duas viram
// "nao_concedida" —, e sem essa distinção a tela trata quem recusou como quem
// nunca foi perguntado: mostra o convite de novo, a pessoa toca, o iOS responde
// "negado" na hora (a recusa lá é permanente) e ela espera dez segundos por um
// diálogo que não vai abrir.
//
// O que guardamos aqui é o que o app OBSERVOU, e é o próprio app a única fonte
// possível: o servidor não sabe quando a permissão foi dada, e o OneSignal não
// expõe a data.
//
// DUAS MARCAS, e elas não são a mesma coisa:
//
//   visto_sem_permissao → em algum carregamento, esta pessoa NÃO tinha permissão.
//                         É a testemunha da transição: se um dia virmos
//                         "concedida" com esta marca no lugar, sabemos que a
//                         permissão foi dada ENTRE as duas observações — e é
//                         isso que autoriza o resgate da promoção sem torná-la
//                         retroativa.
//
//   pedido_recusado     → ela TOCOU no botão e não concedeu. Só isto justifica
//                         trocar o convite pela versão discreta que manda para
//                         os Ajustes. Marcar pela simples observação faria o
//                         convite nunca aparecer: na primeira visita o estado
//                         legítimo de quem nunca foi perguntado também é
//                         "nao_concedida".
//
// TUDO EM TRY/CATCH. O localStorage lança em modo privado e em WebView com
// armazenamento bloqueado, e uma exceção aqui derrubaria a tela de notificações
// inteira por causa de uma otimização de cortesia. Falhar a leitura significa,
// no pior caso, voltar ao comportamento que já existia.
// -----------------------------------------------------------------------------

const VISTO_SEM_PERMISSAO = "playecg:push_ios:visto_sem_permissao";
const PEDIDO_RECUSADO = "playecg:push_ios:pedido_recusado";
const TENTATIVAS_RESGATE = "playecg:push_ios:tentativas_resgate";

// Teto de tentativas do resgate por reconciliação.
//
// Sem ele, uma conta cuja vinculação com o OneSignal esteja quebrada tentaria
// resgatar em TODO carregamento, para sempre — uma requisição a mais por
// abertura de Dashboard, sem nunca dar certo. Cinco cobre com folga a demora de
// propagação da inscrição, que é o motivo legítimo de a primeira tentativa
// falhar.
const MAX_TENTATIVAS = 5;

function ler(chave) {
  try {
    return window.localStorage.getItem(chave);
  } catch (_e) {
    return null;
  }
}

function gravar(chave, valor) {
  try {
    window.localStorage.setItem(chave, valor);
  } catch (_e) {
    /* sem memória local: o app volta a se comportar como antes dela existir */
  }
}

function apagar(chave) {
  try {
    window.localStorage.removeItem(chave);
  } catch (_e) {
    /* idem */
  }
}

// ─── OBSERVAÇÃO ──────────────────────────────────────────────────────────────

export function marcarVistoSemPermissao() {
  gravar(VISTO_SEM_PERMISSAO, "1");
}

export function viuSemPermissao() {
  return ler(VISTO_SEM_PERMISSAO) === "1";
}

// ─── PEDIDO RECUSADO ─────────────────────────────────────────────────────────

export function marcarPedidoRecusado() {
  gravar(PEDIDO_RECUSADO, "1");
}

export function pedidoJaRecusado() {
  return ler(PEDIDO_RECUSADO) === "1";
}

// ─── TENTATIVAS DE RESGATE ───────────────────────────────────────────────────

export function tentativasEsgotadas() {
  return Number(ler(TENTATIVAS_RESGATE) || 0) >= MAX_TENTATIVAS;
}

export function registrarTentativaResgate() {
  gravar(TENTATIVAS_RESGATE, String(Number(ler(TENTATIVAS_RESGATE) || 0) + 1));
}

// ─── LIMPEZA ─────────────────────────────────────────────────────────────────

// Chamada quando a permissão está concedida E o assunto da promoção se resolveu
// (resgatou, ou não havia nada a resgatar).
//
// Apagar `visto_sem_permissao` é o que impede o resgate de ser tentado de novo
// eternamente; apagar `pedido_recusado` é o que faz o aviso discreto sumir
// sozinho para quem liberou pelos Ajustes, sem precisar de nenhuma ação.
export function limparMemoriaPush() {
  apagar(VISTO_SEM_PERMISSAO);
  apagar(PEDIDO_RECUSADO);
  apagar(TENTATIVAS_RESGATE);
}
