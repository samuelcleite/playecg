import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BookOpen,
  Loader2,
  Sparkles,
  FolderOpen,
  Layers,
  ChevronRight,
  Crown,
  Lock
} from "lucide-react";
import { motion } from "framer-motion";

export default function AprendaECG() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [introContent, setIntroContent] = useState(null);
  const [moduleContents, setModuleContents] = useState([]);
  const [modules, setModules] = useState([]);
  const [phases, setPhases] = useState([]);
  const [unlockedModuleIds, setUnlockedModuleIds] = useState(new Set());
  const [unlockedPhaseIds, setUnlockedPhaseIds] = useState(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const userData = await base44.auth.me();
    setUser(userData);

    const [contentsData, modulesData, phasesData, attemptsData] = await Promise.all([
      base44.entities.Content.list(),
      base44.entities.Module.list("order"),
      base44.entities.Phase.list("order"),
      base44.entities.QuizAttempt.filter({ user_email: userData.email, quiz_type: "module" }, "-created_date", 500)
    ]);

    // Separar introdução
    const intro = contentsData.find(c => !c.module_id && !c.phase_id);
    setIntroContent(intro);

    // Organizar conteúdos por módulo
    const contentsByModule = {};
    
    contentsData.forEach(content => {
      if (content.module_id) {
        if (!contentsByModule[content.module_id]) {
          contentsByModule[content.module_id] = {
            moduleContent: null,
            phaseContents: []
          };
        }

        if (!content.phase_id) {
          contentsByModule[content.module_id].moduleContent = content;
        } else {
          contentsByModule[content.module_id].phaseContents.push(content);
        }
      }
    });

    // Calcular progresso por fase
    const getPhaseProgress = (phase) => {
      const phaseAttempts = attemptsData.filter(a => a.phase_id === phase.id);
      const byCase = {};
      phaseAttempts.forEach(att => {
        if (!byCase[att.case_id]) byCase[att.case_id] = [];
        byCase[att.case_id].push(att);
      });
      let completed = 0;
      Object.values(byCase).forEach(caseAtts => {
        if (caseAtts.some(a => a.correct) || caseAtts.length >= 3) completed++;
      });
      const total = phase.total_cases || 0;
      return { completed, total, done: total > 0 && completed >= total };
    };

    // Determinar módulos e fases desbloqueadas
    const sortedModules = [...modulesData].sort((a, b) => a.order - b.order);
    const sortedPhases = [...phasesData].sort((a, b) => a.order - b.order);

    const unlockedMods = new Set();
    const unlockedPhases = new Set();

    for (const mod of sortedModules) {
      // Módulo 1 sempre desbloqueado
      if (mod.order === 1) {
        unlockedMods.add(mod.id);
      } else {
        // Módulo desbloqueado se todos anteriores estão completos
        const prevModules = sortedModules.filter(m => m.order < mod.order);
        const allPrevDone = prevModules.every(prevMod => {
          const prevPhases = sortedPhases.filter(p => p.module_id === prevMod.id);
          return prevPhases.length > 0 && prevPhases.every(p => getPhaseProgress(p).done);
        });
        if (allPrevDone) unlockedMods.add(mod.id);
      }

      if (!unlockedMods.has(mod.id)) continue;

      // Fases do módulo: desbloquear sequencialmente
      const modPhases = sortedPhases.filter(p => p.module_id === mod.id).sort((a, b) => a.order - b.order);
      for (let i = 0; i < modPhases.length; i++) {
        if (i === 0) {
          // Primeira fase sempre desbloqueada se módulo desbloqueado
          unlockedPhases.add(modPhases[i].id);
        } else {
          // Fase i desbloqueada se fase i-1 está completa
          if (getPhaseProgress(modPhases[i - 1]).done) {
            unlockedPhases.add(modPhases[i].id);
          } else {
            break; // Fases seguintes também bloqueadas
          }
        }
      }
    }

    setUnlockedModuleIds(unlockedMods);
    setUnlockedPhaseIds(unlockedPhases);
    setModuleContents(contentsByModule);
    setModules(modulesData);
    setPhases(phasesData);
    setLoading(false);
  };

  const getModuleName = (moduleId) => {
    const module = modules.find(m => m.id === moduleId);
    return module?.name || "Módulo";
  };

  const getPhaseName = (phaseId) => {
    const phase = phases.find(p => p.id === phaseId);
    return phase?.name || "Fase";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#1976D2] mx-auto mb-4" />
          <p className="text-gray-600">Carregando conteúdos...</p>
        </div>
      </div>
    );
  }

  const isPremium = user?.subscription_type === "premium";

  if (!isPremium) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <Card className="max-w-lg border-2 border-amber-200 shadow-xl">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Lock className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Conteúdo Premium
            </h2>
            <p className="text-gray-600 mb-6 text-lg">
              Esta seção de conteúdo educacional é exclusiva para usuários Premium.
            </p>
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center justify-center gap-2">
                <Crown className="w-5 h-5 text-amber-600" />
                Com Premium você tem acesso a:
              </h3>
              <ul className="text-left space-y-2 text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>Conteúdo educacional completo sobre ECG</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>Módulos estruturados por tema</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>Explicações detalhadas de cada fase</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>Trilha de aprendizado progressiva</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>Gamificação e conquistas avançadas</span>
                </li>
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <Link to={createPageUrl("Upgrade")} className="w-full">
                <Button className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-lg py-6 gap-2">
                  <Crown className="w-5 h-5" />
                  Assinar Premium
                </Button>
              </Link>
              <Button variant="outline" onClick={() => navigate(createPageUrl("Dashboard"))}>
                Voltar ao Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8 pb-28 md:pb-8" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 20px))' }}>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Aprenda ECG
          </h1>
          <p className="text-gray-600 text-lg">
            Todo o conteúdo educacional organizado para você
          </p>
        </div>

        {/* Introdução ao ECG */}
        {introContent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link to={`${createPageUrl("ConteudoECG")}?type=intro`}>
              <Card className="border-2 border-amber-300 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 hover:shadow-xl transition-all cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">
                          Introdução ao ECG
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Fundamentos essenciais para começar
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-6 h-6 text-amber-600" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        )}

        {/* Conteúdos por Módulo */}
        <div className="space-y-6">
          {modules.map((module, index) => {
            const moduleData = moduleContents[module.id];
            if (!moduleData) return null;

            const isModuleUnlocked = unlockedModuleIds.has(module.id);

            const modulePhasesOrdered = phases
              .filter(p => p.module_id === module.id)
              .sort((a, b) => a.order - b.order);

            return (
              <motion.div
                key={module.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`border-none shadow-lg ${!isModuleUnlocked ? "opacity-60" : ""}`}>
                  <Accordion type="single" collapsible className="w-full" disabled={!isModuleUnlocked}>
                    <AccordionItem value="module" className="border-none">
                      <AccordionTrigger className={`hover:no-underline px-6 py-4 ${isModuleUnlocked ? "bg-blue-50" : "bg-gray-50 cursor-not-allowed"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${isModuleUnlocked ? "bg-[#1976D2]" : "bg-gray-400"}`}>
                            {isModuleUnlocked ? module.order : <Lock className="w-5 h-5" />}
                          </div>
                          <div className="text-left">
                            <div className="flex items-center gap-2">
                              <FolderOpen className={`w-5 h-5 ${isModuleUnlocked ? "text-[#1976D2]" : "text-gray-400"}`} />
                              <h3 className={`text-xl font-bold ${isModuleUnlocked ? "text-gray-900" : "text-gray-500"}`}>{module.name}</h3>
                            </div>
                            {!isModuleUnlocked && (
                              <p className="text-xs text-gray-400 mt-1">Complete os módulos anteriores para desbloquear</p>
                            )}
                            {isModuleUnlocked && module.description && (
                              <p className="text-sm text-gray-600 mt-1">{module.description}</p>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      {isModuleUnlocked && (
                        <AccordionContent className="px-6 pb-6 pt-4">
                          <div className="space-y-3">
                            {/* Link para Conteúdo Geral do Módulo */}
                            {moduleData.moduleContent && (
                              <Link to={`${createPageUrl("ConteudoECG")}?type=module&module_id=${module.id}`}>
                                <div className="p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 transition-all cursor-pointer">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <BookOpen className="w-5 h-5 text-[#1976D2]" />
                                      <div>
                                        <p className="font-semibold text-gray-900">Conteúdo do Módulo</p>
                                        <p className="text-sm text-gray-600">Visão geral e fundamentos</p>
                                      </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-[#1976D2]" />
                                  </div>
                                </div>
                              </Link>
                            )}

                            {/* Links para Conteúdos por Fase */}
                            {moduleData.phaseContents.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="font-semibold text-gray-900 flex items-center gap-2 mt-4 mb-2">
                                  <Layers className="w-5 h-5 text-[#0D3B66]" />
                                  Fases do Módulo
                                </h4>
                                {modulePhasesOrdered.map(phase => {
                                  const phaseContent = moduleData.phaseContents.find(
                                    pc => pc.phase_id === phase.id
                                  );
                                  if (!phaseContent) return null;

                                  const isPhaseUnlocked = unlockedPhaseIds.has(phase.id);

                                  if (!isPhaseUnlocked) {
                                    return (
                                      <div key={phase.id} className="p-4 border-2 border-gray-200 rounded-lg bg-gray-50 opacity-60 cursor-not-allowed">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400">
                                              <Lock className="w-4 h-4" />
                                            </div>
                                            <div>
                                              <p className="font-semibold text-gray-400">{phase.name}</p>
                                              <p className="text-xs text-gray-400">Complete a fase anterior para desbloquear</p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <Link
                                      key={phase.id}
                                      to={`${createPageUrl("ConteudoECG")}?type=phase&module_id=${module.id}&phase_id=${phase.id}`}
                                    >
                                      <div className="p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 transition-all cursor-pointer">
                                       <div className="flex items-center justify-between">
                                         <div className="flex items-center gap-3">
                                           <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-[#0D3B66] font-bold text-sm">
                                              {phase.order}
                                            </div>
                                            <div>
                                              <p className="font-semibold text-gray-900">{phase.name}</p>
                                              <p className="text-sm text-gray-600">Conteúdo da fase</p>
                                            </div>
                                          </div>
                                          <ChevronRight className="w-5 h-5 text-[#1976D2]" />
                                        </div>
                                      </div>
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      )}
                    </AccordionItem>
                  </Accordion>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Empty State */}
        {!introContent && modules.length === 0 && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Nenhum conteúdo disponível
              </h3>
              <p className="text-gray-600">
                Os conteúdos educacionais serão adicionados em breve!
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}