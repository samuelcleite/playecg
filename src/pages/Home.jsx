import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
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
      bg: "bg-[#1976D2]"
    },
    {
      icon: BookOpen,
      title: "Trilha Estruturada",
      description: "Aprenda do básico ao avançado com módulos progressivos e didáticos.",
      bg: "bg-[#0D3B66]"
    },
    {
      icon: Trophy,
      title: "Gamificação",
      description: "Conquiste badges, mantenha sequências e acompanhe sua evolução.",
      bg: "bg-[#22C55E]"
    },
    {
      icon: Star,
      title: "Caso do Dia",
      description: "Um novo desafio todos os dias com explicação detalhada.",
      bg: "bg-[#1976D2]"
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
    <div className="min-h-screen bg-[#0D3B66]">
      {/* Header */}
      <header className="bg-[#0D3B66] border-b border-blue-800 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-[#1976D2] rounded-xl flex items-center justify-center shadow-md">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white text-xl">PlayECG</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleLogin}
              className="bg-[#22C55E] hover:bg-green-600 text-white font-semibold"
            >
              Entrar
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 bg-[#1976D2]/30 border border-[#1976D2] text-blue-200 rounded-full px-4 py-1.5 text-sm mb-8">
              <Zap className="w-3.5 h-3.5 text-[#22C55E]" />
              Aprenda ECG de forma inteligente
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Domine a leitura de{" "}
              <span className="text-[#22C55E]">ECG</span>{" "}
              jogando
            </h1>
            <p className="text-xl text-blue-200 mb-12 max-w-2xl mx-auto">
              A plataforma gamificada para médicos e estudantes aprenderem interpretação de eletrocardiograma com casos clínicos reais.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={handleLogin}
                size="lg"
                className="bg-[#22C55E] hover:bg-green-600 text-white text-lg px-10 py-6 shadow-xl font-semibold"
              >
                Começar Gratuitamente
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Link to={createPageUrl("Upgrade")}>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-2 border-[#1976D2] text-blue-200 hover:bg-[#1976D2] hover:text-white text-lg px-10 py-6 bg-transparent"
                >
                  <Crown className="w-5 h-5 mr-2" />
                  Ver Planos Premium
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 bg-[#1976D2]/10">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
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
                <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 h-full bg-[#0D3B66] border border-blue-800">
                  <CardContent className="p-6 text-center">
                    <div className={`w-14 h-14 ${feature.bg} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md`}>
                      <feature.icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="font-bold text-white text-lg mb-2">{feature.title}</h3>
                    <p className="text-blue-200 text-sm">{feature.description}</p>
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
          <Card className="border border-[#1976D2] shadow-2xl bg-[#1976D2]/20 overflow-hidden">
            <CardContent className="p-10">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-4">
                    <Crown className="w-7 h-7 text-[#22C55E]" />
                    <h2 className="text-2xl font-bold text-white">Versão Premium</h2>
                  </div>
                  <ul className="space-y-2 mb-6">
                    {premiumFeatures.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-blue-100">
                        <CheckCircle className="w-4 h-4 text-[#22C55E] flex-shrink-0" />
                        <span className="text-sm">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to={createPageUrl("Upgrade")}>
                    <Button className="bg-[#22C55E] hover:bg-green-600 text-white gap-2 px-8 py-3 text-base shadow-lg font-semibold">
                      <Crown className="w-5 h-5" />
                      Assinar Premium
                    </Button>
                  </Link>
                </div>
                <div className="w-44 h-44 bg-[#1976D2] rounded-full flex items-center justify-center shadow-xl flex-shrink-0">
                  <Crown className="w-22 h-22 text-[#22C55E]" style={{ width: 88, height: 88 }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 text-center text-blue-300 text-sm border-t border-blue-800 bg-[#0D3B66]">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-[#22C55E]" />
          <span className="font-semibold text-white">PlayECG</span>
        </div>
        <p>Aprenda ECG jogando. Sua evolução começa aqui.</p>
      </footer>
    </div>
  );
}