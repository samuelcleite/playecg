import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  BookOpen,
  FolderOpen,
  Layers
} from "lucide-react";

export default function ConteudoECG() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState(null);
  const [module, setModule] = useState(null);
  const [phase, setPhase] = useState(null);
  const [contentType, setContentType] = useState(null);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const type = urlParams.get('type');
    const moduleId = urlParams.get('module_id');
    const phaseId = urlParams.get('phase_id');

    setContentType(type);

    if (type === 'intro') {
      // Buscar conteúdo de introdução
      const contents = await base44.entities.Content.list();
      const introContent = contents.find(c => !c.module_id && !c.phase_id);
      setContent(introContent);
    } else if (type === 'module' && moduleId) {
      // Buscar conteúdo do módulo
      const [contents, modules] = await Promise.all([
        base44.entities.Content.list(),
        base44.entities.Module.list()
      ]);
      
      const moduleContent = contents.find(c => c.module_id === moduleId && !c.phase_id);
      const moduleData = modules.find(m => m.id === moduleId);
      
      setContent(moduleContent);
      setModule(moduleData);
    } else if (type === 'phase' && moduleId && phaseId) {
      // Buscar conteúdo da fase
      const [contents, modules, phases] = await Promise.all([
        base44.entities.Content.list(),
        base44.entities.Module.list(),
        base44.entities.Phase.list()
      ]);
      
      const phaseContent = contents.find(c => c.module_id === moduleId && c.phase_id === phaseId);
      const moduleData = modules.find(m => m.id === moduleId);
      const phaseData = phases.find(p => p.id === phaseId);
      
      setContent(phaseContent);
      setModule(moduleData);
      setPhase(phaseData);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando conteúdo...</p>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Conteúdo não encontrado</h2>
            <p className="text-gray-600 mb-6">
              O conteúdo solicitado não está disponível.
            </p>
            <Button onClick={() => navigate(createPageUrl("AprendaECG"))}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getIcon = () => {
    if (contentType === 'intro') return <Sparkles className="w-6 h-6 text-white" />;
    if (contentType === 'module') return <FolderOpen className="w-6 h-6 text-white" />;
    if (contentType === 'phase') return <Layers className="w-6 h-6 text-white" />;
    return <BookOpen className="w-6 h-6 text-white" />;
  };

  const getTitle = () => {
    if (contentType === 'intro') return 'Introdução ao ECG';
    if (contentType === 'module') return module?.name || 'Módulo';
    if (contentType === 'phase') return phase?.name || 'Fase';
    return 'Conteúdo';
  };

  const getSubtitle = () => {
    if (contentType === 'intro') return 'Fundamentos essenciais';
    if (contentType === 'module') return 'Conteúdo do módulo';
    if (contentType === 'phase') return `${module?.name || 'Módulo'} - Fase ${phase?.order || ''}`;
    return '';
  };

  const getBgColor = () => {
    if (contentType === 'intro') return 'from-amber-400 to-orange-500';
    if (contentType === 'module') return 'from-indigo-500 to-purple-600';
    if (contentType === 'phase') return 'from-purple-500 to-pink-600';
    return 'from-blue-500 to-indigo-600';
  };

  const getBorderColor = () => {
    if (contentType === 'intro') return 'border-amber-300';
    if (contentType === 'module') return 'border-indigo-300';
    if (contentType === 'phase') return 'border-purple-300';
    return 'border-blue-300';
  };

  const getBgGradient = () => {
    if (contentType === 'intro') return 'from-amber-50 to-orange-50';
    if (contentType === 'module') return 'from-indigo-50 to-purple-50';
    if (contentType === 'phase') return 'from-purple-50 to-pink-50';
    return 'from-blue-50 to-indigo-50';
  };

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl("AprendaECG"))}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        </div>

        {/* Content Card */}
        <Card className={`border-2 ${getBorderColor()} shadow-xl bg-gradient-to-br ${getBgGradient()}`}>
          <CardContent className="p-8">
            {/* Title Section */}
            <div className="flex items-start gap-4 mb-6">
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${getBgColor()} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                {getIcon()}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {getTitle()}
                </h1>
                {getSubtitle() && (
                  <p className="text-gray-600">
                    {getSubtitle()}
                  </p>
                )}
              </div>
            </div>

            {/* Content Body */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div 
                className="prose prose-lg max-w-none text-gray-800"
                dangerouslySetInnerHTML={{ __html: content.content }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}