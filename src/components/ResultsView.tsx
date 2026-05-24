import React, { useState } from 'react';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { StudentResult, OMRAnomaly } from '../types';
import { DownloadCloud, CheckCircle2, XCircle, AlertCircle, Maximize2, UserPlus } from 'lucide-react';

interface Props {
  results: StudentResult[];
  setResults: (res: StudentResult[]) => void;
  onRestart: () => void;
}

export function ResultsView({ results, setResults, onRestart }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ id: string; score: number }>({ id: '', score: 0 });
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [manualResolveIndex, setManualResolveIndex] = useState<number | null>(null);
  const [manualForm, setManualForm] = useState({ name: '', church: '', level: '' });
  const [hoveredAnomalyIndex, setHoveredAnomalyIndex] = useState<number | null>(null);

  const exportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Results', {
      views: [{ rightToLeft: true }]
    });

    worksheet.columns = [
      { header: 'Student ID', key: 'id', width: 20 },
      { header: 'Triple Name', key: 'name', width: 30 },
      { header: 'Stage/Level', key: 'level', width: 20 },
      { header: 'Church Name', key: 'church', width: 30 },
      { header: 'Competition Type', key: 'competition', width: 20 },
      { header: 'Registration Date', key: 'date', width: 20 },
      { header: 'Score', key: 'score', width: 10 },
      { header: 'Status', key: 'status', width: 15 }
    ];

    // Force Student ID column to be text
    worksheet.getColumn('id').numFmt = '@';

    results.forEach(r => {
      worksheet.addRow({
        id: String(r.id),
        name: r.name || 'Unknown',
        level: r.level || 'Unknown',
        church: r.church || 'Unknown',
        competition: 'Mahragan',
        date: new Date().toLocaleDateString(),
        score: r.score,
        status: r.status
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `OMR_Results_${new Date().getTime()}.xlsx`);
  };

  const startEdit = (result: StudentResult, index: number) => {
    setEditingId(index);
    setEditForm({ id: result.id, score: result.score });
  };

  const saveEdit = (index: number) => {
    setResults(results.map((r, i) => 
      i === index 
        ? { ...r, id: editForm.id, score: editForm.score, status: 'success' } // reset status on manual edit
        : r
    ));
    setEditingId(null);
  };

  const saveManualResolve = (index: number) => {
    setResults(results.map((r, i) => {
      if (i !== index) return r;
      // We keep has_anomalies if there are unresolved anomalies
      let newStatus = r.status;
      if (newStatus === 'needs_attention') {
        newStatus = r.anomalies?.some(a => !a.resolved) ? 'has_anomalies' : 'success';
      }
      return {
        ...r,
        name: manualForm.name,
        church: manualForm.church,
        level: manualForm.level,
        status: newStatus,
        isManuallyResolved: true,
      };
    }));
    setManualResolveIndex(null);
  };

  const resolveAnomaly = (resultIndex: number, anomalyIndex: number, isCorrect: boolean) => {
    setResults(results.map((res, i) => {
      if (i !== resultIndex || !res.anomalies) return res;
      
      const newAnomalies = [...res.anomalies];
      const anomaly = { ...newAnomalies[anomalyIndex], resolved: true, isCorrect };
      newAnomalies[anomalyIndex] = anomaly;
      
      // Check if all are resolved
      const allResolved = newAnomalies.every(a => a.resolved);
      let newScore = res.score;
      
      // Calculate score if all resolved and were correct
      if (isCorrect) {
         newScore += 1;
      }
      
      return {
        ...res,
        score: newScore,
        anomalies: newAnomalies,
        status: allResolved ? 'success' : 'has_anomalies'
      };
    }));
  };

  const totalProcessed = results.length;
  const manuallyResolved = results.filter(r => r.isManuallyResolved).length;
  const autoDetected = totalProcessed - manuallyResolved;

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-slate-100 bg-slate-50 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Live Results Feed</h2>
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
        <div className="flex gap-4 text-[10px] font-bold text-slate-500 uppercase">
          <span>Total Processed: {totalProcessed}</span>
          <span className="text-slate-300">|</span>
          <span className="text-emerald-600">Auto-Detected: {autoDetected}</span>
          <span className="text-slate-300">|</span>
          <span className="text-indigo-600">Manually Resolved: {manuallyResolved}</span>
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
              <React.Fragment key={i}>
                <tr className={`hover:bg-slate-50 transition-colors ${res.status.startsWith('failed') || res.status === 'needs_attention' ? 'bg-red-50/30 hover:bg-red-50' : ''} ${res.status === 'has_anomalies' ? 'bg-orange-50/50' : ''}`}>
                  <td className="p-3">
                    {res.status === 'success' && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-bold uppercase">SUCCESS</span>}
                    {res.status === 'needs_attention' && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[9px] font-bold uppercase">NEEDS ATTENTION</span>}
                    {res.status === 'failed_omr' && <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[9px] font-bold uppercase">OMR_FAIL</span>}
                    {res.status === 'needs_review' && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold uppercase">REVIEW</span>}
                    {res.status === 'has_anomalies' && <span className="px-2 py-0.5 bg-orange-200 text-orange-800 rounded-full text-[9px] font-bold uppercase flex items-center w-fit gap-1"><AlertCircle className="w-3 h-3"/> ANOMALY</span>}
                  </td>
                  <td className={`p-3 font-mono ${res.status === 'needs_attention' ? 'text-red-600 italic' : 'text-indigo-600'}`}>
                    {editingId === i ? (
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
                  <td className={`p-3 font-semibold text-slate-900 ${res.status === 'has_anomalies' ? 'opacity-50 line-through' : ''}`}>
                    {editingId === i ? (
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
                    {editingId === i ? (
                      <button 
                        onClick={() => saveEdit(i)}
                        className="text-indigo-600 hover:text-indigo-800 font-bold text-[10px] uppercase tracking-wider"
                      >
                        Save
                      </button>
                    ) : (
                      <div className="flex justify-end gap-3">
                        {res.status === 'has_anomalies' && (
                           <button onClick={() => setReviewIndex(reviewIndex === i ? null : i)} className="text-orange-600 font-bold text-[10px] uppercase whitespace-nowrap">
                             {reviewIndex === i ? 'Close Review' : 'Review Anomalies'}
                           </button>
                        )}
                        {res.status === 'needs_attention' && (
                           <button onClick={() => {
                             setManualResolveIndex(i);
                             setManualForm({ name: '', church: '', level: '' });
                           }} className="text-red-600 font-bold text-[10px] uppercase whitespace-nowrap">
                             Resolve
                           </button>
                        )}
                        {res.pageImage && (
                          <button 
                            onClick={() => {
                              const win = window.open();
                              win?.document.write(`<html><body style="margin:0;background:#0f172a;display:flex;justify-content:center"><img src="${res.pageImage}" style="max-height:100vh;max-width:100%"/></body></html>`);
                            }}
                            className="text-slate-400 hover:text-indigo-600 text-[10px] font-bold uppercase tracking-wider transition-colors"
                          >
                            View
                          </button>
                        )}
                        <button 
                          onClick={() => startEdit(res, i)}
                          className="text-slate-400 hover:text-indigo-600 font-bold text-[10px] uppercase tracking-wider transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {/* Anomaly Review Panel */}
                {reviewIndex === i && res.status === 'has_anomalies' && res.anomalies && (
                  <tr>
                    <td colSpan={7} className="p-0 border-b border-orange-100">
                      <div className="bg-orange-50/50 p-4 flex gap-6">
                        <div className="flex-1 space-y-3">
                          <h4 className="font-bold text-orange-900 text-sm flex items-center gap-2">
                             <AlertCircle className="w-4 h-4"/> 
                             Manual Override Required
                          </h4>
                          <p className="text-orange-800 text-xs mb-3 font-medium">
                            Calculation paused until anomalies are resolved.
                          </p>
                          <div className="space-y-4">
                            {res.anomalies.map((anom, aIdx) => (
                              <div 
                                key={aIdx} 
                                className={`p-4 rounded border transition-all cursor-pointer ${anom.resolved ? 'bg-orange-50 border-orange-200 opacity-60' : 'bg-white border-orange-300 shadow-sm'} ${hoveredAnomalyIndex === aIdx ? 'ring-2 ring-orange-400 transform scale-[1.02]' : ''}`}
                                onMouseEnter={() => setHoveredAnomalyIndex(aIdx)}
                                onMouseLeave={() => setHoveredAnomalyIndex(null)}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="font-bold text-slate-800">Question {anom.questionNumber}</div>
                                  <div className="px-2 py-1 bg-orange-100 text-orange-800 text-[10px] uppercase rounded font-bold tracking-wider">
                                    {anom.anomalyType.replace('_', ' ')}
                                  </div>
                                </div>
                                <p className="text-slate-600 mb-4 whitespace-pre-wrap">{res.errorLog?.find(log => log.includes(`Question ${anom.questionNumber}`))}</p>
                                {!anom.resolved ? (
                                  <div className="flex gap-2">
                                    <button 
                                      onClick={() => resolveAnomaly(i, aIdx, true)}
                                      className="flex-1 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded font-bold transition flex items-center justify-center gap-1"
                                    >
                                      <CheckCircle2 className="w-4 h-4"/> Approve as Correct
                                    </button>
                                    <button 
                                      onClick={() => resolveAnomaly(i, aIdx, false)}
                                      className="flex-1 py-2 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded font-bold transition flex items-center justify-center gap-1"
                                    >
                                      <XCircle className="w-4 h-4"/> Mark as Incorrect
                                    </button>
                                  </div>
                                ) : (
                                  <div className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                    {anom.isCorrect ? <CheckCircle2 className="w-3 h-3 text-emerald-500"/> : <XCircle className="w-3 h-3 text-red-500"/>}
                                    Resolved: {anom.isCorrect ? 'Approved Correct' : 'Marked Incorrect'}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        {res.pageImage && (
                          <div className="w-1/3 bg-slate-900 rounded-lg overflow-hidden border-4 border-slate-900 relative shadow-inner">
                            <div className="relative w-full h-0 pb-[141.4%]">
                                <img src={res.pageImage} className="absolute top-0 left-0 w-full h-full object-cover" />
                                {/* Render Highlights over the image */}
                                {res.anomalies.map((anom, aIdx) => {
                                  // Use actual page dimensions
                                  const scaleX = 100 / (res.pageWidth || 2480);
                                  const scaleY = 100 / (res.pageHeight || 3508);
                                  const isHovered = hoveredAnomalyIndex === aIdx;

                                  return (
                                    <div 
                                      key={aIdx} 
                                      className={`absolute ${anom.resolved ? 'z-10' : 'z-20'} pointer-events-auto transition-all duration-200 cursor-pointer`}
                                      onMouseEnter={() => setHoveredAnomalyIndex(aIdx)}
                                      onMouseLeave={() => setHoveredAnomalyIndex(null)}
                                      style={{
                                        left: `${Math.max(0, anom.box.x * scaleX - 1)}%`,
                                        top: `${Math.max(0, anom.box.y * scaleY - 0.5)}%`,
                                        width: `${(anom.box.width * scaleX) + 2}%`,
                                        height: `${(anom.box.height * scaleY) + 1}%`,
                                        zIndex: isHovered ? 50 : 10,
                                      }}
                                    >
                                      <div className={`w-full h-full border-4 ${anom.resolved ? 'border-dashed border-emerald-400' : 'border-orange-500'} ${isHovered && !anom.resolved ? 'shadow-[0_0_0_9999px_rgba(0,0,0,0.75)]' : 'shadow-none'} rounded-sm transition-shadow duration-300`}></div>
                                      
                                      {/* Temporary Overlay showing specific anomaly and detected option */}
                                      {isHovered && (
                                        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 shadow-2xl flex flex-col items-center whitespace-nowrap transform scale-100 animate-in fade-in zoom-in-95 duration-200">
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-1">
                                              Question {anom.questionNumber} • {anom.anomalyType.replace('_', ' ')}
                                            </div>
                                            <div className="text-sm font-bold flex items-center gap-2">
                                              Detected: <span className="text-white bg-slate-800 px-2 py-0.5 rounded">{anom.detectedOption || 'None'}</span>
                                            </div>
                                            {anom.expectedOption && (
                                              <div className="text-sm font-bold flex items-center gap-2 mt-1 text-emerald-400">
                                                Expected: <span className="text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded">{anom.expectedOption}</span>
                                              </div>
                                            )}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
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

      {manualResolveIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col md:flex-row overflow-hidden border border-slate-200">
            {results[manualResolveIndex]?.pageImage && (
              <div className="w-full md:w-1/2 min-h-[300px] bg-slate-100 flex items-center justify-center overflow-hidden border-b md:border-b-0 md:border-r border-slate-200">
                <div className="relative w-full h-full p-4 overflow-auto flex items-start justify-center">
                   {/* Zoom into header by cropping with scale */}
                   <img 
                      src={results[manualResolveIndex].pageImage!} 
                      className="max-w-none origin-top"
                      style={{ 
                        transform: 'scale(1.5)',
                        marginTop: '10%'
                      }}
                   />
                </div>
              </div>
            )}
            <div className="w-full md:w-1/2 p-6 flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Manual Resolve</h3>
                  <p className="text-xs text-slate-500 font-medium">Link record to OMR score: {results[manualResolveIndex]?.score}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Student Name</label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter student name"
                    value={manualForm.name}
                    onChange={e => setManualForm({...manualForm, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Church / Organization</label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter church"
                    value={manualForm.church}
                    onChange={e => setManualForm({...manualForm, church: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Level / Stage</label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter level"
                    value={manualForm.level}
                    onChange={e => setManualForm({...manualForm, level: e.target.value})}
                  />
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={() => setManualResolveIndex(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm uppercase tracking-wider rounded-lg transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => saveManualResolve(manualResolveIndex)}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm uppercase tracking-wider rounded-lg transition"
                >
                  Save Record
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
