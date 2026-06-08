import React, { useRef, useState, useEffect } from 'react';
import { RotateCcw, Check } from 'lucide-react';

interface SignatureCanvasProps {
  onSave: (base64Image: string) => void;
  placeholder?: string;
}

export default function SignatureCanvas({ onSave, placeholder = "यहाँ हस्ताक्षर करें (Sign Here)" }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Handle high DPI screens
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(2, 2);
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1e293b'; // Slate 800
    }

    // Prevent scrolling on mobile when signing
    const preventScroll = (e: TouchEvent) => {
      if (e.target === canvas) {
        e.preventDefault();
      }
    };
    document.body.addEventListener('touchstart', preventScroll, { passive: false });
    document.body.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.body.removeEventListener('touchstart', preventScroll);
      document.body.removeEventListener('touchmove', preventScroll);
    };
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSigned(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    // Auto-save on stop drawing
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      onSave(dataUrl);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
    onSave('');
  };

  return (
    <div className="w-full">
      <div className="relative border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-50 shadow-inner">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-40 cursor-crosshair touch-none"
        />
        {!hasSigned && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-400 text-sm font-medium">
            {placeholder}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={clearCanvas}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 rounded border border-rose-200 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          साफ़ करें (Clear)
        </button>
      </div>
    </div>
  );
}
