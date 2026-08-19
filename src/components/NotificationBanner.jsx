import React, { useState, useEffect } from "react";
import { savePushSubscription } from "@/functions/savePushSubscription";
import { getVapidPublicKey } from "@/functions/getVapidPublicKey";
import { consultarPromoPush, resgatarPromoPush } from "@/lib/promocaoPush";
import { Bell, X, Loader2, Gift, CheckCircle2 } from "lucide-react";
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
    else setErroPromo(r.erro);
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
            if (promo) await resgatar();
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

  // Acabou de ganhar: o banner vira o aviso do presente, e não é dispensável.
  // O resgate poderia ser silencioso — o premium já está valendo —, mas presente
  // que ninguém percebe não produz nem gratidão nem vontade de renovar quando
  // vencer. Some sozinho no próximo carregamento, quando a promoção deixar de
  // estar elegível para esta conta.
  if (resgatado) {
    return (
      <div className="mx-4 mb-5 rounded-2xl overflow-hidden shadow-lg border-2 border-ecg-green bg-gradient-to-r from-ecg-midnight to-[#1B3A5C]">
        <div className="flex items-center gap-4 px-4 py-4">
          <div className="w-12 h-12 rounded-2xl bg-ecg-green/20 border-2 border-ecg-green flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-6 h-6 text-ecg-green" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-sm leading-tight">
              🎉 {resgatado.dias} dias de Premium liberados!
            </p>
            <p className="text-ecg-green/80 text-xs mt-0.5 leading-tight">
              Trilha completa, teoria e casos ilimitados. Aproveite!
            </p>
          </div>
        </div>
      </div>
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

  return (
    <div className="mx-4 mb-5 rounded-2xl overflow-hidden shadow-lg border-2 border-ecg-green/60 bg-gradient-to-r from-ecg-midnight to-[#1B3A5C]">
      <div className="flex items-center gap-4 px-4 py-4">
        {/* Ícone animado */}
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-ecg-green/20 border-2 border-ecg-green flex items-center justify-center">
            {promo ? <Gift className="w-6 h-6 text-ecg-green" /> : <Bell className="w-6 h-6 text-ecg-green" />}
          </div>
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white animate-ping" />
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
        </div>

        {/* Texto. Com promoção no ar, o que o banner vende é o presente — as
            notificações viram o meio, não o fim. Sem ela, a mensagem é a
            original, palavra por palavra. */}
        <div className="flex-1 min-w-0">
          {promo ? (
            <>
              <p className="font-black text-white text-sm leading-tight">
                🎁 Ganhe {promo.dias} dias de Premium
              </p>
              <p className="text-ecg-green/80 text-xs mt-0.5 leading-tight">
                É só ativar as notificações. Sem cartão, sem cobrança.
              </p>
            </>
          ) : (
            <>
              <p className="font-black text-white text-sm leading-tight">
                🔔 Ative as notificações!
              </p>
              <p className="text-ecg-green/80 text-xs mt-0.5 leading-tight">
                Receba alertas do Caso do Dia e não perca sua sequência!
              </p>
            </>
          )}
        </div>

        {/* Botão fechar */}
        <button
          onClick={() => setDismissed(true)}
          className="text-white/40 hover:text-white/70 flex-shrink-0 p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* CTA */}
      <div className="px-4 pb-4">
        <Button
          onClick={handleEnable}
          disabled={loading}
          className="w-full bg-ecg-green text-ecg-midnight font-black hover:bg-ecg-green/90 rounded-xl h-10 text-sm"
        >
          {pedindo ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Aguardando sua permissão...</>
          ) : resgatando ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Liberando seu Premium...</>
          ) : loading ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Ativando...</>
          ) : promo ? (
            `Ativar e ganhar ${promo.dias} dias →`
          ) : (
            "Ativar notificações agora →"
          )}
        </Button>
        {erroPromo && (
          <p className="text-xs text-red-200 mt-2 text-center">{erroPromo}</p>
        )}
      </div>
    </div>
  );
}