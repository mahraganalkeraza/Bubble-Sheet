import React, { useEffect, useRef, useState } from 'react';
import { CalibrationData, Point, Box } from '../types.ts';
import { loadPdf, renderPdfPageToCanvas, PDF_RENDER_SCALE } from '../engine.ts';
import { Maximize, Save, ArrowRight, ArrowLeft } from 'lucide-react';

interface Props {
  pdfFile: File;
  calibration: CalibrationData;
  onCalibrationChange: (c: CalibrationData) => void;
  onSaveDefault: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function CalibrationView({
  pdfFile,
  calibration,
  onCalibrationChange,
  onSaveDefault,
  onNext,
  onBack
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);

  // Load the first page into the background canvas
  useEffect(() => {
    let active = true;
    const renderPdf = async () => {
      try {
        const doc = await loadPdf(pdfFile);
        const rawCanvas = await renderPdfPageToCanvas(doc, 1, PDF_RENDER_SCALE); // Match ProcessingView scale
        if (!active) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        canvas.width = rawCanvas.width;
        canvas.height = rawCanvas.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(rawCanvas, 0, 0);
        
        // Compute display scale to fit inside container
        if (containerRef.current) {
          const containerWidth = containerRef.current.clientWidth;
          const newScale = containerWidth / rawCanvas.width;
          setScale(newScale);
        }
        setLoading(false);
      } catch (e) {
        console.error('Failed to load PDF for calibration:', e);
        setLoading(false);
      }
    };
    renderPdf();
    return () => { active = false; };
  }, [pdfFile]);

  // Handle Dragging of pins and boxes
  const [draggingTarget, setDraggingTarget] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent, target: string, originalBox?: Box) => {
    e.stopPropagation();
    const targetElement = e.currentTarget;
    targetElement.setPointerCapture(e.pointerId);

    if (target.startsWith('box_')) {
      const parentRect = documentRef.current!.getBoundingClientRect();
      setDragOffset({
        x: (e.clientX - parentRect.left) / scale - originalBox!.x,
        y: (e.clientY - parentRect.top) / scale - originalBox!.y
      });
    } else if (target.startsWith('resize_')) {
      // For simplicity, just resize directly in PointerMove
    } else {
       // It's a point
    }
    setDraggingTarget(target);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingTarget) return;
    const parentRect = documentRef.current!.getBoundingClientRect();
    const x = (e.clientX - parentRect.left) / scale;
    const y = (e.clientY - parentRect.top) / scale;

    const newCal = { ...calibration };

    if (draggingTarget === 'topLeft') newCal.topLeft = { x, y };
    if (draggingTarget === 'topRight') newCal.topRight = { x, y };
    if (draggingTarget === 'bottomLeft') newCal.bottomLeft = { x, y };
    if (draggingTarget === 'bottomRight') newCal.bottomRight = { x, y };

    if (draggingTarget === 'box_qr') {
      newCal.qrBox.x = x - dragOffset.x;
      newCal.qrBox.y = y - dragOffset.y;
    }
    if (draggingTarget === 'resize_qr') {
      newCal.qrBox.width = Math.max(50, x - newCal.qrBox.x);
      newCal.qrBox.height = Math.max(50, y - newCal.qrBox.y);
    }

    if (draggingTarget === 'box_omr') {
      newCal.omrBox.x = x - dragOffset.x;
      newCal.omrBox.y = y - dragOffset.y;
    }
    if (draggingTarget === 'resize_omr') {
      newCal.omrBox.width = Math.max(50, x - newCal.omrBox.x);
      newCal.omrBox.height = Math.max(50, y - newCal.omrBox.y);
    }

