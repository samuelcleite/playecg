import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  CheckCircle2, 
  Lock,
  ArrowRight,
  Trophy,
  Layers,
  Target,
  BookOpen,
  Lightbulb
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function ModulePhases() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [module, setModule] = useState(null);
  const [phases, setPhases] = useState([]);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [showGuideDialog, setShowGuideDialog] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [phaseContent, setPhaseContent] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const moduleId = urlParams.get('id');

    if (!moduleId) {
      navigate(createPageUrl("Modules"));
      return;
    }

    const userData = await base44.auth.me();
    setUser(userData);

    if (userData.subscription_type !== "premium") {
      navigate(createPageUrl("Upgrade"));
      return;
    }

    const moduleData = await base44.entities.Module.list();
    const foundModule = moduleData.find(m => m.id === moduleId);
    if (!foundModule) {
      navigate(createPageUrl("Modules"));
      return;
    }
    setModule(foundModule);

    const phasesData = await base44.entities.Phase.filter({ module_id: moduleId }, "order");
    setPhases(phasesData);

    // Calcular progresso a partir de QuizAttempt
    const attempts = await base44.entities.QuizAttempt.filter({ 
      user_email: userData.email,
      module_id: moduleId,
      quiz_type: "module"
    });

    const progressMap = {};
    phasesData.forEach(phase => {
      const phaseAttempts = attempts.filter(a => a.phase_id === phase.id);
      const attemptsByCase = {};
      
      phaseAttempts.forEach(att => {
        if (!attemptsByCase[att.case_id]) {
          attemptsByCase[att.case_id] = [];
        }
        attemptsByCase[att.case_id].push(att);
      });

      const completedCaseIds = [];
      Object.keys(attemptsByCase).forEach(caseId => {
        const caseAttempts = attemptsByCase[caseId];
        const hasCorrect = caseAttempts.some(a => a.correct);
        const hasThreeAttempts = caseAttempts.length >= 3;
        
        if (hasCorrect || hasThreeAttempts) {
          completedCaseIds.push(caseId);
        }
      });

      progressMap[phase.id] = {
        completed_cases: completedCaseIds,
        completed: completedCaseIds.length >= (phase.total_cases || 0)
      };
    });
    setProgress(progressMap);

    setLoading(false);
  };

  const isPhaseUnlocked = (phase) => {
    return true; // Todas as fases desbloqueadas para usuários premium
  };

  const getPhaseCompletion = (phaseId, totalCases) => {
    const prog = progress[phaseId];
    if (!prog || !totalCases) return 0;
    return Math.round((prog.completed_cases.length / totalCases) * 100);
  };

  const handlePhaseClick = async (phase) => {
    const completionPercentage = getPhaseCompletion(phase.id, phase.total_cases);
    
    // Se o progresso é 0%, busca o conteúdo
    if (completionPercentage === 0) {
      const contents = await base44.entities.Content.filter({ 
        module_id: module.id,
        phase_id: phase.id
      });
      
      if (contents.length > 0 && contents[0].content) {
        setPhaseContent(contents[0].content);
        setSelectedPhase(phase);
        setShowGuideDialog(true);
        return;
      }
    }
    
    // Navega direto para a fase
    navigate(`${createPageUrl("ModuleDetail")}?module_id=${module.id}&phase_id=${phase.id}`);
  };

  const handleStartPhase = () => {
    setShowGuideDialog(false);
    navigate(`${createPageUrl("ModuleDetail")}?module_id=${module.id}&phase_id=${selectedPhase.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Trophy className="w-12 h-12 animate-pulse text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando fases...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl("Modules"))}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar aos Módulos
          </Button>
        </div>

        {/* Module Header */}
        <Card className="border-none shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
          <CardContent className="p-8">
            <div className="flex items-start gap-6">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl shadow-lg bg-gradient-to-br from-indigo-500 to-purple-600">
                {module.order}
              </div>
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{module.name}</h1>
                <p className="text-gray-600 mb-4">{module.description}</p>
                <div className="flex items-center gap-3">
                  <Badge className="bg-purple-100 text-purple-800">
                    {phases.length} fases
                  </Badge>
                  <Badge className="bg-blue-100 text-blue-800">
                    {module.total_cases} casos totais
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Phases List */}
        <div>
          <div className="flex items-center gap-2 mb-6">
            <Layers className="w-6 h-6 text-purple-600" />
            <h2 className="text-2xl font-bold text-gray-900">Fases do Módulo</h2>
          </div>

          <div className="space-y-4">
            <AnimatePresence>
              {phases.map((phase, index) => {
                const unlocked = isPhaseUnlocked(phase);
                const completed = progress[phase.id]?.completed || false;
                const completionPercentage = getPhaseCompletion(phase.id, phase.total_cases);

                return (
                  <motion.div
                    key={phase.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className={`border-none shadow-lg hover:shadow-xl transition-all duration-300 ${
                      !unlocked ? 'opacity-60' : ''
                    }`}>
                      <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row gap-6">
                          {/* Phase Icon */}
                          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg ${
                            completed 
                              ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                              : unlocked
                                ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                                : 'bg-gray-400'
                          }`}>
                            {completed ? (
                              <CheckCircle2 className="w-8 h-8" />
                            ) : unlocked ? (
                              phase.order
                            ) : (
                              <Lock className="w-6 h-6" />
                            )}
                          </div>

                          {/* Phase Info */}
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h3 className="text-xl font-bold text-gray-900 mb-1">
                                  {phase.name}
                                </h3>
                              </div>
                            </div>

                            {/* Progress Bar */}
                            {unlocked && (
                              <div className="mb-4">
                                <div className="flex justify-between text-sm text-gray-600 mb-2">
                                  <span>Progresso</span>
                                  <span>{completionPercentage}%</span>
                                </div>
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${completionPercentage}%` }}
                                    transition={{ duration: 1, ease: "easeOut" }}
                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-600"
                                  />
                                </div>
                              </div>
                            )}

                            {/* Footer */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4 text-sm text-gray-500">
                                <span className="flex items-center gap-1">
                                  <Target className="w-4 h-4" />
                                  {phase.total_cases} casos
                                </span>
                              </div>

                              <Button
                                onClick={() => handlePhaseClick(phase)}
                                className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 gap-2"
                              >
                                {completed ? 'Revisar' : completionPercentage > 0 ? 'Continuar' : 'Começar'}
                                <ArrowRight className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {phases.length === 0 && (
              <Card className="border-none shadow-lg">
                <CardContent className="p-12 text-center">
                  <Layers className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Nenhuma fase disponível
                  </h3>
                  <p className="text-gray-600">
                    Este módulo ainda não possui fases cadastradas.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Guide Dialog */}
      <Dialog open={showGuideDialog} onOpenChange={setShowGuideDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl">
                  Bem-vindo à fase: {selectedPhase?.name}
                </DialogTitle>
                <DialogDescription>
                  Leia o guia abaixo antes de começar
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl p-6">
              <div className="flex items-start gap-3 mb-4">
                <Lightbulb className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h4 className="font-bold text-lg text-amber-900 mb-2">
                    Orientações para esta fase
                  </h4>
                  <div 
                    className="text-gray-700 leading-relaxed prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: phaseContent }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => setShowGuideDialog(false)}
            >
              Ler depois
            </Button>
            <Button 
              onClick={handleStartPhase}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 gap-2"
            >
              Começar Fase
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}