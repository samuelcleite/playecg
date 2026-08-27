import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Crown } from "lucide-react";

// Chamada do Premium no rodapé da tela inicial. Vive num componente próprio
// porque a Dashboard mobile e o StatsPanel (desktop) mostram a mesma peça — e
// quando o texto muda, precisa mudar nos dois.
export default function PremiumUpsellCard() {
  return (
    // `block` nao e decorativo: no mobile este card e o ultimo item de uma
    // lista com `space-y-3`, e o espacamento do Tailwind e margin-top no
    // irmao. Um <a> inline (o padrao do Link) ignora margin vertical, entao
    // sem isto o bloco de upgrade encosta no card anterior. Os outros itens
    // da mesma lista ja levam `block` pelo mesmo motivo.
    <Link to={createPageUrl("Upgrade")} className="block">
      <Card className="border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 cursor-pointer hover:shadow-lg transition-all">
        <CardContent className="p-4 text-center">
          <Crown className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="font-bold text-amber-900 text-sm mb-1">Plano Premium</p>
          <p className="text-xs text-amber-700 mb-3">
            Módulos estruturados e material teórico para um aprendizado completo de ECG
          </p>
          <Button size="sm" className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
            Assine Agora
            <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}