    onCalibrationChange(newCal);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDraggingTarget(null);
  };

  const renderPin = (id: keyof CalibrationData, point: Point, label: string) => {
    return (
      <div 
        className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-blue-500/80 border-2 border-white shadow flex items-center justify-center cursor-move text-xs font-bold text-white z-10 hover:bg-blue-600 hover:scale-110 transition-transform touch-none"
        style={{ left: point.x * scale, top: point.y * scale }}
        onPointerDown={(e) => handlePointerDown(e, id as string)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {label}
      </div>
    );
  };

  const renderBox = (id: 'qr' | 'omr', box: Box, colorClass: string, label: string) => {
    return (
      <div 
        className={`absolute border-2 ${colorClass} bg-white/20 cursor-move z-10 touch-none flex flex-col`}
        style={{ 
          left: box.x * scale, 
          top: box.y * scale, 
          width: box.width * scale, 
          height: box.height * scale 
        }}
        onPointerDown={(e) => handlePointerDown(e, `box_${id}`, box)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="bg-black/50 text-white text-xs px-1 select-none pointer-events-none">{label}</div>
        <div className="flex-1 pointer-events-none" />
        {/* Resize Handle */}
        <div 
          className="absolute bottom-0 right-0 w-6 h-6 bg-black/40 cursor-se-resize touch-none"
          onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, `resize_${id}`); }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden h-full">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden h-full min-h-0">
        <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Visual Calibration (Manual ROI Selection)</h2>
          <div className="flex gap-2">
            <button 
              onClick={onBack}
              className="px-2 py-1 text-[10px] uppercase tracking-wide font-bold bg-white border border-slate-300 rounded hover:bg-slate-50"
            >
              Back
            </button>
            <button 
              onClick={onSaveDefault}
              className="px-2 py-1 text-[10px] uppercase tracking-wide font-bold bg-white border border-indigo-200 text-indigo-600 rounded flex items-center gap-1 hover:bg-indigo-50"
            >
              <Save className="w-3 h-3" /> Save Template
            </button>
            <button 
              onClick={onNext}
              className="px-4 py-1 text-[10px] uppercase tracking-wide font-bold bg-indigo-600 border border-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Confirm & Next
            </button>
          </div>
        </div>

        <div className="flex-1 relative bg-slate-800 flex flex-col p-4 overflow-auto min-h-0" ref={containerRef}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-20">
              <span className="text-slate-300 font-bold text-xs uppercase tracking-widest animate-pulse">Rendering PDF preview...</span>
            </div>
          )}
          
          <div className="flex-1 flex items-center justify-center min-h-0">
            <div 
              ref={documentRef}
              className="relative origin-top-left bg-white shadow-2xl touch-none" 
              style={{ 
                width: canvasRef.current ? canvasRef.current.width * scale : 'auto',
                height: canvasRef.current ? canvasRef.current.height * scale : 'auto'
              }}
            >
              <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
                <canvas ref={canvasRef} className="block pointer-events-none" />
              </div>
              
              {!loading && (
                <>
                  {renderPin('topLeft', calibration.topLeft, 'TL')}
                  {renderPin('topRight', calibration.topRight, 'TR')}
                  {renderPin('bottomLeft', calibration.bottomLeft, 'BL')}
                  {renderPin('bottomRight', calibration.bottomRight, 'BR')}
                  
                  <svg className="absolute top-0 left-0 pointer-events-none z-0 opacity-50" 
                       style={{ width: canvasRef.current?.width * scale, height: canvasRef.current?.height * scale }}>
                    <polygon 
                      points={`${calibration.topLeft.x * scale},${calibration.topLeft.y * scale} ${calibration.topRight.x * scale},${calibration.topRight.y * scale} ${calibration.bottomRight.x * scale},${calibration.bottomRight.y * scale} ${calibration.bottomLeft.x * scale},${calibration.bottomLeft.y * scale}`}
                      fill="none" 
                      stroke="#f43f5e" 
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                  </svg>

                  {renderBox('qr', calibration.qrBox, 'border-emerald-500 bg-emerald-500/5', 'QR_DETECTION_AREA')}
                  {renderBox('omr', calibration.omrBox, 'border-indigo-500 bg-indigo-500/5', 'OMR_QUESTIONS_GRID')}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
