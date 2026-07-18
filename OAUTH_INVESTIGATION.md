# Investigação — OAuth social prende o usuário fora da WebView no app iOS (Despia)

**Bug:** após login social no app iOS, o usuário fica preso numa aba nativa
(ASWebAuthenticationSession) com user-agent de Safari puro. Nela, `isIOSNativeApp()`
retorna `false` e as compras vão para o Stripe (violação da Guideline 3.1.1 da Apple).

---

## Fase 1 — Achados

### 1. Como o login é iniciado

Existem exatamente **dois** pontos de iniciação de login, ambos via
`base44.auth.redirectToLogin(nextUrl)`:

| Arquivo | Função | URL de retorno passada |
|---|---|---|
| [src/lib/AuthContext.jsx:119-122](src/lib/AuthContext.jsx#L119-L122) | `navigateToLogin()` | `window.location.href` (URL atual) |
| [src/pages/Home.jsx:34-36](src/pages/Home.jsx#L34-L36) | `handleLogin()` | `origin + createPageUrl("Dashboard")` |

`navigateToLogin()` é chamado automaticamente por [src/App.jsx:52](src/App.jsx#L52)
quando o `AuthContext` detecta `authError.type === 'auth_required'`.

O que `redirectToLogin` faz (SDK, `@base44/sdk/dist/modules/auth.js`):

```js
const loginUrl = `${options.appBaseUrl}/login?from_url=${encodeURIComponent(redirectUrl)}`;
window.location.href = loginUrl;
```

Ou seja: **a própria WebView navega** para a página de login hospedada pelo Base44,
levando `from_url` — que **nós controlamos totalmente**. Não há uso de
`loginWithProvider`, `loginViaEmailPassword`, `verifyOtp` etc. no código do app —
toda a UI de login (botões sociais + e-mail/senha) é a página hospedada do Base44.

### 2. A URL de callback é configurável?

**Sim.** O callback é o próprio `from_url` passado a `redirectToLogin`. Ao final do
OAuth, o Base44 redireciona para `from_url` acrescentando `?access_token=...`
(e, no fluxo popup do SDK, também `is_new_user`). Confirmado por:

- [src/lib/app-params.js:41](src/lib/app-params.js#L41): o app lê `access_token` da
  query string em **qualquer** página, com `removeFromUrl: true`, e o persiste em
  `localStorage` (`base44_access_token`);
- o código do SDK (`loginViaPopup` em `auth.js`) monta o retorno com
  `callbackUrl.searchParams.set("access_token", ...)`.

Podemos, portanto, anexar parâmetros próprios ao `from_url` — eles sobrevivem à volta.

### 3. Existe rota/página de callback pós-login?

**Não há rota dedicada.** O usuário aterrissa onde o `from_url` apontar
(`/Dashboard` vindo da Home; a URL corrente vinda do `AuthContext`). A ingestão do
token é global: acontece no carregamento do módulo [src/lib/app-params.js](src/lib/app-params.js),
importado por [src/api/base44Client.js](src/api/base44Client.js) antes do React montar.
Não existe rota `/auth`, `/callback` ou similar em [src/App.jsx](src/App.jsx).

### 4. Uso de `despia-native` fora de `purchase.js`

**Nenhum.** Único import: [src/utils/purchase.js:1](src/utils/purchase.js#L1).
O pacote (`node_modules/despia-native/index.js`) é uma ponte genérica de comandos
(`window.despia = "<comando>"` + observação de variáveis globais) — serve para
enviar qualquer comando ao wrapper, inclusive `oauth://`, mas não é usado para auth
hoje. [src/utils/platform.js](src/utils/platform.js) só inspeciona o user-agent.

### 5. Esquema de URL / deeplink

**Nada no repositório.** Nenhuma referência a scheme, deeplink ou universal link em
`src/`; `public/` contém apenas `manifest.json` e `sw.js` (sem `.well-known/`).
O scheme do app é configurado no **painel do Despia** (Publish → Deeplink) e não é
descobrível em runtime — segundo a doc do Despia, deve ser copiado do painel e
fixado no código. **Valor confirmado pelo dono do app no painel: `playecg://`.**
(O `capacitor.config.ts` não rastreado no working tree pertence a trabalho Android
em andamento, fora do escopo, e não é referenciado pelo app web.)

### 6. E-mail/senha vs. social

Fluxos diferentes, e é por isso que só o social prende o usuário:

- **E-mail/senha:** preenchido na página de login do Base44, que carrega **dentro da
  própria WebView** (navegação de página inteira). O POST é XHR e a volta para
  `from_url?access_token=...` acontece na WebView. Nenhuma aba nativa é aberta →
  sem bug, UA continua `despia-iphone`.
- **Social (Google / Apple):** o botão navega para o provedor
  (`accounts.google.com` / `appleid.apple.com`). O wrapper Despia abre essa URL numa
  **ASWebAuthenticationSession** (Google bloqueia OAuth em WebViews —
  `disallowed_useragent`). Toda a cadeia seguinte — provedor → callback do servidor
  Base44 → `from_url?access_token=...` — acontece **dentro da aba nativa**. O app
  carrega lá, com UA de Safari, e o usuário fica preso. É exatamente o sintoma
  observado em produção.

### Mecânica documentada do Despia (setup.despia.com/native-features/oauth)

- Deeplink `scheme://oauth/<path>?<query>` → o Despia **fecha a aba nativa** e navega
  a WebView para `/<path>?<query>` (query passa intacta).
- Sem o segmento `oauth/`, o deeplink é ignorado e "o usuário fica preso na aba".
- O scheme vem do painel (**Despia → Publish → Deeplink**); não há descoberta em runtime.

---

## Fase 2 — Opções

### Opção A (recomendada): marcar o `from_url` no app nativo e disparar o deeplink na aterrissagem

**Ideia:** nós controlamos as duas pontas do fluxo — a iniciação (podemos anexar um
marcador ao `from_url` quando `isIOSNativeApp()` é `true`) e a aterrissagem (o
callback é o nosso próprio app, que já tem bootstrap global de token).

**O que muda (tudo no nosso código, ~1 arquivo novo + 3 edições pequenas):**

1. Novo helper `src/utils/nativeOAuth.js`:
   - `DESPIA_SCHEME` — constante com o scheme do painel do Despia;
   - `withNativeReturnMarker(url)` — anexa `despia_oauth_return=1` à URL **somente**
     quando `isIOSNativeApp()` é `true`;
   - `maybeReturnToNativeApp()` — no boot: se a URL tem o marcador **e** um
     `access_token` acabou de ser capturado (`appParams.token`) **e** o UA **não** é
     Despia (ou seja, estamos na aba nativa do fluxo iniciado dentro do app), faz
     `window.location.replace(`${DESPIA_SCHEME}://oauth${pathname}?access_token=...`)`.
2. [src/pages/Home.jsx](src/pages/Home.jsx) e [src/lib/AuthContext.jsx](src/lib/AuthContext.jsx):
   envolver a URL passada a `redirectToLogin` com `withNativeReturnMarker(...)`.
3. [src/main.jsx](src/main.jsx): chamar `maybeReturnToNativeApp()` antes do render.

**Resultado:** o Despia fecha a aba e navega a WebView para
`/<rota-original>?access_token=...`; o bootstrap existente
([app-params.js](src/lib/app-params.js)) captura o token na WebView → usuário logado
no app nativo, com UA `despia-iphone` e compras via RevenueCat.

- **Depende do Base44:** apenas do comportamento já observado (preservar a query do
  `from_url` e anexar `access_token`). Nenhum suporte/mudança do Base44 necessário.
- **Depende do Despia:** do comportamento documentado do prefixo `oauth/` e do valor
  do scheme (obter em Despia → Publish → Deeplink).
- **Risco:** baixo. O marcador só existe quando o login foi iniciado dentro do app
  nativo; web e e-mail/senha ficam intocados; se o deeplink falhar, o usuário fica
  exatamente como hoje (na aba, logado nela). O pior cenário de scheme errado é um
  alerta do Safari na aba — por isso o valor precisa ser confirmado no painel.
- **Confiança:** alta na mecânica (documentada pelo Despia e coerente com o sintoma);
  média no fim-a-fim até teste em aparelho real (TestFlight), pois o ramo só ativa
  sob o wrapper.

### Opção B: suporte nativo do Base44 (redirect para scheme customizado)

Pedir ao Base44 que o `from_url` aceite/redirecione diretamente para
`scheme://oauth/...`. Depende inteiramente do Base44 (não documentado); a Opção A
obtém o mesmo efeito sem depender deles. **Descartada** enquanto A for viável.

### Opção C: fluxo "easy OAuth" completo do Despia (UI própria + `despia('oauth://?url=...')`)

Substituir a página de login do Base44 por UI própria chamando o OAuth dos provedores
diretamente. Exigiria reimplementar a autenticação gerenciada pelo Base44 (troca de
código por token é do servidor deles). **Inviável/alto risco** — descartada.

### Status da implementação (Fase 3 — Opção A implementada)

Scheme confirmado pelo dono do app no painel do Despia: **`playecg://`**
(constante `DESPIA_SCHEME` em [src/utils/nativeOAuth.js](src/utils/nativeOAuth.js)).

Arquivos alterados:

- `src/utils/nativeOAuth.js` (novo) — `withNativeReturnMarker()` e
  `maybeReturnToNativeApp()`;
- `src/pages/Home.jsx` e `src/lib/AuthContext.jsx` — `from_url` marcado com
  `despia_oauth_return=1` quando `isIOSNativeApp()`;
- `src/main.jsx` — `maybeReturnToNativeApp()` no boot, antes do render.

### Verificação pendente (aparelho real, via TestFlight/App Store)

O ramo só ativa sob o wrapper do Despia; não é testável em desktop. Verificar no
aparelho: login social no app → a aba nativa fecha sozinha → WebView volta logada
(UA `despia-iphone`, `isIOSNativeApp: true`) → tela Upgrade oferece compra via
RevenueCat (não Stripe). Verificar também que o login e-mail/senha e o login social
na web (Safari/Chrome normais) continuam funcionando como antes.
