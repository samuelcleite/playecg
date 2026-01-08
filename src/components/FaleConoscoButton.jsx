import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import FaleConosco from "@/components/FaleConosco";

export default function FaleConoscoButton() {
  const [showFaleConosco, setShowFaleConosco] = useState(false);

  return (
    <>
      <Button
        onClick={() => setShowFaleConosco(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
        size="icon"
      >
        <MessageCircle className="w-6 h-6" />
      </Button>

      <FaleConosco open={showFaleConosco} onOpenChange={setShowFaleConosco} />
    </>
  );
}