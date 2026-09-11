import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Loader2 } from "lucide-react";

/* "Reportar erro no caso". Vivia copiado no Quiz e no ModuleDetail, com o
   próprio estado em quatro useState de cada página. Diferente dos outros
   componentes do redesenho, este chama o backend: o formulário e o envio são
   uma coisa só, e separar os dois só devolveria a duplicação às páginas. */

const TIPOS = [
  "Imagem incorreta",
  "Resposta incorreta",
  "Explicação errada",
  "Informação do paciente",
  "Outro",
];

export default function ReportarErroDialog({ open, onOpenChange, caso }) {
  const [tipo, setTipo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);

  const limpar = () => {
    setTipo("");
    setDescricao("");
  };

  const enviar = async () => {
    if (!descricao.trim() || !caso) return;
    setEnviando(true);
    try {
      await base44.functions.invoke("reportCaseError", {
        case_id: caso.id,
        case_title: caso.title,
        error_description: descricao,
        error_type: tipo,
      });
      onOpenChange(false);
      limpar();
      alert("Erro reportado com sucesso! Obrigado pelo feedback.");
    } catch (error) {
      console.error("Error reporting case:", error);
      alert("Erro ao reportar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            Reportar Erro no Caso
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Tipo de Erro</label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Descrição do Erro *</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva o erro encontrado..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[100px]"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                limpar();
              }}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button
              onClick={enviar}
              disabled={!descricao.trim() || enviando}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {enviando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar Reporte"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
