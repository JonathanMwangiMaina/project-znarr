import React, { useRef, useState, useEffect } from 'react';
import { Undo2, Redo2, Trash2, Brush, CircleDot } from 'lucide-react';

interface DrawingCanvasProps {
  onImageChange: (base64Image: string | null) => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
}

const BRUSH_COLORS = [
  { name: 'Chalk White', value: '#FFFFFF' },
  { name: 'Midnight Charcoal', value: '#1E293B' },
  { name: 'Neon Amber', value: '#F59E0B' },
  { name: 'Neon Emerald', value: '#10B981' },
  { name: 'Hot Crimson', value: '#EF4444' },
  { name: 'Vibrant Azure', value: '#3B82F6' },
  { name: 'Enchanted Violet', value: '#8B5CF6' },
];

const BRUSH_SIZES = [
  { name: 'Fine', value: 3 },
  { name: 'Medium', value: 7 },
  { name: 'Bold', value: 14 },
  { name: 'Super', value: 24 },
];

export default function DrawingCanvas({
  onImageChange,
  brushColor,
  setBrushColor,
  brushSize,
  setBrushSize,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // History lists for Undo/Redo operations
  const [history, setHistory] = useState<string[]>([]);
  const [redoList, setRedoList] = useState<string[]>([]);

  // Setup canvas size dynamically
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    
    // Save current canvas content represented as dataUrl inside temp image
    const tempUrl = canvas.toDataURL();

    // Set dimensions with high pixel density
    canvas.width = rect.width;
    canvas.height = Math.max(320, rect.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill white background (necessary for general sketch classification models)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Restore path content gracefully
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
    };
    img.src = tempUrl;
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  // Set initial white background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Set initial stroke style
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  // Update canvas state history
  const pushHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setHistory((prev) => [...prev, dataUrl]);
    setRedoList([]); // Clear redo stack on new action
    onImageChange(dataUrl);
  };

  // Undo stroke
  const undo = () => {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previousHistory = [...history];
    const undoneState = previousHistory.pop()!;
    setRedoList((prev) => [undoneState, ...prev]);
    setHistory(previousHistory);

    // Re-draw canvas with base state or last history element
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (previousHistory.length > 0) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        onImageChange(previousHistory[previousHistory.length - 1]);
      };
      img.src = previousHistory[previousHistory.length - 1];
    } else {
      onImageChange(null);
    }
  };

  // Redo stroke
  const redo = () => {
    const canvas = canvasRef.current;
    if (!canvas || redoList.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nextRedoList = [...redoList];
    const redoneState = nextRedoList.shift()!;
    setRedoList(nextRedoList);
    setHistory((prev) => [...prev, redoneState]);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      onImageChange(redoneState);
    };
    img.src = redoneState;
  };

  // Clear all pixels
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    setHistory([]);
    setRedoList([]);
    onImageChange(null);
  };

  // Coordinates solver
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  // Drawing event triggers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    
    // Apply styling parameters
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      pushHistory();
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Tool Strip & Board Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
        
        {/* Undo, Redo, Delete controls */}
        <div className="flex items-center gap-1.5" id="canvas-actions-panel">
          <button
            onClick={undo}
            disabled={history.length === 0}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:hover:bg-slate-800 transition-colors flex items-center gap-1 text-sm font-medium"
            title="Undo stroke"
            id="btn-undo"
          >
            <Undo2 className="w-4 h-4" />
            <span className="hidden sm:inline">Undo</span>
          </button>

          <button
            onClick={redo}
            disabled={redoList.length === 0}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:hover:bg-slate-800 transition-colors flex items-center gap-1 text-sm font-medium"
            title="Redo stroke"
            id="btn-redo"
          >
            <Redo2 className="w-4 h-4" />
            <span className="hidden sm:inline">Redo</span>
          </button>

          <button
            onClick={clearCanvas}
            className="p-2 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-red-200 border border-red-800/20 transition-colors flex items-center gap-1 text-sm font-medium"
            title="Clear all"
            id="btn-clear"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear</span>
          </button>
        </div>

        {/* Brush parameters - Colors */}
        <div className="flex items-center gap-2" id="canvas-pallette-controls">
          <div className="flex items-center gap-1.5 flex-wrap">
            {BRUSH_COLORS.map((color) => {
              const worksOnWhite = color.value !== '#FFFFFF';
              return (
                <button
                  key={color.value}
                  onClick={() => setBrushColor(color.value)}
                  className={`w-7 h-7 rounded-full transition-all relative transform hover:scale-110 active:scale-95 ${
                    brushColor === color.value 
                      ? 'ring-2 ring-amber-400 scale-105' 
                      : 'hover:opacity-100 opacity-85'
                  }`}
                  style={{ 
                    backgroundColor: color.value,
                    border: worksOnWhite ? 'none' : '2px solid rgba(148, 163, 184, 0.4)' 
                  }}
                  title={color.name}
                  id={`color-btn-${color.name.toLowerCase().replace(/\s/g, '-')}`}
                />
              );
            })}
          </div>
        </div>

        {/* Brush sizes */}
        <div className="flex items-center gap-1 bg-slate-950/50 p-1 rounded-lg border border-slate-800" id="brush-size-controls">
          <Brush className="w-3.5 h-3.5 text-slate-400 mx-1.5" />
          {BRUSH_SIZES.map((sz) => (
            <button
              key={sz.value}
              onClick={() => setBrushSize(sz.value)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${
                brushSize === sz.value
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              id={`size-btn-${sz.name.toLowerCase()}`}
            >
              {sz.name}
            </button>
          ))}
        </div>

      </div>

      {/* Actual Drawing Board Pad Frame */}
      <div 
        ref={containerRef} 
        className="w-full relative rounded-2xl overflow-hidden border-2 border-slate-800 bg-white shadow-xl cursor-crosshair group flex flex-col justify-between"
        id="canvas-boundary"
        style={{ height: '360px' }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full touch-none"
          id="drawing-surface"
        />

        {/* Visual guide overlay inside canvas */}
        {history.length === 0 && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-center p-4">
            <div className="p-3 rounded-full bg-slate-900/5 text-slate-400 mb-2">
              <Brush className="w-8 h-8 opacity-40 animate-pulse text-indigo-400" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Pick a color, brush size, and start drawing here!</p>
            <p className="text-xs text-slate-400 mt-1 max-w-[260px]">Works beautifully with touch screens, trackpads, and stylus inputs.</p>
          </div>
        )}
      </div>
    </div>
  );
}
