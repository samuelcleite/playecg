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
  { value: "streak_days", label: "Sequência de Dias Consecutivos", icon: "🔥" },
  { value: "accuracy", label: "Taxa de Acerto (%)", icon: "🎪" },
  { value: "level", label: "Nível Alcançado", icon: "⭐" },
  { value: "points", label: "Pontos Acumulados", icon: "💎" },
  { value: "completed_modules", label: "Módulos Completados", icon: "📚" },
  { value: "total_attempts", label: "Total de Tentativas", icon: "🎮" },
  { value: "random_quiz_count", label: "Casos Aleatórios Feitos (Quiz)", icon: "🎲" },
  { value: "top_users_rank", label: "Destaque (Top N Usuários)", icon: "🏅" },
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
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState(null);
  const [bulkInput, setBulkInput] = useState("");
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
      alert("Preencha o nome do troféu");
      return;
    }

    if (formData.achievement_type === "specialization" && formData.module_ids.length === 0 && formData.phase_ids.length === 0) {
      alert("Selecione pelo menos um módulo ou fase para troféus de especialização");
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
    if (confirm("Tem certeza que deseja excluir este troféu?")) {
      await base44.entities.Achievement.delete(id);
      await loadData();
    }
  };

  const handleBulkCreate = async () => {
    try {
      const lines = bulkInput.trim().split('\n').filter(line => line.trim());
      const achievementsToCreate = [];

      for (const line of lines) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length < 4) {
          alert(`Linha inválida: ${line}\nFormato esperado: Nome | Descrição | Tipo | Requisito | Valor`);
          return;
        }

        const [name, description, achievementType, requirementType, requirementValue] = parts;
        
        if (!name || !achievementType) {
          alert(`Nome e tipo são obrigatórios: ${line}`);
          return;
        }

        const achievement = {
          name: name,
          description: description || "",
          icon: "🏆",
          badge_id: generateBadgeId(name),
          achievement_type: achievementType.toLowerCase(),
          order: achievements.length + achievementsToCreate.length,
          active: true
        };

        if (achievementType.toLowerCase() === "intensity" || achievementType.toLowerCase() === "intensidade") {
          achievement.achievement_type = "intensity";
          achievement.requirement_type = requirementType || "total_attempts";
          achievement.requirement_value = requirementValue ? parseInt(requirementValue) : 1;
        } else if (achievementType.toLowerCase() === "specialization" || achievementType.toLowerCase() === "especialização" || achievementType.toLowerCase() === "especializacao") {
          achievement.achievement_type = "specialization";
          achievement.module_ids = [];
          achievement.phase_ids = [];
        }

        achievementsToCreate.push(achievement);
      }

      for (const achievement of achievementsToCreate) {
        await base44.entities.Achievement.create(achievement);
      }

      setShowBulkDialog(false);
      setBulkInput("");
      await loadData();
    } catch (error) {
      alert(`Erro ao criar troféus: ${error.message}`);
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

  // Agrupar fases por módulo
  const phasesByModule = modules.map(module => ({
    module,
    phases: allPhases.filter(p => p.module_id === module.id)
  })).filter(group => group.phases.length > 0);

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
              Gerenciar Troféus
            </h1>
            <p className="text-gray-600 mt-2">
              Configure troféus de intensidade e especialização
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowBulkDialog(true)}
              variant="outline"
              className="gap-2 border-purple-300 hover:bg-purple-50"
            >
              <Zap className="w-5 h-5" />
              Cadastro em Lote
            </Button>
            <Button
              onClick={() => handleOpenDialog()}
              className="bg-purple-600 hover:bg-purple-700 gap-2"
            >
              <Plus className="w-5 h-5" />
              Novo Troféu
            </Button>
          </div>
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
              Troféus de Intensidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            {intensityAchievements.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nenhum troféu de intensidade cadastrado
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
              Troféus de Especialização
            </CardTitle>
          </CardHeader>
          <CardContent>
            {specializationAchievements.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nenhum troféu de especialização cadastrado
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

      {/* Bulk Create Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-6 h-6 text-purple-600" />
              Cadastro em Lote de Troféus
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <p className="text-sm text-blue-900 font-semibold">
                📋 Formato de entrada (um troféu por linha):
              </p>
              <code className="text-xs text-blue-800 block bg-blue-100 p-2 rounded">
                Nome | Descrição | Tipo | TipoRequisito | ValorRequisito
              </code>
              <div className="text-xs text-blue-800 space-y-1 mt-2">
                <p><strong>Tipo:</strong> intensidade ou especialização</p>
                <p><strong>TipoRequisito (apenas intensidade):</strong></p>
                <ul className="list-disc list-inside ml-4">
                  <li>first_correct - Primeira resposta correta</li>
                  <li>streak_days - Sequência de dias consecutivos</li>
                  <li>accuracy - Taxa de acerto (%)</li>
                  <li>level - Nível alcançado</li>
                  <li>points - Pontos acumulados</li>
                  <li>completed_modules - Módulos completados</li>
                  <li>total_attempts - Total de tentativas</li>
                  <li>random_quiz_count - Casos aleatórios feitos</li>
                  <li>top_users_rank - Destaque (Top N usuários)</li>
                </ul>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-900">
                <strong>Exemplo:</strong>
              </p>
              <code className="text-xs text-amber-800 block bg-amber-100 p-2 rounded mt-1 whitespace-pre">
{`Primeira Vitória | Acerte sua primeira questão | intensidade | first_correct | 1
Iniciante Dedicado | Complete 10 casos aleatórios | intensidade | random_quiz_count | 10
Sequência de 7 Dias | Pratique 7 dias seguidos | intensidade | streak_days | 7
Top 10 Usuários | Esteja entre os 10 que mais resolveram questões | intensidade | top_users_rank | 10`}
              </code>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulkInput">Cole seus troféus aqui (um por linha):</Label>
              <Textarea
                id="bulkInput"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder="Primeira Vitória | Acerte sua primeira questão | intensidade | first_correct | 1"
                rows={12}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500">
                Total de linhas: {bulkInput.trim().split('\n').filter(line => line.trim()).length}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowBulkDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleBulkCreate} 
              className="bg-purple-600 hover:bg-purple-700"
              disabled={!bulkInput.trim()}
            >
              <Plus className="w-4 h-4 mr-2" />
              Criar Troféus
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAchievement ? "Editar Troféu" : "Novo Troféu"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="achievement_type">Tipo de Troféu *</Label>
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
                <Label htmlFor="nome">Nome do Troféu *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Ex: Primeira Vitória"
                />
              </div>

              <div className="space-y-2">
                <Label>Ícone (Emoji)</Label>
                <div className="border rounded-lg p-3 bg-gray-50">
                  <div className="grid grid-cols-8 gap-1 mb-2">
                    {["🏆","🥇","🥈","🥉","🎯","🔥","⭐","🌟",
                      "💎","🎖️","🏅","🎗️","🎪","🎮","🎲","🎴",
                      "📚","📖","🧠","💡","⚡","🚀","🌈","✨",
                      "💪","🤝","👑","🦁","🦅","🐉","🌺","🍀"].map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: emoji })}
                        className={`text-xl p-1.5 rounded hover:bg-white hover:shadow transition-all ${formData.icon === emoji ? 'bg-white shadow ring-2 ring-purple-400' : ''}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 border-t pt-2">
                    <span className="text-xs text-gray-500">Ou digite:</span>
                    <Input
                      value={formData.icon}
                      onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                      placeholder="🏆"
                      className="text-xl text-center h-8 w-20"
                    />
                    <span className="text-2xl">{formData.icon}</span>
                  </div>
                </div>
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
                placeholder="Descreva como desbloquear este troféu"
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
                  <Label>Módulos</Label>
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
                  <Label>Fases Específicas (Opcional)</Label>
                  <div className="border rounded-lg p-3 max-h-64 overflow-y-auto bg-gray-50">
                    {phasesByModule.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        Nenhuma fase cadastrada ainda
                      </p>
                    ) : (
                      phasesByModule.map((group) => (
                        <div key={group.module.id} className="mb-4 last:mb-0">
                          <div className="font-semibold text-sm text-blue-700 mb-2 flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            {group.module.name}
                          </div>
                          <div className="space-y-1 pl-6 border-l-2 border-blue-200">
                            {group.phases.map((phase) => (
                              <div key={phase.id} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`phase-${phase.id}`}
                                  checked={formData.phase_ids.includes(phase.id)}
                                  onChange={() => togglePhase(phase.id)}
                                  className="w-4 h-4 text-purple-600 rounded"
                                />
                                <Label htmlFor={`phase-${phase.id}`} className="cursor-pointer flex-1 text-sm">
                                  {phase.name}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {formData.phase_ids.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.phase_ids.map((phaseId) => {
                        const phase = allPhases.find(p => p.id === phaseId);
                        return (
                          <Badge key={phaseId} className="bg-purple-100 text-purple-800 gap-2">
                            {getPhaseName(phaseId)}
                            <span className="text-xs opacity-70">({getModuleName(phase?.module_id)})</span>
                            <X
                              className="w-3 h-3 cursor-pointer"
                              onClick={() => togglePhase(phaseId)}
                            />
                          </Badge>
                        );
                      })}
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
                Troféu ativo
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700">
              {editingAchievement ? "Salvar Alterações" : "Criar Troféu"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}