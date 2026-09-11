import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Maximize2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

/* Visualização ampliada do ECG: botões, roda do mouse, arrastar e pinça.
   Vivia copiada, idêntica, no Quiz e no ModuleDetail — com o próprio estado
   de zoom espalhado em seis useState de cada página. Aqui o estado é interno e
   volta ao zero a cada abertura. */

const MIN = 1;
const MAX = 4;

export default function EcgZoomDialog({ open, onClose, src }) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState(0);

  const limitar = (z) => {
    const c = Math.max(MIN, Math.min(MAX, z));
    if (c <= 1.5) setPosition({ x: 0, y: 0 });
    return c;
  };

  const reset = () => {
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
    setLastTouchDistance(0);
  };

  const fechar = () => {
    reset();
    onClose?.();
  };

  const handleMouseDown = (e) => {
    if (zoomLevel > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && zoomLevel > 1) {
      e.preventDefault();
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const distancia = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1 && zoomLevel > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    } else if (e.touches.length === 2) {
      e.preventDefault();
      setLastTouchDistance(distancia(e.touches));
      setIsDragging(false);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isDragging && zoomLevel > 1) {
      e.preventDefault();
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    } else if (e.touches.length === 2) {
      e.preventDefault();
      const d = distancia(e.touches);
      if (lastTouchDistance > 0) {
        const escala = d / lastTouchDistance;
        setZoomLevel((prev) => limitar(prev * escala));
      }
      setLastTouchDistance(d);
      setIsDragging(false);
    }
  };

  const handleTouchEnd = (e) => {
    setIsDragging(false);
    if (e.touches.length < 2) setLastTouchDistance(0);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoomLevel((prev) => limitar(prev + delta));
  };

  return (
    <Dialog open={open} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-blue-200">
        <DialogHeader className="px-4 pt-4 pb-3 md:px-6 md:pt-6">
          <div className="flex flex-col gap-3">
            <DialogTitle className="flex items-center gap-2 text-gray-800 text-base md:text-lg">
              <Maximize2 className="w-4 h-4 md:w-5 md:h-5" />
              Visualização Ampliada
            </DialogTitle>
            <div className="flex items-center gap-2 justify-center md:justify-start flex-wrap">
              <Button
                variant="outline"
                size="icon"
                aria-label="Reduzir"
                onClick={() => setZoomLevel((prev) => limitar(prev - 0.5))}
                disabled={zoomLevel <= MIN}
                className="border-blue-200 hover:bg-blue-50 h-9 w-9"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Badge variant="outline" className="px-3 py-1 border-blue-200">
                {Math.round(zoomLevel * 100)}%
              </Badge>
              <Button
                variant="outline"
                size="icon"
                aria-label="Ampliar"
                onClick={() => setZoomLevel((prev) => limitar(prev + 0.5))}
                disabled={zoomLevel >= MAX}
                className="border-blue-200 hover:bg-blue-50 h-9 w-9"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Resetar zoom"
                onClick={reset}
                className="border-blue-200 hover:bg-blue-50 h-9 w-9"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="px-4 pb-4 md:px-6 md:pb-6">
          <div
            className="relative bg-blue-50 rounded-lg overflow-hidden touch-none border border-blue-200"
            style={{ height: "60vh" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            <div
              className={`absolute inset-0 flex items-center justify-center ${
                isDragging ? "cursor-grabbing" : zoomLevel > 1 ? "cursor-grab" : "cursor-default"
              }`}
              style={{
                transform: `scale(${zoomLevel}) translate(${position.x / zoomLevel}px, ${position.y / zoomLevel}px)`,
                transition: isDragging ? "none" : "transform 0.2s ease-out",
              }}
            >
              {src && (
                <img
                  src={src}
                  alt="ECG Ampliado"
                  className="max-w-full max-h-full object-contain select-none"
                  draggable={false}
                />
              )}
            </div>
          </div>

          <div className="mt-4 text-center text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
            {zoomLevel > 1 ? (
              <p>
                <span className="hidden md:inline">Use o mouse para arrastar e mover a imagem • Role o mouse para ajustar o zoom</span>
                <span className="md:hidden">Arraste com um dedo para mover • Use dois dedos para dar zoom (pinch)</span>
              </p>
            ) : (
              <p>
                <span className="hidden md:inline">Use os botões acima ou role o mouse para aplicar zoom</span>
                <span className="md:hidden">Use os botões acima ou dois dedos para aplicar zoom (pinch)</span>
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
