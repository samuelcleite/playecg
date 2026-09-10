import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { getCurrentUser } from '@/lib/currentUser';
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { loadUserAchievements } from "@/components/AchievementChecker";
import AchievementsMobile from "@/components/conquistas/AchievementsMobile";

import FaleConoscoButton from "@/components/FaleConoscoButton";
import { Loader2 } from "lucide-react";

export default function Achievements() {
  const [user, setUser] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const isRefreshing = usePullToRefresh(loadData, containerRef);

  async function loadData() {
    const userData = await getCurrentUser();
    setUser(userData);

    // As duas chamadas não dependem uma da outra — em sequência, a tela
    // esperava dois round-trips antes de mostrar qualquer troféu.
    const [resAttempts, userAchievements] = await Promise.all([
      base44.functions.invoke('getMyQuizAttempts', { sort: '-created_date', limit: 500 }),
      loadUserAchievements(userData),
    ]);
    const attempts = resAttempts?.data?.attempts || [];

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

    // O cálculo de statsData saiu com o painel de estatísticas: nada na tela
    // lia esses números. O getMyQuizAttempts acima segue necessário — é dele
    // que sai o streak.

    setAchievements(userAchievements);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="font-nunito flex min-h-full items-center justify-center bg-[#F4F6F8] py-24">
        <Loader2 className="h-10 w-10 animate-spin text-ecg-midnight-2" />
      </div>
    );
  }

  // O componente recebe os troféus já agrupados e no formato dele — a página
  // é quem conhece o Achievement do banco.
  const paraItem = (a) => ({
    id: a.id,
    nome: a.name,
    descricao: a.description,
    emoji: a.icon,
    conquistado: !!a.earned,
  });
  const grupos = [
    { titulo: "INTENSIDADE", itens: achievements.filter(a => a.achievement_type === "intensity").map(paraItem) },
    { titulo: "ESPECIALIZAÇÃO", itens: achievements.filter(a => a.achievement_type === "specialization").map(paraItem) },
  ].filter(g => g.itens.length > 0);

  return (
    <div ref={containerRef} className="relative min-h-full">
      {isRefreshing && (
        <div className="flex justify-center py-3 absolute top-0 left-0 right-0 z-50">
          <Loader2 className="animate-spin text-gray-400 w-6 h-6" />
        </div>
      )}
      <AchievementsMobile
        ofensiva={streak}
        conquistados={achievements.filter(a => a.earned).length}
        total={achievements.length}
        grupos={grupos}
      />
      <FaleConoscoButton />
    </div>
  );
}
