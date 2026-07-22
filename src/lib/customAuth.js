import { base44 } from '@/api/base44Client'
import despia from 'despia-native'

const TOKEN_KEY = 'app_auth_token'
const VAULT_KEY = 'app_session_token'

const isNative = () => navigator.userAgent.toLowerCase().includes('despia')

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
  if (isNative()) despia(`setvault://?key=${VAULT_KEY}&value=${encodeURIComponent(token)}&locked=false`)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  if (isNative()) despia(`setvault://?key=${VAULT_KEY}&value=&locked=false`)
}

export async function signInWithGoogle() {
  const scheme = isNative() ? 'playecg' : ''
  const { data } = await base44.functions.invoke('googleAuthUrl', { deeplink_scheme: scheme })
  if (!data?.url) throw new Error('sem URL do Google')
  if (isNative()) {
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
