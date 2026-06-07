import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import FaleConoscoButton from "@/components/FaleConoscoButton";
import LearningTrail from "@/components/home/LearningTrail";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  Zap,
  Sparkles,
  BookOpen,
  Lightbulb
} from "lucide-react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function Modules() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [modules, setModules] = useState([]);
  const [phases, setPhases] = useState([]);
  const [userProgress, setUserProgress] = useState([]);
  const [progress, setProgress] = useState({});
  const [introContent, setIntroContent] = useState(null);
  const [showIntroDialog, setShowIntroDialog] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const [overallAccuracy, setOverallAccuracy] = useState(0);

  const loadData = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);

      if (userData.subscription_type !== "premium") {
        navigate(createPageUrl("Upgrade"));
        return;
      }

      const [modulesData, phasesData, progressRes, statsRes, contentsData] = await Promise.all([
        base44.entities.Module.list("order"),
        base44.entities.Phase.list("order"),
        base44.functions.invoke("getUserProgress", {}),
        base44.functions.invoke("getUserStats", {}),
        base44.entities.Content.list()
      ]);

      const userProgressData = Array.isArray(progressRes?.data?.data) ? progressRes.data.data : [];

      setOverallAccuracy(statsRes?.data?.moduleAccuracy ?? 0);

      // Calcular progresso por módulo a partir do UserProgress
      const progressMap = {};
      modulesData.forEach(module => {
        const modulePhases = phasesData.filter(p => p.module_id === module.id);
        const completedPhasesCount = modulePhases.filter(phase => {
          const record = userProgressData.find(up => up.phase_id === phase.id);
          return record?.status === 'completed';
        }).length;

        progressMap[module.id] = {
          completed: completedPhasesCount === modulePhases.length && modulePhases.length > 0,
          completedPhases: completedPhasesCount,
          totalPhases: modulePhases.length
        };
      });

      // Buscar conteúdo de introdução
      const intro = contentsData.find(c => !c.module_id && !c.phase_id);

      console.log("Modules:", modulesData);
      console.log("Phases:", phasesData);
      console.log("UserProgress:", userProgressData);
      
      setModules(modulesData);
      setPhases(phasesData);
      setUserProgress(userProgressData);
      setProgress(progressMap);
      setIntroContent(intro);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const handleOpenIntro = () => {
    if (introContent) {
      setShowIntroDialog(true);
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Trilha de Aprendizado
          </h1>
          <p className="text-gray-600 text-lg">
            Progrida pelos módulos e torne-se um especialista em ECG
          </p>
        </div>

        {/* Stats Banner */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <Card className="border-none shadow-lg bg-[#0D3B66]">
            <CardContent className="p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Módulos Completos</p>
                  <p className="text-3xl font-bold mt-1">
                   {Object.values(progress).filter(p => p?.completed).length}/{modules?.length || 0}
                  </p>
                </div>
                <Trophy className="w-12 h-12 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-[#1976D2]">
            <CardContent className="p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Taxa de Acerto</p>
                  <p className="text-3xl font-bold mt-1">
                   {overallAccuracy}%
                  </p>
                </div>
                <Zap className="w-12 h-12 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Introduction Section */}
        {introContent && (
          <Card className="border-2 border-blue-200 shadow-xl bg-blue-50">
            <CardContent className="p-6 flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#1976D2] shadow-lg flex-shrink-0">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold text-gray-900">Introdução ao ECG</h3>
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
        <LearningTrail
          modules={modules}
          phases={phases}
          userProgress={userProgress}
          isPremium={true}
        />
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
                <DialogTitle className="text-2xl">
                  Introdução ao ECG
                </DialogTitle>
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
                  <div 
                    className="text-gray-700 leading-relaxed prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: introContent?.content || '' }}
                  />
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