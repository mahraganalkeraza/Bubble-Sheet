import React, { useEffect, useState } from 'react';
import { CalibrationData, StudentResult } from '../types';
import { loadPdf, renderPdfPageToCanvas, processSinglePage, PDF_RENDER_SCALE, splitCanvasIfA4 } from '../engine';
import { runCombinedWorkflow } from '../workflow';
import { Loader2, Sparkles } from 'lucide-react';

interface Props {
  pdfFile: File;
  calibration: CalibrationData;
  questionsCount: number;
  optionsCount: number;
  columnsCount: number;
  answerKey: Record<number, string>;
  onComplete: (results: StudentResult[]) => void;
}

export function ProcessingView({
  pdfFile, calibration, questionsCount, optionsCount, columnsCount, answerKey, onComplete
}: Props) {
  const [progress, setProgress] = useState({ current: 0, total: 100 });
  const [isProcessing, setIsProcessing] = useState(true);
  const [useAI, setUseAI] = useState(true);
  const [currentScanPreview, setCurrentScanPreview] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const runProcessing = async () => {
      try {
        const doc = await loadPdf(pdfFile);
        const numPages = doc.numPages;
        setProgress({ current: 0, total: numPages });

        const results: StudentResult[] = [];

        for (let i = 1; i <= numPages; i++) {
          if (!active) break;
          // Step 1: Render PDF to offscreen canvas
          const fullCanvas = await renderPdfPageToCanvas(doc, i, PDF_RENDER_SCALE);
          const canvasesToProcess = splitCanvasIfA4(fullCanvas);
          
          if (!active) break;
          // Step 2: Process OpenCV + JSQR for each detected sheet
          for (const canvas of canvasesToProcess) {
            const result = await processSinglePage(
              canvas, 
              calibration, 
              answerKey, 
              questionsCount, 
              optionsCount,
              columnsCount
            );

            // Step 2.5: Visual Feedback for Boundary
            if (result.pageBoundaryPoints && result.pageBoundaryPoints.length === 4) {
               const debugCanvas = document.createElement('canvas');
               debugCanvas.width = canvas.width;
               debugCanvas.height = canvas.height;
               const ctx = debugCanvas.getContext('2d')!;
               ctx.drawImage(canvas, 0, 0);
               ctx.strokeStyle = '#3b82f6'; // Blue-500
               ctx.lineWidth = 10;
               ctx.beginPath();
               ctx.moveTo(result.pageBoundaryPoints[0].x, result.pageBoundaryPoints[0].y);
               ctx.lineTo(result.pageBoundaryPoints[1].x, result.pageBoundaryPoints[1].y);
               ctx.lineTo(result.pageBoundaryPoints[2].x, result.pageBoundaryPoints[2].y);
               ctx.lineTo(result.pageBoundaryPoints[3].x, result.pageBoundaryPoints[3].y);
               ctx.closePath();
               ctx.stroke();
               setCurrentScanPreview(debugCanvas.toDataURL('image/jpeg', 0.5));
            } else {
               setCurrentScanPreview(canvas.toDataURL('image/jpeg', 0.3));
            }

            // Step 3: Run AI Workflow enhancement if requested
            let finalResult = result;
            if (useAI) {
              finalResult = await runCombinedWorkflow(result, canvas, answerKey, questionsCount);
            }
            
            results.push(finalResult);
          }
          
          setProgress({ current: i, total: numPages });
          
          // Slight yield to allow UI paint so user can see boundary
          await new Promise(res => setTimeout(res, 200));
        }

        if (active) {
          setIsProcessing(false);
          onComplete(results);
        }

      } catch (e) {
        console.error("Processing error:", e);
        alert("Failed to process the PDF. Check console for details.");
      }
    };

    runProcessing();

    return () => {
      active = false;
    };
  }, [pdfFile, calibration, answerKey, questionsCount, optionsCount, onComplete, useAI]);

  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Edge Processing Engine</h2>
      </div>
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-8 bg-[#f8fafc] gap-8">
        {currentScanPreview && (
          <div className="w-full md:w-1/2 flex flex-col items-center">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Live Feed: Boundary Detection</h3>
            <div className="relative border-4 border-white shadow-xl rounded-lg overflow-hidden bg-white aspect-[1/1.4] w-full max-w-[300px]">
              <img src={currentScanPreview} className="w-full h-full object-cover" />
              <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-500 text-white text-[8px] font-bold uppercase rounded flex items-center gap-1 shadow-sm">
                <span className="animate-pulse">●</span> Boundary Active
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-col items-center max-w-md w-full bg-white p-12 rounded-xl shadow-sm border border-slate-200">
          {isProcessing ? (
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-6" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
              <span className="text-emerald-600 font-bold text-xl">✓</span>
            </div>
          )}
          
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-2 flex items-center gap-2">
            {isProcessing ? 'Processing Papers' : 'Complete'}
            {isProcessing && useAI && <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />}
          </h2>
          <p className="text-xs text-slate-400 mb-8 text-center font-medium">
            {useAI ? 'OpenCV + Gemini AI Hybrid Workflow' : 'Memory-safe serial loop. Do not close this tab.'}
          </p>

          <div className="w-full bg-slate-100 rounded-full h-1.5 max-w-md mb-3 overflow-hidden">
            <div 
              className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="flex justify-between w-full text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span>Page {progress.current} of {progress.total}</span>
            <span className="text-indigo-600">{percentage}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
