import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { CATEGORIAS, COR_CATEGORIA, formatarDia, formatarMoeda, emAberto } from "./financeiro";

// Despesas do período (ou todas as em aberto). "Duplicar" abre o formulário
// já preenchido para o mês seguinte — é como se lança conta recorrente.

export default function ListaDespesas({ despesas, hoje, onEditar, onDuplicar, onExcluir, excluindo }) {
  if (despesas.length === 0) {
    return <div className="text-center py-10 text-gray-500">Nenhuma despesa neste período.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="py-2 px-3 font-medium">Despesa</th>
            <th className="py-2 px-3 font-medium">Tipo</th>
            <th className="py-2 px-3 font-medium text-right">Valor</th>
            <th className="py-2 px-3 font-medium">Competência</th>
            <th className="py-2 px-3 font-medium">Pagamento</th>
            <th className="py-2 px-3" />
          </tr>
        </thead>
        <tbody>
          {despesas.map((d) => (
            <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2 px-3">
                <p className="text-gray-900">{d.name}</p>
                {d.notes && <p className="text-xs text-gray-500 line-clamp-1" title={d.notes}>{d.notes}</p>}
              </td>
              <td className="py-2 px-3">
                <Badge className={`${COR_CATEGORIA[d.category] || COR_CATEGORIA.outros} border whitespace-nowrap`}>
                  {CATEGORIAS[d.category] || d.category}
                </Badge>
              </td>
              <td className="py-2 px-3 text-right whitespace-nowrap font-medium text-gray-900">
                {formatarMoeda(d.amount)}
              </td>
              <td className="py-2 px-3 whitespace-nowrap text-gray-700">{formatarDia(d.competence_date)}</td>
              <td className="py-2 px-3 whitespace-nowrap">
                {!d.payment_date ? (
                  <Badge className="bg-orange-50 text-orange-700 border border-orange-200">Em aberto</Badge>
                ) : (
                  <span className={emAberto(d, hoje) ? "text-orange-700" : "text-gray-700"}>
                    {formatarDia(d.payment_date)}
                    {emAberto(d, hoje) && <span className="text-xs"> (agendado)</span>}
                  </span>
                )}
              </td>
              <td className="py-1 px-2 whitespace-nowrap text-right">
                <Button variant="ghost" size="icon" title="Editar" onClick={() => onEditar(d)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" title="Duplicar para o mês seguinte" onClick={() => onDuplicar(d)}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Excluir"
                  onClick={() => onExcluir(d)}
                  disabled={excluindo === d.id}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
