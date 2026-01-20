import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { User } from "@/entities/User";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  Target,
  Trophy,
  Zap,
  BookOpen,
  TrendingUp,
  CheckCircle,
  Users,
  Activity,
  Crown,
  ArrowRight
} from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const user = await User.me();
      if (user) {
        setIsAuthenticated(true);
      }
    } catch (error) {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    navigate(createPageUrl("Dashboard"));
  };

  const handleLogin = () => {
    User.redirectToLogin(window.location.origin + createPageUrl("Dashboard"));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const features = [
    {
      icon: Brain,
      title: "Quiz Inteligente",
      description: "Casos reais de ECG para praticar diagnósticos e desenvolver suas habilidades"
    },
    {
      icon: BookOpen,
      title: "Módulos Estruturados",
      description: "Aprenda de forma progressiva com conteúdo organizado por dificuldade"
    },
    {
      icon: Trophy,
      title: "Gamificação",
      description: "Ganhe troféus, conquiste achievements e acompanhe seu progresso"
    },
    {
      icon: Target,
      title: "Caso do Dia",
      description: "Desafio diário com explicações detalhadas para aprendizado contínuo"
    },
    {
      icon: TrendingUp,
      title: "Acompanhe Evolução",
      description: "Estatísticas completas de desempenho e progresso de aprendizado"
    },
    {
      icon: Zap,
      title: "Feedback Instantâneo",
      description: "Respostas imediatas com explicações detalhadas para cada caso"
    }
  ];

  const steps = [
    {
      number: "1",
      title: "Crie sua Conta",
      description: "Registre-se gratuitamente e comece a praticar imediatamente"
    },
    {
      number: "2",
      title: "Pratique ECG",
      description: "Resolva casos reais e aprenda com feedback detalhado"
    },
    {
      number: "3",
      title: "Evolua Continuamente",
      description: "Acompanhe seu progresso e desbloqueie novos conteúdos"
    }
  ];

  const stats = [
    { icon: Users, value: "1000+", label: "Estudantes Ativos" },
    { icon: Activity, value: "5000+", label: "Casos Resolvidos" },
    { icon: Trophy, value: "50+", label: "Conquistas Únicas" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-purple-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-xl">PlayECG</h1>
              <p className="text-xs text-gray-600">Aprenda ECG jogando</p>
            </div>
          </div>
          {isAuthenticated ? (
            <Button 
              onClick={handleGoToDashboard}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              Ir para Dashboard
            </Button>
          ) : (
            <Button 
              onClick={handleLogin}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              Entrar
            </Button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge className="mb-6 bg-purple-100 text-purple-800 border-purple-200">
              🎮 Aprendizado Gamificado
            </Badge>
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Domine a Interpretação de
              <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent"> ECG</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              Transforme o aprendizado de eletrocardiografia em uma experiência divertida e eficaz. 
              Pratique com casos reais, ganhe troféus e evolua suas habilidades diagnósticas.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isAuthenticated ? (
                <Button 
                  onClick={handleGoToDashboard}
                  size="lg"
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-lg px-8 py-6 shadow-xl"
                >
                  Ir para Dashboard
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              ) : (
                <Button 
                  onClick={handleLogin}
                  size="lg"
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-lg px-8 py-6 shadow-xl"
                >
                  Começar Gratuitamente
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              )}
            </div>
            {!isAuthenticated && <p className="text-sm text-gray-500 mt-4">✨ Sem cartão de crédito necessário</p>}
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16"
          >
            {stats.map((stat, index) => (
              <Card key={index} className="border-none shadow-lg bg-white/80 backdrop-blur-sm">
                <CardContent className="p-6 text-center">
                  <stat.icon className="w-8 h-8 text-purple-600 mx-auto mb-3" />
                  <p className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</p>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-white/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Por que escolher o PlayECG?
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Uma plataforma completa que combina educação médica de qualidade com mecânicas de jogos
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 bg-white h-full">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg flex items-center justify-center mb-4">
                      <feature.icon className="w-6 h-6 text-purple-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-gray-600">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Como Funciona
            </h2>
            <p className="text-lg text-gray-600">
              Apenas 3 passos para começar sua jornada de aprendizado
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
                viewport={{ once: true }}
                className="relative"
              >
                <Card className="border-none shadow-lg bg-white">
                  <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold shadow-xl">
                      {step.number}
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">
                      {step.title}
                    </h3>
                    <p className="text-gray-600">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                    <ArrowRight className="w-8 h-8 text-purple-300" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Premium Section */}
      <section className="py-20 px-6 bg-gradient-to-br from-purple-600 to-blue-600">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <Crown className="w-16 h-16 text-yellow-300 mx-auto mb-6" />
            <h2 className="text-4xl font-bold text-white mb-4">
              Upgrade para Premium
            </h2>
            <p className="text-xl text-purple-100 mb-8">
              Desbloqueie módulos estruturados, gamificação completa e acelere seu aprendizado
            </p>
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              {[
                "Módulos Progressivos",
                "Sistema de Fases",
                "Troféus Exclusivos",
                "Casos Ilimitados",
                "Estatísticas Avançadas",
                "Suporte Prioritário"
              ].map((benefit, index) => (
                <div key={index} className="flex items-center gap-2 text-white bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                  <CheckCircle className="w-5 h-5 text-green-300 flex-shrink-0" />
                  <span className="text-sm">{benefit}</span>
                </div>
              ))}
            </div>
            <Button 
              onClick={handleLogin}
              size="lg"
              className="bg-white text-purple-600 hover:bg-gray-100 text-lg px-8 py-6 shadow-xl"
            >
              Experimentar Agora
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <Card className="border-none shadow-2xl bg-gradient-to-br from-blue-50 to-purple-50">
            <CardContent className="p-12 text-center">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Pronto para Começar?
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Junte-se a milhares de estudantes que já estão dominando a interpretação de ECG
              </p>
              <Button 
                onClick={handleLogin}
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-lg px-8 py-6 shadow-xl"
              >
                Criar Conta Gratuita
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white/80 backdrop-blur-sm border-t border-purple-100 py-8 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900">PlayECG</span>
          </div>
          <p className="text-sm text-gray-600">
            © 2026 PlayECG. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}