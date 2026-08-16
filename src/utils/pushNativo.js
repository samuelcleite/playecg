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
