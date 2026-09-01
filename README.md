# PlayECG — Contexto do projeto

> Este README existe para dar contexto a agentes (Claude Code) e a mim mesmo no
> começo de cada sessão. Leia inteiro antes de rodar qualquer comando.

---

## 0. Regras invioláveis

1. **Este repo tem sync BIDIRECIONAL com o Base44.** Todo commit em `main` vai
   para o app ao vivo. Não há build step, não há gate de review, não há
   TestFlight no meio: o iOS e o Android carregam `playecg.app` remotamente, então
   **merge em `main` = deploy OTA imediato para todos os usuários em produção.**
2. **Nunca commite, mergeie ou faça push em `main`.** Trabalhe sempre em branch.
   O merge é decisão minha, depois de eu revisar o diff.
3. **Nunca faça `git push`.** Termine com `git add` + commit descritivo na branch
   correta e pare. Eu reviso e faço o push.
4. **Nunca use `git add .` ou `git add -A`.** Adicione arquivos nomeados. Há
   pastas fantasma (`android/`) que entram por engano.
5. **Nenhum segredo entra no Git.** Senhas de keystore, `.jks`, `.keystore`,
   `keystore.properties`, `local.properties`, chaves de API — nem em comentário,
   nem em mensagem de commit. O repo sincroniza sozinho com o GitHub.
6. **Antes de alterar arquivo existente, mostre o diff e espere aprovação.**
   Arquivo novo pode criar direto.
7. **Pare e reporte ao final de cada tarefa numerada.** Não encadeie tarefas.
8. Se aparecer erro de file lock (`Deletion of directory ... failed`): pare,
   rode `cd android; .\gradlew --stop; cd ..`, e me avise. Não force.

---

## 1. O que é o projeto

**PlayECG** — app educacional de interpretação de ECG para estudantes de
medicina, residentes e profissionais de saúde. Mercado brasileiro, conteúdo em
português.

- Empresa: PLAYECG DESENVOLVIMENTO DE SOFTWARE LTDA (Simples Nacional, 3 sócios)
- Site/PWA: <https://playecg.app>
- iOS: App Store, bundle `com.despia.playecg` (Apple ID 6787499219) — publicado
- Android: Google Play, `com.playecg.app` — em Closed testing (Alpha)
- Repo: `github.com/samuelcleite/playecg`

Modelo: freemium. Usuário nasce `free`; conteúdo pago liberado por
`subscription_type: 'premium'`.

---

## 2. Arquitetura

```
                        ┌──────────────────────┐
   iOS (Despia) ──────► │                      │
   Android (Capacitor)► │   playecg.app        │ ◄── Web / PWA
                        │   React + Vite       │
                        │   (build do Base44)  │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │  Base44 backend      │
                        │  Deno functions      │
                        │  + entidades         │
                        └──────────────────────┘
```

- **Frontend:** React + Vite. Alias `@/` → `src/`.
- **Backend:** funções Deno em `base44/functions/<nome>/entry.ts`.
  Usam `createClientFromRequest(req)` e `base44.asServiceRole.entities.X`
  para ler/escrever.
- **Entidades:** `base44/entities/*.jsonc`.
- **Os dois wrappers nativos carregam o site remotamente** (`server.url` no
  Capacitor; carregamento remoto no Despia). Por isso não há build nativo por
  release de conteúdo — só quando muda algo do shell.

### Entidades

| Entidade | Tipo | Campo dono |
|---|---|---|
| `User` | built-in do Base44 | — (fonte de verdade hoje) |
| `Account` | auth própria (RLS deny-all) | `email` |
| `UserProgress` | per-user | `user_email` |
| `QuizAttempt` | per-user | `user_email` |
| `UserAchievement` | per-user | `user_email` |
| `DailyQuizStats` | per-user | `user_email` |
| `Payment` | per-user | `user_email` |
| `CouponUsage` | per-user | `user_email` |
| `PushSubscription` | per-user | **`user_id`** (única exceção) |
| `Module`, `Phase`, `Content`, `ECGCase`, `ECGImage`, `Achievement`, `DailyCase`, `Coupon` | catálogo global | — |

Armadilha de nomenclatura: `src/api/entities.js:9` faz
`export const User = base44.auth` — colide conceitualmente com a entidade `User`
do banco. Não confunda os dois.

### Convenção de invoke

`base44.functions.invoke` embrulha o corpo HTTP em `.data`. Se a function
retorna `{ success, count, data: [...] }`, o array real está em
`res.data.data`. Já causou um bug silencioso de progresso não aparecendo.

---

## 3. Ambiente local

| Caminho | Branch fixa | Uso |
|---|---|---|
| `C:\dev\playecg` | `main` / feature branches | trabalho geral, auth, backend |
| `C:\dev\playecg-android` | `android-capacitor` | Android/Capacitor |
| `C:\dev\playecg-fix` | worktree | quando o lock do `android/` trava troca de branch |
| `C:\dev\keys\playecg-upload.jks` | — | keystore de upload (alias `playecg-upload`, PKCS12) |

- **Nada dentro do OneDrive.** Um clone lá já causou divergência séria.
- **Git só em PowerShell puro**, nunca no terminal integrado do VS Code — ele
  segura handles na pasta `android/` e quebra troca de branch no Windows.
- Para atualizar o ponteiro de `main` sem tocar no disco:
  `git branch -f main origin/main`.
- **O `gh` (GitHub CLI) não está instalado nesta máquina** (verificado em
  09/08/2026). Nenhum agente abre PR por linha de comando aqui: o push vai por
  `git push` e o PR se abre pelo link que o próprio GitHub devolve na saída.
  Para mudar isso: `winget install GitHub.cli` + `gh auth login`.

---

## 4. Autenticação
 
