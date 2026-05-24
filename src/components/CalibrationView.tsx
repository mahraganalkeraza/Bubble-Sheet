import React, { useEffect, useRef, useState } from 'react';
import { CalibrationData, Point, Box } from '../types';
import { loadPdf, renderPdfPageToCanvas, PDF_RENDER_SCALE, warpPage, splitCanvasIfA4 } from '../engine';
import { Maximize, Save, ArrowRight, ArrowLeft, ArrowUp, ArrowDown } from 'lucide-react';

interface Props {
  pdfFile: File;
  calibration: CalibrationData;
  questionsCount: number;
  setQuestionsCount: React.Dispatch<React.SetStateAction<number>>;
  optionsCount: number;
  setOptionsCount: React.Dispatch<React.SetStateAction<number>>;
  columnsCount: number;
  setColumnsCount: React.Dispatch<React.SetStateAction<number>>;
  onCalibrationChange: (c: CalibrationData) => void;
  onSaveDefault: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function CalibrationView({
  pdfFile,
  calibration,
  questionsCount,
  setQuestionsCount,
  optionsCount,
  setOptionsCount,
  columnsCount,
  setColumnsCount,
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

  const questionsPerCol = Math.ceil(questionsCount / columnsCount);

  const nudgeGrid = (dx: number, dy: number) => {
    onCalibrationChange({
      ...calibration,
      gridStart: {
        x: calibration.gridStart.x + dx,
        y: calibration.gridStart.y + dy
      }
    });
  };

  // Keyboard Nudge logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't nudge if typing in input
      if (document.activeElement?.tagName === 'INPUT') return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowUp') nudgeGrid(0, -step);
        if (e.key === 'ArrowDown') nudgeGrid(0, step);
        if (e.key === 'ArrowLeft') nudgeGrid(-step, 0);
        if (e.key === 'ArrowRight') nudgeGrid(step, 0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [calibration, onCalibrationChange]);

  // Load the first page into the background canvas
  useEffect(() => {
    let active = true;
    const renderPdf = async () => {
      try {
        const doc = await loadPdf(pdfFile);
        const rawCanvasFull = await renderPdfPageToCanvas(doc, 1, PDF_RENDER_SCALE); 
        const rawCanvas = splitCanvasIfA4(rawCanvasFull)[0];

        if (!active) return;
        
        let processedCanvas = rawCanvas;
        try {
          processedCanvas = await warpPage(rawCanvas);
        } catch (e) {
          console.warn("Auto-warp failed in calibration preview", e);
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        
        canvas.width = processedCanvas.width;
        canvas.height = processedCanvas.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(processedCanvas, 0, 0);
        
        // Compute display scale to fit inside container
        if (containerRef.current) {
          const containerWidth = containerRef.current.clientWidth;
          const newScale = containerWidth / processedCanvas.width;
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

  // Handle Adaptive Grid Auto-Scaling when config changes
  useEffect(() => {
    if (!canvasRef.current) return;
    const cW = canvasRef.current.width;
    const cH = canvasRef.current.height;
    if (cW === 0 || cH === 0) return;

    const currentMaxY = calibration.gridStart.y + (questionsPerCol - 1) * calibration.rowHeight;
    const currentMaxX = calibration.gridStart.x + (optionsCount - 1) * calibration.colWidth + (columnsCount > 1 ? calibration.columnGap : 0);
    
    const margin = 50;
    let newCal = { ...calibration };
    let changed = false;

    if (currentMaxX > cW - margin) {
       const scaleX = Math.max(0.1, (cW - margin - newCal.gridStart.x) / ((optionsCount - 1) * newCal.colWidth + (columnsCount > 1 ? newCal.columnGap : 0)));
       if (optionsCount > 1) {
         newCal.colWidth = newCal.colWidth * scaleX;
         newCal.columnGap = newCal.columnGap * scaleX;
         changed = true;
       }
    }
    if (currentMaxY > cH - margin) {
       const scaleY = Math.max(0.1, (cH - margin - newCal.gridStart.y) / ((questionsPerCol - 1) * newCal.rowHeight));
       if (questionsPerCol > 1) {
         newCal.rowHeight = newCal.rowHeight * scaleY;
         changed = true;
       }
    }
    if (changed) {
      onCalibrationChange(newCal);
    }
  }, [questionsCount, optionsCount, columnsCount, questionsPerCol, loading]);

  // Handle Dragging
  const [draggingTarget, setDraggingTarget] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent, target: string, originalBox?: Box, originalPoint?: Point) => {
    e.stopPropagation();
    const targetElement = e.currentTarget;
    targetElement.setPointerCapture(e.pointerId);

    const parentRect = documentRef.current!.getBoundingClientRect();
    const x = (e.clientX - parentRect.left) / scale;
    const y = (e.clientY - parentRect.top) / scale;

    if (target === 'qrBoxOffset' && originalBox) {
      setDragOffset({
        x: x - (calibration.topRightAnchor.x + originalBox.x),
        y: y - (calibration.topRightAnchor.y + originalBox.y)
      });
    } else if (target === 'gridStart' && originalPoint) {
      setDragOffset({
        x: x - originalPoint.x,
        y: y - originalPoint.y
      });
    } else if (target === 'spacing_column_gap') {
      // offset calculation based on current gap
    }
    
    setDraggingTarget(target);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingTarget) return;
    const parentRect = documentRef.current!.getBoundingClientRect();
    const x = (e.clientX - parentRect.left) / scale;
    const y = (e.clientY - parentRect.top) / scale;

    const newCal = { ...calibration };

    if (draggingTarget === 'topRightAnchor') newCal.topRightAnchor = { x, y };

    if (draggingTarget === 'qrBoxOffset') {
      newCal.qrBoxOffset.x = (x - dragOffset.x) - calibration.topRightAnchor.x;
      newCal.qrBoxOffset.y = (y - dragOffset.y) - calibration.topRightAnchor.y;
    }
    if (draggingTarget === 'resize_qr_width') {
      const qrAbsX = calibration.topRightAnchor.x + newCal.qrBoxOffset.x;
      newCal.qrBoxOffset.width = Math.max(20, x - qrAbsX);
    }
    if (draggingTarget === 'resize_qr_height') {
      const qrAbsY = calibration.topRightAnchor.y + newCal.qrBoxOffset.y;
      newCal.qrBoxOffset.height = Math.max(20, y - qrAbsY);
    }

    if (draggingTarget === 'gridStart') {
      newCal.gridStart = { x: x - dragOffset.x, y: y - dragOffset.y };
    }

    if (draggingTarget === 'spacing_height') {
      const totalHeight = y - newCal.gridStart.y;
      newCal.rowHeight = Math.max(5, totalHeight / (questionsPerCol - 1 || 1));
    }
    if (draggingTarget === 'spacing_width') {
      const totalWidth = x - newCal.gridStart.x;
      newCal.colWidth = Math.max(5, totalWidth / (optionsCount - 1 || 1));
    }
    if (draggingTarget === 'spacing_column_gap' && columnsCount > 1) {
      // The drag x position is roughly start of column 2
      const gap = x - newCal.gridStart.x;
      newCal.columnGap = Math.max((optionsCount * newCal.colWidth), gap);
    }

    onCalibrationChange(newCal);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDraggingTarget(null);
  };

  const renderPin = (id: keyof CalibrationData, point: Point, label: string) => (
    <div 
      className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-blue-500/80 border-2 border-white shadow flex items-center justify-center cursor-move text-xs font-bold text-white z-20 hover:bg-blue-600 hover:scale-110 transition-transform touch-none"
      style={{ left: point.x * scale, top: point.y * scale }}
      onPointerDown={(e) => handlePointerDown(e, id as string)}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {label}
    </div>
  );

  const qrAbsX = calibration.topRightAnchor.x + calibration.qrBoxOffset.x;
  const qrAbsY = calibration.topRightAnchor.y + calibration.qrBoxOffset.y;

  return (
    <div className="flex-1 flex gap-4 overflow-hidden h-full">
      {/* Configuration Sidebar */}
      <div className="w-72 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col pt-4 overflow-y-auto shrink-0">
        <div className="px-4 pb-4 border-b border-slate-100 flex-1">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Grid Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Answer Choices</label>
              <select 
                title="Number of choices"
                className="w-full text-sm border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                value={optionsCount}
                onChange={(e) => setOptionsCount(Number(e.target.value))}
              >
                <option value={3}>3 (A, B, C)</option>
                <option value={4}>4 (A, B, C, D)</option>
                <option value={5}>5 (A, B, C, D, E)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Test Columns</label>
              <select 
                title="Number of columns"
                className="w-full text-sm border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                value={columnsCount}
                onChange={(e) => setColumnsCount(Number(e.target.value))}
              >
                <option value={1}>1 Column</option>
                <option value={2}>2 Columns</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Total Questions</label>
              <input 
                type="number"
                min="1"
                max="200"
                value={questionsCount}
                onChange={(e) => setQuestionsCount(Number(e.target.value) || 1)}
                className="w-full text-sm border-slate-300 rounded-md py-1.5 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            
            <hr className="my-2" />

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Fine-Tuning Nudges</label>
              <div className="grid grid-cols-3 gap-1 w-32 mx-auto">
                <div />
                <button title="Nudge Up" onClick={() => nudgeGrid(0, -1)} className="p-2 border border-slate-200 rounded hover:bg-slate-100 flex items-center justify-center"><ArrowUp className="w-4 h-4 text-slate-600" /></button>
                <div />
                <button title="Nudge Left" onClick={() => nudgeGrid(-1, 0)} className="p-2 border border-slate-200 rounded hover:bg-slate-100 flex items-center justify-center"><ArrowLeft className="w-4 h-4 text-slate-600" /></button>
                <button title="Nudge Down" onClick={() => nudgeGrid(0, 1)} className="p-2 border border-slate-200 rounded hover:bg-slate-100 flex items-center justify-center"><ArrowDown className="w-4 h-4 text-slate-600" /></button>
                <button title="Nudge Right" onClick={() => nudgeGrid(1, 0)} className="p-2 border border-slate-200 rounded hover:bg-slate-100 flex items-center justify-center"><ArrowRight className="w-4 h-4 text-slate-600" /></button>
              </div>
              <p className="text-[10px] text-slate-400 text-center mt-2">Shift + Arrow Key for 10px jump</p>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-slate-50 space-y-2 mt-auto border-t border-slate-100">
          <button 
            onClick={onSaveDefault}
            className="w-full py-2 text-xs uppercase tracking-wide font-bold bg-white border border-indigo-200 text-indigo-600 rounded flex items-center justify-center gap-1 hover:bg-indigo-50"
          >
            <Save className="w-4 h-4" /> Save Default
          </button>
          <button 
            onClick={onNext}
            className="w-full py-2 text-xs uppercase tracking-wide font-bold bg-indigo-600 border border-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Confirm & Next
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden h-full min-w-0">
        <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
           <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Visual Calibration</h2>
           <button 
              onClick={onBack}
              className="px-2 py-1 text-[10px] uppercase tracking-wide font-bold bg-white border border-slate-300 rounded hover:bg-slate-50"
            >
              Back
          </button>
        </div>
        <div className="flex-1 relative bg-slate-800 flex flex-col p-4 overflow-auto min-h-0" ref={containerRef}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-30">
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
                  {/* Top Right Anchor */}
                  {renderPin('topRightAnchor', calibration.topRightAnchor, 'Ref')}

                  {/* QR Box - rendered relative to Top Right Anchor */}
                  <div 
                    className="absolute border border-emerald-500/50 bg-emerald-500/5 cursor-move z-10 touch-none flex flex-col"
                    style={{ 
                      left: qrAbsX * scale, 
                      top: qrAbsY * scale, 
                      width: calibration.qrBoxOffset.width * scale, 
                      height: calibration.qrBoxOffset.height * scale 
                    }}
                    onPointerDown={(e) => handlePointerDown(e, 'qrBoxOffset', calibration.qrBoxOffset)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <div className="flex-1 pointer-events-none" />
                    <div 
                      className="absolute top-0 right-0 w-4 h-full bg-emerald-500/20 cursor-e-resize touch-none"
                      onPointerDown={(e) => handlePointerDown(e, 'resize_qr_width')}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    />
                    <div 
                      className="absolute bottom-0 left-0 h-4 w-full bg-emerald-500/20 cursor-s-resize touch-none"
                      onPointerDown={(e) => handlePointerDown(e, 'resize_qr_height')}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    />
                  </div>

                   {/* Grid Overlay */}
                  <svg 
                    className="absolute top-0 left-0 pointer-events-none z-10" 
                    style={{ width: canvasRef.current?.width * scale, height: canvasRef.current?.height * scale, overflow: 'visible' }}
                  >
                    {Array.from({ length: columnsCount }).map((_, colIdx) => (
                      <g key={`col-${colIdx}`}>
                        {Array.from({ length: questionsPerCol }).map((_, r) => {
                          const questionIdx = colIdx * questionsPerCol + r;
                          if (questionIdx >= questionsCount) return null;
                          
                          const rowX = (calibration.gridStart.x + colIdx * calibration.columnGap) * scale;
                          const rowY = (calibration.gridStart.y + (r - 0.5) * calibration.rowHeight) * scale;
                          const rowW = (calibration.colWidth * optionsCount) * scale;
                          const rowH = (calibration.rowHeight) * scale;

                          return (
                            <g key={`row-${r}-col-${colIdx}`}>
                              <rect 
                                x={rowX} 
                                y={rowY} 
                                width={rowW} 
                                height={rowH} 
                                fill="none" 
                                stroke="rgba(244, 63, 94, 0.3)" 
                                strokeWidth="1" 
                              />
                              {Array.from({ length: optionsCount }).map((_, c) => (
                                <line 
                                  key={`sep-${c}`}
                                  x1={rowX + c * calibration.colWidth * scale}
                                  y1={rowY}
                                  x2={rowX + c * calibration.colWidth * scale}
                                  y2={rowY + rowH}
                                  stroke="rgba(244, 63, 94, 0.2)"
                                  strokeWidth="1"
                                />
                              ))}
                            </g>
                          );
                        })}
                      </g>
                    ))}
                  </svg>

                  {/* Grid Master Move Handle */}
                  <div 
                    className="absolute w-6 h-6 -ml-3 -mt-3 rounded bg-red-500/80 border border-white shadow flex items-center justify-center cursor-move text-white z-20 touch-none"
                    style={{ left: calibration.gridStart.x * scale, top: calibration.gridStart.y * scale }}
                    onPointerDown={(e) => handlePointerDown(e, 'gridStart', undefined, calibration.gridStart)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    title="Drag to align Grid to Q1 Opt A. Use Arrow keys to nudge."
                  >
                    <Maximize className="w-3 h-3" />
                  </div>

                   {/* Grid Height Resizer */}
                  <div 
                    className="absolute h-4 cursor-s-resize bg-red-500/20 z-20 touch-none rounded-b"
                    style={{ 
                      left: calibration.gridStart.x * scale - 10,
                      top: (calibration.gridStart.y + (questionsPerCol - 1) * calibration.rowHeight) * scale + 10,
                      width: (optionsCount - 1) * calibration.colWidth * scale + 20
                    }}
                    onPointerDown={(e) => handlePointerDown(e, 'spacing_height')}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    title="Drag vertically to adjust row height"
                  />
                  
                  {/* Grid Width Resizer */}
                  <div 
                    className="absolute w-4 cursor-e-resize bg-red-500/20 z-20 touch-none rounded-r"
                    style={{ 
                      left: (calibration.gridStart.x + (optionsCount - 1) * calibration.colWidth) * scale + 10,
                      top: calibration.gridStart.y * scale - 10,
                      height: (questionsPerCol - 1) * calibration.rowHeight * scale + 20
                    }}
                    onPointerDown={(e) => handlePointerDown(e, 'spacing_width')}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    title="Drag horizontally to adjust column width"
                  />

                  {/* Column Gap Resizer */}
                  {columnsCount > 1 && (
                    <div 
                      className="absolute w-6 cursor-e-resize bg-red-500/40 z-20 touch-none rounded-full"
                      style={{ 
                        left: (calibration.gridStart.x + calibration.columnGap) * scale - 12,
                        top: calibration.gridStart.y * scale - 10,
                        height: 20
                      }}
                      onPointerDown={(e) => handlePointerDown(e, 'spacing_column_gap')}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      title="Drag to adjust column gap"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

