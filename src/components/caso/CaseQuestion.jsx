import React from "react";
import { Link } from "react-router-dom";
import { X, Check, Maximize2, AlertTriangle } from "lucide-react";
import BarraDeAcao, { BotaoPrincipal } from "@/components/BarraDeAcao";
import { useCorDaFaixa, FAIXA_BRANCA } from "@/lib/faixaTopo";

/* Caso em andamento (1c), ampliado para cobrir as três telas de caso — Quiz,
   ModuleDetail e DailyCase.

   Controlado: a página guarda `selecionadas` e decide o que o botão faz.

   Topo: com `total` > 0 mostra a barra de progresso (`passo`/`total`, ou
   `rotuloProgresso`); sem ele, o `titulo`. `faixa` entra logo abaixo (contador
   do gratuito, aviso de revisão).

   Alternativas: [{ id, texto }]. `multipla` troca para caixas de marcar e
   mostra a instrução. `bloqueada` trava a seleção — é o estado depois de uma
   tentativa errada, até a pessoa tocar em TENTAR DE NOVO.

   Rodapé: por padrão o VERIFICAR (desabilitado sem seleção). Com `aviso`
   ({ titulo, texto }) ele vira o painel laranja de tentativa errada. O botão
   é sempre `rotuloBotao`/`onBotao`; `ocupado` mostra o spinner.

   O ECG aparece inteiro, na proporção da imagem. O design cortava num quadro
   de 190px com object-cover — num traçado de 12 derivações isso some com as
   pontas, e é nas pontas que ficam V5, V6 e o ritmo longo. */

