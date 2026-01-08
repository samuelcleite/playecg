import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function FaleConosco({ open, onOpenChange }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState("");

  const handleEnviar = async () => {
    if (!nome.trim() || !email.trim() || !mensagem.trim()) {
      setErro("Por favor, preencha todos os campos");
      return;
    }

    setEnviando(true);
    setErro("");

    try {
      await base44.integrations.Core.SendEmail({
        to: "ecgdescomplica@gmail.com",
        subject: `Contato de ${nome} - ECG Descomplica`,
        body: `
Nome: ${nome}
Email: ${email}

Mensagem:
${mensagem}
        `
      });

      setSucesso(true);
      setNome("");
      setEmail("");
      setMensagem("");
      
      setTimeout(() => {
        setSucesso(false);
        onOpenChange(false);
      }, 2000);
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      setErro("Erro ao enviar mensagem. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const handleClose = () => {
    if (!enviando) {
      onOpenChange(false);
      setErro("");
      setSucesso(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-700">
            <MessageCircle className="w-5 h-5" />
            Fale Conosco
          </DialogTitle>
          <DialogDescription>
            Envie sua mensagem, dúvida ou sugestão. Responderemos em breve!
          </DialogDescription>
        </DialogHeader>

        {sucesso ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Mensagem Enviada!
            </h3>
            <p className="text-gray-600">
              Obrigado pelo contato. Responderemos em breve.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {erro && (
              <Alert className="bg-red-50 border-red-200">
                <AlertDescription className="text-red-800">
                  {erro}
                </AlertDescription>
              </Alert>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Seu Nome *
              </label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Digite seu nome"
                disabled={enviando}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Seu E-mail *
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                disabled={enviando}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Mensagem *
              </label>
              <Textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Escreva sua mensagem, dúvida ou sugestão..."
                className="min-h-[120px]"
                disabled={enviando}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={enviando}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleEnviar}
                disabled={enviando}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 gap-2"
              >
                {enviando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Enviar Mensagem
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}