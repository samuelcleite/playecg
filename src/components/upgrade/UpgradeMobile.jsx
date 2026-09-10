import React, { useState } from "react";
import { ChevronLeft, Check, Ticket, Loader2 } from "lucide-react";
import BarraDeAcao from "@/components/BarraDeAcao";
import { useCorDaFaixa, FAIXA_BRANCA } from "@/lib/faixaTopo";

/* Upgrade (1h). Só o layout: tudo o que decide dinheiro — compra por loja,
   Stripe, cupom, oferta do Play, offer code da Apple, restaurar — continua na
   página, e entra aqui pelos espaços abaixo.

   - planos = [{ id, nome, detalhe, selo }], controlado por `escolhido`.
   - `preco`: bloco de preço com cupom (riscado, aviso de duração).
   - `cupom`: o formulário/estado do cupom. Fica recolhido atrás do "Tenho um
     cupom de desconto" até alguém tocar — ou até `cupomAberto` (cupom já
     aplicado, erro, código vindo de link), que a página decide.
   - `detalhes`: pagamento seguro, restaurar compras.
   - `legal`: termos e privacidade, que a Apple exige perto do botão
     (Guideline 3.1.2(c)) — por isso moram DENTRO da barra do botão.

   Faixa do relógio branca, não azul como o topo: ver ProfileMobile. */

const MASCOTE = "https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/2f88aa807_image.png";

export default function UpgradeMobile({
  planos = [],
  escolhido,
  onEscolher,
  beneficios = [],
  onVoltar,
  preco = null,
  cupom = null,
  cupomAberto = false,
  detalhes = null,
  rotuloBotao = "ASSINAR",
  onAssinar,
  processando = false,
  legal = null,
}) {
  useCorDaFaixa(FAIXA_BRANCA);
  const [abriuCupom, setAbriuCupom] = useState(false);
  const mostrarCupom = abriuCupom || cupomAberto;

  return (
    <div className="font-nunito flex min-h-full flex-col bg-[#F4F6F8]">
      <header className="bg-ecg-midnight">
        <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-2.5">
          <button type="button" onClick={onVoltar} aria-label="Voltar" className="-ml-1 p-1">
            <ChevronLeft className="h-[22px] w-[22px] text-white/80" strokeWidth={2.5} />
          </button>
          <div className="mt-3 flex items-center gap-3.5">
            <img src={MASCOTE} alt="" className="block w-[78px] flex-none" />
            <div className="min-w-0 flex-1">
              <p className="text-[22px] font-black leading-tight text-ecg-green">Libere os 8 módulos</p>
              <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-white/[.78]">
                Trilha completa, teoria antes de cada fase e casos sem limite diário.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto -mt-3 flex w-full max-w-2xl flex-col gap-3 px-4 pb-6 pt-4">
        <div className="flex flex-col gap-3" role="radiogroup" aria-label="Escolha o plano">
          {planos.map((p) => {
            const ativo = p.id === escolhido;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => onEscolher?.(p.id)}
                className={`relative flex items-center gap-3 rounded-[20px] border-2 bg-white p-4 text-left ${
                  ativo ? "border-ecg-green" : "border-[#E6EAEE]"
                }`}
              >
                {p.selo && (
                  <span className="absolute -top-2.5 left-4 rounded-[7px] bg-ecg-green px-2 py-0.5 text-[10px] font-black tracking-wide text-ecg-midnight">
                    {p.selo}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-black text-ecg-midnight">{p.nome}</span>
                  <span className="block text-xs font-semibold text-[#6B7785]">{p.detalhe}</span>
                </span>
                <span
                  className={`block h-6 w-6 flex-none rounded-full ${
                    ativo ? "border-[7px] border-ecg-green bg-ecg-midnight" : "border-2 border-[#C9D3DC]"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {preco}

        <section className="flex flex-col gap-2.5 rounded-[20px] border border-[#E6EAEE] bg-white p-[18px]">
          {beneficios.map((b) => (
            <div key={b} className="flex items-start gap-3">
              <Check className="mt-0.5 h-[18px] w-[18px] flex-none text-[#22C55E]" strokeWidth={3} />
              <span className="text-[13px] font-bold leading-snug text-ecg-midnight">{b}</span>
            </div>
          ))}
        </section>

        {mostrarCupom ? (
          cupom
        ) : (
          <button
            type="button"
            onClick={() => setAbriuCupom(true)}
            className="flex items-center justify-center gap-1.5 py-1"
          >
            <Ticket className="h-4 w-4 text-ecg-midnight-2" />
            <span className="text-[13px] font-extrabold text-ecg-midnight-2 underline">
              Tenho um cupom de desconto
            </span>
          </button>
        )}

        {detalhes}
      </div>

      <BarraDeAcao>
        <button
          type="button"
          onClick={onAssinar}
          disabled={processando}
          className="block w-full rounded-[14px] bg-ecg-green py-[15px] text-center text-base font-black tracking-wide text-ecg-midnight shadow-[0_4px_0_#16a34a] transition-transform active:translate-y-[3px] active:shadow-[0_1px_0_#16a34a] disabled:opacity-70"
        >
          {processando ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              PROCESSANDO...
            </span>
          ) : (
            rotuloBotao
          )}
        </button>
        <p className="mt-2 text-center text-[11px] font-semibold text-[#9AA6B2]">
          Renovação automática. Cancele a qualquer momento.
        </p>
        {legal}
      </BarraDeAcao>
    </div>
  );
}
