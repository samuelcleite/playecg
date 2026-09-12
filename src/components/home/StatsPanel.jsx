import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Cartao, IconeQuadrado } from "@/components/Cartao";
import { Flame, ChevronRight } from "lucide-react";
import PremiumUpsellCard from "@/components/home/PremiumUpsellCard";

// Coluna de informação da tela inicial no desktop. O card "Suas Estatísticas"
// foi removido em 08/08/2026: os números vinham errados, e métrica furada é
// pior que métrica nenhuma. Sobraram a sequência e os troféus.
export default function StatsPanel({ streakDays, earnedAchievements, isPremium }) {
  return (
    <div className="flex flex-col gap-3">
      <Cartao>
        <div className="flex items-center gap-3.5">
          <IconeQuadrado Icone={Flame} tom="laranja" tamanho={48} />
          <div className="min-w-0">
            <p className="text-xl font-black text-ecg-midnight">
              {streakDays} {streakDays === 1 ? "dia" : "dias"}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-[#6B7785]">seguidos estudando</p>
          </div>
        </div>
        {streakDays === 0 && (
          <p className="mt-3 rounded-xl bg-[#FFF1E6] px-3 py-2 text-xs font-bold text-[#C2410C]">
            Pratique hoje para iniciar sua sequência! 🔥
          </p>
        )}
      </Cartao>

      <Cartao>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[15px] font-black text-ecg-midnight">Troféus</p>
          <Link
            to={createPageUrl("Achievements")}
            className="flex flex-none items-center gap-0.5 text-xs font-extrabold text-ecg-midnight-2"
          >
            Ver todos
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {earnedAchievements.length === 0 ? (
          <div className="py-3 text-center">
            <p className="mb-1 text-2xl">🏆</p>
            <p className="text-xs font-semibold text-[#6B7785]">Nenhum troféu ainda.</p>
            <p className="text-xs font-semibold text-[#9AA6B2]">Continue praticando!</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {earnedAchievements.slice(0, 8).map((ach) => (
              <div
                key={ach.id}
                title={ach.name}
                className="flex aspect-square w-full items-center justify-center rounded-[14px] bg-[#E6F9EC] text-2xl"
              >
                {ach.icon}
              </div>
            ))}
            {earnedAchievements.length > 8 && (
              <div className="flex aspect-square w-full items-center justify-center rounded-[14px] bg-[#EDF1F4] text-xs font-extrabold text-[#6B7785]">
                +{earnedAchievements.length - 8}
              </div>
            )}
          </div>
        )}
      </Cartao>

      {!isPremium && <PremiumUpsellCard />}
    </div>
  );
}
