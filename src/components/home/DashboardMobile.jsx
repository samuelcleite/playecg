import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Flame, Zap, ListOrdered, Shuffle, BookOpen, ChevronRight, Trophy } from "lucide-react";
import { useCorDaFaixa, FAIXA_BRANCA } from "@/lib/faixaTopo";
import { SeloGratis } from "@/components/Cartao";

/* Bloco mobile do Dashboard no padrão do redesenho (1b).
   A barra inferior e a safe-area continuam no Layout.jsx — este componente
   renderiza só o conteúdo entre o topo e a nav.

   Apresentacional: a página busca os dados e passa por props.
   - `metaFeitos` null = contagem ainda não chegou (a barra fica vazia e o texto
     não promete número nenhum).
   - `continuar` null = trilha ainda carregando; `{ concluida: true }` = não há
     próxima fase; senão `{ modulo, fase, url, aberta }` — `aberta` falso é a
     fase paga que o gratuito encontra depois do Módulo 1.
   - `aviso` entra no topo da coluna (o NotificationBanner da promoção de push
     mora ali — ele não pode sumir do mobile; a página só o entrega depois da
     primeira questão respondida).
   - `primeiraVez` = a pessoa nunca respondeu uma questão: o CONTINUAR vira o
     convite do primeiro caso, que abre a Fase 1 do Módulo 1 — grátis desde
     26/09/2026. */

