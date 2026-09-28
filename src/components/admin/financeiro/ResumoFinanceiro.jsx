import { Card, CardContent } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, Scale, Hourglass, Receipt } from "lucide-react";
import { formatarMoeda } from "./financeiro";

// Cartões do topo. Os três primeiros seguem o período e o regime escolhidos;
// "A receber" e "A pagar" são a posição de hoje, qualquer que seja o período.

function Cartao({ rotulo, valor, detalhe, icone: Icone, cor, destaque, onClick, ativo }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`text-left rounded-xl border bg-white px-4 py-3 transition-all ${
        ativo ? "ring-2 ring-purple-500 border-purple-300 shadow" : "border-gray-200"
      } ${onClick ? "hover:border-gray-300" : ""}`}
    >
      <div className="flex items-center gap-2">
        <Icone className={`w-4 h-4 ${cor}`} />
        <span className="text-sm text-gray-600">{rotulo}</span>
      </div>
      <p className={`text-2xl font-bold ${destaque || "text-gray-900"}`}>{formatarMoeda(valor)}</p>
      {detalhe && <p className="text-xs text-gray-500 mt-0.5">{detalhe}</p>}
    </Tag>
  );
}

export default function ResumoFinanceiro({ total, posicao, rotuloPeriodo, somenteEmAberto, onAlternarEmAberto }) {
  const margem = total.receita > 0 ? Math.round((total.resultado / total.receita) * 100) : null;

  return (
    <Card className="border-none shadow-lg">
      <CardContent className="p-4 md:p-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Cartao
            rotulo={`Receita · ${rotuloPeriodo}`}
            valor={total.receita}
            detalhe={`${total.vendas} ${total.vendas === 1 ? "pagamento" : "pagamentos"}`}
            icone={ArrowUpCircle}
            cor="text-green-600"
          />
          <Cartao
            rotulo={`Despesas · ${rotuloPeriodo}`}
            valor={total.despesa}
            icone={ArrowDownCircle}
            cor="text-red-600"
          />
          <Cartao
            rotulo="Resultado"
            valor={total.resultado}
            detalhe={margem != null ? `margem de ${margem}%` : null}
            icone={Scale}
            cor="text-purple-600"
            destaque={total.resultado < 0 ? "text-red-700" : "text-green-700"}
          />
          <Cartao
            rotulo="A receber"
            valor={posicao.aReceber}
            detalhe="vendido, ainda não caiu na conta"
            icone={Hourglass}
            cor="text-amber-600"
          />
          <Cartao
            rotulo="A pagar"
            valor={posicao.aPagar}
            detalhe={`${posicao.aPagarQtd} em aberto · clique para ver`}
            icone={Receipt}
            cor="text-orange-600"
            onClick={onAlternarEmAberto}
            ativo={somenteEmAberto}
          />
        </div>
      </CardContent>
    </Card>
  );
}
