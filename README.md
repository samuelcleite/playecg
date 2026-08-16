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
  julho/2026. Os dois webhooks escrevem nele.
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
Limite de vagas na env `LIFETIME_VAGAS` (padrão 100). Elegível só quem está
`subscription_type: 'free'` no momento da compra; a trava vive no
`createStripeCheckout`, no backend, porque o link circula por WhatsApp.

**Só web/Stripe.** Fora das lojas de propósito: a ponte Despia do iOS só aceita
assinatura, e o Android exigiria one-time product no Play Console.

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
`REVENUECAT_WEBHOOK_AUTH`.

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
- **Grep em `src/` não enxerga comportamento que mora em `node_modules`.** No caso
  acima, quem mexia na classe do `<html>` era a lib; o `src/App.jsx` só declarava
  `attribute="class"`. Buscar pelo mecanismo (`classList`, `documentElement`) deu
  zero resultado e me fez descartar a hipótese certa. Procure também pela
  intenção — o nome da lib, a prop de configuração.

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
 