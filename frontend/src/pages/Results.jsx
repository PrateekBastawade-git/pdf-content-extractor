import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { 
  ArrowLeft, Download, FileText, Clock, Search, AlignLeft, 
  Layers, X, Bookmark, Plus, Minus, RotateCcw, ChevronRight
} from 'lucide-react';

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text, query) {
  if (!query || !query.trim() || typeof text !== 'string') return text;
  const escaped = escapeRegExp(query.trim());
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 text-slate-900 font-semibold px-0.5 rounded">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function isNumberCell(val) {
  if (!val) return false;
  const str = String(val).trim();
  return /^[\$\€\£\₹]?\s*[\d,]+(\.\d+)?%?$/.test(str);
}

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const batchResults = location.state?.batchResults;
  const initialSingleData = location.state?.extractionData;
  const initialFilename = location.state?.filename;

  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionIdx, setSelectedSectionIdx] = useState(null);
  const contentScrollRef = useRef(null);

  // Zoom state (30% to 200%)
  const ZOOM_LEVELS = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 175, 200];
  const DEFAULT_ZOOM_INDEX = ZOOM_LEVELS.indexOf(100);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const currentZoom = ZOOM_LEVELS[zoomIndex];

  const handleZoomIn = () => {
    setZoomIndex((prev) => Math.min(ZOOM_LEVELS.length - 1, prev + 1));
  };

  const handleZoomOut = () => {
    setZoomIndex((prev) => Math.max(0, prev - 1));
  };

  const handleResetZoom = () => {
    setZoomIndex(DEFAULT_ZOOM_INDEX);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          handleZoomOut();
        } else if (e.key === '0') {
          e.preventDefault();
          handleResetZoom();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Active document resolution
  const currentDoc = useMemo(() => {
    if (batchResults && batchResults.length > 0) {
      return batchResults[activeDocIndex] || batchResults[0];
    }
    return {
      filename: initialFilename || initialSingleData?.filename || 'Document',
      extractionData: initialSingleData,
    };
  }, [batchResults, activeDocIndex, initialSingleData, initialFilename]);

  const extractionData = currentDoc.extractionData;
  const filename = currentDoc.filename || extractionData?.filename || 'Document';

  // Extract structured document model
  const structuredDoc = useMemo(() => {
    if (!extractionData) return null;
    if (extractionData.document && extractionData.document.sections) {
      return extractionData.document;
    }
    
    // Legacy fallback converter
    const sections = [];
    let currentSec = {
      title: 'General Overview',
      level: 1,
      page_number: 1,
      paragraphs: [],
      key_values: [],
      tables: [],
      lists: [],
      subsections: []
    };
    sections.push(currentSec);

    (extractionData.pages || []).forEach((page) => {
      (page.blocks || []).forEach((b) => {
        if (b.type === 'heading' && b.text) {
          currentSec = {
            title: b.text,
            level: b.level || 1,
            page_number: page.page_number,
            paragraphs: [],
            key_values: [],
            tables: [],
            lists: [],
            subsections: []
          };
          sections.push(currentSec);
        } else if (b.type === 'paragraph' && b.text) {
          currentSec.paragraphs.push(b.text);
        } else if (b.type === 'key_value' && b.items) {
          currentSec.key_values.push(...b.items.map((i) => ({ key: i.key || i.label, value: i.value })));
        } else if (b.type === 'table') {
          currentSec.tables.push({ headers: b.headers, rows: b.rows || [] });
        } else if (b.type === 'list' && b.items) {
          currentSec.lists.push((b.items || []).map((i) => i.text || i.label || ''));
        }
      });
    });

    if (sections.length > 1 && !sections[0].paragraphs.length && !sections[0].key_values.length && !sections[0].tables.length && !sections[0].subsections.length) {
      sections.shift();
    }

    return {
      title: filename,
      metadata: extractionData.file_summary || {},
      sections
    };
  }, [extractionData, filename]);

  const sections = structuredDoc?.sections || [];

  // Filter sections based on search query
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const query = searchQuery.toLowerCase();

    const matchSection = (sec) => {
      if (sec.title.toLowerCase().includes(query)) return true;
      if (sec.paragraphs && sec.paragraphs.some((p) => p.toLowerCase().includes(query))) return true;
      if (sec.key_values && sec.key_values.some((kv) => (kv.key || kv.label || '').toLowerCase().includes(query) || (kv.value || '').toLowerCase().includes(query))) return true;
      if (sec.tables && sec.tables.some((t) => (t.headers || []).some((h) => h.toLowerCase().includes(query)) || (t.rows || []).some((r) => r.some((c) => String(c).toLowerCase().includes(query))))) return true;
      if (sec.subsections && sec.subsections.some(matchSection)) return true;
      return false;
    };

    return sections.filter(matchSection);
  }, [sections, searchQuery]);

  useEffect(() => {
    if (selectedSectionIdx === null) return;
    const el = document.getElementById(`section-${selectedSectionIdx}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedSectionIdx]);

  if (!extractionData || !structuredDoc) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-2">No extraction data found</h2>
          <p className="text-slate-500 mb-6">Please upload a document first.</p>
          <button 
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const { total_pages, metadata, file_summary } = extractionData;

  const handleDownloadJson = () => {
    const dataStr = JSON.stringify(extractionData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename.replace(/\.pdf$/i, '')}_structured.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderSectionContent = (sec, secIdx, isSubsection = false) => {
    const isSelected = selectedSectionIdx === secIdx;

    return (
      <section
        key={sec.id || secIdx}
        id={`section-${secIdx}`}
        className={`mb-6 scroll-mt-6 rounded-xl transition-all ${
          isSubsection
            ? 'pl-4 border-l-2 border-slate-200 mt-4'
            : 'p-5 bg-white border border-slate-200 shadow-sm'
        } ${isSelected ? 'bg-blue-50/40 border-blue-300 ring-2 ring-blue-100' : ''}`}
      >
        {/* Section Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-4">
          <h2 className={`font-bold tracking-tight ${isSubsection ? 'text-sm md:text-base text-slate-800' : 'text-base md:text-lg text-slate-900'}`}>
            {highlightText(sec.title, searchQuery)}
          </h2>
          <span className="text-[10px] font-semibold text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            Page {sec.page_number}
          </span>
        </div>

        {/* Structured Key-Value Section */}
        {sec.key_values && sec.key_values.length > 0 && (
          <div className="my-3.5 bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs sm:text-[13px]">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">
              Field Information
            </div>
            <dl className="w-full space-y-1.5">
              {sec.key_values.map((kv, i) => (
                <div key={i} className="flex gap-4 py-1 border-b border-slate-200/70 last:border-0">
                  <dt className="w-1/3 min-w-[120px] font-semibold text-slate-700 shrink-0">{highlightText(kv.key || kv.label, searchQuery)}</dt>
                  <dd className="w-2/3 whitespace-pre-wrap text-slate-900 m-0 [overflow-wrap:anywhere]">{highlightText(kv.value || '—', searchQuery)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Paragraphs */}
        {sec.paragraphs && sec.paragraphs.map((para, pIdx) => (
          <p key={pIdx} className="text-xs sm:text-[13px] text-slate-800 leading-relaxed mb-3 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {highlightText(para, searchQuery)}
          </p>
        ))}

        {/* Structured Data Tables */}
        {sec.tables && sec.tables.map((tbl, tIdx) => (
          <div key={tIdx} className="my-3 border border-slate-300 rounded shadow-sm bg-white overflow-hidden">
            <table className="table-auto w-auto min-w-full text-xs sm:text-[13px] border-collapse border-spacing-0 border border-slate-300">
              {tbl.headers && tbl.headers.length > 0 && (
                <thead className="bg-slate-100 border-b-2 border-slate-300">
                  <tr>
                    {tbl.headers.map((h, i) => (
                      <th key={i} className="py-[3px] px-[5px] font-bold text-slate-800 uppercase tracking-wider text-[11px] align-top text-left whitespace-normal border border-slate-300 [overflow-wrap:anywhere]">
                        {highlightText(h, searchQuery)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody className="divide-y divide-slate-200 bg-white">
                {tbl.rows && tbl.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                    {row.map((cell, cIdx) => {
                      const isNum = isNumberCell(cell);
                      return (
                        <td 
                          key={cIdx} 
                          className={`py-[3px] px-[5px] text-[12.5px] text-slate-800 align-top whitespace-normal border border-slate-300 [overflow-wrap:anywhere] ${isNum ? 'text-right font-mono' : 'text-left'}`}
                        >
                          {typeof cell === 'string' && (cell.endsWith('.pdf') || cell.endsWith('.xlsx')) ? (
                            <span className="text-blue-700 underline font-medium break-all">{highlightText(cell, searchQuery)}</span>
                          ) : (
                            highlightText(String(cell), searchQuery)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* Lists */}
        {sec.lists && sec.lists.map((lst, lIdx) => (
          <ul key={lIdx} className="my-3 list-disc pl-5 text-xs sm:text-[13px] text-slate-800 space-y-1">
            {lst.map((itemStr, i) => (
              <li key={i} className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{highlightText(itemStr, searchQuery)}</li>
            ))}
          </ul>
        ))}

        {/* Nested Subsections */}
        {sec.subsections && sec.subsections.length > 0 && (
          <div className="mt-4 space-y-4">
            {sec.subsections.map((subSec, subIdx) => renderSectionContent(subSec, `${secIdx}-${subIdx}`, true))}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col h-screen overflow-hidden">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shrink-0 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4 min-w-0">
              <button 
                onClick={() => navigate('/dashboard')}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                title="Back to upload"
              >
                <ArrowLeft size={20} aria-hidden="true" />
              </button>
              <div className="h-6 w-px bg-slate-200 shrink-0"></div>
              
              {batchResults && batchResults.length > 1 ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Layers size={18} className="text-blue-600 shrink-0" />
                  <select
                    value={activeDocIndex}
                    onChange={(e) => {
                      setActiveDocIndex(Number(e.target.value));
                      setSelectedSectionIdx(null);
                    }}
                    className="bg-slate-100 border border-slate-300 font-semibold text-slate-900 text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 truncate max-w-xs"
                  >
                    {batchResults.map((res, i) => (
                      <option key={i} value={i}>
                        {res.filename} ({i + 1}/{batchResults.length})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="min-w-0">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2 truncate">
                    <FileText size={18} className="text-blue-600 shrink-0" aria-hidden="true" />
                    <span className="truncate">{filename}</span>
                  </h1>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden lg:flex items-center gap-5 text-xs text-slate-500 font-medium">
                <span title="Total Pages"><FileText size={14} className="inline mr-1 text-slate-400" />{total_pages} pages</span>
                <span title="Document Sections"><AlignLeft size={14} className="inline mr-1 text-blue-600" />{sections.length} sections</span>
                <span title="Processing Time"><Clock size={14} className="inline mr-1 text-slate-400" />{metadata?.processing_time_ms || 0} ms</span>
              </div>

              <button
                onClick={handleDownloadJson}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg transition-colors text-xs shrink-0 border border-blue-200"
              >
                <Download size={14} aria-hidden="true" />
                <span>Export Structured JSON</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex overflow-hidden p-4 gap-4">
        
        {/* Left Sidebar: Document Sections Outline */}
        <div className="w-80 border border-slate-200 bg-white rounded-xl flex flex-col overflow-hidden shrink-0 shadow-sm">
          <div className="p-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Bookmark size={14} className="text-blue-600" />
                <span>Document Sections</span>
              </h2>
              <span className="text-[11px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                {sections.length} Sections
              </span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} aria-hidden="true" />
              <input
                type="text"
                placeholder="Filter sections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {filteredSections.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No sections matching "{searchQuery}"
              </div>
            ) : (
              <ul className="space-y-1">
                {filteredSections.map((sec, idx) => {
                  const originalIdx = sections.indexOf(sec);
                  const isSelected = selectedSectionIdx === originalIdx;
                  return (
                    <li key={originalIdx}>
                      <button
                        onClick={() => setSelectedSectionIdx(originalIdx)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-start gap-2 transition-colors
                          ${isSelected 
                            ? 'bg-blue-50 text-blue-700 font-semibold border-l-2 border-blue-600' 
                            : 'text-slate-700 hover:bg-slate-100'
                          }`}
                      >
                        <div className="flex-1 line-clamp-2 pr-1 font-medium">
                          {highlightText(sec.title, searchQuery)}
                        </div>
                        <span className={`text-[10px] whitespace-nowrap mt-0.5 font-mono ${isSelected ? 'text-blue-500 font-bold' : 'text-slate-400'}`}>
                          p.{sec.page_number}
                        </span>
                      </button>

                      {/* Render Subsections in Sidebar */}
                      {sec.subsections && sec.subsections.length > 0 && (
                        <ul className="pl-3 mt-1 space-y-1 border-l border-slate-200">
                          {sec.subsections.map((sub, subIdx) => (
                            <li key={subIdx}>
                              <button
                                onClick={() => setSelectedSectionIdx(`${originalIdx}-${subIdx}`)}
                                className="w-full text-left px-2 py-1 rounded text-[11px] text-slate-600 hover:bg-slate-100 flex items-center justify-between"
                              >
                                <span className="truncate flex items-center gap-1">
                                  <ChevronRight size={10} className="text-slate-400 shrink-0" />
                                  {highlightText(sub.title, searchQuery)}
                                </span>
                                <span className="text-[9px] text-slate-400 font-mono">p.{sub.page_number}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Clean Extracted Data Preview Main Pane - Single Document Scroll Container */}
        <div
          ref={contentScrollRef}
          className="flex-1 overflow-auto bg-slate-100 p-4 md:p-6 rounded-xl border border-slate-200 shadow-inner w-full h-full text-[14px]"
        >
          {/* Zoom Controls Toolbar */}
          <div className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur-md pb-3 flex items-center justify-between gap-4 border-b border-slate-200/80 mb-4 px-1">
            <div className="flex items-center gap-1 bg-white border border-slate-200 shadow-sm rounded-lg p-1 text-xs">
              <button
                onClick={handleZoomOut}
                disabled={zoomIndex === 0}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Zoom Out (Ctrl + -)"
              >
                <Minus size={15} />
              </button>
              
              <span className="w-14 text-center font-mono font-bold text-slate-800 text-xs">
                {currentZoom}%
              </span>

              <button
                onClick={handleZoomIn}
                disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Zoom In (Ctrl + +)"
              >
                <Plus size={15} />
              </button>

              <div className="h-4 w-px bg-slate-200 mx-1"></div>

              <button
                onClick={handleResetZoom}
                disabled={currentZoom === 100}
                className="px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded disabled:opacity-40 transition-colors flex items-center gap-1"
                title="Reset to 100% (Ctrl + 0)"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-500 font-medium hidden sm:block">
              Zoom: <span className="font-semibold text-slate-700">{currentZoom}%</span> (Ctrl + +/-/0)
            </div>
          </div>

          <div
            className="bg-white mx-auto w-max min-w-full min-h-[900px] shadow-sm border border-slate-200 p-6 md:p-10 text-slate-900 font-sans rounded-xl transition-all duration-150"
            style={{ zoom: `${currentZoom}%` }}
          >
            
            {/* Title & Document Information Card */}
            <div className="border-b border-slate-200 pb-6 mb-8">
              <div className="flex justify-between items-start mb-2 gap-4">
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                  {structuredDoc.title || filename}
                </h1>
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200 shrink-0">
                  {sections.length} Main Sections
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">Structured Digital Document Preview</p>

              {/* Document Information Metadata Block */}
              {file_summary && (file_summary.serff_tracking_number || file_summary.company_tracking_number || file_summary.state || file_summary.filing_company) && (
                <div className="mt-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-2 mb-3 flex items-center justify-between">
                    <span>Document Information</span>
                    <span className="text-[10px] text-slate-400 font-mono font-normal">Header Metadata</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-slate-800">
                    <div><span className="font-semibold text-slate-500">SERFF Tracking #:</span> {file_summary.serff_tracking_number || 'N/A'}</div>
                    <div><span className="font-semibold text-slate-500">Company Tracking #:</span> {file_summary.company_tracking_number || 'N/A'}</div>
                    <div><span className="font-semibold text-slate-500">State:</span> {file_summary.state || 'N/A'}</div>
                    <div><span className="font-semibold text-slate-500">Filing Company:</span> {file_summary.filing_company || 'N/A'}</div>
                    <div className="col-span-2"><span className="font-semibold text-slate-500">TOI/Sub-TOI:</span> {file_summary.toi_sub_toi || 'N/A'}</div>
                    <div className="col-span-2"><span className="font-semibold text-slate-500">Product Name:</span> {file_summary.product_name || 'N/A'}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Document Sections Hierarchy */}
            {sections.length === 0 ? (
              <div className="flex items-center justify-center text-slate-400 py-12 italic text-sm">
                No sections extracted.
              </div>
            ) : (
              sections.map((sec, secIdx) => renderSectionContent(sec, secIdx))
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
