import React, { useEffect, useState } from 'react';
import { CalibrationData, StudentResult } from '../types.ts';
import { loadPdf, renderPdfPageToCanvas, processSinglePage, PDF_RENDER_SCALE } from '../engine.ts';
import { Loader2 } from 'lucide-react';

interface Props {
  pdfFile: File;
  calibration: CalibrationData;
  questionsCount: number;
  optionsCount: number;
  answerKey: Record<number, string>;
  onComplete: (results: StudentResult[]) => void;
}

export function ProcessingView({
  pdfFile, calibration, questionsCount, optionsCount, answerKey, onComplete
}: Props) {
  const [progress, setProgress] = useState({ current: 0, total: 100 });
  const [isProcessing, setIsProcessing] = useState(true);

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
          const canvas = await renderPdfPageToCanvas(doc, i, PDF_RENDER_SCALE);
          
          if (!active) break;
          // Step 2: Process OpenCV + JSQR
          const result = await processSinglePage(
            canvas, 
            calibration, 
            answerKey, 
            questionsCount, 
            optionsCount
          );
          
          results.push(result);
          setProgress({ current: i, total: numPages });
          
          // Slight yield to allow UI paint
          await new Promise(res => setTimeout(res, 10));
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
  }, [pdfFile, calibration, answerKey, questionsCount, optionsCount, onComplete]);

  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Edge Processing Engine</h2>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#f8fafc]">
        <div className="flex flex-col items-center max-w-md w-full bg-white p-12 rounded-xl shadow-sm border border-slate-200">
          {isProcessing ? (
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-6" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
              <span className="text-emerald-600 font-bold text-xl">✓</span>
            </div>
          )}
          
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-2">
            {isProcessing ? 'Processing Papers' : 'Complete'}
          </h2>
          <p className="text-xs text-slate-400 mb-8 text-center font-medium">
            Memory-safe serial loop. Do not close this tab.
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
