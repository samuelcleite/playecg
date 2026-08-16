# Autenticação e backend do PlayECG

> Atualizado em 2026-07-29, depois da migração do login hospedado do Base44 para auth próprio.
>
> **Este documento substitui o `AUDIT_AUTH.md`**, que era a fotografia do dia 26/07 — o mundo
> *anterior* à migração. Aquele documento descrevia `base44.auth.me()` em toda tela, o `User`
> como registro do usuário e RLS por `{{user.email}}`. Nada disso vale mais.
>
> Escrito com o app Android em mente: a seção 6 lista o que é específico do iOS/Despia e
> precisa de equivalente. O resto vale para qualquer cliente.

---

## 1. O modelo em uma página

**A `Account` é o registro único do usuário.** Ela guarda credencial (`google_id`, `apple_id`,
`password_hash`), perfil (`full_name`, `specialty`, cidade/estado), assinatura
(`subscription_type`, `subscription_start_date`) e agregados de progresso (`points`, `level`,
`current_streak`, contadores de acerto).

**O `User` do Base44 está congelado.** Ele ainda existe, mas nada escreve nele desde o corte.
Serve só para uma coisa: administradores entram pelo login hospedado do Base44, e é essa sessão
que concede `role: 'admin'`.

**Duas credenciais abrem a porta, uma só fonte de dados.** O backend aceita tanto o JWT próprio
quanto a sessão hospedada, e nos dois casos lê e escreve na `Account`.

```
Google/Apple ──► JWT próprio (HS256, 30 dias) ─┐
                                                ├──► resolveIdentity ──► Account
Login hospedado do Base44 ─────────────────────┘        (email, role)
```

`role` **nunca** vem do JWT: no caminho JWT ele é sempre `'user'`, hardcoded. Admin existe
exclusivamente pela sessão hospedada. Isso é decisão de arquitetura, não limitação.

---

## 2. `resolveIdentity` — o contrato de identidade

Helper copiado **inline em cada function** (o Base44 não tem código compartilhado entre
functions; a duplicação é intencional). Ele:

1. Lê o header `Authorization: Bearer <token>`.
2. Tenta validar como JWT HS256 assinado com `JWT_SECRET`. Se válido → `{ email, role: 'user', source: 'jwt' }`.
3. Senão, tenta `base44.auth.me()` dentro de `try/catch` → `{ email, role: <role do User>, source: 'base44' }`.
4. Falhou tudo → `null`, e quem chama devolve 401.

O `try/catch` do passo 3 não é decorativo: `auth.me()` **lança** quando o Bearer não é dele, em
vez de devolver null.

**Regra inviolável:** o dono de um registro vem **sempre** de `identity.email`, nunca do corpo da
requisição. Sob JWT não existe sessão Base44, então o RLS não protege nada — o filtro explícito
por `identity.email` é a única barreira entre um usuário e os dados dos outros.

---

## 3. O que um cliente precisa implementar

Este é o contrato mínimo para qualquer app (iOS, Android, web).

### 3.1 Obter o token

`POST googleAuthUrl { deeplink_scheme }` → devolve a URL de OAuth do Google.
O usuário autentica; o retorno traz `?code=`.

`POST googleSignIn { google_code }` → `{ token, account }`.
`POST appleSignIn { apple_id_token, full_name }` → `{ token, account }`.

### 3.2 Guardar **e aplicar** o token

Guardar não basta. **O token precisa ser aplicado ao cliente HTTP**, senão as requisições
seguintes continuam indo com a credencial anterior — e o backend identifica a pessoa errada, sem
nenhum erro visível. Foi assim que um login correto exibiu o perfil de outro usuário.

No web/iOS isso é `base44.setToken(token)` mais o token no cofre. Em qualquer cliente, o
equivalente é: gravar **e** trocar o header padrão.

### 3.3 Restaurar a sessão no boot, antes de renderizar

O cliente é construído com o token que existir naquele instante. Se a leitura do armazenamento
seguro for assíncrona (é, no iOS), o app precisa **esperar** antes de montar a primeira tela —
senão a tela inicial aparece deslogada mesmo com sessão válida.

Com um teto de tempo. Se o armazenamento não responder, renderize deslogado: tela branca eterna
é pior do que pedir login de novo.

### 3.4 Resolver o usuário

`POST getMyAccount {}` → `{ account }` — o `auth.me()` deste mundo. A `Account` tem `read: false`
no RLS: nenhum cliente a lê direto, nunca.

Se devolver **404**, o usuário está autenticado mas sem `Account`. Chame
`POST ensureMyAccount {}`, que cria a partir do `User` quando existe. Não trate 404 como erro.

