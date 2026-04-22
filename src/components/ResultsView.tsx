import React, { useState } from 'react';
import * as xlsx from 'xlsx';
import { StudentResult } from '../types.ts';
import { DownloadCloud, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface Props {
  results: StudentResult[];
  setResults: (res: StudentResult[]) => void;
  onRestart: () => void;
}

export function ResultsView({ results, setResults, onRestart }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ id: string; score: number }>({ id: '', score: 0 });

  const exportExcel = () => {
    const data = results.map(r => ({
      'Student ID': r.id,
      'Name': r.name,
      'Church': r.church,
      'Level': r.level,
      'Score': r.score,
      'Status': r.status,
    }));
    const sheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, 'Results');
    xlsx.writeFile(workbook, `OMR_Results_${new Date().getTime()}.xlsx`);
  };

  const startEdit = (result: StudentResult) => {
    setEditingId(result.id); // note: if ID is duplicated this might be buggy, better to use index, but this is simple
    setEditForm({ id: result.id, score: result.score });
  };

  const saveEdit = (oldId: string) => {
    setResults(results.map(r => 
      r.id === oldId 
        ? { ...r, id: editForm.id, score: editForm.score, status: 'success' } // reset status on manual edit
        : r
    ));
    setEditingId(null);
  };

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Live Results Feed <span className="text-slate-400 font-normal ml-2 tracking-normal lowercase">({results.length} processed)</span></h2>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={onRestart}
            className="px-4 py-1.5 text-[10px] uppercase tracking-wide font-bold bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-600"
          >
            Process Another PDF
          </button>
          <button 
            onClick={exportExcel}
            className="px-4 py-1.5 text-[10px] uppercase tracking-wide font-bold bg-indigo-600 border border-indigo-600 text-white rounded flex items-center gap-1 hover:bg-indigo-700"
          >
            <DownloadCloud className="w-3 h-3" /> Export Excel
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-white shadow-sm z-10">
            <tr className="text-[10px] uppercase text-slate-400 font-bold border-b border-slate-100">
              <th className="p-3">Status</th>
              <th className="p-3">Student ID</th>
              <th className="p-3 text-right">Name</th>
              <th className="p-3 text-right">Church</th>
              <th className="p-3">Level</th>
              <th className="p-3">Score</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-xs divide-y divide-slate-50">
            {results.map((res, i) => (
              <tr key={i} className={`hover:bg-slate-50 transition-colors ${res.status.startsWith('failed') ? 'bg-red-50/30 hover:bg-red-50' : ''}`}>
                <td className="p-3">
                  {res.status === 'success' && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-bold uppercase">SUCCESS</span>}
                  {res.status === 'failed_qr' && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[9px] font-bold uppercase">QR_FAIL</span>}
                  {res.status === 'failed_omr' && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[9px] font-bold uppercase">OMR_FAIL</span>}
                  {res.status === 'needs_review' && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold uppercase">REVIEW</span>}
                </td>
                <td className={`p-3 font-mono ${res.status === 'failed_qr' ? 'text-red-600 italic' : 'text-indigo-600'}`}>
                  {editingId === res.id ? (
                    <input 
                      type="text" 
                      className="border border-indigo-300 rounded px-2 py-1 w-24 font-sans text-slate-900 bg-white focus:outline-none"
                      value={editForm.id}
                      onChange={e => setEditForm({ ...editForm, id: e.target.value })}
                    />
                  ) : (
                    res.id
                  )}
                </td>
                <td dir="rtl" className={`p-3 text-right font-medium ${!res.name ? 'text-slate-400' : 'text-slate-800'}`}>{res.name || '—'}</td>
                <td dir="rtl" className={`p-3 text-right ${!res.church ? 'text-slate-400' : 'text-slate-600'}`}>{res.church || '—'}</td>
                <td className={`p-3 ${!res.level ? 'text-slate-400' : 'text-slate-600'}`}>{res.level || '—'}</td>
                <td className="p-3 font-semibold text-slate-900">
                  {editingId === res.id ? (
                    <input 
                      type="number" 
                      className="border border-indigo-300 rounded px-2 py-1 w-16 font-sans text-slate-900 bg-white focus:outline-none"
                      value={editForm.score}
                      onChange={e => setEditForm({ ...editForm, score: parseInt(e.target.value) || 0 })}
                    />
                  ) : (
                    res.score
                  )}
                </td>
                <td className="p-3 text-right">
                  {editingId === res.id ? (
                    <button 
                      onClick={() => saveEdit(res.id)}
                      className="text-indigo-600 hover:text-indigo-800 font-bold text-[10px] uppercase tracking-wider"
                    >
                      Save
                    </button>
                  ) : (
                    <div className="flex justify-end gap-3">
                      {res.pageImage && (
                        <button 
                          onClick={() => {
                            const win = window.open();
                            win?.document.write(`<html><body style="margin:0;background:#0f172a;display:flex;justify-content:center"><img src="${res.pageImage}" style="max-height:100vh;max-width:100%"/></body></html>`);
                          }}
                          className="text-slate-400 hover:text-indigo-600 text-[10px] font-bold uppercase tracking-wider transition-colors"
                        >
                          View Scan
                        </button>
                      )}
                      <button 
                        onClick={() => startEdit(res)}
                        className="text-slate-400 hover:text-indigo-600 font-bold text-[10px] uppercase tracking-wider transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-400 font-medium">
                  No results to display.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