export default function CaseQuestion({
  titulo = "",
  passo = 0,
  total = 0,
  rotuloProgresso,
  onFechar,
  faixa = null,
  contexto = "",
  ecgUrl,
  legendaEcg = "",
  onAmpliarEcg,
  pergunta = "",
  codigo,
  acoes = null,
  alternativas = [],
  multipla = false,
  selecionadas = [],
  onAlternar,
  bloqueada = false,
  aviso = null,
  rotuloBotao = "VERIFICAR",
  onBotao,
  botaoDesabilitado,
  ocupado = false,
}) {
  useCorDaFaixa(FAIXA_BRANCA);
  const comProgresso = total > 0;
  const pct = comProgresso ? Math.min(100, Math.round((passo / total) * 100)) : 0;
  const desabilitado = botaoDesabilitado ?? (!aviso && selecionadas.length === 0);

  return (
    <div className="font-nunito flex min-h-full flex-col bg-[#F4F6F8]">
      {/* `top` na safe-area pelo mesmo motivo do Dashboard: com top:0 o topo
          gruda na borda física e some debaixo do relógio ao rolar. */}
      <header
        className="sticky z-30 border-b border-[#E6EAEE] bg-white"
        style={{ top: "var(--app-safe-top, 0px)" }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-3.5 pt-2.5">
          <button type="button" onClick={onFechar} aria-label="Sair do caso" className="flex-none">
            <X className="h-[22px] w-[22px] text-[#9AA6B2]" strokeWidth={2.5} />
          </button>
          {comProgresso ? (
            <>
              <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-[#EDF1F4]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#22C55E] to-ecg-green transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="flex-none text-sm font-black text-[#6B7785]">
                {rotuloProgresso ?? `${passo}/${total}`}
              </span>
            </>
          ) : (
            <p className="min-w-0 flex-1 truncate text-[17px] font-black text-ecg-midnight">{titulo}</p>
          )}
        </div>
        {faixa}
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3.5 px-4 pb-6 pt-4">
        <section className="rounded-[20px] border border-[#E6EAEE] bg-white p-3.5">
          {contexto && (
            <p className="mb-2.5 text-xs font-bold leading-relaxed text-[#6B7785]">
              <span className="font-extrabold text-ecg-midnight">Paciente: </span>
              {contexto}
            </p>
          )}

          {ecgUrl && (
            <button
              type="button"
              onClick={onAmpliarEcg}
              disabled={!onAmpliarEcg}
              aria-label="Ampliar o traçado"
              className="relative block w-full overflow-hidden rounded-[14px] bg-[#FDEBEB]"
            >
              <img src={ecgUrl} alt="Traçado de ECG" className="mx-auto block h-auto max-w-full" />
              {onAmpliarEcg && (
                <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 shadow-sm">
                  <Maximize2 className="h-4 w-4 text-ecg-midnight" />
                </span>
              )}
              {legendaEcg && (
                <span className="absolute bottom-2 right-2.5 rounded-md bg-white/85 px-1.5 py-0.5 text-[10px] font-extrabold text-[#A33]">
                  {legendaEcg}
                </span>
              )}
            </button>
          )}

          <div className={ecgUrl ? "mt-3" : ""}>
            <p className="text-base font-extrabold leading-snug text-ecg-midnight">{pergunta}</p>
            {codigo && (
              <p className="mt-0.5 select-all font-mono text-[10px] text-[#C9D3DC]">#{codigo}</p>
            )}
          </div>

          {acoes && <div className="mt-3 flex flex-wrap gap-2">{acoes}</div>}
        </section>

        {multipla && (
          <p className="px-1 text-xs font-extrabold tracking-wide text-[#6B7785]">
            SELECIONE TODAS AS RESPOSTAS CORRETAS
          </p>
        )}

        <div className="flex flex-col gap-2.5" role={multipla ? "group" : "radiogroup"}>
          {alternativas.map((a) => {
            const ativa = selecionadas.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                role={multipla ? "checkbox" : "radio"}
                aria-checked={ativa}
                disabled={bloqueada}
                onClick={() => onAlternar?.(a.id)}
                className={`flex items-start gap-3 rounded-2xl border-2 p-3.5 text-left text-sm transition-colors disabled:cursor-default ${
                  ativa
                    ? "border-ecg-midnight-2 bg-[#EEF6FF] font-extrabold text-ecg-midnight-2"
                    : `border-[#E6EAEE] bg-white font-bold text-ecg-midnight ${bloqueada ? "" : "hover:border-ecg-midnight-2"}`
                } ${bloqueada && !ativa ? "opacity-60" : ""}`}
              >
                {multipla && (
                  <span
                    className={`mt-px flex h-5 w-5 flex-none items-center justify-center rounded-md border-2 ${
                      ativa ? "border-ecg-midnight-2 bg-ecg-midnight-2" : "border-[#C9D3DC] bg-white"
                    }`}
                  >
                    {ativa && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.5} />}
                  </span>
                )}
                <span className="min-w-0 flex-1 whitespace-normal break-words">{a.texto}</span>
              </button>
            );
          })}
        </div>
      </div>

      <BarraDeAcao>
        {aviso && (
          <div className="mb-3 flex items-start gap-2.5" role="status">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-[#C2410C]" strokeWidth={2.5} />
            <div className="min-w-0">
              <p className="text-[15px] font-black text-[#C2410C]">{aviso.titulo}</p>
              {aviso.texto && <p className="mt-0.5 text-[13px] font-bold text-[#9A3412]">{aviso.texto}</p>}
            </div>
          </div>
        )}
        <BotaoPrincipal
          onClick={onBotao}
          disabled={desabilitado}
          ocupado={ocupado}
          tom={aviso ? "laranja" : "verde"}
        >
          {rotuloBotao}
        </BotaoPrincipal>
      </BarraDeAcao>
    </div>
  );
}

// Botão pequeno da linha de ações do card (tem dúvidas, reportar, editar).
export function AcaoDoCaso({ Icone, children, to, onClick, tom = "neutro" }) {
  const cores =
    tom === "perigo"
      ? "border-[#F5C2C2] text-[#B91C1C] hover:bg-[#FFF5F5]"
      : "border-[#E6EAEE] text-ecg-midnight-2 hover:bg-[#F4F6F8]";
  const classes = `inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-extrabold ${cores}`;
  const conteudo = (
    <>
      {Icone && <Icone className="h-3.5 w-3.5" />}
      {children}
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