Se devolver **401** com token nosso, ele expirou (valem 30 dias, sem revogação). Apague o token
local, senão o app fica preso num laço de sessão morta.

### 3.5 Sair

Limpe o token **e** encerre a sessão hospedada, se houver. Durante a transição as duas coexistem:
limpar só uma faz o usuário reaparecer logado como a outra identidade.

---

## 4. Superfície de backend

37 functions. As que um cliente de usuário final chama:

### Sessão e perfil
| Function | O que faz |
|---|---|
| `getMyAccount` | Devolve a Account do autenticado. É o objeto de sessão. **Também encerra a cortesia vencida** antes de responder — ver §5.9. |
| `ensureMyAccount` | Cria a Account se faltar. Só chamar no 404 do anterior. |
| `updateMyProfile` | Grava perfil. **Lista branca**: `full_name`, `specialty`, `country`, `state`, `city`, `profile_completed`. Ignora `subscription_type` e `role` de propósito. |

### Progresso e quiz
| Function | O que faz |
|---|---|
| `recordQuizAttempt` | Grava a tentativa **e** atualiza agregados, streak e pontos. Único caminho para registrar resposta. |
| `getMyQuizAttempts` | Tentativas do autenticado. Filtros: `module_id`, `phase_id`, `quiz_type`, `correct`, `sort`, `limit`. |
| `getUserProgress` / `updateUserProgress` | Progresso por fase. |
| `getUserStats` | Agregados prontos: total, acurácia, acurácia em módulo, streak. |
| `getUserAchievements` / `checkNewAchievements` | Troféus. |
| `getDailyCase` | Caso do dia. |

### Assinatura
| Function | O que faz |
|---|---|
| `getUserSubscriptionInfo` | Estado da assinatura e próxima renovação. |
| `createStripeCheckout` | Sessão de pagamento web. |
| `cancelStripeSubscription` | Cancela no Stripe e marca free. **Irreversível.** |
| `syncStoreSubscription` | Pergunta ao RevenueCat se há assinatura de loja ativa e libera premium na hora. Chamar depois de comprar e ao restaurar. |
| `getLifetimeSeats` | Vagas restantes do plano vitalício. Só o número que resta — nem o total vendido, nem o limite. Exige sessão: a oferta é privada. |

### Outros
`savePushSubscription`, `getVapidPublicKey`, `validateCoupon`, `reportCaseError`, `deleteUserAccount`.

### Só admin (sessão hospedada)
`adminListAccounts`, `adminListRecords`, `adminSetSubscription`, `manuallyUpgradeToPremium`,
`sendTestPush`, `exportImagesData`, `migrateUserProgress`, `backfillAccountFromUser`,
`auditUserAccountSync`.

Acesso de cortesia (tela `AdminTrials`, só web):

| Function | O que faz |
|---|---|
| `adminGrantTrial` | Libera premium por N dias. Recusa conta paga e conta vitalícia; concessão repetida soma dias. |
| `adminRevokeTrial` | Encerra a cortesia antes do prazo. Recusa quem não está em cortesia. |
| `adminListTrials` | Lista as concessões com o estado derivado da Account. Só lê. |
| `adminExpireTrials` | Varredura das cortesias vencidas. Higiene de relatório, não de acesso — ver §5.9. |

### Webhooks (sem sessão)
`stripeWebhook` (assinatura HMAC), `revenuecatWebhook` (segredo compartilhado),
`googleAuthUrl`/`googleSignIn`/`appleSignIn` (token do provedor).

---

## 5. Regras que não podem ser quebradas

Cada uma destas custou um bug real. Estão aqui para não custar de novo.

**1. Nenhum cliente lê entidade per-user direto.**
`QuizAttempt`, `Payment`, `CouponUsage`, `PushSubscription`, `UserProgress`, `UserAchievement`,
`DailyQuizStats` e `Account` exigem `__service_only__` no RLS. Toda leitura passa por function.

Conteúdo — `ECGCase`, `Module`, `Phase`, `Content`, `Achievement` — continua legível direto,
porque o RLS é público. *(Isso é uma dívida de segurança conhecida, ver seção 7.)*

**2. RLS negado devolve lista VAZIA, não erro.**
Este é o modo de falha mais perigoso do Base44. Uma leitura sem permissão não estoura exceção —
devolve `[]`, que parece dado legítimo. Já causou: usuário gratuito com acesso ilimitado (a
contagem do limite diário voltava vazia) e conquistas que pararam de desbloquear. **Ao fechar
qualquer RLS, varra frontend E backend.**

