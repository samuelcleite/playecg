import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

// Chamada do Premium da tela inicial, no padrão do redesenho. Vive num
// componente próprio porque o Dashboard mobile e o painel do desktop
// (StatsPanel) mostram a mesma peça — quando o texto muda, muda nos dois.
export default function PremiumUpsellCard() {
  return (
    <section className="flex items-center gap-3.5 rounded-[20px] bg-ecg-midnight p-[18px]">
      <img
        src="https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/2f88aa807_image.png"
        alt=""
        className="block w-16 flex-none"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-black text-ecg-green">Libere os 8 módulos</p>
        <p className="mb-2 mt-0.5 text-xs font-semibold leading-relaxed text-white/75">
          Trilha completa e material teórico por R$59/mês
        </p>
        <Link
          to={createPageUrl("Upgrade")}
          className="inline-block rounded-[11px] bg-ecg-green px-4 py-2.5 text-[13px] font-black text-ecg-midnight shadow-[0_3px_0_#16a34a] transition-transform active:translate-y-[2px] active:shadow-[0_1px_0_#16a34a]"
        >
          ASSINAR
        </Link>
      </div>
    </section>
  );
}
