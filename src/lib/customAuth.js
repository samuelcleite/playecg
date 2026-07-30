import { base44 } from '@/api/base44Client'
import { appParams } from '@/lib/app-params'
import despia from 'despia-native'
import { isAndroidNativeApp } from '@/utils/platform'

const TOKEN_KEY = 'app_auth_token'
const VAULT_KEY = 'app_session_token'

const isNative = () => navigator.userAgent.toLowerCase().includes('despia')

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
  if (isNative()) despia(`setvault://?key=${VAULT_KEY}&value=${encodeURIComponent(token)}&locked=true`)
  // APLICAR NO CLIENTE aqui não é redundante com o bootstrapAuth.
  // Guardar no cofre não muda o header das requisições: o cliente do Base44
  // segue com o token que tinha. Sem esta linha, quem acabou de entrar continua
  // sendo identificado pela sessão ANTERIOR — o resolveIdentity cai no fallback
  // do Base44 e o app mostra o usuário errado, com o login tendo dado certo.
  base44.setToken(token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  if (isNative()) despia(`setvault://?key=${VAULT_KEY}&value=&locked=false`)
  // Volta o cliente para a sessão hospedada, se houver uma. Deixar o token
  // nosso pendurado depois de limpar o cofre faria as requisições seguintes
  // continuarem indo com uma credencial que o app já considera apagada.
  base44.setToken(appParams.token || null)
}

export async function signInWithGoogle() {
  // O Android (Capacitor) precisa do mesmo deeplink de retorno que o Despia, por
  // um motivo diferente: lá é o comando oauth:// que abre a aba nativa, aqui é o
  // Google que recusa OAuth em WebView embutida (disallowed_useragent). Nos dois
  // casos o login sai da WebView e só o deeplink traz o code de volta.
  const androidNativo = isAndroidNativeApp()
  const scheme = (isNative() || androidNativo) ? 'playecg' : ''
  const { data } = await base44.functions.invoke('googleAuthUrl', { deeplink_scheme: scheme })
  if (!data?.url) throw new Error('sem URL do Google')
  if (androidNativo) {
    // Custom Tabs. O import é dinâmico para o plugin não entrar no bundle que
    // roda em playecg.app e dentro do Despia. O retorno é tratado pelo listener
    // de appUrlOpen em src/utils/androidDeepLink.js.
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url: data.url })
  } else if (isNative()) {
    despia(`oauth://?url=${encodeURIComponent(data.url)}`)
  } else {
    window.location.href = data.url
  }
}

export async function loginWithGoogleCode(code) {
  const { data } = await base44.functions.invoke('googleSignIn', { google_code: code })
  if (!data?.token) throw new Error(data?.error || 'falha no login')
  setToken(data.token)
  return data.account
}

export async function restoreToken() {
  const local = getToken()
  if (local || !isNative()) return local
  const data = await despia(`readvault://?key=${VAULT_KEY}`, [VAULT_KEY])
  const token = data?.[VAULT_KEY] ? decodeURIComponent(data[VAULT_KEY]) : null
  if (token) localStorage.setItem(TOKEN_KEY, token)
  return token
}

// Aplica o token da nossa sessão ao cliente do Base44, para que TODA requisição
// seguinte (functions e entidades) vá com ele no Authorization.
export function applyToken(token) {
  if (token) base44.setToken(token)
}

// Chamado no boot, ANTES de renderizar. Duas razões para existir:
//
// 1) O cliente do Base44 é criado na importação do módulo, com o token que
//    existir naquele instante. O próprio SDK avisa que requisições disparadas
//    antes do setToken saem sem autenticação — então o setToken tem que rodar
//    antes de qualquer componente montar.
// 2) No app nativo o token vive no cofre do Despia e a leitura é assíncrona.
//    Sem esperar por ela, a primeira tela renderiza deslogada e manda o usuário
//    para o login mesmo com sessão válida guardada.
//
// O teto de tempo não é decorativo: se o Despia não responder ao readvault://,
// a promessa nunca resolve e o app NUNCA renderiza — tela branca permanente, a
// pior falha possível. Preferimos renderizar deslogado depois de 1,5s; quem
// tinha sessão vê o login por um instante, o que é ruim mas recuperável.
export async function bootstrapAuth() {
  try {
    const token = await Promise.race([
      restoreToken(),
      new Promise(resolve => setTimeout(() => resolve(null), 1500))
    ])
    applyToken(token)
    return token || null
  } catch (_e) {
    return null
  }
}
