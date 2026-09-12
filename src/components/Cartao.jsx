import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Lock } from "lucide-react";

/* Peças do padrão do redesenho que aparecem em mais de uma tela.
   Nasceram no mobile (DashboardMobile, AprendaECGMobile) e passaram a valer
   também na web quando o desktop entrou no mesmo padrão (12/09/2026) — daí
   virarem componente em vez de classe copiada.

   Só visual: nenhuma delas sabe de dado, de plano ou de rota. */

// Cartão branco de seção. `p` sai em telas que trazem o próprio padding.
export function Cartao({ children, className = "", p = true }) {
  return (
    <section className={`rounded-[20px] border border-[#E6EAEE] bg-white ${p ? "p-[18px]" : ""} ${className}`}>
      {children}
    </section>
  );
}

// Quadrado colorido do ícone. `tom` escolhe o par fundo/tinta já usado no app.
const TONS = {
  azul: { fundo: "#EEF6FF", cor: "#1B3A5C" },
  roxo: { fundo: "#F1EEFF", cor: "#7C4DFF" },
  verde: { fundo: "#E6F9EC", cor: "#15803D" },
  laranja: { fundo: "#FFF1E6", cor: "#F97316" },
  ambar: { fundo: "#FFF6E0", cor: "#946200" },
  escuro: { fundo: "#0D1E30", cor: "#39FF6A" },
};

export function IconeQuadrado({ Icone, tom = "azul", tamanho = 42 }) {
  const { fundo, cor } = TONS[tom] || TONS.azul;
  return (
    <span
      className="flex flex-none items-center justify-center rounded-[13px]"
      style={{ width: tamanho, height: tamanho, background: fundo }}
    >
      <Icone style={{ color: cor, width: tamanho / 2, height: tamanho / 2 }} />
    </span>
  );
}

export function SeloPremium() {
  return (
    <span className="flex flex-none items-center gap-1 rounded-md bg-[#FFF6E0] px-1.5 py-0.5">
      <Lock className="h-3 w-3 text-[#946200]" />
      <span className="text-[11px] font-extrabold text-[#946200]">Premium</span>
    </span>
  );
}

/* Linha clicável: ícone, título, legenda e uma ponta à direita. `to` vira
   Link; sem ele é <button>. `direita` substitui a seta (o selo Premium, por
   exemplo). */
export function Atalho({ Icone, tom = "azul", titulo, legenda, to, onClick, direita }) {
  const classes =
    "flex w-full items-center gap-3.5 rounded-[18px] border border-[#E6EAEE] bg-white p-3.5 text-left transition-colors hover:border-ecg-midnight-2";
  const conteudo = (
    <>
      <IconeQuadrado Icone={Icone} tom={tom} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold text-ecg-midnight">{titulo}</span>
        {legenda && <span className="block text-xs font-semibold text-[#6B7785]">{legenda}</span>}
      </span>
      {direita ?? <ChevronRight className="h-5 w-5 flex-none text-[#B4BEC8]" />}
    </>
  );
  return to ? (
    <Link to={to} className={classes}>
      {conteudo}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={classes}>
      {conteudo}
    </button>
  );
}

export default Cartao;
