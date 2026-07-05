# Integration Notes — Inventário para integração RevenueCat (iOS)

> Documento **somente leitura / inventário**. Nada de lógica de pagamento foi alterado.
> Gerado como parte do branch `feat/revenuecat-ios-step1`.

---

## 1. Webhook do Stripe

**Arquivo:** [base44/functions/stripeWebhook/entry.ts](base44/functions/stripeWebhook/entry.ts)

É uma função Deno (`Deno.serve`) do Base44. Usa `npm:@base44/sdk@0.8.31` e `npm:stripe@17.5.0`.

### Como valida a assinatura / segredo
- Lê o segredo de ambiente: `Deno.env.get("STRIPE_WEBHOOK_SECRET")`.
- Lê a chave secreta: `Deno.env.get("STRIPE_SECRET_KEY")` (usada para instanciar o `Stripe`).
- Pega o header `stripe-signature` da request e o corpo bruto via `await req.text()`.
- Valida com `await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)`.
- Se a validação falhar, responde `400 { error: 'Invalid signature' }` e loga o erro.
- Erros gerais respondem `500 { error: <message> }`.

### Eventos tratados
| Evento | Ação |
|---|---|
| `checkout.session.completed` | Ativa premium (via helper `activatePremium`) e cria registro de `Payment`. |
| `customer.subscription.deleted` | Rebaixa o usuário para `free`. |

O e-mail é resolvido, por evento:
- `checkout.session.completed`: `session.customer_email` → `session.customer_details?.email` → `session.metadata?.user_email`.
- `customer.subscription.deleted`: `sub.metadata?.user_email`.

### Quais campos do User o webhook escreve
Escrita feita com `base44.asServiceRole.entities.User.update(users[0].id, {...})` (localiza o usuário via `User.filter({ email })`).

**Ao ativar premium (`activatePremium`):**
| Campo | Tipo | Valor escrito |
|---|---|---|
| `subscription_type` | `string` (enum `"free" \| "premium"`) | `'premium'` |
| `subscription_start_date` | `string` (date-time ISO) | `new Date().toISOString()` |

**Ao cancelar (`customer.subscription.deleted`):**
| Campo | Tipo | Valor escrito |
|---|---|---|
| `subscription_type` | `string` (enum) | `'free'` |

> Observação: o webhook **não** escreve `subscription_start_date` ao rebaixar para free (o campo antigo permanece).

### Efeitos colaterais em outras entidades (não são campos do User)
Além do User, ao ativar premium a função também escreve/cria:
- **`Payment.create(...)`** — campos: `user_email`, `stripe_subscription_id`, `reference_id`, `amount` (dividido por 100; default `59`), `discount_amount` (`0`), `coupon_id`, `status` (`'PAID'`), `payment_method` (`'STRIPE_SUBSCRIPTION'`), `paid_at`.
- **`CouponUsage.create(...)`** e **`Coupon.update(...)`** — apenas quando há `coupon_id` no metadata (incrementa `used_count`, desativa se atingir `usage_limit`).

Definição de `Payment`: [base44/entities/Payment.jsonc](base44/entities/Payment.jsonc).

---

## 2. Campos do entity User relacionados a assinatura

**Definição:** [base44/entities/User.jsonc](base44/entities/User.jsonc)

| Campo | Tipo | Detalhes |
|---|---|---|
| `subscription_type` | `string` | `enum: ["free", "premium"]`, `default: "free"`. É o campo canônico de gating. |
| `subscription_start_date` | `string` | `format: "date-time"`. Data de início da assinatura premium. |

Nenhum outro campo do User é específico de assinatura. Dados financeiros detalhados (valor, método, renovação) vivem na entidade `Payment`, não no User.

> Não existe hoje nenhum campo indicando **plataforma/origem** da assinatura (ex.: Stripe vs. Apple/RevenueCat). Todo estado premium é indistinguível de origem no nível do User.

---

## 3. Gating (como o app libera conteúdo premium)

O gating é feito inteiramente lendo `user.subscription_type === "premium"` no **frontend**. Não há um helper central único — o padrão é repetido em cada página.

**Padrão de leitura (frontend):**
- Booleano de exibição: `const isPremium = user?.subscription_type === "premium";`
- Redirecionamento/bloqueio: `if (userData.subscription_type !== "premium") { navigate(createPageUrl("Upgrade")); ... }`

