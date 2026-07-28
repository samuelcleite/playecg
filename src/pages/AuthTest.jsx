// TEMPORÁRIO: página de teste do fluxo de login Google/Apple (auth customizado,
// paralelo ao Base44). Remover quando o fluxo estiver validado.
import { useEffect, useState } from 'react'
import { signInWithGoogle, restoreToken, clearToken, getToken } from '@/lib/customAuth'
import { signInWithApple } from '@/lib/appleAuth'
import { base44 } from '@/api/base44Client'

export default function AuthTest() {
  const [status, setStatus] = useState('verificando...')
  const [chamada, setChamada] = useState(null)
  const [entidade, setEntidade] = useState(null)

  useEffect(() => {
    restoreToken().then(t => setStatus(t ? 'SESSÃO ATIVA (restaurada do cofre)' : 'sem sessão'))
  }, [])

  // PROVA DA FASE 3: o caminho app -> function -> resolveIdentity reconhece o
  // NOSSO Bearer -> devolve dado do usuário. É o único elo da migração que nunca
  // rodou a partir do aparelho: o /authtest até hoje só fazia sign-in e guardava
  // o token, sem nunca chamar uma function com ele.
  //
  // getUserProgress é a cobaia certa: é leitura pura, já está convertida, e usa o
  // contrato `record` (faz lookup de Account no caminho JWT). Se ela responder,
  // está provado de uma vez que o Bearer atravessa o Base44, que o resolveIdentity
  // valida a assinatura HS256, e que a Account é encontrada pelo email do token.
  //
  // ATENÇÃO: base44.setToken troca o token de TODAS as requisições seguintes.
  // Se você estiver logado como admin nesta mesma aba, a sessão admin para de
  // funcionar até dar F5. É teste, não é o fluxo final.
  const testarChamadaAutenticada = async () => {
    setChamada({ estado: 'chamando...' })
    try {
      const token = getToken()
      if (!token) {
        setChamada({ estado: 'ERRO', detalhe: 'sem token — faça login primeiro' })
        return
      }

      base44.setToken(token)
      const res = await base44.functions.invoke('getUserProgress', {})

      setChamada({
        estado: 'OK',
        detalhe: JSON.stringify(res?.data ?? res, null, 2).slice(0, 800)
      })
    } catch (e) {
      // O que interessa aqui é o status: 401/403 significa que o Bearer não foi
      // aceito (e por quem), enquanto erro de rede significa outra coisa.
      setChamada({
        estado: 'ERRO',
        detalhe: `status ${e?.status ?? '?'} — ${e?.message ?? e}`
      })
    }
  }

  // SEGUNDA PROVA: leitura de ENTIDADE com o nosso JWT.
  //
  // O teste acima prova o endpoint de FUNCTIONS, que repassa o header para a
  // function e deixa o resolveIdentity decidir. O endpoint de ENTIDADES é outro:
  // o próprio Base44 valida o token antes de aplicar o RLS. Se ele rejeitar um
  // Bearer que não é dele, toda leitura de conteúdo (Module, ECGCase, Phase)
  // feita direto do frontend quebra sob JWT — e aí a migração precisa mover
  // essas leituras para backend functions, que é um projeto à parte.
  //
  // ECGCase/Module têm RLS read público, então o resultado esperado é sucesso
  // mesmo sem sessão reconhecida. O que este teste mede é se um token
  // DESCONHECIDO derruba a requisição antes de chegar no RLS.
  const testarLeituraDeConteudo = async () => {
    setEntidade({ estado: 'chamando...' })
    try {
      const token = getToken()
      if (!token) {
        setEntidade({ estado: 'ERRO', detalhe: 'sem token — faça login primeiro' })
        return
      }

      base44.setToken(token)
      const modules = await base44.entities.Module.list(null, 3)
      const casos = await base44.entities.ECGCase.list(null, 1)

      setEntidade({
        estado: 'OK',
        detalhe:
          `Module: ${modules?.length ?? 0} registro(s)\n` +
          `ECGCase: ${casos?.length ?? 0} registro(s)\n\n` +
          `primeiro módulo: ${modules?.[0]?.title ?? '(sem title)'}`
      })
    } catch (e) {
      setEntidade({
        estado: 'ERRO',
        detalhe: `status ${e?.status ?? '?'} — ${e?.message ?? e}`
      })
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <p style={{ fontWeight: 600, marginBottom: 16 }}>{status}</p>

      <button onClick={() => signInWithGoogle()}>Entrar com Google (teste)</button>
      <button
        onClick={() => signInWithApple().then(a => setStatus('Logado Apple: ' + a.email)).catch(e => setStatus('Erro Apple: ' + e.message))}
        style={{ marginLeft: 12 }}
      >
        Entrar com Apple (teste)
      </button>
      <button onClick={() => { clearToken(); location.reload() }} style={{ marginLeft: 12 }}>
        Sair (limpar cofre)
      </button>

      <hr style={{ margin: '24px 0' }} />

      <button
        onClick={testarChamadaAutenticada}
        style={{ fontWeight: 600, padding: '8px 14px' }}
      >
        Testar chamada autenticada (getUserProgress)
      </button>
      <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        Troca o token da sessão nesta aba. Se estiver logado como admin aqui, dê F5 depois.
      </p>

      {chamada && (
        <pre style={{
          marginTop: 16,
          padding: 12,
          background: chamada.estado === 'OK' ? '#e8f5e9' : '#ffebee',
          border: '1px solid #ccc',
          borderRadius: 8,
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}>
          {chamada.estado}
          {chamada.detalhe ? `\n\n${chamada.detalhe}` : ''}
        </pre>
      )}

      <hr style={{ margin: '24px 0' }} />

      <button
        onClick={testarLeituraDeConteudo}
        style={{ fontWeight: 600, padding: '8px 14px' }}
      >
        Testar leitura de conteúdo (Module / ECGCase)
      </button>
      <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        Prova o outro endpoint: entidades, que o Base44 valida sozinho.
      </p>

      {entidade && (
        <pre style={{
          marginTop: 16,
          padding: 12,
          background: entidade.estado === 'OK' ? '#e8f5e9' : '#ffebee',
          border: '1px solid #ccc',
          borderRadius: 8,
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}>
          {entidade.estado}
          {entidade.detalhe ? `\n\n${entidade.detalhe}` : ''}
        </pre>
      )}
    </div>
  )
}
