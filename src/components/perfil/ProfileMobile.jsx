import React from "react";
import { Link } from "react-router-dom";
import { Pencil, ChevronRight, LogOut, Crown } from "lucide-react";
import { useCorDaFaixa, FAIXA_BRANCA } from "@/lib/faixaTopo";

/* Perfil (1g). Apresentacional: a página busca a conta e o plano e passa por
   props; os diálogos de assinatura e exclusão continuam na página.

   - `indicadores`: [{ v, l, c }]. O design trazia "casos" e "acerto", mas
     esses números saíram do app de propósito (não fecham com a realidade —
     ver os comentários no Dashboard e em Troféus). A página passa o que é
     confiável.
   - `children` entra entre os indicadores e as opções: card do plano,
     formulário de edição, notificações.
   - `opcoes`: [{ id, nome, Icon, to | onClick, tom: "perigo"?, detalhe? }].

   A faixa do relógio fica BRANCA, não azul-escura como o topo: a cor do texto
   da barra de status no app do iPhone é do wrapper nativo, não do site, e se
   ela for escura o relógio some sobre o azul. Trocar é mudar a constante aqui,
   depois de conferir no aparelho. */

export default function ProfileMobile({
  nome = "",
  iniciais = "",
  subtitulo = "",
  email = "",
  premium = false,
  nivel = 1,
  xp = 0,
  xpFaltando = 0,
  progressoNivel = 0,
  indicadores = [],
  onEditar,
  aviso = null,
  children,
  opcoes = [],
  onSair,
}) {
  useCorDaFaixa(FAIXA_BRANCA);

  return (
    <div className="font-nunito min-h-full bg-[#F4F6F8]">
      <header className="bg-ecg-midnight">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3.5 px-4 pb-6 pt-3.5">
          <span className="flex h-[62px] w-[62px] flex-none items-center justify-center rounded-full bg-ecg-green text-2xl font-black text-ecg-midnight">
            {iniciais}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[19px] font-black text-white">{nome}</p>
            {subtitulo && <p className="mt-0.5 truncate text-xs font-semibold text-white/70">{subtitulo}</p>}
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`inline-flex flex-none items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${
                  premium ? "bg-[#FFF6E0] text-[#946200]" : "bg-white/15 text-white/80"
                }`}
              >
                {premium && <Crown className="h-3 w-3" />}
                {premium ? "Premium" : "Gratuito"}
              </span>
              {email && <span className="min-w-0 truncate text-[11px] font-semibold text-white/50">{email}</span>}
            </div>
          </div>
          <button type="button" onClick={onEditar} aria-label="Editar perfil" className="flex-none p-1">
            <Pencil className="h-5 w-5 text-white/70" />
          </button>
        </div>
      </header>

      <div className="mx-auto -mt-2.5 flex w-full max-w-2xl flex-col gap-3 px-4 pb-6 pt-3.5">
        {aviso}

        <section className="rounded-[20px] border border-[#E6EAEE] bg-white p-[18px]">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[17px] font-black text-ecg-midnight">Nível {nivel}</p>
              <p className="mt-0.5 text-xs font-semibold text-[#6B7785]">
                Faltam {xpFaltando} XP para o nível {nivel + 1}
              </p>
            </div>
            <p className="flex-none text-xl font-black text-ecg-midnight-2">
              {xp} <span className="text-xs font-extrabold text-[#9AA6B2]">XP</span>
            </p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#EDF1F4]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#22C55E] to-ecg-green"
              style={{ width: `${progressoNivel}%` }}
            />
          </div>
        </section>

        {indicadores.length > 0 && (
          <div className="flex gap-2.5">
            {indicadores.map((s) => (
              <div key={s.l} className="flex-1 rounded-[18px] border border-[#E6EAEE] bg-white p-3.5 text-center">
                <p className="text-xl font-black" style={{ color: s.c }}>
                  {s.v}
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-[#6B7785]">{s.l}</p>
              </div>
            ))}
          </div>
        )}

        {children}

        <section className="overflow-hidden rounded-[20px] border border-[#E6EAEE] bg-white">
          {opcoes.map((o) => (
            <LinhaOpcao key={o.id} opcao={o} />
          ))}
          <button
            type="button"
            onClick={onSair}
            className="flex w-full items-center gap-3 px-4 py-[15px] text-left hover:bg-[#FFF5F5]"
          >
            <LogOut className="h-[19px] w-[19px] flex-none text-[#DC2626]" />
            <span className="min-w-0 flex-1 text-sm font-bold text-[#DC2626]">Sair da conta</span>
          </button>
        </section>
      </div>
    </div>
  );
}

function LinhaOpcao({ opcao: o }) {
  const perigo = o.tom === "perigo";
  const classes = `flex w-full items-center gap-3 border-b border-[#F2F5F7] px-4 py-[15px] text-left ${
    perigo ? "hover:bg-[#FFF5F5]" : "hover:bg-[#F8FAFB]"
  }`;
  const conteudo = (
    <>
      <o.Icon className={`h-[19px] w-[19px] flex-none ${perigo ? "text-[#DC2626]" : "text-[#6B7785]"}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-bold ${perigo ? "text-[#DC2626]" : "text-ecg-midnight"}`}>{o.nome}</span>
        {o.detalhe && <span className="block text-xs font-semibold text-[#9AA6B2]">{o.detalhe}</span>}
      </span>
      <ChevronRight className="h-[17px] w-[17px] flex-none text-[#B4BEC8]" />
    </>
  );
  return o.to ? (
    <Link to={o.to} className={classes}>
      {conteudo}
    </Link>
  ) : (
    <button type="button" onClick={o.onClick} className={classes}>
      {conteudo}
    </button>
  );
}

// Card de seção do Perfil (plano, edição, notificações), no mesmo visual.
export function SecaoPerfil({ Icone, titulo, acao, children }) {
  return (
    <section className="rounded-[20px] border border-[#E6EAEE] bg-white p-[18px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-[15px] font-black text-ecg-midnight">
          {Icone && <Icone className="h-5 w-5 flex-none text-[#946200]" />}
          <span className="truncate">{titulo}</span>
        </p>
        {acao}
      </div>
      {children}
    </section>
  );
}
