import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { getCurrentUser } from '@/lib/currentUser';
import {
  carregarCatalogoTrilha,
  carregarIndiceDeConteudos,
  buscarConteudo,
  invalidarCatalogo,
  ehIntroducao,
} from "@/lib/catalogoTrilha";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import FaleConoscoButton from "@/components/FaleConoscoButton";
import LearningTrail from "@/components/home/LearningTrail";
import { Atalho } from "@/components/Cartao";
import { useCorDaFaixa, FAIXA_BRANCA } from "@/lib/faixaTopo";
import { ESTILO_HTML } from "@/lib/estiloHtml";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Esta tela é a vitrine da trilha, não uma tela paga. Quem está no plano free
// entra, vê a trilha inteira e navega até tentar abrir uma fase — é o
// ModuleDetail que pede a assinatura. A ideia é deixar a pessoa avançar até
// esbarrar no conteúdo, em vez de barrá-la antes de ver o que está comprando.
export default function Modules() {
  const [user, setUser] = useState(null);
  const [modules, setModules] = useState([]);
  const [phases, setPhases] = useState([]);
  const [userProgress, setUserProgress] = useState([]);
  const [progress, setProgress] = useState({});
  // A introdução chega em duas etapas: a entrada do ÍNDICE (id, sem corpo)
  // diz se o card existe; o corpo em HTML só é lido quando a pessoa toca em
  // "Ler Introdução". Antes esta tela baixava o corpo de TODOS os conteúdos
  // do app, em toda visita, só para saber que a introdução existia.
  const [introMeta, setIntroMeta] = useState(null);
  const [introContent, setIntroContent] = useState(null);
  const [introLoading, setIntroLoading] = useState(false);
  const [showIntroDialog, setShowIntroDialog] = useState(false);
  const [isTrailLoading, setIsTrailLoading] = useState(true);
  const containerRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);

      // --- ESSENCIAL: só o que a trilha precisa para renderizar ---
      // Módulos e fases vêm do catálogo em cache (ver catalogoTrilha.js); o
      // progresso é o que muda entre visitas e continua lido a cada uma.
      const [[modulesData, phasesData], progressRes] = await Promise.all([
        carregarCatalogoTrilha(),
        base44.functions.invoke("getUserProgress", {}),
      ]);

      const userProgressData = Array.isArray(progressRes?.data?.data)
        ? progressRes.data.data
        : [];

      // Calcular progresso por módulo a partir do UserProgress
      const progressMap = {};
      modulesData.forEach((module) => {
        const modulePhases = phasesData.filter((p) => p.module_id === module.id);
        const completedPhasesCount = modulePhases.filter((phase) => {
          const record = userProgressData.find((up) => up.phase_id === phase.id);
          return record?.status === "completed";
        }).length;

        progressMap[module.id] = {
          completed:
            completedPhasesCount === modulePhases.length &&
            modulePhases.length > 0,
          completedPhases: completedPhasesCount,
          totalPhases: modulePhases.length,
        };
      });

      setModules(modulesData);
      setPhases(phasesData);
      setUserProgress(userProgressData);
      setProgress(progressMap);
      setIsTrailLoading(false); // a trilha já pode aparecer aqui

      // --- SECUNDÁRIO: não bloqueia a trilha, preenche os banners depois ---
      // A chamada a getUserStats saiu junto com o banner de estatísticas: era
      // o único consumidor dela nesta tela.
      carregarIndiceDeConteudos()
        .then((indice) => setIntroMeta(indice.find(ehIntroducao) || null))
        .catch((err) => console.error("índice de conteúdos:", err));
    } catch (error) {
      console.error("Error loading data:", error);
      setIsTrailLoading(false);
    }
  };

  // Puxar para atualizar é o gesto de "quero ver o que mudou": derruba o
  // catálogo em cache antes de recarregar, para uma edição do admin aparecer
  // na hora em vez de esperar o TTL.
  const recarregar = async () => {
    invalidarCatalogo();
    await loadData();
  };

  useCorDaFaixa(FAIXA_BRANCA);
  const isRefreshing = usePullToRefresh(recarregar, containerRef);

  const handleOpenIntro = async () => {
    if (!introMeta) return;
    setShowIntroDialog(true);
    if (introContent) return;
    setIntroLoading(true);
    try {
      setIntroContent(await buscarConteudo(introMeta.id));
    } catch (err) {
      console.error("introdução:", err);
    } finally {
      setIntroLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="font-nunito relative min-h-full bg-[#F4F6F8]">
      {isRefreshing && (
        <div className="flex justify-center py-3 absolute top-0 left-0 right-0 z-50">
          <Loader2 className="animate-spin text-gray-400 w-6 h-6" />
        </div>
      )}
      <header className="border-b border-[#E6EAEE] bg-white">
        <div className="mx-auto w-full max-w-3xl px-4 pb-3.5 pt-2">
          <h1 className="text-2xl font-black text-ecg-midnight">Módulos</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-[#6B7785]">
            Progrida pelos módulos e torne-se um especialista em ECG
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3.5 px-4 pb-6 pt-3.5">
        {/* Banner de estatísticas removido (Módulos Completos / Taxa de
            Acerto): mesmo motivo dos outros blocos de estatística. */}

        {/* Introdução ao ECG */}
        {introMeta && (
          <Atalho
            Icone={Sparkles}
            tom="roxo"
            titulo="Introdução ao ECG"
            legenda="Conteúdo introdutório essencial"
            onClick={handleOpenIntro}
          />
        )}

        {/* Trail */}
        {isTrailLoading ? (
          <div className="flex flex-col gap-3.5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-[20px]" />
            ))}
          </div>
        ) : (
          <LearningTrail
            modules={modules}
            phases={phases}
            userProgress={userProgress}
          />
        )}
      </div>

      {/* Introduction Dialog */}
      <Dialog open={showIntroDialog} onOpenChange={setShowIntroDialog}>
        <DialogContent className="font-nunito max-h-[90vh] max-w-3xl overflow-y-auto rounded-[22px]">
          <DialogHeader>
            <div className="mb-2 flex items-center gap-3">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] bg-ecg-purple">
                <Sparkles className="h-6 w-6 text-white" />
              </span>
              <div className="text-left">
                <DialogTitle className="text-xl font-black text-ecg-midnight">Introdução ao ECG</DialogTitle>
                <DialogDescription className="text-[13px] font-semibold text-[#6B7785]">
                  Fundamentos essenciais para começar sua jornada
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="rounded-[18px] border border-[#E6EAEE] bg-[#F8FAFB] p-4">
            {introLoading ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-[#6B7785]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando introdução...
              </div>
            ) : (
              <div
                className={`text-[13px] font-semibold leading-relaxed text-[#40505F] ${ESTILO_HTML}`}
                dangerouslySetInnerHTML={{ __html: introContent?.content || "" }}
              />
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => setShowIntroDialog(false)}
              className="rounded-[12px] bg-ecg-midnight font-extrabold text-white hover:bg-ecg-midnight-2"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FaleConoscoButton />
    </div>
  );
}