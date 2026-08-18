import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Edit,
  Trash2,
  Save,
  Ticket,
  Calendar,
  TrendingUp,
  AlertCircle,
  Copy,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";

// Preços dos planos, só para o preview do desconto. É CÓPIA de
// base44/shared/plans.ts — o Base44 não compartilha código entre o front e as
// functions. Ao mudar preço, mude lá primeiro; um grep por PLANOS acha as
// cópias. Antes daqui o preview era hardcoded em R$ 2,00, sobra da época de
// teste, e mostrava o desconto sobre um preço que não existe mais.
const PLANOS_PRECO = { monthly: 59, annual: 499 };

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Espelha o cálculo do validateCoupon: teto no preço cheio (desconto nunca
// maior que o produto) e piso de R$ 0,01.
function precoComDesconto(preco, tipo, valor) {
  const v = Number(valor) || 0;
  const desconto = tipo === "percentage" ? (preco * v) / 100 : v;
  return Math.max(0.01, preco - Math.min(desconto, preco));
}

// A frase do efeito da duração em UM plano. É aqui que mora o aviso do anual:
// duration_in_months é contado em MESES CORRIDOS, não em cobranças, e o anual
// cobra uma vez a cada 12 meses — então qualquer valor abaixo de 12 alcança só
// a primeira cobrança, e o cupom vira um 'once' caro sem ninguém perceber.
function efeitoDaDuracao(plano, { duration, duration_in_months, discount_type, discount_value }) {
  const cheio = PLANOS_PRECO[plano];
  const comDesconto = brl(precoComDesconto(cheio, discount_type, discount_value));
  const semDesconto = brl(cheio);

  if (duration === "forever") return `${comDesconto} em todas as cobranças.`;
  if (duration === "once") return `${comDesconto} na 1ª cobrança, depois ${semDesconto}.`;

  const meses = Number(duration_in_months);
  if (!Number.isInteger(meses) || meses <= 0) return "Informe por quantos meses o desconto vale.";

  if (plano === "monthly") {
    return `${comDesconto} nas ${meses} primeiras cobranças, depois ${semDesconto}.`;
  }
  if (meses < 12) {
    return `${comDesconto} APENAS na 1ª cobrança, depois ${semDesconto} — o anual cobra a cada 12 meses, e ${meses} meses não alcançam a 2ª.`;
  }
  // 12 meses ou mais no anual: quantas cobranças isso alcança depende de como o
  // Stripe trata o mês exato do aniversário, e isso NÃO está verificado. Mandar
  // conferir é melhor do que exibir um número que pode estar errado.
  return `${comDesconto} nas cobranças que caírem dentro dos primeiros ${meses} meses, depois ${semDesconto}. Confira no Stripe quantas cobranças isso alcança.`;
}

// Rótulos curtos para o card da lista. Sem isto, dois cupons de 20% com
// durações diferentes ficam idênticos na listagem.
const DURACAO_LABEL = {
  forever: "Para sempre",
  once: "1ª cobrança",
  repeating: "Por meses"
};

export default function AdminCoupons() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [coupons, setCoupons] = useState([]);
  const [usageStats, setUsageStats] = useState({});
  const [showDialog, setShowDialog] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    discount_type: "percentage",
    discount_value: 0,
    duration: "forever",
    duration_in_months: null,
    valid_from: "",
    valid_until: "",
    usage_limit: null,
    one_per_user: true,
    active: true
  });

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const userData = await base44.auth.me();
    if (userData.role !== "admin") {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    setUser(userData);
    await loadData();
  };

  const loadData = async () => {
    const couponsData = await base44.entities.Coupon.list("-created_date");
    setCoupons(couponsData);

    const resUso = await base44.functions.invoke('adminListRecords', { entity: 'CouponUsage' });
    const usageData = resUso?.data?.records || [];
    const stats = {};
    usageData.forEach(usage => {
      if (!stats[usage.coupon_id]) {
        stats[usage.coupon_id] = {
          count: 0,
          totalDiscount: 0,
          totalRevenue: 0
        };
      }
      stats[usage.coupon_id].count++;
      stats[usage.coupon_id].totalDiscount += usage.discount_applied;
      stats[usage.coupon_id].totalRevenue += usage.final_price;
    });
    setUsageStats(stats);
  };

  const handleOpenDialog = (couponToEdit = null) => {
    if (couponToEdit) {
      setEditingCoupon(couponToEdit);
      setFormData({
        code: couponToEdit.code || "",
        description: couponToEdit.description || "",
        discount_type: couponToEdit.discount_type || "percentage",
        discount_value: couponToEdit.discount_value || 0,
        // Mesmo fallback do createStripeCheckout: cupom gravado antes do campo
        // existir chega sem `duration`, e o comportamento dele sempre foi
        // 'forever'. Abrir para editar não pode mostrar o campo em branco e
        // deixar o admin achar que a duração está indefinida.
        duration: couponToEdit.duration || "forever",
        duration_in_months: couponToEdit.duration_in_months ?? null,
        valid_from: couponToEdit.valid_from ? couponToEdit.valid_from.split('T')[0] : "",
        valid_until: couponToEdit.valid_until ? couponToEdit.valid_until.split('T')[0] : "",
        usage_limit: couponToEdit.usage_limit,
        one_per_user: couponToEdit.one_per_user !== false,
        active: couponToEdit.active !== false
      });
    } else {
      setEditingCoupon(null);
      setFormData({
        code: "",
        description: "",
        discount_type: "percentage",
        discount_value: 0,
        duration: "forever",
        duration_in_months: null,
        valid_from: "",
        valid_until: "",
        usage_limit: null,
        one_per_user: true,
        active: true
      });
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    const couponData = {
      ...formData,
      code: formData.code.toUpperCase().trim(),
      valid_from: formData.valid_from ? new Date(formData.valid_from).toISOString() : null,
      valid_until: formData.valid_until ? new Date(formData.valid_until).toISOString() : null,
      usage_limit: formData.usage_limit === "" || formData.usage_limit === null ? null : parseInt(formData.usage_limit),
      // Fora do 'repeating' o campo vai como null, nunca com o número que
      // sobrou de uma edição anterior. O Stripe RECUSA duration_in_months
      // junto com 'once' ou 'forever', e o createStripeCheckout só descarta o
      // valor porque confere a duração antes de montar os parâmetros —
      // gravar lixo aqui seria contar com aquela defesa para sempre.
      duration_in_months: formData.duration === "repeating"
        ? parseInt(formData.duration_in_months)
        : null
    };

    if (editingCoupon) {
      await base44.entities.Coupon.update(editingCoupon.id, couponData);
    } else {
      await base44.entities.Coupon.create(couponData);
    }

    setShowDialog(false);
    await loadData();
  };

  const handleDelete = async (couponId) => {
    if (confirm("Tem certeza que deseja excluir este cupom?")) {
      await base44.entities.Coupon.delete(couponId);
      await loadData();
    }
  };

  const handleToggleActive = async (coupon) => {
    await base44.entities.Coupon.update(coupon.id, {
      active: !coupon.active
    });
    await loadData();
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getStatusBadge = (coupon) => {
    if (!coupon.active) {
      return <Badge className="bg-gray-400 text-white">Desativado</Badge>;
    }

    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
      return <Badge className="bg-red-500 text-white">Expirado</Badge>;
    }

    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      return <Badge className="bg-orange-500 text-white">Limite Atingido</Badge>;
    }

    if (coupon.valid_from && new Date(coupon.valid_from) > new Date()) {
      return <Badge className="bg-blue-500 text-white">Aguardando</Badge>;
    }

    return <Badge className="bg-green-500 text-white">Ativo</Badge>;
  };

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gerenciar Cupons</h1>
            <p className="text-gray-500 mt-1">Crie e gerencie cupons de desconto para o plano premium</p>
          </div>
          <Button
            onClick={() => handleOpenDialog()}
            className="bg-purple-600 hover:bg-purple-700 gap-2"
          >
            <Plus className="w-5 h-5" />
            Novo Cupom
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-none shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total de Cupons</p>
                  <p className="text-3xl font-bold text-purple-600 mt-1">{coupons.length}</p>
                </div>
                <Ticket className="w-12 h-12 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Cupons Ativos</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">
                    {coupons.filter(c => c.active).length}
                  </p>
                </div>
                <TrendingUp className="w-12 h-12 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total de Usos</p>
                  <p className="text-3xl font-bold text-blue-600 mt-1">
                    {coupons.reduce((sum, c) => sum + (c.used_count || 0), 0)}
                  </p>
                </div>
                <Calendar className="w-12 h-12 text-blue-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coupons List */}
        <div className="grid md:grid-cols-2 gap-6">
          <AnimatePresence>
            {coupons.map((coupon) => (
              <motion.div
                key={coupon.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyCode(coupon.code)}
                            className="font-mono font-bold text-lg"
                          >
                            {coupon.code}
                            {copiedCode === coupon.code ? (
                              <Check className="w-4 h-4 ml-2 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4 ml-2" />
                            )}
                          </Button>
                          {getStatusBadge(coupon)}
                        </div>
                        <CardTitle className="text-base text-gray-700">
                          {coupon.description || "Sem descrição"}
                        </CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Discount Info */}
                      <div className="p-3 bg-purple-50 rounded-lg">
                        <p className="text-2xl font-bold text-purple-700">
                          {coupon.discount_type === 'percentage'
                            ? `${coupon.discount_value}% OFF`
                            : `R$ ${coupon.discount_value} OFF`
                          }
                        </p>
                        {/* Sem esta linha, dois cupons de 20% com durações
                            diferentes ficam indistinguíveis na listagem. O
                            fallback para 'forever' é o mesmo do checkout: cupom
                            gravado antes do campo existir não tem duration. */}
                        <p className="text-sm font-medium text-purple-600 mt-1">
                          {coupon.duration === 'repeating' && coupon.duration_in_months > 0
                            ? `Por ${coupon.duration_in_months} ${coupon.duration_in_months === 1 ? 'mês' : 'meses'}`
                            : DURACAO_LABEL[coupon.duration] || DURACAO_LABEL.forever}
                        </p>
                      </div>

                      {/* Usage Stats */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="p-2 bg-gray-50 rounded">
                          <p className="text-gray-600">Usos</p>
                          <p className="font-bold text-gray-900">
                            {coupon.used_count || 0}
                            {coupon.usage_limit && ` / ${coupon.usage_limit}`}
                          </p>
                        </div>
                        <div className="p-2 bg-gray-50 rounded">
                          <p className="text-gray-600">Por Usuário</p>
                          <p className="font-bold text-gray-900">
                            {coupon.one_per_user ? 'Único' : 'Múltiplo'}
                          </p>
                        </div>
                      </div>

                      {/* Dates */}
                      {coupon.valid_until && (
                        <div className="text-sm text-gray-600">
                          <Calendar className="w-4 h-4 inline mr-1" />
                          Válido até: {format(new Date(coupon.valid_until), 'dd/MM/yyyy')}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleActive(coupon)}
                          className="flex-1"
                        >
                          {coupon.active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(coupon)}
                          className="flex-1 gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(coupon.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          {coupons.length === 0 && (
            <Card className="col-span-full border-none shadow-lg">
              <CardContent className="p-12 text-center">
                <Ticket className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Nenhum cupom cadastrado
                </h3>
                <p className="text-gray-600 mb-4">
                  Crie cupons de desconto para atrair novos usuários premium
                </p>
                <Button onClick={() => handleOpenDialog()} className="bg-purple-600 hover:bg-purple-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Primeiro Cupom
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Ticket className="w-5 h-5" />
                {editingCoupon ? 'Editar Cupom' : 'Novo Cupom'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Código do Cupom *</Label>
                  <Input
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="Ex: BEMVINDO20"
                    className="font-mono"
                    maxLength={20}
                  />
                  <p className="text-xs text-gray-500">Apenas letras e números, sem espaços</p>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Desconto *</Label>
                  <Select
                    value={formData.discount_type}
                    onValueChange={(value) => setFormData({ ...formData, discount_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentual (%)</SelectItem>
                      <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Valor do Desconto *</Label>
                <Input
                  type="number"
                  min="0"
                  // Sem teto no valor fixo. O max={2} daqui era sobra da época
                  // de teste, quando o plano custava R$ 2 — ele impedia
                  // cadastrar qualquer cupom em reais utilizável nos planos de
                  // hoje. Quem ensina o efeito agora é o preview, que mostra os
                  // dois planos com os preços reais.
                  max={formData.discount_type === 'percentage' ? 100 : undefined}
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: parseFloat(e.target.value) })}
                  placeholder={formData.discount_type === 'percentage' ? '20' : '10'}
                />
                <p className="text-xs text-gray-500">
                  {formData.discount_type === 'percentage'
                    ? 'Percentual de desconto (0-100)'
                    : 'Valor em reais abatido de cada cobrança'
                  }
                </p>
              </div>

              <div className="space-y-2">
                <Label>Duração do Desconto *</Label>
                <Select
                  value={formData.duration}
                  onValueChange={(value) => setFormData({ ...formData, duration: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forever">Para sempre — desconta em todas as renovações</SelectItem>
                    <SelectItem value="repeating">Pelos primeiros meses — você escolhe quantos</SelectItem>
                    <SelectItem value="once">Apenas a primeira cobrança</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.duration === 'repeating' && (
                <div className="space-y-2">
                  <Label>Quantos meses de desconto *</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={formData.duration_in_months ?? ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      duration_in_months: e.target.value ? parseInt(e.target.value) : null
                    })}
                    placeholder="6"
                  />
                  <p className="text-xs text-gray-500">
                    Contado em <strong>meses corridos</strong>, não em cobranças. No plano
                    mensal, 6 meses = 6 cobranças. No plano anual, que cobra uma vez a cada
                    12 meses, qualquer valor de 1 a 12 desconta só a primeira cobrança.
                  </p>
                </div>
              )}

              {formData.duration === 'repeating'
                && formData.duration_in_months > 0
                && formData.duration_in_months < 12 && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-900">
                      <p className="font-bold">
                        No plano anual isto vira desconto de uma cobrança só.
                      </p>
                      <p className="mt-1">
                        Este cupom vale para os <strong>dois planos</strong> — não existe
                        forma de restringi-lo ao mensal. No anual, {formData.duration_in_months}{' '}
                        {formData.duration_in_months === 1 ? 'mês não alcança' : 'meses não alcançam'}{' '}
                        a 2ª cobrança, que só acontece no 12º mês. O efeito fica idêntico ao de
                        &quot;apenas a primeira cobrança&quot;, descontando{' '}
                        <strong>
                          {brl(PLANOS_PRECO.annual - precoComDesconto(
                            PLANOS_PRECO.annual, formData.discount_type, formData.discount_value
                          ))}
                        </strong>{' '}
                        de uma vez.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição interna do cupom para controle"
                  rows={2}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Válido a partir de</Label>
                  <Input
                    type="date"
                    value={formData.valid_from}
                    onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Válido até</Label>
                  <Input
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Limite de Usos Totais</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.usage_limit || ""}
                  onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Deixe vazio para ilimitado"
                />
                <p className="text-xs text-gray-500">
                  Quantas vezes este cupom pode ser usado no total (vazio = ilimitado)
                </p>
              </div>

              <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
                <div className="space-y-1">
                  <Label>Um uso por usuário</Label>
                  <p className="text-xs text-gray-600">
                    Cada usuário pode usar este cupom apenas uma vez
                  </p>
                </div>
                <Switch
                  checked={formData.one_per_user}
                  onCheckedChange={(checked) => setFormData({ ...formData, one_per_user: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                <div className="space-y-1">
                  <Label>Cupom Ativo</Label>
                  <p className="text-xs text-gray-600">
                    O cupom pode ser usado pelos usuários
                  </p>
                </div>
                <Switch
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                />
              </div>

              {formData.discount_value > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="w-full">
                      <p className="text-sm font-medium text-blue-900">
                        O que o assinante vai pagar:
                      </p>
                      <div className="mt-2 space-y-2 text-sm text-blue-800">
                        <div>
                          <span className="font-semibold">
                            Mensal ({brl(PLANOS_PRECO.monthly)}/mês):
                          </span>{' '}
                          {efeitoDaDuracao('monthly', formData)}
                        </div>
                        <div>
                          <span className="font-semibold">
                            Anual ({brl(PLANOS_PRECO.annual)}/ano):
                          </span>{' '}
                          {efeitoDaDuracao('annual', formData)}
                        </div>
                      </div>
                      <p className="text-xs text-blue-700 mt-2">
                        O mesmo cupom vale para os dois planos.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setShowDialog(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  className="bg-purple-600 hover:bg-purple-700 gap-2"
                  disabled={
                    !formData.code
                    || formData.discount_value <= 0
                    // Espelha a validação do createStripeCheckout. Sem isto o
                    // cupom seria salvo como repeating sem meses e só quebraria
                    // na cara do assinante, na hora de abrir o checkout.
                    || (formData.duration === 'repeating' && !(formData.duration_in_months > 0))
                  }
                >
                  <Save className="w-4 h-4" />
                  Salvar Cupom
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}