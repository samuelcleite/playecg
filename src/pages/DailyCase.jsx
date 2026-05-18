import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Calendar,
  Lightbulb,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function DailyCase() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dailyCase, setDailyCase] = useState(null);
  const [ecgCase, setEcgCase] = useState(null);
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);
  const [userAttempt, setUserAttempt] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [noCaseAvailable, setNoCaseAvailable] = useState(false);

  useEffect(() => {
    loadDailyCase();
  }, []);

  const loadDailyCase = async () => {
    setLoading(true);
    try {
      const userData = await base44.auth.me();
      setUser(userData);

      const response = await base44.functions.invoke('getDailyCase', {});

      if (response.data.success) {
        setDailyCase(response.data.daily_case);
        setEcgCase(response.data.ecg_case);
        setAlreadyAnswered(response.data.already_answered);
        setUserAttempt(response.data.user_attempt);
        
        if (response.data.already_answered) {
          setShowResult(true);
          setIsCorrect(response.data.user_attempt.correct);
          setSelectedAnswers([response.data.user_attempt.user_answer]);
        } else {
          setStartTime(Date.now());
        }
      } else {
        setNoCaseAvailable(true);
      }
    } catch (error) {
      console.error("Error loading daily case:", error);
      setNoCaseAvailable(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerToggle = (answer) => {
    if (showResult) return;

    if (ecgCase.multiple_correct) {
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

    const correctAnswers = ecgCase.correct_answers && ecgCase.correct_answers.length > 0
      ? ecgCase.correct_answers
      : [ecgCase.correct_diagnosis];

    let correct = false;
    if (ecgCase.multiple_correct) {
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

    await base44.entities.QuizAttempt.create({
      user_email: user.email,
      case_id: ecgCase.id,
      module_id: ecgCase.module_id,
      phase_id: ecgCase.phase_id,
      user_answer: selectedAnswers.join(", "),
      correct: correct,
      time_spent: timeSpent
    });

    setAlreadyAnswered(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#1976D2] mx-auto mb-4" />
          <p className="text-gray-600">Carregando caso do dia...</p>
        </div>
      </div>
    );
  }

  if (noCaseAvailable) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Nenhum Caso Disponível</h2>
            <p className="text-gray-600 mb-6">
              Não há caso do dia programado para hoje. Volte amanhã!
            </p>
            <Link to={createPageUrl("Dashboard")}>
              <Button>Voltar ao Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const correctAnswers = ecgCase.correct_answers && ecgCase.correct_answers.length > 0
    ? ecgCase.correct_answers
    : [ecgCase.correct_diagnosis];

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link to={createPageUrl("Dashboard")}>
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          </Link>
        </div>

        {/* Title Card */}
        <Card className="border-2 border-blue-200 bg-blue-50 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#0D3B66] rounded-full flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Caso do Dia</h1>
                <p className="text-gray-600">Desafio diário com explicação detalhada</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Already Answered Banner */}
        {alreadyAnswered && (
          <Alert className="bg-blue-50 border-blue-200">
            <CheckCircle2 className="w-5 h-5 text-blue-600" />
            <AlertDescription className="text-blue-900">
              Você já completou o caso do dia! Veja a explicação detalhada abaixo.
            </AlertDescription>
          </Alert>
        )}

        {/* Case Card */}
        <Card className="border border-blue-100 shadow-lg">
          <CardContent className="p-8">
            {/* Case Info */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <Badge className="bg-blue-100 text-[#0D3B66] border border-blue-200">
                <Calendar className="w-3 h-3 mr-1" />
                {new Date().toLocaleDateString('pt-BR')}
              </Badge>
              {ecgCase.multiple_correct && (
                <Badge className="bg-blue-100 text-blue-800 border border-blue-200">
                  Múltiplas Respostas
                </Badge>
              )}
            </div>

            {/* Patient Info */}
            {ecgCase.patient_info && (
              <Alert className="mb-6 bg-blue-50 border-blue-200">
                <AlertDescription className="text-gray-700">
                  <strong>Dados do Paciente:</strong> {ecgCase.patient_info}
                </AlertDescription>
              </Alert>
            )}

            {/* ECG Image */}
            {ecgCase.image_url && (
              <div className="mb-6 rounded-xl overflow-hidden border-2 border-blue-200">
                <img
                  src={ecgCase.image_url}
                  alt="ECG"
                  className="w-full h-auto"
                />
              </div>
            )}

            {/* Title */}
            <h3 className="font-semibold text-gray-800 text-xl mb-4">
              {ecgCase.title}
            </h3>

            {/* Options */}
            <div className="space-y-3 mb-6">
              <AnimatePresence>
                {ecgCase.options.map((option, index) => {
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
                        className={`w-full justify-start text-left p-6 h-auto min-h-[60px] transition-all duration-300 ${
                          showAsCorrect
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
                            showAsCorrect
                              ? 'bg-green-300 border-2 border-green-400'
                              : showAsIncorrect
                                ? 'bg-rose-300 border-2 border-rose-400'
                                : isSelected
                                  ? 'bg-[#1976D2] border-2 border-[#0D3B66]'
                                  : 'bg-gray-100'
                          }`}>
                            {showAsCorrect && <CheckCircle2 className="w-5 h-5 text-green-700" />}
                            {showAsIncorrect && <XCircle className="w-5 h-5 text-rose-700" />}
                            {!showResult && isSelected && <CheckCircle2 className="w-5 h-5 text-white" />}
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
                className="w-full bg-[#0D3B66] hover:bg-[#1976D2] text-white py-6 text-lg font-semibold"
              >
                {ecgCase.multiple_correct
                  ? `Confirmar Respostas (${selectedAnswers.length} selecionada${selectedAnswers.length !== 1 ? 's' : ''})`
                  : "Confirmar Resposta"}
              </Button>
            )}

            {/* Result and Detailed Explanation */}
            <AnimatePresence>
              {showResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className={`p-6 rounded-xl ${isCorrect ? 'bg-green-50 border-2 border-green-300' : 'bg-rose-50 border-2 border-rose-300'}`}>
                    <div className="flex items-start gap-3 mb-4">
                      {isCorrect ? (
                        <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                      ) : (
                        <XCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-1" />
                      )}
                      <div>
                        <h4 className={`font-bold text-lg mb-2 ${isCorrect ? 'text-green-800' : 'text-rose-800'}`}>
                          {isCorrect ? '🎉 Correto!' : 'Resposta Incorreta'}
                        </h4>
                        {!isCorrect && (
                          <div className="mb-3">
                            <p className="text-rose-800 font-semibold">Resposta correta:</p>
                            <ul className="list-disc list-inside mt-1">
                              {correctAnswers.map((ans, idx) => (
                                <li key={idx} className="text-rose-700">{ans}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Detailed Explanation */}
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <div className="flex items-start gap-2 mb-3">
                        <Lightbulb className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                        <h5 className="font-bold text-xl text-gray-800">Explicação Detalhada:</h5>
                      </div>
                      <div 
                        className="prose prose-lg max-w-none text-gray-700 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: dailyCase.detailed_explanation }}
                      />

                      {ecgCase.key_findings && ecgCase.key_findings.length > 0 && (
                        <div className="mt-6">
                          <h6 className="font-semibold text-gray-800 mb-2">Achados principais:</h6>
                          <ul className="list-disc list-inside space-y-1 text-gray-700">
                            {ecgCase.key_findings.map((finding, i) => (
                              <li key={i}>{finding}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <Link to={createPageUrl("Dashboard")}>
                      <Button
                        className="w-full mt-6 bg-[#1976D2] hover:bg-[#0D3B66] text-white gap-2"
                      >
                        Voltar ao Dashboard
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}