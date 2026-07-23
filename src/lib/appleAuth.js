// src/lib/appleAuth.js
// Sign In with Apple — iOS + web via Apple JS SDK (folha nativa com Face ID no iOS).
// Android (ponte oauth://) fica pra fase Android — não tratado aqui de propósito.
import { base44 } from '@/api/base44Client'
import { setToken } from '@/lib/customAuth'

const APPLE_SERVICES_ID = 'com.despia.playecg.signin'

export async function signInWithApple() {
  if (!window.AppleID?.auth) throw new Error('Apple sign-in indisponível')

  window.AppleID.auth.init({
    clientId: APPLE_SERVICES_ID,
    scope: 'name email',
    redirectURI: window.location.origin + '/',
    usePopup: true,
  })

  const response = await window.AppleID.auth.signIn()
  const name = response.user?.name
  const fullName = name ? `${name.firstName || ''} ${name.lastName || ''}`.trim() : ''

  const { data } = await base44.functions.invoke('appleSignIn', {
    apple_id_token: response.authorization.id_token,
    full_name: fullName,
  })
  if (!data?.token) throw new Error(data?.error || 'falha no login Apple')
  setToken(data.token)
  return data.account
}
