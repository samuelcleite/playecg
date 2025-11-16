import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
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
  BookOpen,
  Pencil,
  Loader2,
  FileText,
  Layers,
  Save,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AdminContent() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [modules, setModules] = useState([]);
  const [phases, setPhases] = useState([]);
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [selectedPhaseId, setSelectedPhaseId] = useState("");
  const [contentText, setContentText] = useState("");
  const [saving, setSaving] = useState(false);
  const [isIntroduction, setIsIntroduction] = useState(false);

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

    const modulesData = await base44.entities.Module.list("order");
    setModules(modulesData);

    const phasesData = await base44.entities.Phase.list("order");
    setPhases(phasesData);

    const contentsData = await base44.entities.Content.list();
    setContents(contentsData);

    setLoading(false);
  };

  const getModuleName = (moduleId) => {
    return modules.find(m => m.id === moduleId)?.name || "Módulo";
  };

  const getPhaseName = (phaseId) => {
    return phases.find(p => p.id === phaseId)?.name || "Fase";
  };

  const getContent = (moduleId, phaseId = null) => {
    return contents.find(c => 
      c.module_id === moduleId && 
      (phaseId ? c.phase_id === phaseId : !c.phase_id)
    );
  };

  const getIntroductionContent = () => {
    return contents.find(c => !c.module_id && !c.phase_id);
  };

  const handleOpenDialog = (moduleId = null, phaseId = null, introduction = false) => {
    if (introduction) {
      const existingContent = getIntroductionContent();
      setEditingContent(existingContent || null);
      setSelectedModuleId("");
      setSelectedPhaseId("");
      setContentText(existingContent?.content || "");
      setIsIntroduction(true);
    } else {
      const existingContent = getContent(moduleId, phaseId);
      setEditingContent(existingContent || null);
      setSelectedModuleId(moduleId);
      setSelectedPhaseId(phaseId || "");
      setContentText(existingContent?.content || "");
      setIsIntroduction(false);
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!contentText.trim()) {
      alert("Digite o conteúdo educacional");
      return;
    }

    setSaving(true);

    const dataToSave = {
      module_id: isIntroduction ? null : selectedModuleId,
      phase_id: isIntroduction ? null : (selectedPhaseId || null),
      content: contentText
    };

    try {
      if (editingContent) {
        await base44.entities.Content.update(editingContent.id, dataToSave);
      } else {
        await base44.entities.Content.create(dataToSave);
      }

      setShowDialog(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const phasesByModule = modules.map(module => ({
    module,
    phases: phases.filter(p => p.module_id === module.id)
  }));

  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'color': [] }, { 'background': [] }],
      ['link'],
      ['clean']
    ]
  };

  const quillFormats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet',
    'color', 'background',
    'link'
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
      </div>
    );
  }

  const introContent = getIntroductionContent();

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <FileText className="w-8 h-8 text-purple-600" />
              Gestão de Conteúdo
            </h1>
            <p className="text-gray-600 mt-2">
              Configure os conteúdos educacionais dos módulos e fases
            </p>
          </div>
        </div>

        <Alert className="bg-blue-50 border-blue-200">
          <AlertCircle className="w-5 h-5 text-blue-600" />
          <AlertDescription className="text-blue-900">
            Os conteúdos aparecem como orientação para os usuários ao iniciarem uma fase pela primeira vez (0% de progresso).
          </AlertDescription>
        </Alert>

        {/* Introduction Section */}
        <Card className="border-2 border-amber-200 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-600" />
              Introdução ao ECG
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border-l-4 border-amber-300 pl-4 py-2 bg-white rounded-r-lg">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Conteúdo Introdutório Geral
                  </p>
                  {introContent ? (
                    <div className="text-sm text-gray-600 mt-1" dangerouslySetInnerHTML={{ __html: introContent.content.substring(0, 100) + '...' }} />
                  ) : (
                    <p className="text-sm text-gray-500 mt-1">Nenhum conteúdo cadastrado</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenDialog(null, null, true)}
                  className="border-amber-300 hover:bg-amber-50 gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  {introContent ? 'Editar' : 'Adicionar'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content List */}
        <div className="space-y-6">
          {phasesByModule.map((group) => (
            <Card key={group.module.id} className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-indigo-600" />
                  {group.module.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Module Content */}
                <div className="border-l-4 border-indigo-300 pl-4 py-2 bg-indigo-50 rounded-r-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        Conteúdo do Módulo
                      </p>
                      {getContent(group.module.id) ? (
                        <div className="text-sm text-gray-600 mt-1" dangerouslySetInnerHTML={{ __html: getContent(group.module.id).content.substring(0, 100) + '...' }} />
                      ) : (
                        <p className="text-sm text-gray-500 mt-1">Nenhum conteúdo cadastrado</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDialog(group.module.id)}
                      className="border-indigo-200 hover:bg-indigo-50 gap-2"
                    >
                      <Pencil className="w-4 h-4" />
                      {getContent(group.module.id) ? 'Editar' : 'Adicionar'}
                    </Button>
                  </div>
                </div>

                {/* Phases Content */}
                {group.phases.length > 0 && (
                  <div className="space-y-2 pl-4">
                    <p className="text-sm font-semibold text-gray-700 flex items-center gap-2 mt-4">
                      <Layers className="w-4 h-4" />
                      Fases
                    </p>
                    {group.phases.map((phase) => (
                      <div key={phase.id} className="border-l-4 border-purple-300 pl-4 py-2 bg-purple-50 rounded-r-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{phase.name}</p>
                            {getContent(group.module.id, phase.id) ? (
                              <div className="text-sm text-gray-600 mt-1" dangerouslySetInnerHTML={{ __html: getContent(group.module.id, phase.id).content.substring(0, 80) + '...' }} />
                            ) : (
                              <p className="text-sm text-gray-500 mt-1">Nenhum conteúdo cadastrado</p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDialog(group.module.id, phase.id)}
                            className="border-purple-200 hover:bg-purple-50 gap-2"
                          >
                            <Pencil className="w-4 h-4" />
                            {getContent(group.module.id, phase.id) ? 'Editar' : 'Adicionar'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {modules.length === 0 && (
            <Card className="border-none shadow-lg">
              <CardContent className="p-12 text-center">
                <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Nenhum módulo cadastrado
                </h3>
                <p className="text-gray-600">
                  Cadastre módulos primeiro para adicionar conteúdos
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingContent ? "Editar Conteúdo" : "Adicionar Conteúdo"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                {isIntroduction ? (
                  <Badge className="bg-amber-100 text-amber-800">
                    Introdução ao ECG
                  </Badge>
                ) : (
                  <>
                    <Badge className="bg-indigo-100 text-indigo-800">
                      {getModuleName(selectedModuleId)}
                    </Badge>
                    {selectedPhaseId && (
                      <Badge className="bg-purple-100 text-purple-800">
                        {getPhaseName(selectedPhaseId)}
                      </Badge>
                    )}
                  </>
                )}
              </div>

              <Label htmlFor="content">Conteúdo Educacional *</Label>
              <div className="border rounded-md">
                <ReactQuill
                  theme="snow"
                  value={contentText}
                  onChange={setContentText}
                  modules={quillModules}
                  formats={quillFormats}
                  placeholder="Digite o conteúdo que será exibido como orientação para os alunos..."
                  style={{ minHeight: '300px' }}
                />
              </div>
              <p className="text-xs text-gray-500">
                {isIntroduction 
                  ? "Este conteúdo será exibido como introdução geral ao ECG."
                  : `Este conteúdo será exibido como guia quando o usuário abrir ${selectedPhaseId ? "esta fase" : "este módulo"} pela primeira vez.`
                }
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700 gap-2" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar Conteúdo
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}