**3. O dono vem da identidade, nunca do corpo.**
Com service role o RLS não protege mais nada. `updateUserProgress` já gravava no `user_email` que
o cliente mandasse — bastava trocar o campo para escrever no progresso de outra pessoa.

**4. Guardar credencial ≠ aplicar credencial.** Ver 3.2.

**5. `points` e `level` são calculados em três lugares e precisam concordar.**
Regra: 10 por acerto na primeira tentativa do caso, 3 por acerto em revisão, 0 por erro;
`level = 1 + floor(points/100)`. Vive em `recordQuizAttempt` (incremental),
`backfillAccountFromUser` e `ensureMyAccount` (recálculo). Se divergirem, cada recálculo muda os
pontos de todo mundo.

**6. Ferramenta de migração é perigosa no dia seguinte à migração.**
O `backfillAccountFromUser` copiava perfil e assinatura do `User`. Depois do corte o `User`
congelou — rodá-lo rebaixou dois assinantes de premium para free e desfez uma edição de nome.
Hoje ele só escreve agregados em Account existente. **O nome de uma ferramenta não avisa que as
premissas dela morreram.**

**7. Ao paginar `QuizAttempt`, ordene por `created_date`.**
A eleição da "primeira tentativa por caso" depende da ordem. Sem sort explícito, as taxas de
acerto inflam.

**8. `lifetime_access === true` NUNCA pode ser escrito como `subscription_type: 'free'`.**
Quem concede acesso é `subscription_type`: todas as telas checam `=== 'premium'` e nenhuma sabe
o que é vitalício. O `lifetime_access` não concede nada — ele só **impede o rebaixamento**. É a
combinação dos dois que sustenta o plano vitalício sem alterar uma linha de tela.

O comprador vitalício precisa estar `free` no dia da compra, mas pode ter sido assinante antes.
Meses depois, a assinatura antiga expira em algum lugar e o evento chega — e rebaixaria alguém
que pagou pelo acesso permanente. São três os caminhos que escrevem `'free'` por expiração:
`stripeWebhook` (`customer.subscription.deleted`), `revenuecatWebhook` (`EXPIRATION`) e
`syncStoreSubscription` (RevenueCat sem entitlement ativo — que hoje não escreve, e o guard
está lá para que não comece a escrever). Os três carregam a frase exata
`INVARIANTE lifetime_access` no comentário: **`grep -rn "INVARIANTE lifetime_access" base44/`
tem que continuar achando os três.** Qualquer caminho novo de expiração precisa do quarto.

O `cancelStripeSubscription` também escreve `'free'`, e de propósito não tem guard: ele exige um
`Payment` com `stripe_subscription_id`, que a compra vitalícia não tem, e recusa com 404 antes
de chegar à escrita. Se um dia ele deixar de depender disso, passa a precisar do guard.

Revogar é caminho único e explícito: `charge.refunded` com estorno **total** de uma cobrança
identificada como vitalícia **pelo registro em `Payment`** (`payment_method === 'STRIPE_LIFETIME'`,
casado pelo PaymentIntent), nunca pelo valor — R$400 colide com o limiar que separa mensal de
anual. Estorno parcial não revoga.

**9. `trial_ends_at` marca "este premium vence" — e por isso NUNCA pode ser escrito em quem pagou.**
O acesso de cortesia é o `lifetime_access` de cabeça para baixo. Quem concede continua sendo
`subscription_type`; o `trial_ends_at` só diz até quando. Nenhuma tela sabe o que é um trial —
todas seguem checando `=== 'premium'` — exceto a faixa de aviso
([TrialBanner.jsx](src/components/TrialBanner.jsx)) e o bloco próprio do Perfil.

O perigo é o simétrico do vitalício: carimbar o campo em quem paga faz a expiração rebaixar um
assinante. Duas barreiras seguram isso, nesta ordem:

- **Primária:** todo caminho que promove por pagamento escreve `trial_ends_at: null`. São cinco —
  `stripeWebhook` (assinatura *e* vitalício), `revenuecatWebhook`, `syncStoreSubscription`,
  `manuallyUpgradeToPremium` e `adminSetSubscription` (nas duas direções). Todos carregam a frase
  exata `INVARIANTE trial_ends_at`: **`grep -rn "INVARIANTE trial_ends_at" base44/` tem que
  continuar achando os cinco, mais os dois donos da regra** (`getMyAccount`,
  `adminExpireTrials`). Caminho novo de promoção precisa do sexto.
