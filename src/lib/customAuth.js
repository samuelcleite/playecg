import { base44 } from '@/api/base44Client'

const TOKEN_KEY = 'app_auth_token'

const isNative = () => navigator.userAgent.toLowerCase().includes('despia')

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function signInWithGoogle() {
  const scheme = isNative() ? 'playecg' : ''
  const { data } = await base44.functions.invoke('googleAuthUrl', { deeplink_scheme: scheme })
  if (!data?.url) throw new Error('sem URL do Google')
  window.location.href = data.url // iOS entra depois
}

export async function loginWithGoogleCode(code) {
  const { data } = await base44.functions.invoke('googleSignIn', { google_code: code })
  if (!data?.token) throw new Error(data?.error || 'falha no login')
  setToken(data.token)
  return data.account
}
