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

    const usageData = await base44.entities.CouponUsage.list();
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
      usage_limit: formData.usage_limit === "" || formData.usage_limit === null ? null : parseInt(formData.usage_limit)
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
                  max={formData.discount_type === 'percentage' ? 100 : 2}
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: parseFloat(e.target.value) })}
                  placeholder={formData.discount_type === 'percentage' ? '20' : '1'}
                />
                <p className="text-xs text-gray-500">
                  {formData.discount_type === 'percentage'
                    ? 'Percentual de desconto (0-100)'
                    : 'Valor em reais do desconto (máx R$2)'
                  }
                </p>
              </div>

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
                    <div>
                      <p className="text-sm font-medium text-blue-900">Preview do desconto:</p>
                      <p className="text-sm text-blue-800 mt-1">
                        Preço original: R$ 2,00<br />
                        Desconto: {formData.discount_type === 'percentage'
                          ? `${formData.discount_value}% (R$ ${((2 * formData.discount_value) / 100).toFixed(2)})`
                          : `R$ ${Math.min(formData.discount_value, 2).toFixed(2)}`
                        }<br />
                        <span className="font-bold">
                          Preço final: R$ {formData.discount_type === 'percentage'
                            ? Math.max(0.01, 2 - (2 * formData.discount_value) / 100).toFixed(2)
                            : Math.max(0.01, 2 - Math.min(formData.discount_value, 2)).toFixed(2)
                          }
                        </span>
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
                  disabled={!formData.code || formData.discount_value <= 0}
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