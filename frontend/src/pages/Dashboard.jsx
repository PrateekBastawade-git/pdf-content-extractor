import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { extractPdf } from '../services/api';
import { UploadCloud, File, AlertCircle, Loader2, LogOut, CheckCircle, Trash2, Layers } from 'lucide-react';

export default function Dashboard() {
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressIndex, setProgressIndex] = useState(null);
  const [error, setError] = useState('');
  
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragging(false);
  };

  const validateAndAddFiles = (selectedFiles) => {
    setError('');
    if (!selectedFiles || selectedFiles.length === 0) return;
    
    const validPdfs = [];
    let hasInvalid = false;

    Array.from(selectedFiles).forEach((f) => {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        validPdfs.push(f);
      } else {
        hasInvalid = true;
      }
    });

    if (hasInvalid) {
      setError('Some selected files were skipped because they are not PDFs.');
    }

    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const newFiles = validPdfs.filter((f) => !existingNames.has(f.name));
      return [...prev, ...newFiles];
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    
    setLoading(true);
    setError('');
    
    const results = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setProgressIndex(i);
        const currentFile = files[i];
        const data = await extractPdf(currentFile);
        results.push({
          filename: currentFile.name,
          extractionData: data,
        });
      }

      // Navigate to results page with batch results
      navigate('/results', {
        state: {
          batchResults: results,
          extractionData: results[0].extractionData,
          filename: results[0].filename,
        },
      });
    } catch (err) {
      setError(err.message || 'An unexpected error occurred during extraction.');
    } finally {
      setLoading(false);
      setProgressIndex(null);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center gap-2">
                <div className="h-8 w-8 bg-blue-600 rounded flex items-center justify-center text-white">
                  <File size={18} aria-hidden="true" />
                </div>
                <span className="font-bold text-slate-900 text-lg">Extractor</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-500">{user?.email}</span>
              <button 
                onClick={handleLogout}
                className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm font-medium transition-colors"
              >
                <LogOut size={16} aria-hidden="true" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-8 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Upload PDFs</h1>
              <p className="mt-1 text-slate-500">Upload single or batch PDF documents to extract structured headings and text.</p>
            </div>
            {files.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-100">
                <Layers size={14} />
                {files.length} {files.length === 1 ? 'file' : 'files'} selected
              </span>
            )}
          </div>
          
          <div className="p-6 sm:p-10">
            {error && (
              <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-lg flex items-start gap-3 border border-red-100">
                <AlertCircle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-medium">Upload Error</h3>
                  <div className="mt-1 text-sm text-red-600">{error}</div>
                </div>
              </div>
            )}

            <div
              className={`
                border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
                ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100'}
                ${files.length > 0 ? 'border-blue-400 bg-blue-50/20' : ''}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                className="hidden"
                accept="application/pdf"
                multiple
                ref={fileInputRef}
                onChange={handleFileInput}
              />
              
              <div className="flex flex-col items-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="h-14 w-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3">
                  <UploadCloud size={28} aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  {files.length > 0 ? 'Add more files or drag & drop here' : 'Click or drag PDF files to this area'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Supported format: PDF. Select multiple files for batch processing.
                </p>
                <button 
                  type="button"
                  className="mt-4 px-4 py-2 border border-slate-300 shadow-sm text-xs font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                >
                  Browse Files
                </button>
              </div>
            </div>

            {files.length > 0 && (
              <div className="mt-8 border-t border-slate-200 pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-slate-900">Queued Files ({files.length})</h3>
                  <button
                    onClick={() => setFiles([])}
                    disabled={loading}
                    className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                  >
                    Clear All
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {files.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {loading && progressIndex === idx ? (
                          <Loader2 size={18} className="animate-spin text-blue-600 shrink-0" />
                        ) : loading && progressIndex > idx ? (
                          <CheckCircle size={18} className="text-green-600 shrink-0" />
                        ) : (
                          <File size={18} className="text-slate-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">{f.name}</p>
                          <p className="text-xs text-slate-500">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>

                      <button
                        onClick={() => removeFile(idx)}
                        disabled={loading}
                        className="text-slate-400 hover:text-red-600 p-1 rounded-md transition-colors disabled:opacity-50"
                        title="Remove file"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleUpload}
                    disabled={loading}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm text-sm disabled:opacity-70 flex items-center gap-2 transition-colors"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Processing document {progressIndex + 1} of {files.length}...
                      </>
                    ) : (
                      `Extract Content (${files.length} ${files.length === 1 ? 'file' : 'files'})`
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

