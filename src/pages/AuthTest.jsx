// TEMPORÁRIO: página de teste do fluxo de login Google (auth customizado, paralelo ao Base44).
// Remover quando o fluxo estiver validado.
import { signInWithGoogle } from '@/lib/customAuth'

export default function AuthTest() {
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <button onClick={() => signInWithGoogle()}>Entrar com Google (teste)</button>
    </div>
  )
}
