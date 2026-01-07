import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
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

  useEffect(() => {
    loadData();
  }, []);

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
    const attempts = await base44.entities.QuizAttempt.filter({ 
      user_email: userData.email,
      module_id: moduleId,
      phase_id: phaseId,
      quiz_type: "module"
    });

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

    // Filtrar casos já completados nesta sessão (fase atual)
    const availableCurrentCases = currentPhaseCases.filter(c => !completedCaseIds.includes(c.id));
    const availablePreviousCases = previousPhasesCases.filter(c => !completedCaseIds.includes(c.id));

    // Calcular distribuição (80% atual + 20% anteriores)
    const totalCasesForSession = currentPhase.total_cases || 10;
    let numCasesFromCurrent = Math.round(totalCasesForSession * 0.8);
    let numCasesFromPrevious = Math.round(totalCasesForSession * 0.2);

    // Ajustar se não houver casos suficientes
    if (availableCurrentCases.length < numCasesFromCurrent) {
      numCasesFromCurrent = availableCurrentCases.length;
      numCasesFromPrevious = Math.min(
        totalCasesForSession - numCasesFromCurrent,
        availablePreviousCases.length
      );
    }

    if (availablePreviousCases.length < numCasesFromPrevious) {
      numCasesFromPrevious = availablePreviousCases.length;
      numCasesFromCurrent = Math.min(
        totalCasesForSession - numCasesFromPrevious,
        availableCurrentCases.length
      );
    }

    // Selecionar casos aleatoriamente e marcar a origem
    const selectedCurrentCases = shuffleArray([...availableCurrentCases])
      .slice(0, numCasesFromCurrent)
      .map(c => ({ ...c, caseSource: 'current_phase' }));
    
    const selectedPreviousCases = shuffleArray([...availablePreviousCases])
      .slice(0, numCasesFromPrevious)
      .map(c => ({ ...c, caseSource: 'previous_phase' }));

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

        // Verificar se a fase foi completada
        const requiredCases = phase?.total_cases || cases.length;
        const phaseCompleted = newCompletedCount >= requiredCases;

        // Se completou a fase, mostrar tela de conclusão
        if (phaseCompleted) {
          setShowPhaseCompletion(true);
        }
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
      navigate(`${createPageUrl("ModulePhases")}?id=${module.id}`);
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
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-2xl border-none shadow-2xl">
          <CardContent className="p-12 text-center">
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
                Você completou a fase <span className="font-bold text-purple-600">{phase?.name}</span> do módulo <span className="font-bold text-blue-600">{module?.name}</span>
              </p>
              
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-6 mb-8">
                <p className="text-lg text-gray-700 mb-2">
                  <span className="font-bold text-2xl text-green-600">{completedCasesCount}</span> casos completados
                </p>
                <p className="text-sm text-gray-600">
                  Continue sua jornada nas próximas fases!
                </p>
              </div>

              <Button
                onClick={() => navigate(`${createPageUrl("ModulePhases")}?id=${module.id}`)}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-6 text-lg font-semibold"
                size="lg"
              >
                Ver Todas as Fases
              </Button>
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
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => navigate(`${createPageUrl("ModulePhases")}?id=${module.id}`)}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar às Fases
          </Button>
        </div>

        {/* Module Info */}
        <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
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

        {/* Progress Bar */}
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${completionPercentage}%` }}
            className="h-full bg-gradient-to-r from-blue-600 to-indigo-600"
          />
        </div>

        {/* Case Card */}
        <Card className="border-none shadow-xl">
          <CardContent className="p-8">
            {/* Case Info Badge and Edit Button */}
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                {currentCase.multiple_correct && (
                  <Badge className="bg-purple-100 text-purple-800 border border-purple-200">
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
                    className="gap-2 border-purple-200 hover:bg-purple-50"
                  >
                    <Pencil className="w-4 h-4" />
                    Editar Caso
                  </Button>
                )}
              </div>
            </div>

            {/* Patient Info */}
            {currentCase.patient_info && (
              <Alert className="mb-6 bg-blue-50 border-blue-200">
                <AlertDescription className="text-gray-700">
                  <strong>Dados do Paciente:</strong> {currentCase.patient_info}
                </AlertDescription>
              </Alert>
            )}

            {/* ECG Image with Zoom Button */}
            {currentCase.image_url && (
              <div className="mb-6 relative group">
                <div className="rounded-xl overflow-hidden border-2 border-gray-200">
                  <img 
                    src={currentCase.image_url} 
                    alt="ECG"
                    className="w-full h-auto"
                  />
                </div>
                <Button
                  onClick={openZoom}
                  className="absolute top-4 right-4 bg-white/95 hover:bg-white text-gray-800 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 border border-purple-200"
                  size="icon"
                >
                  <Maximize2 className="w-5 h-5" />
                </Button>
              </div>
            )}

            {/* Options */}
            <div className="space-y-3 mb-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h3 className="font-semibold text-gray-900 text-xl flex-1">
                  {currentCase.title}
                </h3>
                {phaseContent && (
                  <Link to={`${createPageUrl("ConteudoECG")}?type=phase&module_id=${module.id}&phase_id=${phase.id}`}>
                    <Button variant="outline" size="sm" className="gap-2 border-purple-200 hover:bg-purple-50">
                      <BookOpen className="w-4 h-4" />
                      Tem dúvidas?
                    </Button>
                  </Link>
                )}
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
                        ? 'bg-green-50 border-green-500 border-2'
                        : showAsIncorrect
                          ? 'bg-red-50 border-red-500 border-2'
                          : isSelected
                            ? 'bg-purple-50 border-purple-500 border-2'
                            : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleAnswerToggle(option)}
                    disabled={showResult && (isCorrect || showCorrectAnswer)}
                  >
                    <div className="flex items-start gap-3 w-full">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        showAsCorrect || showAsCorrectAfterFail
                          ? 'bg-green-500'
                          : showAsIncorrect
                            ? 'bg-red-500'
                            : isSelected
                              ? 'bg-purple-500'
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
                      <span className="flex-1 font-medium whitespace-normal break-words">{option}</span>
                    </div>
                  </Button>
                );
              })}
            </div>

            {/* Submit Button */}
            {!showResult && (
              <Button
                onClick={handleSubmitAnswer}
                disabled={selectedAnswers.length === 0}
                className="w-full bg-purple-600 hover:bg-purple-700 mb-6"
              >
                {currentCase.multiple_correct 
                  ? `Confirmar Respostas (${selectedAnswers.length} selecionada${selectedAnswers.length !== 1 ? 's' : ''})` 
                  : "Confirmar Resposta"}
              </Button>
            )}

            {/* Result */}
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
                        className="w-full mt-6 bg-purple-600 hover:bg-purple-700"
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
                        className="w-full mt-6 bg-purple-600 hover:bg-purple-700"
                      >
                        {currentCaseIndex < cases.length - 1 ? 'Próximo Caso' : 'Finalizar Fase'}
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

      {/* Zoom Dialog */}
      <Dialog open={showZoom} onOpenChange={closeZoom}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-purple-200">
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
                  className="border-purple-200 hover:bg-purple-50 h-9 w-9"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Badge variant="outline" className="px-3 py-1 border-purple-200">
                  {Math.round(zoomLevel * 100)}%
                </Badge>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 4}
                  className="border-purple-200 hover:bg-purple-50 h-9 w-9"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleResetZoom}
                  className="border-purple-200 hover:bg-purple-50 h-9 w-9"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="px-4 pb-4 md:px-6 md:pb-6">
            <div
              className="relative bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg overflow-hidden touch-none border border-purple-200"
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

            <div className="mt-4 text-center text-sm text-gray-600 bg-purple-50 p-3 rounded-lg border border-purple-100">
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