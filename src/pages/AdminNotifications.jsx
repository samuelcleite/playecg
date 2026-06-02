import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { sendTestPush } from "@/functions/sendTestPush";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Send, Users, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function AdminNotifications() {
  const [user, setUser] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetMode, setTargetMode] = useState("all"); // "all" | "user"
  const [targetUserId, setTargetUserId] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      if (userData.role !== "admin") return;
      const subs = await base44.entities.PushSubscription.list("-created_date", 200);
      setSubscriptions(subs);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const payload = { title, body };
      if (targetMode === "user" && targetUserId.trim()) {
        payload.user_id = targetUserId.trim();
      }
      const res = await sendTestPush(payload);
      setResult({ success: res.data.success, results: res.data.results });
    } catch (err) {
      setResult({ success: false, error: err.message });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ecg-blue" />
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Acesso negado.</p>
      </div>
    );
  }

  const sentCount = result?.results?.filter(r => r.status === "sent").length ?? 0;
  const failedCount = result?.results?.filter(r => r.status !== "sent").length ?? 0;

  return (
    <div className="min-h-screen bg-ecg-gray p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ecg-midnight flex items-center justify-center">
            <Bell className="w-5 h-5 text-ecg-green" />
          </div>
          <div>
            <h1 className="text-xl font-black text-ecg-midnight">Envio de Notificações</h1>
            <p className="text-sm text-gray-500">Envie push notifications para os usuários</p>
          </div>
        </div>

        {/* Stat */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-5 h-5 text-ecg-blue" />
            <span className="text-sm text-gray-600">
              <strong className="text-ecg-midnight">{subscriptions.length}</strong> dispositivo{subscriptions.length !== 1 ? "s" : ""} cadastrado{subscriptions.length !== 1 ? "s" : ""}
            </span>
          </CardContent>
        </Card>

        {/* Form */}
        <Card>
          <CardHeader className="pb-2">
            <h2 className="font-bold text-ecg-midnight">Compor Notificação</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Target */}
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">Destinatário</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTargetMode("all")}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${targetMode === "all" ? "border-ecg-midnight bg-ecg-midnight text-white" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                >
                  Todos os usuários
                </button>
                <button
                  onClick={() => setTargetMode("user")}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${targetMode === "user" ? "border-ecg-midnight bg-ecg-midnight text-white" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                >
                  Usuário específico
                </button>
              </div>
            </div>

            {targetMode === "user" && (
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">User ID</label>
                <input
                  type="text"
                  value={targetUserId}
                  onChange={e => setTargetUserId(e.target.value)}
                  placeholder="ID do usuário..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ecg-green"
                />
                {/* Mostrar subscriptions para facilitar */}
                {subscriptions.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                    {subscriptions.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setTargetUserId(s.user_id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-all ${targetUserId === s.user_id ? "border-ecg-green bg-ecg-green/10 text-ecg-midnight font-bold" : "border-gray-100 bg-white hover:bg-gray-50 text-gray-600"}`}
                      >
                        <span className="font-mono">{s.user_id}</span>
                        <span className="ml-2 text-gray-400 truncate">{s.endpoint?.slice(0, 40)}...</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">Título</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Novo Caso do Dia disponível!"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ecg-green"
              />
            </div>

            {/* Body */}
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">Mensagem</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Ex: Venha praticar e manter sua sequência!"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ecg-green resize-none"
              />
            </div>

            <Button
              onClick={handleSend}
              disabled={sending || !title.trim() || !body.trim()}
              className="w-full bg-ecg-midnight hover:bg-ecg-midnight/90 text-white font-black rounded-xl h-11"
            >
              {sending ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Enviando...</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Enviar Notificação</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Result */}
        {result && (
          <Card className={`border-2 ${result.success ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
            <CardContent className="p-4">
              {result.success ? (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-green-800">Notificações enviadas!</p>
                    <p className="text-sm text-green-700 mt-1">
                      ✅ {sentCount} enviada{sentCount !== 1 ? "s" : ""}
                      {failedCount > 0 && <span className="ml-2 text-red-600">❌ {failedCount} falha{failedCount !== 1 ? "s" : ""}</span>}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-red-800">Erro ao enviar</p>
                    <p className="text-sm text-red-700 mt-1">{result.error || "Nenhuma inscrição encontrada."}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}