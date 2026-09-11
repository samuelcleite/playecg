import React, { useMemo, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Lock, Check, Play, Trophy, BookOpen } from "lucide-react";
import { montarTrilha, moduloLiberado, proximaFase } from "@/lib/trilha";

/* Trilha no padrão do redesenho (1b):
   - caminho curvo contínuo ligando as fases, trecho percorrido em verde
   - nós de 74px com relevo 3D, halo pulsante só na fase atual
   - mesmas props e mesmos links do componente antigo */

// A trilha não sabe nada sobre planos. O único cadeado que ela aplica é o de
// progressão (fase anterior concluída, módulo anterior completo) — a cobrança
// pelo plano acontece no ModuleDetail, quando a pessoa tenta abrir a fase.
// Sem isso, o usuário free não conseguiria nem clicar para chegar ao paywall.
// A regra de progressão mora em src/lib/trilha.js, junto com o Dashboard.

const PCTS = [50, 71, 79, 64, 40, 24]; // posições horizontais, em % da largura
const NODE = 74;
const R = NODE / 2;
const STEP = 122;
const TOP = 16;

function buildPath(points) {
  if (points.length < 2) return "";
  return points.slice(1).reduce((d, p, i) => {
    const a = points[i];
    return `${d} C ${a.x} ${a.y + STEP * 0.55} ${p.x} ${p.y - STEP * 0.55} ${p.x} ${p.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

// Quem rola não é o mesmo em toda plataforma: no Android é o documento, no
// resto é o <main> do Layout (ver o comentário longo lá). O scrollIntoView
// rolava TODOS os ancestrais de uma vez — inclusive o documento no iPhone, que
// não deveria rolar — e deslocava o layout. Aqui rola só o primeiro ancestral
// que de fato tem o que rolar; sem nenhum, cai para a janela.
function rolarAteCentralizar(el) {
  let alvo = el.parentElement;
  while (alvo && alvo !== document.body) {
    const { overflowY } = getComputedStyle(alvo);
    if (/(auto|scroll)/.test(overflowY) && alvo.scrollHeight > alvo.clientHeight) break;
    alvo = alvo.parentElement;
  }
  const r = el.getBoundingClientRect();
  if (alvo && alvo !== document.body) {
    const caixa = alvo.getBoundingClientRect();
    const y = alvo.scrollTop + (r.top - caixa.top) - alvo.clientHeight / 2 + r.height / 2;
    alvo.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  } else {
    const y = window.scrollY + r.top - window.innerHeight / 2 + r.height / 2;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }
}

export default function LearningTrail({ modules, phases, userProgress }) {
  const trail = useMemo(
    () => montarTrilha(modules, phases, userProgress),
    [modules, phases, userProgress]
  );
  const nextPhase = useMemo(() => proximaFase(trail), [trail]);

  const nextPhaseRef = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (nextPhaseRef.current) rolarAteCentralizar(nextPhaseRef.current);
    }, 400);
    return () => clearTimeout(t);
  }, [nextPhase?.phase?.id]);

  if (modules.length === 0) {
    return (
      <div className="text-center py-12 text-[#9AA6B2] font-nunito">
        <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm font-semibold">Nenhum módulo disponível ainda.</p>
      </div>
    );
  }

  return (
    <div className="w-full font-nunito">
      {trail.map((item) => (
        <ModuleTrail
          key={item.module.id}
          item={item}
          locked={!moduloLiberado(trail, item.module)}
          nextPhaseId={nextPhase?.phase?.id}
          nextPhaseRef={nextPhaseRef}
        />
      ))}
    </div>
  );
}

function ModuleTrail({ item, locked, nextPhaseId, nextPhaseRef }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(326);

  // O caminho é SVG em pixels, então precisa da largura real. Mede uma vez na
  // montagem (sem esperar o primeiro callback do observer) e acompanha depois.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = item.phases.map((_, i) => ({
    x: (PCTS[i % PCTS.length] / 100) * width,
    y: TOP + i * STEP + R,
  }));
  const doneCount = item.phases.filter((p) => p.isDone).length;
  const height = TOP + Math.max(0, item.phases.length - 1) * STEP + NODE + 58;
  const path = buildPath(pts);
  const pathDone = buildPath(pts.slice(0, Math.min(doneCount + 1, pts.length)));

  return (
    <div className="mb-2">
      {/* Rótulo do módulo.
          Nome do módulo nunca é mascarado: saber o que vem pela frente é o que
          dá sentido à trilha. O sigilo fica só no nome das fases (ver PhaseNode). */}
      <div className="flex items-center gap-2 mb-4">
        <div className="h-px flex-1 bg-[#E2E8EE]" />
        <span
          className={`text-xs font-extrabold px-3 py-1 rounded-full ${
            item.allDone
              ? "bg-[#E6F9EC] text-[#15803D]"
              : locked
              ? "bg-[#EDF1F4] text-[#9AA6B2]"
              : "bg-ecg-midnight text-ecg-green"
          }`}
        >
          {locked && <Lock className="w-3 h-3 inline mr-1" />}
          {item.module.name}
        </span>
        <div className="h-px flex-1 bg-[#E2E8EE]" />
      </div>

      {/* Caminho + nós */}
      <div ref={wrapRef} className="relative mx-4" style={{ height }}>
        <img
          src="https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/2f88aa807_image.png"
          alt=""
          aria-hidden="true"
          className="absolute pointer-events-none select-none"
          style={{ width: 120, opacity: 0.13, right: 0, top: "45%", zIndex: 0 }}
        />
        <svg
          className="absolute left-0 top-0 pointer-events-none"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          aria-hidden="true"
        >
          <path d={path} stroke="#E2E8EE" strokeWidth="12" strokeLinecap="round" />
          <path d={pathDone} stroke="#BFEFCE" strokeWidth="12" strokeLinecap="round" />
          <path d={path} stroke="#CDD8E1" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 14" />
        </svg>

        {item.phases.map((phase, i) => {
          const isNext = !locked && nextPhaseId === phase.id;
          const prev = i > 0 ? item.phases[i - 1] : null;
          const isAvailable = !locked && (i === 0 || (prev && prev.isDone));
          const isBlocked = locked || (!phase.isDone && !isAvailable);
          const node = (
            <PhaseNode phase={phase} isDone={phase.isDone} isNext={isNext} isBlocked={isBlocked} />
          );
          return (
            <div
              key={phase.id}
              ref={isNext ? nextPhaseRef : null}
              className="absolute"
              style={{ left: pts[i].x - R, top: pts[i].y - R, width: NODE, zIndex: 1 }}
            >
              {isAvailable ? (
                <Link
                  to={`${createPageUrl("ModuleDetail")}?module_id=${item.module.id}&phase_id=${phase.id}`}
                >
                  {node}
                </Link>
              ) : (
                node
              )}
            </div>
          );
        })}
      </div>

      {/* "Troféu do módulo" não é garantido: os troféus de especialização são
          cadastrados à mão com module_ids, e nem todo módulo tem um. O rodapé
          fala só do que a trilha sabe. */}
      <div className="mx-4 mb-6 flex items-center gap-3 rounded-[18px] border border-[#E6EAEE] bg-white px-[18px] py-3.5">
        <Trophy className={`w-5 h-5 flex-none ${item.allDone ? "text-[#15803D]" : "text-[#946200]"}`} />
        <p className="text-xs font-bold leading-snug text-[#6B7785]">
          {item.allDone
            ? "Módulo concluído"
            : `${doneCount} de ${item.phases.length} fases concluídas neste módulo`}
        </p>
      </div>
    </div>
  );
}

function PhaseNode({ phase, isDone, isNext, isBlocked }) {
  const skin = isDone
    ? { bg: "#22C55E", relief: "#15803D", ink: "#ffffff" }
    : isNext
    ? { bg: "#39FF6A", relief: "#16a34a", ink: "#0D1E30" }
    : isBlocked
    ? { bg: "#E4EAEF", relief: "#C9D3DC", ink: "#9AA6B2" }
    : { bg: "#EEF6FF", relief: "#C7DBF2", ink: "#1B3A5C" };

  return (
    <div className="relative">
      {isNext && (
        <span className="absolute -inset-2 rounded-full bg-ecg-green opacity-30 animate-ping" />
      )}
      <div
        className="relative flex h-[74px] w-[74px] items-center justify-center rounded-full transition-transform active:translate-y-[3px]"
        style={{ background: skin.bg, boxShadow: `0 6px 0 ${skin.relief}` }}
      >
        {isDone ? (
          <Check className="h-[30px] w-[30px]" strokeWidth={3} style={{ color: skin.ink }} />
        ) : isBlocked ? (
          <Lock className="h-6 w-6" strokeWidth={3} style={{ color: skin.ink }} />
        ) : (
          <Play className="h-7 w-7" fill={skin.ink} style={{ color: skin.ink }} />
        )}
      </div>
      {/* Fase bloqueada mostra só o número — mesmo sigilo do componente antigo.
          É cosmético (o nome real está nas props), mas é o combinado: README §5. */}
      <p
        className="absolute left-1/2 top-[82px] w-[150px] -translate-x-1/2 text-center text-xs font-extrabold leading-snug"
        style={{ color: isBlocked ? "#9AA6B2" : "#0D1E30" }}
      >
        {isBlocked ? `Fase ${phase.order}` : phase.name || `Fase ${phase.order}`}
      </p>
    </div>
  );
}