- **Secundária:** `avaliarCortesia`, a função que decide o rebaixamento, recusa rebaixar quem tem
  `lifetime_access` ou cuja `subscription_start_date` é posterior ao `trial_started_at` — quem
  pagou depois de ganhar. Ela vive copiada em `getMyAccount` e `adminExpireTrials`, e as duas
  cópias precisam concordar, como todo helper duplicado neste projeto.

O `adminGrantTrial` fecha a porta na entrada: só concede a quem está `free` e sem vitalício.

**Onde a cortesia efetivamente acaba é o `getMyAccount`.** Não existe cron nesta plataforma, e o
`getMyAccount` é o único ponto por onde toda tela passa — expirar ali torna impossível usar o app
com cortesia vencida, mesmo que nenhuma varredura rode nunca. O `adminExpireTrials` serve só ao
registro de quem não voltou ao app: rodá-lo não muda o acesso de ninguém que esteja usando o
produto.

---

## 6. O que é específico do iOS/Despia — e precisa de equivalente no Android

O app iOS é uma WebView (Despia). Estes são os únicos pontos que dependem da ponte nativa:

| Uso | Comando Despia | Onde | Situação no Android |
|---|---|---|---|
| Cofre de token | `setvault://` / `readvault://` | [customAuth.js](src/lib/customAuth.js) | **Precisa de equivalente.** Hoje o fallback é `localStorage`, que funciona mas não é armazenamento seguro. |
| OAuth em aba nativa | `oauth://?url=...` | [customAuth.js](src/lib/customAuth.js), [nativeOAuth.js](src/utils/nativeOAuth.js) | **Precisa de equivalente** — no Android o padrão é Custom Tabs. |
| Compra e restauração | `revenuecat://purchase`, `getpurchasehistory://` | [purchase.js](src/utils/purchase.js) | **Precisa de equivalente.** O RevenueCat trata Play Store; o `store` no webhook vem `play_store` em vez de `app_store`. |

**Detecção de plataforma:** `navigator.userAgent` contendo `despia`. Ver [platform.js](src/utils/platform.js).

### Pontos de atenção para o Android

**Sign in with Apple não está implementado para Android.** O [appleAuth.js](src/lib/appleAuth.js)
usa o SDK JS da Apple, que cobre iOS e web. O comentário no topo do arquivo registra que a ponte
Android ficou de fora de propósito. Se o app Android oferecer login de terceiros, avalie se
precisa oferecer Apple também — a exigência é da Apple, não do Google, então provavelmente não.

**O `external_id` do RevenueCat é o `Account.id`.** Vale para as duas lojas. O
`revenuecatWebhook` resolve tanto `Account.id` quanto o `User.id` legado, então compras antigas
continuam sendo reconhecidas. O `deleteUserAccount` consulta os dois ids antes de permitir a
exclusão, e **falha fechado**: se existe registro de compra na loja e o RevenueCat não conhece
nenhum dos ids, ele recusa excluir em vez de arriscar apagar conta com assinatura ativa.

**O e-mail é a chave de tudo.** Toda entidade per-user é chaveada por `user_email`. Um usuário que
entre pelo Google no Android e pelo Google no iOS é a mesma `Account`, sem nenhum trabalho extra.

**Sign in with Apple e e-mail de relay:** o endereço `@privaterelay.appleid.com` é gerado por
Apple Developer Team. Se o Team for outro, o mesmo usuário recebe um e-mail diferente e vira
outra conta. Já perdemos 5 contas assim na migração.

---

## 7. Estado e dívidas conhecidas

**Nunca exercitado em produção:** `cancelStripeSubscription`, `deleteUserAccount`, login por Apple
pela Home nova, `ensureMyAccount`.

**Dívidas abertas:**

- **`ECGCase`, `Module`, `Content` têm leitura pública.** Todo o conteúdo pago é baixável por
  quem tiver o app id. As imagens estão em `/files/mp/public/`, então fechar só o RLS da entidade
  não resolve. É o maior furo restante.
- **O login hospedado do Base44 continua vivo**, sem data para morrer. Cada usuário migra para o
  JWT no próximo login. Dá para medir contando Accounts com `google_id` ou `apple_id` preenchido.
- **Não existe login por e-mail e senha.** Quem não tem Google nem Apple não cria conta. O campo
  `password_hash` existe na `Account` e nunca é preenchido.
- **JWT vale 30 dias e não tem revogação.** Token vazado não pode ser invalidado.
- **`revenuecatWebhook` não distingue sandbox de produção.** Uma compra sandbox concede premium
  real. Irrelevante hoje, problema no dia em que houver cliente pagante.
- **`onUserCreated`** é trigger do `User` e ficou inerte; não valida quem chama.
