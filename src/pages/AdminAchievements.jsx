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
  Star,
  Flame,
  BookOpen,
  X
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

const generateBadgeId = (name) => {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
};

export default function AdminAchievements() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [modules, setModules] = useState([]);
  const [allPhases, setAllPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "🏆",
    badge_id: "",
    achievement_type: "intensity",
    requirement_type: "first_correct",
    requirement_value: 1,
    module_ids: [],
    phase_ids: [],
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

    const modulesData = await base44.entities.Module.list("order");
    setModules(modulesData);

    const phasesData = await base44.entities.Phase.list("order");
    setAllPhases(phasesData);

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
        achievement_type: achievement.achievement_type || "intensity",
        requirement_type: achievement.requirement_type || "first_correct",
        requirement_value: achievement.requirement_value || 1,
        module_ids: achievement.module_ids || [],
        phase_ids: achievement.phase_ids || [],
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
        achievement_type: "intensity",
        requirement_type: "first_correct",
        requirement_value: 1,
        module_ids: [],
        phase_ids: [],
        order: achievements.length,
        active: true
      });
    }
    setShowDialog(true);
  };

  const handleNameChange = (name) => {
    setFormData({
      ...formData,
      name: name,
      badge_id: editingAchievement ? formData.badge_id : generateBadgeId(name)
    });
  };

  const toggleModule = (moduleId) => {
    const isSelected = formData.module_ids.includes(moduleId);
    if (isSelected) {
      setFormData({
        ...formData,
        module_ids: formData.module_ids.filter(id => id !== moduleId)
      });
    } else {
      setFormData({
        ...formData,
        module_ids: [...formData.module_ids, moduleId]
      });
    }
  };

  const togglePhase = (phaseId) => {
    const isSelected = formData.phase_ids.includes(phaseId);
    if (isSelected) {
      setFormData({
        ...formData,
        phase_ids: formData.phase_ids.filter(id => id !== phaseId)
      });
    } else {
      setFormData({
        ...formData,
        phase_ids: [...formData.phase_ids, phaseId]
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert("Preencha o nome da conquista");
      return;
    }

    if (formData.achievement_type === "specialization" && formData.module_ids.length === 0 && formData.phase_ids.length === 0) {
      alert("Selecione pelo menos um módulo ou fase para conquistas de especialização");
      return;
    }

    const dataToSave = {
      ...formData,
      badge_id: formData.badge_id || generateBadgeId(formData.name),
      requirement_type: formData.achievement_type === "intensity" ? formData.requirement_type : null,
      requirement_value: formData.achievement_type === "intensity" ? formData.requirement_value : null,
      module_ids: formData.achievement_type === "specialization" ? formData.module_ids : [],
      phase_ids: formData.achievement_type === "specialization" ? formData.phase_ids : []
    };

    if (editingAchievement) {
      await base44.entities.Achievement.update(editingAchievement.id, dataToSave);
    } else {
      await base44.entities.Achievement.create(dataToSave);
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

  const getModuleName = (moduleId) => {
    return modules.find(m => m.id === moduleId)?.name || "Módulo";
  };

  const getPhaseName = (phaseId) => {
    return allPhases.find(p => p.id === phaseId)?.name || "Fase";
  };

  const getRequirementsText = (achievement) => {
    const moduleNames = (achievement.module_ids || []).map(id => getModuleName(id));
    const phaseNames = (achievement.phase_ids || []).map(id => getPhaseName(id));
    
    const parts = [];
    if (moduleNames.length > 0) {
      parts.push(`Módulos: ${moduleNames.join(", ")}`);
    }
    if (phaseNames.length > 0) {
      parts.push(`Fases: ${phaseNames.join(", ")}`);
    }
    
    return parts.join(" | ");
  };

  const intensityAchievements = achievements.filter(a => a.achievement_type === "intensity");
  const specializationAchievements = achievements.filter(a => a.achievement_type === "specialization");

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
              Configure conquistas de intensidade e especialização
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
        <div className="grid md:grid-cols-4 gap-6">
          <Card className="border-none shadow-lg bg-gradient-to-br from-purple-50 to-indigo-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="text-3xl font-bold text-purple-600">{achievements.length}</p>
                </div>
                <Trophy className="w-10 h-10 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-orange-50 to-red-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Intensidade</p>
                  <p className="text-3xl font-bold text-orange-600">{intensityAchievements.length}</p>
                </div>
                <Flame className="w-10 h-10 text-orange-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Especialização</p>
                  <p className="text-3xl font-bold text-blue-600">{specializationAchievements.length}</p>
                </div>
                <BookOpen className="w-10 h-10 text-blue-400" />
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
        </div>

        {/* Intensity Achievements */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="w-6 h-6 text-orange-600" />
              Conquistas de Intensidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            {intensityAchievements.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nenhuma conquista de intensidade cadastrada
              </div>
            ) : (
              <div className="space-y-3">
                {intensityAchievements.map((achievement, index) => (
                  <motion.div
                    key={achievement.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className={`border ${achievement.active ? 'border-orange-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                      <CardContent className="p-6">
                        <div className="flex items-center gap-4">
                          <div className="text-5xl">{achievement.icon}</div>
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
                              <Badge className="bg-orange-100 text-orange-800">
                                {getRequirementLabel(achievement.requirement_type)}
                                {achievement.requirement_value && `: ${achievement.requirement_value}`}
                              </Badge>
                            </div>
                          </div>
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
                              disabled={index === intensityAchievements.length - 1}
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

        {/* Specialization Achievements */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-blue-600" />
              Conquistas de Especialização
            </CardTitle>
          </CardHeader>
          <CardContent>
            {specializationAchievements.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nenhuma conquista de especialização cadastrada
              </div>
            ) : (
              <div className="space-y-3">
                {specializationAchievements.map((achievement, index) => (
                  <motion.div
                    key={achievement.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className={`border ${achievement.active ? 'border-blue-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                      <CardContent className="p-6">
                        <div className="flex items-center gap-4">
                          <div className="text-5xl">{achievement.icon}</div>
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
                                {getRequirementsText(achievement)}
                              </Badge>
                            </div>
                          </div>
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
                              disabled={index === specializationAchievements.length - 1}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAchievement ? "Editar Conquista" : "Nova Conquista"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="achievement_type">Tipo de Conquista *</Label>
              <Select
                value={formData.achievement_type}
                onValueChange={(value) => setFormData({ ...formData, achievement_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="intensity">
                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4" />
                      Intensidade (baseada em requisitos gerais)
                    </div>
                  </SelectItem>
                  <SelectItem value="specialization">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Especialização (baseada em módulos/fases)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Conquista *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
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

            {formData.name && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-sm text-purple-900">
                  <strong>ID gerado automaticamente:</strong> <code className="bg-purple-100 px-2 py-1 rounded">{formData.badge_id || generateBadgeId(formData.name)}</code>
                </p>
              </div>
            )}

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

            {formData.achievement_type === "intensity" && (
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
                </div>
              </div>
            )}

            {formData.achievement_type === "specialization" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Módulos *</Label>
                  <div className="border rounded-lg p-3 max-h-48 overflow-y-auto bg-gray-50">
                    {modules.map((module) => (
                      <div key={module.id} className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          id={`module-${module.id}`}
                          checked={formData.module_ids.includes(module.id)}
                          onChange={() => toggleModule(module.id)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <Label htmlFor={`module-${module.id}`} className="cursor-pointer flex-1">
                          {module.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {formData.module_ids.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.module_ids.map((moduleId) => (
                        <Badge key={moduleId} className="bg-blue-100 text-blue-800 gap-2">
                          {getModuleName(moduleId)}
                          <X
                            className="w-3 h-3 cursor-pointer"
                            onClick={() => toggleModule(moduleId)}
                          />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Fases (Opcional)</Label>
                  <div className="border rounded-lg p-3 max-h-48 overflow-y-auto bg-gray-50">
                    {allPhases.map((phase) => (
                      <div key={phase.id} className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          id={`phase-${phase.id}`}
                          checked={formData.phase_ids.includes(phase.id)}
                          onChange={() => togglePhase(phase.id)}
                          className="w-4 h-4 text-purple-600 rounded"
                        />
                        <Label htmlFor={`phase-${phase.id}`} className="cursor-pointer flex-1">
                          {phase.name} ({getModuleName(phase.module_id)})
                        </Label>
                      </div>
                    ))}
                  </div>
                  {formData.phase_ids.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.phase_ids.map((phaseId) => (
                        <Badge key={phaseId} className="bg-purple-100 text-purple-800 gap-2">
                          {getPhaseName(phaseId)}
                          <X
                            className="w-3 h-3 cursor-pointer"
                            onClick={() => togglePhase(phaseId)}
                          />
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Deixe vazio para exigir apenas módulos completos
                  </p>
                </div>
              </div>
            )}

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