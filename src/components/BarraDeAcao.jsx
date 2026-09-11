import React from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

/* Rodapé de ação das telas do redesenho (caso, resultado, caso do dia,
   upgrade) e o botão verde com relevo que mora nele.

   A barra GRUDA no rodapé em vez de ficar no fim do conteúdo: com o ECG e
   quatro ou cinco alternativas a tela passa da altura do celular, e o
   VERIFICAR ia parar abaixo da dobra. O `bottom` é a altura da barra de
   navegação do Layout, que ele publica em --app-nav-altura — com bottom:0 a
   barra grudaria atrás da navegação, que é fixa. No desktop a navegação não
   existe e a variável vale 0px. */

export default function BarraDeAcao({ children }) {
  return (
    <div
      className="sticky z-30 mt-auto border-t border-[#E6EAEE] bg-white px-4 pb-[18px] pt-3.5"
      style={{ bottom: "var(--app-nav-altura, 0px)" }}
    >
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}

const TONS = {
  verde:
    "bg-ecg-green text-ecg-midnight shadow-[0_4px_0_#16a34a] active:shadow-[0_1px_0_#16a34a]",
  laranja:
    "bg-[#F97316] text-white shadow-[0_4px_0_#C2410C] active:shadow-[0_1px_0_#C2410C]",
  escuro:
    "bg-ecg-midnight text-ecg-green shadow-[0_4px_0_#000000] active:shadow-[0_1px_0_#000000]",
};

const BASE =
  "block w-full rounded-[14px] py-[15px] text-center text-base font-black tracking-wide transition-transform active:translate-y-[3px] disabled:bg-[#E4EAEF] disabled:text-[#9AA6B2] disabled:shadow-[0_4px_0_#C9D3DC] disabled:active:translate-y-0";

// `to` vira Link; senão é <button>. `ocupado` mostra o spinner e trava o
// clique — é o que impede o VERIFICAR de registrar a mesma resposta duas vezes.
export function BotaoPrincipal({ children, to, onClick, disabled, ocupado, tom = "verde", type = "button" }) {
  const classes = `${BASE} ${TONS[tom] || TONS.verde}`;
  const conteudo = ocupado ? (
    <span className="inline-flex items-center justify-center gap-2">
      <Loader2 className="h-5 w-5 animate-spin" />
      {children}
    </span>
  ) : (
    children
  );

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={classes}>
        {conteudo}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled || ocupado} className={classes}>
      {conteudo}
    </button>
  );
}

// Ação secundária em texto, para ficar sob o botão principal.
export function BotaoSecundario({ children, to, onClick }) {
  const classes =
    "mt-2.5 block w-full py-1.5 text-center text-[13px] font-extrabold text-ecg-midnight-2 underline underline-offset-2";
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
