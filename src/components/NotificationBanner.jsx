import React, { useState, useEffect } from "react";
import { savePushSubscription } from "@/functions/savePushSubscription";
import { getVapidPublicKey } from "@/functions/getVapidPublicKey";
import { motion } from "framer-motion";
import { consultarPromoPush, resgatarPromoPush } from "@/lib/promocaoPush";
import Confete from "@/components/Confete";
import { Bell, X, Loader2, Gift, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isIOSNativeApp } from "@/utils/platform";
import {
  estadoDaPermissaoNativa,
  pedirPermissaoNativa,
  abrirAjustesDoSistema
} from "@/utils/pushNativo";

// PROMOÇÃO: ativar notificações vale N dias de premium.
//
// Quem decide se ela existe, quanto vale e se ESTA pessoa pode ganhar é a
// function `promocoes` — nada disso é decidido aqui. O frontend não sabe o
// número de dias, não sabe se a campanha está no ar e não sabe se o usuário já
// resgatou: ele pergunta e obedece. É o que permite desligar a promoção mudando
// uma variável de ambiente, sem tocar no app nem publicar versão.
//
// A promoção NÃO é retroativa: o resgate acontece apenas na sequência do gesto
// que concedeu a permissão. Quem já tinha notificações ativas antes da campanha
// não vê oferta nenhuma — o benefício paga por uma ativação que não existiria,
// não por uma que já aconteceu. Ver src/lib/promocaoPush.js, que explica por que
// o corte é pelo fluxo e não por uma data.

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function NotificationBanner() {
  const [status, setStatus] = useState("loading");
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Só no app iOS: o pedirPermissaoNativa espera até 10s pelo desfecho do
  // diálogo do sistema. Sem um rótulo próprio para essa espera, o botão fica
  // dizendo "Ativando..." por dez segundos — e para quem já recusou antes o
  // diálogo nem aparece (a recusa no iOS é definitiva), então a tela pareceria
  // simplesmente travada.
  const [pedindo, setPedindo] = useState(false);

  // Promoção: null = desligada, indisponível, ou esta pessoa não é elegível.
  // Os três casos são o mesmo para a tela — o banner volta a ser o que era
  // antes de a campanha existir.
  const [promo, setPromo] = useState(null);
  const [resgatando, setResgatando] = useState(false);
  const [resgatado, setResgatado] = useState(null);
  const [erroPromo, setErroPromo] = useState(null);

  useEffect(() => {
    checkStatus();
    checkPromo();
  }, []);

  const checkStatus = async () => {
    // APP iOS NATIVO: caminho próprio, ANTES do guard de PushManager.
    //
    // O WKWebView do Despia não expõe PushManager, então sem esta ramificação o
    // componente caía em "unsupported" e sumia — que é exatamente o que
    // acontecia até agora dentro do app. Lá o push não é Web Push: é o SDK do
    // OneSignal compilado no binário, e a permissão é a do sistema.
    if (isIOSNativeApp()) {
      const estado = await estadoDaPermissaoNativa();
      // Indeterminado renderiza NADA. Ver o bloco em utils/pushNativo.js: é o
      // que um binário sem o SDK devolve, e mostrar um botão que não faz nada
      // seria pior do que não mostrar botão nenhum.
      if (estado === "indeterminado") { setStatus("indeterminado"); return; }
      if (estado === "concedida") { setStatus("subscribed"); return; }
      setStatus("prompt");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    const permission = Notification.permission;
    if (permission === "denied") { setStatus("denied"); return; }
    if (permission === "granted") {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { setStatus("subscribed"); return; }
    }
    setStatus("prompt");
  };

  const checkPromo = async () => {
    // null cobre desligada, inelegível, já resgatada e falha de rede — para o
    // banner os quatro são o mesmo: continuar exatamente como era antes de a
    // campanha existir.
    setPromo(await consultarPromoPush());
  };

  const resgatar = async () => {
    setResgatando(true);
    setErroPromo(null);
    const r = await resgatarPromoPush();
    if (r.ok) setResgatado({ dias: r.dias });
    // Recusa silenciosa (não havia promoção para esta pessoa) não vira mensagem:
    // quem ativou notificações sem saber de promoção nenhuma não deve receber um
    // aviso sobre um prêmio que nunca lhe foi oferecido.
    else if (!r.silencioso) setErroPromo(r.erro);
    setResgatando(false);
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      // No app iOS o caminho inteiro é outro: prompt do sistema via Despia, sem
      // service worker, sem VAPID e sem savePushSubscription. Quem guarda a
      // inscrição é o OneSignal, e a vinculação com a conta já foi feita no
      // boot pelo AuthContext.
      if (isIOSNativeApp()) {
        setPedindo(true);
        try {
          const estado = await pedirPermissaoNativa();
          if (estado === "concedida") {
            setStatus("subscribed");
            // Resgate na sequência do mesmo gesto: a pessoa clicou por causa do
            // presente, e pedir um segundo clique para recebê-lo perderia
            // justamente quem já fez a parte difícil.
            //
            // SEM `if (promo)`. A condição existia e era uma corrida perdida:
            // quem tocasse no botão antes de a consulta de status responder
            // ativava as notificações e não ganhava nada — e depois o banner
            // some, porque a promoção não é retroativa. Cumpria o combinado e
            // ficava sem prêmio, sem segunda chance. Quem decide é o servidor.
            await resgatar();
          } else {
            setStatus("denied");
          }
        } finally {
          setPedindo(false);
        }
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setStatus("denied"); return; }

      const keyResponse = await getVapidPublicKey({});
      const vapidPublicKey = keyResponse.data.vapidPublicKey;
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
      const subJson = subscription.toJSON();
      await savePushSubscription({
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth
      });
      setStatus("subscribed");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Acabou de ganhar: o banner vira a comemoração, e não é dispensável.
  //
  // O resgate poderia ser silencioso — o premium já está valendo no instante em
  // que o servidor responde. Mas presente que ninguém percebe não vira nem
  // gratidão nem vontade de renovar quando vencer, e é a renovação que paga a
  // promoção. Por isso a festa: o pop de entrada, o confete e o card inteiro
  // dizendo o que a pessoa ganhou.
  //
  // Some sozinho no próximo carregamento, quando a promoção já não estiver
  // elegível para esta conta.
  if (resgatado) {
    return (
      <motion.div
        // Spring com overshoot: o card cresce um tiquinho além do tamanho final
        // e assenta. É o "pop" — a diferença entre um aviso que aparece e um
        // presente que chega.
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 16 }}
        className="relative mx-4 mb-5 rounded-2xl overflow-hidden shadow-2xl border-2 border-ecg-green bg-gradient-to-br from-ecg-green via-[#16A34A] to-ecg-midnight"
      >
        <Confete />

        <div className="relative px-4 py-5 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 12, delay: 0.15 }}
            className="text-5xl mb-2 leading-none"
          >
            🎉
          </motion.div>

          <motion.p
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="font-black text-white text-xl leading-tight drop-shadow"
          >
            Premium liberado!
          </motion.p>

          <motion.p
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="font-black text-white text-3xl leading-none mt-1 drop-shadow"
          >
            {resgatado.dias} dias grátis
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="text-white/90 text-sm font-semibold mt-3"
          >
            Trilha completa, teoria e casos ilimitados. Aproveite! 🚀
          </motion.p>
        </div>
      </motion.div>
    );
  }

  // Não mostrar se: não suportado, indeterminado, já inscrito, já foi fechado.
  // "indeterminado" só acontece no app iOS e significa que não deu para saber o
  // estado da permissão — ver utils/pushNativo.js.
  //
  // `subscribed` volta a sumir mesmo com promoção no ar, e isso é o que torna a
  // campanha NÃO retroativa: quem já tinha notificações ativas não recebe
  // oferta. Houve uma versão deste componente que mostrava aqui um card de
  // resgate — ela dava sete dias a quem não mudaria comportamento nenhum, que é
  // exatamente o que a promoção não deveria pagar.
  if (status === "loading" || status === "unsupported" || status === "indeterminado"
      || status === "subscribed" || dismissed) return null;

  if (status === "denied") {
    return (
      <div className="mx-4 mb-4 rounded-2xl bg-gray-100 border border-gray-200 px-4 py-3 flex items-center gap-3">
        <Bell className="w-5 h-5 text-gray-400 flex-shrink-0" />
        <p className="text-sm text-gray-500 flex-1">
          {isIOSNativeApp()
            ? "Notificações bloqueadas. Abra os Ajustes do iPhone para permitir."
            : "Notificações bloqueadas. Habilite nas configurações do seu navegador."}
        </p>
        {/* No iOS a recusa é definitiva — o prompt não reaparece. Os Ajustes
            são o único resgate, então o atalho não é um extra. */}
        {isIOSNativeApp() && (
          <Button
            onClick={abrirAjustesDoSistema}
            variant="outline"
            className="flex-shrink-0 h-8 text-xs rounded-lg"
          >
            Abrir Ajustes
          </Button>
        )}
      </div>
    );
  }

  // COM PROMOÇÃO: o banner inteiro muda de assunto.
  //
  // Não é o mesmo card com uma frase trocada. O que se vende aqui é o presente —
  // "7 dias de Premium de graça" —, e as notificações viram a condição, escrita
  // menor, embaixo. Invertido (notificação em cima, brinde embaixo) a oferta
  // fica parecendo um detalhe de um pedido de permissão, que é justamente o que
  // as pessoas ignoram.
  //
  // A entrada tem pop, e o selo "GRÁTIS" pulsa: é uma oferta por tempo limitado
  // competindo com o resto da tela pela atenção de quem só queria estudar.
  if (promo) {
    return (
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: -8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
        className="relative mx-4 mb-5 rounded-2xl overflow-hidden shadow-2xl border-2 border-ecg-green bg-gradient-to-br from-ecg-green via-[#16A34A] to-ecg-midnight"
      >
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 z-10 text-white/50 hover:text-white p-1"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-4 pt-5 pb-4 text-center">
          <motion.div
            animate={{ rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.12, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.5 }}
            className="text-4xl leading-none mb-2"
          >
            🎁
          </motion.div>

          <p className="font-black text-white text-lg leading-tight drop-shadow">
            Ative suas notificações e ganhe
          </p>

          <div className="flex items-center justify-center gap-2 mt-1">
            <p className="font-black text-white text-3xl leading-none drop-shadow">
              {promo.dias} dias de Premium
            </p>
            <motion.span
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="bg-yellow-300 text-ecg-midnight text-[11px] font-black px-2 py-0.5 rounded-full shadow"
            >
              DE GRAÇA
            </motion.span>
          </div>

          <p className="text-white/90 text-xs font-semibold mt-2 flex items-center justify-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            Sem cartão, sem cobrança. É só tocar no botão.
          </p>
        </div>

        <div className="px-4 pb-4">
          <motion.div
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          >
            <Button
              onClick={handleEnable}
              disabled={loading}
              className="w-full bg-white text-ecg-midnight font-black hover:bg-white/90 rounded-xl h-12 text-base shadow-lg"
            >
              {pedindo ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Aguardando sua permissão...</>
              ) : resgatando ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Liberando seu Premium...</>
              ) : loading ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Ativando...</>
              ) : (
                <><Gift className="w-5 h-5 mr-2" /> Quero meus {promo.dias} dias grátis</>
              )}
            </Button>
          </motion.div>
          {erroPromo && (
            <p className="text-xs text-white bg-red-500/80 rounded-lg px-2 py-1.5 mt-2 text-center">
              {erroPromo}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  // SEM PROMOÇÃO: o banner original, palavra por palavra. É o que a tela mostra
  // quando a campanha está desligada, e é para onde ela volta quando acabar.
  return (
    <div className="mx-4 mb-5 rounded-2xl overflow-hidden shadow-lg border-2 border-ecg-green/60 bg-gradient-to-r from-ecg-midnight to-[#1B3A5C]">
      <div className="flex items-center gap-4 px-4 py-4">
        {/* Ícone animado */}
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-ecg-green/20 border-2 border-ecg-green flex items-center justify-center">
            <Bell className="w-6 h-6 text-ecg-green" />
          </div>
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white animate-ping" />
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-black text-white text-sm leading-tight">
            🔔 Ative as notificações!
          </p>
          <p className="text-ecg-green/80 text-xs mt-0.5 leading-tight">
            Receba alertas do Caso do Dia e não perca sua sequência!
          </p>
        </div>

        {/* Botão fechar */}
        <button
          onClick={() => setDismissed(true)}
          className="text-white/40 hover:text-white/70 flex-shrink-0 p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* CTA. Sem estado de promoção aqui: este ramo só é alcançado quando
          `promo` é nulo — o caminho com oferta retorna bem antes. */}
      <div className="px-4 pb-4">
        <Button
          onClick={handleEnable}
          disabled={loading}
          className="w-full bg-ecg-green text-ecg-midnight font-black hover:bg-ecg-green/90 rounded-xl h-10 text-sm"
        >
          {pedindo ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Aguardando sua permissão...</>
          ) : loading ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Ativando...</>
          ) : (
            "Ativar notificações agora →"
          )}
        </Button>
      </div>
    </div>
  );
}