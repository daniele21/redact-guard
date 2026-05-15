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
  isAnalyzing: boolean;
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
    isAnalyzing: false,
    analyzedCount: 0,
  });

  const uploadAndAnalyze = async (file: File, profile: string) => {
    try {
      // 1. Upload the file
      const uploadRes = await api.upload(file, profile);
      
      setState(prev => ({
        ...prev,
        docId: uploadRes.doc_id,
        profile: uploadRes.profile,
        pages: uploadRes.pages,
        isAnalyzing: true,
        analyzedCount: 0,
        analysisResults: {},
        redactedPages: []
      }));
      
      setStep('review');

      // 2. Sequential analysis per page (auto-batch behavior from frontend)
      // This allows updating the UI progressively.
      const docId = uploadRes.doc_id;
      for (const page of uploadRes.pages) {
        try {
          const result = await api.analyzePage(docId, page.page_number);
          setState(prev => ({
            ...prev,
            analyzedCount: prev.analyzedCount + 1,
            analysisResults: {
              ...prev.analysisResults,
              [page.page_number]: result
            }
          }));
        } catch (err) {
          console.error(`Error analyzing page ${page.page_number}:`, err);
          setState(prev => ({ ...prev, analyzedCount: prev.analyzedCount + 1 }));
        }
      }
      
      setState(prev => ({ ...prev, isAnalyzing: false }));

    } catch (err) {
      console.error('Upload failed:', err);
      throw err;
    }
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
      isAnalyzing: false,
      analyzedCount: 0,
    });
  }, []);

  return {
    step,
    setStep,
    state,
    uploadAndAnalyze,
    applyRedactions,
    reset
  };
}
