import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { maybeReturnToNativeApp } from '@/utils/nativeOAuth'
import { registrarDeepLinkAndroid } from '@/utils/androidDeepLink'
import { bootstrapAuth } from '@/lib/customAuth'
import { sincronizarSafeArea } from '@/utils/safeArea'

// Se estamos na aba nativa de OAuth do app iOS (Despia), dispara o deeplink de
// retorno à WebView. Renderizamos mesmo assim: se o deeplink funcionar, a aba
// fecha imediatamente; se falhar, o usuário ao menos vê o app.
maybeReturnToNativeApp();

// Mede quanto o wrapper do Despia ja reservou do entalhe e completa o que
// falta. Medido, nao suposto -- ver utils/safeArea.js.
sincronizarSafeArea();

// Equivalente Android: escuta o deeplink playecg:// que traz o code do OAuth de
// volta da Custom Tab. No-op no Despia e na web. Fire-and-forget de propósito —
// bloquear o render nisto reintroduziria o risco de tela branca que o
// bootstrapAuth abaixo existe para evitar.
registrarDeepLinkAndroid();

// Restaura a sessão própria (cofre do Despia no nativo, localStorage na web) e
// aplica o token ao cliente do Base44 ANTES do primeiro render. Ver bootstrapAuth.
// `.finally` e não `.then`: se a restauração falhar por qualquer motivo, o app
// tem que renderizar mesmo assim — deslogado é recuperável, tela branca não.
bootstrapAuth().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    // <React.StrictMode>
    <App />
    // </React.StrictMode>,
  )
})

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}



