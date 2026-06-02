import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { base44 } from "@/api/base44Client";
import { loadUserAchievements } from "@/components/AchievementChecker";

import FaleConoscoButton from "@/components/FaleConoscoButton";
import { Progress } from "@/components/ui/progress";
import { Trophy, Loader2, Flame, Target, CheckCircle2, Star, BookOpen } from "lucide-react";
import { motion } from "framer-motion";

export default function Achievements() {
  const [user, setUser] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [stats, setStats] = useState(null);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null); // { id, name, description, earned }

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const userData = await base44.auth.me();
    setUser(userData);

    const attempts = await base44.entities.QuizAttempt.filter({ user_email: userData.email }, "-created_date", 500);

    // Calcular streak localmente, sem chamada extra
    const uniqueDates = [...new Set(attempts.map(a => new Date(a.created_date).toISOString().split('T')[0]))].sort().reverse();
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    let streakDays = 0;
    if (uniqueDates.length > 0 && (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr)) {
      let cur = new Date(today);
      for (const d of uniqueDates) {
        const diff = Math.floor((cur - new Date(d + 'T00:00:00')) / 86400000);
        if (diff === 0 || diff === 1) { streakDays++; cur = new Date(d + 'T00:00:00'); } else break;
      }
    }
    setStreak(streakDays);
    const correctCount = attempts.filter(a => a.correct).length;

    const statsData = {
      totalAttempts: attempts?.length || 0,
      correctAnswers: correctCount || 0,
      accuracy: attempts?.length > 0 ? Math.round((correctCount / attempts.length) * 100) : 0,
      totalPoints: userData.points || 0,
    };

    setStats(statsData);

    const userAchievements = await loadUserAchievements(userData);
    setAchievements(userAchievements);
    setLoading(false);
  };

  const earnedCount = achievements.filter(a => a.earned).length;
  const totalCount = achievements.length;
  const completionPercentage = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

  const intensityAchievements = achievements.filter(a => a.achievement_type === "intensity");
  const specializationAchievements = achievements.filter(a => a.achievement_type === "specialization");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-[#1976D2]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8" onClick={() => setTooltip(null)}>
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center pt-2">
          <div className="w-20 h-20 bg-gradient-to-br from-[#1976D2] to-[#0D3B66] rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Troféus</h1>
          <p className="text-gray-500 text-sm">{earnedCount} de {totalCount} conquistados</p>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 rounded-2xl p-4 text-center">
              <Flame className="w-6 h-6 text-orange-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-orange-600">{streak}</p>
              <p className="text-xs text-gray-500 mt-0.5">Dias seguidos</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
              <Target className="w-6 h-6 text-blue-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-blue-600">{stats.totalAttempts}</p>
              <p className="text-xs text-gray-500 mt-0.5">Questões respondidas</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-4 text-center">
              <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-green-600">{stats.accuracy}%</p>
              <p className="text-xs text-gray-500 mt-0.5">Taxa de acerto</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
              <BookOpen className="w-6 h-6 text-[#1976D2] mx-auto mb-1" />
              <p className="text-2xl font-bold text-[#1976D2]">{stats.completedModules}</p>
              <p className="text-xs text-gray-500 mt-0.5">Fases concluídas</p>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Progresso geral</span>
            <span className="font-bold text-[#1976D2]">{completionPercentage}%</span>
          </div>
          <Progress value={completionPercentage} className="h-3 rounded-full" />
        </div>

        {/* Section renderer */}
        {[
          { label: "INTENSIDADE", items: intensityAchievements },
          { label: "ESPECIALIZAÇÃO", items: specializationAchievements },
        ].map(section => section.items.length > 0 && (
          <div key={section.label}>
            <p className="text-xs font-bold text-gray-400 tracking-widest mb-4">{section.label}</p>
            <div className="grid grid-cols-4 gap-4">
              {section.items.map((achievement, index) => (
                <AchievementBadge
                  key={achievement.id}
                  achievement={achievement}
                  index={index}
                  tooltip={tooltip}
                  setTooltip={setTooltip}
                />
              ))}
            </div>
          </div>
        ))}

        {achievements.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Trophy className="w-14 h-14 mx-auto mb-3 opacity-30" />
            <p>Nenhum troféu disponível ainda</p>
          </div>
        )}

      </div>
      <FaleConoscoButton />
    </div>
  );
}

function AchievementBadge({ achievement, index, tooltip, setTooltip }) {
  const isOpen = tooltip?.id === achievement.id;
  const btnRef = useRef(null);
  const [tooltipPos, setTooltipPos] = useState({ left: 0, top: 0 });

  const handleClick = (e) => {
    e.stopPropagation();
    if (!isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setTooltipPos({
        left: rect.left + rect.width / 2,
        top: rect.top + window.scrollY - 12,
      });
    }
    setTooltip(isOpen ? null : {
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      earned: achievement.earned,
    });
  };

  const tooltipEl = isOpen ? ReactDOM.createPortal(
    <div
      style={{
        position: 'absolute',
        left: tooltipPos.left,
        top: tooltipPos.top,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999,
        width: '176px',
      }}
      className="bg-white rounded-2xl shadow-xl border border-blue-100 p-3 text-center pointer-events-none"
    >
      <div className="text-3xl mb-1">{achievement.icon}</div>
      <p className="font-bold text-gray-900 text-sm mb-1">{achievement.name}</p>
      <p className="text-xs text-gray-500 leading-snug">{achievement.description}</p>
      {achievement.earned ? (
        <span className="inline-block mt-2 text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Conquistado ✓</span>
      ) : (
        <span className="inline-block mt-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Bloqueado 🔒</span>
      )}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-r border-b border-blue-100 rotate-45" />
    </div>,
    document.body
  ) : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 300, damping: 20 }}
      className="flex flex-col items-center gap-1"
    >
      <button
        ref={btnRef}
        onClick={handleClick}
        className={`
          relative w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center text-3xl md:text-4xl
          transition-all duration-200 border-4 shadow-md
          ${achievement.earned
            ? 'border-[#1976D2] bg-blue-50 shadow-blue-200 scale-100 hover:scale-105'
            : 'border-gray-200 bg-gray-100 grayscale opacity-50 hover:opacity-70'
          }
        `}
      >
        {achievement.icon}
        {achievement.earned && (
          <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
            <span className="text-white text-[9px] font-bold">✓</span>
          </span>
        )}
      </button>

      <span className={`text-[10px] text-center leading-tight font-medium max-w-[72px] ${achievement.earned ? 'text-gray-700' : 'text-gray-400'}`}>
        {achievement.name}
      </span>

      {tooltipEl}
    </motion.div>
  );
}