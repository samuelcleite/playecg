
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Lock,
  CheckCircle,
  Star,
  ArrowRight,
  Trophy,
  Zap
} from "lucide-react";
import { motion } from "framer-motion";

export default function Modules() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [modules, setModules] = useState([]);
  const [progress, setProgress] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Changed to base44.auth.me() as per outline
    const userData = await base44.auth.me();
    setUser(userData);

    if (userData.subscription_type !== "premium") {
      navigate(createPageUrl("Upgrade"));
      return;
    }

    // Changed to base44.entities.Module.list() as per outline
    const modulesData = await base44.entities.Module.list("order");
    setModules(modulesData);

    // Changed to base44.entities.UserProgress.filter() as per outline
    const progressData = await base44.entities.UserProgress.filter({ user_email: userData.email });
    const progressMap = {};
    progressData.forEach(p => {
      progressMap[p.module_id] = p;
    });
    setProgress(progressMap);
  };

  // Removed getDifficultyColor function as per outline

  const isModuleUnlocked = (module) => {
    return (user?.points || 0) >= (module.required_points || 0);
  };

  const getCompletionPercentage = (moduleId, totalCases) => {
    const prog = progress[moduleId];
    if (!prog || !totalCases) return 0;
    return Math.round((prog.completed_cases.length / totalCases) * 100);
  };

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Trilha de Aprendizado
          </h1>
          <p className="text-gray-600 text-lg">
            Progrida pelos módulos e torne-se um especialista em ECG
          </p>
        </div>

        {/* Stats Banner */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="border-none shadow-lg bg-gradient-to-br from-blue-500 to-indigo-600">
            <CardContent className="p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Módulos Completos</p>
                  <p className="text-3xl font-bold mt-1">
                    {Object.values(progress).filter(p => p.completed).length}/{modules.length}
                  </p>
                </div>
                <Trophy className="w-12 h-12 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-amber-500 to-orange-500">
            <CardContent className="p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Pontuação Total</p>
                  <p className="text-3xl font-bold mt-1">{user?.points || 0}</p>
                </div>
                <Star className="w-12 h-12 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-green-500 to-emerald-600">
            <CardContent className="p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Nível Atual</p>
                  <p className="text-3xl font-bold mt-1">{user?.level || 1}</p>
                </div>
                <Zap className="w-12 h-12 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Modules List */}
        <div className="space-y-6">
          {modules.map((module, index) => {
            const unlocked = isModuleUnlocked(module);
            const completed = progress[module.id]?.completed || false;
            const completionPercentage = getCompletionPercentage(module.id, module.total_cases);

            return (
              <motion.div
                key={module.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`border-none shadow-lg hover:shadow-xl transition-all duration-300 ${
                  !unlocked ? 'opacity-60' : ''
                }`}>
                  <CardContent className="p-8">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Module Icon */}
                      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl shadow-lg ${
                        completed
                          ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                          : unlocked
                            ? 'bg-gradient-to-br from-indigo-500 to-purple-600' // Updated color from getDifficultyColor
                            : 'bg-gray-400'
                      }`}>
                        {completed ? (
                          <CheckCircle className="w-10 h-10" />
                        ) : unlocked ? (
                          module.order
                        ) : (
                          <Lock className="w-8 h-8" />
                        )}
                      </div>

                      {/* Module Info */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">
                              {module.name}
                            </h3>
                            <p className="text-gray-600">{module.description}</p>
                          </div>
                          {/* Removed Badge component as per outline */}
                        </div>

                        {/* Progress Bar */}
                        {unlocked && (
                          <div className="mb-4">
                            <div className="flex justify-between text-sm text-gray-600 mb-2">
                              <span>Progresso</span>
                              <span>{completionPercentage}%</span>
                            </div>
                            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${completionPercentage}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-600" // Updated color from getDifficultyColor
                              />
                            </div>
                          </div>
                        )}

                        {/* Action Button */}
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-gray-500">
                            {module.total_cases} casos • {module.required_points} pontos para desbloquear
                          </div>
                          {unlocked ? (
                            <Link to={`${createPageUrl("ModulePhases")}?id=${module.id}`}>
                              <Button className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"> {/* Updated color from getDifficultyColor */}
                                {completed ? 'Revisar' : 'Continuar'}
                                <ArrowRight className="w-4 h-4" />
                              </Button>
                            </Link>
                          ) : (
                            <Button disabled className="gap-2">
                              <Lock className="w-4 h-4" />
                              Bloqueado
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {modules.length === 0 && (
            <Card className="border-none shadow-lg">
              <CardContent className="p-12 text-center">
                <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Nenhum módulo disponível ainda
                </h3>
                <p className="text-gray-600">
                  Novos módulos serão adicionados em breve!
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
