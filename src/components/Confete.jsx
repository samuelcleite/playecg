import { useMemo } from "react";
import { motion } from "framer-motion";

// Confete — a comemoração de ganhar o Premium.
//
// SEM DEPENDÊNCIA NOVA, de propósito. Uma lib de confete (canvas-confetti e
// afins) resolveria em duas linhas, mas o projeto tem a regra de não acrescentar
// pacote npm por enfeite — o mesmo raciocínio do sendOneSignalPush, que usa
// fetch nativo em vez de um SDK. São divs com framer-motion, que já está aqui e
// já anima metade das telas.
//
// PENSADO PARA WEBVIEW DE IPHONE, que é onde isto vai rodar: 18 partículas,
// duas segundos, e só transform/opacity — as duas propriedades que o compositor
// anima sem repintar layout. Nada de box-shadow animado, nada de filtro.
//
// Respeita `prefers-reduced-motion`: quem pediu menos movimento no sistema não
// recebe confete nenhum. A mensagem de que ganhou continua lá — a festa é o
// tempero, não o recado.

const CORES = ["#22C55E", "#FACC15", "#38BDF8", "#F472B6", "#FFFFFF"];

function prefereMenosMovimento() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Confete({ quantidade = 18 }) {
  // useMemo e não useState: as posições são sorteadas UMA vez e não mudam mais.
  // Sem isto, cada re-render do pai sorteia tudo de novo e o confete "pula".
  const particulas = useMemo(
    () =>
      Array.from({ length: quantidade }, (_, i) => ({
        id: i,
        esquerda: Math.random() * 100,
        atraso: Math.random() * 0.5,
        duracao: 1.4 + Math.random() * 0.8,
        cor: CORES[i % CORES.length],
        giro: (Math.random() - 0.5) * 720,
        deriva: (Math.random() - 0.5) * 60,
        largura: 6 + Math.random() * 5,
        altura: 9 + Math.random() * 7
      })),
    [quantidade]
  );

  if (prefereMenosMovimento()) return null;

  return (
    // pointer-events-none é obrigatório: sem ele o confete cobre o botão do
    // card por dois segundos, e o toque do usuário morre no enfeite.
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {particulas.map((p) => (
        <motion.span
          key={p.id}
          initial={{ y: -20, x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: 260, x: p.deriva, opacity: 0, rotate: p.giro }}
          transition={{ duration: p.duracao, delay: p.atraso, ease: "easeIn" }}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.esquerda}%`,
            width: p.largura,
            height: p.altura,
            backgroundColor: p.cor,
            borderRadius: 2
          }}
        />
      ))}
    </div>
  );
}
