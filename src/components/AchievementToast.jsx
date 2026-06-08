import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Trophy } from "lucide-react";

/**
 * Exibe um overlay celebrativo quando o usuário conquista um ou mais troféus.
 * Recebe uma lista de troféus (cada um com { id, name, icon }) e os mostra em fila.
 */
export default function AchievementToast({ achievements, onClose }) {
  const [index, setIndex] = useState(0);

  const list = achievements || [];
  const current = list[index];

  useEffect(() => {
    if (!current) return;
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.4 },
      colors: ["#39FF6A", "#7C4DFF", "#F5A623", "#3D6EA8"],
    });
  }, [index, current]);

  if (!current) return null;

  const handleNext = () => {
    if (index < list.length - 1) {
      setIndex(index + 1);
    } else {
      onClose();
    }
  };

  return ReactDOM.createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={handleNext}
      >
        <motion.div
          initial={{ scale: 0.6, y: 30 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 22 }}
          className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-sm w-full border-4 border-[#39FF6A]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-[#F5A623]" />
            <p className="text-xs font-black tracking-widest text-[#F5A623] uppercase">
              Novo Troféu!
            </p>
          </div>

          <motion.div
            initial={{ rotate: -15, scale: 0.5 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
            className="w-28 h-28 mx-auto rounded-full bg-gradient-to-br from-[#39FF6A]/20 to-[#7C4DFF]/20 border-4 border-[#7C4DFF] flex items-center justify-center text-6xl mb-4 shadow-lg"
          >
            {current.icon || "🏆"}
          </motion.div>

          <h3 className="text-2xl font-black text-gray-900 mb-1">{current.name}</h3>
          <p className="text-gray-500 text-sm mb-6">Parabéns, você desbloqueou uma nova conquista!</p>

          <button
            onClick={handleNext}
            className="w-full bg-[#0D1E30] hover:bg-[#1B3A5C] text-white font-bold py-3 rounded-2xl transition-colors"
          >
            {index < list.length - 1 ? `Próximo (${index + 1}/${list.length})` : "Continuar"}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}