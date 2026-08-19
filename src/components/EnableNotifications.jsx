import React, { useState, useEffect } from "react";
import { savePushSubscription } from "@/functions/savePushSubscription";
import { getVapidPublicKey } from "@/functions/getVapidPublicKey";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { consultarPromoPush, resgatarPromoPush } from "@/lib/promocaoPush";
import { Bell, BellOff, CheckCircle2, Loader2, Gift } from "lucide-react";
import { isIOSNativeApp } from "@/utils/platform";
import {
  estadoDaPermissaoNativa,
  pedirPermissaoNativa,
  abrirAjustesDoSistema
} from "@/utils/pushNativo";

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function EnableNotifications({ className }) {
  const [status, setStatus] = useState("loading");
  const [loading, setLoading] = useState(false);
  // Ver o mesmo estado em NotificationBanner.jsx: a espera pelo diálogo do
  // sistema no iOS pode chegar a 10s, e sem rótulo próprio o botão pareceria
  // travado — sobretudo para quem já recusou antes, que não vê diálogo nenhum.
  const [pedindo, setPedindo] = useState(false);

  // A promoção vale aqui pelo mesmo motivo que vale no banner do Dashboard:
  // este é o OUTRO lugar onde a permissão pode ser concedida. Sem isto, o mesmo
  // gesto pagaria numa tela e não na outra — e a pessoa que ativou pelo Perfil
  // nunca receberia, sem jeito de saber por quê.
  const [promo, setPromo] = useState(null);
  const [resgatado, setResgatado] = useState(null);

  useEffect(() => {
    checkStatus();
    consultarPromoPush().then(setPromo).catch(() => {});
  }, []);

  const checkStatus = async () => {
    // APP iOS NATIVO: caminho próprio, ANTES do guard de PushManager — ver o
    // mesmo bloco em NotificationBanner.jsx. Aqui o papel do componente é o
    // estado PERMANENTE ("ativadas" / "bloqueadas") e o resgate pelos Ajustes;
    // o gatilho contextual mora no banner do Dashboard.
    if (isIOSNativeApp()) {
      const estado = await estadoDaPermissaoNativa();
      // Indeterminado renderiza NADA. Ver utils/pushNativo.js.
      if (estado === "indeterminado") { setStatus("indeterminado"); return; }
      setStatus(estado === "concedida" ? "subscribed" : "prompt");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    const permission = Notification.permission;
    if (permission === "denied") {
      setStatus("denied");
      return;
    }

    if (permission === "granted") {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setStatus("subscribed");
        return;
      }
    }

    setStatus("prompt");
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      // No app iOS o caminho é o prompt do sistema via Despia — sem service
      // worker, sem VAPID, sem savePushSubscription.
      if (isIOSNativeApp()) {
        setPedindo(true);
        try {
          const estado = await pedirPermissaoNativa();
          setStatus(estado === "concedida" ? "subscribed" : "denied");
          // Resgate na sequência do gesto que autorizou — e SÓ aqui. É esta
          // amarração que mantém a promoção não-retroativa: não existe caminho
          // na tela que ofereça o resgate a quem já estava inscrito.
          //
          // Sem condicionar a `promo` (a consulta de status pode não ter
          // voltado ainda quando a pessoa toca no botão) — quem decide se há
          // promoção é o servidor. Ver src/lib/promocaoPush.js.
          if (estado === "concedida") {
            const r = await resgatarPromoPush();
            if (r.ok) setResgatado({ dias: r.dias });
          }
        } finally {
          setPedindo(false);
        }
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      // Get VAPID key from backend
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
      console.error("Push subscription error:", err);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  // "indeterminado" só acontece no app iOS: não deu para saber o estado da
  // permissão, e nesse caso não mostramos nada. Ver utils/pushNativo.js.
  if (status === "loading" || status === "unsupported" || status === "indeterminado") return null;

  if (status === "subscribed") {
    return (
      <div className={`space-y-2 ${className || ""}`}>
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="w-4 h-4" />
          Notificações ativadas
        </div>
        {/* Só aparece para quem acabou de ganhar NESTA tela. Quem já estava
            inscrito não vê nada — a promoção não é retroativa.

            A festa é menor que a do Dashboard de propósito: ali o card ocupa a
            largura toda e pode explodir; aqui isto vive dentro de um bloco de
            configurações, e confete no meio dos ajustes vira barulho. O pop e o
            destaque bastam para a pessoa perceber que ganhou. */}
        {resgatado && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 15 }}
            className="rounded-xl border-2 border-ecg-green bg-gradient-to-r from-ecg-green/15 to-emerald-50 px-3 py-2.5"
          >
            <p className="flex items-center gap-2 font-black text-emerald-800 text-sm">
              <Gift className="w-4 h-4" />
              🎉 {resgatado.dias} dias de Premium liberados!
            </p>
            <p className="text-emerald-700/80 text-xs mt-0.5">
              Trilha completa e casos ilimitados. Aproveite!
            </p>
          </motion.div>
        )}
      </div>
    );
  }

  if (status === "denied") {
    // No iOS a recusa é definitiva: o prompt não reaparece, e os Ajustes são o
    // único caminho de volta. Por isso o botão, e não só a mensagem.
    if (isIOSNativeApp()) {
      return (
        <div className={`space-y-2 ${className || ""}`}>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <BellOff className="w-4 h-4" />
            Notificações bloqueadas no iPhone
          </div>
          <Button variant="outline" onClick={abrirAjustesDoSistema} className="gap-2">
            <Bell className="w-4 h-4" />
            Abrir Ajustes
          </Button>
        </div>
      );
    }

    return (
      <div className={`flex items-center gap-2 text-sm text-gray-500 ${className || ""}`}>
        <BellOff className="w-4 h-4" />
        Notificações bloqueadas no navegador
      </div>
    );
  }

  if (status === "error") {
    return (
      <Button
        variant="outline"
        onClick={handleEnable}
        className={`gap-2 text-red-600 border-red-200 ${className || ""}`}
      >
        <Bell className="w-4 h-4" />
        Tentar novamente
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      onClick={handleEnable}
      disabled={loading}
      className={`gap-2 ${className || ""}`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : promo ? (
        <Gift className="w-4 h-4" />
      ) : (
        <Bell className="w-4 h-4" />
      )}
      {pedindo
        ? "Aguardando sua permissão..."
        : loading
          ? "Ativando..."
          : promo
            ? `Ativar e ganhar ${promo.dias} dias de Premium grátis`
            : "Ativar Notificações"}
    </Button>
  );
}