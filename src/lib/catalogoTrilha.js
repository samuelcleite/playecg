import { base44 } from "@/api/base44Client";

// Módulos e fases para o card CONTINUAR do Dashboard, com cache por
// carregamento de página.
//
// O Dashboard é a tela mais visitada do app, e sem isto cada visita relia o
// catálogo inteiro da trilha — leitura de entidade que conta no limite de
// volume do Base44 (o 429). O catálogo só muda quando um admin edita; o que
// muda a cada sessão é o PROGRESSO, e esse continua sendo lido a cada visita.
//
// Cache só para o Dashboard, de propósito: a tela de Módulos segue lendo do
// servidor, então uma edição do admin aparece lá sem recarregar o app. Uma
// falha não fica guardada — a próxima visita tenta de novo.
let promessa = null;

export function carregarCatalogoTrilha() {
  if (!promessa) {
    promessa = Promise.all([
      base44.entities.Module.list("order"),
      base44.entities.Phase.list("order"),
    ]).catch((erro) => {
      promessa = null;
      throw erro;
    });
  }
  return promessa;
}