> 📎 **Fonte canônica: [`ARQUITETURA_AUTH.md`](ARQUITETURA_AUTH.md)** (atualizado em 29/07/2026).
> Leia antes de tocar em qualquer coisa de auth, identidade ou entidade per-user.
> Ele substitui o `AUDIT_AUTH.md`, que descreve o mundo anterior ao corte e **não vale mais**.
> Esta seção é só o resumo operacional.
 
### O modelo, em cinco linhas
 
- **A `Account` é o registro único do usuário** — credencial, perfil, assinatura e agregados de progresso.
- **O `User` do Base44 está congelado.** Nada escreve nele desde o corte. Existe só para conceder `role: 'admin'` pela sessão hospedada.
- **Duas credenciais, uma fonte de dados:** JWT próprio (HS256, 30 dias) ou sessão hospedada do Base44. `resolveIdentity` aceita as duas e ambas leem e escrevem na `Account`.
- **`role` nunca vem do JWT** — é hardcoded `'user'`. Admin existe exclusivamente pela sessão hospedada.
- A migração **está concluída**. As escritas já foram cortadas para a `Account`; não há trava pendente.
### As três regras que um agente quebra por acidente
 
**1. O dono vem de `identity.email`, nunca do corpo da requisição.** Sob JWT não existe sessão
Base44, então o RLS não protege nada — o filtro explícito é a única barreira. O
`updateUserProgress` já gravou no `user_email` que o cliente mandasse.
 
**2. RLS negado devolve lista VAZIA, não erro.** É o modo de falha mais perigoso do Base44: `[]`
parece dado legítimo. Já causou usuário gratuito com acesso ilimitado e conquistas que pararam de
desbloquear. **Ao fechar qualquer RLS, varra frontend E backend.**
 
**3. Guardar token ≠ aplicar token.** Gravar no cofre sem trocar o header padrão do cliente HTTP
faz as requisições seguintes irem com a credencial anterior — sem erro visível. Foi assim que um
login correto exibiu o perfil de outro usuário.
 
### Contrato mínimo de cliente
 
`googleAuthUrl` → `googleSignIn` / `appleSignIn` → `{ token, account }` → **gravar e aplicar** →
`getMyAccount` no boot (esperar o armazenamento seguro, com teto de tempo).
 
- `getMyAccount` **404** = autenticado sem Account → chame `ensureMyAccount`. Não é erro.
- `getMyAccount` **401** com token nosso = expirou → apague o token local, senão o app entra em
  laço de sessão morta.
- No logout, limpe o JWT **e** encerre a sessão hospedada. As duas coexistem na transição.
### Nunca exercitado em produção
 
`cancelStripeSubscription`, `deleteUserAccount`, `ensureMyAccount`, login por Apple pela Home nova.
 
### Dívidas de auth
 
- **Não existe login por e-mail e senha.** `password_hash` existe na `Account` e nunca é
  preenchido. Quem não tem Google nem Apple não cria conta.
- **O login hospedado do Base44 continua vivo**, sem data para morrer. Cada usuário migra no
  próximo login; dá para medir contando Accounts com `google_id` ou `apple_id` preenchido.
- **JWT sem revogação.** Token vazado não pode ser invalidado.
- **E-mail de relay da Apple** (`@privaterelay.appleid.com`) é gerado por Developer Team. Team
  diferente = e-mail diferente = conta diferente. **5 contas já foram perdidas assim.**
- `onUserCreated` ficou inerte e não valida quem chama.
---

## 5. Pagamentos

Três trilhos independentes. **Nenhum sistema de cupom atravessa os três.**

| Plataforma | Processador | Webhook |
|---|---|---|
| Web / PWA | Stripe | `base44/functions/stripeWebhook/entry.ts` |
| iOS | App Store IAP via Despia + RevenueCat | `base44/functions/revenuecatWebhook/entry.ts` |
| Android | Google Play Billing via RevenueCat | mesmo webhook |

- **Fonte única de verdade:** campo `subscription_type` (`'free'` \| `'premium'`)
  na entidade **`Account`** — não mais no `User`, congelado desde o corte de
  julho/2026. Continua sendo o único campo que **concede** acesso: nem
  `lifetime_access` nem `trial_ends_at` dão acesso sozinhos, eles só mudam o que
  os caminhos de expiração podem fazer.
- **Quem escreve nele são treze functions** (19/08/2026), não só os dois
  webhooks — as regras que cada uma precisa respeitar estão nos invariantes 8 e 9
  do [`ARQUITETURA_AUTH.md`](ARQUITETURA_AUTH.md). Não confie neste número:
  `npm run check:invariantes` conta e enumera a cada execução, e falha se uma
  delas esquecer o tratamento.
- Planos: **mensal R$59** (`monthly`), **anual R$499** (`annual`) e **vitalício
  R$400** (`lifetime`). O Product ID anual da Apple ainda usa sufixo `.yearly`.
- **Preço e price ID vivem em `base44/shared/plans.ts`.** Aquele arquivo não
  roda — o Base44 não resolve import entre functions — então ele é o *original*
  e as functions carregam cópias inline, mesmo contrato do `resolveIdentity`.
  `grep PLANOS` acha todas.

### Notificação de venda (10/08/2026)

Toda **compra nova** dispara um e-mail simples para `ecgdescomplica@gmail.com`
com quem comprou, de onde e em qual modalidade. Vive nos dois webhooks, na
função `notificarCompra` de cada um.

- **Renovação NÃO notifica.** O `checkout.session.completed` do Stripe só
  dispara na primeira compra — notificar `RENEWAL` no RevenueCat daria e-mail de
  renovação de loja e nenhum da web. Para cobrir renovação é preciso tratar
  `invoice.payment_succeeded` no Stripe primeiro.
