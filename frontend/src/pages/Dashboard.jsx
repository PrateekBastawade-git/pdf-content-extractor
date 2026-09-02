import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { extractPdf } from '../services/api';
import { UploadCloud, File, AlertCircle, Loader2, LogOut, CheckCircle } from 'lucide-react';

export default function Dashboard() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const validateAndSetFile = (selectedFile) => {
    setError('');
    if (!selectedFile) return;
    
    if (selectedFile.type !== 'application/pdf') {
      setError('Invalid file type. Please upload a PDF document.');
      setFile(null);
      return;
    }
    
    setFile(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setLoading(true);
    setError('');
    
    try {
      const data = await extractPdf(file);
      // Pass data to results page via state
      navigate('/results', { state: { extractionData: data } });
    } catch (err) {
      setError(err.message || 'An unexpected error occurred during extraction.');
    } finally {
      setLoading(false);
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
          <div className="px-6 py-8 border-b border-slate-100">
            <h1 className="text-2xl font-bold text-slate-900">Upload PDF</h1>
            <p className="mt-1 text-slate-500">Upload a PDF document to extract its structured headings and text.</p>
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
                border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200
                ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100'}
                ${file ? 'border-green-500 bg-green-50 hover:bg-green-50 hover:border-green-500' : ''}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !file && fileInputRef.current?.click()}
            >
              <input
                type="file"
                className="hidden"
                accept="application/pdf"
                ref={fileInputRef}
                onChange={handleFileInput}
              />
              
              {file ? (
                <div className="flex flex-col items-center">
                  <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle size={32} aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900">{file.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      disabled={loading}
                      className="px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 focus:outline-none disabled:opacity-50 transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpload();
                      }}
                      disabled={loading}
                      className="px-6 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 flex items-center gap-2 shadow-sm transition-colors"
                    >
                      {loading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                          Processing...
                        </>
                      ) : (
                        'Extract Content'
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center cursor-pointer">
                  <div className="h-16 w-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                    <UploadCloud size={32} aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900">Click or drag a file to this area</h3>
                  <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">
                    Supported file type: PDF. Maximum file size: 50MB.
                  </p>
                  <button 
                    className="mt-6 px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 focus:outline-none transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse Files
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
