import { useEffect, useRef, useState } from 'react'
import { loginWithGoogleCode } from '@/lib/customAuth'

// Retorno do OAuth do Google: recebe o ?code=, troca pelo nosso token e entra.
//
// Esta tela nasceu como página de debug e virou a UX de login de todo usuário
// novo. Ela NÃO deve parecer uma etapa: nada de texto de status, nada de espera
// artificial. Só o mesmo spinner do resto do app enquanto a troca acontece, e
// redirecionamento assim que o token estiver aplicado.
//
// A troca do code leva um round-trip de rede, então a tela aparece por um
// instante — isso não dá para eliminar, só para não parecer uma tela.
export default function Auth() {
  const done = useRef(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    const tryExtract = () => {
      if (done.current) return
      const code = new URLSearchParams(location.search).get('code')
      if (!code) return
      done.current = true
      loginWithGoogleCode(code)
        .then(() => {
          // Recarga completa, não navigate(): o AuthContext já resolveu a sessão
          // no boot desta página com a credencial antiga, e uma navegação do
          // router não o refaz.
          //
          // `replace` e não `href`: tira a URL com o ?code= do histórico. Com
          // href, o botão voltar traz o usuário de volta a esta tela com um code
          // já consumido — que falha e mostra erro depois de um login bem
          // sucedido.
          //
          // O setTimeout de 1,2s que existia aqui só servia para dar tempo de ler
          // o texto de status, que não existe mais.
          window.location.replace('/')
        })
        .catch(e => setErro(e?.message || 'Não foi possível concluir o login.'))
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
  }, [])

  // O erro continua visível: falhar em silêncio deixaria o usuário numa tela de
  // carregamento eterna, sem saber que precisa tentar de novo.
  if (erro) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 px-8 bg-[#0D3B66]">
        <p className="text-white text-center">{erro}</p>
        <button
          onClick={() => window.location.replace('/')}
          className="bg-[#22C55E] hover:bg-green-600 text-white font-semibold rounded-xl px-6 py-3"
        >
          Voltar
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0D3B66]">
      <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  )
}