export default function DashboardMobile({
  ofensiva = 0,
  xp = 0,
  metaFeitos = null,
  metaTotal = 5,
  continuar = null,
  isPremium = false,
  primeiraVez = false,
  aviso = null,
}) {
  useCorDaFaixa(FAIXA_BRANCA);
  const feitos = metaFeitos ?? 0;
  const faltam = Math.max(0, metaTotal - feitos);
  const pct = metaTotal ? Math.min(100, Math.round((feitos / metaTotal) * 100)) : 0;

  // A meta é tocável e leva a praticar: à próxima fase, como o CONTINUAR. Trilha
  // ainda carregando, a trilha; trilha concluída ou próxima fase paga para quem
  // é gratuito, o Quiz aleatório — a meta nunca leva a uma cobrança.
  const urlPraticar = !continuar
    ? createPageUrl("Modules")
    : continuar.concluida || continuar.aberta === false
    ? createPageUrl("Quiz")
    : continuar.url;

  return (
    <div className="font-nunito bg-[#F4F6F8] min-h-full">
      {/* Topo: logo + ofensiva + XP.
          Grudento, e o `top` é o `-fluxo`, NÃO o `--app-safe-top`: quem rola no
          iPhone é o `<main>`, que já começa abaixo da margem que o wrapper do
          Despia injeta no body, e o sticky se mede a partir dele. Com o entalhe
          inteiro, o topo era empurrado para baixo de novo — sobrava um vão e o
          card da meta ficava escondido atrás. No navegador e no Android a
          margem do wrapper é zero e as duas variáveis valem o mesmo, e é por
          isso que o defeito só aparecia no aparelho. Ver README §6. */}
      <div
        className="sticky z-40 flex items-center justify-between border-b border-[#E6EAEE] bg-white px-4 py-2.5"
        style={{ top: "var(--app-sticky-top, 0px)" }}
      >
        <img
          src="https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/88192cd50_903B5817-5009-4B34-8478-509B00A9C6B8.png"
          alt="PlayECG"
          className="block h-9 w-9 rounded-[11px]"
        />
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-[#FFF1E6] px-3 py-1.5" aria-label={`${ofensiva} dias de ofensiva`}>
            <Flame className="h-[17px] w-[17px] text-[#F97316]" />
            <span className="text-base font-black text-[#C2410C]">{ofensiva}</span>
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-[#EEF6FF] px-3 py-1.5" aria-label={`${xp} XP`}>
            <Zap className="h-[17px] w-[17px] text-ecg-midnight-2" />
            <span className="text-base font-black text-ecg-midnight-2">{xp}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 px-4 pb-6 pt-4">
        {aviso}

        {/* Meta do dia — tocar leva a praticar (era só um cartão parado, e quem
            chegava agora tocava nele esperando começar). */}
        <Link
          to={urlPraticar}
          className="block rounded-[20px] border border-[#E6EAEE] bg-white p-[18px] transition-colors hover:border-ecg-midnight-2"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[17px] font-extrabold text-ecg-midnight">Meta de hoje</p>
              <p className="mt-0.5 text-[13px] font-semibold text-[#6B7785]">
                {metaFeitos == null
                  ? `${metaTotal} casos por dia`
                  : faltam === 0
                  ? "Meta concluída. Continue se quiser."
                  : `Falta${faltam > 1 ? "m" : ""} ${faltam} caso${faltam > 1 ? "s" : ""} para fechar o dia`}
              </p>
            </div>
            <p className="flex-none text-[23px] font-black text-ecg-midnight">
              {metaFeitos == null ? "–" : feitos}
              <span className="text-sm font-extrabold text-[#9AA6B2]">/{metaTotal}</span>
            </p>
          </div>
          <div className="h-3.5 overflow-hidden rounded-full bg-[#EDF1F4]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#22C55E] to-ecg-green transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </Link>

        {/* Continuar */}
        <ContinuarCard continuar={continuar} primeiraVez={primeiraVez} />

        {/* Atalhos */}
        <div className="flex flex-col gap-2.5">
          <Link
            to={createPageUrl("Quiz")}
            className="flex items-center gap-3.5 rounded-[18px] border border-[#E6EAEE] bg-white p-3.5 transition-colors hover:border-ecg-midnight-2"
          >
            <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[13px] bg-[#EEF6FF]">
              <Shuffle className="h-[21px] w-[21px] text-ecg-midnight-2" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold text-ecg-midnight">Quiz aleatório</span>
              <span className="block text-xs font-semibold text-[#6B7785]">Casos variados, sem ordem</span>
            </span>
            <ChevronRight className="h-5 w-5 flex-none text-[#B4BEC8]" />
          </Link>

          <Link
            to={createPageUrl("AprendaECG")}
            className="flex items-center gap-3.5 rounded-[18px] border border-[#E6EAEE] bg-white p-3.5 transition-colors hover:border-ecg-midnight-2"
          >
            <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[13px] bg-[#F1EEFF]">
              <BookOpen className="h-[21px] w-[21px] text-ecg-purple" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold text-ecg-midnight">Aprenda ECG</span>
              <span className="block text-xs font-semibold text-[#6B7785]">A teoria por trás dos casos</span>
            </span>
            {/* Era um cadeado Premium; desde 26/09/2026 a Introdução e a teoria
                do Módulo 1 abrem para todos. */}
            {!isPremium ? (
              <SeloGratis texto="Módulo 1 grátis" />
            ) : (
              <ChevronRight className="h-5 w-5 flex-none text-[#B4BEC8]" />
            )}
          </Link>
        </div>

        {/* Upsell */}
        {!isPremium && (
          <section className="flex items-center gap-3.5 rounded-[20px] bg-ecg-midnight p-[18px]">
            <img
              src="https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/2f88aa807_image.png"
              alt=""
              className="block w-16 flex-none"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-black text-ecg-green">Libere todos os módulos</p>
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
        )}
      </div>
    </div>
  );
}

function ContinuarCard({ continuar, primeiraVez }) {
  // Sem próxima fase: a pessoa terminou a trilha. O botão leva para a trilha
  // em vez de sumir — é o único card da tela que chega a Módulos.
  const concluida = continuar?.concluida;
  const carregando = !continuar;
  // Quem nunca respondeu: o mesmo destino (a Fase 1 do Módulo 1), com o convite
  // do primeiro caso no lugar do "continuar" — não há nada a continuar ainda.
  const comecar = primeiraVez && !carregando && !concluida;

  const titulo = carregando
    ? "Sua trilha"
    : concluida
    ? "Trilha concluída"
    : comecar
    ? "Seu primeiro ECG"
    : continuar.modulo;
  const legenda = carregando
    ? "Carregando sua próxima fase…"
    : concluida
    ? "Você fechou todos os módulos disponíveis"
    : comecar
    ? `${continuar.modulo} · leva 1 minuto`
    : continuar.fase;
  const url = carregando || concluida ? createPageUrl("Modules") : continuar.url;
  const Icone = concluida ? Trophy : ListOrdered;

  return (
    <section className="flex flex-col gap-3.5 rounded-[20px] border border-[#E6EAEE] bg-white p-4">
      <div className="flex items-center gap-3.5">
        <div className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[14px] bg-ecg-midnight">
          <Icone className="h-[23px] w-[23px] text-ecg-green" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-extrabold text-ecg-midnight">{titulo}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-[#6B7785]">{legenda}</p>
        </div>
      </div>
      <Link
        to={url}
        className="block rounded-[14px] bg-ecg-green py-[15px] text-center text-base font-black tracking-wide text-ecg-midnight shadow-[0_4px_0_#16a34a] transition-transform active:translate-y-[3px] active:shadow-[0_1px_0_#16a34a]"
      >
        {carregando || concluida ? "VER TRILHA" : comecar ? "COMEÇAR" : "CONTINUAR"}
      </Link>
    </section>
  );
}
