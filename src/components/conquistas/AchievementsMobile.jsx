import React, { useState } from "react";
import { Flame, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCorDaFaixa, FAIXA_BRANCA } from "@/lib/faixaTopo";

/* Troféus (1e). Apresentacional: recebe os dados já agrupados.
   grupos = [{ titulo, itens: [{ id, nome, descricao, emoji, conquistado }] }]

   O ícone é o EMOJI cadastrado no troféu (campo `icon` do Achievement), não um
   ícone do lucide como no design: o cadastro é feito pelo admin e é emoji.
   Bloqueado aparece em cinza, sem trocar o emoji por cadeado — ver o que se
   ganha é o que dá vontade de ganhar.

   Tocar num troféu abre a descrição (o que é preciso para conquistar). O design
   não tinha isso, mas a tela antiga tinha, e sem ela o bloqueado não diz como
   se desbloqueia. */

export default function AchievementsMobile({ ofensiva = 0, conquistados = 0, total = 0, grupos = [] }) {
  useCorDaFaixa(FAIXA_BRANCA);
  const [aberto, setAberto] = useState(null);
  const pct = total ? Math.round((conquistados / total) * 100) : 0;

  return (
    <div className="font-nunito min-h-full bg-[#F4F6F8]">
      <header className="border-b border-[#E6EAEE] bg-white">
        <div className="mx-auto w-full max-w-2xl px-4 pb-3.5 pt-2">
          <h1 className="text-2xl font-black text-ecg-midnight">Troféus</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-[#6B7785]">
            {conquistados} de {total} conquistados
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3.5 px-4 pb-6 pt-3.5">
        <section className="rounded-[20px] border border-[#E6EAEE] bg-white p-[18px]">
          <div className="mb-3.5 flex items-center gap-3.5">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] bg-[#FFF1E6]">
              <Flame className="h-6 w-6 text-[#F97316]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-black text-ecg-midnight">
                {ofensiva} {ofensiva === 1 ? "dia" : "dias"}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-[#6B7785]">seguidos estudando</p>
            </div>
          </div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-extrabold text-[#6B7785]">Progresso geral</span>
            <span className="text-xs font-black text-ecg-midnight">{pct}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#EDF1F4]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#22C55E] to-ecg-green"
              style={{ width: `${pct}%` }}
            />
          </div>
        </section>

        {grupos.map((g) => (
          <section key={g.titulo}>
            <p className="mb-2.5 text-[11px] font-extrabold tracking-[0.1em] text-[#9AA6B2]">{g.titulo}</p>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {g.itens.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAberto(t)}
                  className={`flex flex-col items-center gap-1.5 rounded-[18px] border border-[#E6EAEE] bg-white px-2 py-3 ${
                    t.conquistado ? "" : "opacity-60"
                  }`}
                >
                  <span
                    className={`flex h-[46px] w-[46px] items-center justify-center rounded-full text-[26px] leading-none ${
                      t.conquistado ? "bg-[#E6F9EC]" : "bg-[#EDF1F4] grayscale"
                    }`}
                    aria-hidden="true"
                  >
                    {t.emoji}
                  </span>
                  <span className="text-center text-[11px] font-extrabold leading-tight text-ecg-midnight">
                    {t.nome}
                  </span>
                  <span
                    className="text-center text-[10px] font-bold"
                    style={{ color: t.conquistado ? "#15803D" : "#9AA6B2" }}
                  >
                    {t.conquistado ? "Conquistado" : "Bloqueado"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}

        {total === 0 && (
          <div className="py-16 text-center text-[#9AA6B2]">
            <Trophy className="mx-auto mb-3 h-14 w-14 opacity-30" />
            <p className="text-sm font-semibold">Nenhum troféu disponível ainda</p>
          </div>
        )}
      </div>

      <Dialog open={!!aberto} onOpenChange={(v) => !v && setAberto(null)}>
        <DialogContent className="font-nunito max-w-xs rounded-[22px] text-center">
          <div className={`mx-auto text-5xl ${aberto?.conquistado ? "" : "grayscale"}`} aria-hidden="true">
            {aberto?.emoji}
          </div>
          <DialogTitle className="text-center text-lg font-black text-ecg-midnight">{aberto?.nome}</DialogTitle>
          <DialogDescription className="text-center text-[13px] font-semibold leading-relaxed text-[#6B7785]">
            {aberto?.descricao}
          </DialogDescription>
          <span
            className={`mx-auto rounded-full px-3 py-1 text-xs font-extrabold ${
              aberto?.conquistado ? "bg-[#E6F9EC] text-[#15803D]" : "bg-[#EDF1F4] text-[#6B7785]"
            }`}
          >
            {aberto?.conquistado ? "Conquistado" : "Bloqueado"}
          </span>
        </DialogContent>
      </Dialog>
    </div>
  );
}
