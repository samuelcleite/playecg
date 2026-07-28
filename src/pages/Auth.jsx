import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginWithGoogleCode } from '@/lib/customAuth'

export default function Auth() {
  const navigate = useNavigate()
  const done = useRef(false)
  const [status, setStatus] = useState('Entrando...')

  useEffect(() => {
    const tryExtract = () => {
      if (done.current) return
      const code = new URLSearchParams(location.search).get('code')
      if (!code) return
      done.current = true
      loginWithGoogleCode(code)
        .then(acc => {
          setStatus('Logado: ' + acc.email)
          // RECARGA COMPLETA, não navigate(): o AuthContext já resolveu a sessão
          // no boot desta página, com a credencial antiga. Uma navegação do
          // router não o refaz, e o usuário entraria como quem estava logado
          // antes. A recarga faz o bootstrapAuth rodar de novo com o token novo.
          setTimeout(() => { window.location.href = '/' }, 1200)
        })
        .catch(e => setStatus('Erro: ' + e.message))
    }
    tryExtract()
    window.addEventListener('popstate', tryExtract)
    window.addEventListener('hashchange', tryExtract)
    const poll = setInterval(tryExtract, 300)
    return () => {
      window.removeEventListener('popstate', tryExtract)
      window.removeEventListener('hashchange', tryExtract)
      clearInterval(poll)
    }
  }, [navigate])

  return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>{status}</p>
}
