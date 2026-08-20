import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCurrentUser, clearCurrentUserCache } from '@/lib/currentUser';
import { comTimeout, descreverErro, detalheTecnico } from '@/lib/carregamento';
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Sparkles,
  BookOpen,
  FolderOpen,
  Layers,
  Crown,
  Lock
} from "lucide-react";
import { Link } from "react-router-dom";

export default function ConteudoECG() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Mesma correção do ModuleDetail: esta tela é o destino do desvio para a
  // teoria, então herdava o mesmo spinner eterno em qualquer falha de rede.
  const [loadError, setLoadError] = useState(null);
  const [content, setContent] = useState(null);
  const [module, setModule] = useState(null);
  const [phase, setPhase] = useState(null);
  const [contentType, setContentType] = useState(null);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      setLoadError(null);
      await executarCarga();
    } catch (error) {
      console.error('ConteudoECG: falha ao carregar', error);
      setLoadError(error);
      setLoading(false);
    }
  };

  const executarCarga = async () => {
    const userData = await comTimeout(getCurrentUser(), undefined, 'sua conta');
    if (!userData) {
      const erro = new Error('Não foi possível carregar sua conta.');
      erro.code = 'sem_conta';
      throw erro;
    }
    setUser(userData);

    const type = searchParams.get('type');
    const moduleId = searchParams.get('module_id');
    const phaseId = searchParams.get('phase_id');

    setContentType(type);

    if (type === 'intro') {
      // Buscar conteúdo de introdução
      const contents = await comTimeout(base44.entities.Content.list(), undefined, 'conteúdos');
      const introContent = contents.find(c => !c.module_id && !c.phase_id);
      setContent(introContent);
    } else if (type === 'module' && moduleId) {
      // Buscar conteúdo do módulo
      // filter em vez de list: antes vinha o corpo em HTML de TODOS os
      // conteúdos do app para escolher um por find. Agora voltam só os deste
      // módulo — o geral mais os das fases — e o find local separa o geral,
      // que é justamente o que não tem phase_id.
      const [contents, modules] = await Promise.all([
        comTimeout(base44.entities.Content.filter({ module_id: moduleId }), undefined, 'conteúdo do módulo'),
        comTimeout(base44.entities.Module.filter({ id: moduleId }), undefined, 'lista de módulos')
      ]);

      const moduleContent = contents.find(c => !c.phase_id);
      const moduleData = modules.find(m => m.id === moduleId);
      
      setContent(moduleContent);
      setModule(moduleData);
    } else if (type === 'phase' && moduleId && phaseId) {
      // Buscar conteúdo da fase
      // Mesmo motivo do ramo acima, e aqui o filtro é exato: os dois campos
      // são conhecidos, então volta só o conteúdo desta fase. É o mesmo
      // Content.filter que o Quiz já usa para carregar o conteúdo de um caso.
      const [contents, modules, phases] = await Promise.all([
        comTimeout(base44.entities.Content.filter({ module_id: moduleId, phase_id: phaseId }), undefined, 'conteúdo da fase'),
        // Mesma troca do ModuleDetail: só o módulo e as fases desta trilha, em
        // vez do catálogo inteiro para escolher um de cada por `.find`.
        comTimeout(base44.entities.Module.filter({ id: moduleId }), undefined, 'lista de módulos'),
        comTimeout(base44.entities.Phase.filter({ module_id: moduleId }), undefined, 'lista de fases')
      ]);

      const phaseContent = contents?.[0] || null;
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

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-2 border-amber-200 shadow-xl">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Não foi possível abrir este conteúdo
            </h2>
            <p className="text-gray-600 mb-6">{descreverErro(loadError)}</p>
            <div className="space-y-3">
              <Button
                onClick={() => {
                  // Mesmo motivo do ModuleDetail: sem limpar, o retry reusa a
                  // promessa pendurada do getCurrentUser.
                  clearCurrentUserCache();
                  setLoading(true);
                  loadContent();
                }}
                className="w-full bg-[#0D3B66] hover:bg-[#1976D2] text-white gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Tentar novamente
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(createPageUrl("Modules"))}
                className="w-full gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar à trilha
              </Button>
            </div>
            <p className="mt-6 text-xs text-gray-400 break-words">
              {detalheTecnico(loadError)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPremium = user?.subscription_type === "premium";

  if (!isPremium) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <Card className="max-w-lg border-2 border-amber-200 shadow-xl">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Lock className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Conteúdo Premium
            </h2>
            <p className="text-gray-600 mb-6 text-lg">
              Este conteúdo educacional é exclusivo para usuários Premium.
            </p>
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center justify-center gap-2">
                <Crown className="w-5 h-5 text-amber-600" />
                Com Premium você tem acesso a:
              </h3>
              <ul className="text-left space-y-2 text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>Conteúdo educacional completo sobre ECG</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>Módulos estruturados por tema</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>Acesso à teoria antes de cada fase</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>Do básico ao avançado, em ordem</span>
                </li>
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <Link to={createPageUrl("Upgrade")} className="w-full">
                <Button className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-lg py-6 gap-2">
                  <Crown className="w-5 h-5" />
                  Assinar Premium
                </Button>
              </Link>
              <Button variant="outline" onClick={() => navigate(createPageUrl("Dashboard"))}>
                Voltar ao Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!content) {
    // Se veio de uma transição de fase e não há conteúdo, redirecionar direto para o quiz
    const fromCheck = searchParams.get('from');
    const moduleIdCheck = searchParams.get('module_id');
    const phaseIdCheck = searchParams.get('phase_id');

    if (fromCheck === 'phase_transition' && moduleIdCheck && phaseIdCheck) {
      navigate(`${createPageUrl("ModuleDetail")}?module_id=${moduleIdCheck}&phase_id=${phaseIdCheck}&from=content`, { replace: true });
      return null;
    }

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

  const from = searchParams.get('from');
  const moduleId = searchParams.get('module_id');
  const phaseId = searchParams.get('phase_id');
  const caseId = searchParams.get('case_id');
  const isPhaseTransition = from === 'phase_transition';

  return (
    <div className="min-h-screen p-6 md:p-8 pb-28 md:pb-8" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => {
              if (isPhaseTransition) {
                navigate(createPageUrl("Modules"));
              } else if (from === 'quiz') {
                const url = caseId
                  ? `${createPageUrl("Quiz")}?case_id=${caseId}`
                  : createPageUrl("Quiz");
                navigate(url);
              } else if (from === 'module' && moduleId && phaseId) {
                let backUrl = `${createPageUrl("ModuleDetail")}?module_id=${moduleId}&phase_id=${phaseId}&from=content`;
                if (caseId) backUrl += `&case_id=${caseId}`;
                navigate(backUrl);
              } else {
                navigate(createPageUrl("AprendaECG"));
              }
            }}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {isPhaseTransition ? 'Ver Módulos' : 'Voltar'}
          </Button>
        </div>

        {/* Phase Transition Banner */}
        {isPhaseTransition && (
          <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-green-900 text-lg">Nova fase desbloqueada! 🎉</p>
              <p className="text-green-700 text-sm">Leia o conteúdo abaixo antes de começar as questões.</p>
            </div>
          </div>
        )}

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

            {/* CTA para iniciar a fase após ler o conteúdo */}
            {isPhaseTransition && moduleId && phaseId && (
              <div className="mt-8 pt-6 border-t border-gray-200">
                <Button
                  onClick={() => navigate(`${createPageUrl("ModuleDetail")}?module_id=${moduleId}&phase_id=${phaseId}&from=content`)}
                  className="w-full bg-[#22C55E] hover:bg-green-600 text-white py-6 text-lg font-semibold gap-2 whitespace-normal h-auto text-center"
                  size="lg"
                >
                  Começar Fase: {phase?.name}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}