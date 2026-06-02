import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Share, MoreVertical, Plus, Home, ArrowRight, CheckCircle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroid = () => /android/i.test(navigator.userAgent);

const steps_ios = [
  {
    icon: Share,
    iconBg: "bg-blue-500",
    title: 'Toque em "Compartilhar"',
    description: 'Na barra inferior do Safari, toque no ícone de compartilhar (quadrado com seta para cima).',
  },
  {
    icon: Plus,
    iconBg: "bg-green-500",
    title: '"Adicionar à Tela de Início"',
    description: 'Role o menu para baixo e toque em "Adicionar à Tela de Início".',
  },
  {
    icon: CheckCircle,
    iconBg: "bg-[#22C55E]",
    title: 'Confirme e pronto!',
    description: 'Toque em "Adicionar" no canto superior direito. O ícone do PlayECG aparecerá na sua tela.',
  },
];

const steps_android = [
  {
    icon: MoreVertical,
    iconBg: "bg-blue-500",
    title: 'Toque no menu "⋮"',
    description: 'No Chrome, toque nos três pontinhos no canto superior direito do navegador.',
  },
  {
    icon: Home,
    iconBg: "bg-green-500",
    title: '"Adicionar à tela inicial"',
    description: 'Selecione a opção "Adicionar à tela inicial" ou "Instalar aplicativo".',
  },
  {
    icon: CheckCircle,
    iconBg: "bg-[#22C55E]",
    title: 'Confirme e pronto!',
    description: 'Toque em "Adicionar". O ícone do PlayECG aparecerá na sua tela inicial.',
  },
];

export default function InstallPWA() {
  const [platform, setPlatform] = useState(() => {
    if (isIOS()) return "ios";
    if (isAndroid()) return "android";
    return "ios"; // default
  });

  const steps = platform === "ios" ? steps_ios : steps_android;

  return (
    <div className="min-h-screen bg-[#0D3B66] flex flex-col">
      {/* Header */}
      <header className="bg-[#0D3B66] border-b border-blue-800 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <img
            src="https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/b3de8adaa_image.png"
            alt="PlayECG"
            className="w-9 h-9 rounded-xl shadow-md"
          />
          <span className="font-bold text-white text-xl">PlayECG</span>
        </div>
        <Link to="/">
          <Button variant="ghost" className="text-blue-200 hover:text-white hover:bg-white/10 text-sm">
            Entrar
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 px-6 py-10 max-w-lg mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          {/* Title */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl overflow-hidden shadow-xl">
              <img
                src="https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/b3de8adaa_image.png"
                alt="PlayECG"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Instale o PlayECG</h1>
            <p className="text-blue-200 text-sm">
              Adicione o app à sua tela inicial e acesse rapidamente, como um app nativo — sem precisar da loja.
            </p>
          </div>

          {/* Platform selector */}
          <div className="flex gap-2 mb-8 bg-white/10 rounded-2xl p-1">
            <button
              onClick={() => setPlatform("ios")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                platform === "ios"
                  ? "bg-white text-[#0D3B66] shadow"
                  : "text-blue-200 hover:text-white"
              }`}
            >
              🍎 iPhone / iPad
            </button>
            <button
              onClick={() => setPlatform("android")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                platform === "android"
                  ? "bg-white text-[#0D3B66] shadow"
                  : "text-blue-200 hover:text-white"
              }`}
            >
              🤖 Android
            </button>
          </div>

          {/* Steps */}
          <div className="space-y-4 mb-10">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex gap-4 bg-white/10 rounded-2xl p-4 border border-white/10"
              >
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div className={`w-10 h-10 ${step.iconBg} rounded-xl flex items-center justify-center shadow`}>
                    <step.icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs text-blue-400 font-bold mt-1">{i + 1}</span>
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm mb-1">{step.title}</h3>
                  <p className="text-blue-200 text-xs leading-relaxed">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Tip */}
          <div className="bg-[#22C55E]/15 border border-[#22C55E]/40 rounded-2xl p-4 mb-8 flex gap-3 items-start">
            <Smartphone className="w-5 h-5 text-[#22C55E] flex-shrink-0 mt-0.5" />
            <p className="text-green-200 text-xs leading-relaxed">
              {platform === "ios"
                ? "Certifique-se de estar usando o Safari. O Chrome no iOS não permite instalar apps dessa forma."
                : "Certifique-se de estar usando o Chrome ou Edge. Outros navegadores podem não suportar a instalação."}
            </p>
          </div>

          {/* CTA */}
          <Link to="/" className="block">
            <Button className="w-full bg-[#22C55E] hover:bg-green-600 text-white font-bold py-4 text-base rounded-2xl shadow-lg">
              Acessar o PlayECG
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </motion.div>
      </main>

      <footer className="py-6 text-center text-blue-400 text-xs border-t border-blue-800">
        playecg.app/instale
      </footer>
    </div>
  );
}