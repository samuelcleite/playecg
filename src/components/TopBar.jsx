import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { calculateStreakDays } from "@/components/StreakCalculator";
import { Activity, Flame, Star, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TopBar() {
  const [user, setUser] = useState(null);
  const [streakDays, setStreakDays] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        const streak = await calculateStreakDays(userData.email);
        setStreakDays(streak);
      } catch (_) {}
    };
    load();
  }, []);

  const isPremium = user?.subscription_type === "premium";

  return (
    <header className="bg-white/90 backdrop-blur-sm border-b border-purple-100 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">PlayECG</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="font-bold text-orange-700 text-sm">{streakDays}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1.5">
            <Star className="w-4 h-4 text-yellow-500" />
            <span className="font-bold text-yellow-700 text-sm">{user?.points || 0}</span>
          </div>
          {!isPremium && (
            <Link to={createPageUrl("Upgrade")}>
              <Badge className="bg-amber-100 text-amber-800 border border-amber-300 cursor-pointer hover:bg-amber-200 transition-colors">
                <Crown className="w-3 h-3 mr-1" />
                Premium
              </Badge>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}