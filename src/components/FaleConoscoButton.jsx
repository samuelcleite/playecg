import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import FaleConosco from "@/components/FaleConosco";

export default function FaleConoscoButton() {
  const [showFaleConosco, setShowFaleConosco] = useState(false);

  return (
    <>
      {/* Mobile: fica acima da bottom nav (~64px de altura) */}
      <Button
        onClick={() => setShowFaleConosco(true)}
        className="fixed right-4 z-50 w-14 h-14 rounded-full shadow-2xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 md:bottom-6"
        style={{ bottom: 'max(72px, calc(env(safe-area-inset-bottom, 0px) + 72px))' }}
        size="icon"
      >
        <MessageCircle className="w-6 h-6" />
      </Button>

      <FaleConosco open={showFaleConosco} onOpenChange={setShowFaleConosco} />
    </>
  );
}