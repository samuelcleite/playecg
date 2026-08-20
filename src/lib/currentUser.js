import { base44 } from '@/api/base44Client'

// getCurrentUser — substitui base44.auth.me() em todas as telas de usuário.
// -----------------------------------------------------------------------------
// Devolve a ACCOUNT do usuário autenticado, seja qual for a identidade (JWT
// próprio ou sessão hospedada do Base44). O getMyAccount resolve as duas.
//
// Por que isto existe em vez de cada tela chamar auth.me():
//
// Cada tela decidindo por conta própria de onde vem o usuário foi exatamente o
// que produziu, no teste, "Premium" no topo e "Gratuito" no perfil da mesma
// tela: metade lia do AuthContext e metade do auth.me(). Com um único ponto,
// não existe mais o estado em que as telas discordam entre si.
//
// O cache é por carregamento de página, não por sessão: 13 telas chamando isto
// dispararia 13 requisições idênticas na primeira navegação. `inflight` cobre o
// caso de duas telas montarem ao mesmo tempo — sem ele, a primeira navegação
// dispara duas chamadas em paralelo antes de qualquer uma preencher o cache.
//
// Quem ESCREVE no perfil (updateMyProfile) precisa chamar refreshCurrentUser
// depois, senão a tela seguinte lê o valor velho do cache.
// -----------------------------------------------------------------------------

let cache = null
let inflight = null

async function buscar() {
  try {
    const res = await base44.functions.invoke('getMyAccount', {})
    return res?.data?.account ?? null
  } catch (error) {
    // 404 = autenticado, mas ainda sem Account. Provisiona e segue. Ver
    // ensureMyAccount: acontece com quem se cadastrou pelo login hospedado do
    // Base44 depois do corte.
    if (error?.status === 404) {
      const res = await base44.functions.invoke('ensureMyAccount', {})
      return res?.data?.account ?? null
    }
    throw error
  }
}

export async function getCurrentUser() {
  if (cache) return cache
  if (inflight) return inflight

  const meu = buscar()
    .then(account => {
      cache = account
      return account
    })
    .finally(() => {
      // Só zera se `inflight` ainda for ESTA busca. Uma tela que desiste por
      // timeout e chama clearCurrentUserCache() para tentar de novo deixa a
      // busca antiga viva; quando ela finalmente responde, este finally rodaria
      // em cima da busca NOVA e a apagaria do controle — duas telas montando em
      // seguida voltariam a disparar requisições duplicadas, que é justamente o
      // que o `inflight` existe para evitar.
      if (inflight === meu) inflight = null
    })

  inflight = meu
  return meu
}

// Preenche o cache com uma Account que OUTRO caminho já buscou. Existe por uma
// duplicação concreta: o AuthContext busca a Account no boot pelo getMyAccount
// direto (ele precisa dos ramos de 404 e 401 para provisionar conta e limpar
// token — coisas que não cabem aqui), e um segundo depois o Layout chamava
// getCurrentUser e buscava a MESMA Account de novo. Dois getMyAccount por
// carregamento de página, visíveis aos pares no log da function.
//
// Isso deixou de ser cosmético quando o app começou a tomar 429 do Base44: o
// getMyAccount é a function mais chamada do app, e metade das chamadas não
// precisava existir.
//
// Abastecer em vez de o AuthContext passar a consumir daqui é deliberado:
// mantém intactos os ramos de erro do auth, que são os que não podem quebrar.
export function primeCurrentUser(account) {
  if (account) cache = account
}

// Invalida o cache e busca de novo. Usar depois de qualquer escrita no perfil
// ou na assinatura.
export async function refreshCurrentUser() {
  cache = null
  inflight = null
  return getCurrentUser()
}

export function clearCurrentUserCache() {
  cache = null
  inflight = null
}
