import React, { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, ChevronDown, FileText, Lock } from "lucide-react";
import { useCorDaFaixa, FAIXA_BRANCA } from "@/lib/faixaTopo";

/* Aprenda ECG (1f).
   intro   = { titulo, legenda, to }
   modulos = [{ id, n, nome, legenda, conteudos: [{ id, titulo, legenda, to }] }]

   `bloqueado` (plano gratuito) vale para a tela inteira: todo módulo aparece
   com o selo Premium, nenhum expande, e tocar leva a `urlBloqueado` (os
   planos). É a vitrine do que a assinatura vende, como a trilha de Módulos —
   a pessoa vê os nomes do que existe em vez de uma parede. Os nomes já são
   públicos na trilha; o CORPO de cada conteúdo nunca chega aqui (o índice é
   buscado só com id/module_id/phase_id) e o ConteudoECG tem o próprio gate.

   Sem o check de "lido" do design: o app não guarda o que a pessoa leu. */

function SeloPremium() {
  return (
    <span className="flex flex-none items-center gap-1 rounded-md bg-[#FFF6E0] px-1.5 py-0.5">
      <Lock className="h-3 w-3 text-[#946200]" />
      <span className="text-[11px] font-extrabold text-[#946200]">Premium</span>
    </span>
  );
}

export default function AprendaECGMobile({ intro, modulos = [], bloqueado = false, urlBloqueado }) {
  useCorDaFaixa(FAIXA_BRANCA);
  const [aberto, setAberto] = useState(bloqueado ? null : modulos[0]?.id ?? null);

  return (
    <div className="font-nunito min-h-full bg-[#F4F6F8]">
      <header className="border-b border-[#E6EAEE] bg-white">
        <div className="mx-auto w-full max-w-2xl px-4 pb-3.5 pt-2">
          <h1 className="text-2xl font-black text-ecg-midnight">Aprenda ECG</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-[#6B7785]">
            {bloqueado ? "A teoria por trás dos casos · exclusivo do Premium" : "A teoria por trás dos casos"}
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pb-6 pt-3.5">
        {bloqueado && (
          <section className="flex items-center gap-3.5 rounded-[20px] bg-ecg-midnight p-[18px]">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-black text-ecg-green">Estude a teoria de cada fase</p>
              <p className="mb-2 mt-0.5 text-xs font-semibold leading-relaxed text-white/75">
                Todo o conteúdo abaixo é liberado na assinatura Premium.
              </p>
              <Link
                to={urlBloqueado}
                className="inline-block rounded-[11px] bg-ecg-green px-4 py-2.5 text-[13px] font-black text-ecg-midnight shadow-[0_3px_0_#16a34a] transition-transform active:translate-y-[2px] active:shadow-[0_1px_0_#16a34a]"
              >
                VER PLANOS
              </Link>
            </div>
          </section>
        )}

        {intro && (
          <Link
            to={bloqueado ? urlBloqueado : intro.to}
            className="flex w-full items-center gap-3.5 rounded-[20px] border border-[#DDD3FF] bg-[#F1EEFF] p-4 text-left"
          >
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-ecg-purple">
              <BookOpen className="h-[22px] w-[22px] text-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-black text-[#3B2A80]">{intro.titulo}</span>
              <span className="block text-xs font-semibold text-[#6B5BA8]">{intro.legenda}</span>
            </span>
            {bloqueado ? (
              <SeloPremium />
            ) : (
              <ChevronRight className="h-5 w-5 flex-none text-ecg-purple" strokeWidth={2.5} />
            )}
          </Link>
        )}

        {modulos.map((m) => {
          const expandido = !bloqueado && aberto === m.id;
          const cabecalho = (
            <>
              <span
                className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] text-sm font-black"
                style={
                  bloqueado
                    ? { background: "#F1EEFF", color: "#7C4DFF" }
                    : { background: "#0D1E30", color: "#39FF6A" }
                }
              >
                {m.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold text-ecg-midnight">{m.nome}</span>
                <span className="block text-xs font-semibold text-[#6B7785]">{m.legenda}</span>
              </span>
              {bloqueado ? (
                <SeloPremium />
              ) : (
                <ChevronDown
                  className={`h-[18px] w-[18px] flex-none text-[#6B7785] transition-transform ${
                    expandido ? "rotate-180" : ""
                  }`}
                  strokeWidth={2.5}
                />
              )}
            </>
          );

          return (
            <div key={m.id} className="overflow-hidden rounded-[20px] border border-[#E6EAEE] bg-white">
              {bloqueado ? (
                <Link to={urlBloqueado} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                  {cabecalho}
                </Link>
              ) : (
                <button
                  type="button"
                  aria-expanded={expandido}
                  onClick={() => setAberto(expandido ? null : m.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  {cabecalho}
                </button>
              )}

              {expandido && (
                <div className="flex flex-col px-4 pb-3 pt-1.5">
                  {m.conteudos.map((c, i) => (
                    <Link
                      key={c.id}
                      to={c.to}
                      className={`flex items-center gap-3 py-2.5 text-left ${
                        i < m.conteudos.length - 1 ? "border-b border-[#F2F5F7]" : ""
                      }`}
                    >
                      <FileText className="h-[17px] w-[17px] flex-none text-ecg-midnight-2" strokeWidth={2.2} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold text-ecg-midnight">{c.titulo}</span>
                        {c.legenda && <span className="block text-[11px] font-semibold text-[#9AA6B2]">{c.legenda}</span>}
                      </span>
                      <ChevronRight className="h-4 w-4 flex-none text-[#B4BEC8]" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {!intro && modulos.length === 0 && (
          <div className="py-16 text-center text-[#9AA6B2]">
            <BookOpen className="mx-auto mb-3 h-14 w-14 opacity-40" />
            <p className="text-[15px] font-black text-ecg-midnight">Nenhum conteúdo disponível</p>
            <p className="mt-1 text-sm font-semibold">Os conteúdos educacionais serão adicionados em breve!</p>
          </div>
        )}
      </div>
    </div>
  );
}
