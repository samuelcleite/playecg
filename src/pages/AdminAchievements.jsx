import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Award,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  Trophy,
  Target,
  Zap,
  Star
} from "lucide-react";
import { motion } from "framer-motion";

const REQUIREMENT_TYPES = [
  { value: "first_correct", label: "Primeira Resposta Correta", icon: "🎯" },
  { value: "streak_days", label: "Sequência de Dias", icon: "🔥" },
  { value: "accuracy", label: "Taxa de Acerto (%)", icon: "🎪" },
  { value: "level", label: "Nível Alcançado", icon: "⭐" },
  { value: "points", label: "Pontos Acumulados", icon: "💎" },
  { value: "completed_modules", label: "Módulos Completados", icon: "📚" },
  { value: "total_attempts", label: "Total de Tentativas", icon: "🎮" },
  { value: "custom", label: "Personalizado", icon: "✨" }
];

export default function AdminAchievements() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "🏆",
    badge_id: "",
    requirement_type: "first_correct",
    requirement_value: 1,
    order: 0,
    active: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const userData = await base44.auth.me();
    if (userData.role !== "admin") {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    setUser(userData);

    const achievementsData = await base44.entities.Achievement.list("order");
    setAchievements(achievementsData);
    setLoading(false);
  };

  const handleOpenDialog = (achievement = null) => {
    if (achievement) {
      setEditingAchievement(achievement);
      setFormData({
        name: achievement.name,
        description: achievement.description || "",
        icon: achievement.icon || "🏆",
        badge_id: achievement.badge_id,
        requirement_type: achievement.requirement_type,
        requirement_value: achievement.requirement_value || 1,
        order: achievement.order || 0,
        active: achievement.active !== false
      });
    } else {
      setEditingAchievement(null);
      setFormData({
        name: "",
        description: "",
        icon: "🏆",
        badge_id: "",
        requirement_type: "first_correct",
        requirement_value: 1,
        order: achievements.length,
        active: true
      });
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.badge_id) {
      alert("Preencha os campos obrigatórios");
      return;
    }

    if (editingAchievement) {
      await base44.entities.Achievement.update(editingAchievement.id, formData);
    } else {
      await base44.entities.Achievement.create(formData);
    }

    setShowDialog(false);
    await loadData();
  };

  const handleDelete = async (id) => {
    if (confirm("Tem certeza que deseja excluir esta conquista?")) {
      await base44.entities.Achievement.delete(id);
      await loadData();
    }
  };

  const handleReorder = async (achievement, direction) => {
    const currentIndex = achievements.findIndex(a => a.id === achievement.id);
    if (
      (direction === "up" && currentIndex === 0) ||
      (direction === "down" && currentIndex === achievements.length - 1)
    ) {
      return;
    }

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const otherAchievement = achievements[newIndex];

    await base44.entities.Achievement.update(achievement.id, { order: newIndex });
    await base44.entities.Achievement.update(otherAchievement.id, { order: currentIndex });

    await loadData();
  };

  const getRequirementLabel = (type) => {
    return REQUIREMENT_TYPES.find(t => t.value === type)?.label || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Award className="w-8 h-8 text-purple-600" />
              Gerenciar Conquistas
            </h1>
            <p className="text-gray-600 mt-2">
              Configure as conquistas disponíveis e seus requisitos
            </p>
          </div>
          <Button
            onClick={() => handleOpenDialog()}
            className="bg-purple-600 hover:bg-purple-700 gap-2"
          >
            <Plus className="w-5 h-5" />
            Nova Conquista
          </Button>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="border-none shadow-lg bg-gradient-to-br from-purple-50 to-indigo-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total de Conquistas</p>
                  <p className="text-3xl font-bold text-purple-600">{achievements.length}</p>
                </div>
                <Trophy className="w-10 h-10 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Ativas</p>
                  <p className="text-3xl font-bold text-green-600">
                    {achievements.filter(a => a.active).length}
                  </p>
                </div>
                <Target className="w-10 h-10 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Inativas</p>
                  <p className="text-3xl font-bold text-amber-600">
                    {achievements.filter(a => !a.active).length}
                  </p>
                </div>
                <Zap className="w-10 h-10 text-amber-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Achievements List */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Conquistas Cadastradas</CardTitle>
          </CardHeader>
          <CardContent>
            {achievements.length === 0 ? (
              <div className="text-center py-12">
                <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 mb-4">Nenhuma conquista cadastrada ainda</p>
                <Button onClick={() => handleOpenDialog()} variant="outline">
                  Criar Primeira Conquista
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {achievements.map((achievement, index) => (
                  <motion.div
                    key={achievement.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className={`border ${achievement.active ? 'border-purple-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                      <CardContent className="p-6">
                        <div className="flex items-center gap-4">
                          {/* Icon */}
                          <div className="text-5xl">{achievement.icon}</div>

                          {/* Info */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-lg font-bold text-gray-900">
                                {achievement.name}
                              </h3>
                              {!achievement.active && (
                                <Badge variant="outline" className="bg-gray-100">
                                  Inativa
                                </Badge>
                              )}
                            </div>
                            <p className="text-gray-600 text-sm mb-2">
                              {achievement.description}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-purple-100 text-purple-800">
                                ID: {achievement.badge_id}
                              </Badge>
                              <Badge className="bg-blue-100 text-blue-800">
                                {getRequirementLabel(achievement.requirement_type)}
                                {achievement.requirement_value && `: ${achievement.requirement_value}`}
                              </Badge>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleReorder(achievement, "up")}
                              disabled={index === 0}
                            >
                              <ArrowUp className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleReorder(achievement, "down")}
                              disabled={index === achievements.length - 1}
                            >
                              <ArrowDown className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleOpenDialog(achievement)}
                              className="border-blue-200 hover:bg-blue-50"
                            >
                              <Pencil className="w-4 h-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDelete(achievement.id)}
                              className="border-red-200 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingAchievement ? "Editar Conquista" : "Nova Conquista"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Conquista *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Primeira Vitória"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="icon">Ícone (Emoji)</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="🏆"
                  className="text-2xl text-center"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="badge_id">ID do Badge *</Label>
              <Input
                id="badge_id"
                value={formData.badge_id}
                onChange={(e) => setFormData({ ...formData, badge_id: e.target.value })}
                placeholder="Ex: first_correct, streak_7, level_5"
              />
              <p className="text-xs text-gray-500">
                ID único para identificar esta conquista no sistema
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descreva como desbloquear esta conquista"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="requirement_type">Tipo de Requisito *</Label>
                <Select
                  value={formData.requirement_type}
                  onValueChange={(value) => setFormData({ ...formData, requirement_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUIREMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.icon} {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="requirement_value">Valor do Requisito</Label>
                <Input
                  id="requirement_value"
                  type="number"
                  value={formData.requirement_value}
                  onChange={(e) => setFormData({ ...formData, requirement_value: parseInt(e.target.value) })}
                  placeholder="Ex: 7, 80, 500"
                />
                <p className="text-xs text-gray-500">
                  {formData.requirement_type === "accuracy" && "Percentual (0-100)"}
                  {formData.requirement_type === "streak_days" && "Número de dias"}
                  {formData.requirement_type === "level" && "Nível mínimo"}
                  {formData.requirement_type === "points" && "Quantidade de pontos"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4 text-purple-600 rounded"
              />
              <Label htmlFor="active" className="cursor-pointer">
                Conquista ativa
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700">
              {editingAchievement ? "Salvar Alterações" : "Criar Conquista"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}