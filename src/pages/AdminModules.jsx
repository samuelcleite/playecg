
import { useState, useEffect } from "react";
import { User } from "@/entities/User";
import { Module } from "@/entities/Module";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
// Badge is still imported but not used for difficulty

// Select is still imported but not used for difficulty
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
  FolderOpen,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BulkImportDialog from "../components/admin/BulkImportDialog";

export default function AdminModules() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [modules, setModules] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    order: 1,
    total_cases: 0,
    required_points: 0
  });

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const userData = await User.me();
    if (userData.role !== "admin") {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    setUser(userData);
    await loadData();
  };

  const loadData = async () => {
    const modulesData = await Module.list("order");
    setModules(modulesData);
  };

  const handleOpenDialog = (moduleToEdit = null) => {
    if (moduleToEdit) {
      setEditingModule(moduleToEdit);
      setFormData({
        name: moduleToEdit.name || "",
        description: moduleToEdit.description || "",
        order: moduleToEdit.order || 1,
        total_cases: moduleToEdit.total_cases || 0,
        required_points: moduleToEdit.required_points || 0
      });
    } else {
      setEditingModule(null);
      setFormData({
        name: "",
        description: "",
        order: modules.length + 1,
        total_cases: 0,
        required_points: 0
      });
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (editingModule) {
      await Module.update(editingModule.id, formData);
    } else {
      await Module.create(formData);
    }

    setShowDialog(false);
    await loadData();
  };

  const handleDelete = async (moduleId) => {
    if (confirm("Tem certeza que deseja excluir este módulo?")) {
      await Module.delete(moduleId);
      await loadData();
    }
  };

  const moveModule = async (moduleId, direction) => {
    const moduleIndex = modules.findIndex(m => m.id === moduleId);
    if (
      (direction === 'up' && moduleIndex === 0) ||
      (direction === 'down' && moduleIndex === modules.length - 1)
    ) {
      return;
    }

    const newModules = [...modules];
    const targetIndex = direction === 'up' ? moduleIndex - 1 : moduleIndex + 1;
    
    // Swap the modules
    [newModules[moduleIndex], newModules[targetIndex]] = 
    [newModules[targetIndex], newModules[moduleIndex]];

    // Update the 'order' property for the swapped modules
    // Note: We are updating the order based on their new positions in the array,
    // assuming array index + 1 maps to order.
    // This requires a backend call for each, or a batch update.
    // For simplicity and to reflect immediate visual change, updating both.
    // A more robust solution might involve sending the new sorted list to the backend.
    await Module.update(newModules[moduleIndex].id, { order: moduleIndex + 1 });
    await Module.update(newModules[targetIndex].id, { order: targetIndex + 1 });

    // Reload data to ensure consistent state with backend
    await loadData();
  };

  // Removed getDifficultyColor function as difficulty is no longer used

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gerenciar Módulos</h1>
            <p className="text-gray-500 mt-1">Configure a trilha de aprendizado</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => setShowBulkImport(true)}
              variant="outline"
              className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              <FileSpreadsheet className="w-5 h-5" />
              Importar em Massa
            </Button>
            <Button
              onClick={() => handleOpenDialog()}
              className="bg-purple-600 hover:bg-purple-700 gap-2"
            >
              <Plus className="w-5 h-5" />
              Novo Módulo
            </Button>
          </div>
        </div>

        {/* Modules List */}
        <div className="space-y-4">
          <AnimatePresence>
            {modules.map((module, index) => (
              <motion.div
                key={module.id}
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
                          onClick={() => moveModule(module.id, 'up')}
                          disabled={index === 0}
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <div className="text-center font-bold text-gray-900">{module.order}</div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => moveModule(module.id, 'down')}
                          disabled={index === modules.length - 1}
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Module Icon */}
                      <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                        {module.order}
                      </div>

                      {/* Module Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold text-gray-900">{module.name}</h3>
                          {/* Removed Badge for difficulty */}
                        </div>
                        <p className="text-gray-600 mb-3">{module.description}</p>
                        <div className="flex gap-4 text-sm text-gray-500">
                          <span>{module.total_cases} casos</span>
                          <span>•</span>
                          <span>{module.required_points} pontos necessários</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleOpenDialog(module)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDelete(module.id)}
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

          {modules.length === 0 && (
            <Card className="border-none shadow-lg">
              <CardContent className="p-12 text-center">
                <FolderOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Nenhum módulo cadastrado
                </h3>
                <p className="text-gray-600 mb-4">
                  Crie módulos para organizar a trilha de aprendizado
                </p>
                <Button onClick={() => handleOpenDialog()} className="bg-purple-600 hover:bg-purple-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Primeiro Módulo
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5" />
                {editingModule ? 'Editar Módulo' : 'Novo Módulo'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Nome do Módulo</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Ritmo e Frequência Cardíaca"
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva o que os alunos aprenderão..."
                  rows={3}
                />
              </div>

              <div className="grid md:grid-cols-3 gap-4"> {/* Adjusted grid layout */}
                {/* Removed difficulty select */}

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

                <div className="space-y-2">
                  <Label>Pontos Necessários</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.required_points}
                    onChange={(e) => setFormData({ ...formData, required_points: parseInt(e.target.value) })}
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
        entityType="Module"
        onImportComplete={loadData}
      />
    </div>
  );
}
