import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { getCurrentUser } from "@/lib/currentUser";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Crown,
  Check,
  Infinity as InfinityIcon,
  Loader2,
  CreditCard,
  XCircle,
  ShieldCheck,
} from "lucide-react";
import { motion } from "framer-motion";

// Página de venda do plano vitalício.
// -----------------------------------------------------------------------------
// OFERTA PRIVADA. Não é linkada de lugar nenhum — nem do menu, nem do Upgrade,
// nem do Dashboard. Só chega aqui quem recebeu a URL. Se um dia isto for
// linkado de dentro do app, a oferta deixa de ser o que é.
//
// Nada aqui é a trava de verdade. Elegibilidade e vagas são checadas de novo,
// server-side, dentro do createStripeCheckout — este link vai circular no
// WhatsApp, e chamar a function direto pelo console é trivial. O que a tela faz
// é evitar que alguém chegue até o Stripe para ser recusado depois.
// -----------------------------------------------------------------------------

export default function Vitalicio() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [vagas, setVagas] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erroDialog, setErroDialog] = useState({ open: false, title: '', message: '' });

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // As duas em paralelo: a tela não mostra nada até ter as duas, e
        // encadeá-las dobraria a espera à toa.
        const [conta, resposta] = await Promise.all([
          getCurrentUser(),
          base44.functions.invoke('getLifetimeSeats', {}).catch(() => null)
        ]);
        if (!vivo) return;
        setUser(conta);
        // null = não conseguimos saber quantas vagas restam. A tela trata isso
        // como "não sabemos", não como "esgotou": recusar uma venda por causa
        // de uma falha de rede seria o pior desfecho possível aqui.
        setVagas(
          typeof resposta?.data?.restantes === 'number' ? resposta.data.restantes : null
        );
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const comprar = async () => {
    // Mesma limitação do Upgrade: o Checkout do Stripe não roda dentro de
    // iframe (preview do Base44).
    if (window.self !== window.top) {
      setErroDialog({
        open: true,
        title: 'Abra o app publicado',
        message: 'O checkout só funciona no app publicado. Abra o app em uma nova aba para finalizar o pagamento.'
      });
      return;
    }

    setProcessando(true);
    try {
      const resposta = await base44.functions.invoke('createStripeCheckout', {
        plan: 'lifetime'
      });

      if (resposta.data?.success && resposta.data?.url) {
        window.location.href = resposta.data.url;
        return;
      }
      setErroDialog({
        open: true,
        title: 'Não foi possível continuar',
        message: resposta.data?.error || 'Erro ao gerar o checkout. Tente novamente.'
      });
    } catch (error) {
      console.error("Erro ao criar checkout vitalício:", error);
      setErroDialog({
        open: true,
        title: 'Não foi possível continuar',
        message: error.response?.data?.error || error.message || 'Erro desconhecido'
      });
    } finally {
      setProcessando(false);
    }
  };

  if (carregando) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  const elegivel = user?.subscription_type === 'free';
  const esgotado = vagas === 0;

  const beneficios = [
    "Acesso permanente a tudo que é premium hoje",
    "Trilha completa, do básico ao avançado",
    "Teoria liberada antes de cada fase",
    "Acesso ilimitado a todos os casos",
    "Conteúdo novo, sem pagar de novo"
  ];

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.6 }}
            className="w-20 h-20 bg-[#0D3B66] rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl"
          >
            <InfinityIcon className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            PlayECG Vitalício
          </h1>
          <p className="text-lg text-gray-600">
            Um pagamento. Acesso para sempre.
          </p>
        </div>

        <Card className="border-none shadow-2xl bg-blue-50 overflow-hidden">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-5xl font-bold text-gray-900">R$ 400,00</span>
              </div>
              <p className="text-gray-600 mt-2">
                Pagamento único. <strong>Não renova</strong> e não vira assinatura.
              </p>
            </div>

            <ul className="space-y-3 mb-8">
              {beneficios.map((b, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3"
                >
                  <Check className="w-5 h-5 text-[#22C55E] flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700 font-medium">{b}</span>
                </motion.li>
              ))}
            </ul>

            {/* Vagas. `null` significa "não conseguimos consultar" e some da
                tela: um número errado aqui é pior do que número nenhum. */}
            {vagas !== null && !esgotado && (
              <p className="text-center text-sm text-gray-600 mb-6">
                {vagas === 1
                  ? "Resta 1 vaga."
                  : `Restam ${vagas} vagas.`}
              </p>
            )}

            {/* ── Estado 1: vagas esgotadas ── */}
            {esgotado && (
              <Alert className="bg-amber-50 border-amber-200 mb-2">
                <AlertDescription className="text-amber-900">
                  <p className="font-semibold mb-1">As vagas acabaram.</p>
                  <p className="text-sm">
                    O vitalício tinha um número limitado de vagas e todas foram
                    preenchidas. Obrigado pelo interesse.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* ── Estado 2: já tem plano ativo ──
                Sem tom de recusa: a pessoa não fez nada errado, e o que ela
                tem já é o que esta página venderia. */}
            {!esgotado && !elegivel && (
              <Alert className="bg-blue-100 border-blue-200 mb-2">
                <Crown className="w-5 h-5 text-[#0D3B66]" />
                <AlertDescription className="text-blue-950">
                  <p className="font-semibold mb-1">Você já tem acesso premium.</p>
                  <p className="text-sm mb-4">
                    O vitalício é uma oferta para quem ainda não tem um plano
                    ativo. Seu acesso continua valendo normalmente — é só seguir
                    de onde parou.
                  </p>
                  <Button
                    onClick={() => navigate(createPageUrl("Dashboard"))}
                    className="bg-[#0D3B66] hover:bg-[#0a2f52] text-white font-semibold"
                  >
                    Ir para o conteúdo
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* ── Estado 3: pode comprar ── */}
            {!esgotado && elegivel && (
              <>
                <Alert className="bg-white border-blue-200 mb-6">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  <AlertDescription className="text-blue-900">
                    <p className="font-semibold flex items-center gap-2 mb-1">
                      <CreditCard className="w-4 h-4" />
                      Pagamento seguro com Stripe
                    </p>
                    <p className="text-sm">
                      Você será levado à página segura do Stripe. É uma cobrança
                      única no cartão — nada é cobrado de novo depois.
                    </p>
                  </AlertDescription>
                </Alert>

                <Button
                  className="w-full bg-[#22C55E] hover:bg-green-600 text-white font-semibold py-6 text-lg shadow-lg"
                  onClick={comprar}
                  disabled={processando}
                >
                  {processando ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <InfinityIcon className="w-5 h-5 mr-2" />
                      Garantir meu acesso vitalício
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-gray-500 mt-6">
                  Ao comprar, você concorda com nossos{" "}
                  <a
                    href="https://playecg.app/termos"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-gray-700"
                  >
                    Termos de Uso
                  </a>{" "}
                  e nossa{" "}
                  <a
                    href="https://playecg.app/privacidade"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-gray-700"
                  >
                    Política de Privacidade
                  </a>
                  .
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={erroDialog.open}
        onOpenChange={(open) => setErroDialog({ ...erroDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" />
              {erroDialog.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-gray-900">
              {erroDialog.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErroDialog({ ...erroDialog, open: false })}>
              Fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
