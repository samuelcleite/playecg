import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import FaleConoscoButton from "@/components/FaleConoscoButton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Lock,
  CheckCircle,
  Star,
  ArrowRight,
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
    const phases = await base44.entities.Phase.list();
    const allUserAttempts = await base44.entities.QuizAttempt.filter({ 
      user_email: userData.email
    }, "-created_date", 1000);
    
    const attempts = allUserAttempts.filter(a => a.quiz_type === "module");

    // Calcular percentual de acerto geral
    if (attempts.length > 0) {
      const correctAttempts = attempts.filter(a => a.correct).length;
      const accuracy = Math.round((correctAttempts / attempts.length) * 100);
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

  const isModuleUnlocked = (module) => {
    // Primeiro módulo sempre desbloqueado
    if (module.order === 1) return true;
    
    // Verificar se todos os módulos anteriores foram completados
    const previousModules = modules.filter(m => m.order < module.order);
    return previousModules.every(m => progress[m.id]?.completed);
  };

  const getCompletionPercentage = (moduleId) => {
    const prog = progress[moduleId];
    if (!prog || !prog.totalPhases) return 0;
    return Math.round((prog.completedPhases / prog.totalPhases) * 100);
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

        {/* Modules List */}
        <div className="space-y-6">
          {/* Introduction Section */}
          {introContent && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="border-2 border-amber-300 shadow-xl bg-gradient-to-br from-amber-50 to-orange-50 hover:shadow-2xl transition-all duration-300">
                <CardContent className="p-8">
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Introduction Icon */}
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl shadow-lg bg-gradient-to-br from-amber-400 to-orange-500">
                      <Sparkles className="w-10 h-10" />
                    </div>

                    {/* Introduction Info */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-2xl font-bold text-gray-900">
                              Introdução ao ECG
                            </h3>
                            <Badge className="bg-amber-200 text-amber-900">
                              Recomendado
                            </Badge>
                          </div>
                          <p className="text-gray-600">
                            Comece sua jornada aprendendo os fundamentos do eletrocardiograma
                          </p>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="flex items-center justify-between mt-4">
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          <BookOpen className="w-4 h-4" />
                          Conteúdo introdutório essencial
                        </div>
                        <Button 
                          onClick={handleOpenIntro}
                          className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                        >
                          Ler Introdução
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {modules.map((module, index) => {
            const unlocked = isModuleUnlocked(module);
            const completed = progress[module.id]?.completed || false;
            const completionPercentage = getCompletionPercentage(module.id);

            return (
              <motion.div
                key={module.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (index + (introContent ? 1 : 0)) * 0.1 }}
              >
                <Card className={`border-none shadow-lg hover:shadow-xl transition-all duration-300 ${
                  !unlocked ? 'opacity-60' : ''
                }`}>
                  <CardContent className="p-8">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Module Icon */}
                      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl shadow-lg ${
                        completed
                          ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                          : unlocked
                            ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                            : 'bg-gray-400'
                      }`}>
                        {completed ? (
                          <CheckCircle className="w-10 h-10" />
                        ) : unlocked ? (
                          module.order
                        ) : (
                          <Lock className="w-8 h-8" />
                        )}
                      </div>

                      {/* Module Info */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">
                              {unlocked ? module.name : `Módulo ${module.order}`}
                            </h3>
                            <p className="text-gray-600">
                              {unlocked ? module.description : "Complete os módulos anteriores para desbloquear"}
                            </p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        {unlocked && (
                          <div className="mb-4">
                            <div className="flex justify-between text-sm text-gray-600 mb-2">
                              <span>Progresso</span>
                              <span>{completionPercentage}%</span>
                            </div>
                            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${completionPercentage}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-600"
                              />
                            </div>
                          </div>
                        )}

                        {/* Action Button */}
                        <div className="flex items-center justify-end">
                          {unlocked ? (
                            <Link to={`${createPageUrl("ModulePhases")}?id=${module.id}`}>
                              <Button className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700">
                                {completed ? 'Revisar' : 'Continuar'}
                                <ArrowRight className="w-4 h-4" />
                              </Button>
                            </Link>
                          ) : (
                            <Button disabled className="gap-2 bg-gray-300 cursor-not-allowed">
                              <Lock className="w-4 h-4" />
                              Bloqueado
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {modules?.length === 0 && (
            <Card className="border-none shadow-lg">
              <CardContent className="p-12 text-center">
                <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Nenhum módulo disponível ainda
                </h3>
                <p className="text-gray-600">
                  Novos módulos serão adicionados em breve!
                </p>
              </CardContent>
            </Card>
          )}
        </div>
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