- ⚠️ **A notificação NUNCA pode lançar exceção.** Ela roda em `try/catch`
  próprio, *depois* da concessão, e falha em silêncio no log. Se o erro
  escapasse, o webhook devolveria 500, o processador re-tentaria o evento
  inteiro e o re-envio criaria um **segundo `Payment`** e concederia o acesso de
  novo. Vale para os dois trilhos.
- A modalidade nunca é inferida por valor: no Stripe vem de
  `session.metadata.plan`; no RevenueCat, do `event.product_id` (a loja não
  manda duração em campo próprio — `period_type` é NORMAL/TRIAL/INTRO).

### Onde o conteúdo pago é bloqueado

Desde 09/08/2026 a cobrança acontece **na fase, não na listagem**:

- **`Modules` é aberta a todo mundo.** O usuário gratuito vê a trilha inteira,
  com os nomes reais dos módulos. É a vitrine do que a assinatura vende — antes
  ele era mandado para o `Upgrade` sem ver nada.
- **`ModuleDetail` é quem cobra.** A checagem fica logo depois do
  `setPhase(foundPhase)` e **antes** do `selectAndCombineCases`: `Module` e
  `Phase` já foram lidos (a tela de bloqueio diz o nome do que a pessoa tentou
  abrir), mas nenhum caso de ECG chega ao navegador de quem não assinou. Subir
  ou descer essa checagem quebra uma das duas coisas.
- **`ConteudoECG` tem gate próprio**, independente deste.
- **`LearningTrail` não sabe o que é plano.** O único cadeado dela é o de
  progressão (módulo anterior completo, fase anterior concluída). Não devolva a
  prop `isPremium`: com ela todos os módulos ficam `isLocked`, nenhum nó recebe
  `<Link>`, e o usuário gratuito não consegue nem clicar para chegar ao paywall.
- O nome do **módulo** nunca é mascarado; o da **fase** é, enquanto bloqueada.
  Mascaramento é cosmético — os nomes reais já estão nas props (ver §8).

⚠️ **A regra de plano estava duplicada em três lugares, e mudar a tela não
bastou.** O item "Módulos" do menu (`Layout.jsx`) e o card de Módulos do
Dashboard mobile apontavam para `Upgrade` quando `!isPremium`: o usuário
gratuito ia parar nos planos sem nunca chegar à trilha, e a tela recém-liberada
parecia não ter funcionado. **Ao mover qualquer paywall, varra os pontos de
entrada, não só a página.** É o mesmo formato da armadilha de RLS da §4 — a
barreira que sobra é a que ninguém lembrou que existia.

### Plano vitalício

Pagamento único de R$400, acesso permanente. **Oferta privada:** não aparece no
paywall e não é linkada de lugar nenhum — só chega quem tem a URL `/vitalicio`.
Limite de vagas na env `LIFETIME_VAGAS` (padrão 100). Elegível quem **não tem
plano pago** no momento da compra — `subscription_type: 'free'` **ou** em acesso
de cortesia (16/08/2026: antes era só `'free'`). Quem está experimentando é o
público da oferta, e recusá-lo mandava de volta ao paywall a pessoa mais perto de
comprar. A trava vive no `createStripeCheckout`, no backend, porque o link
circula por WhatsApp.

**Só web/Stripe.** Fora das lojas de propósito: a ponte Despia do iOS só aceita
assinatura, e o Android exigiria one-time product no Play Console.

**No Perfil, o vitalício não depende de function.** O card "Acesso Vitalício" é
desenhado a partir de `lifetime_access`, que já chega na `Account` pelo
`getCurrentUser`; o `getUserSubscriptionInfo` só **enriquece** com valor pago e
data da compra, que moram no `Payment`. Se ele falhar, o card fica de pé sem a
linha "Valor Pago"; se ele discordar da flag, a `Account` vence. Feito assim em
24/08/2026 porque o contrário já falhou em produção: com a tela dependendo da
chamada, uma falha qualquer rebaixava o comprador a assinante mensal manual (§9).

> ⚠️ **Ler o invariante 8 do [`ARQUITETURA_AUTH.md`](ARQUITETURA_AUTH.md) antes
> de tocar em qualquer caminho que escreva `subscription_type: 'free'`.**
> `lifetime_access` não concede acesso — ele impede o rebaixamento. Três guards
> dependem disso e `grep -rn "INVARIANTE lifetime_access" base44/` tem que
> continuar achando os três.
>
> O mesmo vale para o **invariante 9** (`trial_ends_at`, acesso de cortesia) ao
> escrever `'premium'`. **`npm run check:invariantes` confere os dois de uma vez
> e falha se um caminho novo esquecer** — rode antes de commitar qualquer coisa
> que mexa em assinatura.

### Acesso de cortesia (16/08/2026)

Premium por tempo limitado, concedido pela tela `AdminTrials` (web, só admin),
individualmente ou em lote com filtros. Quem concede acesso continua sendo
`subscription_type`; `trial_ends_at` só diz até quando.

**A cortesia acaba no `getMyAccount`** — não há cron nesta plataforma, e ele é o
único ponto por onde toda tela passa. A varredura `adminExpireTrials` é higiene
de relatório, não de acesso.

**Nunca conceda cortesia a quem paga** (a function recusa): a marca faria o
acesso do assinante vencer. Ver invariante 9 e a auditoria `auditTrialInvariants`,
cujo resultado abre no topo da tela.

**Promoção automática (só iOS):** ativar notificações vale N dias, pela function
`promocoes`. Liga e desliga pela env **`PROMO_PUSH_DIAS`** no Base44 — ausente ou
`0` desliga na hora, sem deploy; `7` liga valendo 7 dias. Quem confirma que a
pessoa ativou é o servidor, consultando o OneSignal pelo `external_id`
(= `Account.id`) — nunca o app, que por construção não sabe. Detalhes e
armadilhas em [`ARQUITETURA_AUTH.md`](ARQUITETURA_AUTH.md) §4.

