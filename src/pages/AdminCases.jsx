import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Plus,
  Edit,
  Trash2,
  Save,
  FileEdit,
  X,
  Search,
  Image as ImageIcon,
  CheckCircle2,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";

export default function AdminCases() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [cases, setCases] = useState([]);
  const [modules, setModules] = useState([]);
  const [phases, setPhases] = useState([]);
  const [ecgImages, setEcgImages] = useState([]);
  const [filteredEcgImages, setFilteredEcgImages] = useState([]);
  const [imageSearchTerm, setImageSearchTerm] = useState("");
  const [selectedModule, setSelectedModule] = useState("");
  const [selectedPhase, setSelectedPhase] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showImageSelector, setShowImageSelector] = useState(false);
  const [editingCase, setEditingCase] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    image_url: "",
    patient_info: "",
    multiple_correct: false,
    correct_answers: [],
    options: ["", "", "", ""],
    explanation: "",
    key_findings: [""],
    module_id: "",
    phase_id: ""
  });

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (selectedModule) {
      loadPhases();
    }
  }, [selectedModule]);

  useEffect(() => {
    if (selectedModule && selectedPhase) {
      loadCases();
    }
  }, [selectedModule, selectedPhase]);

  useEffect(() => {
    filterEcgImages();
  }, [imageSearchTerm, ecgImages]);

  // Detectar caso a ser editado via URL
  useEffect(() => {
    const handleEditCase = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const editCaseId = urlParams.get('edit_case');
      
      if (editCaseId) {
        // Buscar o caso diretamente
        const allCases = await base44.entities.ECGCase.list();
        const caseToEdit = allCases.find(c => c.id === editCaseId);
        
        if (caseToEdit) {
          // Selecionar o módulo e fase corretos
          setSelectedModule(caseToEdit.module_id);
          setSelectedPhase(caseToEdit.phase_id);
          
          // Aguardar um pouco para garantir que os dados foram carregados
          // (i.e., modules and phases updated, loadPhases/loadCases triggered)
          setTimeout(() => {
            handleOpenDialog(caseToEdit);
            // Limpar o parâmetro da URL
            window.history.replaceState({}, '', createPageUrl("AdminCases"));
          }, 500); // 500ms timeout to allow state updates and subsequent data loads to complete
        }
      }
    };
    
    // Only run this effect if modules are loaded. Modules are needed for the dropdowns in the dialog.
    if (modules.length > 0) {
      handleEditCase();
    }
  }, [modules]); // Depend on `modules` to ensure initial data for dialog is ready.

  const checkAdmin = async () => {
    const userData = await base44.auth.me();
    if (userData.role !== "admin") {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    setUser(userData);
    await loadModules();
    await loadEcgImages();
  };

  const loadModules = async () => {
    const modulesData = await base44.entities.Module.list("order");
    setModules(modulesData);
    if (modulesData.length > 0 && !selectedModule) {
      setSelectedModule(modulesData[0].id);
    }
  };

  const loadPhases = async () => {
    const phasesData = await base44.entities.Phase.filter({ module_id: selectedModule }, "order");
    setPhases(phasesData);
    if (phasesData.length > 0 && !selectedPhase) {
      setSelectedPhase(phasesData[0].id);
    } else if (phasesData.length === 0) {
      setSelectedPhase("");
      setCases([]);
    }
  };

  const loadCases = async () => {
    const casesData = await base44.entities.ECGCase.filter({
      module_id: selectedModule,
      phase_id: selectedPhase
    }, "-created_date");
    setCases(casesData);
  };

  const loadEcgImages = async () => {
    const imagesData = await base44.entities.ECGImage.list("-created_date");
    setEcgImages(imagesData);
  };

  const filterEcgImages = () => {
    if (!imageSearchTerm.trim()) {
      setFilteredEcgImages(ecgImages);
      return;
    }

    const filtered = ecgImages.filter(img =>
      img.description?.toLowerCase().includes(imageSearchTerm.toLowerCase()) ||
      img.indexer?.toLowerCase().includes(imageSearchTerm.toLowerCase()) ||
      img.tags?.some(tag => tag.toLowerCase().includes(imageSearchTerm.toLowerCase()))
    );
    setFilteredEcgImages(filtered);
  };

  const handleOpenDialog = (caseToEdit = null) => {
    if (caseToEdit) {
      setEditingCase(caseToEdit);
      // Compatibilidade com versão antiga
      let correctAnswers = caseToEdit.correct_answers || [];
      if (!correctAnswers.length && caseToEdit.correct_diagnosis) {
        correctAnswers = [caseToEdit.correct_diagnosis];
      }
      
      setFormData({
        title: caseToEdit.title || "",
        image_url: caseToEdit.image_url || "",
        patient_info: caseToEdit.patient_info || "",
        multiple_correct: caseToEdit.multiple_correct || false,
        correct_answers: correctAnswers,
        options: caseToEdit.options || ["", "", "", ""],
        explanation: caseToEdit.explanation || "",
        key_findings: caseToEdit.key_findings || [""],
        module_id: caseToEdit.module_id || selectedModule,
        phase_id: caseToEdit.phase_id || selectedPhase
      });
    } else {
      setEditingCase(null);
      setFormData({
        title: "",
        image_url: "",
        patient_info: "",
        multiple_correct: false,
        correct_answers: [],
        options: ["", "", "", ""],
        explanation: "",
        key_findings: [""],
        module_id: selectedModule,
        phase_id: selectedPhase
      });
    }
    setShowDialog(true);
  };

  const handleSelectImage = (imageUrl) => {
    setFormData({ ...formData, image_url: imageUrl });
    setShowImageSelector(false);
    setImageSearchTerm("");
  };

  const handleSave = async () => {
    const caseData = {
      ...formData,
      options: formData.options.filter(opt => opt.trim() !== ""),
      key_findings: formData.key_findings.filter(kf => kf.trim() !== ""),
      // Manter compatibilidade com versão antiga
      correct_diagnosis: formData.correct_answers.length > 0 ? formData.correct_answers[0] : ""
    };

    if (editingCase) {
      await base44.entities.ECGCase.update(editingCase.id, caseData);
    } else {
      await base44.entities.ECGCase.create(caseData);
    }

    setShowDialog(false);
    await loadCases();
  };

  const handleDelete = async (caseId) => {
    if (confirm("Tem certeza que deseja excluir este caso?")) {
      await base44.entities.ECGCase.delete(caseId);
      await loadCases();
    }
  };

  const updateOption = (index, value) => {
    const newOptions = [...formData.options];
    const oldValue = newOptions[index];
    newOptions[index] = value;
    
    // Se a opção antiga estava nas respostas corretas, atualizar
    const newCorrectAnswers = formData.correct_answers.map(ans => 
      ans === oldValue ? value : ans
    );
    
    setFormData({ 
      ...formData, 
      options: newOptions,
      correct_answers: newCorrectAnswers
    });
  };

  const addOption = () => {
    setFormData({ ...formData, options: [...formData.options, ""] });
  };

  const removeOption = (index) => {
    const removedOption = formData.options[index];
    const newOptions = formData.options.filter((_, i) => i !== index);
    // Remover das respostas corretas se estiver lá
    const newCorrectAnswers = formData.correct_answers.filter(ans => ans !== removedOption);
    
    setFormData({ 
      ...formData, 
      options: newOptions,
      correct_answers: newCorrectAnswers
    });
  };

  const toggleCorrectAnswer = (option) => {
    if (formData.multiple_correct) {
      // Modo múltiplas respostas
      const isCurrentlyCorrect = formData.correct_answers.includes(option);
      const newCorrectAnswers = isCurrentlyCorrect
        ? formData.correct_answers.filter(ans => ans !== option)
        : [...formData.correct_answers, option];
      
      setFormData({ ...formData, correct_answers: newCorrectAnswers });
    } else {
      // Modo resposta única
      setFormData({ ...formData, correct_answers: [option] });
    }
  };

  const updateKeyFinding = (index, value) => {
    const newFindings = [...formData.key_findings];
    newFindings[index] = value;
    setFormData({ ...formData, key_findings: newFindings });
  };

  const addKeyFinding = () => {
    setFormData({ ...formData, key_findings: [...formData.key_findings, ""] });
  };

  const removeKeyFinding = (index) => {
    const newFindings = formData.key_findings.filter((_, i) => i !== index);
    setFormData({ ...formData, key_findings: newFindings });
  };

  const handleModuleChange = async (moduleId) => {
    setSelectedModule(moduleId);
    setSelectedPhase("");
    setCases([]);
  };

  const handleExportCases = async () => {
    try {
      // Buscar todos os casos
      const allCases = await base44.entities.ECGCase.list();
      
      // Formatar dados para Excel
      const excelData = allCases.map(caseItem => {
        // Extrair nome da imagem da URL
        let imageName = "";
        if (caseItem.image_url) {
          const urlParts = caseItem.image_url.split("/");
          imageName = urlParts[urlParts.length - 1];
        }
        
        // Pegar as respostas corretas
        let correctAnswer = "";
        if (caseItem.correct_answers && caseItem.correct_answers.length > 0) {
          correctAnswer = caseItem.correct_answers.join(", ");
        } else if (caseItem.correct_diagnosis) {
          correctAnswer = caseItem.correct_diagnosis;
        }
        
        return {
          "Pergunta": caseItem.title || "",
          "Resposta Correta": correctAnswer,
          "Nome da Imagem": imageName
        };
      });
      
      // Criar planilha
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Casos ECG");
      
      // Download do arquivo
      XLSX.writeFile(workbook, `casos_ecg_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error("Erro ao exportar casos:", error);
      alert("Erro ao exportar casos. Tente novamente.");
    }
  };

  const currentModule = modules.find(m => m.id === selectedModule);
  const currentPhase = phases.find(p => p.id === selectedPhase);
  const selectedImage = ecgImages.find(img => img.image_url === formData.image_url);

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Gerenciar Casos de ECG</h1>
              <p className="text-gray-500 mt-1">Adicione e edite casos por módulo e fase</p>
            </div>
            <Badge className="bg-purple-100 text-purple-800 text-lg px-4 py-2">
              {cases.length} caso{cases.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleExportCases}
              variant="outline"
              className="gap-2"
            >
              <Download className="w-5 h-5" />
              Exportar Excel
            </Button>
            <Button
              onClick={() => handleOpenDialog()}
              className="bg-purple-600 hover:bg-purple-700 gap-2"
              disabled={!selectedModule || !selectedPhase}
            >
              <Plus className="w-5 h-5" />
              Novo Caso
            </Button>
          </div>
        </div>

        {/* Module and Phase Selectors */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle>Módulo</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedModule} onValueChange={handleModuleChange}>
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
                <p className="text-sm text-gray-600 mt-2">{currentModule.description}</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle>Fase</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedPhase}
                onValueChange={setSelectedPhase}
                disabled={!selectedModule || phases.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma fase" />
                </SelectTrigger>
                <SelectContent>
                  {phases.map((phase) => (
                    <SelectItem key={phase.id} value={phase.id}>
                      {phase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentPhase && (
                <p className="text-sm text-gray-600 mt-2">{currentPhase.description}</p>
              )}
              {selectedModule && phases.length === 0 && (
                <p className="text-sm text-amber-600 mt-2">
                  Este módulo não tem fases. Crie fases primeiro.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cases Grid */}
        {selectedModule && selectedPhase && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {cases.map((caseItem) => (
                <motion.div
                  key={caseItem.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300">
                    <CardHeader>
                      <CardTitle className="text-lg">{caseItem.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {caseItem.image_url && (
                        <img
                          src={caseItem.image_url}
                          alt={caseItem.title}
                          className="w-full h-32 object-cover rounded-lg mb-4"
                        />
                      )}
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                        {caseItem.patient_info}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(caseItem)}
                          className="flex-1 gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(caseItem.id)}
                          className="flex-1 gap-2 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                          Excluir
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>

            {cases.length === 0 && selectedModule && selectedPhase && (
              <Card className="col-span-full border-none shadow-lg">
                <CardContent className="p-12 text-center">
                  <FileEdit className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Nenhum caso nesta fase
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Adicione casos de ECG para esta fase
                  </p>
                  <Button onClick={() => handleOpenDialog()} className="bg-purple-600 hover:bg-purple-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Primeiro Caso
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Main Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileEdit className="w-5 h-5" />
                {editingCase ? 'Editar Caso' : 'Novo Caso'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Módulo</Label>
                  <Select
                    value={formData.module_id}
                    onValueChange={(value) => {
                      setFormData({ ...formData, module_id: value, phase_id: "" });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
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

                <div className="space-y-2">
                  <Label>Fase</Label>
                  <Select
                    value={formData.phase_id}
                    onValueChange={(value) => setFormData({ ...formData, phase_id: value })}
                    disabled={!formData.module_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma fase" />
                    </SelectTrigger>
                    <SelectContent>
                      {phases.filter(p => p.module_id === formData.module_id).map((phase) => (
                        <SelectItem key={phase.id} value={phase.id}>
                          {phase.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Ritmo Sinusal Normal"
                />
              </div>

              {/* Image Selector */}
              <div className="space-y-2">
                <Label>Imagem do ECG</Label>
                {formData.image_url ? (
                  <div className="space-y-3">
                    <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
                      <img
                        src={formData.image_url}
                        alt="ECG selecionado"
                        className="w-full h-48 object-contain bg-gray-50"
                      />
                    </div>
                    {selectedImage && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{selectedImage.indexer}</p>
                          <p className="text-xs text-gray-500 line-clamp-1">{selectedImage.description}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFormData({ ...formData, image_url: "" })}
                        >
                          Remover
                        </Button>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setShowImageSelector(true)}
                      className="w-full"
                    >
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Trocar Imagem
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setShowImageSelector(true)}
                    className="w-full h-32 border-2 border-dashed hover:border-purple-500 hover:bg-purple-50"
                  >
                    <div className="text-center">
                      <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-700">
                        Selecionar imagem do banco
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {ecgImages.length} imagens disponíveis
                      </p>
                    </div>
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label>Informações do Paciente</Label>
                <Textarea
                  value={formData.patient_info}
                  onChange={(e) => setFormData({ ...formData, patient_info: e.target.value })}
                  placeholder="Ex: Paciente masculino, 35 anos, assintomático..."
                  rows={3}
                />
              </div>

              {/* Tipo de Resposta */}
              <div className="space-y-3 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-semibold text-gray-800">Tipo de Resposta</Label>
                    <p className="text-sm text-gray-600 mt-1">
                      {formData.multiple_correct 
                        ? "Permite selecionar múltiplas respostas corretas" 
                        : "Apenas uma resposta correta permitida"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={formData.multiple_correct ? "default" : "outline"}
                    onClick={() => {
                      const newMultiple = !formData.multiple_correct;
                      setFormData({ 
                        ...formData, 
                        multiple_correct: newMultiple,
                        // Se mudar para resposta única, manter apenas a primeira resposta
                        correct_answers: newMultiple ? formData.correct_answers : formData.correct_answers.slice(0, 1)
                      });
                    }}
                    className={formData.multiple_correct ? "bg-purple-600 hover:bg-purple-700" : ""}
                  >
                    {formData.multiple_correct ? "Múltiplas Respostas" : "Resposta Única"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Opções de Resposta
                  <span className="text-xs text-gray-500 font-normal">
                    {formData.multiple_correct 
                      ? "(Clique no ícone ✓ para marcar/desmarcar respostas corretas)" 
                      : "(Clique no ícone ✓ para marcar a resposta correta)"}
                  </span>
                </Label>
                {formData.options.map((option, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Button
                      type="button"
                      variant={formData.correct_answers.includes(option) && option.trim() !== "" ? "default" : "outline"}
                      size="icon"
                      onClick={() => option.trim() !== "" && toggleCorrectAnswer(option)}
                      disabled={option.trim() === ""}
                      className={`flex-shrink-0 ${
                        formData.correct_answers.includes(option) && option.trim() !== "" 
                          ? 'bg-green-500 hover:bg-green-600 text-white' 
                          : 'hover:bg-green-50 hover:text-green-600'
                      }`}
                      title={formData.multiple_correct ? "Marcar/desmarcar como resposta correta" : "Marcar como resposta correta"}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                    <Input
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`Opção ${index + 1}`}
                      className={formData.correct_answers.includes(option) && option.trim() !== "" ? 'border-green-300 bg-green-50' : ''}
                    />
                    {formData.options.length > 2 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeOption(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addOption} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Opção
                </Button>
                {formData.correct_answers.length > 0 && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-800 mb-1">
                      ✓ {formData.multiple_correct ? "Respostas corretas:" : "Resposta correta:"}
                    </p>
                    <ul className="list-disc list-inside text-sm text-green-700">
                      {formData.correct_answers.map((answer, idx) => (
                        <li key={idx}>{answer}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Explicação</Label>
                <Textarea
                  value={formData.explanation}
                  onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
                  placeholder="Explicação detalhada do caso..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Achados Principais</Label>
                {formData.key_findings.map((finding, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={finding}
                      onChange={(e) => updateKeyFinding(index, e.target.value)}
                      placeholder={`Achado ${index + 1}`}
                    />
                    {formData.key_findings.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeKeyFinding(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addKeyFinding} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Achado
                </Button>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setShowDialog(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSave} 
                  className="bg-purple-600 hover:bg-purple-700 gap-2"
                  disabled={formData.correct_answers.length === 0 || formData.options.filter(o => o.trim() !== "").length < 2}
                >
                  <Save className="w-4 h-4" />
                  Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Image Selector Dialog */}
        <Dialog open={showImageSelector} onOpenChange={setShowImageSelector}>
          <DialogContent className="max-w-5xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Selecionar Imagem do Banco
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  value={imageSearchTerm}
                  onChange={(e) => setImageSearchTerm(e.target.value)}
                  placeholder="Buscar por descrição, indexador ou tags..."
                  className="pl-10"
                />
              </div>

              {/* Images Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-2">
                {filteredEcgImages.map((image) => (
                  <motion.div
                    key={image.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.02 }}
                    className="cursor-pointer"
                    onClick={() => handleSelectImage(image.image_url)}
                  >
                    <Card className="border-2 border-gray-200 hover:border-purple-500 transition-all duration-300">
                      <CardContent className="p-3">
                        <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-3">
                          <img
                            src={image.image_url}
                            alt={image.description}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <Badge className="bg-purple-100 text-purple-800 mb-2 text-xs">
                          {image.indexer}
                        </Badge>
                        <p className="text-xs text-gray-600 line-clamp-2">
                          {image.description}
                        </p>
                        {image.tags && image.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {image.tags.slice(0, 2).map((tag, index) => (
                              <Badge key={index} variant="outline" className="text-[10px] px-1 py-0">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}

                {filteredEcgImages.length === 0 && (
                  <div className="col-span-full text-center py-12">
                    <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">
                      {imageSearchTerm ? 'Nenhuma imagem encontrada' : 'Nenhuma imagem no banco'}
                    </h3>
                    <p className="text-gray-600 mb-4">
                      {imageSearchTerm
                        ? 'Tente buscar com outros termos'
                        : 'Adicione imagens ao banco primeiro'
                      }
                    </p>
                    {!imageSearchTerm && (
                      <Button
                        onClick={() => {
                          setShowImageSelector(false);
                          navigate(createPageUrl("AdminImages"));
                        }}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        Ir para Banco de Imagens
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}