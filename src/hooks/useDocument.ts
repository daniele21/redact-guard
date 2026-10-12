import { useCallback, useRef, useState } from 'react';
import { api } from '../services/api';
import type {
  DocumentAnalysisSummary, PageAnalysisResult, RedactRequestItem,
  RedactedPage, UploadResponse,
} from '../types';

export type AppStep = 'upload' | 'review' | 'export';

export interface DocumentState {
  docId: string | null;
  filename: string;
  profile: string;
  model: string;
  policyDigest: string;
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

export interface ImportError {
  filename: string;
  message: string;
}

const emptyDocument = (): DocumentState => ({
  docId: null,
  filename: '',
  profile: 'general',
  model: '',
  policyDigest: '',
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

const fromUpload = (file: File, uploaded: UploadResponse, summary: DocumentAnalysisSummary | null): DocumentState => ({
  ...emptyDocument(),
  docId: uploaded.doc_id,
  filename: file.name,
  profile: uploaded.profile,
  model: uploaded.model,
  policyDigest: uploaded.policy_digest,
  pages: uploaded.pages,
  summary,
});

/**
 * Canonical document/session owner in the frontend. Backend sessions remain
 * independent by doc_id; one failed PDF never becomes a successful empty document.
 */
export function useDocument() {
  const [byId, setById] = useState<Record<string, DocumentState>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importingFile, setImportingFile] = useState('');
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const importing = useRef(false);
  const active = activeId ? byId[activeId] : undefined;
  const state = active ?? emptyDocument();

  const update = useCallback((docId: string, apply: (state: DocumentState) => DocumentState) => {
    setById(previous => {
      const current = previous[docId];
      return current ? { ...previous, [docId]: apply(current) } : previous;
    });
  }, []);

  const refreshSummary = useCallback(async (docId: string) => {
    const summary = await api.getAnalysisSummary(docId);
    update(docId, previous => ({ ...previous, summary }));
    return summary;
  }, [update]);

  const uploadFiles = useCallback(async (files: File[], profile: string) => {
    if (importing.current) return { added: 0, errors: [{ filename: '', message: 'Importazione già in corso.' }] };
    importing.current = true;
    setIsImporting(true);
    setImportErrors([]);
    const errors: ImportError[] = [];
    const ids: string[] = [];
    try {
      // Bounded sequential upload: existing local API creates one independent
      // backend document session per PDF. This is NOT fake client-side batch inference.
      for (const file of files) {
        setImportingFile(file.name);
        if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 50 * 1024 * 1024) {
          errors.push({ filename: file.name, message: 'Supportati soltanto PDF fino a 50 MB.' });
          continue;
        }
        try {
          const uploaded = await api.upload(file, profile);
          let summary: DocumentAnalysisSummary | null = null;
          try {
            summary = await api.getAnalysisSummary(uploaded.doc_id);
          } catch {
            // Missing summary does not mean a successful analysis.
          }
          setById(previous => ({
            ...previous,
            [uploaded.doc_id]: fromUpload(file, uploaded, summary),
          }));
          setOrder(previous => [...previous, uploaded.doc_id]);
          ids.push(uploaded.doc_id);
        } catch (cause) {
          errors.push({
            filename: file.name,
            message: cause instanceof Error ? cause.message : 'Importazione non riuscita.',
          });
        }
      }
      if (ids.length) setActiveId(ids[0]);
      setImportErrors(errors);
      return { added: ids.length, errors };
    } finally {
      importing.current = false;
      setIsImporting(false);
      setImportingFile('');
    }
  }, []);

  const upload = useCallback(async (file: File, profile: string) => {
    const result = await uploadFiles([file], profile);
    if (result.errors.length) throw new Error(result.errors[0].message);
  }, [uploadFiles]);

  const analyzePage = async (pageNumber: number, force = false) => {
    const docId = activeId;
    if (!docId) return;
    update(docId, previous => {
      const errors = { ...previous.analysisErrors };
      delete errors[pageNumber];
      return { ...previous, isAnalyzing: true, currentAnalyzingPage: pageNumber, analysisErrors: errors };
    });
    try {
      const result = await api.analyzePage(docId, pageNumber, force);
      update(docId, previous => ({
        ...previous,
        analyzedCount: previous.analyzedCount + (previous.analysisResults[pageNumber] ? 0 : 1),
        analysisResults: { ...previous.analysisResults, [pageNumber]: result },
      }));
    } catch (cause) {
      update(docId, previous => ({
        ...previous,
        analysisErrors: {
          ...previous.analysisErrors,
          [pageNumber]: cause instanceof Error ? cause.message : 'Analisi non riuscita.',
        },
      }));
    } finally {
      try { await refreshSummary(docId); } catch { /* failure remains explicit in state */ }
      update(docId, previous => ({ ...previous, isAnalyzing: false, currentAnalyzingPage: null }));
    }
  };

  const batchAnalyzePages = async (pageNumbers: number[], force = false) => {
    const docId = activeId;
    if (!docId) return;
    update(docId, previous => ({ ...previous, isAnalyzing: true, pendingPages: [...pageNumbers] }));
    for (const pageNumber of pageNumbers) {
      update(docId, previous => {
        const errors = { ...previous.analysisErrors };
        delete errors[pageNumber];
        return {
          ...previous,
          currentAnalyzingPage: pageNumber,
          pendingPages: previous.pendingPages.filter(number => number !== pageNumber),
          analysisErrors: errors,
        };
      });
      try {
        const result = await api.analyzePage(docId, pageNumber, force);
        update(docId, previous => ({
          ...previous,
          analyzedCount: previous.analyzedCount + (previous.analysisResults[pageNumber] ? 0 : 1),
          analysisResults: { ...previous.analysisResults, [pageNumber]: result },
        }));
      } catch (cause) {
        update(docId, previous => ({
          ...previous,
          analysisErrors: {
            ...previous.analysisErrors,
            [pageNumber]: cause instanceof Error ? cause.message : 'Analisi non riuscita.',
          },
        }));
      }
      try { await refreshSummary(docId); } catch { /* no fabricated success status */ }
    }
    update(docId, previous => ({ ...previous, isAnalyzing: false, currentAnalyzingPage: null, pendingPages: [] }));
  };

  const applyRedactions = async (decisions: RedactRequestItem[]) => {
    const docId = activeId;
    if (!docId) return;
    const result = await api.redact(docId, decisions);
    update(docId, previous => ({ ...previous, redactedPages: result.redacted_pages }));
    try { await refreshSummary(docId); } catch { /* keep previous safe summary */ }
  };

  const reset = useCallback(() => {
    setById({});
    setOrder([]);
    setActiveId(null);
    setImportErrors([]);
  }, []);

  return {
    state,
    documents: order.map(id => byId[id]).filter((item): item is DocumentState => Boolean(item)),
    activeId, selectDocument: setActiveId,
    upload, uploadFiles, importingFile, isImporting, importErrors,
    analyzePage, batchAnalyzePages, applyRedactions, refreshSummary, reset,
  };
}
