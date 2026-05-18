import { useState, useCallback } from 'react';
import { api } from '../services/api';
import { UploadResponse, PageAnalysisResult, RedactRequestItem, RedactedPage } from '../types';

export type AppStep = 'upload' | 'review' | 'export';

export interface DocumentState {
  docId: string | null;
  profile: string;
  pages: UploadResponse['pages'];
  analysisResults: Record<number, PageAnalysisResult>;
  redactedPages: RedactedPage[];
  isUploading: boolean;
  isAnalyzing: boolean;
  currentAnalyzingPage: number | null;
  pendingPages: number[];
  analyzedCount: number;
}

export function useDocument() {
  const [step, setStep] = useState<AppStep>('upload');
  const [state, setState] = useState<DocumentState>({
    docId: null,
    profile: 'healthcare',
    pages: [],
    analysisResults: {},
    redactedPages: [],
    isUploading: false,
    isAnalyzing: false,
    currentAnalyzingPage: null,
    pendingPages: [],
    analyzedCount: 0,
  });

  const upload = async (file: File, profile: string) => {
    try {
      // 0. Start uploading
      setState(prev => ({ 
        ...prev, 
        isUploading: true,
        docId: null,
        pages: [],
        analysisResults: {},
        redactedPages: [],
        currentAnalyzingPage: null,
        analyzedCount: 0
      }));

      // 1. Upload the file
      const uploadRes = await api.upload(file, profile);
      
      setState(prev => ({
        ...prev,
        docId: uploadRes.doc_id,
        profile: uploadRes.profile,
        pages: uploadRes.pages,
        isUploading: false,
      }));
      
      setStep('review');
    } catch (err) {
      console.error('Upload failed:', err);
      setState(prev => ({ ...prev, isUploading: false }));
      throw err;
    }
  };

  const analyzePage = async (pageNumber: number, force: boolean = false) => {
    if (!state.docId) return;

    setState(prev => ({ 
      ...prev, 
      isAnalyzing: true,
      currentAnalyzingPage: pageNumber,
    }));

    try {
      const result = await api.analyzePage(state.docId, pageNumber, force);
      setState(prev => {
        const isNew = !prev.analysisResults[pageNumber];
        return {
          ...prev,
          analyzedCount: isNew ? prev.analyzedCount + 1 : prev.analyzedCount,
          analysisResults: {
            ...prev.analysisResults,
            [pageNumber]: result
          }
        };
      });
    } catch (err) {
      console.error(`Error analyzing page ${pageNumber}:`, err);
    } finally {
      setState(prev => ({ ...prev, isAnalyzing: false, currentAnalyzingPage: null }));
    }
  };

  const batchAnalyzePages = async (pageNumbers: number[], force: boolean = false) => {
    if (!state.docId) return;
    
    // Mark all pages as pending at the start
    setState(prev => ({ ...prev, isAnalyzing: true, pendingPages: [...pageNumbers] }));
    
    for (const pageNum of pageNumbers) {
      // Move page from pending queue to actively scanning
      setState(prev => ({
        ...prev,
        currentAnalyzingPage: pageNum,
        pendingPages: prev.pendingPages.filter(p => p !== pageNum),
      }));
      try {
        const result = await api.analyzePage(state.docId, pageNum, force);
        setState(prev => {
          const isNew = !prev.analysisResults[pageNum];
          return {
            ...prev,
            analyzedCount: isNew ? prev.analyzedCount + 1 : prev.analyzedCount,
            analysisResults: {
              ...prev.analysisResults,
              [pageNum]: result
            }
          };
        });
      } catch (err) {
        console.error(`Error in batch analysis for page ${pageNum}:`, err);
      }
    }
    
    setState(prev => ({ ...prev, isAnalyzing: false, currentAnalyzingPage: null, pendingPages: [] }));
  };

  const applyRedactions = async (fieldsToRedact: RedactRequestItem[]) => {
    if (!state.docId) return;
    try {
      const res = await api.redact(state.docId, fieldsToRedact);
      setState(prev => ({
        ...prev,
        redactedPages: res.redacted_pages
      }));
    } catch (err) {
      console.error('Redaction failed:', err);
      throw err;
    }
  };

  const reset = useCallback(() => {
    setStep('upload');
    setState({
      docId: null,
      profile: 'healthcare',
      pages: [],
      analysisResults: {},
      redactedPages: [],
      isUploading: false,
      pendingPages: [],
      isAnalyzing: false,
      currentAnalyzingPage: null,
      analyzedCount: 0,
    });
  }, []);

  return {
    step,
    setStep,
    state,
    upload,
    analyzePage,
    batchAnalyzePages,
    applyRedactions,
    reset
  };
}
