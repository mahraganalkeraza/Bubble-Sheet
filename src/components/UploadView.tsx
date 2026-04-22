import React, { useCallback, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface Props {
  onFileSelect: (file: File) => void;
}

export function UploadView({ onFileSelect }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf') {
        onFileSelect(file);
      } else {
        alert('Please upload a valid PDF file.');
      }
    }
  }, [onFileSelect]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  }, [onFileSelect]);

  return (
    <div className="flex-1 flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">File Upload</h2>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#f8fafc]">
        <div 
          className={`w-full max-w-xl p-16 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors cursor-pointer bg-white ${
            isDragging ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-slate-300 hover:border-indigo-400 hover:shadow-sm'
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => document.getElementById('pdf-upload')?.click()}
        >
          <UploadCloud className={`w-16 h-16 mb-4 ${isDragging ? 'text-indigo-500' : 'text-slate-300'}`} />
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-2">Upload Exam PDF</h2>
          <p className="text-xs text-slate-400 mb-8 text-center font-medium">Drag and drop your multipage PDF here, or click to browse.</p>
          <div className="px-6 py-2.5 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-md shadow-sm hover:bg-indigo-700 transition-colors">
            Select PDF File
          </div>
          <input 
            id="pdf-upload" 
            type="file" 
            accept="application/pdf" 
            className="hidden" 
            onChange={onFileInput} 
          />
        </div>
      </div>
    </div>
  );
}
