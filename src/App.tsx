/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Phase, CalibrationData, StudentResult } from './types.ts';
import { UploadView } from './components/UploadView.tsx';
import { CalibrationView } from './components/CalibrationView.tsx';
import { AnswerKeyView } from './components/AnswerKeyView.tsx';
import { ProcessingView } from './components/ProcessingView.tsx';
import { ResultsView } from './components/ResultsView.tsx';

export default function App() {
  const [phase, setPhase] = useState<Phase>('upload');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  
  // Calibration data from localStorage or defaults
  const [calibration, setCalibration] = useState<CalibrationData>(() => {
    const saved = localStorage.getItem('omr_calibration');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    // Defaults for a 1000x1414 space (approx A4 aspect ratio)
    return {
      topLeft: { x: 50, y: 50 },
      topRight: { x: 950, y: 50 },
      bottomLeft: { x: 50, y: 1364 },
      bottomRight: { x: 950, y: 1364 },
      qrBox: { x: 100, y: 100, width: 200, height: 200 },
      omrBox: { x: 100, y: 350, width: 800, height: 900 }
    };
  });

  const [questionsCount, setQuestionsCount] = useState(50);
  const [optionsCount, setOptionsCount] = useState(4); // 4 = A,B,C,D
  const [answerKey, setAnswerKey] = useState<Record<number, string>>({});
  
  const [results, setResults] = useState<StudentResult[]>([]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] flex flex-col font-sans overflow-hidden">
      {/* Header Section */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">VisionProcessor OMR V2</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold flex items-center gap-1">
              Standalone Computer Vision Engine
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <span className={phase === 'upload' ? 'text-indigo-600' : ''}>1. Upload</span>
          <span className="text-slate-200">&gt;</span>
          <span className={phase === 'calibrate' ? 'text-indigo-600' : ''}>2. Calibrate</span>
          <span className="text-slate-200">&gt;</span>
          <span className={phase === 'answer_key' ? 'text-indigo-600' : ''}>3. Key</span>
          <span className="text-slate-200">&gt;</span>
          <span className={phase === 'processing' ? 'text-indigo-600' : ''}>4. Process</span>
          <span className="text-slate-200">&gt;</span>
          <span className={phase === 'results' ? 'text-indigo-600' : ''}>5. Results</span>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-hidden flex flex-col">
        <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0">
          {phase === 'upload' && (
            <UploadView 
              onFileSelect={(file) => {
                setPdfFile(file);
                setPhase('calibrate');
              }} 
            />
          )}
          {phase === 'calibrate' && pdfFile && (
            <CalibrationView 
              pdfFile={pdfFile}
              calibration={calibration}
              onCalibrationChange={setCalibration}
              onSaveDefault={() => {
                localStorage.setItem('omr_calibration', JSON.stringify(calibration));
                alert('Calibration saved as default.');
              }}
              onNext={() => setPhase('answer_key')}
              onBack={() => setPhase('upload')}
            />
          )}
          {phase === 'answer_key' && (
            <AnswerKeyView 
              questionsCount={questionsCount}
              setQuestionsCount={setQuestionsCount}
              optionsCount={optionsCount}
              setOptionsCount={setOptionsCount}
              answerKey={answerKey}
              setAnswerKey={setAnswerKey}
              onNext={() => setPhase('processing')}
              onBack={() => setPhase('calibrate')}
            />
          )}
          {phase === 'processing' && pdfFile && (
            <ProcessingView 
              pdfFile={pdfFile}
              calibration={calibration}
              questionsCount={questionsCount}
              optionsCount={optionsCount}
              answerKey={answerKey}
              onComplete={(res) => {
                setResults(res);
                setPhase('results');
              }}
            />
          )}
          {phase === 'results' && (
            <ResultsView 
              results={results}
              setResults={setResults}
              onRestart={() => {
                setPdfFile(null);
                setResults([]);
                setPhase('upload');
              }}
            />
          )}
        </div>
      </main>

      {/* Footer Status Bar */}
      <footer className="h-8 bg-slate-900 text-white px-4 flex items-center justify-between text-[10px] font-mono shrink-0">
        <div className="flex gap-4">
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div> 
            OpenCV.js 4.8.0 Connected
          </span>
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div> 
            PDF.js Render scale: 3.0
          </span>
        </div>
        <div className="text-slate-400 uppercase">
          Memory-Safe Edge Processing • Low Impact Mode Active
        </div>
      </footer>
    </div>
  );
}