**Ela NÃO é retroativa:** só ganha quem concede a permissão depois de a campanha
estar no ar. Quem já tinha notificações ativas não vê oferta nenhuma. O corte é
pelo fluxo porque a API do OneSignal não expõe quando a permissão foi dada —
e o campo que existiria marcaria o primeiro open do app, não o aceite.

**Resgate por reconciliação, não só no gesto.** O resgate dentro do clique cobria
UM caminho, e três situações reais ficavam de fora — nas três a pessoa cumpre o
combinado e não recebe nada:

1. **Liberou pelos Ajustes** — o único caminho de quem já recusou. Voltava com a
   permissão dada, o componente via `concedida`, escondia o banner e nunca
   resgatava. Com a insistência discreta apontando para os Ajustes, isso deixou
   de ser borda e virou o caminho principal.
2. **Demorou mais de 10s** para tocar em "Permitir": o laço desiste e conclui
   "não concedeu", mesmo que a permissão venha logo depois.
3. **O OneSignal ainda não sabia** — a inscrição leva um tempo para refletir a
   permissão recém-dada, a verificação voltava `sem_inscricao` e não havia
   segunda tentativa.

O `reconciliarPromoPush` fecha os três com uma regra só: se um carregamento
anterior VIU esta pessoa sem permissão e agora ela tem, a permissão foi concedida
no meio — que é exatamente o gesto que a promoção paga. **Não vira retroativa:**
quem já tinha push nunca foi observado sem permissão, logo nunca tem a marca. A
testemunha continua sendo o app; só passou a atravessar carregamentos em vez de
viver dentro de um clique. Quem confirma segue sendo o servidor, contra o
OneSignal.

Falha por `sem_inscricao` **mantém** a marca (é a segunda tentativa); recusa
silenciosa (desligada, já resgatou, já premium) apaga. Teto de 5 tentativas para
uma vinculação quebrada não virar uma requisição por carregamento, para sempre.

**Reclamou que não recebeu? Aba Diagnóstico**, na tela de cortesias: informe o
e-mail e ela mostra a cadeia inteira (campanha, conta, elegibilidade, e o que o
OneSignal respondeu de verdade), terminando num veredito. Quando a inscrição está
confirmada, um botão libera os dias para aquela pessoa — é o único jeito de
alcançar quem já tinha push ativo, já que no iOS não dá para refazer o gesto de
autorizar (ver §6). A verificação no OneSignal continua valendo nesse caminho.

⚠️ **A promoção não funciona enquanto o binário do Despia não tiver o OneSignal
embutido** — sem subscription lá, ela recusa todo mundo. Confira uma subscription
real no painel do OneSignal antes de ligar a variável.

Estorno: `charge.refunded` **total** revoga o acesso (direito de arrependimento
do CDC); **parcial não revoga**. A cobrança é identificada como vitalícia pelo
registro em `Payment` (`payment_method: 'STRIPE_LIFETIME'`, casado pelo
PaymentIntent), nunca pelo valor — R$400 colide com o limiar que separa mensal
de anual. A revogação **não é instantânea**: o evento leva segundos e o painel
mostra cache, então conferir na hora mostra o estado antigo.

**A contagem de vagas não é atômica** e não há como torná-la: o SDK do Base44
não tem update condicional, unicidade nem transação. A trava existe só na
criação da session e o webhook **nunca** nega acesso por vaga esgotada — se o
evento chegou, o dinheiro já foi cobrado. Vender 101 é aceito de propósito.
- RevenueCat: projeto `projc13a06e9`, entitlement **"PlayECG Pro"**, produtos
  `premium:monthly` / `premium:annual`.
- Webhook RevenueCat autenticado por header `Authorization` **cru** (sem
  "Bearer"), secret `REVENUECAT_WEBHOOK_AUTH`. O
  `createClientFromRequest(req)` do SDK rejeita header sem "Bearer" — por isso o
  SDK é inicializado **depois** da checagem custom, com o header removido do
  request.
- Cupons no iOS: **só via Apple Offer Codes.** O campo de cupom do Stripe é
  escondido no iOS via `!isIOSNativeApp()`.
- Não existe desconto perpétuo na Apple nem no Google. Só o Stripe suporta
  duração `forever`.

Secrets em uso no Base44: `STRIPE_SECRET_KEY`, `REVENUECAT_SECRET_KEY` (sk_, v1),
`REVENUECAT_WEBHOOK_AUTH`, `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`.

Variáveis de configuração (não são segredos): `LIFETIME_VAGAS` (padrão 100),
`PROMO_PUSH_DIAS` (ausente/`0` = promoção de notificações desligada).

Secret **opcional**: `ONESIGNAL_ORG_API_KEY` (Organization API Key, em Keys &
IDs). Só serve à contagem de inscritos do `adminPushStats` — ver §6. Configure-a
apenas se o card do App iOS acusar 401/403; sem ela nada mais deixa de funcionar.

---

## 6. iOS — Despia

- Wrapper: **Despia**. Builds saem sempre do dashboard do Despia, nunca do Base44.
- `isIOSNativeApp()` detecta `despia-iphone` / `despia-ipad` no user agent.
- Compra: `despia("revenuecat://purchase?external_id={userId}&product={productId}")`.
- Storage Vault: `setvault://` / `readvault://` com `locked=true` (Face ID).
- Ponte OAuth: navegador nativo → `public/native-callback.html` → deeplink
  `playecg://oauth/auth?code=...` → watcher no `Auth.jsx`.

**App Store Connect rejeita silenciosamente upload de versão já publicada.**
Se um build não aparece no TestFlight, o motivo é quase sempre esse — suba o
`versionName` (botão "Small" do Despia).

