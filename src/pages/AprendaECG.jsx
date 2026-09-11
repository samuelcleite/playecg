import React, { useState, useEffect } from "react";
import { getCurrentUser } from '@/lib/currentUser';
import { carregarCatalogoTrilha, carregarIndiceDeConteudos } from "@/lib/catalogoTrilha";
import { createPageUrl } from "@/utils";
import AprendaECGMobile from "@/components/aprenda/AprendaECGMobile";
import { Loader2 } from "lucide-react";

// Esta tela é um índice: ela nunca mostra o corpo de um conteúdo. Usa os
// registros só para saber se o conteúdo existe (o `&&` no card, o `.length`, o
// `.find` por phase_id) e montar os links para ConteudoECG, que aí sim busca o
// corpo do item escolhido. Por isso ela lê o ÍNDICE de conteúdos e o catálogo
// de módulos e fases do cache compartilhado (catalogoTrilha.js) — as mesmas
// leituras que Dashboard, Módulos e Conteúdo já fizeram nesta sessão.

export default function AprendaECG() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [introContent, setIntroContent] = useState(null);
  const [moduleContents, setModuleContents] = useState([]);
  const [modules, setModules] = useState([]);
  const [phases, setPhases] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const userData = await getCurrentUser();
    setUser(userData);

    // Esta tela é biblioteca, não trilha: o assinante abre qualquer módulo ou
    // fase na ordem que quiser. O progresso continua governando os quizzes em
    // Modules/ModuleDetail — aqui ele não é mais consultado, por isso o
    // getUserProgress saiu do Promise.all (uma chamada a menos segurando a tela).
    const [contentsData, [modulesData, phasesData]] = await Promise.all([
      carregarIndiceDeConteudos(),
      carregarCatalogoTrilha()
    ]);

    // Separar introdução
    const intro = contentsData.find(c => !c.module_id && !c.phase_id);
    setIntroContent(intro);

    // Organizar conteúdos por módulo
    const contentsByModule = {};
    contentsData.forEach(content => {
      if (content.module_id) {
        if (!contentsByModule[content.module_id]) {
          contentsByModule[content.module_id] = { moduleContent: null, phaseContents: [] };
        }
        if (!content.phase_id) {
          contentsByModule[content.module_id].moduleContent = content;
        } else {
          contentsByModule[content.module_id].phaseContents.push(content);
        }
      }
    });

    setModuleContents(contentsByModule);
    setModules(modulesData);
    setPhases(phasesData);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="font-nunito flex min-h-full items-center justify-center bg-[#F4F6F8] py-24">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-ecg-midnight-2" />
          <p className="text-sm font-bold text-[#6B7785]">Carregando conteúdos...</p>
        </div>
      </div>
    );
  }

  const isPremium = user?.subscription_type === "premium";

  // Antes, quem não assinava via só um card "Conteúdo Premium" e nada do que
  // existia aqui dentro. Agora vê o índice com cadeados — a mesma lógica da
  // trilha em Modules: mostrar o que a assinatura vende. É seguro porque este
  // índice nunca carrega o corpo de conteúdo nenhum (ver CAMPOS_DO_INDICE lá em
  // cima) e o ConteudoECG, que carrega, tem gate próprio.
  //
  // Mesmas regras de antes para o que entra na lista: módulo sem conteúdo
  // nenhum não aparece; fase só aparece se tiver conteúdo próprio.
  const modulos = modules
    .filter((module) => moduleContents[module.id])
    .map((module) => {
      const moduleData = moduleContents[module.id];
      const fases = phases
        .filter((p) => p.module_id === module.id)
        .sort((a, b) => a.order - b.order)
        .filter((p) => moduleData.phaseContents.some((pc) => pc.phase_id === p.id));

      const conteudos = [
        ...(moduleData.moduleContent
          ? [{
              id: `modulo-${module.id}`,
              titulo: "Conteúdo do módulo",
              legenda: "Visão geral e fundamentos",
              to: `${createPageUrl("ConteudoECG")}?type=module&module_id=${module.id}`,
            }]
          : []),
        ...fases.map((phase) => ({
          id: phase.id,
          titulo: phase.name,
          legenda: `Fase ${phase.order}`,
          to: `${createPageUrl("ConteudoECG")}?type=phase&module_id=${module.id}&phase_id=${phase.id}`,
        })),
      ];

      return {
        id: module.id,
        n: module.order,
        nome: module.name,
        legenda: `${conteudos.length} ${conteudos.length === 1 ? "conteúdo" : "conteúdos"}`,
        conteudos,
      };
    });

  // Sem reserva de safe-area propria: esta tela passa pelo Layout, e o <main>
  // de la ja reservou o topo.
  return (
    <AprendaECGMobile
      intro={introContent && {
        titulo: "Introdução ao ECG",
        legenda: "Fundamentos essenciais para começar",
        to: `${createPageUrl("ConteudoECG")}?type=intro`,
      }}
      modulos={modulos}
      bloqueado={!isPremium}
      urlBloqueado={createPageUrl("Upgrade")}
    />
  );
}
