import despia from "despia-native";
import { isIOSNativeApp } from "./platform";

// Push nativo no app iOS (Despia + OneSignal).
//
// O SDK do OneSignal já vem COMPILADO no binário pelo Despia. Não existe SDK de
// OneSignal no frontend e não há nada a instalar: tudo o que este módulo faz é
// mandar comandos pela ponte do Despia. Por isso ele é o espelho iOS do
// purchasesAndroid.js — mesma forma, mesmo contrato, plataforma oposta.
//
// O import do despia-native é ESTÁTICO, pelo mesmo motivo documentado em
// purchasesAndroid.js: o pacote é uma casca fina (ele só faz `window.despia =
// comando`), e o import dinâmico já pendurou o app de um usuário uma vez, numa
// falha que nunca foi identificada. Importar não ativa nada fora do iOS nativo.

// NÃO EXISTE CONFIRMAÇÃO DE NADA AQUI, e isso é estrutural, não um descuido.
//
// O despia() SEM `watch` devolve Promise.resolve() incondicionalmente — exista
// ou não a ponte nativa do outro lado. Ele enfileira o comando, faz
// `window.despia = comando` dentro de um try/catch que só loga, e resolve.
// Portanto: esta função resolver NÃO significa que o OneSignal recebeu coisa
// alguma. Na web, no Android e num binário desatualizado o resultado é
// exatamente o mesmo — silêncio.
//
// A única verificação possível é o painel do OneSignal (Audience →
// Subscriptions, coluna External ID). Se um dia a vinculação parar de
// funcionar, o silêncio aqui é o esperado: não procure erro no console.

// DÍVIDA CONHECIDA: não desvinculamos no logout.
//
// O modelo de integração do Despia não tem passo de desvinculação, e a janela
// de exposição é curta: o comando abaixo roda em TODO carregamento autenticado,
// então o primeiro Dashboard do usuário seguinte sobrescreve o External ID do
// anterior. O buraco existe só entre o logout e o próximo login, num aparelho
// onde duas contas se revezam. Aceito de propósito. Se um dia surgir um comando
// de desvinculação, o lugar dele é este arquivo e a chamada é no logout do
// AuthContext.

// Vincula a conta autenticada ao OneSignal. No-op fora do app iOS nativo.
//
// SOBRE O NOME DO PARÂMETRO: `user_id` é como o DESPIA chama o parâmetro deste
// comando. Do lado do OneSignal ele vira o EXTERNAL ID da subscription. E o
// valor que mandamos é o Account.id — o MESMO valor que o RevenueCat já usa
// como external_id no iOS e como appUserID no Android (ver purchasesAndroid.js
// e ARQUITETURA_AUTH.md). Três sistemas, um identificador só, que é o ponto.
// Não "corrija" o nome do parâmetro para account_id: quem define o nome é o
// Despia, e trocá-lo faz o comando virar no-op silencioso.
export async function vincularPushAoUsuario(accountId) {
  if (!isIOSNativeApp()) return;

  if (!accountId) {
    // Só avisa e sai. Diferente do initAndroidPurchases, que LANÇA no mesmo
    // caso: lá o erro existe porque quem chamava seguia adiante para um SDK não
    // configurado, onde a ponte nativa pode nunca responder e a compra trava.
    // Aqui não há nada a jusante — ninguém espera esta chamada, ninguém depende
    // dela. Lançar só produziria ruído no .catch() do AuthContext.
    console.warn("OneSignal: accountId ausente — vinculação ignorada");
    return;
  }

  await despia(
    `setonesignalplayerid://?user_id=${encodeURIComponent(accountId)}`
  );
}

// ─── PERMISSÃO ──────────────────────────────────────────────────────────────
// O "Automatic Prompt" está DESLIGADO no painel do Despia. O prompt do sistema
// é disparado por nós, atrás de um gesto do usuário — e isso não é preferência
// de UX: no iOS a recusa é PERMANENTE, só reversível nos Ajustes. Um prompt no
// primeiro launch, antes de a pessoa ter visto um caso de ECG, queima quem
// recusa para sempre.

// Teto para a CONSULTA de estado, e ele não é decorativo: o modo `watch` do
// despia-native espera 30 SEGUNDOS antes de desistir. Sem este teto, um binário
// que não responda deixaria o componente em "carregando" (invisível) por meio
// minuto — e binário que não responde é justamente o caso que precisa ser
// resolvido rápido. Mesmo raciocínio do teto no bootstrapAuth.
const TETO_CONSULTA_MS = 1500;

// Depois de pedir a permissão, reconsultamos algumas vezes: o prompt é do
// sistema e a pessoa leva alguns segundos para responder. Sem isso, concluiríamos
// "não concedeu" no instante seguinte ao toque, sempre.
const TENTATIVAS_APOS_PEDIDO = 6;
const INTERVALO_TENTATIVA_MS = 1000;

// Estado da permissão: "concedida" | "nao_concedida" | "indeterminado".
//
// INDETERMINADO NÃO É "AINDA NÃO PERGUNTOU". É "não deu para saber" — e o caso
// mais comum é o binário do Despia sem o SDK do OneSignal compilado, onde o
// comando simplesmente não é processado e a variável nunca chega.
//
// QUEM RENDERIZA TEM DE TRATAR INDETERMINADO COMO "NÃO MOSTRE NADA". Um botão
// de ativar notificações que não faz absolutamente nada é pior do que botão
// nenhum, e é o que usuários iOS reais veriam se indeterminado caísse no mesmo
// balde de "ainda não perguntou". É essa regra que torna este commit seguro em
// produção antes do rebuild: hoje a UI fica invisível, e ela aparece sozinha
// quando o binário novo chegar.
//
// "nao_concedida" também NÃO distingue "nunca perguntou" de "já recusou" — o
// Despia devolve um booleano só. Por isso não adivinhamos: pedimos a permissão
// e, se continuar não concedida, a tela oferece TAMBÉM o atalho para os Ajustes.
export async function estadoDaPermissaoNativa() {
  if (!isIOSNativeApp()) return "indeterminado";

  try {
    const resultado = await Promise.race([
      despia("checkNativePushPermissions://", ["nativePushEnabled"]),
      new Promise((resolve) => setTimeout(() => resolve(null), TETO_CONSULTA_MS))
    ]);

    const valor = resultado?.nativePushEnabled;
    if (valor === true) return "concedida";
    if (valor === false) return "nao_concedida";
    return "indeterminado";
  } catch (_e) {
    return "indeterminado";
  }
}

// Dispara o prompt do sistema e devolve o estado resultante, já reconsultado.
// Quem já recusou antes não vê prompt nenhum (a recusa no iOS é definitiva):
// para essa pessoa isto volta "nao_concedida" e o atalho para os Ajustes é o
// único caminho.
export async function pedirPermissaoNativa() {
  if (!isIOSNativeApp()) return "indeterminado";

  await despia("registerpush://");

  for (let i = 0; i < TENTATIVAS_APOS_PEDIDO; i++) {
    await new Promise((resolve) => setTimeout(resolve, INTERVALO_TENTATIVA_MS));
    const estado = await estadoDaPermissaoNativa();
    if (estado === "concedida") return estado;
  }

  return "nao_concedida";
}

// Abre os Ajustes do sistema para o app. É o único resgate possível para quem
// já recusou — no iOS não há como reapresentar o prompt.
export async function abrirAjustesDoSistema() {
  if (!isIOSNativeApp()) return;
  await despia("settingsapp://");
}
