import React, { useState, useEffect } from "react";
import { savePushSubscription } from "@/functions/savePushSubscription";
import { getVapidPublicKey } from "@/functions/getVapidPublicKey";
import { Bell, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function NotificationBanner() {
  const [status, setStatus] = useState("loading");
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkStatus();
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

  const handleEnable = async () => {
    setLoading(true);
    try {
      // No app iOS o caminho inteiro é outro: prompt do sistema via Despia, sem
      // service worker, sem VAPID e sem savePushSubscription. Quem guarda a
      // inscrição é o OneSignal, e a vinculação com a conta já foi feita no
      // boot pelo AuthContext.
      if (isIOSNativeApp()) {
        const estado = await pedirPermissaoNativa();
        setStatus(estado === "concedida" ? "subscribed" : "denied");
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

  // Não mostrar se: não suportado, indeterminado, já inscrito, já foi fechado.
  // "indeterminado" só acontece no app iOS e significa que não deu para saber o
  // estado da permissão — ver utils/pushNativo.js.
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
            <Bell className="w-6 h-6 text-ecg-green" />
          </div>
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white animate-ping" />
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
        </div>

        {/* Texto */}
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

      {/* CTA */}
      <div className="px-4 pb-4">
        <Button
          onClick={handleEnable}
          disabled={loading}
          className="w-full bg-ecg-green text-ecg-midnight font-black hover:bg-ecg-green/90 rounded-xl h-10 text-sm"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Ativando...</>
          ) : (
            "Ativar notificações agora →"
          )}
        </Button>
      </div>
    </div>
  );
}