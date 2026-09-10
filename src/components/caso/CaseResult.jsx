import React from "react";
import { Check, X, Maximize2 } from "lucide-react";
import BarraDeAcao, { BotaoPrincipal, BotaoSecundario } from "@/components/BarraDeAcao";

/* Resultado do caso (1d), ampliado para as três telas de caso.

   - `respostaCorreta`: string ou lista (casos de múltipla escolha).
   - `suasRespostas`: [{ texto, certa }] — só aparece quando errou, para a
     pessoa ver o que marcou de certo e de errado.
   - `indicadores`: [{ v, l, c }]. Um indicador com `v` null some; com `v`
     "…" aparece esperando o servidor. A tela não inventa número.
   - `explicacao` (texto) ou `explicacaoHtml` (o Caso do dia guarda HTML do
     editor). Sem explicação e sem achados, o card some.
   - `extra`: bloco livre depois da explicação (o convite ao Premium no Quiz
     do plano gratuito, que não mostra explicação).
   - `onVerEcg`: link para rever o traçado ampliado. */

// O HTML vem do editor do admin. Sem o plugin de tipografia do Tailwind, o
// preflight tira marcador de lista e margem de parágrafo — aqui eles voltam.
const ESTILO_HTML =
  "[&_p]:mb-2.5 [&_ul]:mb-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_strong]:font-extrabold [&_strong]:text-ecg-midnight [&_h1]:font-black [&_h2]:font-black [&_h3]:font-extrabold [&_h1]:text-ecg-midnight [&_h2]:text-ecg-midnight [&_h3]:text-ecg-midnight [&_a]:underline [&_img]:my-2 [&_img]:rounded-xl";

export default function CaseResult({
  acertou = true,
  respostaCorreta = "",
  suasRespostas = [],
  indicadores = [],
  explicacao = "",
  explicacaoHtml = "",
  achados = [],
  extra = null,
  onVerEcg,
  rotuloBotao = "PRÓXIMO CASO",
  onContinuar,
  rotuloSecundario,
  onSecundario,
}) {
  const cor = acertou ? "#39FF6A" : "#FF6B6B";
  const Icon = acertou ? Check : X;
  const corretas = (Array.isArray(respostaCorreta) ? respostaCorreta : [respostaCorreta]).filter(Boolean);
  const visiveis = indicadores.filter((s) => s.v != null);
  const temExplicacao = Boolean(explicacao || explicacaoHtml || achados.length > 0);

  return (
    <div className="font-nunito flex min-h-full flex-col bg-[#F4F6F8]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3.5 px-4 pb-6 pt-4">
        <section className="flex items-center gap-4 rounded-[22px] bg-ecg-midnight p-[18px]" role="status">
          <span
            className="flex h-[58px] w-[58px] flex-none items-center justify-center rounded-full"
            style={{ background: cor }}
          >
            <Icon className="h-[30px] w-[30px] text-ecg-midnight" strokeWidth={3.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[21px] font-black" style={{ color: cor }}>
              {acertou ? "Resposta correta" : "Resposta incorreta"}
            </p>
            {corretas.length > 0 && (
              <div className="mt-0.5 text-[13px] font-bold leading-snug text-white/80">
                {!acertou && <span className="text-white/60">Correta: </span>}
                {corretas.join(" · ")}
              </div>
            )}
          </div>
        </section>

        {!acertou && suasRespostas.length > 0 && (
          <section className="rounded-[20px] border border-[#E6EAEE] bg-white p-[18px]">
            <p className="mb-2 text-xs font-extrabold tracking-wider text-[#6B7785]">
              {suasRespostas.length > 1 ? "SUAS RESPOSTAS" : "SUA RESPOSTA"}
            </p>
            <div className="flex flex-col gap-1.5">
              {suasRespostas.map((r) => (
                <div key={r.texto} className="flex items-start gap-2.5">
                  {r.certa ? (
                    <Check className="mt-0.5 h-4 w-4 flex-none text-[#22C55E]" strokeWidth={3} />
                  ) : (
                    <X className="mt-0.5 h-4 w-4 flex-none text-[#DC2626]" strokeWidth={3} />
                  )}
                  <span
                    className="text-[13px] font-bold leading-snug"
                    style={{ color: r.certa ? "#0D1E30" : "#B91C1C" }}
                  >
                    {r.texto}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {visiveis.length > 0 && (
          <div className="flex gap-2.5">
            {visiveis.map((s) => (
              <div key={s.l} className="flex-1 rounded-[18px] border border-[#E6EAEE] bg-white p-3.5 text-center">
                <p className="text-[22px] font-black" style={{ color: s.c }}>
                  {s.v}
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-[#6B7785]">{s.l}</p>
              </div>
            ))}
          </div>
        )}

        {temExplicacao && (
          <section className="rounded-[20px] border border-[#E6EAEE] bg-white p-[18px]">
            <p className="mb-2.5 text-[15px] font-black text-ecg-midnight">Explicação</p>
            {explicacaoHtml ? (
              <div
                className={`mb-3.5 text-[13px] font-semibold leading-relaxed text-[#40505F] ${ESTILO_HTML}`}
                dangerouslySetInnerHTML={{ __html: explicacaoHtml }}
              />
            ) : (
              explicacao && (
                <p className="mb-3.5 whitespace-pre-line text-[13px] font-semibold leading-relaxed text-[#40505F]">
                  {explicacao}
                </p>
              )
            )}
            {achados.length > 0 && (
              <>
                <p className="mb-2 text-xs font-extrabold tracking-wider text-[#6B7785]">ACHADOS PRINCIPAIS</p>
                <div className="flex flex-col gap-1.5">
                  {achados.map((a, i) => (
                    <div key={`${i}-${a}`} className="flex items-start gap-2.5">
                      <span className="mt-1.5 block h-[7px] w-[7px] flex-none rounded-full bg-ecg-green" />
                      <span className="text-[13px] font-bold leading-snug text-ecg-midnight">{a}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {extra}

        {onVerEcg && (
          <button
            type="button"
            onClick={onVerEcg}
            className="flex items-center justify-center gap-1.5 py-1 text-[13px] font-extrabold text-ecg-midnight-2"
          >
            <Maximize2 className="h-4 w-4" />
            <span className="underline underline-offset-2">Ver o traçado de novo</span>
          </button>
        )}
      </div>

      <BarraDeAcao>
        <BotaoPrincipal onClick={onContinuar}>{rotuloBotao}</BotaoPrincipal>
        {rotuloSecundario && <BotaoSecundario onClick={onSecundario}>{rotuloSecundario}</BotaoSecundario>}
      </BarraDeAcao>
    </div>
  );
}
