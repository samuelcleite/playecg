import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flame, Target, Brain, Award, ChevronRight, Crown } from "lucide-react";
import { motion } from "framer-motion";

export default function StatsPanel({ stats, streakDays, earnedAchievements, isPremium }) {
  return (
    <div className="space-y-4">
      {/* Streak Card */}
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl flex items-center justify-center shadow-md">
                <Flame className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-3xl font-black text-orange-600">{streakDays}</p>
                <p className="text-sm text-orange-700 font-medium">
                  {streakDays === 1 ? "dia em sequência" : "dias em sequência"}
                </p>
              </div>
            </div>
            {streakDays === 0 && (
              <p className="text-xs text-orange-600 mt-2 bg-orange-100 rounded-lg px-2 py-1">
                Pratique hoje para iniciar sua sequência! 🔥
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats Card */}
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
        <Card className="border border-gray-200 bg-white">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-600" />
              Suas Estatísticas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-blue-50 rounded-xl">
                <p className="text-2xl font-black text-blue-600">{stats.total}</p>
                <p className="text-xs text-gray-600 mt-0.5">Tentativas</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-xl">
                <p className="text-2xl font-black text-green-600">{stats.accuracy}%</p>
                <p className="text-xs text-gray-600 mt-0.5">Acurácia</p>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-xl">
                <p className="text-2xl font-black text-purple-600">{stats.correct}</p>
                <p className="text-xs text-gray-600 mt-0.5">Acertos</p>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-xl">
                <p className="text-2xl font-black text-orange-600">{streakDays}</p>
                <p className="text-xs text-gray-600 mt-0.5">Dias em sequência</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Achievements Card */}
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border border-gray-200 bg-white">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <Award className="w-4 h-4 text-purple-600" />
                Conquistas
              </CardTitle>
              <Link to={createPageUrl("Achievements")}>
                <Button variant="ghost" size="sm" className="text-purple-600 h-6 text-xs gap-0.5 px-2">
                  Ver todas <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {earnedAchievements.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-2xl mb-1">🏆</p>
                <p className="text-xs text-gray-500">Nenhuma conquista ainda.</p>
                <p className="text-xs text-gray-400">Continue praticando!</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {earnedAchievements.slice(0, 8).map((ach) => (
                  <div
                    key={ach.id}
                    title={ach.name}
                    className="w-full aspect-square bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl flex items-center justify-center text-2xl cursor-default hover:scale-110 transition-transform"
                  >
                    {ach.icon}
                  </div>
                ))}
                {earnedAchievements.length > 8 && (
                  <div className="w-full aspect-square bg-gray-100 rounded-xl flex items-center justify-center text-xs font-bold text-gray-500">
                    +{earnedAchievements.length - 8}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Upgrade CTA if not premium */}
      {!isPremium && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
          <Link to={createPageUrl("Upgrade")}>
            <Card className="border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 cursor-pointer hover:shadow-lg transition-all">
              <CardContent className="p-4 text-center">
                <Crown className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="font-bold text-amber-900 text-sm mb-1">Unlock Premium</p>
                <p className="text-xs text-amber-700 mb-3">Acesse toda a trilha de módulos e gamificação completa</p>
                <Button size="sm" className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
                  Ver Planos
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
          </Link>
        </motion.div>
      )}
    </div>
  );
}