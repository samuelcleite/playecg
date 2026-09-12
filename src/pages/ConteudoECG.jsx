import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCurrentUser, clearCurrentUserCache } from '@/lib/currentUser';
import { comTimeout, descreverErro, detalheTecnico } from '@/lib/carregamento';
import {
  carregarIndiceDeConteudos,
  buscarConteudo,
  moduloEFases,
  conteudoDoModulo,
  ehIntroducao,
} from '@/lib/catalogoTrilha';
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import TelaDeAviso, { QuadroAviso } from "@/components/caso/TelaDeAviso";
import { BotaoPrincipal, BotaoSecundario } from "@/components/BarraDeAcao";
import { IconeQuadrado } from "@/components/Cartao";
import { useCorDaFaixa, FAIXA_BRANCA } from "@/lib/faixaTopo";
import { ESTILO_HTML } from "@/lib/estiloHtml";
import {
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Sparkles,
  BookOpen,
  FolderOpen,
  Layers,
  Lock
} from "lucide-react";

export default function ConteudoECG() {
  useCorDaFaixa(FAIXA_BRANCA);
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

    // Em todos os ramos, o corpo lido é o de UM conteúdo. O índice (id,
    // module_id, phase_id) e o catálogo de módulos/fases vêm do cache
    // compartilhado (catalogoTrilha.js): antes o ramo `intro` baixava o corpo
    // em HTML de TODOS os conteúdos do app para escolher um por `find`, e os
    // outros dois reliam módulo e fases que a trilha acabara de ler.
    if (type === 'intro') {
      const indice = await comTimeout(carregarIndiceDeConteudos(), undefined, 'conteúdos');
      const meta = indice.find(ehIntroducao);
      setContent(meta ? await comTimeout(buscarConteudo(meta.id), undefined, 'introdução') : null);
    } else if (type === 'module' && moduleId) {
      const [meta, { modulo }] = await Promise.all([
        comTimeout(conteudoDoModulo(moduleId), undefined, 'conteúdo do módulo'),
        comTimeout(moduloEFases(moduleId), undefined, 'lista de módulos')
      ]);

      setContent(meta ? await comTimeout(buscarConteudo(meta.id), undefined, 'conteúdo do módulo') : null);
      setModule(modulo);
    } else if (type === 'phase' && moduleId && phaseId) {
      // Aqui o filtro é exato (os dois campos são conhecidos) e volta um único
      // registro, então uma leitura basta — não precisa passar pelo índice.
      const [contents, { modulo, fases }] = await Promise.all([
        comTimeout(base44.entities.Content.filter({ module_id: moduleId, phase_id: phaseId }), undefined, 'conteúdo da fase'),
        comTimeout(moduloEFases(moduleId), undefined, 'lista de fases')
      ]);

      setContent(contents?.[0] || null);
      setModule(modulo);
      setPhase(fases.find(p => p.id === phaseId) || null);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="font-nunito flex min-h-full items-center justify-center bg-[#F4F6F8] py-24">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-ecg-midnight-2" />
          <p className="text-sm font-bold text-[#6B7785]">Carregando conteúdo...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <TelaDeAviso
        Icone={AlertTriangle}
        tom="ambar"
        titulo="Não foi possível abrir este conteúdo"
        texto={descreverErro(loadError)}
        acoes={
          <>
            <BotaoPrincipal
              onClick={() => {
                // Mesmo motivo do ModuleDetail: sem limpar, o retry reusa a
                // promessa pendurada do getCurrentUser.
                clearCurrentUserCache();
                setLoading(true);
                loadContent();
              }}
            >
              TENTAR NOVAMENTE
            </BotaoPrincipal>
            <BotaoSecundario to={createPageUrl("Modules")}>Voltar à trilha</BotaoSecundario>
          </>
        }
        rodape={detalheTecnico(loadError)}
      />
    );
  }

  const isPremium = user?.subscription_type === "premium";

  if (!isPremium) {
    return (
      <TelaDeAviso
        Icone={Lock}
        tom="escuro"
        titulo="Conteúdo Premium"
        texto="Este conteúdo educacional é exclusivo para usuários Premium."
        acoes={
          <>
            <BotaoPrincipal to={createPageUrl("Upgrade")}>ASSINAR PREMIUM</BotaoPrincipal>
            <BotaoSecundario to={createPageUrl("Dashboard")}>Voltar ao início</BotaoSecundario>
          </>
        }
      >
        <QuadroAviso tom="ambar">
          <p className="mb-1 font-extrabold">Com Premium você tem acesso a</p>
          <ul className="list-disc pl-5">
            <li>Conteúdo educacional completo sobre ECG</li>
            <li>Módulos estruturados por tema</li>
            <li>Acesso à teoria antes de cada fase</li>
            <li>Do básico ao avançado, em ordem</li>
          </ul>
        </QuadroAviso>
      </TelaDeAviso>
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
      <TelaDeAviso
        Icone={BookOpen}
        tom="cinza"
        titulo="Conteúdo não encontrado"
        texto="O conteúdo solicitado não está disponível."
        acoes={<BotaoPrincipal to={createPageUrl("AprendaECG")}>VOLTAR</BotaoPrincipal>}
      />
    );
  }

  const getIcone = () => {
    if (contentType === 'intro') return Sparkles;
    if (contentType === 'module') return FolderOpen;
    if (contentType === 'phase') return Layers;
    return BookOpen;
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

  // Um tom por tipo de conteúdo, na paleta do redesenho (ver Cartao.jsx).
  const getTom = () => {
    if (contentType === 'intro') return 'roxo';
    if (contentType === 'module') return 'escuro';
    if (contentType === 'phase') return 'azul';
    return 'azul';
  };

  const from = searchParams.get('from');
  const moduleId = searchParams.get('module_id');
  const phaseId = searchParams.get('phase_id');
  const caseId = searchParams.get('case_id');
  const isPhaseTransition = from === 'phase_transition';

  // Sem reserva de safe-area propria: esta tela passa pelo Layout, e o <main>
  // de la ja reservou o topo. Somar as duas dobrava o espaco.
  return (
    <div className="font-nunito min-h-full bg-[#F4F6F8]">
      <header className="sticky z-30 border-b border-[#E6EAEE] bg-white" style={{ top: 'var(--app-sticky-top, 0px)' }}>
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pb-3 pt-2.5">
          <button
            type="button"
            aria-label="Voltar"
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
            className="flex flex-none items-center gap-1 text-[13px] font-extrabold text-[#6B7785]"
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.5} />
            {isPhaseTransition ? 'Ver módulos' : 'Voltar'}
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3.5 px-4 pb-6 pt-3.5">
        {/* Phase Transition Banner */}
        {isPhaseTransition && (
          <section className="flex items-center gap-3.5 rounded-[20px] border border-[#CDEFD8] bg-[#E6F9EC] p-4">
            <IconeQuadrado Icone={BookOpen} tom="verde" tamanho={46} />
            <div className="min-w-0">
              <p className="text-[15px] font-black text-[#15803D]">Nova fase desbloqueada! 🎉</p>
              <p className="mt-0.5 text-xs font-semibold text-[#2F7A4F]">
                Leia o conteúdo abaixo antes de começar as questões.
              </p>
            </div>
          </section>
        )}

        <section className="rounded-[20px] border border-[#E6EAEE] bg-white p-[18px]">
          <div className="mb-4 flex items-start gap-3.5">
            <IconeQuadrado Icone={getIcone()} tom={getTom()} tamanho={46} />
            <div className="min-w-0">
              <h1 className="text-xl font-black leading-tight text-ecg-midnight">{getTitle()}</h1>
              {getSubtitle() && (
                <p className="mt-0.5 text-[13px] font-semibold text-[#6B7785]">{getSubtitle()}</p>
              )}
            </div>
          </div>

          <div
            className={`text-sm font-semibold leading-relaxed text-[#40505F] ${ESTILO_HTML}`}
            dangerouslySetInnerHTML={{ __html: content.content }}
          />
        </section>

        {/* CTA para iniciar a fase após ler o conteúdo */}
        {isPhaseTransition && moduleId && phaseId && (
          <BotaoPrincipal
            onClick={() => navigate(`${createPageUrl("ModuleDetail")}?module_id=${moduleId}&phase_id=${phaseId}&from=content`)}
          >
            COMEÇAR A FASE
          </BotaoPrincipal>
        )}
      </div>
    </div>
  );
}