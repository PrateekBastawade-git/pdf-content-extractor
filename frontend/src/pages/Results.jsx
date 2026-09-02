import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { 
  ArrowLeft, Download, FileText, Clock, Search, 
  ChevronRight, AlignLeft, BarChart2, Info
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // The extraction JSON passed via React Router state
  const extractionData = location.state?.extractionData;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0);

  // Redirect if no data is present
  if (!extractionData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-2">No extraction data found</h2>
          <p className="text-slate-500 mb-6">Please upload a PDF first.</p>
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

  const { filename, total_pages, metadata, sections, file_summary } = extractionData;

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const lowerQuery = searchQuery.toLowerCase();
    return sections.filter(sec => 
      sec.title.toLowerCase().includes(lowerQuery) || 
      sec.raw_markdown.toLowerCase().includes(lowerQuery)
    );
  }, [sections, searchQuery]);

  const handleDownloadJson = () => {
    const dataStr = JSON.stringify(extractionData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename.replace('.pdf', '')}_extracted.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const selectedSection = sections[selectedSectionIndex];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/dashboard')}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                title="Back to upload"
              >
                <ArrowLeft size={20} aria-hidden="true" />
              </button>
              <div className="h-6 w-px bg-slate-200"></div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileText size={18} className="text-blue-600" aria-hidden="true" />
                  {filename}
                </h1>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-6 text-sm text-slate-500 mr-4">
                <span className="flex items-center gap-1.5" title="Page Count">
                  <FileText size={16} aria-hidden="true" /> {total_pages} pages
                </span>
                <span className="flex items-center gap-1.5" title="Detected Headings">
                  <AlignLeft size={16} aria-hidden="true" /> {metadata.heading_count} headings
                </span>
                <span className="flex items-center gap-1.5" title="Processing Time">
                  <Clock size={16} aria-hidden="true" /> {metadata.processing_time_ms} ms
                </span>
              </div>
              <button
                onClick={handleDownloadJson}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium rounded-lg transition-colors text-sm"
              >
                <Download size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Export JSON</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row overflow-hidden pb-4 px-4 sm:px-6 lg:px-8 gap-4 pt-4">
        
        {/* Sidebar */}
        <div className="w-full md:w-80 border border-slate-200 bg-white rounded-xl flex flex-col overflow-hidden shrink-0 shadow-sm h-[calc(100vh-6rem)] sticky top-[5rem]">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
              <input
                type="text"
                placeholder="Search headings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {filteredSections.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">
                No sections found matching "{searchQuery}"
              </div>
            ) : (
              <ul className="space-y-1">
                {filteredSections.map((sec, idx) => {
                  const originalIndex = sections.findIndex(s => s === sec);
                  const isSelected = selectedSectionIndex === originalIndex;
                  
                  return (
                    <li key={originalIndex}>
                      <button
                        onClick={() => setSelectedSectionIndex(originalIndex)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-start gap-2 transition-colors
                          ${isSelected 
                            ? 'bg-blue-50 text-blue-700 font-medium' 
                            : 'text-slate-700 hover:bg-slate-100'
                          }`}
                      >
                        <span className={`mt-0.5 shrink-0 text-xs font-mono px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
                          {sec.id}
                        </span>
                        <div className="flex-1 line-clamp-2 pr-2">
                          {sec.title}
                        </div>
                        <span className={`text-xs whitespace-nowrap mt-0.5 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}>
                          Pg {sec.page}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Content Viewer (Scrollable Main Area) */}
        <div className="flex-1 flex flex-col overflow-y-auto bg-slate-200 p-4 md:p-8 rounded-xl shadow-inner">
          <div className="bg-white mx-auto w-full max-w-[850px] min-h-[1100px] shadow-lg border border-slate-300 p-10 md:p-14 text-slate-900 font-sans">
            
            {/* SERFF Document Header Banner */}
            {file_summary && (
              <div className="mb-8 text-sm font-sans">
                <div className="flex justify-between border-b-2 border-slate-800 pb-2 mb-3 font-mono text-slate-800 font-bold">
                  <span>SERFF Tracking #: {file_summary.serff_tracking_number || '-'}</span>
                  <span>Company Tracking #: {file_summary.company_tracking_number || '-'}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-slate-800">
                  <div><strong>State:</strong> {file_summary.state || '-'}</div>
                  <div><strong>Filing Company:</strong> {file_summary.filing_company || '-'}</div>
                  <div className="col-span-2"><strong>TOI/Sub-TOI:</strong> {file_summary.toi_sub_toi || '-'}</div>
                  <div className="col-span-2"><strong>Product Name:</strong> {file_summary.product_name || '-'}</div>
                </div>
              </div>
            )}

            {selectedSection ? (
              <div className="document-content">
                <h2 className="text-xl font-bold text-slate-900 mb-4 border-b border-slate-300 pb-2 flex items-baseline justify-between uppercase">
                  <span>{selectedSection.title}</span>
                  <span className="text-xs font-normal text-slate-500 normal-case">Page {selectedSection.page}</span>
                </h2>
                
                {(() => {
                  if (!selectedSection.blocks || selectedSection.blocks.length === 0) {
                    return selectedSection.raw_markdown ? (
                       <div className="text-sm text-slate-800 leading-relaxed space-y-4 whitespace-pre-wrap">
                         <ReactMarkdown remarkPlugins={[remarkGfm]}>
                           {selectedSection.raw_markdown}
                         </ReactMarkdown>
                       </div>
                    ) : (
                       <div className="flex items-center justify-center text-slate-400 py-12 italic text-sm">
                         No body text associated with this heading.
                       </div>
                    );
                  }

                  return selectedSection.blocks.map((block, idx) => {
                    if (block.type === 'subheading') {
                      return (
                        <h3 key={idx} className="text-md font-bold text-slate-900 mt-6 mb-2">
                          {block.title}
                        </h3>
                      );
                    }
                    if (block.type === 'table') {
                      return (
                        <div key={idx} className="my-6">
                          <table className="w-full text-sm text-left border-collapse">
                            {block.headers && block.headers.length > 0 && (
                              <thead>
                                <tr className="border-b-2 border-slate-400 font-bold text-slate-900">
                                  {block.headers.map((h, i) => (
                                    <th key={i} className="py-2 pr-4">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                            )}
                            <tbody className="divide-y divide-slate-200">
                              {block.rows && block.rows.map((row, rIdx) => (
                                <tr key={rIdx}>
                                  {row.map((cell, cIdx) => (
                                    <td key={cIdx} className="py-2 pr-4 align-top whitespace-pre-wrap">
                                      {cell.endsWith('.pdf') || cell.endsWith('.xlsx') ? (
                                        <span className="text-blue-700 underline cursor-pointer">{cell}</span>
                                      ) : (
                                        cell
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    }
                    if (block.type === 'key_value_grid') {
                      return (
                        <div key={idx} className="my-4">
                          <table className="w-full text-sm text-left border-collapse">
                            <tbody>
                              {block.items && block.items.map((item, i) => (
                                <tr key={i}>
                                  <td className="w-1/3 py-1.5 pr-4 font-bold text-slate-800 align-top">{item.label}</td>
                                  <td className="w-2/3 py-1.5 align-top whitespace-pre-wrap">{item.value || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    }
                    return (
                      <div key={idx} className="text-sm text-slate-800 leading-relaxed mb-4 whitespace-pre-wrap">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {block.raw_markdown}
                        </ReactMarkdown>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-3 py-24 italic text-sm">
                <AlignLeft size={32} className="text-slate-300" aria-hidden="true" />
                <p>Select a section from the sidebar to view its content.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
