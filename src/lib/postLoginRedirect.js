// Para onde voltar depois do login.
// -----------------------------------------------------------------------------
// O login do app não tem noção de "destino": o retorno do OAuth cai em /auth,
// que sempre manda para '/', e a Home sempre manda o autenticado para o
// Dashboard. Quem tentava abrir uma rota protegida deslogado ia parar no
// Dashboard e perdia o link que estava seguindo.
//
// Isso nunca importou porque toda rota protegida é alcançável pelo menu. A
// /vitalicio não é: ela só existe por link direto, e mandar quem clicou nele
// para o Dashboard significa perder a venda sem o comprador entender por quê.
//
// sessionStorage e não localStorage: o destino vale para ESTA aba e para ESTA
// tentativa de login. Um destino sobrevivendo ao fechamento do navegador
// sequestraria um login futuro que não tem nada a ver com ele.
// -----------------------------------------------------------------------------

const CHAVE = 'playecg_destino_pos_login';

export function guardarDestinoPosLogin(caminho) {
  try {
    // Só caminho interno. Sem esta checagem, qualquer coisa que chegasse aqui
    // viraria um redirecionamento aberto depois do login.
    if (typeof caminho !== 'string' || !caminho.startsWith('/') || caminho.startsWith('//')) return;
    sessionStorage.setItem(CHAVE, caminho);
  } catch (_e) {
    // Modo privado / storage bloqueado: sem destino guardado, o login segue
    // para o Dashboard como sempre fez. Degradar é aceitável, quebrar não.
  }
}

// Lê e APAGA. Consumir de uma vez evita que um destino velho sequestre o
// próximo login desta mesma aba.
export function consumirDestinoPosLogin() {
  try {
    const destino = sessionStorage.getItem(CHAVE);
    if (destino) sessionStorage.removeItem(CHAVE);
    return destino || null;
  } catch (_e) {
    return null;
  }
}
