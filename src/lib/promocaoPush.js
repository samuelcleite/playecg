import { base44 } from "@/api/base44Client";
import { refreshCurrentUser } from "@/lib/currentUser";
import { isIOSNativeApp } from "@/utils/platform";

// Promoção "ativou notificações, ganhou premium" — o lado do cliente.
//
// Existe como módulo, e não dentro de um componente, porque a permissão pode ser
// concedida em DOIS lugares (o banner do Dashboard e o bloco do Perfil) e a
// promoção precisa valer igual nos dois. Duplicar a chamada nos dois
// componentes é como um deles fica para trás numa mudança futura.
//
// ─── NÃO É RETROATIVA ────────────────────────────────────────────────────────
//
// Só ganha quem CONCEDE a permissão a partir de agora: o resgate é chamado na
// sequência do gesto que autorizou, e em nenhum outro momento. Quem já tinha
// notificações ativas antes da campanha não recebe oferta nenhuma — a promoção
// paga por uma ativação que não existiria, não por uma que já aconteceu.
//
// POR QUE O CORTE É PELO FLUXO, e não por uma data:
//
// O servidor não tem como saber QUANDO a permissão foi dada. A API do OneSignal
// não expõe data de criação da subscription — e, se expusesse, ela marcaria o
// primeiro open do app, não o aceite: no iOS a subscription nasce no primeiro
// launch com `notification_types` negativo e só muda de estado quando a pessoa
// autoriza. O corte por data recusaria justamente quem instalou há meses e
// aceitou hoje, que é o público que a promoção quer.
//
// O que o servidor ainda garante, e é o que importa: ninguém ganha sem ter, de
// fato, uma inscrição ativa no OneSignal. O fluxo decide QUEM recebe a oferta;
// a verificação decide se ela é honrada.
//
// FURO CONHECIDO: quem já tem push e chamar a function pelo console ganha os 7
// dias, porque do lado do servidor ela cumpre o critério. Aceito — o custo é
// sete dias de acesso, e fechá-lo exigiria fotografar a base inteira antes de
// ligar a campanha.

// Consulta se há promoção no ar para ESTA pessoa. Devolve { dias } ou null.
// null cobre tudo que não seja "sim": desligada, inelegível, já resgatada, erro
// de rede. Para a tela, os quatro casos são o mesmo — não mostrar oferta.
export async function consultarPromoPush() {
  if (!isIOSNativeApp()) return null;
  try {
    const res = await base44.functions.invoke("promocoes", { acao: "status" });
    const d = res?.data;
    if (d?.success && d.ativa && d.elegivel) return { dias: d.dias };
    return null;
  } catch (error) {
    // Uma promoção indisponível não pode quebrar a tela de notificações, que
    // funcionava muito antes de ela existir.
    console.error("Promoção indisponível:", error);
    return null;
  }
}

// Motivos que significam "não havia promoção para esta pessoa" — e não "deu
// erro". Recusa por esses motivos é silenciosa na tela: dizer "você já resgatou"
// a quem nem sabia que existia promoção é ruído, não informação.
const RECUSAS_SILENCIOSAS = ['desligada', 'ja_resgatou', 'ja_em_cortesia', 'ja_premium', 'lifetime'];

// Resgata. Chamar SÓ na sequência de uma permissão recém-concedida — é isso que
// mantém a promoção não-retroativa.
//
// CHAME SEM CONDICIONAR AO STATUS. Antes isto só era chamado quando a consulta
// de status já tivesse voltado dizendo "elegível", e nisso havia uma corrida
// perdida: quem tocasse no botão antes de a consulta responder ativava as
// notificações e não ganhava nada — e o banner some depois disso, porque a
// promoção não é retroativa. A pessoa cumpria o combinado e ficava sem o
// prêmio, sem segunda chance.
//
// Quem decide é o servidor, que é a única parte com informação completa. Uma
// chamada a mais quando não há promoção custa nada perto disso.
//
// Devolve { ok: true, dias } ou { ok: false, erro, silencioso }. Quem confirma
// que a permissão existe mesmo é o servidor, contra o OneSignal: o
// utils/pushNativo.js avisa que deste lado não existe confirmação de nada.
export async function resgatarPromoPush() {
  try {
    const res = await base44.functions.invoke("promocoes", {
      acao: "resgatar",
      promocao: "push_ios"
    });
    const d = res?.data;
    if (d?.success) {
      // Sem isto o app segue tratando a pessoa como gratuita até o próximo
      // carregamento: o currentUser tem cache por carregamento de página, e ele
      // acabou de ficar velho.
      await refreshCurrentUser();
      return { ok: true, dias: d.dias };
    }
    return {
      ok: false,
      erro: d?.error || "Não foi possível liberar seu acesso agora.",
      silencioso: RECUSAS_SILENCIOSAS.includes(d?.motivo)
    };
  } catch (error) {
    const dados = error?.response?.data;
    return {
      ok: false,
      erro: dados?.error || "Não foi possível liberar seu acesso agora.",
      silencioso: RECUSAS_SILENCIOSAS.includes(dados?.motivo)
    };
  }
}
