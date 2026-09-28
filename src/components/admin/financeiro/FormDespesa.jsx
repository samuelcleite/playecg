import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { CATEGORIAS } from "./financeiro";

// Formulário de despesa. `inicial` traz o que preencher: nada (nova), a própria
// despesa (editar, com id) ou uma cópia sem id (duplicar).

const VAZIO = { name: "", category: "", amount: "", competence_date: "", payment_date: "", notes: "" };

export default function FormDespesa({ aberto, inicial, salvando, erro, onSalvar, onFechar }) {
  const [form, setForm] = useState(VAZIO);

  useEffect(() => {
    if (!aberto) return;
    setForm({
      ...VAZIO,
      ...Object.fromEntries(Object.entries(inicial || {}).map(([k, v]) => [k, v ?? ""])),
    });
  }, [aberto, inicial]);

  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const editando = !!inicial?.id;

  const enviar = (e) => {
    e.preventDefault();
    onSalvar({
      name: form.name,
      category: form.category,
      amount: Number(form.amount),
      competence_date: form.competence_date,
      payment_date: form.payment_date || null,
      notes: form.notes,
    });
  };

  const completo = form.name.trim() && form.category && Number(form.amount) > 0 && form.competence_date;

  return (
    <Dialog open={aberto} onOpenChange={(open) => (open ? null : onFechar())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar despesa" : "Nova despesa"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="despesa-nome">Nome *</Label>
            <Input
              id="despesa-nome"
              value={form.name}
              onChange={mudar("name")}
              placeholder="Ex.: Base44 — plano mensal"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIAS).map(([v, r]) => (
                    <SelectItem key={v} value={v}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="despesa-valor">Valor (R$) *</Label>
              <Input
                id="despesa-valor"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={mudar("amount")}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="despesa-competencia">Data de competência *</Label>
              <Input id="despesa-competencia" type="date" value={form.competence_date} onChange={mudar("competence_date")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="despesa-pagamento">Data de pagamento</Label>
              <Input id="despesa-pagamento" type="date" value={form.payment_date} onChange={mudar("payment_date")} />
              <p className="text-xs text-gray-500">Vazio = ainda não paga.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="despesa-obs">Observação</Label>
            <Textarea id="despesa-obs" rows={2} value={form.notes} onChange={mudar("notes")} />
          </div>

          {erro && <p className="text-sm text-red-700">{erro}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-purple-600 hover:bg-purple-700 gap-2" disabled={!completo || salvando}>
              {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
              {editando ? "Salvar" : "Lançar despesa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