### Safe-area: por que o topo volta para debaixo da câmera (27/08/2026)

**A regra: meça a reserva, não a suponha.** Duas tentativas foram ao ar e
falharam no aparelho no mesmo dia, as duas por apostar no que o wrapper do
Despia faz em vez de olhar. Primeiro o app tomou a reserva para si e tentou
zerar a margem que o "Auto Inject Safe Area" injeta no body — perdeu a corrida
(a margem chega quando o runtime quer) e sobraram **dois entalhes** de espaço.
Depois o app parou de reservar dentro do Despia, confiando na margem do wrapper
— e o conteúdo apareceu **cortado no topo** em Módulos, Troféus, Aprenda ECG e
Perfil, ou seja, a margem não estava fazendo o trabalho inteiro.

Hoje o [safeArea.js](src/utils/safeArea.js) lê os dois números no boot e reserva
só a diferença:

```
falta = max(0, entalhe − margem que o wrapper já pôs)
```

Não importa se o wrapper empurra tudo, um pedaço ou nada: a soma dá sempre um
entalhe. **O padrão do CSS é reservar o entalhe inteiro, e a medição só tira o
excesso** — se ela atrasar ou falhar, sobra espaço em vez de faltar. Espaço a
mais é feio; espaço a menos corta conteúdo. Não há checagem de plataforma: fora
do app a margem é zero e a mesma conta devolve o de sempre.

**`env(safe-area-inset-*)` não vale dentro do Despia.** O runtime deles não
popula as variáveis de ambiente do padrão CSS: injeta custom properties próprias,
`--safe-area-top` / `--safe-area-bottom`, e a documentação manda usar `var()`,
não `env()`. O app inteiro estava escrito com `env()` — no iPhone toda reserva
caía no fallback `0px`. *Como se sabe:* documentação do Despia
(`setup.despia.com`), lida em 27/08/2026.

As variáveis, e qual usar ([index.css](src/index.css)):

| Variável | Para quem | Valor |
|---|---|---|
| `--app-safe-top` | **só** `fixed` / `sticky` | o entalhe real |
| `--app-safe-top-fluxo` | conteúdo normal | o que falta reservar (medido) |
| `--app-margem-wrapper` | alturas de tela cheia | o que o wrapper tomou (medido) |

**Margem de body não alcança `fixed` nem `sticky`.** Esses se ancoram na
viewport, então nenhuma reserva do wrapper chega neles — é por isso que a faixa
que cobre o entalhe e o header grudento do Dashboard usam `--app-safe-top`
direto. Foi o defeito original: o header do Dashboard sumia debaixo do relógio
ao rolar, enquanto o resto da tela estava no lugar.

**`100vh` não sabe da margem do wrapper.** Cada `min-h-screen` (são 63 no app)
pede a tela inteira dentro de um espaço que já perdeu parte dela, e sobra
rolagem fantasma em toda tela — basta um toque para a página parar nesse fim de
curso e o topo sumir. Por isso `min-h-screen` é sobrescrito com
`calc(100vh - var(--app-margem-wrapper))`, e a altura do `body` e o `minHeight`
do wrapper mobile descontam o mesmo.

**O rodapé é do wrapper inteiro, e continua sendo.** A barra de baixo já estava
certa antes de tudo isto; reservar o indicador de home também pelo app descolou
a barra do fim da tela. `<nav>`, botão flutuante e Home usam
`env(safe-area-inset-bottom)`, que dentro do Despia resolve `0px` de propósito.
**Não "conserte" o rodapé por simetria com o topo:** esse foi um dos erros.
*Como se sabe:* prints do aparelho, antes e depois.

**Padding no topo de algo que rola não protege nada.** No primeiro gesto o
padding sobe junto com o conteúdo e o texto reaparece debaixo do relógio. Quem
cobre o entalhe tem que ser um elemento **fixo**; padding só reserva espaço em
fluxo. Pelo mesmo motivo, cabeçalho grudento gruda em `top: var(--app-safe-top)`,
nunca em `top: 0`. *Como se sabe:* observado no iPhone em 06/08/2026 — foi o que
4dbeba7 quebrou, e f09f27f já explicava.

**A cor da faixa acompanha o que está abaixo dela.** Faixa branca sobre tela de
fundo cinza vira uma tarja no alto. O padrão é o cinza do wrapper (`#F2F2F2`);
o Dashboard é a exceção, porque o header branco dele encosta na faixa.

**Uma reserva por tela, nunca duas.** O `<main>` do [Layout.jsx](src/Layout.jsx)
reserva o topo de todas as telas que passam por ele — tela que reserva de novo
soma. Era o caso de AprendaECG e ConteudoECG.

### Push nativo: o que só se aprende testando (19/08/2026)

**Permissão de notificação decidida NÃO reabre o prompt — e isso quebra o teste
óbvio.** Desligar as notificações nos Ajustes do iPhone e tentar reativar pelo
app *não* recria o fluxo de primeira ativação: o iOS responde "negado" na hora,
sem diálogo, o `pedirPermissaoNativa` gasta os 10s do laço e conclui
"não concedida". Reativar pelos Ajustes também não serve — aí o app já vê
"concedida" e pula a etapa. **Para testar um fluxo que depende do gesto de
autorizar, só reinstalando o app ou usando um aparelho virgem.** Trocar de conta
no mesmo iPhone não adianta: a permissão é do app, não da conta. Foi isso que
impediu de testar a promoção de push com um usuário que já tinha ativado, e é
por isso que a tela de cortesias ganhou o `resgatar_admin`.

