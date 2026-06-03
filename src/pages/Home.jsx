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
      title: "Se divirta",
      description: "Esqueça aquela conversa de potencial de ação e aprenda ECG enquanto joga.",
      bg: "bg-[#22C55E]"
    }
  ];

  const premiumFeatures = [
    "Trilha de aprendizado completa",
    "Módulos estruturados com sequência lógica",
    "Explicações teóricas disponíveis antes de cada fase",
    "Ganhe troféus a cada conquista",
    "Acesso ilimitado a todos os casos"
  ];

  const freeFeatures = [
    "Acesso a todos os casos clínicos, de maneira aleatória"
  ];

  return (
    <div className="min-h-screen bg-[#0D3B66]">
      {/* Header */}
      <header className="bg-[#0D3B66] border-b border-blue-800 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/88192cd50_903B5817-5009-4B34-8478-509B00A9C6B8.png" alt="PlayECG" className="w-9 h-9 rounded-xl shadow-md" />
            <span className="font-bold text-white text-xl">PlayECG</span>
          </div>
          <div className="hidden sm:flex items-center gap-3">
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
              Domine a leitura do{" "}
              <span className="text-[#22C55E]">ECG</span>{" "}
              jogando
            </h1>
            <p className="text-xl text-blue-200 mb-12 max-w-2xl mx-auto">
              Mais de 1200 exames para você aprender a interpretar um eletrocardiograma na prática, sem excesso de teoria.
            </p>
            <div className="flex justify-center">
              <Button
                onClick={handleLogin}
                size="lg"
                className="bg-[#22C55E] hover:bg-green-600 text-white text-lg px-10 py-6 shadow-xl font-semibold"
              >
                Entrar / Cadastrar
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
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

      {/* Planos */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <h2 className="text-3xl font-bold text-white text-center mb-8">Conheça nossas versões</h2>

          {/* Premium */}
          <Card className="border border-[#1976D2] shadow-2xl bg-[#1976D2]/20 overflow-hidden">
            <CardContent className="p-8">
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
            </CardContent>
          </Card>

          {/* Gratuita */}
          <Card className="border border-blue-800 shadow-lg bg-[#0D3B66]/60 overflow-hidden">
            <CardContent className="p-8">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-7 h-7 text-blue-300" />
                <h2 className="text-2xl font-bold text-white">Versão Gratuita</h2>
              </div>
              <ul className="space-y-2 mb-6">
                {freeFeatures.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-blue-100">
                    <CheckCircle className="w-4 h-4 text-blue-300 flex-shrink-0" />
                    <span className="text-sm">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={handleLogin}
                variant="outline"
                className="border-blue-400 text-blue-200 hover:bg-blue-800 bg-transparent gap-2 px-8 py-3 text-base"
              >
                Começar Gratuitamente
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Mobile fixed bottom CTA */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0D3B66] border-t border-blue-800 px-6 py-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
        <Button
          onClick={handleLogin}
          size="lg"
          className="w-full bg-[#22C55E] hover:bg-green-600 text-white text-base font-bold py-5 shadow-xl"
        >
          Entrar / Cadastrar
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>

      {/* Footer */}
      <footer className="py-8 px-6 text-center text-blue-300 text-sm border-t border-blue-800 bg-[#0D3B66]">
        <div className="flex items-center justify-center gap-2 mb-2">
          <img src="https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/88192cd50_903B5817-5009-4B34-8478-509B00A9C6B8.png" alt="PlayECG" className="w-5 h-5 rounded" />
          <span className="font-semibold text-white">PlayECG</span>
        </div>
        <p>Aprenda ECG jogando. Sua evolução começa aqui.</p>
      </footer>
    </div>
  );
}