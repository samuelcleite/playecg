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
        .then(acc => { setStatus('Logado: ' + acc.email); setTimeout(() => navigate('/'), 1500) })
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