**Quem recusou continua sendo cobrado — discretamente.** O Despia devolve um
booleano só, então `estadoDaPermissaoNativa` não distingue "nunca perguntou" de
"já recusou": as duas viram `nao_concedida`. Sem memória, a tela tratava quem
recusou como quem nunca foi perguntado e repetia o convite inteiro, com um botão
que no iOS **não pode mais dar certo** — o prompt não reabre, e o laço de 10s do
`pedirPermissaoNativa` só entregava espera. O
[`memoriaPush.js`](src/lib/memoriaPush.js) guarda o que o app observou e o banner
passa a mostrar uma **linha fina** que leva direto aos Ajustes. Sem X: notificação
desligada é canal perdido, e uma linha custa pouco de quem não quer.

⚠️ **Duas marcas, e elas não são a mesma coisa.** `visto_sem_permissao` é gravada
pela simples OBSERVAÇÃO e é a testemunha da transição (usada pela promoção);
`pedido_recusado` só é gravada quando a pessoa TOCA no botão e não concede, e é
só ela que troca o convite pela linha discreta. Marcar a forma discreta pela
observação faria o convite nunca aparecer — na primeira visita, quem nunca foi
perguntado também está `nao_concedida`.

**A cortesia agora é reconciliada, e não só resgatada no gesto.** Ver §5.

**Para saber se o binário do Despia tem o SDK do OneSignal, olhe o banner.** Se
o banner de notificações aparece no app, o comando `checkNativePushPermissions://`
respondeu — logo o SDK está compilado. Se não tivesse, o estado seria
`indeterminado` e o componente renderizaria nada (ver
[pushNativo.js](src/utils/pushNativo.js)). É um teste de cinco segundos que
substitui a espera pelo painel. *Como se sabe:* observado numa foto do aparelho,
com o banner visível, quando ainda se supunha que o rebuild não tinha saído.
Cuidado com o limite dessa inferência: ela prova que a ponte processa o comando,
não que a vinculação do `external_id` está gravando — isso só o painel do
OneSignal (Audience → Subscriptions) confirma.

### Quantos iPhones a gente alcança

O card **App iOS** na tela de Notificações Push responde isso, pela function
`adminPushStats`, e o número vem do OneSignal — nunca de contador nosso: a
verdade sobre a permissão mora no aparelho, e o app não sabe (ver
[pushNativo.js](src/utils/pushNativo.js)). Contador alimentado pelo cliente
contaria intenções e ficaria mudo quando alguém revogasse a permissão nos
Ajustes sem reabrir o app.

- **`messageable_players`** = podem receber agora. É o número grande.
- **`players`** = registros de aparelho. **NÃO é "quantos já autorizaram"** — em
  app mobile a Subscription nasce quando a pessoa **abre** o app, antes de
  qualquer permissão. A diferença entre os dois mistura quem nunca autorizou,
  quem desligou depois, quem desinstalou e **reinstalações** (que criam registro
  novo e não apagam o velho).
- Por isso `players` é **denominador ruim**: só cresce, e o mesmo iPhone pode
  estar contado três vezes. "8 de 38" não é taxa de conversão. A taxa honesta sai
  da varredura, que conta contas.
- São **registros de aparelho** — não pessoas. iPhone + iPad da mesma pessoa
  contam dois.
- Como o app do OneSignal só tem iOS configurado, esse número já é a contagem de
  iPhones: não há filtro de plataforma, e é bom que não haja — filtro por user
  agent é palpite.

**Falha nunca vira zero.** Chave errada ou rede fora pintam o card de âmbar com o
status HTTP, porque número não lido é ausência, não ausência de inscritos — é a
mesma armadilha que o `recipients` armou uma vez (ver `sendOneSignalPush`).

**"Ver quem tem push ativo"** é outra coisa: uma varredura conta a conta, N
chamadas ao OneSignal, em lotes de 100 costurados pela tela. Só sob clique, e o
critério é o MESMO do `promocoes` (iOSPush inscrita) — se divergir, a tela conta
gente que a promoção recusa e a diferença não terá explicação. A lista serve para
mirar o envio: sem ela, o e-mail do destinatário iOS tinha de ser digitado de
cabeça, porque a lista antiga é de Web Push, público disjunto.

Ela separa **"abriu e não autorizou"** (existe no OneSignal) de **"nunca abriu o
app iOS"** (404), e é dessa separação que sai a única taxa confiável da tela:
autorizados ÷ quem abriu o app. Juntar os dois num "sem push" só faria o
denominador virar a base inteira — misturando quem recusou com quem nunca teve a
chance, que são problemas opostos: banner que não convence versus app com pouco
alcance.

Páginas públicas exigidas pela Apple/Google: `/termos`, `/privacidade`,
`/suporte`, `/excluir-conta`. Links externos não abrem na WebView do Despia —
por isso tudo é hospedado em `playecg.app`.

---

## 7. Android — Capacitor

- Capacitor 8, `appId: com.playecg.app`, `server.url: 'https://playecg.app'`.
- `launchMode: singleTop` — evita cancelar a compra do RevenueCat quando o app
  de pagamento redireciona (relevante no Brasil).
- `targetSdk: 36` (obrigatório desde agosto/2026). minSdk subiu de 22 para 24 na
  versionCode 3.
- Build:
  ```powershell
  npm run build
  npx cap sync android
  cd android; .\gradlew.bat bundleRelease
  # → android/app/build/outputs/bundle/release/app-release.aab
  ```
- `versionCode` precisa ser incrementado **antes** de cada `bundleRelease`.
  O Play Console nunca aceita o mesmo versionCode duas vezes, mesmo que o
  anterior tenha sido rejeitado. Para promover entre faixas, use
  **"Add from library"** — re-upload do mesmo AAB é bloqueado.
- Play Console account ID `9082959751673618602` (tipo Organização — isento do
  requisito de 12 testadores/14 dias do Open testing; pode ir de Closed testing
  direto para Produção).
- Conta de teste dedicada: `playecg.review@gmail.com` (premium manual, 2FA off).

