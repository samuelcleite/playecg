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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  BookOpen,
  Lightbulb,
  Loader2
} from "lucide-react";
import { motion } from "framer-motion";
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
    <div ref={containerRef} className="min-h-screen p-6 md:p-8 relative">
      {isRefreshing && (
        <div className="flex justify-center py-3 absolute top-0 left-0 right-0 z-50">
          <Loader2 className="animate-spin text-gray-400 w-6 h-6" />
        </div>
      )}
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Módulos
          </h1>
          <p className="text-gray-600 text-lg">
            Progrida pelos módulos e torne-se um especialista em ECG
          </p>
        </div>

        {/* Banner de estatísticas removido (Módulos Completos / Taxa de
            Acerto): mesmo motivo dos outros blocos de estatística. */}

        {/* Introduction Section */}
        {introMeta && (
          <Card className="border-2 border-blue-200 shadow-xl bg-blue-50">
            <CardContent className="p-6 flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#1976D2] shadow-lg flex-shrink-0">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold text-gray-900">
                      Introdução ao ECG
                    </h3>
                    <Badge className="bg-[#22C55E] text-white">Recomendado</Badge>
                  </div>
                  <p className="text-sm text-gray-600 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    Conteúdo introdutório essencial
                  </p>
                </div>
              </div>
              <Button
                onClick={handleOpenIntro}
                className="gap-2 bg-[#0D3B66] hover:bg-[#1976D2] text-white flex-shrink-0"
              >
                Ler Introdução
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Trail */}
        {isTrailLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-[#1976D2] flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl">Introdução ao ECG</DialogTitle>
                <DialogDescription>
                  Fundamentos essenciais para começar sua jornada
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
              <div className="flex items-start gap-3 mb-4">
                <Lightbulb className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  {introLoading ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Carregando introdução...
                    </div>
                  ) : (
                    <div
                      className="text-gray-700 leading-relaxed prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: introContent?.content || "" }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => setShowIntroDialog(false)}
              className="bg-[#1976D2] hover:bg-[#0D3B66] text-white"
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