import { useState, useCallback } from 'react';
import { api } from '../services/api';
import {
  DocumentAnalysisSummary,
  PageAnalysisResult,
  RedactRequestItem,
  RedactedPage,
  UploadResponse,
} from '../types';

export type AppStep = 'upload' | 'review' | 'export';

export interface DocumentState {
  docId: string | null;
  profile: string;
  pages: UploadResponse['pages'];
  analysisResults: Record<number, PageAnalysisResult>;
  analysisErrors: Record<number, string>;
  summary: DocumentAnalysisSummary | null;
  redactedPages: RedactedPage[];
  isUploading: boolean;
  isAnalyzing: boolean;
  currentAnalyzingPage: number | null;
  pendingPages: number[];
  analyzedCount: number;
}

const initialState = (): DocumentState => ({
  docId: null,
  profile: 'healthcare',
  pages: [],
  analysisResults: {},
  analysisErrors: {},
  summary: null,
  redactedPages: [],
  isUploading: false,
  isAnalyzing: false,
  currentAnalyzingPage: null,
  pendingPages: [],
  analyzedCount: 0,
});

export function useDocument() {
  const [step, setStep] = useState<AppStep>('upload');
  const [state, setState] = useState<DocumentState>(initialState);

  const refreshSummary = async (docId: string) => {
    const summary = await api.getAnalysisSummary(docId);
    setState(prev => ({ ...prev, summary }));
    return summary;
  };

  const upload = async (file: File, profile: string) => {
    try {
      setState({
        ...initialState(),
        isUploading: true,
        profile,
      });

      const uploadRes = await api.upload(file, profile);
      let summary: DocumentAnalysisSummary | null = null;
      try {
        summary = await api.getAnalysisSummary(uploadRes.doc_id);
      } catch (summaryError) {
        console.warn('Initial analysis summary unavailable:', summaryError);
      }

      setState(prev => ({
        ...prev,
        docId: uploadRes.doc_id,
        profile: uploadRes.profile,
        pages: uploadRes.pages,
        summary,
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
    const docId = state.docId;
    if (!docId) return;

    setState(prev => {
      const nextErrors = { ...prev.analysisErrors };
      delete nextErrors[pageNumber];
      return {
        ...prev,
        isAnalyzing: true,
        currentAnalyzingPage: pageNumber,
        analysisErrors: nextErrors,
      };
    });

    try {
      const result = await api.analyzePage(docId, pageNumber, force);
      setState(prev => {
        const isNew = !prev.analysisResults[pageNumber];
        return {
          ...prev,
          analyzedCount: isNew ? prev.analyzedCount + 1 : prev.analyzedCount,
          analysisResults: {
            ...prev.analysisResults,
            [pageNumber]: result,
          },
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error analyzing page ${pageNumber}:`, err);
      setState(prev => ({
        ...prev,
        analysisErrors: {
          ...prev.analysisErrors,
          [pageNumber]: message,
        },
      }));
    } finally {
      try {
        await refreshSummary(docId);
      } catch (summaryError) {
        console.warn('Could not refresh analysis summary:', summaryError);
      }
      setState(prev => ({
        ...prev,
        isAnalyzing: false,
        currentAnalyzingPage: null,
      }));
    }
  };

  const batchAnalyzePages = async (
    pageNumbers: number[],
    force: boolean = false,
  ) => {
    const docId = state.docId;
    if (!docId) return;

    setState(prev => ({
      ...prev,
      isAnalyzing: true,
      pendingPages: [...pageNumbers],
    }));

    for (const pageNum of pageNumbers) {
      setState(prev => {
        const nextErrors = { ...prev.analysisErrors };
        delete nextErrors[pageNum];
        return {
          ...prev,
          currentAnalyzingPage: pageNum,
          pendingPages: prev.pendingPages.filter(p => p !== pageNum),
          analysisErrors: nextErrors,
        };
      });

      try {
        const result = await api.analyzePage(docId, pageNum, force);
        setState(prev => {
          const isNew = !prev.analysisResults[pageNum];
          return {
            ...prev,
            analyzedCount: isNew ? prev.analyzedCount + 1 : prev.analyzedCount,
            analysisResults: {
              ...prev.analysisResults,
              [pageNum]: result,
            },
          };
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error in batch analysis for page ${pageNum}:`, err);
        setState(prev => ({
          ...prev,
          analysisErrors: {
            ...prev.analysisErrors,
            [pageNum]: message,
          },
        }));
      }

      try {
        await refreshSummary(docId);
      } catch (summaryError) {
        console.warn('Could not refresh analysis summary:', summaryError);
      }
    }

    setState(prev => ({
      ...prev,
      isAnalyzing: false,
      currentAnalyzingPage: null,
      pendingPages: [],
    }));
  };

  const applyRedactions = async (fieldsToRedact: RedactRequestItem[]) => {
    const docId = state.docId;
    if (!docId) return;
    try {
      const res = await api.redact(docId, fieldsToRedact);
      setState(prev => ({
        ...prev,
        redactedPages: res.redacted_pages,
      }));
      try {
        await refreshSummary(docId);
      } catch (summaryError) {
        console.warn('Could not refresh decision summary:', summaryError);
      }
    } catch (err) {
      console.error('Redaction failed:', err);
      throw err;
    }
  };

  const reset = useCallback(() => {
    setStep('upload');
    setState(initialState());
  }, []);

  return {
    step,
    setStep,
    state,
    upload,
    analyzePage,
    batchAnalyzePages,
    applyRedactions,
    refreshSummary,
    reset,
  };
}
