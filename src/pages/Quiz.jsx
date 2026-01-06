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
  RefreshCw,
  AlertTriangle,
  Crown,
  Lock,
  AlertCircle
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const FREE_DAILY_LIMIT = 10;

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
  const [attemptCount, setAttemptCount] = useState(0);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [dailyQuizCount, setDailyQuizCount] = useState(0);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);

  // Report Error states
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportErrorType, setReportErrorType] = useState("");
  const [reportErrorDescription, setReportErrorDescription] = useState("");
  const [reportingError, setReportingError] = useState(false);

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

    // Verificar limite diário para usuários gratuitos
    if (userData.subscription_type !== "premium") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const allAttempts = await QuizAttempt.filter({ user_email: userData.email });
      
      // Contar quizzes únicos completados hoje
      const todayAttempts = allAttempts.filter(attempt => {
        const attemptDate = new Date(attempt.created_date);
        attemptDate.setHours(0, 0, 0, 0);
        return attemptDate.toISOString() === todayISO;
      });

      // Contar casos únicos (um caso = um quiz)
      const uniqueCasesToday = new Set(todayAttempts.map(a => a.case_id));
      const count = uniqueCasesToday.size;
      
      setDailyQuizCount(count);

      if (count >= FREE_DAILY_LIMIT) {
        setDailyLimitReached(true);
        setLoading(false);
        return;
      }
    }

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
    setAttemptCount(0);
    setShowCorrectAnswer(false);

    const allCases = await ECGCase.list();
    const unansweredCases = allCases.filter(c => !attemptedIds.includes(c.id));

    if (unansweredCases.length > 0) {
      const randomCase = unansweredCases[Math.floor(Math.random() * unansweredCases.length)];
      setCurrentCase(randomCase);
      setStartTime(Date.now());
    } else if (allCases.length > 0) {
      setAllCasesCompleted(true);
      setCurrentCase(null);
    } else {
      setCurrentCase(null);
    }
    
    setLoading(false);
  };

  const handleAnswerToggle = (answer) => {
    if (showResult && isCorrect) return;

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

    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    // Se acertou ou já tentou 3 vezes, registrar no banco e adicionar à lista de respondidos
    if (correct || newAttemptCount >= 3) {
      await QuizAttempt.create({
        user_email: user.email,
        case_id: currentCase.id,
        user_answer: selectedAnswers.join(", "),
        correct: correct,
        time_spent: timeSpent,
        points_earned: 0
      });

      const updatedAttemptedIds = [...attemptedCaseIds, currentCase.id];
      setAttemptedCaseIds(updatedAttemptedIds);

      // Atualizar contador diário para usuários gratuitos
      if (user.subscription_type !== "premium") {
        const newCount = dailyQuizCount + 1;
        setDailyQuizCount(newCount);
        
        if (newCount >= FREE_DAILY_LIMIT) {
          setDailyLimitReached(true);
        }
      }
    }
  };

  const handleTryAgain = () => {
    setShowResult(false);
    setSelectedAnswers([]);
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

  const createPageUrlLocal = (pageName) => {
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

  // Daily limit reached for free users
  if (dailyLimitReached && !isPremium) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md border-2 border-amber-200 shadow-lg">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-100 to-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900">Limite Diário Atingido</h2>
            <p className="text-gray-600 mb-4">
              Você completou {FREE_DAILY_LIMIT} quizzes hoje! 🎉
            </p>
            <p className="text-gray-600 mb-6">
              Volte amanhã para continuar praticando ou faça upgrade para Premium e tenha acesso ilimitado.
            </p>
            
            <Alert className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200">
              <Crown className="w-5 h-5 text-amber-600" />
              <AlertDescription className="text-amber-900 ml-2">
                <strong>Com Premium você tem:</strong>
                <ul className="list-disc list-inside mt-2 text-left space-y-1">
                  <li>Quizzes ilimitados por dia</li>
                  <li>Módulos estruturados</li>
                  <li>Explicações detalhadas</li>
                  <li>Gamificação completa</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-3">
              <Link to={createPageUrl("Upgrade")} className="w-full">
                <Button className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white gap-2">
                  <Crown className="w-5 h-5" />
                  Fazer Upgrade Premium
                </Button>
              </Link>
              <Link to={createPageUrl("Dashboard")} className="w-full">
                <Button variant="outline" className="w-full">
                  Voltar ao Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
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
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Quiz de ECG</h1>
          <p className="text-gray-500 mt-1">Analise o traçado e faça seu diagnóstico</p>
        </div>

        {/* Daily Limit Warning for Free Users */}
        {!isPremium && dailyQuizCount > 0 && (
          <Alert className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200">
            <AlertDescription className="text-amber-900">
              <div className="flex items-center justify-between">
                <span>
                  <strong>Quizzes hoje:</strong> {dailyQuizCount}/{FREE_DAILY_LIMIT}
                </span>
                {dailyQuizCount >= FREE_DAILY_LIMIT - 2 && (
                  <Link to={createPageUrl("Upgrade")}>
                    <Button size="sm" variant="outline" className="gap-2 border-amber-300 hover:bg-amber-100">
                      <Crown className="w-4 h-4" />
                      Ver Premium
                    </Button>
                  </Link>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

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
                {attemptCount > 0 && (
                  <Badge className="bg-amber-100 text-amber-800 border border-amber-200">
                    Tentativa {attemptCount}/3
                  </Badge>
                )}
                {!isPremium && (
                  <Badge className="bg-blue-100 text-blue-800 border border-blue-200">
                    Quiz Gratuito - {FREE_DAILY_LIMIT} por dia
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
                    onClick={() => navigate(`${createPageUrlLocal("AdminCases")}?edit_case=${currentCase.id}`)}
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
                  const showAsCorrect = showResult && isCorrect && isCorrectAnswer;
                  const showAsIncorrect = showResult && !isCorrect && showCorrectAnswer && isSelected && !isCorrectAnswer;
                  const showAsCorrectAfterFail = showResult && !isCorrect && showCorrectAnswer && isCorrectAnswer;

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Button
                        variant="outline"
                        className={`w-full justify-start text-left p-6 h-auto min-h-[60px] transition-all duration-300 ${
                          showAsCorrect || showAsCorrectAfterFail
                            ? 'bg-green-50 border-green-300 border-2'
                            : showAsIncorrect
                              ? 'bg-rose-50 border-rose-300 border-2'
                              : isSelected
                                ? 'bg-purple-50 border-purple-300 border-2'
                                : 'hover:bg-purple-50 border-purple-100'
                        }`}
                        onClick={() => handleAnswerToggle(option)}
                        disabled={showResult && (isCorrect || showCorrectAnswer)}
                      >
                        <div className="flex items-start gap-3 w-full">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            showAsCorrect || showAsCorrectAfterFail
                              ? 'bg-green-300 border-2 border-green-400'
                              : showAsIncorrect
                                ? 'bg-rose-300 border-2 border-rose-400'
                                : isSelected
                                  ? 'bg-purple-300 border-2 border-purple-400'
                                  : 'bg-gray-100'
                          }`}>
                            {(showAsCorrect || showAsCorrectAfterFail) && (
                              <CheckCircle2 className="w-5 h-5 text-green-700" />
                            )}
                            {showAsIncorrect && (
                              <XCircle className="w-5 h-5 text-rose-700" />
                            )}
                            {!showResult && isSelected && (
                              <CheckCircle2 className="w-5 h-5 text-purple-700" />
                            )}
                          </div>
                          <span className="flex-1 font-medium text-gray-800 whitespace-normal break-words">{option}</span>
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

            {/* Result */}
            <AnimatePresence>
              {showResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {/* Resposta Correta */}
                  {isCorrect && (
                    <div className="p-6 rounded-xl bg-green-50 border-2 border-green-300">
                      <div className="flex items-start gap-3 mb-4">
                        <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                        <div>
                          <h4 className="font-bold text-lg mb-2 text-green-800">
                            🎉 Correto!
                          </h4>
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
                    <div className="p-6 rounded-xl bg-rose-50 border-2 border-rose-300">
                      <div className="flex items-start gap-3 mb-4">
                        <XCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                        <div>
                          <h4 className="font-bold text-lg mb-2 text-rose-800">
                            Incorreto - Resposta Correta:
                          </h4>
                          <div className="text-rose-800 mb-3">
                            <ul className="list-disc list-inside mt-1">
                              {correctAnswers.map((ans, idx) => (
                                <li key={idx} className="font-medium">{ans}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      {isPremium && currentCase.explanation && (
                        <div className="mt-4 pt-4 border-t border-rose-200">
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