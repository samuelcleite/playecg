import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Activity,
  Brain,
  BookOpen,
  Trophy,
  Crown,
  Zap,
  CheckCircle,
  ArrowRight,
  Star
} from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    base44.auth.isAuthenticated().then((authed) => {
      if (authed) {
        navigate(createPageUrl("Dashboard"), { replace: true });
      } else {
        setIsAuthenticated(false);
      }
    });
  }, []);

  const handleLogin = () => {
    base44.auth.redirectToLogin(window.location.origin + createPageUrl("Dashboard"));
  };

  const features = [
    {
      icon: Brain,
      title: "Quiz Interativo",
      description: "Resolva casos de ECG reais e teste seus conhecimentos a qualquer momento.",
      color: "from-blue-500 to-indigo-600"
    },
    {
      icon: BookOpen,
      title: "Trilha Estruturada",
      description: "Aprenda do básico ao avançado com módulos progressivos e didáticos.",
      color: "from-purple-500 to-pink-600"
    },
    {
      icon: Trophy,
      title: "Gamificação",
      description: "Conquiste badges, mantenha sequências e acompanhe sua evolução.",
      color: "from-amber-500 to-orange-600"
    },
    {
      icon: Star,
      title: "Caso do Dia",
      description: "Um novo desafio todos os dias com explicação detalhada.",
      color: "from-green-500 to-emerald-600"
    }
  ];

  const premiumFeatures = [
    "Trilha de aprendizado completa",
    "Todos os módulos desbloqueados",
    "Explicações detalhadas por caso",
    "Sistema de gamificação avançado",
    "Badges e troféus exclusivos",
    "Acesso ilimitado a todos os casos"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b border-purple-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-xl">PlayECG</span>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link to={createPageUrl("Dashboard")}>
                <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white">
                  Ir para Dashboard
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            ) : (
              <Button onClick={handleLogin} className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white">
                Entrar
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Badge className="bg-purple-100 text-purple-800 border border-purple-200 mb-6 text-sm px-4 py-1 hover:bg-purple-100 pointer-events-none">
              <Zap className="w-3 h-3 mr-1" />
              Aprenda ECG de forma inteligente
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Domine a leitura de{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">
                ECG
              </span>{" "}
              jogando
            </h1>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
              A plataforma gamificada para médicos e estudantes aprenderem interpretação de eletrocardiograma com casos clínicos reais.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={handleLogin}
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-lg px-8 py-6 shadow-xl"
              >
                Começar Gratuitamente
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Link to={createPageUrl("Upgrade")}>
                <Button size="lg" variant="outline" className="border-2 border-amber-300 text-amber-800 hover:bg-amber-50 text-lg px-8 py-6">
                  <Crown className="w-5 h-5 mr-2 text-amber-600" />
                  Ver Planos Premium
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 bg-white/60">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Tudo que você precisa para aprender ECG
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 h-full">
                  <CardContent className="p-6 text-center">
                    <div className={`w-14 h-14 bg-gradient-to-br ${feature.color} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md`}>
                      <feature.icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="font-bold text-gray-900 text-lg mb-2">{feature.title}</h3>
                    <p className="text-gray-600 text-sm">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Premium CTA */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <Card className="border-none shadow-2xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 overflow-hidden">
            <CardContent className="p-10">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-4">
                    <Crown className="w-7 h-7 text-amber-600" />
                    <h2 className="text-2xl font-bold text-gray-900">Versão Premium</h2>
                  </div>
                  <ul className="space-y-2 mb-6">
                    {premiumFeatures.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-gray-700">
                        <CheckCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span className="text-sm">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-baseline gap-2 mb-6">
                    <span className="text-4xl font-bold text-gray-900">R$ 10</span>
                    <span className="text-gray-600">/mês</span>
                  </div>
                  <Link to={createPageUrl("Upgrade")}>
                    <Button className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white gap-2 px-8 py-3 text-base shadow-lg">
                      <Crown className="w-5 h-5" />
                      Assinar Premium
                    </Button>
                  </Link>
                </div>
                <div className="w-48 h-48 bg-gradient-to-br from-amber-200 to-orange-300 rounded-full flex items-center justify-center shadow-xl flex-shrink-0">
                  <Crown className="w-24 h-24 text-amber-700" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 text-center text-gray-500 text-sm border-t border-purple-100 bg-white/60">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-purple-600" />
          <span className="font-semibold text-gray-700">PlayECG</span>
        </div>
        <p>Aprenda ECG jogando. Sua evolução começa aqui.</p>
      </footer>
    </div>
  );
}