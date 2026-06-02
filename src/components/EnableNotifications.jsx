import React, { useState, useEffect } from "react";
import { savePushSubscription } from "@/functions/savePushSubscription";
import { getVapidPublicKey } from "@/functions/getVapidPublicKey";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, CheckCircle2, Loader2 } from "lucide-react";

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

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
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

  if (status === "loading" || status === "unsupported") return null;

  if (status === "subscribed") {
    return (
      <div className={`flex items-center gap-2 text-sm text-green-600 ${className || ""}`}>
        <CheckCircle2 className="w-4 h-4" />
        Notificações ativadas
      </div>
    );
  }

  if (status === "denied") {
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
      ) : (
        <Bell className="w-4 h-4" />
      )}
      {loading ? "Ativando..." : "Ativar Notificações"}
    </Button>
  );
}