import React from "react";
import { Flame } from "lucide-react";
import BarraDeAcao, { BotaoPrincipal } from "@/components/BarraDeAcao";

/* Caso do dia (1i) — a tela de abertura, antes da pergunta.

   `indicadores`: [{ v, l, c }], como no CaseResult. O design trazia "tempo
   médio" e "taxa de acerto", mas nenhum dos dois existe nos dados — em vez de
   um card eternamente com "—", a página passa só o que é verdade.
   `ofensiva` null esconde o selo (ainda não chegou do servidor). */

const MASCOTE = "https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/2f88aa807_image.png";

export default function DailyCaseMobile({
  data = "",
  ofensiva = null,
  ecgUrl,
  resumo = "",
  descricao = "Um caso novo todo dia, com explicação detalhada ao final.",
  indicadores = [],
  recado,
  rotuloBotao = "RESOLVER AGORA",
  onResolver,
}) {
  const visiveis = indicadores.filter((s) => s.v != null);

  return (
    <div className="font-nunito flex min-h-full flex-col bg-[#F4F6F8]">
      <header className="border-b border-[#E6EAEE] bg-white">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pb-3.5 pt-2">
          <div className="min-w-0">
            <h1 className="text-[22px] font-black text-ecg-midnight">Caso do dia</h1>
            <p className="mt-0.5 text-xs font-semibold text-[#6B7785]">{data}</p>
          </div>
          {ofensiva != null && (
            <span
              className="flex flex-none items-center gap-1.5 rounded-full bg-[#FFF1E6] px-3 py-1.5"
              aria-label={`${ofensiva} dias de ofensiva`}
            >
              <Flame className="h-[17px] w-[17px] text-[#F97316]" />
              <span className="text-base font-black text-[#C2410C]">{ofensiva}</span>
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3.5 px-4 pb-6 pt-4">
        <section className="rounded-[20px] border border-[#E6EAEE] bg-white p-3.5">
          <div className="relative min-h-[120px] overflow-hidden rounded-[14px] bg-[#FDEBEB]">
            {ecgUrl && <img src={ecgUrl} alt="Traçado de ECG" className="mx-auto block h-auto max-w-full" />}
            <span className="absolute left-2.5 top-2 rounded-[7px] bg-ecg-midnight px-2 py-1 text-[10px] font-black tracking-wide text-ecg-green">
              DESAFIO DIÁRIO
            </span>
          </div>
          {resumo && <p className="mt-3 text-base font-extrabold leading-snug text-ecg-midnight">{resumo}</p>}
          <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-[#6B7785]">{descricao}</p>
        </section>

        {visiveis.length > 0 && (
          <div className="flex gap-2.5">
            {visiveis.map((s) => (
              <div key={s.l} className="flex-1 rounded-[18px] border border-[#E6EAEE] bg-white p-3.5 text-center">
                <p className="text-xl font-black" style={{ color: s.c }}>
                  {s.v}
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-[#6B7785]">{s.l}</p>
              </div>
            ))}
          </div>
        )}

        {recado && (
          <section className="flex items-center gap-3 rounded-[20px] bg-ecg-midnight p-4">
            <img src={MASCOTE} alt="" className="block w-14 flex-none" />
            <p className="min-w-0 flex-1 text-[12.5px] font-bold leading-relaxed text-white/85">{recado}</p>
          </section>
        )}
      </div>

      <BarraDeAcao>
        <BotaoPrincipal onClick={onResolver}>{rotuloBotao}</BotaoPrincipal>
      </BarraDeAcao>
    </div>
  );
}
