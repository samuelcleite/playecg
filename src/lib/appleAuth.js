export async function signInWithApple() {
  if (!window.AppleID?.auth) throw new Error('Apple sign-in indisponível')
  window.AppleID.auth.init({
    clientId: APPLE_SERVICES_ID,
    scope: 'name email',
    redirectURI: window.location.origin + '/',
    usePopup: true,
  })

  let response
  try {
    response = await window.AppleID.auth.signIn()
  } catch (e) {
    // A SDK da Apple rejeita com { error: '...' }, não com um Error normal
    throw new Error('Apple SDK rejeitou: ' + (e?.error || e?.message || JSON.stringify(e)))
  }

  const idToken = response?.authorization?.id_token
  if (!idToken) throw new Error('Resposta sem id_token: ' + JSON.stringify(response || null))

  const name = response.user?.name
  const fullName = name ? `${name.firstName || ''} ${name.lastName || ''}`.trim() : ''

  const { data } = await base44.functions.invoke('appleSignIn', {
    apple_id_token: idToken,
    full_name: fullName,
  })
  if (!data?.token) throw new Error(data?.error || 'falha no login Apple')
  setToken(data.token)
  return data.account
}