import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import {
  ROTULO_SITUACAO,
  COR_SITUACAO,
  ROTULO_ORIGEM,
  COR_ORIGEM,
  ROTULO_PLATAFORMA,
  ROTULO_ALERTA,
  planoEstimado,
  formatarData,
  textoDiasDesde,
  precisao,
  jornada,
} from "./classificacao";

// Tabela compacta: uma linha por pessoa, clicável. O detalhe abre ao lado.

export function SeloSituacao({ usuario: u }) {
  if (u.premium) {
    const origem = u.origem || "manual";
    return (
      <Badge className={`${COR_ORIGEM[origem]} border whitespace-nowrap`}>
        {ROTULO_ORIGEM[origem]}
        {planoEstimado(u) && <span className="ml-0.5 opacity-60" title="Plano deduzido do valor pago">*</span>}
      </Badge>
    );
  }
  return (
    <Badge className={`${COR_SITUACAO[u.situacao]} border whitespace-nowrap`}>
      {ROTULO_SITUACAO[u.situacao]}
    </Badge>
  );
}

export function Jornada({ usuario }) {
  return (
    <div className="flex items-center gap-1">
      {jornada(usuario).map((passo) => (
        <span
          key={passo.chave}
          title={`${passo.rotulo}: ${passo.feito ? "sim" : "não"}`}
          className={`w-2.5 h-2.5 rounded-full ${passo.feito ? "bg-green-500" : "bg-gray-200"}`}
        />
      ))}
    </div>
  );
}

// Toda data da tabela no mesmo formato ("há X dias") e no mesmo bloco, à
// direita. A data exata aparece ao passar o mouse.
function CelulaData({ valor, primeira }) {
  return (
    <td
      className={`py-2 px-3 whitespace-nowrap text-gray-700 ${primeira ? "border-l border-gray-100" : ""}`}
      title={valor ? formatarData(valor) : undefined}
    >
      {textoDiasDesde(valor)}
    </td>
  );
}

export default function TabelaUsuarios({ usuarios, onAbrir, selecionado }) {
  if (usuarios.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">Nenhum usuário com esses filtros.</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="py-2 px-3 font-medium">Usuário</th>
            <th className="py-2 px-3 font-medium">Situação</th>
            <th className="py-2 px-3 font-medium">Plataforma</th>
            <th className="py-2 px-3 font-medium text-right">Tentativas</th>
            <th className="py-2 px-3 font-medium text-right">Acerto</th>
            <th className="py-2 px-3 font-medium">Jornada</th>
            <th className="py-2 px-3 font-medium border-l border-gray-100">Cadastro</th>
            <th className="py-2 px-3 font-medium">Último pagamento</th>
            <th className="py-2 px-3 font-medium">Último login</th>
            <th className="py-2 px-3 font-medium">Última prática</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => {
            const p = precisao(u);
            return (
              <tr
                key={u.id}
                onClick={() => onAbrir(u)}
                className={`border-b last:border-0 cursor-pointer hover:bg-purple-50/50 ${
                  selecionado === u.email ? "bg-purple-50" : ""
                }`}
              >
                <td className="py-2 px-3 max-w-[260px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-gray-900 truncate">{u.full_name || "Sem nome"}</span>
                    {u.role === "admin" && (
                      <Badge className="bg-purple-100 text-purple-800 border-purple-200 border text-[10px] px-1.5 py-0">Admin</Badge>
                    )}
                    {u.alerta && (
                      <span title={ROTULO_ALERTA[u.alerta]}>
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" />
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{u.email}</div>
                </td>
                <td className="py-2 px-3"><SeloSituacao usuario={u} /></td>
                <td className="py-2 px-3 whitespace-nowrap text-gray-700">
                  {u.plataforma ? ROTULO_PLATAFORMA[u.plataforma] : "—"}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-gray-900">{u.total_attempts}</td>
                <td className="py-2 px-3 text-right tabular-nums text-gray-900">{p === null ? "—" : `${p}%`}</td>
                <td className="py-2 px-3"><Jornada usuario={u} /></td>
                <CelulaData valor={u.created_date} primeira />
                <CelulaData valor={u.assinatura?.ultimo_pagamento_em} />
                <CelulaData valor={u.last_login_at} />
                <CelulaData valor={u.last_practice_date} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
