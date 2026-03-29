import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Lock, CheckCircle, PlayCircle, Star, ChevronRight, BookOpen, Crown, Zap } from "lucide-react";
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

const MODULE_COLORS = [
  { bg: "from-violet-500 to-purple-600", light: "bg-violet-100", border: "border-violet-300", text: "text-violet-700", dot: "bg-violet-500", path: "border-violet-300" },
  { bg: "from-blue-500 to-indigo-600", light: "bg-blue-100", border: "border-blue-300", text: "text-blue-700", dot: "bg-blue-500", path: "border-blue-300" },
  { bg: "from-emerald-500 to-green-600", light: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-700", dot: "bg-emerald-500", path: "border-emerald-300" },
  { bg: "from-orange-500 to-amber-600", light: "bg-orange-100", border: "border-orange-300", text: "text-orange-700", dot: "bg-orange-500", path: "border-orange-300" },
  { bg: "from-pink-500 to-rose-600", light: "bg-pink-100", border: "border-pink-300", text: "text-pink-700", dot: "bg-pink-500", path: "border-pink-300" },
];

function getColor(idx) {
  return MODULE_COLORS[idx % MODULE_COLORS.length];
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
    <div className="w-full space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
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
        const color = getColor(idx);

        return (
          <motion.div
            key={item.module.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.07 }}
            className="w-full"
          >
            {/* Module Banner */}
            <div className={`relative rounded-2xl overflow-hidden mb-1 ${isLocked ? "opacity-60" : ""}`}>
              <div className={`bg-gradient-to-r ${isLocked ? "from-gray-400 to-gray-500" : item.allDone ? "from-green-500 to-emerald-600" : color.bg} px-4 py-3 flex items-center gap-3`}>
                {/* Module number badge */}
                <div className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0 text-white font-bold text-base">
                  {item.allDone ? <CheckCircle className="w-5 h-5" /> : isLocked ? <Lock className="w-4 h-4" /> : item.module.order}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">
                    {unlocked ? item.module.name : `Módulo ${item.module.order}`}
                  </p>
                  {unlocked && !item.allDone && (
                    <p className="text-white/75 text-xs truncate">{item.module.description}</p>
                  )}
                  {item.allDone && (
                    <p className="text-white/90 text-xs flex items-center gap-1">
                      <Star className="w-3 h-3 fill-white" /> Concluído!
                    </p>
                  )}
                  {isLocked && !isPremium && (
                    <p className="text-white/80 text-xs flex items-center gap-1">
                      <Crown className="w-3 h-3" /> Requer Premium
                    </p>
                  )}
                  {isLocked && isPremium && (
                    <p className="text-white/80 text-xs">Complete os módulos anteriores</p>
                  )}
                </div>
                {!isPremium && (
                  <Link to={createPageUrl("Upgrade")} className="flex-shrink-0">
                    <span className="bg-amber-400 text-amber-900 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      <Crown className="w-3 h-3" /> Premium
                    </span>
                  </Link>
                )}
              </div>

              {/* Progress bar for module */}
              {!isLocked && !item.allDone && item.anyStarted && (
                <div className="h-1.5 bg-white/20 absolute bottom-0 left-0 right-0">
                  <div
                    className="h-full bg-white/60 transition-all duration-700"
                    style={{ width: `${Math.round((item.phases.filter(p => p.pct >= 100).length / item.phases.length) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            {/* Phases trail — only show if not all done */}
            {!item.allDone && item.phases.length > 0 && (
              <div className="ml-4 pl-4 border-l-2 border-dashed border-gray-200 space-y-2 pb-3">
                {item.phases.map((phase, phaseIdx) => {
                  const isNext = !isLocked && nextPhase?.phase.id === phase.id;
                  const isDone = phase.pct >= 100;
                  const prevPhase = phaseIdx > 0 ? item.phases[phaseIdx - 1] : null;
                  const isAvailable = !isLocked && (phaseIdx === 0 || (prevPhase && prevPhase.pct >= 100));
                  const isBlocked = !isAvailable && !isDone;

                  return (
                    <div key={phase.id} className="relative">
                      {/* Connector dot */}
                      <div className={`absolute -left-[21px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white ${
                        isDone ? "bg-green-500" : isNext ? color.dot : isBlocked ? "bg-gray-300" : "bg-gray-400"
                      }`} />

                      <motion.div
                        whileHover={isAvailable ? { scale: 1.01 } : {}}
                        className={`rounded-xl border-2 p-3 flex items-center gap-3 transition-all ${
                          isDone
                            ? "border-green-200 bg-green-50"
                            : isNext
                              ? `${color.border} ${color.light} shadow-md`
                              : isBlocked
                                ? "border-gray-100 bg-gray-50 opacity-50"
                                : "border-gray-200 bg-white"
                        }`}
                      >
                        {/* Phase icon */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold ${
                          isDone
                            ? "bg-green-500"
                            : isNext
                              ? `bg-gradient-to-br ${color.bg}`
                              : isBlocked
                                ? "bg-gray-200 text-gray-400"
                                : "bg-gray-300 text-gray-600"
                        }`}>
                          {isDone
                            ? <Star className="w-5 h-5 fill-white" />
                            : isBlocked
                              ? <Lock className="w-4 h-4 text-gray-400" />
                              : isNext
                                ? <PlayCircle className="w-5 h-5" />
                                : <span className="text-sm">{phase.order}</span>
                          }
                        </div>

                        {/* Phase info */}
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm truncate ${isBlocked ? "text-gray-400" : "text-gray-800"}`}>
                            {isBlocked ? `Fase ${phase.order}` : phase.name || `Fase ${phase.order}`}
                          </p>
                          {!isBlocked && (
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ${isDone ? "bg-green-500" : color.dot}`}
                                  style={{ width: `${phase.pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 flex-shrink-0">{phase.completed}/{phase.total}</span>
                            </div>
                          )}
                        </div>

                        {/* CTA button */}
                        {isAvailable && (
                          <Link
                            to={`${createPageUrl("ModuleDetail")}?module_id=${item.module.id}&phase_id=${phase.id}`}
                            className="flex-shrink-0"
                          >
                            <Button
                              size="sm"
                              className={`text-xs h-8 px-3 font-bold ${
                                isDone
                                  ? "bg-green-500 hover:bg-green-600 text-white"
                                  : isNext
                                    ? `bg-gradient-to-r ${color.bg} text-white shadow-md`
                                    : "bg-gray-500 hover:bg-gray-600 text-white"
                              }`}
                            >
                              {isDone ? "Revisar" : isNext ? <><Zap className="w-3 h-3 mr-1" />Continuar</> : "Iniciar"}
                            </Button>
                          </Link>
                        )}
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* All done celebration */}
            {item.allDone && (
              <div className="ml-4 pl-4 py-2 flex items-center gap-2 text-green-700 text-sm font-medium">
                <Star className="w-4 h-4 fill-green-500 text-green-500" />
                <Star className="w-4 h-4 fill-green-500 text-green-500" />
                <Star className="w-4 h-4 fill-green-500 text-green-500" />
                <span className="text-xs text-green-600">Módulo completo!</span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}