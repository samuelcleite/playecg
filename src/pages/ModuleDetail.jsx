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
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ModuleDetail() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [module, setModule] = useState(null);
  const [cases, setCases] = useState([]);
  const [currentCaseIndex, setCurrentCaseIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [attemptCount, setAttemptCount] = useState(0);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);

  // Zoom states
  const [showZoom, setShowZoom] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState(0);

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

    const casesData = await base44.entities.ECGCase.filter({ 
      module_id: moduleId,
      phase_id: phaseId 
    });
    setCases(casesData);

    let progressData = await base44.entities.UserProgress.filter({ 
      user_email: userData.email, 
      module_id: moduleId,
      phase_id: phaseId
    });

    if (progressData.length === 0) {
      const newProgress = await base44.entities.UserProgress.create({
        user_email: userData.email,
        module_id: moduleId,
        phase_id: phaseId,
        completed_cases: [],
        score: 0,
        completed: false
      });
      progressData = [newProgress];
    }

    setProgress(progressData[0]);
    setLoading(false);
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

    const pointsEarned = correct ? 15 : 0;

    // Se acertou ou já tentou 3 vezes, registrar e avançar
    if (correct || newAttemptCount >= 3) {
      await base44.entities.QuizAttempt.create({
        user_email: user.email,
        case_id: currentCase.id,
        user_answer: selectedAnswers.join(", "),
        correct: correct,
        points_earned: pointsEarned
      });

      if (!progress.completed_cases.includes(currentCase.id)) {
        const updatedCompletedCases = [...progress.completed_cases, currentCase.id];
        const newScore = progress.score + pointsEarned;
        const moduleCompleted = updatedCompletedCases.length === cases.length;

        await base44.entities.UserProgress.update(progress.id, {
          completed_cases: updatedCompletedCases,
          score: newScore,
          completed: moduleCompleted
        });

        await base44.entities.User.update(user.id, {
          points: (user.points || 0) + pointsEarned,
          level: Math.floor(((user.points || 0) + pointsEarned) / 100) + 1
        });

        setProgress({
          ...progress,
          completed_cases: updatedCompletedCases,
          score: newScore,
          completed: moduleCompleted
        });
        setUser({ ...user, points: (user.points || 0) + pointsEarned });
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

  const completionPercentage = Math.round((progress.completed_cases.length / cases.length) * 100);
  
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
          <div className="text-right">
            <p className="text-sm text-gray-500">Progresso da Fase</p>
            <p className="text-2xl font-bold text-blue-600">{completionPercentage}%</p>
          </div>
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
              <Badge className="bg-amber-600">
                {progress.score} pontos
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
              <h3 className="font-semibold text-gray-900 mb-4 text-xl">
                {currentCase.title}
              </h3>
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
                    className={`w-full justify-start text-left p-6 h-auto transition-all duration-300 ${
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
                    <div className="flex items-center gap-3 w-full">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
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
                      <span className="flex-1 font-medium">{option}</span>
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
                            🎉 Correto! +15 pontos
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
          <DialogHeader className="px-6 pt-6 pb-2">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-gray-800">
                <Maximize2 className="w-5 h-5" />
                Visualização Ampliada
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 1}
                  className="border-purple-200 hover:bg-purple-50"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Badge variant="outline" className="px-3 border-purple-200">
                  {Math.round(zoomLevel * 100)}%
                </Badge>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 4}
                  className="border-purple-200 hover:bg-purple-50"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleResetZoom}
                  className="border-purple-200 hover:bg-purple-50"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="px-6 pb-6">
            <div
              className="relative bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg overflow-hidden touch-none border border-purple-200"
              style={{ height: '70vh' }}
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
    </div>
  );
}