import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BookOpen,
  Loader2,
  Sparkles,
  FolderOpen,
  Layers,
  ChevronRight,
  Crown,
  Lock
} from "lucide-react";
import { motion } from "framer-motion";

export default function AprendaECG() {
  const [loading, setLoading] = useState(true);
  const [introContent, setIntroContent] = useState(null);
  const [moduleContents, setModuleContents] = useState([]);
  const [modules, setModules] = useState([]);
  const [phases, setPhases] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [contentsData, modulesData, phasesData] = await Promise.all([
      base44.entities.Content.list(),
      base44.entities.Module.list("order"),
      base44.entities.Phase.list("order")
    ]);

    // Separar introdução
    const intro = contentsData.find(c => !c.module_id && !c.phase_id);
    setIntroContent(intro);

    // Organizar conteúdos por módulo
    const contentsByModule = {};
    
    contentsData.forEach(content => {
      if (content.module_id) {
        if (!contentsByModule[content.module_id]) {
          contentsByModule[content.module_id] = {
            moduleContent: null,
            phaseContents: []
          };
        }

        if (!content.phase_id) {
          contentsByModule[content.module_id].moduleContent = content;
        } else {
          contentsByModule[content.module_id].phaseContents.push(content);
        }
      }
    });

    setModuleContents(contentsByModule);
    setModules(modulesData);
    setPhases(phasesData);
    setLoading(false);
  };

  const getModuleName = (moduleId) => {
    const module = modules.find(m => m.id === moduleId);
    return module?.name || "Módulo";
  };

  const getPhaseName = (phaseId) => {
    const phase = phases.find(p => p.id === phaseId);
    return phase?.name || "Fase";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando conteúdos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Aprenda ECG
          </h1>
          <p className="text-gray-600 text-lg">
            Todo o conteúdo educacional organizado para você
          </p>
        </div>

        {/* Introdução ao ECG */}
        {introContent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link to={`${createPageUrl("ConteudoECG")}?type=intro`}>
              <Card className="border-2 border-amber-300 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 hover:shadow-xl transition-all cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">
                          Introdução ao ECG
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Fundamentos essenciais para começar
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-6 h-6 text-amber-600" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        )}

        {/* Conteúdos por Módulo */}
        <div className="space-y-6">
          {modules.map((module, index) => {
            const moduleData = moduleContents[module.id];
            if (!moduleData) return null;

            const modulePhasesOrdered = phases
              .filter(p => p.module_id === module.id)
              .sort((a, b) => a.order - b.order);

            return (
              <motion.div
                key={module.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="border-none shadow-lg">
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="module" className="border-none">
                      <AccordionTrigger className="hover:no-underline px-6 py-4 bg-gradient-to-r from-indigo-50 to-purple-50">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                            {module.order}
                          </div>
                          <div className="text-left">
                            <div className="flex items-center gap-2">
                              <FolderOpen className="w-5 h-5 text-indigo-600" />
                              <h3 className="text-xl font-bold text-gray-900">{module.name}</h3>
                            </div>
                            {module.description && (
                              <p className="text-sm text-gray-600 mt-1">
                                {module.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-6 pt-4">
                        <div className="space-y-3">
                          {/* Link para Conteúdo Geral do Módulo */}
                          {moduleData.moduleContent && (
                            <Link to={`${createPageUrl("ConteudoECG")}?type=module&module_id=${module.id}`}>
                              <div className="p-4 border-2 border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all cursor-pointer">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <BookOpen className="w-5 h-5 text-indigo-600" />
                                    <div>
                                      <p className="font-semibold text-gray-900">Conteúdo do Módulo</p>
                                      <p className="text-sm text-gray-600">Visão geral e fundamentos</p>
                                    </div>
                                  </div>
                                  <ChevronRight className="w-5 h-5 text-indigo-600" />
                                </div>
                              </div>
                            </Link>
                          )}

                          {/* Links para Conteúdos por Fase */}
                          {moduleData.phaseContents.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="font-semibold text-gray-900 flex items-center gap-2 mt-4 mb-2">
                                <Layers className="w-5 h-5 text-purple-600" />
                                Fases do Módulo
                              </h4>
                              {modulePhasesOrdered.map(phase => {
                                const phaseContent = moduleData.phaseContents.find(
                                  pc => pc.phase_id === phase.id
                                );
                                
                                if (!phaseContent) return null;

                                return (
                                  <Link 
                                    key={phase.id}
                                    to={`${createPageUrl("ConteudoECG")}?type=phase&module_id=${module.id}&phase_id=${phase.id}`}
                                  >
                                    <div className="p-4 border-2 border-purple-200 rounded-lg hover:bg-purple-50 transition-all cursor-pointer">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-sm">
                                            {phase.order}
                                          </div>
                                          <div>
                                            <p className="font-semibold text-gray-900">{phase.name}</p>
                                            <p className="text-sm text-gray-600">Conteúdo da fase</p>
                                          </div>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-purple-600" />
                                      </div>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Empty State */}
        {!introContent && modules.length === 0 && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Nenhum conteúdo disponível
              </h3>
              <p className="text-gray-600">
                Os conteúdos educacionais serão adicionados em breve!
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}