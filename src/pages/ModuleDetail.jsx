import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import TopBar from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  CheckCircle2, 
  XCircle,
  Loader2,
  Lightbulb,
  Trophy,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Pencil,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  BookOpen
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";

export default function ModuleDetail() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [module, setModule] = useState(null);
  const [phase, setPhase] = useState(null);
  const [cases, setCases] = useState([]);
  const [currentCaseIndex, setCurrentCaseIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attemptCount, setAttemptCount] = useState(0);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [completedCasesCount, setCompletedCasesCount] = useState(0);
  const [sessionCompletedCases, setSessionCompletedCases] = useState([]);

  // Zoom states
  const [showZoom, setShowZoom] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState(0);

  // Report Error states
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportErrorType, setReportErrorType] = useState("");
  const [reportErrorDescription, setReportErrorDescription] = useState("");
  const [reportingError, setReportingError] = useState(false);
  const [phaseContent, setPhaseContent] = useState(null);
  const [showPhaseCompletion, setShowPhaseCompletion] = useState(false);
  const [nextPhase, setNextPhase] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (showPhaseCompletion && module && phase) {
      findNextPhase();
    }
  }, [showPhaseCompletion, module, phase]);

  const findNextPhase = async () => {
    const phasesData = await base44.entities.Phase.list();
    const modulePhasesOrdered = phasesData
      .filter(p => p.module_id === module.id)
      .sort((a, b) => a.order - b.order);
    
    const currentPhaseIndex = modulePhasesOrdered.findIndex(p => p.id === phase.id);
    if (currentPhaseIndex !== -1 && currentPhaseIndex < modulePhasesOrdered.length - 1) {
      setNextPhase(modulePhasesOrdered[currentPhaseIndex + 1]);
    }
  };

  const loadData = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const moduleId = urlParams.get('module_id');
    const phaseId = urlParams.get('phase_id');

    if (!moduleId || !phaseId) {
      navigate(createPageUrl("Modules"));
      return;
    }

    const userData = await base44.auth.me();
    setUser(userData);

    const moduleData = await base44.entities.Module.list();
    const foundModule = moduleData.find(m => m.id === moduleId);
    if (!foundModule) {
      navigate(createPageUrl("Modules"));
      return;
    }
    setModule(foundModule);

    const phaseData = await base44.entities.Phase.list();
    const foundPhase = phaseData.find(p => p.id === phaseId);
    if (!foundPhase) {
      navigate(createPageUrl("Modules"));
      return;
    }
    setPhase(foundPhase);

    // Buscar tentativas do usuário nesta fase para calcular progresso
    const allUserAttempts = await base44.entities.QuizAttempt.filter({ 
      user_email: userData.email,
      module_id: moduleId,
      phase_id: phaseId
    }, "-created_date", 1000);
    const attempts = allUserAttempts.filter(a => a.quiz_type === "module");

    // Calcular casos únicos completados (acertou ou esgotou tentativas)
    const completedCaseIds = [];
    const attemptsByCase = {};

    attempts.forEach(att => {
      if (!attemptsByCase[att.case_id]) {
        attemptsByCase[att.case_id] = [];
      }
      attemptsByCase[att.case_id].push(att);
    });

    // Um caso é considerado completado se: acertou ou tem 3+ tentativas
    Object.keys(attemptsByCase).forEach(caseId => {
      const caseAttempts = attemptsByCase[caseId];
      const hasCorrect = caseAttempts.some(a => a.correct);
      const hasThreeAttempts = caseAttempts.length >= 3;
      
      if (hasCorrect || hasThreeAttempts) {
        completedCaseIds.push(caseId);
      }
    });

    setCompletedCasesCount(completedCaseIds.length);

    // Selecionar e combinar casos (80% fase atual + 20% fases anteriores)
    const combinedCases = await selectAndCombineCases(
      moduleId, 
      phaseId, 
      foundPhase, 
      phaseData, 
      completedCaseIds
    );
    setCases(combinedCases);

    // Buscar conteúdo da fase
    const contents = await base44.entities.Content.list();
    const phaseContentData = contents.find(c => c.module_id === moduleId && c.phase_id === phaseId);
    setPhaseContent(phaseContentData);

    setLoading(false);
  };

  const selectAndCombineCases = async (moduleId, phaseId, currentPhase, allPhases, completedCaseIds) => {
    // Identificar fases anteriores
    const modulePhasesOrdered = allPhases
      .filter(p => p.module_id === moduleId)
      .sort((a, b) => a.order - b.order);
    
    const previousPhases = modulePhasesOrdered.filter(p => p.order < currentPhase.order);

    // Buscar casos da fase atual
    const currentPhaseCases = await base44.entities.ECGCase.filter({ 
      module_id: moduleId,
      phase_id: phaseId 
    });

    // Buscar casos de fases anteriores
    let previousPhasesCases = [];
    for (const prevPhase of previousPhases) {
      const cases = await base44.entities.ECGCase.filter({
        module_id: moduleId,
        phase_id: prevPhase.id
      });
      previousPhasesCases = [...previousPhasesCases, ...cases];
    }

    // Sempre fornecer 10 casos
    const totalCasesForSession = 10;
    const numCasesFromCurrent = 8; // 80%
    const numCasesFromPrevious = 2; // 20%

    // Filtrar casos únicos (não completados) da fase atual
    const uniqueCurrentCases = currentPhaseCases.filter(c => !completedCaseIds.includes(c.id));
    const uniquePreviousCases = previousPhasesCases.filter(c => !completedCaseIds.includes(c.id));

    // Selecionar casos da fase atual (priorizar únicos)
    const selectedCurrentCases = [];
    if (currentPhaseCases.length > 0) {
      // Primeiro pegar casos únicos embaralhados
      const shuffledUniqueCurrent = shuffleArray([...uniqueCurrentCases]);
      
      // Preencher com casos únicos até ter numCasesFromCurrent ou acabarem os únicos
      for (let i = 0; i < Math.min(numCasesFromCurrent, shuffledUniqueCurrent.length); i++) {
        selectedCurrentCases.push({ ...shuffledUniqueCurrent[i], caseSource: 'current_phase' });
      }
      
      // Se não houver casos únicos suficientes, permitir repetições
      while (selectedCurrentCases.length < numCasesFromCurrent) {
        const randomCase = currentPhaseCases[Math.floor(Math.random() * currentPhaseCases.length)];
        selectedCurrentCases.push({ ...randomCase, caseSource: 'current_phase' });
      }
    }

    // Selecionar casos de fases anteriores (priorizar únicos)
    const selectedPreviousCases = [];
    if (previousPhasesCases.length > 0) {
      // Primeiro pegar casos únicos embaralhados
      const shuffledUniquePrevious = shuffleArray([...uniquePreviousCases]);
      
      // Preencher com casos únicos até ter numCasesFromPrevious ou acabarem os únicos
      for (let i = 0; i < Math.min(numCasesFromPrevious, shuffledUniquePrevious.length); i++) {
        selectedPreviousCases.push({ ...shuffledUniquePrevious[i], caseSource: 'previous_phase' });
      }
      
      // Se não houver casos únicos suficientes, permitir repetições
      while (selectedPreviousCases.length < numCasesFromPrevious) {
        const randomCase = previousPhasesCases[Math.floor(Math.random() * previousPhasesCases.length)];
        selectedPreviousCases.push({ ...randomCase, caseSource: 'previous_phase' });
      }
    } else if (currentPhaseCases.length > 0) {
      // Se não há fases anteriores, preencher com casos da fase atual
      const shuffledUniqueCurrent = shuffleArray([...uniqueCurrentCases]);
      
      for (let i = 0; i < Math.min(numCasesFromPrevious, shuffledUniqueCurrent.length); i++) {
        selectedCurrentCases.push({ ...shuffledUniqueCurrent[i], caseSource: 'current_phase' });
      }
      
      while (selectedCurrentCases.length < numCasesFromCurrent + numCasesFromPrevious) {
        const randomCase = currentPhaseCases[Math.floor(Math.random() * currentPhaseCases.length)];
        selectedCurrentCases.push({ ...randomCase, caseSource: 'current_phase' });
      }
    }

    // Combinar e embaralhar
    const combinedCases = shuffleArray([...selectedCurrentCases, ...selectedPreviousCases]);

    return combinedCases;
  };

  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const currentCase = cases[currentCaseIndex];

  const handleAnswerToggle = (answer) => {
    if (showResult && (isCorrect || showCorrectAnswer)) return;

    if (currentCase.multiple_correct) {
      if (selectedAnswers.includes(answer)) {
        setSelectedAnswers(selectedAnswers.filter(a => a !== answer));
      } else {
        setSelectedAnswers([...selectedAnswers, answer]);
      }
    } else {
      setSelectedAnswers([answer]);
    }
  };

  const handleSubmitAnswer = async () => {
    if (selectedAnswers.length === 0) return;

    const correctAnswers = currentCase.correct_answers && currentCase.correct_answers.length > 0
      ? currentCase.correct_answers
      : [currentCase.correct_diagnosis];

    let correct = false;
    if (currentCase.multiple_correct) {
      const selectedSet = new Set(selectedAnswers);
      const correctSet = new Set(correctAnswers);
      correct = selectedSet.size === correctSet.size &&
                [...selectedSet].every(ans => correctSet.has(ans));
    } else {
      correct = selectedAnswers.length === 1 && correctAnswers.includes(selectedAnswers[0]);
    }

    setIsCorrect(correct);
    setShowResult(true);

    const newAttemptCount = attemptCount + 1;
    setAttemptCount(newAttemptCount);

    // Mostrar resposta correta após 3 tentativas erradas
    if (!correct && newAttemptCount >= 3) {
      setShowCorrectAnswer(true);
    }

    // Se acertou ou já tentou 3 vezes, registrar
    if (correct || newAttemptCount >= 3) {
      await base44.entities.QuizAttempt.create({
        user_email: user.email,
        case_id: currentCase.id,
        module_id: currentCase.module_id,
        phase_id: currentCase.phase_id,
        user_answer: selectedAnswers.join(", "),
        correct: correct,
        quiz_type: "module",
        case_source: currentCase.caseSource
      });

      // Verificar se já completou esse caso nesta sessão
      if (!sessionCompletedCases.includes(currentCase.id)) {
        const updatedSessionCompleted = [...sessionCompletedCases, currentCase.id];
        setSessionCompletedCases(updatedSessionCompleted);

        const newCompletedCount = completedCasesCount + 1;
        setCompletedCasesCount(newCompletedCount);
      }
    }
  };

  const handleTryAgain = () => {
    setShowResult(false);
    setSelectedAnswers([]);
  };

  const handleNextCase = () => {
    if (currentCaseIndex < cases.length - 1) {
      setCurrentCaseIndex(currentCaseIndex + 1);
      setSelectedAnswers([]);
      setShowResult(false);
      setAttemptCount(0);
      setShowCorrectAnswer(false);
    } else {
      // Ao finalizar as 10 questões, mostrar tela de conclusão
      setShowPhaseCompletion(true);
    }
  };

  // Zoom functions
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const newZoom = Math.max(prev - 0.5, 1);
      if (newZoom <= 1.5) {
        setPosition({ x: 0, y: 0 });
      }
      return newZoom;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e) => {
    if (zoomLevel > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && zoomLevel > 1) {
      e.preventDefault();
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const getTouchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1 && zoomLevel > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y
      });
    } else if (e.touches.length === 2) {
      e.preventDefault();
      const distance = getTouchDistance(e.touches);
      setLastTouchDistance(distance);
      setIsDragging(false);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isDragging && zoomLevel > 1) {
      e.preventDefault();
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      });
    } else if (e.touches.length === 2) {
      e.preventDefault();
      const distance = getTouchDistance(e.touches);
      if (lastTouchDistance > 0) {
        const scale = distance / lastTouchDistance;
        setZoomLevel((prev) => {
          const newZoom = prev * scale;
          const clampedZoom = Math.max(1, Math.min(4, newZoom));
          if (clampedZoom <= 1.5) {
            setPosition({ x: 0, y: 0 });
          }
          return clampedZoom;
        });
      }
      setLastTouchDistance(distance);
      setIsDragging(false);
    }
  };

  const handleTouchEnd = (e) => {
    setIsDragging(false);
    if (e.touches.length < 2) {
      setLastTouchDistance(0);
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoomLevel((prev) => {
      const newZoom = prev + delta;
      const clampedZoom = Math.max(1, Math.min(4, newZoom));
      if (clampedZoom <= 1.5) {
        setPosition({ x: 0, y: 0 });
      }
      return clampedZoom;
    });
  };

  const openZoom = () => {
    setShowZoom(true);
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
  };

  const closeZoom = () => {
    setShowZoom(false);
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
    setLastTouchDistance(0);
  };

  const handleReportError = async () => {
    if (!reportErrorDescription.trim()) {
      return;
    }

    setReportingError(true);
    try {
      await base44.functions.invoke('reportCaseError', {
        case_id: currentCase.id,
        case_title: currentCase.title,
        error_description: reportErrorDescription,
        error_type: reportErrorType
      });

      setShowReportDialog(false);
      setReportErrorType("");
      setReportErrorDescription("");
      alert("Erro reportado com sucesso! Obrigado pelo feedback.");
    } catch (error) {
      console.error("Error reporting case:", error);
      alert("Erro ao reportar. Tente novamente.");
    } finally {
      setReportingError(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando módulo...</p>
        </div>
      </div>
    );
  }

  // Tela de conclusão da fase
  if (showPhaseCompletion) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl border-none shadow-2xl">
          <CardContent className="p-6 md:p-12 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.6 }}
            >
              <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Trophy className="w-12 h-12 text-white" />
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="text-4xl font-bold mb-4 text-gray-900">
                🎉 Parabéns!
              </h2>
              <h3 className="text-2xl font-semibold mb-2 text-gray-800">
                Fase Concluída!
              </h3>
              <p className="text-xl text-gray-600 mb-6">
                Você completou a fase <span className="font-bold text-[#22C55E]">{phase?.name}</span> do módulo <span className="font-bold text-[#1976D2]">{module?.name}</span>
              </p>
              
              <div className="bg-blue-50 rounded-xl p-6 mb-8">
                <p className="text-lg text-gray-700 mb-2">
                  <span className="font-bold text-2xl text-green-600">10</span> casos completados
                </p>
                <p className="text-sm text-gray-600">
                  Continue sua jornada nas próximas fases!
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {nextPhase ? (
                  <>
                    <Button
                      onClick={() => window.location.href = `${createPageUrl("ModuleDetail")}?module_id=${module.id}&phase_id=${nextPhase.id}`}
                      className="bg-[#22C55E] hover:bg-green-600 text-white px-8 py-6 text-lg font-semibold whitespace-normal h-auto"
                      size="lg"
                    >
                      Próxima Fase: {nextPhase.name}
                    </Button>
                    <Button
                      onClick={() => navigate(createPageUrl("Modules"))}
                      variant="outline"
                      className="border-blue-300 hover:bg-blue-50 px-8 py-6 text-lg font-semibold"
                      size="lg"
                    >
                      Ver Módulos
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => navigate(createPageUrl("Modules"))}
                      className="bg-[#1976D2] hover:bg-[#0D3B66] text-white px-8 py-6 text-lg font-semibold"
                      size="lg"
                    >
                      🚀 Continuar o aprendizado!
                    </Button>
                    <Button
                      onClick={() => navigate(createPageUrl("Modules"))}
                      variant="outline"
                      className="border-blue-300 hover:bg-blue-50 px-8 py-6 text-lg font-semibold"
                      size="lg"
                    >
                      Voltar aos Módulos
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentCase) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Nenhum caso nesta fase</h2>
            <Button onClick={() => navigate(createPageUrl("Modules"))}>
              Voltar aos Módulos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const requiredCases = phase?.total_cases || cases.length;
  const completionPercentage = Math.round((completedCasesCount / requiredCases) * 100);
  
  const correctAnswers = currentCase.correct_answers && currentCase.correct_answers.length > 0
    ? currentCase.correct_answers
    : [currentCase.correct_diagnosis];

  return (
    <div className="min-h-screen p-0 md:p-8 overflow-x-hidden">
      <TopBar />
      <div className="max-w-4xl mx-auto md:space-y-6">
        {/* Header - hidden on mobile */}
        <div className="hidden md:flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl("Modules"))}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar às Fases
          </Button>
        </div>

        {/* Module Info - hidden on mobile */}
        <Card className="hidden md:block border-none shadow-lg bg-blue-50">
          <CardContent className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{module.name}</h1>
            <p className="text-gray-600 mb-4">{module.description}</p>
            <div className="flex items-center gap-4 flex-wrap">
              <Badge className="bg-blue-600">
                Caso {currentCaseIndex + 1} de {cases.length}
              </Badge>
              {attemptCount > 0 && (
                <Badge className="bg-orange-500">
                  Tentativa {attemptCount}/3
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Progress Bar - hidden on mobile */}
        <div className="hidden md:block h-3 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${completionPercentage}%` }}
            className="h-full bg-[#1976D2]"
          />
        </div>

        {/* Case Card */}
        <Card className="border-0 md:border border-blue-100 shadow-none md:shadow-xl rounded-none md:rounded-lg">
          <CardContent className="p-0 md:p-8">
            {/* Case Info Badge and Edit Button - hidden on mobile */}
            <div className="hidden md:flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                {currentCase.multiple_correct && (
                  <Badge className="bg-blue-100 text-[#0D3B66] border border-blue-200">
                    Múltiplas Respostas Corretas
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReportDialog(true)}
                  className="gap-2 border-red-200 hover:bg-red-50 text-red-600"
                >
                  <AlertCircle className="w-4 h-4" />
                  Reportar Erro
                </Button>
                {user?.role === "admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`${createPageUrl("AdminCases")}?edit_case=${currentCase.id}`)}
                    className="gap-2 border-blue-200 hover:bg-blue-50"
                  >
                    <Pencil className="w-4 h-4" />
                    Editar Caso
                  </Button>
                )}
              </div>
            </div>

            {/* Patient Info - hidden on mobile */}
            {currentCase.patient_info && (
              <Alert className="hidden md:flex mb-6 bg-blue-50 border-blue-200">
                <AlertDescription className="text-gray-700">
                  <strong>Dados do Paciente:</strong> {currentCase.patient_info}
                </AlertDescription>
              </Alert>
            )}

            {/* ECG Image with Zoom Button */}
            {currentCase.image_url && (
              <div className="mb-0 md:mb-6 relative group">
                <div className="md:rounded-xl overflow-hidden md:border-2 border-gray-200">
                  <img 
                    src={currentCase.image_url} 
                    alt="ECG"
                    className="h-auto mx-auto block"
                    style={{ maxWidth: '100%', width: 'auto' }}
                  />
                </div>
                <Button
                  onClick={openZoom}
                  className="absolute top-4 right-4 bg-white/95 hover:bg-white text-gray-800 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 border border-blue-200"
                  size="icon"
                >
                  <Maximize2 className="w-5 h-5" />
                </Button>
              </div>
            )}

            {/* Banner de conteúdo no primeiro caso da fase */}
            {phaseContent && currentCaseIndex === 0 && (
              <div className="mx-3 md:mx-0 mt-4 md:mt-0 mb-4">
                <Link to={`${createPageUrl("ConteudoECG")}?type=phase&module_id=${module.id}&phase_id=${phase.id}&case_index=${currentCaseIndex}&from=module`}>
                  <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 hover:bg-blue-100 transition-colors cursor-pointer">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-blue-900 text-sm">Novo conteúdo disponível!</p>
                      <p className="text-blue-700 text-xs">Leia o material da fase <strong>{phase?.name}</strong> antes de começar.</p>
                    </div>
                    <span className="text-blue-600 text-sm font-semibold">Ver →</span>
                  </div>
                </Link>
              </div>
            )}

            {/* Options */}
            <div className="space-y-3 mb-6 pt-4 md:pt-0 px-3 md:px-0 mt-4 md:mt-0">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h3 className="font-semibold text-gray-900 text-xl flex-1">
                  {currentCase.title}
                </h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {phaseContent && (
                    <Link to={`${createPageUrl("ConteudoECG")}?type=phase&module_id=${module.id}&phase_id=${phase.id}&case_index=${currentCaseIndex}&from=module`}>
                      <Button variant="outline" size="sm" className="gap-2 border-blue-200 hover:bg-blue-50">
                        <BookOpen className="w-4 h-4" />
                        <span className="hidden sm:inline">Tem dúvidas?</span>
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowReportDialog(true)}
                    className="gap-2 border-red-200 hover:bg-red-50 text-red-600 md:hidden"
                  >
                    <AlertCircle className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {currentCase.multiple_correct && (
                <p className="text-gray-700 mb-4">
                  Selecione todas as respostas corretas:
                </p>
              )}
              {currentCase.options.map((option, index) => {
                const isSelected = selectedAnswers.includes(option);
                const isCorrectAnswer = correctAnswers.includes(option);
                const showAsCorrect = showResult && isCorrect && isCorrectAnswer;
                const showAsIncorrect = showResult && !isCorrect && showCorrectAnswer && isSelected && !isCorrectAnswer;
                const showAsCorrectAfterFail = showResult && !isCorrect && showCorrectAnswer && isCorrectAnswer;

                return (
                  <Button
                    key={index}
                    variant="outline"
                    className={`w-full justify-start text-left p-6 h-auto min-h-[60px] transition-all duration-300 ${
                      showAsCorrect || showAsCorrectAfterFail
                        ? 'bg-green-50 border-green-300 border-2'
                        : showAsIncorrect
                          ? 'bg-rose-50 border-rose-300 border-2'
                          : isSelected
                          ? 'bg-blue-50 border-[#1976D2] border-2'
                          : 'hover:bg-blue-50 border-blue-100'
                    }`}
                    onClick={() => handleAnswerToggle(option)}
                    disabled={showResult}
                  >
                    <div className="flex items-start gap-3 w-full">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        showAsCorrect || showAsCorrectAfterFail
                          ? 'bg-green-500'
                          : showAsIncorrect
                            ? 'bg-red-500'
                            : isSelected
                            ? 'bg-[#1976D2]'
                            : 'bg-gray-200'
                      }`}>
                        {(showAsCorrect || showAsCorrectAfterFail) && (
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        )}
                        {showAsIncorrect && (
                          <XCircle className="w-5 h-5 text-white" />
                        )}
                        {!showResult && isSelected && (
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        )}
                      </div>
                      <span className="flex-1 font-medium text-gray-800 whitespace-normal break-words">{option}</span>
                    </div>
                  </Button>
                );
              })}
            </div>

            {/* Submit Button */}
            {!showResult && (
              <div className="px-3 md:px-0">
              <Button
                onClick={handleSubmitAnswer}
                disabled={selectedAnswers.length === 0}
                className="w-full bg-[#0D3B66] hover:bg-[#1976D2] text-white py-6 text-lg font-semibold mb-6"
              >
                {currentCase.multiple_correct 
                  ? `Confirmar Respostas (${selectedAnswers.length} selecionada${selectedAnswers.length !== 1 ? 's' : ''})` 
                  : "Confirmar Resposta"}
              </Button>
              </div>
            )}

            {/* Result */}
            <div className="px-3 md:px-0">
            <AnimatePresence>
              {showResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {/* Resposta Correta */}
                  {isCorrect && (
                    <div className="p-6 rounded-xl bg-green-50 border-2 border-green-200">
                      <div className="flex items-start gap-3 mb-4">
                        <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                        <div>
                          <h4 className="font-bold text-lg mb-2 text-green-900">
                            🎉 Correto!
                          </h4>
                        </div>
                      </div>

                      {currentCase.explanation && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <div className="flex items-start gap-2 mb-2">
                            <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-1" />
                            <div>
                              <h5 className="font-semibold text-gray-900 mb-2">Explicação:</h5>
                              <p className="text-gray-700 leading-relaxed">{currentCase.explanation}</p>
                              
                              {currentCase.key_findings && currentCase.key_findings.length > 0 && (
                                <div className="mt-4">
                                  <h6 className="font-semibold text-gray-900 mb-2">Achados principais:</h6>
                                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                                    {currentCase.key_findings.map((finding, i) => (
                                      <li key={i}>{finding}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <Button
                        onClick={handleNextCase}
                        className="w-full mt-6 bg-[#1976D2] hover:bg-[#0D3B66]"
                      >
                        {currentCaseIndex < cases.length - 1 ? 'Próximo Caso' : 'Finalizar Fase'}
                      </Button>
                    </div>
                  )}

                  {/* Resposta Incorreta - Tente Novamente */}
                  {!isCorrect && !showCorrectAnswer && (
                    <div className="p-6 rounded-xl bg-orange-50 border-2 border-orange-300">
                      <div className="flex items-start gap-3 mb-4">
                        <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
                        <div>
                          <h4 className="font-bold text-lg mb-2 text-orange-800">
                            Incorreto
                          </h4>
                          <p className="text-orange-700">
                            Sua resposta não está correta. Tente novamente!
                          </p>
                          <p className="text-sm text-orange-600 mt-2">
                            Você tem {3 - attemptCount} tentativa{3 - attemptCount !== 1 ? 's' : ''} restante{3 - attemptCount !== 1 ? 's' : ''}.
                          </p>
                        </div>
                      </div>

                      <Button
                        onClick={handleTryAgain}
                        className="w-full mt-4 bg-orange-600 hover:bg-orange-700 text-white gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Tentar Novamente
                      </Button>
                    </div>
                  )}

                  {/* Resposta Incorreta - Mostrar Resposta Correta */}
                  {!isCorrect && showCorrectAnswer && (
                    <div className="p-6 rounded-xl bg-red-50 border-2 border-red-200">
                      <div className="flex items-start gap-3 mb-4">
                        <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                        <div>
                          <h4 className="font-bold text-lg mb-2 text-red-900">
                            Incorreto - Resposta Correta:
                          </h4>
                          <div className="text-red-800 mb-3">
                            <ul className="list-disc list-inside mt-1">
                              {correctAnswers.map((ans, idx) => (
                                <li key={idx} className="font-medium">{ans}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      {currentCase.explanation && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <div className="flex items-start gap-2 mb-2">
                            <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-1" />
                            <div>
                              <h5 className="font-semibold text-gray-900 mb-2">Explicação:</h5>
                              <p className="text-gray-700 leading-relaxed">{currentCase.explanation}</p>
                              
                              {currentCase.key_findings && currentCase.key_findings.length > 0 && (
                                <div className="mt-4">
                                  <h6 className="font-semibold text-gray-900 mb-2">Achados principais:</h6>
                                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                                    {currentCase.key_findings.map((finding, i) => (
                                      <li key={i}>{finding}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <Button
                        onClick={handleNextCase}
                        className="w-full mt-6 bg-[#1976D2] hover:bg-[#0D3B66]"
                      >
                        {currentCaseIndex < cases.length - 1 ? 'Próximo Caso' : 'Finalizar Fase'}
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Zoom Dialog */}
      <Dialog open={showZoom} onOpenChange={closeZoom}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-blue-200">
          <DialogHeader className="px-4 pt-4 pb-3 md:px-6 md:pt-6">
            <div className="flex flex-col gap-3">
              <DialogTitle className="flex items-center gap-2 text-gray-800 text-base md:text-lg">
                <Maximize2 className="w-4 h-4 md:w-5 md:h-5" />
                Visualização Ampliada
              </DialogTitle>
              <div className="flex items-center gap-2 justify-center md:justify-start flex-wrap">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 1}
                  className="border-blue-200 hover:bg-blue-50 h-9 w-9"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Badge variant="outline" className="px-3 py-1 border-blue-200">
                  {Math.round(zoomLevel * 100)}%
                </Badge>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 4}
                  className="border-blue-200 hover:bg-blue-50 h-9 w-9"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleResetZoom}
                  className="border-blue-200 hover:bg-blue-50 h-9 w-9"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="px-4 pb-4 md:px-6 md:pb-6">
            <div
              className="relative bg-blue-50 rounded-lg overflow-hidden touch-none border border-blue-200"
              style={{ height: '60vh' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
            >
              <div
                className={`absolute inset-0 flex items-center justify-center ${
                  isDragging ? 'cursor-grabbing' : zoomLevel > 1 ? 'cursor-grab' : 'cursor-default'
                }`}
                style={{
                  transform: `scale(${zoomLevel}) translate(${position.x / zoomLevel}px, ${position.y / zoomLevel}px)`,
                  transition: isDragging ? 'none' : 'transform 0.2s ease-out'
                }}
              >
                <img
                  src={currentCase.image_url}
                  alt="ECG Ampliado"
                  className="max-w-full max-h-full object-contain select-none"
                  draggable={false}
                />
              </div>
            </div>

            <div className="mt-4 text-center text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
              {zoomLevel > 1 ? (
                <p>
                  <span className="hidden md:inline">Use o mouse para arrastar e mover a imagem &bull; Role o mouse para ajustar o zoom</span>
                  <span className="md:hidden">Arraste com um dedo para mover &bull; Use dois dedos para dar zoom (pinch)</span>
                </p>
              ) : (
                <p>
                  <span className="hidden md:inline">Use os botões acima ou role o mouse para aplicar zoom</span>
                  <span className="md:hidden">Use os botões acima ou dois dedos para aplicar zoom (pinch)</span>
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Report Error Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Reportar Erro no Caso
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Tipo de Erro
              </label>
              <select
                value={reportErrorType}
                onChange={(e) => setReportErrorType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="">Selecione o tipo</option>
                <option value="Imagem incorreta">Imagem incorreta</option>
                <option value="Resposta incorreta">Resposta incorreta</option>
                <option value="Explicação errada">Explicação errada</option>
                <option value="Informação do paciente">Informação do paciente</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Descrição do Erro *
              </label>
              <textarea
                value={reportErrorDescription}
                onChange={(e) => setReportErrorDescription(e.target.value)}
                placeholder="Descreva o erro encontrado..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[100px]"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowReportDialog(false);
                  setReportErrorType("");
                  setReportErrorDescription("");
                }}
                disabled={reportingError}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleReportError}
                disabled={!reportErrorDescription.trim() || reportingError}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {reportingError ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar Reporte"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}