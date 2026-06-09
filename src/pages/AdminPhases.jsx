import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Layers,
  ArrowUp,
  ArrowDown,
  FolderOpen,
  FileSpreadsheet
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BulkImportDialog from "../components/admin/BulkImportDialog";

export default function AdminPhases() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [modules, setModules] = useState([]);
  const [phases, setPhases] = useState([]);
  const [selectedModule, setSelectedModule] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingPhase, setEditingPhase] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    module_id: "",
    order: 1,
    total_cases: 0,
    required_points: 0
  });

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (selectedModule) {
      loadPhases();
    }
  }, [selectedModule]);

  const checkAdmin = async () => {
    const userData = await base44.auth.me();
    if (userData.role !== "admin") {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    setUser(userData);
    await loadModules();
  };

  const loadModules = async () => {
    const modulesData = await base44.entities.Module.list("order");
    setModules(modulesData);
    if (modulesData.length > 0 && !selectedModule) {
      setSelectedModule(modulesData[0].id);
    }
  };

  const loadPhases = async (retries = 3) => {
    try {
      const phasesData = await base44.entities.Phase.filter({ module_id: selectedModule }, "order");
      setPhases(phasesData);
    } catch (error) {
      // Em caso de "Rate limit exceeded", aguarda e tenta novamente
      if (retries > 0 && /rate limit/i.test(error?.message || "")) {
        await new Promise((r) => setTimeout(r, 1200));
        return loadPhases(retries - 1);
      }
      throw error;
    }
  };

  const handleOpenDialog = (phaseToEdit = null) => {
    if (phaseToEdit) {
      setEditingPhase(phaseToEdit);
      setFormData({
        name: phaseToEdit.name || "",
        description: phaseToEdit.description || "",
        module_id: phaseToEdit.module_id || selectedModule,
        order: phaseToEdit.order || 1,
        total_cases: phaseToEdit.total_cases || 0,
        required_points: phaseToEdit.required_points || 0
      });
    } else {
      setEditingPhase(null);
      setFormData({
        name: "",
        description: "",
        module_id: selectedModule,
        order: phases.length + 1,
        total_cases: 0,
        required_points: 0
      });
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (editingPhase) {
      await base44.entities.Phase.update(editingPhase.id, formData);
    } else {
      await base44.entities.Phase.create(formData);
    }

    setShowDialog(false);
    await loadPhases();
  };

  const handleDelete = async (phaseId) => {
    if (confirm("Tem certeza que deseja excluir esta fase?")) {
      await base44.entities.Phase.delete(phaseId);
      await loadPhases();
    }
  };

  const movePhase = async (phaseId, direction) => {
    const phaseIndex = phases.findIndex(p => p.id === phaseId);
    if (
      (direction === 'up' && phaseIndex === 0) ||
      (direction === 'down' && phaseIndex === phases.length - 1)
    ) {
      return;
    }

    const newPhases = [...phases];
    const targetIndex = direction === 'up' ? phaseIndex - 1 : phaseIndex + 1;
    
    [newPhases[phaseIndex], newPhases[targetIndex]] = 
    [newPhases[targetIndex], newPhases[phaseIndex]];

    // Update orders in the backend
    await base44.entities.Phase.update(newPhases[phaseIndex].id, { order: phaseIndex + 1 });
    await base44.entities.Phase.update(newPhases[targetIndex].id, { order: targetIndex + 1 });

    await loadPhases();
  };

  const currentModule = modules.find(m => m.id === selectedModule);

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gerenciar Fases</h1>
            <p className="text-gray-500 mt-1">Organize as fases dentro de cada módulo</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => setShowBulkImport(true)}
              variant="outline"
              className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
              disabled={modules.length === 0}
            >
              <FileSpreadsheet className="w-5 h-5" />
              Importar em Massa
            </Button>
            <Button
              onClick={() => handleOpenDialog()}
              className="bg-purple-600 hover:bg-purple-700 gap-2"
              disabled={!selectedModule}
            >
              <Plus className="w-5 h-5" />
              Nova Fase
            </Button>
          </div>
        </div>

        {/* Module Selector */}
        {modules.length > 0 && (
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle>Selecione o Módulo</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedModule} onValueChange={setSelectedModule}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um módulo" />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((module) => (
                    <SelectItem key={module.id} value={module.id}>
                      {module.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentModule && (
                <p className="text-sm text-gray-600 mt-2">
                  {currentModule.description}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {modules.length === 0 && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <FolderOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Nenhum módulo cadastrado
              </h3>
              <p className="text-gray-600 mb-4">
                Primeiro, crie módulos na página de gerenciamento de módulos
              </p>
              <Button 
                onClick={() => navigate(createPageUrl("AdminModules"))}
                className="bg-purple-600 hover:bg-purple-700"
              >
                Ir para Módulos
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Phases List */}
        {selectedModule && (
          <div className="space-y-4">
            <AnimatePresence>
              {phases.map((phase, index) => (
                <motion.div
                  key={phase.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <Card className="border-none shadow-lg">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-6">
                        {/* Order Controls */}
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => movePhase(phase.id, 'up')}
                            disabled={index === 0}
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <div className="text-center font-bold text-gray-900">{phase.order}</div>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => movePhase(phase.id, 'down')}
                            disabled={index === phases.length - 1}
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* Phase Icon */}
                        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                          <Layers className="w-8 h-8" />
                        </div>

                        {/* Phase Info */}
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-gray-900 mb-2">{phase.name}</h3>
                          <p className="text-gray-600 mb-3">{phase.description}</p>
                          <div className="flex gap-4 text-sm text-gray-500">
                            <span>{phase.total_cases} casos</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleOpenDialog(phase)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleDelete(phase.id)}
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

            {phases.length === 0 && selectedModule && (
              <Card className="border-none shadow-lg">
                <CardContent className="p-12 text-center">
                  <Layers className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Nenhuma fase neste módulo
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Adicione fases para organizar os casos de aprendizado
                  </p>
                  <Button onClick={() => handleOpenDialog()} className="bg-purple-600 hover:bg-purple-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Primeira Fase
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                {editingPhase ? 'Editar Fase' : 'Nova Fase'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Nome da Fase</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Introdução aos Ritmos Básicos"
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva o conteúdo desta fase..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Módulo</Label>
                <Select
                  value={formData.module_id}
                  onValueChange={(value) => setFormData({ ...formData, module_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um módulo" />
                  </SelectTrigger>
                  <SelectContent>
                    {modules.map((module) => (
                      <SelectItem key={module.id} value={module.id}>
                        {module.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.order}
                    onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Total de Casos</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.total_cases}
                    onChange={(e) => setFormData({ ...formData, total_cases: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setShowDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700 gap-2">
                  <Save className="w-4 h-4" />
                  Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Bulk Import Dialog */}
      <BulkImportDialog
        open={showBulkImport}
        onOpenChange={setShowBulkImport}
        entityType="Phase"
        modules={modules}
        onImportComplete={loadPhases}
      />
    </div>
  );
}