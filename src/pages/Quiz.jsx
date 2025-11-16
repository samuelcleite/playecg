import React, { useState, useEffect } from "react";
import { User } from "@/entities/User";
import { ECGCase } from "@/entities/ECGCase";
import { QuizAttempt } from "@/entities/QuizAttempt";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Loader2,
  Heart,
  Clock,
  Lightbulb,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X as CloseIcon,
  Maximize2,
  Pencil,
  RefreshCw
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

export default function Quiz() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [currentCase, setCurrentCase] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startTime, setStartTime] = useState(null);
  const [attemptedCaseIds, setAttemptedCaseIds] = useState([]);
  const [allCasesCompleted, setAllCasesCompleted] = useState(false);

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
    const userData = await User.me();
    setUser(userData);

    // Carregar todos os casos já respondidos pelo usuário
    const attempts = await QuizAttempt.filter({ user_email: userData.email });
    const attemptedIds = attempts.map(attempt => attempt.case_id);
    setAttemptedCaseIds(attemptedIds);

    await loadNextCase(attemptedIds);
  };

  const loadNextCase = async (attemptedIds = attemptedCaseIds) => {
    setLoading(true);
    setSelectedAnswers([]);
    setShowResult(false);
    setAllCasesCompleted(false);

    // Buscar todos os casos disponíveis
    const allCases = await ECGCase.list();

    // Filtrar casos que ainda não foram respondidos
    const unansweredCases = allCases.filter(c => !attemptedIds.includes(c.id));

    if (unansweredCases.length > 0) {
      // Selecionar um caso aleatório entre os não respondidos
      const randomCase = unansweredCases[Math.floor(Math.random() * unansweredCases.length)];
      setCurrentCase(randomCase);
      setStartTime(Date.now());
    } else if (allCases.length > 0) {
      // Todos os casos foram respondidos
      setAllCasesCompleted(true);
      setCurrentCase(null);
    } else {
      // Não há casos cadastrados
      setCurrentCase(null);
    }
    
    setLoading(false);
  };

  const handleAnswerToggle = (answer) => {
    if (showResult) return;

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
    if (selectedAnswers.length === 0 || showResult) return;

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

    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    const pointsEarned = correct ? 10 : 0;

    await QuizAttempt.create({
      user_email: user.email,
      case_id: currentCase.id,
      user_answer: selectedAnswers.join(", "),
      correct: correct,
      time_spent: timeSpent,
      points_earned: pointsEarned
    });

    // Adicionar caso atual à lista de casos respondidos
    const updatedAttemptedIds = [...attemptedCaseIds, currentCase.id];
    setAttemptedCaseIds(updatedAttemptedIds);

    if (correct) {
      await User.update(user.id, {
        points: (user.points || 0) + pointsEarned,
        level: Math.floor(((user.points || 0) + pointsEarned) / 100) + 1
      });
      setUser({ ...user, points: (user.points || 0) + pointsEarned });
    }
  };

  const handleResetProgress = async () => {
    setLoading(true);
    setAllCasesCompleted(false);
    setAttemptedCaseIds([]);
    await loadNextCase([]);
  };

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

  const isPremium = user?.subscription_type === "premium";

  const createPageUrl = (pageName) => {
    if (pageName === "AdminCases" && currentCase?.id) {
      return `/admin/cases/${currentCase.id}/edit`;
    }
    console.warn(`createPageUrl called with unhandled pageName: ${pageName}`);
    return "/";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando caso...</p>
        </div>
      </div>
    );
  }

  if (allCasesCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md border-2 border-green-200 shadow-lg">
          <CardContent className="p-8 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900">Parabéns!</h2>
            <p className="text-gray-600 mb-6">
              Você completou todos os casos de ECG disponíveis! Quer recomeçar e praticar novamente?
            </p>
            <Button
              onClick={handleResetProgress}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Recomeçar Quiz
            </Button>
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
            <Heart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Nenhum caso disponível</h2>
            <p className="text-gray-600">Adicione casos de ECG para começar a praticar.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const correctAnswers = currentCase.correct_answers && currentCase.correct_answers.length > 0
    ? currentCase.correct_answers
    : [currentCase.correct_diagnosis];

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Quiz de ECG</h1>
            <p className="text-gray-500 mt-1">Analise o traçado e faça seu diagnóstico</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-500">Seus pontos</p>
              <p className="text-2xl font-bold text-purple-600">{user?.points || 0}</p>
            </div>
          </div>
        </div>

        {/* Case Card */}
        <Card className="border border-purple-100 shadow-lg">
          <CardContent className="p-8">
            {/* Case Info */}
            <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                {currentCase.multiple_correct && (
                  <Badge className="bg-purple-100 text-purple-800 border border-purple-200">
                    Múltiplas Respostas
                  </Badge>
                )}
                {!isPremium && (
                  <Badge className="bg-blue-100 text-blue-800 border border-blue-200">
                    Quiz Gratuito - Acesso Ilimitado
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
                <div className="rounded-xl overflow-hidden border-2 border-purple-200">
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
              <h3 className="font-semibold text-gray-800 mb-4 text-xl">
                {currentCase.title}
              </h3>
              <AnimatePresence>
                {currentCase.options.map((option, index) => {
                  const isSelected = selectedAnswers.includes(option);
                  const isCorrectAnswer = correctAnswers.includes(option);
                  const showAsCorrect = showResult && isCorrectAnswer;
                  const showAsIncorrect = showResult && isSelected && !isCorrectAnswer;

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Button
                        variant="outline"
                        className={`w-full justify-start text-left p-6 h-auto transition-all duration-300 ${
                          showAsCorrect
                            ? 'bg-green-50 border-green-300 border-2'
                            : showAsIncorrect
                              ? 'bg-rose-50 border-rose-300 border-2'
                              : isSelected
                                ? 'bg-purple-50 border-purple-300 border-2'
                                : 'hover:bg-purple-50 border-purple-100'
                        }`}
                        onClick={() => handleAnswerToggle(option)}
                        disabled={showResult}
                      >
                        <div className="flex items-center gap-3 w-full">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            showAsCorrect
                              ? 'bg-green-300 border-2 border-green-400'
                              : showAsIncorrect
                                ? 'bg-rose-300 border-2 border-rose-400'
                                : isSelected
                                  ? 'bg-purple-300 border-2 border-purple-400'
                                  : 'bg-gray-100'
                          }`}>
                            {showAsCorrect && (
                              <CheckCircle2 className="w-5 h-5 text-green-700" />
                            )}
                            {showAsIncorrect && (
                              <XCircle className="w-5 h-5 text-rose-700" />
                            )}
                            {!showResult && isSelected && (
                              <CheckCircle2 className="w-5 h-5 text-purple-700" />
                            )}
                          </div>
                          <span className="flex-1 font-medium text-gray-800">{option}</span>
                        </div>
                      </Button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Submit Button */}
            {!showResult && (
              <Button
                onClick={handleSubmitAnswer}
                disabled={selectedAnswers.length === 0}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white py-6 text-lg font-semibold"
              >
                {currentCase.multiple_correct
                  ? `Confirmar Respostas (${selectedAnswers.length} selecionada${selectedAnswers.length !== 1 ? 's' : ''})`
                  : "Confirmar Resposta"}
              </Button>
            )}

            {/* Result and Explanation */}
            <AnimatePresence>
              {showResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-6 rounded-xl ${
                    isCorrect ? 'bg-green-50 border-2 border-green-300' : 'bg-rose-50 border-2 border-rose-300'
                  }`}
                >
                  <div className="flex items-start gap-3 mb-4">
                    {isCorrect ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                    ) : (
                      <XCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                    )}
                    <div>
                      <h4 className={`font-bold text-lg mb-2 ${isCorrect ? 'text-green-800' : 'text-rose-800'}`}>
                        {isCorrect ? '🎉 Correto!' : 'Incorreto'}
                      </h4>
                      {!isCorrect && (
                        <div className="text-rose-800 mb-3">
                          <strong>{currentCase.multiple_correct ? 'Respostas corretas:' : 'Resposta correta:'}</strong>
                          <ul className="list-disc list-inside mt-1">
                            {correctAnswers.map((ans, idx) => (
                              <li key={idx}>{ans}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {isPremium && currentCase.explanation && (
                    <div className="mt-4 pt-4 border-t border-green-200">
                      <div className="flex items-start gap-2 mb-2">
                        <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-1" />
                        <div>
                          <h5 className="font-semibold text-gray-800 mb-2">Explicação:</h5>
                          <p className="text-gray-700 leading-relaxed">{currentCase.explanation}</p>

                          {currentCase.key_findings && currentCase.key_findings.length > 0 && (
                            <div className="mt-4">
                              <h6 className="font-semibold text-gray-800 mb-2">Achados principais:</h6>
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

                  {!isPremium && (
                    <Alert className="mt-4 bg-amber-50 border-amber-200">
                      <AlertDescription className="text-amber-900">
                        <strong>💎 Versão Premium:</strong> Desbloqueie explicações detalhadas e análise completa de cada caso.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button
                    onClick={() => loadNextCase()}
                    className="w-full mt-6 bg-gradient-to-r from-purple-200 to-pink-200 hover:from-purple-300 hover:to-pink-300 text-purple-900 gap-2 border border-purple-300"
                  >
                    Próximo Caso
                    <ArrowRight className="w-4 h-4" />
                  </Button>
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
                  <span className="hidden md:inline">Use o mouse para arrastar e mover a imagem • Role o mouse para ajustar o zoom</span>
                  <span className="md:hidden">Arraste com um dedo para mover • Use dois dedos para dar zoom (pinch)</span>
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