**Locais que fazem gating:**
| Arquivo | Linha(s) | Uso |
|---|---|---|
| [src/Layout.jsx](src/Layout.jsx#L76) | 76 | `isPremium` para UI. |
| [src/components/TopBar.jsx](src/components/TopBar.jsx#L25) | 25 | `isPremium` para UI. |
| [src/pages/Modules.jsx](src/pages/Modules.jsx#L51) | 51 | Redireciona para `Upgrade` se não premium. |
| [src/pages/Quiz.jsx](src/pages/Quiz.jsx#L160) | 160, 330, 492 | Limite diário para free / gating de conteúdo. |
| [src/pages/AprendaECG.jsx](src/pages/AprendaECG.jsx#L143) | 143 | `isPremium`. |
| [src/pages/Dashboard.jsx](src/pages/Dashboard.jsx#L92) | 92 | `isPremium`. |
| [src/pages/ConteudoECG.jsx](src/pages/ConteudoECG.jsx#L92) | 92 | `isPremium`. |
| [src/pages/Profile.jsx](src/pages/Profile.jsx#L247) | 141, 247 | `isPremium` / info de assinatura. |
| [src/pages/AdminUsers.jsx](src/pages/AdminUsers.jsx), [src/pages/AdminPayments.jsx](src/pages/AdminPayments.jsx), [src/pages/AdminActivity.jsx](src/pages/AdminActivity.jsx) | várias | Exibição administrativa de status premium. |

**Campo lido em todos os casos:** `subscription_type` (comparado com `"premium"`).

> Nota importante (fase de testes): [src/pages/CompleteProfile.jsx](src/pages/CompleteProfile.jsx#L48) força `subscription_type: "premium"` para todos os novos usuários (comentado como "Fase de testes"). Isso afeta o gating real hoje.

**Backend:** [base44/functions/getUserSubscriptionInfo/entry.ts](base44/functions/getUserSubscriptionInfo/entry.ts) também lê `user.subscription_type` para montar a tela de detalhes da assinatura (deriva renovação a partir de `subscription_start_date` / `created_date` e da entidade `Payment`).

---

## 4. Como o app obtém o usuário logado

**Função:** `base44.auth.me()` (também reexportada como `User.me` em [src/api/entities.js](src/api/entities.js), onde `User = base44.auth`).

Cliente Base44 em [src/api/base44Client.js](src/api/base44Client.js); contexto de auth em [src/lib/AuthContext.jsx](src/lib/AuthContext.jsx) (`useAuth()` expõe `user`).

### Formato da resposta — atenção
`base44.auth.me()` **retorna o objeto de usuário diretamente** (já desembrulhado). Os campos são acessados sem `.data`:
```js
const userData = await base44.auth.me();
userData.subscription_type; // acesso direto
userData.email;
```
Confirmado em [src/lib/AuthContext.jsx:94](src/lib/AuthContext.jsx#L94), [src/pages/Modules.jsx:48](src/pages/Modules.jsx#L48), [src/pages/Quiz.jsx:150](src/pages/Quiz.jsx#L150), etc.

**Sobre `response.data.data`:** esse padrão **NÃO** se aplica ao `auth.me()`. Ele aparece em dois outros contextos:
- Chamadas de **funções backend** via `base44.functions.invoke('<nome>', {...})` retornam um objeto axios-like, então o payload fica em `response.data.<campo>` (ex.: `response.data.success`, `response.data.url` em [src/pages/Upgrade.jsx:111](src/pages/Upgrade.jsx#L111)).
- Funções que devolvem **listas de entidades** aninham em `response.data.data` (ex.: `progressRes?.data?.data` em [src/pages/AprendaECG.jsx:52](src/pages/AprendaECG.jsx#L52)).

Resumo: **`auth.me()` → objeto direto**; **`functions.invoke()` → `response.data.*` (e `response.data.data` para listas)**.

---

## 5. Detecção de plataforma / Despia / native existente

Antes desta task **não existia** detecção de Despia nem de app nativo. A única detecção de plataforma existente é para instruções de PWA:

- [src/pages/InstallPWA.jsx:7-8](src/pages/InstallPWA.jsx#L7-L8):
  ```js
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = () => /android/i.test(navigator.userAgent);
  ```
  Usado apenas para escolher os passos de instalação (iOS vs. Android) e não tem relação com wrapper nativo nem RevenueCat.

- **Novo** (adicionado neste branch): [src/utils/platform.js](src/utils/platform.js) — `RC_ENTITLEMENT`, `isIOSNativeApp()`, `isDespiaApp()`.

Não há detecção prévia das strings `despia`, `despia-iphone` ou `despia-ipad` em nenhum outro lugar do código.

---

## 6. Convenção de imports e estrutura de pastas

### Alias de import
- Alias **`@/`** aponta para `src/` (fornecido pelo plugin Base44 do Vite — [vite.config.js](vite.config.js), com `@/api/...`, `@/lib/...`, etc.), configurado em [jsconfig.json](jsconfig.json).
- Uso predominante: `import { base44 } from '@/api/base44Client'`, `import { appParams } from '@/lib/app-params'`.
- Imports relativos aparecem dentro de subárvores (ex.: `src/api/entities.js` faz `import { base44 } from './base44Client'`).
- **Recomendação para novos módulos:** importar via `import { isIOSNativeApp, RC_ENTITLEMENT } from '@/utils/platform'`.

### Estrutura de `utils`
- Pasta: [src/utils/](src/utils/).
- Continha apenas [src/utils/index.ts](src/utils/index.ts) (exporta `createPageUrl`). Arquivos em TypeScript (`.ts`).
- Novo helper criado como `src/utils/platform.js` (JS, conforme especificação da task) usando ESM `export const` / `export function`, consistente com o estilo do restante do projeto.

### Estrutura das funções de backend (Base44)
- Pasta: [base44/functions/](base44/functions/). Uma pasta por função, cada uma com `entry.ts`.
- Padrão de cada função: Deno (`Deno.serve(async (req) => {...})`), cliente via `createClientFromRequest(req)` do `@base44/sdk`, acesso privilegiado via `base44.asServiceRole.entities.<Entity>`.
- Segredos via `Deno.env.get(...)`.
- Funções relacionadas a pagamento: `stripeWebhook`, `createStripeCheckout`, `cancelStripeSubscription`, `getUserSubscriptionInfo`, `manuallyUpgradeToPremium`, `validateCoupon`.

### Estrutura das entidades (Base44)
- Pasta: [base44/entities/](base44/entities/). Um arquivo `.jsonc` por entidade (schema JSON-Schema-like com `properties`, `required`, `rls`).
- Entidades relevantes: `User`, `Payment`, `Coupon`, `CouponUsage`.

### Frontend
- `src/pages/` — páginas de rota; `src/components/` (inclui `ui/` do shadcn); `src/lib/` — contexto/infra; `src/api/` — clientes (`base44Client.js`, `entities.js`, `integrations.js`); `src/hooks/`; `src/utils/`.
