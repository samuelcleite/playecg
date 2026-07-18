import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { maybeReturnToNativeApp } from '@/utils/nativeOAuth'

// Se estamos na aba nativa de OAuth do app iOS (Despia), dispara o deeplink de
// retorno à WebView. Renderizamos mesmo assim: se o deeplink funcionar, a aba
// fecha imediatamente; se falhar, o usuário ao menos vê o app.
maybeReturnToNativeApp();

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <App />
  // </React.StrictMode>,
)

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}



