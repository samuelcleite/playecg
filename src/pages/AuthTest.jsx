// TEMPORÁRIO: página de teste do fluxo de login Google (auth customizado, paralelo ao Base44).
// Remover quando o fluxo estiver validado.
import { useEffect, useState } from 'react'
import { signInWithGoogle, restoreToken, clearToken } from '@/lib/customAuth'
export default function AuthTest() {
  const [status, setStatus] = useState('verificando...')
  useEffect(() => {
    restoreToken().then(t => setStatus(t ? 'SESSÃO ATIVA (restaurada do cofre)' : 'sem sessão'))
  }, [])
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <p style={{ fontWeight: 600, marginBottom: 16 }}>{status}</p>
      <button onClick={() => signInWithGoogle()}>Entrar com Google (teste)</button>
      <button onClick={() => { clearToken(); location.reload() }} style={{ marginLeft: 12 }}>Sair (limpar cofre)</button>
    </div>
  )
}
