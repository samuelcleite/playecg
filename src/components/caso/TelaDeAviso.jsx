import React from "react";

/* Tela cheia de estado, no visual do redesenho: tudo o que não é pergunta nem
   resultado nas telas de caso — erro de carga, limite diário, fim dos casos,
   bloqueio por plano, fim da fase. Antes cada uma era um <Card> com cores
   próprias, montado à mão em cada página.

   `tom` pinta o círculo do ícone. `children` entra entre o texto e as ações
   (quadros de detalhe). `acoes` é o bloco de botões, e `rodape` a linha
   miúda para o suporte. */

const TONS = {
  verde: { fundo: "#E6F9EC", tinta: "#15803D" },
  azul: { fundo: "#EEF6FF", tinta: "#1B3A5C" },
  ambar: { fundo: "#FFF6E0", tinta: "#946200" },
  escuro: { fundo: "#0D1E30", tinta: "#39FF6A" },
  cinza: { fundo: "#EDF1F4", tinta: "#6B7785" },
};

export default function TelaDeAviso({ Icone, tom = "azul", sobretitulo, titulo, texto, children, acoes, rodape }) {
  const cor = TONS[tom] || TONS.azul;
  return (
    <div className="font-nunito flex min-h-full items-center justify-center bg-[#F4F6F8] px-4 py-10">
      <section className="w-full max-w-md rounded-[22px] border border-[#E6EAEE] bg-white p-6 text-center">
        {Icone && (
          <span
            className="mx-auto mb-4 flex h-[68px] w-[68px] items-center justify-center rounded-full"
            style={{ background: cor.fundo }}
          >
            <Icone className="h-8 w-8" style={{ color: cor.tinta }} strokeWidth={2.5} />
          </span>
        )}
        {sobretitulo && <p className="mb-1 text-[13px] font-extrabold text-ecg-midnight-2">{sobretitulo}</p>}
        <h2 className="text-[22px] font-black leading-tight text-ecg-midnight">{titulo}</h2>
        {texto && <p className="mt-2 text-sm font-semibold leading-relaxed text-[#6B7785]">{texto}</p>}
        {children && <div className="mt-4 text-left">{children}</div>}
        {acoes && <div className="mt-6 flex flex-col gap-2.5">{acoes}</div>}
        {rodape && <p className="mt-5 break-words text-xs font-semibold text-[#9AA6B2]">{rodape}</p>}
      </section>
    </div>
  );
}

// Quadro de detalhe dentro da TelaDeAviso (regras do plano, contagem etc.).
export function QuadroAviso({ tom = "azul", children }) {
  const cor = TONS[tom] || TONS.azul;
  return (
    <div className="rounded-2xl p-4 text-[13px] font-semibold leading-relaxed" style={{ background: cor.fundo, color: cor.tinta }}>
      {children}
    </div>
  );
}