⚠️ **A branch `android-capacitor` está 6 commits atrás da `main` e PRECISA ser
rebaseada antes de qualquer merge** — senão o merge deleta `/termos`,
`/privacidade` e `/suporte`, que são exigidos pela Apple.

---

## 8. Bugs abertos e dívidas conhecidas

### Dívidas registradas (não agir sem decisão)

- **`ECGCase`, `Module`, `Phase`, `Coupon` têm RLS `read:{}`** — legíveis sem
  autenticação nenhuma. (`Phase` conferido em `base44/entities/Phase.jsonc` em
  09/08/2026; faltava nesta lista.) Todo o conteúdo pago vaza (~1MB de
  `ECGCase` baixável com o app id). É por isso que o mascaramento de nome de
  fase na trilha (§5) é enfeite, não barreira: os nomes reais viajam inteiros
  na resposta e ficam visíveis no DevTools.
  Fechar isso obriga a mover as leituras para backend; fazer **depois** do auth,
  não antes. As imagens estão em `/files/mp/public/`, então fechar o RLS da
  entidade sozinho não basta.
- `full_name` só é gravado na criação da `Account`; troca de nome no provedor
  nunca atualiza.
- JWT vale 30 dias e não há revogação.
- `updateUserProgress` autentica mas não valida que `body.user_email` bate com o
  usuário autenticado antes de gravar via service role.
- `onUserCreated` não valida quem chama.
- `AdminUsers.jsx:583` lê `user.streak_days`, campo inexistente (provável typo de
  `current_streak`); mostra sempre 0.
- Entidade `Coupon` sem RLS deny-all; `used_count` sujeito a race condition;
  falta ledger `CouponRedemption` para garantir `one_per_user`.
- **`getUserSubscriptionInfo` carrega a tabela `Payment` inteira**
  (`Payment.list('-created_date')`, sem filtro) a cada abertura do Perfil — e faz
  isso **antes** de checar `lifetime_access`, então uma falha ao listar pagamentos
  derruba a resposta de quem nem depende de pagamento. É também a única function
  cujo `resolveIdentity` busca a `Account` com o e-mail **sem** normalizar
  (`trim().toLowerCase()`, como fazem `getMyAccount`, `ensureMyAccount` e
  `updateMyProfile`): conta cujo e-mail esteja gravado em caixa diferente toma 401
  só nela. São os dois suspeitos do incidente de 22/08/2026 (§9) — nenhum
  confirmado, porque o log da function não foi consultado. Desde 24/08 nada disso
  quebra a tela, só esconde o valor pago do vitalício. (Lido no código, 24/08/2026.)
- **O app é claro por design e não pode ganhar modo noturno por acidente.** As
  telas usam ~770 cores hardcoded (`text-gray-600`, `text-gray-900`, `bg-white`)
  espalhadas por 44 arquivos. O bloco `.dark` do `src/index.css` existe e está
  inerte. Qualquer coisa que ative tema escuro — `next-themes`, media query,
  classe no `<html>` — troca só os tokens (`--background`, `--card`,
  `--foreground`) e deixa o texto hardcoded escuro sobre fundo escuro. Por isso
  `App.jsx` fixa `forcedTheme="light"`. Só relaxar isso **depois** de migrar as
  cores para tokens semânticos. (08/08/2026 — contado por grep e medido no
  navegador.)

---

## 9. Armadilhas já pagas caro

- **Merge em `main` é deploy OTA.** Review de diff já pegou botão dentro de
  `<div hidden>`, clone local 3 commits atrás e handler no formato errado.
- **Datas de "Ready to send for review" no Play Console são não confiáveis.**
  Toda declaração precisa ser auditada manualmente, mesmo marcada como completa.
- **Checkmarks verdes do Data safety significam "visitado", não "correto".**
  Só a aba Preview (passo 5) mostra o que foi realmente declarado.
- **O Base44 empurra sozinho para o GitHub** o que você cria no editor visual.
  Criar o mesmo arquivo localmente sem checar gera duplicata.
- **VS Code trava a pasta `android/`.** Git de troca de branch só em PowerShell puro.
- **Safe-area do iPhone: `env(safe-area-inset-*)` não vale dentro do Despia**, e
  padding no topo de algo que rola não protege o conteúdo. As duas coisas juntas
  já fizeram o topo do app voltar para debaixo da câmera mais de uma vez. Ver §6.
- Se o `gradlew` baixar o Gradle "agora", é sinal de que o build nunca rodou
  naquela máquina — a tarefa anterior não foi executada de verdade.
- **Sintoma que só aparece com o modo escuro do sistema não é culpa do wrapper.**
  Em 08/08/2026 o Quiz e o Perfil ficaram ilegíveis no iPhone. Culpei primeiro o
  auto-dark do WebView Android, depois o Despia — duas correções foram ao ar sem
  nenhum efeito. A causa era JS da própria página: `next-themes` com
  `defaultTheme="system"` punha `class="dark"` no `<html>`. O que discrimina em
  30 segundos, antes de tocar em qualquer código: **carregar a página com
  `prefers-color-scheme: dark` e ler `document.documentElement.className`.** Se a
  classe muda, é a página; o wrapper não entra na conta.
- **`Set-Content` do PowerShell 5.1 corrompe acentos.** Editar arquivo por
  `Get-Content -Raw` + regex + `Set-Content -Encoding utf8` reescreveu um script
  inteiro em mojibake (`—` virou `â€"`), e o estrago só apareceu quando uma regex
  que dependia do travessão parou de casar. Num projeto todo em português, isso
  atinge quase qualquer arquivo. Use as ferramentas de edição do agente, não o
  shell. Para conferir, `iconv -f UTF-8 -t UTF-8 <arquivo>` é confiável —
  `grep 'Ã'` **não é**: em modo byte, ele casa com travessão UTF-8 legítimo e
  acusa arquivo são. (16/08/2026, medido.)
