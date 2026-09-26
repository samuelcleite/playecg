import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Crown, UserMinus, Users, UserX, Clock } from "lucide-react";
import { ROTULO_ORIGEM } from "./classificacao";

// Cartões de segmento no topo da tela. Cada um é um filtro: clicar aplica,
// clicar de novo no ativo volta para "Todos".

const ORIGENS = ["mensal", "anual", "vitalicio", "cortesia", "manual", "assinatura"];

function Segmento({ id, rotulo, total, icone: Icone, cor, ativo, onSelecionar, pequeno }) {
  return (
    <button
      type="button"
      onClick={() => onSelecionar(ativo ? "todos" : id)}
      className={`text-left rounded-xl border transition-all ${
        ativo ? "ring-2 ring-purple-500 border-purple-300 bg-white shadow" : "border-gray-200 bg-white hover:border-gray-300"
      } ${pequeno ? "px-3 py-2" : "px-4 py-3"}`}
    >
      <div className="flex items-center gap-2">
        {Icone && <Icone className={`w-4 h-4 ${cor}`} />}
        <span className={`text-gray-600 ${pequeno ? "text-xs" : "text-sm"}`}>{rotulo}</span>
      </div>
      <p className={`font-bold text-gray-900 ${pequeno ? "text-lg" : "text-2xl"}`}>{total || 0}</p>
    </button>
  );
}

export default function SegmentosUsuarios({ contagem, segmento, onSelecionar }) {
  const premiumTotal = contagem.premium || 0;
  // "Assinatura (plano ?)" só aparece quando existe alguém nela: é o premium
  // de assinatura cujo valor pago não decidiu entre mensal e anual.
  const origens = ORIGENS.filter((o) => o !== "assinatura" || contagem[`premium:${o}`]);

  return (
    <Card className="border-none shadow-lg">
      <CardContent className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Segmento id="todos" rotulo="Todos" total={contagem.todos} icone={Users} cor="text-blue-600"
            ativo={segmento === "todos"} onSelecionar={onSelecionar} />
          <Segmento id="nunca_pagou" rotulo="Nunca pagou" total={contagem.nunca_pagou} icone={UserX} cor="text-gray-500"
            ativo={segmento === "nunca_pagou"} onSelecionar={onSelecionar} />
          <Segmento id="cortesia_vencida" rotulo="Cortesia vencida sem compra" total={contagem.cortesia_vencida} icone={Clock} cor="text-orange-600"
            ativo={segmento === "cortesia_vencida"} onSelecionar={onSelecionar} />
          <Segmento id="ex_assinante" rotulo="Ex-assinantes" total={contagem.ex_assinante} icone={UserMinus} cor="text-red-600"
            ativo={segmento === "ex_assinante"} onSelecionar={onSelecionar} />
          <Segmento id="alerta" rotulo="Conferir" total={contagem.alerta} icone={AlertTriangle} cor="text-yellow-600"
            ativo={segmento === "alerta"} onSelecionar={onSelecionar} />
        </div>

        <div>
          <button
            type="button"
            onClick={() => onSelecionar(segmento === "premium" ? "todos" : "premium")}
            className={`flex items-center gap-2 mb-2 text-sm font-semibold rounded-md px-1 ${
              segmento === "premium" ? "text-purple-700" : "text-gray-700 hover:text-gray-900"
            }`}
          >
            <Crown className="w-4 h-4 text-amber-600" />
            Premium ativo: {premiumTotal}
          </button>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {origens.map((o) => (
              <Segmento key={o} id={`premium:${o}`} rotulo={ROTULO_ORIGEM[o]} total={contagem[`premium:${o}`]}
                ativo={segmento === `premium:${o}`} onSelecionar={onSelecionar} pequeno />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
