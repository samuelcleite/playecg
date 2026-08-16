import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw
} from "lucide-react";

// TrialAuditPanel — o resultado do auditTrialInvariants, em uma linha.
// -----------------------------------------------------------------------------
// POR QUE ELE FICA SEMPRE VISÍVEL, MESMO QUANDO ESTÁ TUDO BEM
//
// Um painel que só aparece quando há problema é um painel que ninguém sabe que
// existe — e cuja ausência não distingue "nada errado" de "a verificação nem
// rodou". A linha verde é a informação: alguém olhou, agora, e não havia nada.
//
// A ordem de severidade não é cosmética. `critico` significa que uma conta paga
// está em rota de perder acesso; `atencao`, que o registro está inconsistente
// sem prejudicar ninguém; `info`, que só falta higiene. Misturar os três numa
// contagem única faria a única linha que importa desaparecer no meio das outras.
// -----------------------------------------------------------------------------

const SEVERIDADES = {
  critico: { label: "Crítico", cor: "bg-red-100 text-red-800 border-red-300" },
  atencao: { label: "Atenção", cor: "bg-amber-100 text-amber-800 border-amber-300" },
  info: { label: "Informação", cor: "bg-blue-100 text-blue-800 border-blue-300" }
};

const ORDEM = ["critico", "atencao", "info"];

export default function TrialAuditPanel({ auditoria, carregando, onRecarregar }) {
  const [aberto, setAberto] = useState(false);

  if (carregando && !auditoria) {
    return (
      <Card className="border-none shadow-lg">
        <CardContent className="p-4 flex items-center gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          Verificando integridade dos acessos...
        </CardContent>
      </Card>
    );
  }

  if (!auditoria) return null;

  if (auditoria.erro) {
    return (
      <Card className="border-none shadow-lg bg-gray-50">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <span className="text-sm text-gray-600">
            Não foi possível verificar a integridade: {auditoria.erro}
          </span>
          <Button variant="outline" size="sm" onClick={onRecarregar} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { resumo, achados = [] } = auditoria;
  const temCritico = resumo.criticos > 0;
  const temAlgo = achados.length > 0;

  const ordenados = [...achados].sort(
    (a, b) => ORDEM.indexOf(a.severidade) - ORDEM.indexOf(b.severidade)
  );

  return (
    <Card className={`border-none shadow-lg ${temCritico ? "bg-red-50" : temAlgo ? "bg-amber-50" : "bg-emerald-50"}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {temCritico
              ? <ShieldAlert className="w-6 h-6 text-red-600 shrink-0" />
              : <ShieldCheck className={`w-6 h-6 shrink-0 ${temAlgo ? "text-amber-600" : "text-emerald-600"}`} />}
            <div>
              <p className={`font-semibold ${temCritico ? "text-red-900" : temAlgo ? "text-amber-900" : "text-emerald-900"}`}>
                {temCritico
                  ? `${resumo.criticos} inconsistência(s) crítica(s) — acesso pago em risco`
                  : temAlgo
                    ? "Nenhum problema crítico; há apontamentos menores"
                    : "Nenhuma inconsistência nos acessos"}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {auditoria.contas_analisadas} contas verificadas
                {temAlgo && ` · ${resumo.criticos} crítico(s), ${resumo.atencao} atenção, ${resumo.info} informação`}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onRecarregar} disabled={carregando} className="gap-2">
              {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Verificar
            </Button>
            {temAlgo && (
              <Button variant="outline" size="sm" onClick={() => setAberto(!aberto)} className="gap-2">
                {aberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {aberto ? "Ocultar" : "Ver detalhes"}
              </Button>
            )}
          </div>
        </div>

        {aberto && temAlgo && (
          <div className="mt-4 pt-4 border-t border-black/10 space-y-2 max-h-96 overflow-y-auto">
            {ordenados.map((a, i) => {
              const sev = SEVERIDADES[a.severidade] || SEVERIDADES.info;
              return (
                <div key={`${a.user_email}-${a.tipo}-${i}`} className="bg-white/70 rounded-lg p-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge className={`${sev.cor} border`}>{sev.label}</Badge>
                    <span className="font-medium text-gray-900 text-sm">{a.user_email}</span>
                    <span className="text-xs text-gray-500 font-mono">{a.tipo}</span>
                  </div>
                  <p className="text-sm text-gray-700">{a.detalhe}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
