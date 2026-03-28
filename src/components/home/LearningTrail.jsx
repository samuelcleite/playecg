import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Lock, CheckCircle2, PlayCircle, ChevronRight, BookOpen, Crown } from "lucide-react";
import { motion } from "framer-motion";

function getPhaseProgress(phase, moduleAttempts) {
  const phaseAttempts = moduleAttempts.filter(a => a.phase_id === phase.id);
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
  return { completed, total, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

export default function LearningTrail({ modules, phases, attempts, isPremium }) {
  const moduleAttempts = attempts.filter(a => a.quiz_type === "module");

  const trail = useMemo(() => {
    return modules.map(mod => {
      const modPhases = phases.filter(p => p.module_id === mod.id).sort((a, b) => a.order - b.order);
      const modAttempts = moduleAttempts.filter(a => a.module_id === mod.id);
      const phasesWithProgress = modPhases.map(phase => ({
        ...phase,
        ...getPhaseProgress(phase, modAttempts)
      }));
      const allDone = phasesWithProgress.length > 0 && phasesWithProgress.every(p => p.pct >= 100);
      const anyStarted = phasesWithProgress.some(p => p.pct > 0);
      return { module: mod, phases: phasesWithProgress, allDone, anyStarted };
    });
  }, [modules, phases, attempts]);

  const isModuleUnlocked = (mod) => {
    if (mod.order === 1) return true;
    const previous = trail.filter(item => item.module.order < mod.order);
    return previous.every(item => item.allDone);
  };

  const nextPhase = useMemo(() => {
    if (!isPremium) return null;
    for (const item of trail) {
      if (!isModuleUnlocked(item.module)) continue;
      for (const phase of item.phases) {
        if (phase.pct < 100) return { module: item.module, phase };
      }
    }
    return null;
  }, [trail, isPremium]);

  if (modules.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">Nenhum módulo disponível ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-purple-600" />
          Trilha de Aprendizado
        </h2>
        <Link to={createPageUrl("Modules")}>
          <Button variant="ghost" size="sm" className="text-purple-600 hover:text-purple-700 gap-1 text-xs">
            Ver todos <ChevronRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>

      {trail.map((item, idx) => {
        const unlocked = isModuleUnlocked(item.module);
        const isLocked = !isPremium || !unlocked;

        return (
          <motion.div
            key={item.module.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.06 }}
          >
            <div className={`rounded-2xl border-2 overflow-hidden transition-all w-full ${
              item.allDone
                ? "border-green-300 bg-white"
                : !isLocked && item.anyStarted
                  ? "border-purple-300 bg-white shadow-md"
                  : "border-gray-200 bg-white"
            } ${isLocked ? "opacity-60" : ""}`}>

              {/* Module Header */}
              <div className={`px-3 py-3 flex items-center gap-2 ${
                isLocked ? "bg-gray-50"
                  : item.allDone ? "bg-green-50"
                  : item.anyStarted ? "bg-purple-50"
                  : "bg-gray-50"
              }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                  item.allDone
                    ? "bg-green-500 text-white"
                    : isLocked
                      ? "bg-gray-300 text-gray-500"
                      : "bg-purple-500 text-white"
                }`}>
                  {item.allDone
                    ? "✓"
                    : isLocked
                      ? <Lock className="w-4 h-4" />
                      : (idx + 1)
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm truncate ${isLocked ? "text-gray-400" : "text-gray-900"}`}>
                    {unlocked ? item.module.name : `Módulo ${item.module.order}`}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {unlocked
                      ? item.module.description
                      : "Complete os módulos anteriores para desbloquear"}
                  </p>
                </div>

                {item.allDone && <Badge className="bg-green-100 text-green-800 text-xs flex-shrink-0">Concluído</Badge>}
                {!isPremium && (
                  <Link to={createPageUrl("Upgrade")} className="flex-shrink-0">
                    <Badge className="bg-amber-100 text-amber-800 text-xs cursor-pointer hover:bg-amber-200">
                      <Crown className="w-3 h-3 mr-1" />
                      Premium
                    </Badge>
                  </Link>
                )}
              </div>

              {/* Phases */}
              {!item.allDone && item.phases.length > 0 && (
                <div className="px-3 pb-4 pt-3 space-y-3">
                  {item.phases.map((phase, phaseIdx) => {
                    const isNext = !isLocked && nextPhase?.phase.id === phase.id;
                    const isDone = phase.pct >= 100;
                    const prevPhase = phaseIdx > 0 ? item.phases[phaseIdx - 1] : null;
                    const isAvailable = !isLocked && (phaseIdx === 0 || (prevPhase && prevPhase.pct >= 100));

                    return (
                      <div key={phase.id} className={`rounded-xl p-3 border transition-all ${
                        isLocked
                          ? "border-gray-100 bg-gray-50"
                          : isNext
                            ? "border-purple-400 bg-purple-50 shadow-sm"
                            : isDone
                              ? "border-green-200 bg-green-50"
                              : "border-gray-100 bg-gray-50"
                      }`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isLocked
                              ? "bg-gray-200 text-gray-400"
                              : isDone
                                ? "bg-green-500 text-white"
                                : isNext
                                  ? "bg-purple-600 text-white"
                                  : "bg-gray-300 text-gray-600"
                          }`}>
                            {isLocked
                              ? <Lock className="w-3 h-3" />
                              : isDone
                                ? <CheckCircle2 className="w-4 h-4" />
                                : isNext
                                  ? <PlayCircle className="w-4 h-4" />
                                  : <span className="text-xs font-bold">{phase.order}</span>
                            }
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className={`text-sm font-semibold truncate ${isLocked ? "text-gray-400" : "text-gray-900"}`}>
                                {isDone && !isLocked ? phase.name : `Fase ${phase.order}`}
                              </p>
                              {!isLocked && (
                                <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                                  {phase.completed}/{phase.total}
                                </span>
                              )}
                            </div>
                            {!isLocked && <Progress value={phase.pct} className="h-2" />}
                          </div>

                          {isAvailable && (
                            <Link
                              to={`${createPageUrl("ModuleDetail")}?module_id=${item.module.id}&phase_id=${phase.id}`}
                              className="flex-shrink-0"
                            >
                              <Button
                                size="sm"
                                className={`text-xs px-2 h-7 ${isNext
                                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                                  : isDone
                                    ? "bg-green-600 hover:bg-green-700 text-white"
                                    : "bg-gray-500 hover:bg-gray-600 text-white"
                                }`}
                              >
                                {isDone ? "Revisar" : isNext ? "Continuar" : "Iniciar"}
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!isLocked && item.phases.length === 0 && (
                <div className="px-4 pb-4 pt-2">
                  <p className="text-xs text-gray-400 text-center py-2">Nenhuma fase neste módulo ainda.</p>
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}