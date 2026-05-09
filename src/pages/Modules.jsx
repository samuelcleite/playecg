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
  const [attempts, setAttempts] = useState([]);
  const [progress, setProgress] = useState({});
  const [introContent, setIntroContent] = useState(null);
  const [showIntroDialog, setShowIntroDialog] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const [overallAccuracy, setOverallAccuracy] = useState(0);

  const loadData = async () => {
    const userData = await base44.auth.me();
    setUser(userData);

    if (userData.subscription_type !== "premium") {
      navigate(createPageUrl("Upgrade"));
      return;
    }

    const modulesData = await base44.entities.Module.list("order");
    setModules(modulesData);

    // Calcular progresso diretamente de QuizAttempt
    const phasesData = await base44.entities.Phase.list();
    setPhases(phasesData);
    const allUserAttempts = await base44.entities.QuizAttempt.filter({ 
      user_email: userData.email
    }, "-created_date", 1000);
    setAttempts(allUserAttempts);
    
    const attempts = allUserAttempts.filter(a => a.quiz_type === "module");

    // Calcular percentual de acerto geral (todas as tentativas, não por caso único)
    const allAttempts = await base44.entities.QuizAttempt.filter({ user_email: userData.email });
    if (allAttempts.length > 0) {
      const correctAttempts = allAttempts.filter(a => a.correct).length;
      const accuracy = Math.round((correctAttempts / allAttempts.length) * 100);
      setOverallAccuracy(accuracy);
    } else {
      setOverallAccuracy(0);
    }

    const progressMap = {};
    modulesData.forEach(module => {
      const modulePhases = phases.filter(p => p.module_id === module.id);

      let completedPhasesCount = 0;

      modulePhases.forEach(phase => {
        const phaseAttempts = attempts.filter(a => a.phase_id === phase.id);
        const attemptsByCase = {};

        phaseAttempts.forEach(att => {
          if (!attemptsByCase[att.case_id]) {
            attemptsByCase[att.case_id] = [];
          }
          attemptsByCase[att.case_id].push(att);
        });

        let completedCases = 0;
        Object.keys(attemptsByCase).forEach(caseId => {
          const caseAttempts = attemptsByCase[caseId];
          const hasCorrect = caseAttempts.some(a => a.correct);
          const hasThreeAttempts = caseAttempts.length >= 3;

          if (hasCorrect || hasThreeAttempts) {
            completedCases++;
          }
        });

        if (completedCases >= (phase.total_cases || 0)) {
          completedPhasesCount++;
        }
      });

      progressMap[module.id] = {
        completed: completedPhasesCount === modulePhases.length && modulePhases.length > 0,
        completedPhases: completedPhasesCount,
        totalPhases: modulePhases.length
      };
    });
    setProgress(progressMap);

    // Buscar conteúdo de introdução
    const contentsData = await base44.entities.Content.list();
    const intro = contentsData.find(c => !c.module_id && !c.phase_id);
    setIntroContent(intro);
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
          <Card className="border-none shadow-lg bg-gradient-to-br from-blue-500 to-indigo-600">
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

          <Card className="border-none shadow-lg bg-gradient-to-br from-purple-500 to-pink-600">
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
          <Card className="border-2 border-amber-300 shadow-xl bg-gradient-to-br from-amber-50 to-orange-50">
            <CardContent className="p-6 flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg flex-shrink-0">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold text-gray-900">Introdução ao ECG</h3>
                    <Badge className="bg-amber-200 text-amber-900">Recomendado</Badge>
                  </div>
                  <p className="text-sm text-gray-600 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    Conteúdo introdutório essencial
                  </p>
                </div>
              </div>
              <Button
                onClick={handleOpenIntro}
                className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 flex-shrink-0"
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
          attempts={attempts}
          isPremium={true}
        />
      </div>

      {/* Introduction Dialog */}
      <Dialog open={showIntroDialog} onOpenChange={setShowIntroDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
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
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl p-6">
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
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
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