- **Grep em `src/` não enxerga comportamento que mora em `node_modules`.** No caso
  acima, quem mexia na classe do `<html>` era a lib; o `src/App.jsx` só declarava
  `attribute="class"`. Buscar pelo mecanismo (`classList`, `documentElement`) deu
  zero resultado e me fez descartar a hipótese certa. Procure também pela
  intenção — o nome da lib, a prop de configuração.
- **Fallback de tela que inventa dado é pior que tela de erro.** Em 22/08/2026 um
  comprador do vitalício viu, um minuto depois de pagar R$400, o Perfil anunciar
  "Premium — R$ 10,00/mês", "Forma de Pagamento: Manual", duas "Invalid Date" e um
  convite a falar com o suporte para cancelar. **Nada disso veio do backend:** era
  o `catch` da própria tela, que diante de qualquer falha do
  `getUserSubscriptionInfo` montava uma assinatura inteira, com um preço legado
  (R$10, de anos atrás) e datas tiradas de um state ainda vazio — `new
  Date(undefined)` devolve um Date *truthy* cujo conteúdo é NaN, e a guarda da
  tela só testava `null`. O dado inventado é indistinguível do real para quem
  olha. **O que discrimina em 30 segundos:** um número que o backend não tem como
  produzir (aqui, R$10 — ele só devolve 59, 400 ou o valor do `Payment`) é
  assinatura de fallback do frontend, não resposta de function. Corrigido em
  24/08/2026: falha virou caixa de erro com "tentar de novo". Se encontrar outro
  `catch` que preenche a tela com valores plausíveis, é bug — o próprio
  `getUserSubscriptionInfo` ainda afirma "R$59 Manual" para premium sem `Payment`.

---

## 10. Como trabalhar comigo

Não sou dev de carreira. Orquestro por prompts e reviso por diff/screenshot.

- Honestidade sobre risco. Não romantizar complexidade.
- **Uma incógnita por vez.** Passo a passo com checkpoints.
- **Investigar antes de executar.** As falhas reais deste projeto apareceram em
  rodadas de leitura, não de código.
- Quando houver decisão de arquitetura com efeito irreversível em produção:
  apresente as opções com custo e risco, recomende, **mas não escolha por mim**.
- Ao final, liste as perguntas cuja resposta você não tem e que mudariam o plano.

---

## 11. Contatos e recursos

- Email no app: `ecgdescomplica@gmail.com` (forwarder `adm@playecg.app` via
  Namecheap → Gmail)
- Domínio `playecg.app` — DNS no Namecheap (Advanced DNS)
- Páginas públicas: `/privacidade`, `/termos`, `/suporte`, `/excluir-conta`

## 12. Manutenção deste README
 
Este arquivo é a base comum entre mim e qualquer agente que entre no projeto. Ele só cumpre esse
papel se for atualizado — e só continua confiável se for atualizado com critério.
 
### Quando registrar
 
Registre quando descobrir algo que **contradiz o que está escrito aqui**, ou algo que **custou um
bug, um build perdido ou uma rejeição de loja**.
 
Não registre: resumo do que você fez na sessão, plano que não foi executado, suposição não
verificada, ou detalhe que já está na fonte canônica do assunto.
 
O teste: *se o próximo agente não souber disso, ele repete o erro?* Se sim, registre. Se não, o
lugar é a mensagem de commit.
 
### Onde registrar
 
**Se o assunto tem documento canônico, escreva lá, não aqui.** Auth vive em
`ARQUITETURA_AUTH.md`; o README só aponta. Duplicar conteúdo cria duas verdades que divergem — é
o mesmo princípio que governa a `Account` e o `User`.
 
Se o aprendizado contradiz uma seção existente do README, **corrija a seção** — não acrescente
uma nota ao lado. Duas afirmações opostas no mesmo arquivo são piores que uma desatualizada,
porque o leitor não sabe qual vale.
 
Se não se encaixa em nenhuma seção, use o **Registro de aprendizados** abaixo.
 
### Como registrar
 
- Diga **como você sabe**: leu o código, rodou em aparelho, viu no painel, ou deduziu. "Deduzido"
  é registro válido — desde que marcado como tal.
- Data em tudo. Fato sem data envelhece sem avisar.
- Nenhum segredo, nunca. Vale a mesma regra da §0.
- A alteração do README entra no mesmo commit do trabalho que a originou, na mesma branch. Passa
  pelo mesmo review de diff. **Não é exceção à regra de não commitar em `main`.**
- Se um documento foi aposentado por outro, diga isso no topo do aposentado. O
  `ARQUITETURA_AUTH.md` faz isso com o `AUDIT_AUTH.md` — copie o padrão.
### Registro de aprendizados
 
Só o que não coube em nenhuma seção. Mais recente no topo.
 
| Data | O que se descobriu | Como se sabe |
|---|---|---|
| 09/08/2026 | **O sync com o Base44 carrega schema de entidade, não só código.** Campo novo declarado em `base44/entities/*.jsonc` aparece no painel sozinho depois do merge. Não é preciso recriar nada à mão nem por prompt. | Merge do PR do vitalício: `lifetime_access` apareceu no Schema Editor da `Account`, com a descrição inteira, sem ninguém tocar no painel. |
| 09/08/2026 | **Campo novo com `default` NÃO preenche registro que já existia.** O banco é Mongo: ler `undefined` num registro antigo é o esperado, não sinal de que o schema falhou. Testar campo novo lendo registro velho não distingue as duas coisas — teste escrevendo e lendo de volta. | Custou um alarme falso: `lifetime_access` voltou `undefined` numa Account antiga e eu tratei como falha de deploy; o campo estava no painel o tempo todo. |
 