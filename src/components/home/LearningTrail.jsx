import React, { useMemo, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Lock, CheckCircle, Star, Play, BookOpen, ChevronRight, Crown, Heart } from "lucide-react";
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

// X positions as percentage for zigzag path
const ZIGZAG_X = [50, 72, 50, 28, 50, 72];
const NODE_SIZE = 64;
const Y_STEP = 130;

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

  const nextPhaseRef = useRef(null);

  useEffect(() => {
    if (nextPhaseRef.current) {
      setTimeout(() => {
        nextPhaseRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 400);
    }
  }, [nextPhase?.phase?.id]);

  if (modules.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">Nenhum módulo disponível ainda.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-purple-600" />
          Trilha de Aprendizado
        </h2>
        <Link to={createPageUrl("Modules")}>
          <button className="text-purple-600 hover:text-purple-700 text-xs font-medium flex items-center gap-0.5">
            Ver todos <ChevronRight className="w-3 h-3" />
          </button>
        </Link>
      </div>



      <div className="space-y-8">
        {trail.map((item, modIdx) => {
          const unlocked = isModuleUnlocked(item.module);
          const isLocked = !isPremium || !unlocked;
          const trailHeight = item.phases.length * Y_STEP + NODE_SIZE + 40;

          return (
            <motion.div
              key={item.module.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: modIdx * 0.08 }}
            >
              {/* Module label */}
              <div className="flex items-center gap-2 mb-4">
                <div className={`h-px flex-1 ${isLocked ? "bg-gray-200" : "bg-purple-200"}`} />
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  item.allDone
                    ? "bg-red-100 text-red-600"
                    : isLocked
                      ? "bg-gray-100 text-gray-400"
                      : "bg-purple-100 text-purple-700"
                }`}>
                  {isLocked && !isPremium && <Crown className="w-3 h-3 inline mr-1" />}
                  {isLocked && isPremium && <Lock className="w-3 h-3 inline mr-1" />}
                  {item.allDone && <Heart className="w-3 h-3 inline mr-1 fill-red-500 text-red-500" />}
                  {unlocked ? item.module.name : `Módulo ${item.module.order}`}
                </span>
                <div className={`h-px flex-1 ${isLocked ? "bg-gray-200" : "bg-purple-200"}`} />
              </div>

              {/* Phase nodes - path layout */}
              <div className="relative w-full" style={{ height: trailHeight }}>
                {/* SVG diagonal connectors */}
                <svg
                  className="absolute inset-0 w-full pointer-events-none"
                  style={{ height: trailHeight }}
                  viewBox={`0 0 300 ${trailHeight}`}
                  preserveAspectRatio="none"
                >
                  {item.phases.map((phase, phaseIdx) => {
                    if (phaseIdx === 0) return null;
                    const xPrev = (ZIGZAG_X[(phaseIdx - 1) % ZIGZAG_X.length] / 100) * 300;
                    const xCurr = (ZIGZAG_X[phaseIdx % ZIGZAG_X.length] / 100) * 300;
                    const y1 = (phaseIdx - 1) * Y_STEP + NODE_SIZE / 2;
                    const y2 = phaseIdx * Y_STEP + NODE_SIZE / 2;
                    const cy1 = y1 + Y_STEP * 0.5;
                    const cy2 = y2 - Y_STEP * 0.5;
                    return (
                      <path
                        key={phase.id + "_line"}
                        d={`M ${xPrev} ${y1} C ${xPrev} ${cy1} ${xCurr} ${cy2} ${xCurr} ${y2}`}
                        fill="none"
                        stroke="#d1d5db"
                        strokeWidth="3"
                        strokeDasharray="8 6"
                        strokeLinecap="round"
                        opacity="0.7"
                      />
                    );
                  })}
                </svg>

                {item.phases.map((phase, phaseIdx) => {
                  const isNext = !isLocked && nextPhase?.phase.id === phase.id;
                  const isDone = phase.pct >= 100;
                  const prevPhase = phaseIdx > 0 ? item.phases[phaseIdx - 1] : null;
                  const isAvailable = !isLocked && (phaseIdx === 0 || (prevPhase && prevPhase.pct >= 100));
                  const isBlocked = isLocked || (!isDone && !isAvailable);
                  const xPct = ZIGZAG_X[phaseIdx % ZIGZAG_X.length];
                  const yPos = phaseIdx * Y_STEP;

                  return (
                    <div
                      key={phase.id}
                      ref={isNext ? nextPhaseRef : null}
                      className="absolute flex flex-col items-center"
                      style={{
                        left: `${xPct}%`,
                        top: yPos,
                        transform: "translateX(-50%)"
                      }}
                    >
                      {isAvailable ? (
                        <Link to={`${createPageUrl("ModuleDetail")}?module_id=${item.module.id}&phase_id=${phase.id}`}>
                          <PhaseNode
                            phase={phase}
                            isDone={isDone}
                            isNext={isNext}
                            isBlocked={false}
                            phaseIdx={phaseIdx}
                          />
                        </Link>
                      ) : (
                        <PhaseNode
                          phase={phase}
                          isDone={isDone}
                          isNext={false}
                          isBlocked={isBlocked}
                          phaseIdx={phaseIdx}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function PhaseNode({ phase, isDone, isNext, isBlocked, phaseIdx }) {
  return (
    <motion.div
      whileHover={!isBlocked ? { scale: 1.08 } : {}}
      whileTap={!isBlocked ? { scale: 0.95 } : {}}
      className="flex flex-col items-center gap-1.5"
    >
      {/* Pulse ring for "next" */}
      <div className="relative">
        {isNext && (
          <span className="absolute inset-0 rounded-full bg-purple-400 animate-ping opacity-30" />
        )}
        <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md border-4 transition-all ${
          isDone
            ? "bg-red-500 border-red-300"
            : isNext
              ? "bg-purple-600 border-purple-300 shadow-purple-200 shadow-lg"
              : isBlocked
                ? "bg-gray-200 border-gray-100"
                : "bg-indigo-400 border-indigo-200"
        }`}>
          {isDone
            ? <Heart className="w-7 h-7 text-white fill-white" />
            : isBlocked
              ? <Lock className="w-6 h-6 text-gray-400" />
              : isNext
                ? <Play className="w-6 h-6 text-white fill-white" />
                : <span className="text-white font-bold text-lg">{phaseIdx + 1}</span>
          }
        </div>
      </div>

      {/* Phase label */}
      <span className={`text-xs font-semibold text-center max-w-[72px] leading-tight ${
        isBlocked ? "text-gray-400" : isDone ? "text-red-600" : isNext ? "text-purple-700" : "text-gray-600"
      }`}>
        {isBlocked ? `Fase ${phase.order}` : phase.name || `Fase ${phase.order}`}
      </span>

      {/* Progress dots */}
      {!isBlocked && !isDone && (
        <div className="flex gap-0.5">
          {Array.from({ length: Math.min(phase.total, 8) }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${
                i < Math.round((phase.pct / 100) * Math.min(phase.total, 8))
                  ? "bg-purple-500"
                  : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}