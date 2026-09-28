import { CANAIS, formatarMoeda, nomeDoMes } from "./financeiro";

// Mês a mês do ano escolhido, no regime escolhido. Clicar num mês filtra a
// lista de despesas e os cartões do topo; clicar de novo volta para o ano.

function Valor({ v, negativoVermelho }) {
  if (!v) return <span className="text-gray-300">—</span>;
  return <span className={negativoVermelho && v < 0 ? "text-red-700" : undefined}>{formatarMoeda(v)}</span>;
}

export default function TabelaMensal({ linhas, total, canaisVisiveis, mesAtual, mesSelecionado, onSelecionarMes }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="py-2 px-3 font-medium">Mês</th>
            {canaisVisiveis.map((c) => (
              <th key={c} className="py-2 px-3 font-medium text-right">{CANAIS[c]}</th>
            ))}
            <th className="py-2 px-3 font-medium text-right border-l border-gray-100">Receita</th>
            <th className="py-2 px-3 font-medium text-right">Despesas</th>
            <th className="py-2 px-3 font-medium text-right">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const selecionado = l.mes === mesSelecionado;
            return (
              <tr
                key={l.mes}
                onClick={() => onSelecionarMes(selecionado ? null : l.mes)}
                className={`border-b border-gray-50 cursor-pointer ${
                  selecionado ? "bg-purple-50" : "hover:bg-gray-50"
                }`}
              >
                <td className="py-2 px-3 whitespace-nowrap">
                  <span className={l.mes === mesAtual ? "font-semibold text-purple-700" : "text-gray-900"}>
                    {nomeDoMes(l.mes, { comAno: false })}
                  </span>
                  {l.previsto > 0 && (
                    <span
                      className="ml-2 text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1"
                      title={`${formatarMoeda(l.previsto)} deste mês têm data depois de hoje`}
                    >
                      previsto
                    </span>
                  )}
                </td>
                {canaisVisiveis.map((c) => (
                  <td key={c} className="py-2 px-3 text-right whitespace-nowrap text-gray-600">
                    <Valor v={l.canais[c]} />
                  </td>
                ))}
                <td className="py-2 px-3 text-right whitespace-nowrap font-medium text-gray-900 border-l border-gray-100">
                  <Valor v={l.receita} />
                </td>
                <td className="py-2 px-3 text-right whitespace-nowrap text-gray-700">
                  <Valor v={l.despesa} />
                </td>
                <td className="py-2 px-3 text-right whitespace-nowrap font-medium text-gray-900">
                  <Valor v={l.resultado} negativoVermelho />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 font-semibold text-gray-900">
            <td className="py-2 px-3">Total</td>
            {canaisVisiveis.map((c) => (
              <td key={c} className="py-2 px-3 text-right whitespace-nowrap">
                <Valor v={total.canais[c]} />
              </td>
            ))}
            <td className="py-2 px-3 text-right whitespace-nowrap border-l border-gray-100">
              <Valor v={total.receita} />
            </td>
            <td className="py-2 px-3 text-right whitespace-nowrap">
              <Valor v={total.despesa} />
            </td>
            <td className="py-2 px-3 text-right whitespace-nowrap">
              <Valor v={total.resultado} negativoVermelho />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
