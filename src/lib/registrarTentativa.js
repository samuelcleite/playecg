import { base44 } from "@/api/base44Client";
import { mesclarNaContaEmCache } from "@/lib/currentUser";

// Grava uma tentativa pelo recordQuizAttempt e atualiza a Account em cache com
// os agregados que ele devolve (pontos, nível, ofensiva, casos já tentados).
//
// As três telas de caso (Quiz, ModuleDetail, DailyCase) passam por aqui. Sem a
// mescla, a Account em cache ficaria parada no início da sessão: o Quiz
// voltaria a sortear casos já respondidos ao ser reaberto, e Troféus/Perfil
// mostrariam a ofensiva de antes da prática — ambos leem da Account.
//
// Erros sobem sem tratamento: cada tela já decide o que fazer (o Quiz, por
// exemplo, trata o 403 do limite diário).
export async function registrarTentativa(dados) {
  const res = await base44.functions.invoke("recordQuizAttempt", dados);
  mesclarNaContaEmCache(res?.data?.conta);
  return res;
}
