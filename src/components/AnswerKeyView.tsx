import React from 'react';

interface Props {
  questionsCount: number;
  setQuestionsCount: (n: number) => void;
  optionsCount: number;
  setOptionsCount: (n: number) => void;
  answerKey: Record<number, string>;
  setAnswerKey: (key: Record<number, string>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function AnswerKeyView({
  questionsCount,
  setQuestionsCount,
  optionsCount,
  setOptionsCount,
  answerKey,
  setAnswerKey,
  onNext,
  onBack
}: Props) {
  
  const options = Array.from({ length: optionsCount }).map((_, i) => String.fromCharCode(65 + i)); // A, B, C, D...

  const handleOptionClick = (q: number, opt: string) => {
    setAnswerKey({
      ...answerKey,
      [q]: answerKey[q] === opt ? '' : opt // toggle
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Interactive Answer Key</h2>
        
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
            Questions:
            <input 
              type="number" 
              min={1} 
              max={200}
              className="border border-slate-300 rounded px-1 py-0.5 w-16 text-slate-900 font-sans"
              value={questionsCount}
              onChange={(e) => setQuestionsCount(parseInt(e.target.value) || 1)}
            />
          </label>
          <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
            Options:
            <select 
              className="border border-slate-300 rounded px-1 py-0.5 w-24 text-slate-900 font-sans"
              value={optionsCount}
              onChange={(e) => {
                setOptionsCount(parseInt(e.target.value));
                setAnswerKey({}); // reset key when options change
              }}
            >
              <option value={3}>3 (A-C)</option>
              <option value={4}>4 (A-D)</option>
              <option value={5}>5 (A-E)</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto min-h-0 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-2">
          {Array.from({ length: questionsCount }).map((_, i) => {
            const qNum = i + 1;
            return (
              <div key={qNum} className="flex items-center justify-between text-xs border-b border-slate-50 pb-1">
                <span className="font-mono text-slate-400">{qNum.toString().padStart(2, '0')}.</span>
                <div className="flex gap-1.5">
                  {options.map(opt => {
                    const isSelected = answerKey[qNum] === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => handleOptionClick(qNum, opt)}
                        className={`w-5 h-5 rounded-full border flex items-center justify-center text-[9px] font-bold transition-colors ${
                          isSelected 
                            ? 'border-indigo-600 bg-indigo-600 text-white' 
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
        <button 
          onClick={onBack}
          className="px-4 py-1.5 text-[10px] uppercase tracking-wide font-bold bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-600"
        >
          Back
        </button>
        <button 
          onClick={onNext}
          className="px-4 py-1.5 text-[10px] uppercase tracking-wide font-bold bg-indigo-600 border border-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Confirm & Processing
        </button>
      </div>
    </div>
  );
}
