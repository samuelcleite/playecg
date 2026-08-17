import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getCurrentUser } from "@/lib/currentUser";
import { Clock } from "lucide-react";

// TrialBanner — a faixa que avisa quanto tempo resta da cortesia.
// -----------------------------------------------------------------------------
// É a única parte do app que sabe o que é um trial. Todo o resto continua
// checando `subscription_type === 'premium'` e não faz ideia de que aquele
// premium tem prazo — que é justamente o que mantém a feature barata.
//
// POR QUE ELA NÃO PODE SER DISPENSÁVEL
//
// Um "x" para fechar transformaria isto num aviso que aparece uma vez e some. O
// usuário em cortesia que não sabe que vai perder o acesso não compra: ele só
// descobre no dia em que o app volta a cobrar, e aí a experiência é de perda,
// não de oferta. A faixa é discreta de propósito para poder ficar.
//
// Ela se lê da Account, e o campo já vem resolvido: o getMyAccount encerra a
// cortesia vencida ANTES de responder, então `trial_ends_at` no passado não
// chega aqui na prática. A checagem de data existe mesmo assim porque este
// componente não controla quem o renderiza.
// -----------------------------------------------------------------------------

const DIA_MS = 24 * 60 * 60 * 1000;

export default function TrialBanner() {
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    let vivo = true;
    // getCurrentUser tem cache por carregamento de página: isto não acrescenta
    // requisição nenhuma às telas que já chamam o mesmo helper.
    getCurrentUser()
      .then(u => { if (vivo) setUser(u); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const fim = user?.trial_ends_at ? new Date(user.trial_ends_at) : null;
  if (!fim || isNaN(fim.getTime())) return null;
  if (user.subscription_type !== "premium") return null;

  const restaMs = fim.getTime() - Date.now();
  if (restaMs <= 0) return null;

  // Arredonda para cima: com 18 horas restando, "1 dia" é mais honesto do que
  // "0 dias" — e "hoje" é o que o último dia realmente significa.
  const dias = Math.ceil(restaMs / DIA_MS);
  const urgente = dias <= 3;

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm border-b ${
        urgente
          ? "bg-amber-50 border-amber-200 text-amber-900"
          : "bg-ecg-green/15 border-ecg-green/30 text-ecg-midnight"
      }`}
    >
      <Clock className={`w-4 h-4 shrink-0 ${urgente ? "text-amber-600" : "text-ecg-midnight/70"}`} />
      <span className="font-semibold">
        {dias === 1
          ? "Seu acesso de cortesia termina hoje"
          : `Seu acesso de cortesia termina em ${dias} dias`}
      </span>
      <Link
        to={createPageUrl("Upgrade")}
        className="font-bold underline underline-offset-2 hover:opacity-80"
      >
        Assine para continuar
      </Link>
    </div>
  );
}
